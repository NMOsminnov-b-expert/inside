#!/usr/bin/env python3
"""
Матрица путей «Осмотра» на эмуляторе: путь × ориентация × размер экрана × тема × шрифт.

Перенос практик APCS (tools/flow-matrix сайта, обход walk.py приложения APCS): путь — то, что
делает человек, по шагам; после каждого шага — «что осталось» (ожидания пути) и общие флаги
раскладки на каждом экране, который путь увидел:

  ПАДЕНИЕ      — в журнале падений новое (logcat -b crash);
  ВНЕ          — окно в фокусе — не «Осмотр» (вылетели, системный диалог), касания дальше не идут;
  ЗА КРАЕМ     — текст или кнопка вне окна, и это не прокручиваемое (до него не добраться);
  ПОД ВЫРЕЗОМ  — текст или кнопка под вырезом камеры, строкой состояния или панелью навигации;
  МЕЛКО        — кнопка меньше 36 dp по стороне (палец не попадает);
  НАЛОЖЕНИЕ    — две кнопки одного слоя перекрываются больше чем на треть меньшей.

  python3 tools/matrix/paths.py [--пути p1,p2] [--ориентации 0,1] [--размеры телефон,малый,крошечный,планшет]
                                [--темы light,dark] [--шрифты 1.0,1.3] [--md отчёт.md] [--json отчёт.json]
                                [--устройства emulator-5554,emulator-5556]   (несколько эмуляторов — параллельно)

Без ключей — 16 сочетаний: все ориентации × размеры × темы при шрифте 1,0 и телефон × ориентации ×
темы при 1,3. Нужны: запущенный эмулятор, установленный «Осмотр», доступ к памяти выдан. Опись
«02-inv1» (8 предметов) и «Корпус A» (папки со снимками) — из набора стенда (tools/make_templates.py);
файлы для загрузки путь кладёт сам в /sdcard/Download/matrix и убирает за собой.
Выход с ошибкой, если хоть один путь не прошёл или есть общие флаги.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
import xml.etree.ElementTree as ET

# Эмулятор в Windows (WSL без KVM, 15.10.2026): OSMOTR_ADB=путь к adb.exe — пути к файлам тогда
# переводятся в Windows-вид (wslpath -w).
ADB = os.environ.get('OSMOTR_ADB') or os.path.expanduser('~/Android/Sdk/platform-tools/adb')
WIN_ADB = ADB.lower().endswith('.exe')


def local(path):
    """Путь к файлу на этой машине — в том виде, который поймёт adb (Windows-adb — Windows-путь)."""
    return subprocess.run(['wslpath', '-w', path], capture_output=True, text=True).stdout.strip() if WIN_ADB else path
PKG = 'kg.osmotr'
ROOT = '/sdcard/Осмотры'
# Всплывающее окно «Осмотра» (меню «⋮», подсказка): так его зовёт dumpsys — по-английски и у русского MIUI.
POPUP = ('Pop-Up', 'Всплывающее')
# Пауза после действия до первого снимка экрана: касание дошло, переход начался. Дальше look ждёт по снимкам.
SETTLE = float(os.environ.get('MATRIX_SETTLE', '0.4'))
# Снимок в look — когда события интерфейса стихли на столько мс (не дольше 2 с): анимация и переход закончились.
QUIET = int(os.environ.get('MATRIX_QUIET', '300'))
# Касания через помощника: замер 27.10.2026 — 177 мс против 140 у «input tap» (оба упираются в вызов adb.exe) — выкл.
HELPER_INPUT = os.environ.get('MATRIX_HELPER_INPUT', '0') == '1'
# Касания через помощника: замер 27.10.2026 — 177 мс против 140 у «input tap» (оба упираются в вызов adb.exe) — выкл.
HELPER_INPUT = os.environ.get('MATRIX_HELPER_INPUT', '0') == '1'
EXPECT = float(os.environ.get('MATRIX_EXPECT', '3'))
TYPED = float(os.environ.get('MATRIX_TYPED', '0.9'))
SETTLED = os.environ.get('MATRIX_SETTLED', '0') == '1'


def until(cond, timeout, step=0.5):
    """Ждать условия, а не паузу наугад: вернуть первое истинное значение cond() или последнее за timeout."""
    t0 = time.time()
    v = cond()
    while not v and time.time() - t0 < timeout:
        time.sleep(step)
        v = cond()
    return v


def settle_files(find_cmd, tmp_cmd, timeout):
    """Файлы дописаны: временных нет и число готовых не меняется два опроса подряд (вместо паузы на «фон пишет»)."""
    t0, last, same = time.time(), None, 0
    while time.time() - t0 < timeout:
        files = [l for l in sh(*find_cmd).splitlines() if l.strip()]
        tmps = [l for l in sh(*tmp_cmd).splitlines() if l.strip()]
        same = same + 1 if (not tmps and len(files) == last) else 0
        if same >= 2:
            return
        last = len(files)
        time.sleep(1)

# Утечка эмулятора (30.10.2026, эмулятор 37.2.12, образ android-37.0 google_apis rev 6): буферы окон на стороне
# компьютера не освобождаются — каждое новое окно любого приложения (и «Настройки») оставляет ~240 МБ, снимок
# экрана ~20 МБ; с видеокартой — в её памяти, без неё (swiftshader) — в оперативной. Режим графики, GuestAngle,
# HostComposition, GLAsyncSwap не влияют; без RefCountPipe Android не загружается. Матрица перезапускает
# приложение на каждом пути — за ~50 прогонов набегали десятки гигабайт, и эмулятор вставал. Сторож: перешло
# порог — перезапуск эмулятора между путями, приложение и русский язык — заново (образ «только чтение»).
EMU_LEAK_MIB = int(os.environ.get('MATRIX_EMU_LEAK_MIB', '10000'))
EMU_PRIV_MIB = int(os.environ.get('MATRIX_EMU_PRIV_MIB', '11000'))
APK = os.environ.get('OSMOTR_APK') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'app', 'build', 'outputs', 'apk', 'release', 'app-x86_64-release.apk')


def emu_memory():
    """Память эмулятора в Windows, МиБ: (выделенная видеопамять, частная). Не эмулятор в Windows — None."""
    if not ADB.endswith('.exe'):
        return None
    ps = ("$p = Get-Process qemu-system-x86_64 -EA SilentlyContinue | Select -First 1; if (-not $p) { exit }; "
          "$d = (Get-Counter \"\\GPU Process Memory(pid_$($p.Id)*)\\Dedicated Usage\" -EA SilentlyContinue).CounterSamples | Measure CookedValue -Sum; "
          "\"$([int]($d.Sum/1MB)) $([int]($p.PrivateMemorySize64/1MB)) $($p.Id)\"")
    try:
        out = subprocess.run(['powershell.exe', '-NoProfile', '-Command', ps], cwd='/mnt/c', capture_output=True, text=True, timeout=40).stdout.split()
        return (int(out[0]), int(out[1]), int(out[2])) if len(out) == 3 else None
    except (subprocess.TimeoutExpired, ValueError, OSError):
        return None


def emu_restart(pid):
    """Погасить эмулятор по его PID, поднять заново, поставить «Осмотр» и русский язык."""
    subprocess.run(['powershell.exe', '-NoProfile', '-Command', f'Stop-Process -Id {pid} -Force'], cwd='/mnt/c', capture_output=True, timeout=40)
    time.sleep(4)
    subprocess.run([os.path.join(os.path.dirname(os.path.abspath(__file__)), 'emulators.sh')], capture_output=True, timeout=600)
    win = '/mnt/c/Users/osmin/AppData/Local/Temp/osmotr-matrix.apk'
    subprocess.run(['cp', APK, win], check=True)
    adb('install', '-r', '-d', 'C:\\Users\\osmin\\AppData\\Local\\Temp\\osmotr-matrix.apk', timeout=180)
    adb('root'); time.sleep(3)
    sh('setprop persist.sys.locale ru-KG; setprop ctl.restart zygote')
    time.sleep(5)
    until(lambda: sh('getprop', 'sys.boot_completed').strip() == '1' and 'package' in sh('service', 'check', 'package'), 120, 2)
    time.sleep(5)


# «крошечный» — 320×569 dp: самые маленькие телефоны на Android (автор, 27.10.2026: «косяки на малых разрешениях»).
SIZES = {'телефон': None, 'малый': ('720x1280', 280), 'крошечный': ('720x1280', 360), 'планшет': ('1600x2560', 320)}


# Несколько эмуляторов сразу (--устройства): у каждого потока свой серийный номер, все вызовы — через adb().
_tls = threading.local()


def adb(*a, check=False, timeout=60):
    # Окно, открытое во время вывода (сбой связи, чужой поток), добавляет мусор — не ронять прогон разбором.
    serial = getattr(_tls, 'serial', None)
    r = subprocess.run([ADB, *(['-s', serial] if serial else []), *a], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=timeout)
    if check and r.returncode:
        raise RuntimeError(r.stderr or r.stdout)
    return r.stdout


def sh(*a, **k):
    # Касание и свайп — помощнику (событиями через его подключение): «input» на каждое касание запускает на
    # устройстве отдельный процесс. Помощник не ответил — по-старому.
    if len(a) >= 4 and a[0] == 'input' and a[1] in ('tap', 'swipe') and getattr(_tls, 'helper', False) and HELPER_INPUT:
        try:
            if adb('exec-out', f"echo {' '.join(a[1:])} | nc -w 5 127.0.0.1 9008", timeout=10).strip() == 'ok':
                return ''
        except subprocess.TimeoutExpired:
            pass
    return adb('shell', *a, **k)


# ---------- Экран ----------

class Node:
    __slots__ = ('checked', 'text', 'desc', 'rid', 'cls', 'clickable', 'scrollable', 'enabled', 'b', 'parent', 'kids', 'long')

    def scroller(self):
        """Ближайший прокручиваемый предок — или None."""
        p = self.parent
        while p is not None and not p.scrollable:
            p = p.parent
        return p

    def inside(self, box, margin=2):
        """По узлу можно попасть: не схлопнут, и его середина — в видимой части прокручиваемого. Срезанный краем
        наполовину нажимается и так; докручивать его — только сбивать с места поля формы."""
        return self.b[3] - self.b[1] >= 24 and box.b[1] + margin <= self.center()[1] <= box.b[3] - margin

    def __init__(self, e, parent):
        self.checked = e.get('checked') == 'true'
        self.text = e.get('text', '')
        self.desc = e.get('content-desc', '')
        self.rid = e.get('resource-id', '')
        self.cls = e.get('class', '')
        self.clickable = e.get('clickable') == 'true'
        self.long = e.get('long-clickable') == 'true'
        self.scrollable = e.get('scrollable') == 'true'
        self.enabled = e.get('enabled') == 'true'
        m = re.match(r'\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]', e.get('bounds', '[0,0][0,0]'))
        self.b = tuple(int(x) for x in m.groups())
        self.parent = parent
        self.kids = []

    @property
    def label(self):
        return self.text or self.desc or self.rid

    def named(self):
        """Чем узел назвать в отчёте: своё имя, иначе — текст внутри, иначе — соседа или родителя."""
        if self.label:
            return self.label
        stack = list(self.kids)
        while stack:
            k = stack.pop(0)
            if k.label:
                return 'внутри: ' + k.label
            stack += k.kids
        for a in self.ancestors():
            for k in a.kids:
                if k.label:
                    return f'{self.cls.split(".")[-1]} рядом с «{k.label}»'
        return self.cls

    def ancestors(self):
        p = self.parent
        while p is not None:
            yield p
            p = p.parent

    def scroller(self):
        return next((a for a in self.ancestors() if a.scrollable), None)

    def center(self):
        x1, y1, x2, y2 = self.b
        return (x1 + x2) // 2, (y1 + y2) // 2


class Screen:
    def __init__(self, xml):
        self.nodes = []
        root = ET.fromstring(xml)

        def walk(e, parent):
            n = Node(e, parent)
            if parent:
                parent.kids.append(n)
            self.nodes.append(n)
            for c in e.findall('node'):
                walk(c, n)
        for e in root.findall('node'):
            walk(e, None)
        self.package = root.find('node').get('package', '') if root.find('node') is not None else ''

    def texts(self):
        return [n.label for n in self.nodes if n.label]

    def find(self, want, exact=False):
        for n in self.nodes:
            for v in (n.text, n.desc, n.rid):
                if v and (v == want if exact else want in v):
                    return n
        return None

    def field(self):
        return next((n for n in self.nodes if n.cls == 'android.widget.EditText'), None)

    def has(self, want, exact=False):
        return self.find(want, exact) is not None

    def same(self, other):
        """Тот же экран: те же узлы на тех же местах (анимация закончилась, список догрузился)."""
        return other is not None and [(n.cls, n.text, n.desc, n.b) for n in self.nodes] == [(n.cls, n.text, n.desc, n.b) for n in other.nodes]

    def signature(self):
        """Чем экран узнаётся в отчёте: первые заметные надписи."""
        t = [x for x in (n.text for n in self.nodes) if x and len(x) > 2][:3]
        return ' / '.join(t)[:80]


class Device:
    def __init__(self):
        self.density = int(re.search(r'(\d+)', sh('wm', 'density').splitlines()[-1]).group(1))
        # Живой телефон: MIUI режет журнал приложений (log.tag=M) — события камеры, по которым проверяются
        # «съёмка» и «яркость», не видны. Свой тег — на подробный уровень (без root, до перезагрузки).
        sh('setprop', 'log.tag.osmotr-camera', 'V')
        # Gboard принимает щелчок мышью в окне эмулятора за стилус и показывает обучение рукописному вводу
        # («Try out your stylus») поверх поля — набор матрицы уходил в него (27.10.2026).
        sh('settings', 'put', 'secure', 'stylus_handwriting_enabled', '0')
        self.crash_mark = None
        self.helper = False
        if os.environ.get('MATRIX_HELPER', '1') == '1':
            self.helper_start()

    # Устройство
    def window(self):
        out = sh('dumpsys', 'window', 'displays')
        m = re.search(r'cur=(\d+)x(\d+)', out)
        return (int(m.group(1)), int(m.group(2))) if m else (0, 0)

    def insets(self):
        """Видимые системные области: вырез, строка состояния, панель навигации."""
        out = sh('dumpsys', 'window')
        rects = set()
        for m in re.finditer(r'InsetsSource id=\S+ type=(statusBars|navigationBars|displayCutout) frame=\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\] visible=true', out):
            r = tuple(int(x) for x in m.groups()[1:])
            if r[2] > r[0] and r[3] > r[1]:
                rects.add((m.group(1), r))
        return sorted(rects)

    def state(self):
        """Фокус, падения, размер окна и системные области — одним вызовом adb (их было четыре, ~0,1 с каждый)."""
        out = sh("dumpsys window; echo @@MATRIX@@; logcat -b crash -d; echo @@MATRIX@@; dumpsys window displays")
        parts = out.split('@@MATRIX@@')
        win, crash, disp = (parts + ['', '', ''])[:3]
        m = re.search(r'mCurrentFocus=Window\{\S+ \S+ ([^}\s]+)', win)
        rects = set()
        for i in re.finditer(r'InsetsSource id=\S+ type=(statusBars|navigationBars|displayCutout) frame=\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\] visible=true', win):
            r = tuple(int(x) for x in i.groups()[1:])
            if r[2] > r[0] and r[3] > r[1]:
                rects.add((i.group(1), r))
        d = re.search(r'cur=(\d+)x(\d+)', disp)
        return {'focus': m.group(1) if m else '', 'crash': crash.strip(), 'window': (int(d.group(1)), int(d.group(2))) if d else (0, 0),
                'insets': sorted(rects)}

    def settled(self, most=6):
        """Снимок экрана, когда он перестал меняться: два снимка подряд одинаковы (вместо паузы наугад)."""
        prev = self.dump(quiet=QUIET)
        if not SETTLED:
            return prev
        for _ in range(most):
            cur = self.dump(quiet=QUIET)
            if cur.same(prev):
                return cur
            prev = cur
        return prev

    def still(self, most=5.0):
        """Снимок, когда экран встал по координатам: settled сравнивает только тексты, а прокрученный список
        едет по инерции дольше секунды с теми же текстами (30.10.2026). Помощник длительность свайпа не держит."""
        t0, prev = time.time(), None
        while True:
            cur = self.dump()
            b = [n.b for n in cur.nodes]
            if b == prev or time.time() - t0 > most:
                return cur
            prev = b
            time.sleep(0.25)

    def focus(self):
        # Пусто — окно в переходе (открывается системный выбор файлов, фокуса ещё ни у кого нет):
        # переспросить, а не считать вылетом.
        for _ in range(6):
            out = sh('dumpsys', 'window')
            m = re.search(r'mCurrentFocus=Window\{\S+ \S+ ([^}\s]+)', out)
            if m:
                return m.group(1)
            time.sleep(0.5)
        return ''

    def mark_crashes(self):
        sh('logcat', '-b', 'crash', '-c')

    def crashes(self):
        return sh('logcat', '-b', 'crash', '-d').strip()

    # Действия
    def launch(self):
        sh('am', 'force-stop', PKG)
        # Не через monkey: он, завершаясь, «размораживает» поворот (thawRotation) — включается поворот от датчика,
        # и «лёжа» после запуска шло стоя (29.10.2026, автор заметил по окну эмулятора). Прямой запуск активности
        # и поворот заново — тот, что задан сочетанием.
        sh('am', 'start', '-W', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', '-n', f'{PKG}/.MainActivity')
        if getattr(self, 'rot', None) is not None:
            self.rotate(self.rot)
        time.sleep(1)

    # Помощник снимков (tools/matrix/dumper): дерево экрана за ~0,1 с вместо ~2,3 с у «uiautomator dump»
    # (тот каждый раз запускает Java-машину). Тот же XML — сверено узел в узел, 27.10.2026.
    def helper_start(self):
        if 'kg.osmotr.matrix' not in sh('pm', 'list', 'packages', 'kg.osmotr.matrix'):
            apk = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dumper', 'build', 'dumper.apk')
            if not os.path.exists(apk):
                subprocess.run([os.path.join(os.path.dirname(apk), '..', 'build.sh')], check=True, capture_output=True)
            adb('install', '-r', local(apk), check=True, timeout=120)
        sh("nohup am instrument -w kg.osmotr.matrix/.Dumper >/data/local/tmp/matrix-dumper.log 2>&1 &")
        self.helper = until(lambda: '<hierarchy' in adb('exec-out', 'echo dump | nc 127.0.0.1 9008', timeout=10), 8, 0.5)
        _tls.helper = self.helper
        # Подключение UiAutomation, закрываясь, возвращает поворот, сохранённый при подключении (поворот от датчика) —
        # после перезапуска помощника «лёжа» падало в «стоя» посреди пути (29.10.2026). Поворот сочетания — заново.
        if getattr(self, 'rot', None) is not None:
            self.rotate(self.rot)
        return self.helper

    def helper_stop(self):
        if getattr(self, 'helper', False):
            try:   # помощник завис — не ронять путь: перезапуск всё равно поднимет новый
                adb('exec-out', 'echo quit | nc 127.0.0.1 9008', timeout=10)
            except subprocess.TimeoutExpired:
                sh('am', 'force-stop', 'kg.osmotr.matrix')
            self.helper = False
            _tls.helper = False

    def dump(self, tries=4, quiet=0):
        last = ''
        for i in range(tries):
            if getattr(self, 'helper', False):
                try:
                    out = adb('exec-out', f'echo dump {quiet} 2000 | nc -w 5 127.0.0.1 9008', timeout=8)
                    if '</hierarchy>' not in out and i == 0:
                        self.helper_start()   # помощника выгрузили (нехватка памяти) — поднять и снять ещё раз
                        out = adb('exec-out', f'echo dump {quiet} 2000 | nc -w 5 127.0.0.1 9008', timeout=8)
                except subprocess.TimeoutExpired:
                    out = ''
                # Помощник не ответил — перезапустить его, а не звать «uiautomator dump»: при живом помощнике тот
                # убивается («Killed», 29.10.2026 — путь «поделиться» лёжа упал на этом).
                if '</hierarchy>' not in out:
                    self.helper_stop(); self.helper_start()
                    try:
                        out = adb('exec-out', f'echo dump {quiet} 2000 | nc -w 5 127.0.0.1 9008', timeout=8)
                    except subprocess.TimeoutExpired:
                        out = ''
                if '</hierarchy>' not in out and not getattr(self, 'helper', False):
                    out = adb('exec-out', 'uiautomator', 'dump', '/dev/tty', timeout=30)
            else:
                out = adb('exec-out', 'uiautomator', 'dump', '/dev/tty', timeout=30)
            i = out.find('<?xml')
            j = out.rfind('</hierarchy>')
            if i >= 0 and j > i:
                return Screen(out[i:j + len('</hierarchy>')])
            last = out
            time.sleep(1)
        raise RuntimeError('дерево экрана не снялось: ' + last[:200])

    def tap_node(self, n, long=False):
        x, y = n.center()
        if long:
            sh('input', 'swipe', str(x), str(y), str(x), str(y), '800')
        else:
            sh('input', 'tap', str(x), str(y))

    def rotate(self, r):
        self.rot = r
        sh('settings', 'put', 'system', 'accelerometer_rotation', '0')
        sh('settings', 'put', 'system', 'user_rotation', str(r))

    def theme(self, dark):
        sh('cmd', 'uimode', 'night', 'yes' if dark else 'no')

    def font(self, scale):
        sh('settings', 'put', 'system', 'font_scale', str(scale))

    def size(self, s):
        if s is None:
            sh('wm', 'size', 'reset'); sh('wm', 'density', 'reset')
        else:
            sh('wm', 'size', s[0]); sh('wm', 'density', str(s[1]))
        time.sleep(1.5)
        self.density = int(re.search(r'(\d+)\s*$', sh('wm', 'density').strip()).group(1))

    def dp(self, px):
        return px * 160 / self.density


# ---------- Общие флаги раскладки ----------

def layout_flags(scr, dev, win, insets):
    flags = []
    W, H = win
    seen = set()
    # Слой «касание вне окна настроек» камеры — на весь экран нарочно: не наложение и не вырез.
    marked = [n for n in scr.nodes if (n.label or n.clickable) and n.b[2] > n.b[0] and n.b[3] > n.b[1] and 'camera-panel-outside' not in n.rid]
    for n in marked:
        x1, y1, x2, y2 = n.b
        sc = n.scroller()
        if sc is None and (x1 < -2 or y1 < -2 or x2 > W + 2 or y2 > H + 2):
            flags.append(('ЗА КРАЕМ', f'«{n.label[:40]}» {n.b} окно {W}×{H}'))
        if n.label or n.clickable:
            for kind, (a1, b1, a2, b2) in insets:
                ix = min(x2, a2) - max(x1, a1); iy = min(y2, b2) - max(y1, b1)
                if ix > 4 and iy > 4 and (n.text or n.clickable):
                    # Прокручиваемое уходит под панель нарочно — флаг только у неподвижного.
                    if sc is None:
                        flags.append(('ПОД ВЫРЕЗОМ', f'«{n.label[:40]}» {n.b} под {kind} {(a1, b1, a2, b2)}'))
        if n.clickable and n.enabled:
            # Размер цели — вместе с вложенным: рамка кнопки бывает уже её же Button внутри
            # (верхняя панель Material отдаёт так «Назад»), а касание ловится по всей кнопке.
            xs, ys = [x1, x2], [y1, y2]
            stack = list(n.kids)
            while stack:
                k = stack.pop(); stack += k.kids
                if not k.clickable:
                    xs += [k.b[0], k.b[2]]; ys += [k.b[1], k.b[3]]
            w, h = dev.dp(max(xs) - min(xs)), dev.dp(max(ys) - min(ys))
            # Обрезанное прокруткой у края — не мелкое, а уехавшее.
            if sc is not None:
                s = sc.b
                if x1 <= s[0] or y1 <= s[1] or x2 >= s[2] or y2 >= s[3]:
                    continue
            if (w < 36 or h < 36) and n.label not in seen:
                seen.add(n.label)
                flags.append(('МЕЛКО', f'«{n.named()[:60]}» {w:.0f}×{h:.0f} dp {n.b}'))
    clicks = [n for n in marked if n.clickable and n.enabled]
    for i, a in enumerate(clicks):
        for b in clicks[i + 1:]:
            if a in b.ancestors() or b in a.ancestors() or a.scroller() is not b.scroller():
                continue
            ix = min(a.b[2], b.b[2]) - max(a.b[0], b.b[0]); iy = min(a.b[3], b.b[3]) - max(a.b[1], b.b[1])
            if ix <= 0 or iy <= 0:
                continue
            small = min((a.b[2] - a.b[0]) * (a.b[3] - a.b[1]), (b.b[2] - b.b[0]) * (b.b[3] - b.b[1]))
            if small and ix * iy > small / 3:
                flags.append(('НАЛОЖЕНИЕ', f'«{a.named()[:30]}» и «{b.named()[:30]}»'))
    return flags


# ---------- Путь ----------

class Fail(Exception):
    pass


class Run:
    """Один путь в одном сочетании: шаги, их итоги и флаги экранов."""

    def __init__(self, dev, name):
        self.dev, self.name = dev, name
        self.steps = []
        self.flags = []
        self.scr = None

    def look(self, what):
        # Было: пауза 1,2 с и четыре вызова adb. Стало: короткая пауза (касание дошло), состояние одним вызовом,
        # снимок — когда экран перестал меняться (settled).
        time.sleep(SETTLE)
        st = self.dev.state()
        for _ in range(12):   # пусто — окно в переходе (выбор файлов; запуск после тяжёлого пути — до 6 с)
            if st['focus']:
                break
            time.sleep(0.5)
            st = self.dev.state()
        f = st['focus']
        # «System UI isn't responding» на только что загруженном эмуляторе — окно системы, не наше:
        # «Подождать» и смотреть снова.
        for _ in range(3):
            if f != 'Application':
                break
            n = self.dev.dump().find('Wait', exact=True) or self.dev.dump().find('Подождать', exact=True)
            if n is None:
                break
            self.dev.tap_node(n); time.sleep(3)
            st = self.dev.state()
            f = st['focus']
        # Меню «⋮» и подсказки — свои всплывающие окна «Осмотра» (Pop-Up), выбор файлов — системный.
        if PKG not in f and 'documentsui' not in f and not any(w in f for w in POPUP):
            self.steps.append({'что': what, 'ок': False, 'было': f'в фокусе {f}', 'ждали': PKG})
            raise Fail()
        c = st['crash']
        if c:
            self.steps.append({'что': what, 'ок': False, 'было': 'ПАДЕНИЕ ' + c[-800:], 'ждали': 'без падений'})
            raise Fail()
        self.scr = self.dev.settled()
        if 'documentsui' not in f:
            found = layout_flags(self.scr, self.dev, st['window'], st['insets'])
            if found and self.dev.helper:
                # Снимок быстрый и мог застать анимацию (строки ещё съезжают — «наложение» на миг): флаг
                # засчитывается, только если держится и через 0,8 с.
                # Перепроверка — на свежем дереве: помощник отдавал координаты части ячеек ещё до прокрутки, и
                # «наложение» было только в его снимке (таблица столбцов лёжа, 29.10.2026; на экране — чисто).
                time.sleep(0.8)
                self.dev.helper_stop(); self.dev.helper_start()
                again = self.dev.dump(quiet=QUIET)
                found = [x for x in layout_flags(again, self.dev, st['window'], st['insets']) if x in found]
            for flag, detail in found:
                self.flags.append({'экран': self.scr.signature(), 'шаг': what, 'флаг': flag, 'подробно': detail})
        return self.scr

    def expect(self, what, has=(), lacks=(), exact=False):
        # Не сбылось — переснять, пока сбудется (до EXPECT с): отметки и счётчики пишутся в фоне и
        # доходят до экрана после снимка. Ждём только там, где ждать есть чего.
        t0 = time.time()
        while True:
            scr = self.scr
            miss = [h for h in has if not scr.has(h, exact)]
            extra = [h for h in lacks if scr.has(h, exact)]
            ok = not miss and not extra
            if ok or time.time() - t0 > EXPECT:
                break
            time.sleep(0.3)
            self.scr = self.dev.dump(quiet=QUIET)
        # Не сбылось — перезапустить помощника снимков и снять ещё раз: его подключение к доступности держит
        # прежнее дерево и после clearCache (29.10.2026: на экране «Лист «Опись»: 12 предметов» уже через 0,5 с,
        # а снимки 3 с отдавали «0 предметов»). Новое подключение — свежий кэш; цена ~1 с, только на провале.
        if not ok and self.dev.helper:
            self.dev.helper_stop(); self.dev.helper_start()
            scr = self.scr = self.dev.dump(quiet=QUIET)
            miss = [h for h in has if not scr.has(h, exact)]
            extra = [h for h in lacks if scr.has(h, exact)]
            ok = not miss and not extra
        # Похожее на ожидаемое (по последнему слову) — отдельно: первые 25 надписей часто только шапка и таблица.
        near = [t for t in scr.texts() if any(w.split()[-1] in t for w in list(has) + list(lacks) if w.split())][:12]
        self.steps.append({'что': what, 'ок': ok, 'было': {'нет': miss, 'лишнее': extra, 'похожее': near, 'на экране': scr.texts()[:25]} if not ok else '',
                           'ждали': {'есть': list(has), 'нет': list(lacks)}})
        if not ok:
            raise Fail()

    def tap(self, want, what=None, long=False, exact=False, look=True):
        # Свежий снимок перед касанием: координаты с прошлого снимка могли устареть (над переключателем сменился
        # текст — он съехал). С помощником снимок ~0,1 с; без него — как раньше, по прошлому снимку.
        # Лёжа клавиатура закрывает почти весь экран, а в дереве окно под ней видно целиком: касание «Снять» или
        # строки поиска попадало в клавиши — в поиск набирались «l», «p» (30.10.2026, 11 путей лёжа). Убрать её.
        # Только в своём окне: система держит признак клавиатуры и над выбором файлов, «назад» закрывал сам выбор.
        if getattr(self.dev, 'rot', 0) == 1 and ime_shown() and PKG in self.dev.focus():
            sh('input', 'keyevent', 'BACK')
            until(lambda: not ime_shown(), 3, 0.2)
            # Окно ещё едет на место: снимок — когда экран встал, иначе касание по прежним координатам (в поле,
            # и клавиатура открывалась заново).
            time.sleep(0.5)
            self.scr = self.dev.settled()
        elif self.dev.helper:
            self.scr = self.dev.dump()
        n = self.scr.find(want, exact)
        for _ in range(2):  # ещё появляется (меню раскрывается, список грузится)
            if n is not None:
                break
            time.sleep(1)
            self.scr = self.dev.dump()
            n = self.scr.find(want, exact)
        # Нет на экране или за краем прокручиваемого: лёжа меню «Ещё» и окно выгрузки целиком не помещаются, а
        # в дереве Compose пункт за краем есть — касание уходило мимо, меню закрывалось молча (30.10.2026).
        for _ in range(5):
            box = n.scroller() if n is not None else next((x for x in reversed(self.scr.nodes) if x.scrollable), None)
            if box is None or (n is not None and n.inside(box) and not self.covered(n)):
                break
            l, t, rr, b = box.b
            cx, top, low = (l + rr) // 2, t + (b - t) // 4, b - (b - t) // 4
            # Цель выше края — листать назад. Медленно и с остановкой: после быстрого свайпа список едет по
            # инерции, и касание только останавливало его — не нажимая (30.10.2026, «да», отметка файла).
            y0, y1 = (top, low) if n is not None and n.b[1] < t else (low, top)
            sh('input', 'swipe', str(cx), str(y0), str(cx), str(y1), '700')
            self.scr = self.dev.still()
            n = self.scr.find(want, exact)
        if n is None:
            self.steps.append({'что': what or f'нажать «{want}»', 'ок': False, 'было': self.scr.texts()[:30], 'ждали': want})
            raise Fail()
        self.dev.tap_node(n, long)
        if look:
            self.look(what or f'нажать «{want}»')

    def covered(self, n):
        """Узел лежит под нижней плашкой: лёжа «Осмотрено ранее» закрывает строки, касание шло в неё."""
        p = self.scr.find('плашка', exact=True)
        if p is None:
            return False
        q = n
        while q is not None:   # сам внутри плашки («Открыть») — не закрыт
            if q is p:
                return False
            q = q.parent
        x, y = n.center()
        return p.b[0] <= x <= p.b[2] and p.b[1] <= y <= p.b[3]

    def search(self, text):
        n = self.scr.field()
        if n is None:
            self.steps.append({'что': 'поле поиска', 'ок': False, 'было': self.scr.texts()[:30], 'ждали': 'EditText'})
            raise Fail()
        self.dev.tap_node(n); time.sleep(0.8)
        self.type(text, f'поиск: {text}')

    def found(self):
        n = next((n for n in self.scr.nodes if n.text.startswith('Найдено:')), None)
        return n.text if n else ''

    def type(self, text, what=None):
        sh('input', 'text', text)
        # Поиск и поля фильтруют с задержкой после ввода: до неё экран «стоит» прежний (settled его примет).
        time.sleep(TYPED)
        self.look(what or f'набрать {text}')

    def back(self, what='назад'):
        sh('input', 'keyevent', 'BACK')
        self.look(what)

    def scroll_side_to(self, want, tries=6):
        """Таблица вбок — к столбцу за правым краем."""
        for _ in range(tries):
            if self.scr.has(want, exact=True):
                return
            t = self.scr.find('таблица')
            x1, y1, x2, y2 = t.b if t else (0, 0, *self.dev.window())
            y = y1 + 200
            sh('input', 'swipe', str(int(x2 * 0.85)), str(y), str(int(x1 + (x2 - x1) * 0.3)), str(y), '400')
            self.look(f'вбок к «{want}»')
        self.expect(f'вбок к «{want}»', has=[want], exact=True)

    def scroll_to(self, want, tries=16):
        for _ in range(tries):
            W, H = self.dev.window()
            # Мало «есть в дереве»: лёжа плитка «Земельный участок» попадала в дерево обрезанной у нижнего края,
            # и касание в середину её подписи уходило мимо экрана (30.10.2026). Нужна — выше нижней полосы.
            n = self.scr.find(want, False)
            cy = n.center()[1] if n is not None else None
            # Нижняя граница — панель действий, если она есть: цель у её края срезана.
            bar = self.scr.find('панель действий', exact=True)
            low = bar.b[1] - 60 if bar is not None else H * 0.85
            if cy is not None and 300 < cy < low:   # 300 — ниже шапки экрана: под ней поле видно полоской
                return
            y0, y1 = (0.35, 0.6) if cy is not None and cy <= 300 else (0.75, 0.35)
            sh('input', 'swipe', str(W // 2), str(int(H * y0)), str(W // 2), str(int(H * y1)), '700')
            self.dev.still()
            self.look(f'прокрутить к «{want}»')
        self.expect(f'прокрутить к «{want}»', has=[want])


# 3.13 (объекты, 29.10.2026): всё, что лежало в «Осмотрах» до объектов, при первом запуске переезжает в
# «Осмотрено ранее (старая версия)» — стенд («02-inv1», «Корпус A») теперь там; опись из файла ложится в
# объект — окно спрашивает какой (у матрицы — свой «matrix-obj», cleanup его убирает).
OLD = 'Осмотрено ранее (старая версия)'
OBJ = 'matrix-obj'


def confirm(r, button, what):
    """
    Кнопка окна после ввода. Лёжа клавиатура — во весь экран и прячет окно: тогда один «назад» — он убирает только
    клавиатуру (Esc закрывал окно целиком и ронял все пути, 29.10.2026), и уже потом кнопка.
    """
    # По дереву окна не понять: лёжа клавиатура лежит поверх окна, а в дереве окно видно целиком — касание по
    # «Создать» попадало в клавиши («matrix-objb», «LiterA» → «Literally»). Спрашивать систему, показана ли клавиатура.
    # Только лёжа: стоя клавиатура окно не закрывает, а «назад» сдвигал окно, и снимок помощника отдавал прежние
    # координаты кнопки — касание мимо (29.10.2026, все пути с загрузкой описи стоя).
    if getattr(r.dev, 'rot', 0) == 1 and ime_shown():
        sh('input', 'keyevent', 'BACK')
        until(lambda: not ime_shown(), 3, 0.2)
        # Клавиатура ушла — окно встало на место: кнопку искать на новом снимке, а не по старым координатам.
        time.sleep(0.3); r.look(f'{what}: без клавиатуры')
    r.tap(button, what, exact=True)


def ime_shown():
    return 'mInputShown=true' in sh('dumpsys input_method | grep -m1 mInputShown')


def into_old(r):
    """С главного — в «Осмотрено ранее», где стенд (карточка-напоминание или плитка папки — обе ведут туда)."""
    if r.scr.has(OLD):
        r.tap(OLD, 'в «Осмотрено ранее»')


def into_object(r):
    """
    Окно «в какой объект» после загрузки описи (кнопкой или «Открыть с помощью»): вид — «Опись» (выбран
    сразу), объект — «matrix-obj», нет его — завести («Новый объект…», имя латиницей), затем «Сюда».
    Окна нет (файл не открылся раньше, чем спросили) — ничего.
    """
    if not until(lambda: r.dev.dump().has('какой объект'), 4, 0.2):
        return
    r.look('спрашивает объект')
    if r.scr.has(OBJ):
        r.tap(OBJ, 'объект матрицы')
    else:
        r.tap('Новый объект', 'новый объект')
        r.type(OBJ, 'название объекта')
        confirm(r, 'Создать', 'создать объект')
    r.tap('Сюда', 'опись — в объект', exact=True)


INV = f'{ROOT}/{OBJ}/Механизмы и оборудование/matrix-good'   # опись fresh() — в объекте матрицы


def open_fresh(r):
    """К описи fresh() с главного: объект матрицы → «Механизмы и оборудование» → опись."""
    r.dev.launch(); r.look('главная')
    r.scroll_to(OBJ)
    r.tap(OBJ, 'объект матрицы')
    r.tap('Механизмы и оборудование', 'механизмы', exact=True)
    r.tap('matrix-good', 'опись')


def open_inventory(r, name):
    r.dev.launch()
    r.look('главная')
    into_old(r)
    r.scroll_to(name)
    r.tap(name, f'открыть опись «{name}»')
    r.expect('опись открылась', has=['осмотрено'])


def shutter_ready(r):
    """Спуск своей камеры готов: на экране И активен. Появляется он сразу, но неактивным, пока CameraX
    открывает камеру (на эмуляторе ~5 с) — касание в неактивный не снимает."""
    n = r.dev.dump().find('camera-shutter', exact=True)
    return n if n is not None and n.enabled else None


def tag_node(r, tag):
    return r.dev.dump().find(tag, exact=True)


def open_own_camera(r, what='снять МТ-101'):
    """Своя камера: «Снять» и ждать, пока спуск станет активным (а не паузу наугад), затем — к исходным настройкам."""
    r.tap('Снять', what, look=False)
    if not until(lambda: shutter_ready(r), 25, 0.5):
        r.steps.append({'что': 'камера открылась', 'ок': False, 'было': r.dev.dump().texts()[:20], 'ждали': 'спуск своей камеры'})
        raise Fail()
    camera_defaults(r)


def fresh(r):
    """Своя опись пути — свежая, из набора (12 шкафов «МТ-101…112», лист «Сводка» рядом)."""
    r.dev.launch(); r.look('главная')
    view(r, 'matrix-good.xlsx', 'загрузить опись пути')
    r.expect('опись открылась', has=['из 12 осмотрено', 'МТ-101'])


def camera_defaults(r):
    """
    Камера помнит настройки между заходами (и прогонами): привести к исходным — режим «Фото», «Ярче в
    темноте» выкл, формат 4:3, сетка выкл, — иначе предыдущий путь меняет замеры следующего. После каждого
    касания — ждать его признака (панель открылась, флажок снят, формат сменился), а не паузу наугад.
    """
    def node(tag):
        return tag_node(r, tag)

    def label(tag):
        n = node(tag)
        return '' if n is None else ' '.join(k.text for k in n.kids + [n])

    n = node('camera-mode-photo')
    if n is not None:
        r.dev.tap_node(n); time.sleep(0.3); until(lambda: shutter_ready(r), 10, 0.3)
    s_ = node('camera-settings')
    if s_ is not None:
        r.dev.tap_node(s_)
        until(lambda: node('camera-panel') is not None or node('camera-dark') is not None, 4, 0.3)
        d = node('camera-dark')
        if d is not None and d.checked:
            r.dev.tap_node(d); until(lambda: (lambda x: x is not None and not x.checked)(node('camera-dark')), 3, 0.3)
        r.dev.tap_node(node('camera-settings')); until(lambda: node('camera-panel') is None, 3, 0.3)
    if node('camera-grid') is not None:
        r.dev.tap_node(node('camera-grid-toggle')); until(lambda: node('camera-grid') is None, 3, 0.3)
    if node('camera-aspect') is not None and '4:3' not in label('camera-aspect'):
        r.dev.tap_node(node('camera-aspect')); until(lambda: '4:3' in label('camera-aspect'), 4, 0.3)
        until(lambda: shutter_ready(r), 10, 0.3)   # смена формата перезапускает камеру


def p_camera(r):
    """
    Своя камера (19.10.2026): серия без выхода; «Готово» — сразу, не дожидаясь записи (кадры
    дописываются в фоне); второй заход в ту же папку, пока первые пишутся, — без конфликтов. Все
    кадры — в папке предмета, целые, без временных, у каждого запись галереи по его месту.
    """
    fresh(r)
    def rows():
        out = sh('content', 'query', '--uri', 'content://media/external/images/media', '--projection', '_data')
        return [l.split('_data=')[-1].strip() for l in out.splitlines() if '_data=' in l]

    def open_camera(what):
        r.tap('Снять', what, look=False)
        time.sleep(1)
        for _ in range(3):   # первый запуск — разрешение на камеру
            scr = r.dev.dump()
            n = scr.find('permission_allow_foreground_only_button') or scr.find('While using the app') or scr.find('При использовании')
            if n is None:
                break
            r.dev.tap_node(n); time.sleep(3)
        for _ in range(10):   # CameraX открывает камеру ~1–3 с; спуск серый, пока не готова
            scr = r.dev.dump(); shutter = shutter_ready(r)
            if shutter is not None:
                camera_defaults(r)
                return shutter
            time.sleep(1)
        r.steps.append({'что': 'камера открылась', 'ок': False, 'было': scr.texts()[:20], 'ждали': 'спуск своей камеры'}); raise Fail()

    shutter = open_camera('снять МТ-101')
    adb('logcat', '-c')
    # Десять нажатий как можно быстрее и сразу «Готово» (автор, 19.10.2026: «человек зафотает 20 фото
    # за раз, а потом в карман оно дальше по очереди будет фотать»).
    cx, cy = shutter.center()
    for _ in range(10):
        sh('input', 'tap', str(cx), str(cy))
    r.look('камера: серия')   # флаги раскладки и на экране камеры
    sh('screencap', '-p', '/sdcard/Download/camera-shot.png')
    t0 = time.time()
    r.dev.tap_node(r.dev.dump().find('camera-done'))
    gone = until(lambda: r.dev.dump().find('camera-shutter') is None, 1.5, 0.1)
    r.steps.append({'что': '«Готово» не ждёт записи', 'ок': gone, 'было': f'экран камеры {"закрыт" if gone else "открыт"} через {time.time() - t0:.1f} с',
                    'ждали': 'закрыт сразу'})
    # Журнал камеры дописывается в фоне: ждать «готово» и стартов не меньше нажатий (было — 4 с наугад).
    until(lambda: (lambda t: 'готово' in t and t.count('старт') >= t.count('нажатие'))(adb('logcat', '-d', '-s', 'osmotr-camera')), 4, 0.3)
    log = [l for l in adb('logcat', '-d', '-v', 'epoch', '-s', 'osmotr-camera').splitlines() if 'osmotr-camera' in l]
    ev = []
    for l in log:
        m = re.match(r'\s*(\d+\.\d+).*osmotr-camera:\s*(.*)$', l)
        if m:
            ev.append((float(m.group(1)), m.group(2)))
    presses = [t for t, e in ev if e == 'нажатие']
    starts = [(t, int(re.search(r'(\d+) мс', e).group(1))) for t, e in ev if e.startswith('старт')]
    done_at = next((t for t, e in ev if e == 'готово'), None)
    late = [t for t, _ in starts if done_at is not None and t > done_at + 0.3]
    slow = [ms for _, ms in starts if ms > 1000]
    accepted = len(presses)
    ok = accepted >= 1 and len(starts) == accepted and not late and not slow and done_at is not None
    r.steps.append({'что': 'снимок — в момент нажатия, после «Готово» не снимает', 'ок': ok,
                    'было': {'принято нажатий': accepted, 'из 10': 10, 'снято': len(starts), 'задержки, мс': [ms for _, ms in starts],
                             'после «Готово»': len(late)},
                    'ждали': 'каждый снимок ≤ 1 с от нажатия, ни одного после «Готово»'})
    if not ok:
        raise Fail()
    r.look('вернулись из камеры')
    # Второй заход в ту же папку, пока первые кадры могут ещё дописываться.
    shutter = open_camera('снова снять МТ-101')
    for _ in range(2):
        r.dev.tap_node(shutter); time.sleep(0.6)
    r.dev.tap_node(r.dev.dump().find('camera-done'))
    # Фон дописывает: ждать, пока временных не останется (было — 10 с наугад).
    settle_files(('find', ROOT, '-path', '*МТ-101*', '-name', '*.jpg'), ('find', ROOT, '-path', '*МТ-101*', '-name', '.*.tmp'), 30)
    r.look('после второго захода')
    files = [l.strip() for l in sh('find', ROOT, '-path', '*МТ-101*', '-name', '*.jpg').splitlines() if l.strip()]
    tmps = [l.strip() for l in sh('find', ROOT, '-path', '*МТ-101*', '-name', '.*.tmp').splitlines() if l.strip()]
    ok = len(files) == accepted + 2 and len(set(files)) == len(files) and not tmps
    r.steps.append({'что': 'все кадры двух заходов в папке', 'ок': ok, 'было': {'в папке': len(files), 'временные': tmps},
                    'ждали': f'{accepted + 2} .jpg (принятые нажатия + 2), временных нет'})
    if not ok or not gone:
        raise Fail()
    import shlex   # adb shell склеивает аргументы через пробел — путь с пробелами в кавычки
    heads = [sh('xxd', '-l', '2', '-p', shlex.quote(f)).strip() for f in files]
    sizes = [sh('stat', '-c', '%s', shlex.quote(f)).strip() for f in files]
    ok = all(h == 'ffd8' for h in heads)
    r.steps.append({'что': 'кадры — JPEG', 'ок': ok, 'было': {'начало': heads, 'размер': sizes}, 'ждали': 'ffd8 у каждого'})
    same = lambda x: x.replace('/sdcard/', '/storage/emulated/0/', 1)
    now = {same(x) for x in rows()}
    lost = [f for f in files if same(f) not in now]
    ok = ok and not lost
    r.steps.append({'что': 'галерея знает кадры по их месту', 'ок': not lost, 'было': {'нет записи': lost}, 'ждали': 'у каждого кадра — запись галереи'})
    if not ok:
        raise Fail()


def p_share_place(r):
    """
    «Поделиться» фото в «Осмотр» (19.10.2026): список «Куда положить» сразу — все инвентарники описи
    (без поиска); в дереве — и предметы без папки; касание предмета → «Положить» → фото в его папке.
    """
    fresh(r)
    sh('mkdir', '-p', '/sdcard/Download/matrix')
    sh('screencap', '-p', '/sdcard/Download/matrix/share.png')
    sh('am', 'start', '-a', 'android.intent.action.SEND', '-t', 'image/png', '--grant-read-uri-permission',
       '--eu', 'android.intent.extra.STREAM', 'file:///sdcard/Download/matrix/share.png', '-n', 'kg.osmotr/.MainActivity')
    # Лёжа в экран входят три строки: важно, что они видны сразу, без поиска и клавиатуры.
    мало = 3 if getattr(r.dev, 'rot', 0) == 1 else 4
    until(lambda: sum('·  №' in t for t in r.dev.dump().texts()) >= мало, 8, 0.3)
    r.look('куда положить: список')
    # Строки предметов «инв · № N» — сразу, без поиска (на стенде описей несколько, эта — не первая).
    seen = [t for t in r.scr.texts() if '·  №' in t]
    ok = len(seen) >= мало
    r.steps.append({'что': 'список — все инвентарники без поиска', 'ок': ok, 'было': seen[:12], 'ждали': 'строки предметов видны сразу'})
    if not ok:
        raise Fail()
    r.tap('Дерево папок', 'дерево при раскладке')
    r.tap('Найти папку', 'поиск в дереве', look=False)
    r.type('107')   # adb input text — только латиница и цифры
    until(lambda: r.dev.dump().has('МТ-107'), 3, 0.2)
    sh('input', 'keyevent', '111')  # убрать клавиатуру
    r.look('дерево: найден предмет')
    texts = r.scr.texts()
    ok = 'нет папки' in texts and any('МТ-107' in t for t in texts)
    r.steps.append({'что': 'дерево — предметы без папки', 'ок': ok, 'было': [t for t in texts if 'МТ-1' in t][:12], 'ждали': 'МТ-107 — нет папки'})
    if not ok:
        raise Fail()
    r.tap('МТ-107', 'предмет без папки', look=False)
    until(lambda: r.dev.dump().has('Положить'), 3, 0.2)
    r.look('подтверждение')
    r.tap('Положить', 'положить', exact=True, look=False)
    until(lambda: sh('find', ROOT, '-path', '*МТ-107*', '-name', '*.png').strip(), 15)
    r.look('после раскладки')
    files = [l.strip() for l in sh('find', ROOT, '-path', '*МТ-107*', '-name', '*.png').splitlines() if l.strip()]
    ok = len(files) == 1
    r.steps.append({'что': 'фото в папке предмета', 'ок': ok, 'было': files, 'ждали': 'одно фото в папке МТ-107'})
    sh('rm', '-f', '/sdcard/Download/matrix/share.png')
    if not ok:
        raise Fail()


def chooser(r, what):
    """Отдали файл наружу: открылся системный выбор приложения, приложение не упало; закрыть выбор."""
    f = ''
    for _ in range(30):   # архив собирается — до 15 с
        time.sleep(0.5)
        c = r.dev.crashes()
        if c:
            r.steps.append({'что': what, 'ок': False, 'было': 'ПАДЕНИЕ ' + c[-800:], 'ждали': 'выбор приложения'})
            raise Fail()
        f = r.dev.focus()
        if 'Chooser' in f or 'intentresolver' in f or 'ResolverActivity' in f:
            break
    ok = 'Chooser' in f or 'intentresolver' in f or 'ResolverActivity' in f
    r.steps.append({'что': what, 'ок': ok, 'было': f'в фокусе {f}' if not ok else '', 'ждали': 'выбор приложения'})
    if not ok:
        raise Fail()
    # Android 17: выбор открывается через промежуточный ChooserActivityLauncher — «назад», пришедший раньше самого
    # выбора, его не закрывает (29.10.2026). Закрывать, пока фокус не вернётся к «Осмотру» (не дольше 6 с).
    def picker():
        f = r.dev.focus()
        return 'Chooser' in f or 'intentresolver' in f or 'ResolverActivity' in f
    # Выбор должен успеть встать: «назад» в только что открывшийся уходил приложению и уводил с экрана. Окно на
    # Android 17 так и зовётся ChooserActivityLauncher — ждать не другого имени, а 0,5 с фокуса на нём (до 2 с).
    held = [0.0]
    def steady():
        if picker():
            held[0] = held[0] or time.time()
            return time.time() - held[0] >= 0.5
        held[0] = 0.0
        return False
    until(steady, 2, 0.1)
    for _ in range(4):
        sh('input', 'keyevent', 'BACK')
        until(lambda: PKG in r.dev.focus(), 2.5, 0.2)
        if not picker():   # ещё «назад» — только если выбор всё ещё на экране, иначе уведёт из приложения назад
            break


def p_export_out(r):
    """
    Выгрузка наружу (20.10.2026, падение у автора: «Failed to find configured root that contains
    …/cache/reports/…не осмотренное.xlsx»): каждый вид отчёта и архив диагностики доходят до выбора
    приложения. Файл, отдаваемый наружу, должен лежать в папке из res/xml/file_paths.xml — модульные
    тесты на JVM этого не видят, только устройство.
    """
    fresh(r)
    r.tap('Шкаф металлический 1', 'выделить долгим нажатием', long=True, exact=True)
    r.tap('Осмотрено (1)')
    for kind in ('Отчёт: всё', 'Отчёт: осмотренное', 'Отчёт: не осмотренное'):
        r.tap('Выгрузить опись', 'выгрузка')
        r.tap(kind, kind, look=False)   # лёжа третий вид — ниже края окна: касание докручивает само
        chooser(r, f'{kind} — наружу')
        r.look(f'после «{kind}»')
    r.dev.launch(); r.look('главная')
    r.tap('Ещё', 'меню')
    r.tap('Диагностика', 'диагностика', exact=True)
    r.tap('Отправить', 'отправить диагностику', exact=True, look=False)
    chooser(r, 'диагностика — наружу')


def p_video(r):
    """
    Видео (20.10.2026): вкладка «ВИДЕО», запись и остановка — файл .mp4 в папке предмета, целый,
    без временных `.rec`; в папке он виден отдельно от снимков; «Готово» во время записи не теряет её.
    """
    fresh(r)
    open_own_camera(r)

    def press(tag):
        n = r.dev.dump().find(tag, exact=True)
        if n is None:
            r.steps.append({'что': f'нажать {tag}', 'ок': False, 'было': r.dev.dump().texts()[:20], 'ждали': tag}); raise Fail()
        r.dev.tap_node(n); time.sleep(0.3)

    press('camera-mode-video')
    until(lambda: shutter_ready(r), 10, 0.3)   # режим «Видео» перезапускает камеру
    press('camera-shutter')
    rec = until(lambda: tag_node(r, 'camera-clock') is not None, 6, 0.3)
    r.steps.append({'что': 'идёт запись', 'ок': rec, 'было': rec, 'ждали': 'таймер записи'})
    if not rec:
        raise Fail()
    # «Готово» во время записи: запись останавливается и дописывается в фоне.
    r.dev.tap_node(r.dev.dump().find('camera-done', exact=True))
    settle_files(('find', ROOT, '-path', '*МТ-101*', '-name', '*.mp4'), ('find', ROOT, '-path', '*МТ-101*', '-name', '.*.rec'), 30)
    files = [l.strip() for l in sh('find', ROOT, '-path', '*МТ-101*', '-name', '*.mp4').splitlines() if l.strip()]
    tmps = [l.strip() for l in sh('find', ROOT, '-path', '*МТ-101*', '-name', '.*.rec').splitlines() if l.strip()]
    import shlex
    sizes = [sh('stat', '-c', '%s', shlex.quote(f)).strip() for f in files]
    ok = len(files) == 1 and not tmps and all(x.isdigit() and int(x) > 10000 for x in sizes)
    r.steps.append({'что': 'видео легло в папку предмета', 'ок': ok, 'было': {'файлы': files, 'размер': sizes, 'временные': tmps}, 'ждали': 'один .mp4, временных нет'})
    r.look('после видео')
    # Вернуть режим «Фото» для следующих путей.
    r.tap('Снять', 'снять снова', look=False)
    until(lambda: shutter_ready(r), 15, 0.5)
    n = r.dev.dump().find('camera-mode-photo', exact=True)
    if n is not None:
        r.dev.tap_node(n); time.sleep(0.3); until(lambda: shutter_ready(r), 10, 0.3)
    r.dev.tap_node(r.dev.dump().find('camera-done', exact=True))
    if not ok:
        raise Fail()


def p_document(r):
    """
    Режим «Документ» (20.10.2026, у автора на телефоне упал): нажатие по вкладке не роняет приложение —
    открывается сканер Google либо сообщение, что его нет; камера после этого цела.
    """
    fresh(r)
    open_own_camera(r)
    adb('logcat', '-b', 'crash', '-c')
    n = r.dev.dump().find('camera-mode-doc', exact=True)
    if n is None:
        r.steps.append({'что': 'вкладка «Документ»', 'ок': False, 'было': r.dev.dump().texts()[:20], 'ждали': 'camera-mode-doc'}); raise Fail()
    r.dev.tap_node(n)
    until(lambda: PKG not in r.dev.focus() or r.dev.crashes(), 8, 0.5); time.sleep(1)
    crash = r.dev.crashes()
    r.steps.append({'что': 'нажатие «Документ» не роняет приложение', 'ок': not crash, 'было': crash[-900:], 'ждали': 'без падений'})
    sh('input', 'keyevent', 'BACK'); time.sleep(1)
    if crash:
        raise Fail()


def p_camera_stress(r):
    """
    Нагрузка на камеру (20.10.2026: «чтобы крашей не было»): 80 случайных действий подряд — переключатели,
    режимы, форматы, зум, панель, фокус и яркость по кадру, спуск, вкладка «Документ» — и поворот
    телефона посреди. Ни одного падения, камера цела.
    """
    import random
    rnd = random.Random(20102026)
    fresh(r)
    open_own_camera(r)
    adb('logcat', '-b', 'crash', '-c')
    W, H = r.dev.window()
    tags = ['camera-flash', 'camera-aspect', 'camera-grid-toggle', 'camera-settings', 'camera-zoom-1', 'camera-zoom-2', 'camera-zoom-0.6',
            'camera-mode-photo', 'camera-mode-video', 'camera-shutter', 'camera-dark', 'camera-ext-HDR', 'camera-ext-Ночь']
    done_steps = []
    for i in range(80):
        a = rnd.random()
        if a < 0.55:
            tag = rnd.choice(tags)
            n = r.dev.dump().find(tag, exact=True)
            if n is not None:
                r.dev.tap_node(n); done_steps.append(tag)
        elif a < 0.7:
            x, y = rnd.randint(W // 6, W * 5 // 6), rnd.randint(H // 6, H * 2 // 3)
            sh('input', 'tap', str(x), str(y)); done_steps.append('касание кадра')
        elif a < 0.8:
            x, y = rnd.randint(W // 6, W * 5 // 6), rnd.randint(H // 5, H // 2)
            sh('input', 'swipe', str(x), str(y), str(x), str(y), '700'); done_steps.append('долгое касание')
            sh('input', 'swipe', str(x), str(y + 150), str(x), str(y - 250), '300'); done_steps.append('яркость вверх')
            sh('input', 'swipe', str(x), str(y - 100), str(x), str(y + 300), '300'); done_steps.append('яркость вниз')
        elif a < 0.88:
            sh('input', 'swipe', str(W * 4 // 5), str(H // 2), str(W // 5), str(H // 2), '120'); done_steps.append('смахнуть влево')
        elif a < 0.94:
            sh('input', 'swipe', str(W // 5), str(H // 2), str(W * 4 // 5), str(H // 2), '120'); done_steps.append('смахнуть вправо')
        else:
            n = r.dev.dump().find('camera-mode-doc', exact=True)
            if n is not None:
                r.dev.tap_node(n); time.sleep(4); sh('input', 'keyevent', 'BACK'); done_steps.append('документ')
        if i == 40:
            r.dev.rotate(1); time.sleep(2); r.dev.rotate(0); time.sleep(2); done_steps.append('поворот')
        time.sleep(0.35)
        c = r.dev.crashes()
        if c:
            r.steps.append({'что': 'нагрузка на камеру', 'ок': False, 'было': {'шаг': i, 'действия': done_steps[-6:], 'падение': c[-900:]}, 'ждали': 'без падений'})
            raise Fail()
    # Сканер Google мог открыть своё окно (скачивание модуля при первом разе) — выйти из него назад.
    for _ in range(3):
        if PKG in r.dev.focus():
            break
        sh('input', 'keyevent', 'BACK'); time.sleep(1.5)
    alive = r.dev.focus()
    # Окно загрузки модуля сканера (Google Play services) может остаться поверх — это не падение «Осмотра»:
    # падение ловится на каждом шаге выше, здесь — что приложение живо и открывается снова.
    crash = r.dev.crashes()
    r.dev.launch()
    ok = not crash and PKG in r.dev.focus()
    r.steps.append({'что': 'нагрузка на камеру: без падений', 'ок': ok, 'было': {'до перезапуска в фокусе': alive, 'действий': len(done_steps), 'падение': crash[-300:]}, 'ждали': 'без падений, приложение открывается'})
    if not ok:
        raise Fail()


def p_exports(r):
    """
    Выгрузки (21.10.2026, осмотрщик: «архив где-нибудь сохраняется?», «не смогла отправить, много весит»):
    архив папки остаётся в «Загрузки/Осмотр», виден на экране «Выгрузки»; «По частям» со своим пределом
    даёт несколько самостоятельных архивов не больше предела, вместе — те же файлы по тем же путям; отправка
    частей доходит до выбора приложения; «Удалить все» освобождает место.
    """
    import shlex
    fresh(r)
    # Три «снимка» по ~700 КБ в папку предмета (несжимаемые) — чтобы архив был больше предела в 1 МБ.
    d = f"{INV}/МТ-101"
    sh(f"mkdir -p {shlex.quote(d)}")
    for i in range(3):
        sh(f"head -c 700000 /dev/urandom > {shlex.quote(d + f'/МТ-101_2026102{i}_080000_001.jpg')}")
    exports = '/sdcard/Download/Осмотр'
    sh(f"rm -rf {shlex.quote(exports)}")
    open_fresh(r)
    r.tap('Папки описи', 'папки описи')
    r.tap('Ещё', 'меню')
    r.tap('Отправить архивом', 'архив', look=False)
    chooser(r, 'архив — наружу')
    r.look('после архива')
    zips = [l.strip() for l in sh('find', exports, '-maxdepth', '1', '-name', '*.zip').splitlines() if l.strip()]
    ok = len(zips) == 1
    r.steps.append({'что': 'архив остался в «Загрузки/Осмотр»', 'ок': ok, 'было': zips, 'ждали': 'один .zip'})
    if not ok:
        raise Fail()
    r.tap('Ещё', 'меню')
    r.tap('Выгрузки', 'выгрузки', exact=True)
    r.expect('экран выгрузок', has=['Выгрузки', 'По частям'])
    r.tap('По частям', 'по частям', exact=True)
    r.tap('Свой предел, МБ', 'свой предел', exact=True, look=False)
    time.sleep(0.8); sh('input', 'text', '1'); time.sleep(0.8)
    r.look('предел 1 МБ')
    r.tap('Разбить и отправить', 'разбить и отправить', exact=True, look=False)
    chooser(r, 'части — наружу')
    parts = [l.strip() for l in sh('find', exports + '/Части', '-name', '*.zip').splitlines() if l.strip()]
    sizes = [int(sh('stat', '-c', '%s', shlex.quote(p)).strip() or 0) for p in parts]
    ok = len(parts) >= 2 and all(0 < x <= 1048576 for x in sizes)
    r.steps.append({'что': 'части не больше предела', 'ок': ok, 'было': {'части': [p.rsplit('/', 1)[-1] for p in parts], 'размеры': sizes}, 'ждали': '≥ 2 части ≤ 1 МБ'})
    if not ok:
        raise Fail()
    r.look('выгрузки после разбиения')
    r.tap('Ещё', 'меню')
    r.tap('Удалить все', 'удалить все')
    r.tap('Удалить', 'подтвердить', exact=True)
    time.sleep(2)
    left = [l.strip() for l in sh('find', exports, '-type', 'f').splitlines() if l.strip()]
    ok = not left
    r.steps.append({'что': '«Удалить все» освобождает место', 'ок': ok, 'было': left, 'ждали': 'пусто'})
    if not ok:
        raise Fail()


def p_system_wide(r):
    """
    Ширика нет среди камер приложения (эмулятор, Xiaomi): «0.6↗» открывает приложение камеры
    телефона целиком (автор, 21.10.2026: «с полными её настройками и заставляем класть по нужному
    адресу фото»); снятое там за заход — в папке предмета, записи галереи — на новом месте, на
    старом нет; камера «Осмотра» после возврата цела.
    """
    fresh(r)
    def rows():
        out = sh('content', 'query', '--uri', 'content://media/external/images/media', '--projection', '_data')
        return [l.split('_data=')[-1].strip() for l in out.splitlines() if '_data=' in l]
    open_own_camera(r)
    adb('logcat', '-b', 'crash', '-c')
    n = r.dev.dump().find('camera-system', exact=True)
    r.steps.append({'что': 'кнопка «0.6↗»', 'ок': n is not None, 'было': r.dev.dump().texts()[:20], 'ждали': 'camera-system'})
    if n is None:
        raise Fail()
    r.dev.tap_node(n)
    until(lambda: (lambda sc: sc.find('shutter_button') or sc.find('confirm_button') or sc.find('While using the app') or sc.find('При использовании'))(r.dev.dump()), 12, 0.5)
    for _ in range(3):   # первый запуск камеры телефона — окно разрешений
        scr = r.dev.dump(); k = scr.find('confirm_button') or scr.find('While using the app') or scr.find('При использовании')
        if k is None:
            break
        r.dev.tap_node(k); until(lambda: r.dev.dump().find('shutter_button'), 6, 0.5)
    scr = r.dev.dump(); shutter = scr.find('shutter_button')
    r.steps.append({'что': 'открылось приложение камеры', 'ок': shutter is not None, 'было': r.dev.focus(), 'ждали': 'спуск камеры телефона'})
    if shutter is None:
        raise Fail()
    before = set(rows())   # живой телефон: в галерее уже свои снимки — «снято» только новое
    for i in range(2):   # камера эмулятора сохраняет кадр ~2–4 с — ждать новую запись галереи, а не 6 с
        # Лёжа камера поворачивается уже после открытия: координаты кнопки — с вставшего экрана.
        shutter = r.dev.still().find('shutter_button') or shutter
        r.dev.tap_node(shutter)
        until(lambda: len([p for p in rows() if p not in before]) > i, 12, 0.7); time.sleep(0.5)
    shot = [p for p in rows() if ('/Pictures/' in p or '/DCIM/' in p) and p not in before]
    sh('input', 'keyevent', '4')
    # Снятое там переезжает в папку предмета после возврата — ждать, пока все кадры там (было 10 с наугад).
    until(lambda: len([l for l in sh('find', ROOT, '-path', '*МТ-101*', '-name', '*.jpg').splitlines() if l.strip()]) >= len(shot)
          and shutter_ready(r), 20, 0.7)
    r.look('вернулись в камеру «Осмотра»')
    files = [l.strip() for l in sh('find', ROOT, '-path', '*МТ-101*', '-name', '*.jpg').splitlines() if l.strip()]
    now = rows()
    same = lambda x: x.replace('/sdcard/', '/storage/emulated/0/', 1)
    stale = [p for p in shot if p in now]
    lost = [f for f in files if same(f) not in {same(x) for x in now}]
    crash = r.dev.crashes()
    ok = len(shot) >= 1 and len(files) >= len(shot) and not stale and not lost and not crash
    r.steps.append({'что': 'снятое камерой телефона — в папке предмета', 'ок': ok,
                    'было': {'сняли': shot, 'в папке': files, 'на старом месте': stale, 'без записи': lost, 'падение': crash[-300:]},
                    'ждали': 'все снятые в МТ-101, галерея на новом месте'})
    if not ok:
        raise Fail()
    r.expect('камера «Осмотра» на месте', has=['camera-shutter'])


def p_camera_settings(r):
    """
    Настройки своей камеры (20.10.2026): формат 4:3 по умолчанию и переключается на 16:9, сетка,
    панель настроек, ступени зума; после каждой смены снимок по-прежнему идёт сразу (≤ 1 с) и
    ложится в папку; настройки помнятся — второй заход открывается с выбранным.
    """
    fresh(r)
    open_own_camera(r)

    def has(tag):
        return r.dev.dump().find(tag, exact=True) is not None

    def label(tag):
        n = r.dev.dump().find(tag, exact=True)
        if n is None:
            return None
        stack = list(n.kids) + [n]
        while stack:
            k = stack.pop(0)
            if k.text:
                return k.text
            stack += k.kids
        return ''

    def press(tag):
        n = r.dev.dump().find(tag, exact=True)
        if n is None:
            r.steps.append({'что': f'нажать {tag}', 'ок': False, 'было': r.dev.dump().texts()[:20], 'ждали': tag}); raise Fail()
        r.dev.tap_node(n); time.sleep(0.4)

    def shoot_one(what):
        adb('logcat', '-c')
        until(lambda: shutter_ready(r), 10, 0.3)
        press('camera-shutter')
        until(lambda: re.search(r'старт \d+ мс', adb('logcat', '-d', '-s', 'osmotr-camera')), 6, 0.4); time.sleep(0.5)
        log = adb('logcat', '-d', '-s', 'osmotr-camera')
        ms = [int(x) for x in re.findall(r'старт (\d+) мс', log)]
        ok = len(ms) == 1 and ms[0] <= 1000
        r.steps.append({'что': what, 'ок': ok, 'было': {'старт, мс': ms}, 'ждали': 'один снимок, не дольше секунды'})
        if not ok:
            raise Fail()

    # Настройки помнятся между прогонами: прервавшийся прогон мог оставить 16:9 и сетку — привести к умолчанию.
    if label('camera-aspect') != '4:3':
        press('camera-aspect'); until(lambda: label('camera-aspect') == '4:3', 4, 0.3)
    if has('camera-grid'):
        press('camera-grid-toggle'); until(lambda: not has('camera-grid'), 3, 0.3)
    first = label('camera-aspect')
    r.steps.append({'что': 'формат по умолчанию', 'ок': first == '4:3', 'было': first, 'ждали': '4:3'})
    if first != '4:3':
        raise Fail()
    shoot_one('снимок в 4:3')
    press('camera-aspect')
    second = until(lambda: (lambda v: v if v == '16:9' else None)(label('camera-aspect')), 5, 0.3) or label('camera-aspect')
    r.steps.append({'что': 'формат переключается', 'ок': second == '16:9', 'было': second, 'ждали': '16:9'})
    if second != '16:9':
        raise Fail()
    shoot_one('снимок в 16:9')
    press('camera-grid-toggle')
    g = until(lambda: has('camera-grid'), 4, 0.3)
    r.steps.append({'что': 'сетка включается', 'ок': g, 'было': g, 'ждали': 'сетка на экране'})
    if not g:
        raise Fail()
    press('camera-settings')
    p = until(lambda: has('camera-panel'), 4, 0.3)
    r.steps.append({'что': 'панель настроек открывается', 'ок': p, 'было': p, 'ждали': 'панель'})
    if not p:
        raise Fail()
    r.look('камера: панель')
    sh('screencap', '-p', '/sdcard/Download/camera-panel.png')
    # Касание вне окна настроек закрывает его (автор, 20.10.2026).
    W, H = r.dev.window()
    sh('input', 'tap', str(W // 2), str(int(H * 0.3)))
    closed = until(lambda: not has('camera-panel'), 4, 0.3)
    r.steps.append({'что': 'окно настроек закрывается касанием вне', 'ок': closed, 'было': 'открыто' if not closed else '', 'ждали': 'закрыто'})
    if not closed:
        raise Fail()
    # Касание по кадру — фокус: рамка на экране.
    # Долгое касание — рамка остаётся (закреплена), пока не коснутся снова; обычная гаснет через ~1.2 с.
    sh('input', 'swipe', str(W // 2), str(int(H * 0.4)), str(W // 2), str(int(H * 0.4)), '700'); time.sleep(1.5)
    sh('screencap', '-p', '/sdcard/Download/camera-focus.png')
    framed = has('camera-focus')
    if not framed and r.dev.helper:   # рамка на снимке экрана есть, а в дереве помощника — нет: новое подключение
        r.dev.helper_stop(); r.dev.helper_start(); framed = has('camera-focus')
    r.steps.append({'что': 'касание — рамка фокуса', 'ок': framed, 'было': framed, 'ждали': 'рамка на экране'})
    if not framed:
        raise Fail()
    # Яркость тянется в обе стороны, не сбрасывается и рамка не пропадает, пока тянут (автор, 20.10.2026).
    def ev_label():
        # Экран камеры помощник отдаёт с отставанием на шаг (яркость читалась от прошлого движения) — снимать
        # через новое подключение (~1 с на отсчёт, отсчётов три).
        if r.dev.helper:
            r.dev.helper_stop(); r.dev.helper_start()
        for t in r.dev.dump().texts():
            if re.fullmatch(r'[+-]\d+\.\d', t):
                return float(t)
        return 0.0
    x, y0 = W // 2, int(H * 0.4)
    sh('input', 'swipe', str(x), str(y0 + 150), str(x), str(y0 - 250), '500'); time.sleep(0.6)
    up = ev_label()
    sh('input', 'swipe', str(x), str(y0 - 100), str(x), str(y0 + 450), '900'); time.sleep(0.6)
    down = ev_label()
    sh('input', 'swipe', str(x), str(y0 + 100), str(x), str(y0 - 500), '500'); time.sleep(0.6)
    again = ev_label()
    ok = up > 0 and down < up and down < 0 and again > down and has('camera-focus')
    r.steps.append({'что': 'яркость: вверх, вниз, снова вверх; рамка цела', 'ок': ok, 'было': {'вверх': up, 'вниз': down, 'снова вверх': again, 'рамка': has('camera-focus')},
                    'ждали': 'вверх > 0, вниз < 0, снова вверх > вниз'})
    if not ok:
        raise Fail()
    r.dev.tap_node(r.dev.dump().find('camera-done'))
    until(lambda: not has('camera-shutter'), 4, 0.2)
    r.look('вернулись из камеры')
    # Второй заход — с тем, что выбрали (16:9, сетка).
    r.tap('Снять', 'снять снова', look=False)
    until(lambda: shutter_ready(r), 10, 0.2)
    again = label('camera-aspect')
    ok = again == '16:9' and has('camera-grid')
    r.steps.append({'что': 'настройки помнятся', 'ок': ok, 'было': {'формат': again}, 'ждали': '16:9 и сетка'})
    # Вернуть 4:3 для следующих путей.
    press('camera-aspect'); press('camera-grid-toggle')
    r.dev.tap_node(r.dev.dump().find('camera-done'))
    if not ok:
        raise Fail()


# Пути. Каждый начинает с чистого запуска и своей свежей описи.

def p_search_card(r):
    fresh(r)
    r.search('105')
    r.expect('нашлось по номеру', has=['МТ-105'])
    r.tap('Шкаф металлический 5', 'открыть найденное')
    r.expect('карточка предмета', has=['МТ-105', 'Опись «matrix-good»'])
    r.back()
    r.expect('вернулись в опись, поиск чист', has=['из 12 осмотрено'], lacks=['Найдено:'])


def p_mark_selection(r):
    fresh(r)
    r.tap('Шкаф металлический 1', 'выделить долгим нажатием', long=True, exact=True)
    r.expect('панель выделения', has=['Отмечено: 1', 'Осмотрено (1)'])
    r.tap('Осмотрено (1)')
    r.expect('метка «осмотрено» у предмета', has=['осмотрено'], exact=True)
    r.tap('Шкаф металлический 1', 'выделить снова', long=True, exact=True)
    r.tap('Снять (1)')
    r.expect('метка снята', lacks=['осмотрено'], exact=True)


def p_mark_card(r):
    fresh(r)
    r.tap('МТ-102', 'открыть предмет', exact=True)
    r.tap('Отметить осмотренным')
    r.expect('отмечено в карточке', has=['Осмотрено — снять отметку'])
    r.tap('Осмотрено — снять отметку')
    r.expect('снято в карточке', has=['Отметить осмотренным'])
    r.back()
    # Лёжа строка вынималась из-под плашки: список остался прокрученным, сводка — над краем.
    if getattr(r.dev, 'rot', 0) == 1:
        W, H = r.dev.window()
        for _ in range(3):
            sh('input', 'swipe', str(W // 2), str(int(H * 0.45)), str(W // 2), str(int(H * 0.9)), '300')
        r.dev.still(); r.look('список сверху')
    r.expect('в описи', has=['из 12 осмотрено'])
    r.expect('без метки', lacks=['осмотрено'], exact=True)


def p_rotate_theme(r, ctx):
    fresh(r)
    r.search('10')
    before = r.found()
    r.expect('нашлось', has=['Найдено:'])
    r.dev.rotate(1 - ctx['rot']); time.sleep(1.5)
    r.look('повернули')
    r.expect('после поворота — тот же поиск', has=[before])
    r.dev.theme(not ctx['dark']); time.sleep(1.5)
    r.look('сменили тему')
    r.expect('после смены темы — тот же поиск', has=[before])
    r.dev.theme(ctx['dark']); r.dev.rotate(ctx['rot']); time.sleep(1.5)
    r.look('вернули тему и поворот')
    r.expect('после возврата — тот же поиск', has=[before])


def p_columns_cancel(r):
    fresh(r)
    r.tap('Ещё', 'меню', exact=True)
    r.tap('Столбцы описи')
    r.expect('экран столбцов', has=['Столбцы описи', 'Инв. №', 'Наименование', 'Сохранить', 'Как прочитано:', 'Сводка'])
    r.tap('Наименование', 'столбец наименований', exact=True)
    r.expect('выбор поля', has=['Инвентарный номер', 'Не брать этот столбец'])
    r.tap('Инвентарный номер', 'указать: инвентарник', exact=True)
    r.expect('подпись сменилась, предупреждение есть', has=['Инв. №', 'проверьте столбец'])
    r.back('назад с несохранённым')
    r.expect('спросили', has=['Не сохранять изменения?'])
    r.tap('Не сохранять', exact=True)
    r.expect('опись как была', has=['из 12 осмотрено', 'МТ-101'])


def p_columns_save(r):
    fresh(r)
    r.expect('стоимость есть', has=['первонач.'])
    r.tap('Ещё', 'меню', exact=True)
    r.tap('Столбцы описи')
    r.scroll_side_to('Стоимость')
    r.tap('Стоимость', 'столбец стоимости', exact=True)
    r.tap('Не брать этот столбец')
    r.tap('Сохранить')
    r.expect('стоимости нет', has=['из 12 осмотрено'], lacks=['первонач.'])
    r.tap('Ещё', 'меню', exact=True)
    r.tap('Столбцы описи')
    r.tap('Как решит приложение')
    r.tap('Сохранить')
    r.expect('стоимость вернулась', has=['первонач.'])


def p_sheet_skip(r):
    fresh(r)
    r.tap('Ещё', 'меню', exact=True)
    r.tap('Столбцы описи')
    r.tap('лист Опись', 'лист «Опись»')
    r.tap('брать лист', 'не брать лист')
    r.expect('предметов нет — сохранить нельзя', has=['Ни одного предмета'])
    r.tap('брать лист', 'брать снова')
    r.expect('снова 12', has=['12 предметов'])
    r.back('назад: изменений нет')
    r.expect('опись, без вопроса', has=['из 12 осмотрено'], lacks=['Не сохранять изменения?'])


FIXTURES = '/sdcard/Download/matrix'


def view(r, name, what):
    sh('am', 'start', '-a', 'android.intent.action.VIEW', '-d', f'file://{FIXTURES}/{name}',
       '-t', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '-n', f'{PKG}/.MainActivity')
    into_object(r)
    r.look(what)


def p_bad_files(r):
    r.dev.launch(); r.look('главная')
    view(r, 'matrix-broken.xlsx', 'битый файл')
    r.expect('причина — повреждён', has=['повреждён'])
    r.back('закрыть окно')
    view(r, 'matrix-pdf.xlsx', 'PDF под видом xlsx')
    r.expect('причина — PDF', has=['PDF'])
    r.back('закрыть окно')
    view(r, 'matrix-act.xlsx', 'книга без списка')
    r.expect('опись заведена, столбцы спрошены', has=['Столбцы описи', 'Список предметов сам не нашёлся'])
    r.back('закрыть столбцы')
    r.expect('пустое состояние описи', has=['Указать столбцы', 'Загрузить другой файл'])
    view(r, 'matrix-good.xlsx', 'хорошая опись')
    r.expect('открылась', has=['из 12 осмотрено'])
    view(r, 'matrix-good.xlsx', 'та же второй раз')
    r.expect('уже загружена', has=['уже загружена'])


def stand_or_fresh(r):
    """
    Опись стенда «Корпус A» (эмулятор) — или, где стенда нет (живой телефон), свежая опись матрицы с одним
    снимком своей камерой: замене и экранам папок есть что показать и что терять.
    """
    r.dev.launch(); r.look('главная')
    into_old(r)
    for _ in range(4):
        if r.scr.has('Корпус A'):
            r.tap('Корпус A', 'опись стенда')
            r.expect('опись открылась', has=['осмотрено'])
            return
        W, H = r.dev.window()
        sh('input', 'swipe', str(W // 2), str(int(H * 0.75)), str(W // 2), str(int(H * 0.35)), '300')
        r.look('ищем «Корпус A»')
    fresh(r)
    r.tap('Снять', 'снять МТ-101', look=False)
    until(lambda: shutter_ready(r), 12, 0.2)
    r.dev.tap_node(r.dev.dump().find('camera-shutter', exact=True))
    until(lambda: r.dev.dump().has('Снято: 1'), 6, 0.2)
    r.dev.tap_node(r.dev.dump().find('camera-done', exact=True))
    until(lambda: not r.dev.dump().has('camera-shutter', True), 6, 0.2)
    r.look('снят один предмет')
    r.expect('осмотрен один', has=['из 12 осмотрено'])


def p_replace_wrong(r):
    # Опись со снимками в папках: замене есть что терять (пустую папку приложение убирает само).
    stand_or_fresh(r)
    # Сколько осмотрено — до замены: после «Отмена» должно остаться так же (стенд может быть любым).
    before = next((n.text for n in r.scr.nodes if re.search(r'из \d+ осмотрено', n.text or '')), None)
    r.tap('Ещё', 'меню', exact=True)
    r.tap('Заменить файл описи', 'выбор файла')
    pick_file(r, 'matrix-other.xlsx')
    until(lambda: (lambda d: d.has('Заменить файл описи?') or d.has('Кресло'))(r.dev.dump()), 5, 0.3); r.look('проверка замены')
    r.expect('спросили перед заменой', has=['Заменить файл описи?', 'Похоже, это другая опись.'])
    r.tap('Отмена')
    r.expect('опись как была', has=[before] if before else ['осмотрено'])


def p_replace_restore(r):
    """
    Заменили опись чужим файлом (подтвердили) — и «Вернуть прежний файл описи»: список снова прежний
    (21.10.2026: тест экрана показал, что после возврата список оставался чужим).
    """
    fresh(r)
    r.tap('Ещё', 'меню', exact=True)
    r.tap('Заменить файл описи', 'выбор файла')
    pick_file(r, 'matrix-other.xlsx')
    until(lambda: (lambda d: d.has('Заменить файл описи?') or d.has('Кресло'))(r.dev.dump()), 5, 0.3); r.look('проверка замены')
    if r.scr.has('Заменить файл описи?'):   # спрашивает, только когда замена что-то теряет
        r.tap('Заменить', 'заменить', exact=True)
        time.sleep(3); r.look('после замены')
    r.expect('чужая опись на экране', has=['Кресло'])
    r.tap('Ещё', 'меню', exact=True)
    r.tap('Вернуть прежний файл описи', 'вернуть')
    time.sleep(3); r.look('после возврата')
    r.expect('прежняя опись на экране', has=['МТ-101'], lacks=['Кресло 1'])


def p_folder_dialogs(r):
    """
    Окна с вводом (Robolectric их не проверяет — поле в окне не даёт среде затихнуть): новая папка,
    переименовать, комментарий. Ввод — латиницей (adb input text кириллицу не набирает).
    """
    import shlex
    sh(f"rm -rf {shlex.quote(ROOT + '/Nasos1')} {shlex.quote(ROOT + '/Nasos2')}")
    r.dev.launch(); r.look('главная')
    r.tap('Новая папка', 'новая папка')
    r.type('Nasos1', 'имя папки')
    confirm(r, 'Создать', 'создать')
    until(lambda: 'Nasos1' in sh('ls', ROOT), 4, 0.2); r.look('папка создана')
    ok = 'Nasos1' in sh('ls', ROOT)
    r.steps.append({'что': 'папка создана', 'ок': ok, 'было': sh('ls', ROOT)[:200], 'ждали': 'Nasos1'})
    if not ok:
        raise Fail()
    r.tap('Ещё', 'меню', exact=True)
    r.tap('Переименовать', 'переименовать', exact=True)
    r.type('Nasos2', 'новое имя')
    confirm(r, 'Готово', 'готово')
    until(lambda: 'Nasos2' in sh('ls', ROOT), 4, 0.2); r.look('переименована')
    listing = sh('ls', ROOT)
    ok = 'Nasos2' in listing and 'Nasos1' not in listing
    r.steps.append({'что': 'папка переименована', 'ок': ok, 'было': listing[:200], 'ждали': 'Nasos2 вместо Nasos1'})
    if not ok:
        raise Fail()
    r.tap('Ещё', 'меню', exact=True)
    r.tap('Добавить комментарий', 'комментарий')
    r.type('tech%spo%ssalniku', 'текст')   # adb input text: пробел — %s
    confirm(r, 'Готово', 'готово')
    until(lambda: 'Комментарий' in sh('ls', shlex.quote(ROOT + '/Nasos2')), 4, 0.2); r.look('комментарий')
    note = sh('cat', shlex.quote(ROOT + '/Nasos2/Комментарий.txt')).strip()
    ok = note.lower() == 'tech po salniku'   # клавиатура пишет с заглавной — так и задумано (Sentences)
    r.steps.append({'что': 'комментарий в папке', 'ок': ok, 'было': note[:100], 'ждали': 'tech po salniku'})
    r.expect('комментарий на экране', has=['ech po salniku'])
    sh(f"rm -rf {shlex.quote(ROOT + '/Nasos2')}")
    if not ok:
        raise Fail()


MSG_CODE = '93.99'
MSG_CODE2 = '93.98'
MSG_CODE3 = '93.97'


def p_objects(r):
    """
    Объект целиком (3.14, 29.10.2026): сообщение о выезде «Поделиться» текстом → окно разобранного →
    «Завести» (сведения и контакты — на диске); перечень Excel в «Документах» — открыть и найти; литер —
    с «Внутренними помещениями» и «Фасадом». Данные выдуманы; объект «93.99 …» — прочь в cleanup.
    """
    import shlex
    r.dev.launch(); r.look('главная')
    msg = f'{MSG_CODE}. Matrix shkola\nг.Пример, ул.Ленина 1\nИванов Иван Иванович(рук)\n509123456 - рук./701654321 - исп'
    sh(f"am start -a android.intent.action.SEND -t text/plain --es android.intent.extra.TEXT {shlex.quote(msg)} -n {PKG}/.MainActivity")
    until(lambda: r.dev.dump().has('Сообщение о выезде'), 8, 0.2); r.look('сообщение о выезде')
    r.expect('разобрано', has=['Сообщение о выезде', f'{MSG_CODE} Matrix shkola', '+996 509 123 456'])
    r.tap('Завести', 'завести объект', exact=True)
    r.expect('объект открыт со сведениями', has=['ул.Ленина 1', 'Контакты'])
    r.scroll_to('Недвижимое')   # лёжа плитки категорий — ниже края
    obj = f'{ROOT}/{MSG_CODE} Matrix shkola'
    info = sh('cat', shlex.quote(obj + '/Объект.txt'))
    ok = 'Адрес: г.Пример, ул.Ленина 1' in info and 'Контакты.xlsx' in sh('ls', shlex.quote(obj))
    r.steps.append({'что': 'сведения и контакты на диске', 'ок': ok, 'было': info[:200], 'ждали': 'Объект.txt с адресом, Контакты.xlsx'})
    if not ok:
        raise Fail()
    adb('push', local(os.path.join(FIXTURES_LOCAL[0], 'matrix-list.xlsx')), f'{obj}/Документы/matrix-list.xlsx', check=True)
    # 3.23: документы — разделом (строка над плитками), внутри — все документы объекта по местам.
    r.scroll_to('раздел документы'); r.tap('раздел документы', 'документы объекта', exact=True)
    r.expect('перечень виден', has=['matrix-list', 'добавить документ'])
    r.tap('matrix-list', 'открыть перечень')
    r.expect('лист как в Excel', has=['Building', 'Main block'])
    r.search('Lenina 10')
    r.expect('найдено два здания', has=['Найдено: 2'])
    r.back('закрыть клавиатуру'); r.back('из перечня'); r.back('из документов')
    r.tap('Недвижимое', 'недвижимое', exact=True)
    r.tap('кнопка категории', 'литер или найденное', exact=True)
    r.type('LiterA', 'имя литера')
    confirm(r, 'Создать', 'создать литер')
    r.scroll_to('Фасад')   # лёжа плитки — под карточкой параметров и подсказками
    r.expect('помещения и фасад', has=['Внутренние помещения', 'Фасад', 'LiterA'])


def pick_file(r, name, many=False):
    """
    Системный выбор файлов: к Download/matrix и выбрать [name] (или список имён). [many] — выбор нескольких
    (OpenMultipleDocuments): там касание открывает файл просмотрщиком, выбирает — долгое касание (первый),
    дальше касания отмечают остальные, и «Select»/«Выбрать». Русский интерфейс: «Скачанные».
    """
    names = [name] if isinstance(name, str) else list(name)
    name = names[0]
    # Окно выбора открывается не сразу — экран перечитывается на каждой попытке. Все нужные файлы на экране —
    # только в своей папке: «Недавние» показывают уже выбранный раньше, а новый — нет.
    for _ in range(8):
        if all(r.scr.has(n) for n in names):
            break
        tapped = False
        for want in ('Show roots', 'Показать корневые папки', 'Downloads', 'Загрузки', 'Скачанные', 'matrix'):
            # Точное имя: «matrix» по подстроке попадало в файл «matrix-pdf.xlsx», и выбирался не тот файл.
            n = r.scr.find(want, exact=True)
            if n is not None:
                r.dev.tap_node(n); r.look(f'выбор файла: {want}'); tapped = True
                if r.scr.has(name):
                    break
        if not tapped:
            time.sleep(0.5); r.look('ждём окно выбора')
    if not many:
        r.tap(name, f'выбрать {name}', look=False)
        return
    r.tap(name, f'отметить {name}', long=True)
    for other in names[1:]:
        r.tap(other, f'отметить и {other}')
    # Кнопка выбора появляется в шапке не сразу после отметки — ждать её, а не смотреть один снимок.
    btn = [None]
    def found():
        d = r.dev.dump()
        btn[0] = next((n for n in (d.find(w, exact=True) for w in ('Select', 'Выбрать', 'SELECT', 'ВЫБРАТЬ')) if n is not None), None)
        return btn[0] is not None
    if until(found, 4, 0.3):
        r.dev.tap_node(btn[0])
        return
    r.steps.append({'что': 'кнопка выбора', 'ок': False, 'было': r.scr.texts()[:20], 'ждали': 'Select / Выбрать'})
    raise Fail()


def message_object(r, code, name):
    """Объект из сообщения о выезде (как в p_objects): «Поделиться» текстом → «Завести»; объект открыт."""
    import shlex
    msg = f'{code}. {name}\nг.Пример, ул.Ленина 1'
    sh(f"am start -a android.intent.action.SEND -t text/plain --es android.intent.extra.TEXT {shlex.quote(msg)} -n {PKG}/.MainActivity")
    until(lambda: r.dev.dump().has('Сообщение о выезде'), 8, 0.2); r.look('сообщение о выезде')
    r.tap('Завести', 'завести объект', exact=True)
    r.expect('объект открыт', has=['ул.Ленина 1', 'раздел документы'])   # лёжа плитка папки — ниже края, панель видна всегда
    return f'{ROOT}/{code} {name}'


def p_sheet(r):
    """
    Лист объекта в сводной (29.10.2026): книга «по листу на организацию» в «Документах» объекта с кодом 93.98 —
    лист «98. …» найден, карточка со счётом, «Завести папки» → ТС по госномеру, здание с помещениями и
    фасадом, участок; комментарий папки — из строки.
    """
    import shlex
    r.dev.launch(); r.look('главная')
    obj = message_object(r, MSG_CODE2, 'Matrix svod')
    adb('push', local(os.path.join(FIXTURES_LOCAL[0], 'matrix-svod.xlsx')), f'{obj}/Документы/matrix-svod.xlsx', check=True)
    r.back('на главный'); r.scroll_to(f'{MSG_CODE2} Matrix svod'); r.tap(f'{MSG_CODE2} Matrix svod', 'объект снова')   # открыли заново — лист перечитан
    r.expect('карточка листа', has=['лист объекта', 'ТС: 1 · зданий: 1 · участков: 1'])
    r.tap('завести из листа', 'завести папки', exact=True)
    r.expect('выбор — всё отмечено', has=['Завести (3)', 'Honda CR-V · 05KG005AC'])
    r.tap('Завести (3)', 'завести', exact=True)
    until(lambda: '05KG005AC' in sh('ls', shlex.quote(obj + '/Движимое')), 5, 0.2)
    made = {k: sh('ls', shlex.quote(obj + '/' + k)) for k in ('Движимое', 'Недвижимое', 'Недвижимое/Земельный участок')}
    # С 3.15 комментарий литера — поле «note» его файла параметров, а не «Комментарий.txt».
    note = sh('cat', shlex.quote(obj + '/Недвижимое/Admin building/Admin_building.json'))
    ok = '05KG005AC' in made['Движимое'] and 'Admin building' in made['Недвижимое'] and 'Plot' in made['Недвижимое/Земельный участок'] and 'Тип: нежилое' in note
    r.steps.append({'что': 'папки из листа с комментарием', 'ок': ok, 'было': {**made, 'комментарий': note[:120]}, 'ждали': 'ТС, здание, участок; «Тип: нежилое»'})
    if not ok:
        raise Fail()


def p_documents(r):
    """PDF в «Документах» объекта (29.10.2026): «Добавить документ» → системный выбор → плитка → страницы."""
    r.dev.launch(); r.look('главная')
    message_object(r, MSG_CODE3, 'Matrix docs')
    r.scroll_to('раздел документы'); r.tap('раздел документы', 'документы', exact=True)
    r.tap('добавить документ', 'добавить документ', exact=True)
    pick_file(r, 'matrix-doc.pdf', many=True)
    r.tap('Объект', 'к объекту', exact=True)   # раздел спрашивает, к чему документ (метки окна системе не видны)
    until(lambda: r.dev.dump().has('matrix-doc'), 6, 0.2); r.look('pdf лёг')
    r.expect('pdf в разделе', has=['matrix-doc'])
    r.tap('matrix-doc', 'открыть pdf')
    until(lambda: r.dev.dump().has('Страница 1'), 6, 0.2); r.look('страницы')
    r.expect('страницы pdf', has=['страницы pdf', 'Страница 1', '1 / 1'])
    # 30.10.2026: номер — панель с ползунком; двойное касание — увеличение (экран жив, номер на месте).
    r.tap('номер страницы', 'номер страницы', exact=True)
    r.expect('панель перехода', has=['Страница 1 из 1', 'Закрыть'])
    r.tap('Закрыть', 'закрыть панель', exact=True)
    n = r.scr.find('страницы pdf')
    x, y = (n.b[0] + n.b[2]) // 2, (n.b[1] + n.b[3]) // 2
    sh(f'input tap {x} {y}; sleep 0.08; input tap {x} {y}'); time.sleep(1.5); r.look('увеличено')
    r.expect('после увеличения', has=['1 / 1', 'Открыть в другом приложении'])
    # Тот же документ ещё раз — не копируется.
    r.back('в документы')
    # Тот же документ ещё раз и новый вместе: новый лёг (выбор сработал), тот же — не скопирован.
    r.tap('добавить документ', 'добавить тот же и новый', exact=True)
    pick_file(r, ['matrix-doc.pdf', 'matrix-doc2.pdf'], many=True)
    r.tap('Объект', 'к объекту', exact=True)
    until(lambda: r.dev.dump().has('matrix-doc2'), 6, 0.2); r.look('после повтора')
    r.expect('тот же не скопирован', has=['matrix-doc2'], lacks=['matrix-doc (2)'])


MSG_CODE4 = '93.96'
MSG_CODE5 = '93.95'
MSG_CODE6 = '93.94'
MSG_CODE7 = '93.93'


def p_params(r):
    """
    Параметры осмотра (3.15–3.16): литер — карточка «Параметры осмотра», вид «Квартира» открывает поля квартиры,
    JSON литера на диске; участок — сеть «Подведены» копией уходит в литер.
    """
    import shlex
    r.dev.launch(); r.look('главная')
    obj = message_object(r, MSG_CODE4, 'Matrix params')
    r.scroll_to('Недвижимое'); r.tap('Недвижимое', 'недвижимое', exact=True)
    r.tap('кнопка категории', 'литер', exact=True)
    r.type('LiterB', 'имя литера')
    confirm(r, 'Создать', 'создать литер')
    r.tap('карточка параметров', 'параметры литера', exact=True)
    r.expect('форма строения', has=['Параметры осмотра', 'Тип ОИ'])
    r.tap('поле: objKind', 'вид объекта', exact=True)
    r.tap('Квартира', 'квартира', exact=True)
    r.expect('поля квартиры', has=['Общие параметры квартиры', 'Этаж'])
    lit = f'{obj}/Недвижимое/LiterB'
    until(lambda: 'Квартира' in sh('cat', shlex.quote(lit + '/LiterB.json')), 4, 0.2)
    js = sh('cat', shlex.quote(lit + '/LiterB.json'))
    ok = '"objKind": "Квартира"' in js
    r.steps.append({'что': 'JSON литера', 'ок': ok, 'было': js[:200], 'ждали': 'objKind: Квартира'})
    if not ok:
        raise Fail()
    r.back('из параметров'); r.back('из литера')
    r.scroll_to('Земельный участок')   # лёжа над плитками — карточка «Сети для всех литеров»
    r.tap('Земельный участок', 'участок', exact=True)
    r.tap('карточка параметров', 'параметры участка', exact=True)
    r.scroll_to('поле: electricity')   # лёжа сети участка — ниже края
    r.tap('поле: electricity', 'электроснабжение', exact=True)
    r.tap('Подведены', 'подведены', exact=True)
    until(lambda: 'Подведены' in sh('cat', shlex.quote(lit + '/LiterB.json')), 4, 0.2); r.look('сеть перенесена')
    js = sh('cat', shlex.quote(lit + '/LiterB.json'))
    ok = '"electricity": "Подведены"' in js
    r.steps.append({'что': 'сеть участка — в литере', 'ок': ok, 'было': js[:200], 'ждали': 'electricity: Подведены'})
    if not ok:
        raise Fail()


def p_vehicle(r):
    """ТС (3.13–3.16): «Добавить ТС» по госномеру → параметры («Есть модуль: Да» открывает поля модуля) → PDF к ТС."""
    r.dev.launch(); r.look('главная')
    obj = message_object(r, MSG_CODE5, 'Matrix avto')
    r.scroll_to('Движимое'); r.tap('Движимое', 'движимое', exact=True)
    r.tap('кнопка категории', 'добавить тс', exact=True)
    r.type('01KG777ABC', 'госномер')
    confirm(r, 'Добавить', 'добавить тс')
    r.tap('карточка параметров', 'параметры тс', exact=True)
    r.expect('форма тс', has=['Регистрационный номер', '01KG777ABC', 'Пробег'], lacks=['Идентификационный номер (VIN)'])
    r.back('из параметров')
    r.tap('добавить документ', 'pdf к тс', exact=True)
    pick_file(r, 'matrix-doc.pdf', many=True)
    # У ТС документы — в его подпапке «Документы»: сканы не смешиваются со снимками ТС.
    until(lambda: r.dev.dump().has('раздел документы', True), 6, 0.2); r.look('документ у тс')
    r.scroll_to('раздел документы')
    r.tap('раздел документы', 'документы тс', exact=True)
    r.expect('документ у тс', has=['Документы: 1', 'matrix-doc'])


def p_heavy_books(r):
    """Тяжёлые книги Excel в просмотре (03.11.2026, падение на телефоне: нехватка памяти): 20 000 строк, 300 столбцов,
    длинный текст в ячейках — лист открывается, листается вбок и вниз, приложение живо."""
    r.dev.launch(); r.look('главная')
    obj = message_object(r, MSG_CODE6, 'Matrix books')
    for f in ('heavy-rows.xlsx', 'heavy-cols.xlsx', 'heavy-text.xlsx'):
        adb('push', local(os.path.join(FIXTURES_LOCAL[0], 'heavy', f)), f'{obj}/Документы/{f}', check=True)
    r.scroll_to('раздел документы'); r.tap('раздел документы', 'документы объекта', exact=True)
    r.expect('книги видны', has=['heavy-rows', 'heavy-cols', 'heavy-text'])
    for name in ('heavy-cols', 'heavy-rows', 'heavy-text'):
        r.tap(name, f'открыть {name}')
        until(lambda: r.dev.dump().has('Поле 1'), 30, 0.5); r.look(f'{name} открыт')
        r.expect(f'{name}: лист виден', has=['Поле 1'])
        W, H = r.dev.window()
        for _ in range(3):
            sh('input', 'swipe', str(W * 3 // 4), str(H // 2), str(W // 4), str(H // 2), '200')
            sh('input', 'swipe', str(W // 2), str(H * 3 // 4), str(W // 2), str(H // 4), '200')
        r.dev.still(); r.look(f'{name} пролистан')
        alive = sh('pidof', PKG).strip() != ''
        r.steps.append({'что': f'{name}: приложение живо', 'ок': alive, 'было': 'упало' if not alive else 'живо', 'ждали': 'живо'})
        if not alive:
            raise Fail()
        r.back(f'из {name}')


def p_formats(r):
    """Все форматы снимков и видео в просмотре (автор, 03.11.2026: «проверяем все форматы фото видео… Все должно работать
    идеально»): JPG, PNG, WebP, HEIC — экран снимка с картинкой; MP4 (H.264 и HEVC), MOV (HEVC, как у iPhone), 3GP, WebM,
    MKV — свой проигрыватель внутри приложения держится и не закрывается с ошибкой. Образцы — папка MATRIX_MEDIA
    (ffmpeg и пример HEIC): без неё путь не проходит, чтобы молча не засчитаться."""
    media = os.environ.get('MATRIX_MEDIA', '')
    names = sorted(f for f in os.listdir(media) if f.startswith('m-')) if media and os.path.isdir(media) else []
    r.steps.append({'что': 'образцы форматов', 'ок': len(names) >= 10, 'было': names, 'ждали': 'MATRIX_MEDIA: 10 и больше файлов m-*'})
    if len(names) < 10:
        raise Fail()
    r.dev.launch(); r.look('главная')
    obj = message_object(r, MSG_CODE7, 'Matrix media')
    place = f'{obj}/Недвижимое/Земельный участок'
    for f in names:
        adb('push', local(os.path.join(media, f)), f'{place}/{f}', check=True)
    shots = os.environ.get('MATRIX_SHOTS')
    def shot(n):
        if shots:
            sh('screencap', '-p', '/sdcard/matrix-shot.png'); adb('pull', '/sdcard/matrix-shot.png', local(os.path.join(shots, n + '.png')))
    r.scroll_to('Недвижимое'); r.tap('Недвижимое', 'недвижимое', exact=True)
    r.tap('Земельный участок', 'участок', exact=True)
    for f in names:
        video = f.rsplit('.', 1)[1] in ('mp4', 'mov', '3gp', 'webm', 'mkv')
        r.scroll_to(f)
        r.tap(f, f'открыть {f}', exact=True)
        time.sleep(3)
        if video:
            top = sh('dumpsys activity activities | grep topResumedActivity')
            ok = 'PlayerActivity' in top
            shot(f)
            r.steps.append({'что': f'{f}: играет внутри приложения', 'ок': ok, 'было': top.strip()[:160], 'ждали': 'PlayerActivity'})
            r.back(f'из {f}')
        else:
            # Нестандартный HEIC (пример libheif) системный декодер не берёт — тогда честное сообщение, а не чёрный экран.
            d = r.dev.dump()
            failed = d.has('снимок не показывается', True)
            ok = d.has('снимок: поворот', False) and (failed == ('libheif' in f))
            shot(f)
            r.steps.append({'что': f'{f}: открыт снимок', 'ок': ok, 'было': ('сообщение «не может показать»' if failed else 'картинка'), 'ждали': 'сообщение' if 'libheif' in f else 'картинка'})
            r.back(f'из {f}')
        alive = sh('pidof', PKG).strip() != ''
        if not ok or not alive:
            if not alive: r.steps.append({'что': 'приложение живо', 'ок': False, 'было': 'упало', 'ждали': 'живо'})
            raise Fail()


def p_instructions(r):
    """Инструкции (3.12.1): значок на главном → трансформатор → раздел «Шильдик» → памятка на весь экран."""
    r.dev.launch(); r.look('главная')
    r.tap('значок инструкции', 'инструкции', exact=True)
    r.expect('список', has=['Быстрый осмотр'])
    r.scroll_to('инструкция: transformator'); r.tap('инструкция: transformator', 'трансформатор', exact=True)
    r.expect('инструкция', has=['памятка', 'Подготовка'])
    r.tap('раздел: Шильдик', 'раздел шильдик', exact=True)
    r.expect('раздел', has=['Обязательно сфотографировать основной шильдик'])


def p_screens(r):
    stand_or_fresh(r)
    r.tap('Папки описи', 'папки описи')
    r.look('папки')
    for want in ('Поиск', 'Дерево папок'):
        n = r.scr.find(want)
        if n is not None:
            r.dev.tap_node(n); r.look(want)
            r.back(f'назад из «{want}»')


PATHS = {
    'поиск → карточка → назад': p_search_card,
    'осмотрено выделением и снять': p_mark_selection,
    'осмотрено в карточке и снять': p_mark_card,
    'поворот и тема не теряют поиск': p_rotate_theme,
    'столбцы: поправить и не сохранять': p_columns_cancel,
    'столбцы: не брать стоимость и вернуть': p_columns_save,
    'столбцы: лист не брать и вернуть': p_sheet_skip,
    'битый, PDF, без списка, повтор': p_bad_files,
    'замена чужой описью — спросить': p_replace_wrong,
    'замена и «вернуть прежний файл»': p_replace_restore,
    'папки: новая, переименовать, комментарий': p_folder_dialogs,
    'камера: «0.6↗» — системная камера': p_system_wide,
    'экраны: папки, поиск, дерево': p_screens,
    'съёмка: кадры в папке, галерея цела': p_camera,
    'поделиться: все инвентарники, в предмет': p_share_place,
    'выгрузка: отчёты всех видов и диагностика наружу': p_export_out,
    'камера: формат, сетка, настройки помнятся': p_camera_settings,
    'видео: запись в папку предмета': p_video,
    'документ: сканер без падения': p_document,
    'камера: нагрузка — случайные действия без падений': p_camera_stress,
    'выгрузки: архив остаётся, частями, удалить': p_exports,
    'объект: сообщение, перечень, литер': p_objects,
    'объект: лист в сводной — завести папки': p_sheet,
    'объект: PDF в документах — открыть': p_documents,
    'просмотр: тяжёлые книги Excel': p_heavy_books,
    'просмотр: все форматы снимков и видео': p_formats,
    'параметры: литер-квартира, сеть участка в литер': p_params,
    'тс: госномер, модуль, PDF': p_vehicle,
    'инструкции: раздел и памятка': p_instructions,
}


FIXTURES_LOCAL = ['']   # папка с файлами стенда на этой машине (путь объекта кладёт перечень прямо в объект)


def fixtures():
    """Файлы для загрузки — openpyxl, как tools/make_templates.py."""
    import openpyxl
    d = tempfile.mkdtemp()

    def book(name, sheets):
        wb = openpyxl.Workbook(); wb.remove(wb.active)
        for title, rows in sheets:
            ws = wb.create_sheet(title)
            for r in rows:
                ws.append(r)
        wb.save(os.path.join(d, name))
    book('matrix-good.xlsx', [('Сводка', [['Объект', 'Матрица'], ['Предметов', 12]]),
                              ('Опись', [['№ п/п', 'Наименование', 'Инв. номер', 'Стоимость']] +
                               [[i, f'Шкаф металлический {i}', f'МТ-{100 + i}', 1000 * i] for i in range(1, 13)])])
    book('matrix-other.xlsx', [('Опись', [['№', 'Наименование', 'Инв. номер']] + [[i, f'Кресло {i}', f'ДР-{i}'] for i in range(1, 6)])])
    book('matrix-list.xlsx', [('Buildings', [['List of buildings'], ['N', 'Building', 'Address', 'Area'],
                                              [1, 'Main block', 'Lenina 10', 2450], [2, 'Boiler house', 'Lenina 10a', 180], [3, 'Store', 'Chui 5', 600]])])
    FIXTURES_LOCAL[0] = d
    head = ['N', 'Объект', 'Адрес', 'ЕНИ', 'Тип']
    book('matrix-svod.xlsx', [('97. Other', [head, [1, 'Other', 'x', '1', 'нежилое']]),
                              ('98. Matrix svod', [head, ['', 'Honda CR-V', '', '05KG005AC', 'ТС'],
                                                   [1, 'Admin building', 'Lenina 64', '4050200010699', 'нежилое'],
                                                   [2, 'Plot', 'Mira 1', '4050300012020', 'несельхоз']])])
    # Настоящий PDF в одну страницу (PdfRenderer читает только целый файл: таблица xref со смещениями).
    objs = [b'<< /Type /Catalog /Pages 2 0 R >>', b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>']
    pdf = bytearray(b'%PDF-1.4\n'); offs = []
    for i, o in enumerate(objs, 1):
        offs.append(len(pdf)); pdf += b'%d 0 obj\n' % i + o + b'\nendobj\n'
    x = len(pdf)
    pdf += b'xref\n0 %d\n0000000000 65535 f \n' % (len(objs) + 1) + b''.join(b'%010d 00000 n \n' % o for o in offs)
    pdf += b'trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objs) + 1, x)
    open(os.path.join(d, 'matrix-doc.pdf'), 'wb').write(bytes(pdf))
    # Второй PDF — тот же, но с другим хвостом комментария: другой файл для проверки «тот же не копируется».
    open(os.path.join(d, 'matrix-doc2.pdf'), 'wb').write(bytes(pdf) + b'%matrix-doc2\n')
    book('matrix-act.xlsx', [('Акт', [['Акт приёма-передачи'], ['Комиссия в составе:'], ['Иванов И. И.'], ['Петров П. П.'], ['Подписи']])])
    # Тяжёлые книги для просмотра (p_heavy_books): только запись построчно — иначе сам стенд ест память.
    def heavy(name, rows, cols, long=False):
        wb = openpyxl.Workbook(write_only=True); ws = wb.create_sheet('Перечень')
        ws.append(['№'] + [f'Поле {c}' for c in range(1, cols)])
        for i in range(rows):
            ws.append([i + 1] + [('Длинное описание здания ' * 60) if long and c == 2 else f'Здание {i}-{c} ул. Ленина {i % 200}' for c in range(1, cols)])
        wb.save(os.path.join(d, name))
    heavy('heavy-rows.xlsx', 20000, 25)
    heavy('heavy-cols.xlsx', 2000, 300)
    heavy('heavy-text.xlsx', 3000, 12, long=True)
    # В «Загрузки» стенда не кладутся: длинный список сбивал выделение в системном выборе файлов.
    os.makedirs(os.path.join(d, 'heavy'), exist_ok=True)
    for f in ('heavy-rows.xlsx', 'heavy-cols.xlsx', 'heavy-text.xlsx'):
        os.replace(os.path.join(d, f), os.path.join(d, 'heavy', f))
    good = open(os.path.join(d, 'matrix-good.xlsx'), 'rb').read()
    open(os.path.join(d, 'matrix-broken.xlsx'), 'wb').write(good[:len(good) // 2])
    open(os.path.join(d, 'matrix-pdf.xlsx'), 'wb').write(b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<<>>\nendobj\n')
    sh('rm', '-rf', FIXTURES); sh('mkdir', '-p', FIXTURES)
    files = [f for f in os.listdir(d) if os.path.isfile(os.path.join(d, f))]
    for f in files:
        adb('push', local(os.path.join(d, f)), f'{FIXTURES}/{f}', check=True)
    # Видно системному выбору файлов.
    for f in files:
        sh('am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', f'file://{FIXTURES}/{f}')


def cleanup():
    """Описи, заведённые путями, — прочь (и журнал «Осмотра» о них не помнит: имена новые каждый прогон)."""
    # adb shell склеивает аргументы в одну строку для оболочки устройства — команда целиком.
    sh(f"rm -rf '{ROOT}'/matrix-* '{ROOT}/{MSG_CODE} '* '{ROOT}/{MSG_CODE2} '* '{ROOT}/{MSG_CODE3} '* '{ROOT}/{MSG_CODE4} '* '{ROOT}/{MSG_CODE5} '* '{ROOT}/{MSG_CODE6} '* '{ROOT}/{MSG_CODE7} '*")


def main():
    args = sys.argv[1:]

    def key(name, default):
        return args[args.index(name) + 1] if name in args else default
    rots = [int(x) for x in key('--ориентации', '0,1').split(',')]
    sizes = key('--размеры', 'телефон,малый,планшет').split(',')
    themes = key('--темы', 'light,dark').split(',')
    fonts = [float(x) for x in key('--шрифты', '1.0,1.3').split(',')]
    only = key('--пути', '')
    # Гоняем только затронутое правкой (автор, 02.11.2026: «Не надо на 1 правку всю матрицу гонять»).
    # Вся матрица — полчаса эмулятора и его утечка: только осознанно, ключом.
    if not only and '--всё' not in args:
        sys.exit('Укажите затронутые пути: --пути "часть имени,часть имени". Вся матрица — ключом --всё.')
    paths = {k: v for k, v in PATHS.items() if not only or any(o in k for o in only.split(','))}
    combos = []
    for f in fonts:
        for s in sizes:
            if f != 1.0 and s != 'телефон' and '--шрифты' not in args:
                continue
            for rot in rots:
                for t in themes:
                    combos.append({'rot': rot, 'size': s, 'theme': t, 'font': f, 'dark': t == 'dark'})
    # Несколько эмуляторов (--устройства emulator-5554,emulator-5556): сочетания делятся между ними,
    # каждое целиком на одном (размер, поворот, тема — настройки устройства).
    serials = [x for x in key('--устройства', os.environ.get('ANDROID_SERIAL', '')).split(',') if x] or [None]
    # Работа делится по путям, а не по сочетаниям: при одном сочетании (быстрая проверка) второй эмулятор
    # иначе простаивал. Устройство меняет размер, поворот, тему и шрифт, только когда сочетание следующего
    # пути другое (очередь — по сочетаниям, так что смен немного).
    # Долгие пути (камера: открытие и перезапуски камеры эмулятора по ~5 с) — первыми: иначе последний
    # долгий путь достраивал бы один эмулятор, пока другой ждёт.
    slow = ('камера', 'съёмка', 'видео', 'документ', 'выгрузк')
    queue = [(c, name, fn) for c in combos for name, fn in sorted(paths.items(), key=lambda kv: not kv[0].startswith(slow))]
    lock = threading.Lock()
    runs = []

    def worker(serial):
        _tls.serial = serial
        tag = f'[{serial}] ' if len(serials) > 1 else ''
        dev = Device()
        fixtures()
        cur = None
        try:
            while True:
                with lock:
                    if not queue:
                        return
                    ctx, name, fn = queue.pop(0)
                label = f"{'лёжа' if ctx['rot'] else 'стоя'}, {ctx['size']}, {ctx['theme']}, шрифт {ctx['font']}"
                mem = emu_memory() if len(serials) == 1 else None
                if mem and (mem[0] > EMU_LEAK_MIB or mem[1] > EMU_PRIV_MIB):
                    sys.stderr.write(f"{tag}  эмулятор держит {mem[0]} МиБ видеопамяти и {mem[1]} МиБ оперативной — перезапуск\n")
                    dev.helper_stop()
                    emu_restart(mem[2])
                    dev = Device()
                    fixtures()
                    cur = None
                if ctx is not cur:
                    sys.stderr.write(tag + label + '\n')
                    dev.size(SIZES[ctx['size']]); dev.rotate(ctx['rot']); dev.theme(ctx['dark']); dev.font(ctx['font'])
                    cur = ctx
                try:
                    cleanup()
                    dev.mark_crashes()
                except Exception:  # noqa: BLE001 — устройство подвисло: путь сам упадёт с причиной
                    pass
                r = Run(dev, name)
                ok = True
                t0 = time.time()
                try:
                    fn(r, ctx) if fn.__code__.co_argcount == 2 else fn(r)
                except Fail:
                    ok = False
                    if os.environ.get('MATRIX_SHOTS'):   # разбор: что было на экране в момент провала
                        with open(os.path.join(os.environ['MATRIX_SHOTS'], re.sub(r'\W+', '-', name)[:40] + f"-{ctx['rot']}.png"), 'wb') as f:
                            subprocess.run([ADB, '-s', serial, 'exec-out', 'screencap', '-p'], stdout=f, timeout=30)
                except Exception as e:  # noqa: BLE001 — сам прогон упал: это тоже ✗ с причиной
                    ok = False
                    r.steps.append({'что': 'прогон', 'ок': False, 'было': repr(e)[:400], 'ждали': 'без исключений'})
                with lock:
                    runs.append({'сочетание': label, 'путь': name, 'ок': ok, 'шаги': r.steps, 'флаги': r.flags, 'секунд': round(time.time() - t0)})
                    sys.stderr.write(f"{tag}  {'✓' if ok else '✗'} {name}  флагов {len(r.flags)}  {time.time() - t0:.0f} с\n")
                    # Отчёт потоком (автор, 29.10.2026: «Лучше писать отчёт потоково»): не прошло — шаг и что было
                    # сразу под строкой пути, флаги — тоже; таблица в --md, как прежде, в конце.
                    for st in (x for x in r.steps if not x['ок']):
                        sys.stderr.write(f"{tag}      шаг «{st['что']}»: было {json.dumps(st['было'], ensure_ascii=False)[:500]}, ждали {json.dumps(st['ждали'], ensure_ascii=False)[:200]}\n")
                    for fl in r.flags[:5]:
                        sys.stderr.write(f"{tag}      флаг {fl['флаг']}: {fl['подробно']} · {fl['шаг']}\n")
                    sys.stderr.flush()
                # Вернуть сочетание, если путь его сменил и упал на полдороге. Устройство не ответило —
                # следующий путь начнётся с запуска приложения; поток эмулятора не останавливать.
                try:
                    dev.rotate(ctx['rot']); dev.theme(ctx['dark'])
                except Exception:  # noqa: BLE001
                    pass
        finally:
            cleanup()
            dev.helper_stop()
            sh('rm', '-rf', FIXTURES)
            dev.size(None); dev.rotate(0); dev.font(1.0)
            sh('settings', 'put', 'system', 'accelerometer_rotation', '1')

    t_all = time.time()
    threads = [threading.Thread(target=worker, args=(x,)) for x in serials]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    sys.stderr.write(f'устройств {len(serials)}, прогонов {len(runs)}, всего {time.time() - t_all:.0f} с\n')
    order = {(f"{'лёжа' if c['rot'] else 'стоя'}, {c['size']}, {c['theme']}, шрифт {c['font']}", n): i
             for i, (c, n) in enumerate((c, n) for c in combos for n in paths)}
    runs.sort(key=lambda r: order.get((r['сочетание'], r['путь']), 0))

    labels = list(dict.fromkeys(r['сочетание'] for r in runs))
    names = list(dict.fromkeys(r['путь'] for r in runs))
    out = ['# Матрица путей «Осмотра»', '',
           '✓ — путь прошёл, ✗ — нет; число — общие флаги раскладки на экранах пути (подробности ниже).', '',
           '| путь | ' + ' | '.join(labels) + ' |', '|---|' + '---|' * len(labels)]
    for n in names:
        cells = []
        for l in labels:
            r = next((x for x in runs if x['путь'] == n and x['сочетание'] == l), None)
            cells.append('' if r is None else ('✓' if r['ок'] else '✗') + (f" {len(r['флаги'])}" if r['флаги'] else ''))
        out.append(f'| {n} | ' + ' | '.join(cells) + ' |')
    bad = [r for r in runs if not r['ок']]
    if bad:
        out += ['', '## Не прошло', '']
        for r in bad:
            out.append(f"### {r['путь']} — {r['сочетание']}")
            for s in r['шаги']:
                if not s['ок']:
                    out.append(f"- {s['что']}: было `{json.dumps(s['было'], ensure_ascii=False)[:600]}`, ждали `{json.dumps(s['ждали'], ensure_ascii=False)}`")
            out.append('')
    flags = {}
    for r in runs:
        for f in r['флаги']:
            flags.setdefault((f['флаг'], f['подробно']), set()).add(f"{r['сочетание']} · {f['шаг']}")
    if flags:
        out += ['', '## Флаги раскладки', '', '| флаг | что | где (сочетание · шаг) |', '|---|---|---|']
        for (fl, det), where in sorted(flags.items()):
            w = sorted(where)
            out.append(f"| **{fl}** | {det} | {'; '.join(w[:3])}{f' и ещё {len(w) - 3}' if len(w) > 3 else ''} |")
    text = '\n'.join(out) + '\n'
    md = key('--md', '')
    if md:
        open(md, 'w').write(text)
    else:
        sys.stdout.write(text)
    js = key('--json', '')
    if js:
        json.dump(runs, open(js, 'w'), ensure_ascii=False, indent=1)
    sys.stderr.write(f'путей не прошло: {len(bad)}, флагов раскладки: {len(flags)}\n')
    sys.exit(1 if bad or flags else 0)


if __name__ == '__main__':
    main()
