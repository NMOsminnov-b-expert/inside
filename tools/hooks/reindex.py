# -*- coding: utf-8 -*-
"""Обновление обоих поисков проекта — после коммита (tools/hooks/post-commit)
и по пункту «Ещё» → «Обновить граф кода и связи по смыслу» программы «Граф
проекта».

Просьбы пользователя 30.09.2026: «После коммита запускалась чтобы
индексация» и «В приложении графа должны быть видны прогрессбары для обоих
индексов со статусами. Иначе не видно, актуальная версия у нас или нет».

Порядок:
  CodeGraph  — codegraph sync, затем выгрузка tools/knowledge/code_export.py;
  по смыслу  — дообновление индекса semsearch (только изменённые файлы, по
               хешу содержимого), затем tools/knowledge/semantic_export.py;
  пробные    — индексы других моделей рядом с основным (trials.json в папке
               semsearch, решение пользователя 01.10.2026): отдельным фоновым
               процессом (ключ --trials) со своим замком — их полная сборка
               идёт часами, и основной не должен её ждать.

Ход пишется в .graf/index-status.json (вне git) — его читает программа:

  {"codegraph": {...}, "semsearch": {...}, "trial-<key>": {...}}, у каждого:
    state    running | done | failed | skipped
    stage    что идёт сейчас (подпись для человека)
    commit   коммит, на котором прогон начат; индекс актуален, если он
             совпадает с текущим HEAD
    started, finished — время ISO; pid — процесс прогона (running без
             живого процесса — прогон оборвался)
    files, chunks — у поиска по смыслу: сколько файлов и фрагментов обработано
    progress — у поиска по смыслу: доля готового 0..1 (null — сервер её не
             сообщает); eta — ориентировочное время окончания ISO (null —
             оценки ещё нет: первые минуты скорость не установилась)
    note     последняя строка вывода при ошибке

Два процесса пишут файл вперемешку, поэтому каждый перечитывает его и меняет
только свои ключи.

Индексы — независимо (07.10.2026, «У нас индексы отстали. Надо бы добавить
возможность обновления этого дела через приложение графа»): у каждого свой
процесс и свой замок. Раньше оба шли одним прогоном, и пересчёт по смыслу,
который идёт часами, держал CodeGraph, которому нужны секунды. После коммита
CodeGraph обновляется в этом процессе, поиск по смыслу — отдельным фоновым.

Один прогон каждого рода за раз: коммит во время прогона оставляет отметку
(.graf/reindex-code.again, reindex-sem.again, trials.again), и прогон
повторяется по окончании. Журналы — .graf/reindex-code.log, reindex-sem.log,
trials.log.

    python tools/hooks/reindex.py            # оба: CodeGraph здесь, по смыслу — фоном
    python tools/hooks/reindex.py --code     # только CodeGraph
    python tools/hooks/reindex.py --sem      # только по смыслу (и затем пробные)
    python tools/hooks/reindex.py --stop     # остановить идущие прогоны (--stop code | sem)
    python tools/hooks/reindex.py --trials   # пробные индексы
    python tools/hooks/reindex.py --sem --root "C:/vs code/APCS"   # другой проект

Другой проект мультиграфа (просьба пользователя 14.10.2026 «подтяни
телеметрию в приложение» — ход индекса APCS в программе): --root — его папка;
ход пишется в его .graf/index-status.json, который программа читает, когда
открыт этот граф; проект semsearch — имя из его .codebase-mcp/config.json;
выгрузки — те же сценарии этого репозитория с GRAF_ROOT; пробных индексов
у других проектов нет.
"""
import ctypes, datetime, io, json, os, pathlib, re, subprocess, sys

HOME = pathlib.Path(__file__).resolve().parents[2]


def _root():
    if '--root' in sys.argv:
        i = sys.argv.index('--root')
        if i + 1 < len(sys.argv):
            return pathlib.Path(sys.argv[i + 1]).resolve()
    return HOME


ROOT = _root()
FOREIGN = ROOT != HOME
ROOT_ARGS = ['--root', str(ROOT)] if FOREIGN else []


# Индекс по смыслу проекта — inside-v2 (15.10.2026): нарезка по смысловым
# границам и готовые векторы для неизменённых фрагментов (запись графа
# indeks-po-smyslu-pereschityvat-tolko-izmenennye-fragmenty). С 30.10.2026 (аудит
# настроек) поиск Claude Code и выгрузка связей по смыслу читают inside-v2.
# Выгрузка идёт под Python semsearch и читает граф из PostgreSQL — в том
# окружении нужен psycopg (ставится uv из %LOCALAPPDATA%\semsearch\uv).
HOME_SEM_PROJECT = 'inside-v2'


def _project():
    if not FOREIGN:
        return HOME_SEM_PROJECT
    try:
        return json.loads((ROOT / '.codebase-mcp' / 'config.json').read_text(encoding='utf-8'))['project']['name']
    except (OSError, ValueError, KeyError):
        return ROOT.name.lower()


PROJECT = _project()
G = ROOT / '.graf'
STATUS = G / 'index-status.json'

LOCAL = pathlib.Path(os.environ.get('LOCALAPPDATA', ''))
CG = LOCAL / 'codegraph' / 'current' / 'bin' / 'codegraph.cmd'
SPY = LOCAL / 'semsearch' / 'src' / 'codebase-mcp' / '.venv' / 'Scripts' / 'python.exe'
SCLIENT = LOCAL / 'semsearch' / 'client.py'
# PostgreSQL и Ollama живут, только пока нужны: svc.py поднимает их перед
# индексом и гасит после, если нет потребителей — сервера MCP Claude Code или
# идущей индексации (просьба пользователя 30.09.2026 «накладные расходы
# оптимизировать по-максимуму»).
SVC = LOCAL / 'semsearch' / 'svc.py'
# Пробные индексы рядом с основным (решение пользователя 01.10.2026: «основной
# индекс не сносим. Рядом поднимаем эти 2. Обрабатывать будут по очереди»).
# У каждого своя база (свой project), модель, размерность, потоки (основной —
# 1 поток, .env сервера; пробные — по trials.json) и контекст модели.
TRIALS = LOCAL / 'semsearch' / 'trials.json'

# Python на localhost ходит через корпоративный прокси, если не сказать иначе.
ENV = dict(os.environ, NO_PROXY='127.0.0.1,localhost', no_proxy='127.0.0.1,localhost', PYTHONIOENCODING='utf-8',
           **({'GRAF_ROOT': str(ROOT), 'GRAF_SEM_PROJECT': PROJECT} if FOREIGN else {}))
HIDDEN = 0x08000000 if os.name == 'nt' else 0  # CREATE_NO_WINDOW
GROUP = 0x00000200 if os.name == 'nt' else 0   # CREATE_NEW_PROCESS_GROUP

log = None


def now():
    return datetime.datetime.now().isoformat(timespec='seconds')


def put(key, **kw):
    """Обновить свой ключ в файле состояния, не трогая чужие."""
    try:
        state = json.loads(STATUS.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        state = {}
    state.setdefault(key, {}).update(kw)
    tmp = STATUS.with_name('%s.%d.tmp' % (STATUS.name, os.getpid()))
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding='utf-8')
    for _ in range(20):
        try:
            os.replace(tmp, STATUS)
            return
        except PermissionError:  # файл читает программа — подождать
            import time
            time.sleep(0.1)


def head():
    r = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=ROOT, capture_output=True, text=True, creationflags=HIDDEN)
    return r.stdout.strip()


def alive(pid):
    if os.name != 'nt':
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False
    h = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
    if not h:
        return False
    code = ctypes.c_ulong()
    ctypes.windll.kernel32.GetExitCodeProcess(h, ctypes.byref(code))
    ctypes.windll.kernel32.CloseHandle(h)
    return code.value == 259  # STILL_ACTIVE


def take_lock(lock, again):
    try:
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        try:
            pid = int(lock.read_text().strip() or 0)
        except (OSError, ValueError):
            pid = 0
        if pid and alive(pid):
            again.write_text('')
            return False
        lock.unlink(missing_ok=True)  # прогон оборвался — замок ничей
        return take_lock(lock, again)
    os.write(fd, str(os.getpid()).encode())
    os.close(fd)
    return True


def run(cmd, on_line=None, env=None):
    """Запустить, вывод — в журнал; вернуть (код, последняя строка)."""
    log.write('$ %s\n' % ' '.join(map(str, cmd)))
    log.flush()
    p = subprocess.Popen([str(c) for c in cmd], cwd=ROOT, env=dict(ENV, **(env or {})), stdout=subprocess.PIPE,
                         stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace', creationflags=HIDDEN)
    last = ''
    for line in p.stdout:
        log.write(line)
        log.flush()
        if line.strip():
            last = line.strip()
        if on_line:
            on_line(line)
    return p.wait(), last


def codegraph(commit):
    put('codegraph', state='running', stage='обновление индекса', commit=commit, started=now(), finished=None,
        pid=os.getpid(), note='')
    exe = CG if CG.exists() else 'codegraph'
    code, last = run(['cmd', '/c', exe, 'sync'] if os.name == 'nt' else [exe, 'sync'])
    if code:
        return put('codegraph', state='failed', finished=now(), note=last)
    put('codegraph', stage='выгрузка для программы')
    code, last = run([sys.executable, HOME / 'tools' / 'knowledge' / 'code_export.py'])
    put('codegraph', state='done' if code == 0 else 'failed', stage='', finished=now(), note='' if code == 0 else last)


PROGRESS = re.compile(r'\b(pending|running|completed|failed|cancelled)\s+файлов\s+(\S+)\s+фрагментов\s+(\S+)')
SHARE = re.compile(r'\bprogress\s+([01](?:\.\d+)?)')

# Время окончания (просьба пользователя 12.10.2026 «добавь ожидаемое время
# завершения индексации для qwen»; запись графа graf-vremya-okonchaniya-
# obnovleniya-indeksa): доля готового сообщает индексатор semsearch, скорость
# — по скользящему окну ETA_WINDOW секунд, чтобы цифра не скакала от пачки
# к пачке; раньше ETA_SETTLE секунд хода оценки нет — скорость не установилась.
ETA_WINDOW = 600
ETA_SETTLE = 45


def eta_of(samples):
    """samples — [(время, доля)]; вернуть (секунд осталось, время окончания ISO) или (None, None)."""
    if len(samples) < 2:
        return None, None
    (t0, f0), (t1, f1) = samples[0], samples[-1]
    if t1 - t0 < ETA_SETTLE or f1 <= f0:
        return None, None
    left = (1 - f1) * (t1 - t0) / (f1 - f0)
    end = datetime.datetime.now() + datetime.timedelta(seconds=left)
    return int(left), end.isoformat(timespec='seconds')


def index_project(key, project, env=None):
    """Дообновить индекс проекта semsearch; ход — в состоянии под key. True — удалось."""
    import time
    last_state = ['']
    samples = []
    put(key, progress=None, eta=None)

    def seen(line):
        m = PROGRESS.search(line)
        if m:
            last_state[0] = m.group(1)
            f, c = (int(x) if x.isdigit() else 0 for x in m.group(2, 3))
            share = SHARE.search(line)
            if not share:
                return put(key, files=f, chunks=c)
            t, frac = time.time(), float(share.group(1))
            samples.append((t, frac))
            while len(samples) > 2 and samples[1][0] < t - ETA_WINDOW:
                samples.pop(0)
            _, end = eta_of(samples)
            put(key, files=f, chunks=c, progress=frac, eta=end)

    code, last = run([SPY, SCLIENT, 'index', ROOT.as_posix(), project], seen, env)
    if code or last_state[0] != 'completed':
        put(key, state='failed', finished=now(), note=last)
        return False
    return True


def services_up(key):
    if SVC.exists():
        code, _ = run([SPY, SVC, 'up'])
        if code:
            put(key, state='failed', finished=now(), note='база или модель не поднялись')
            return False
    return True


def services_down():
    if SVC.exists():
        run([SPY, SVC, 'down'])


# Индексация — своей Ollama на 3 потоках с самым низким приоритетом; поиск
# (сервер MCP, программа «Граф проекта») — основной на 1 потоке (решение
# пользователя 02.10.2026: «3 потока на сервер индексации и 1 на поиск. Надо
# разделить ресурсы. Индексация не должна тормозить работу»; svc.py, up-index).
INDEX_OLLAMA = {'OLLAMA_BASE_URL': 'http://127.0.0.1:11435', 'OLLAMA_NUM_THREAD': '3'}


def semsearch(commit):
    if not SPY.exists() or not SCLIENT.exists():
        return put('semsearch', state='skipped', stage='', commit='', finished=now(), note='поиск по смыслу не установлен')
    put('semsearch', state='running', stage='запуск базы и модели', commit=commit, started=now(), finished=None,
        pid=os.getpid(), files=0, chunks=0, note='')
    if SVC.exists():
        code, _ = run([SPY, SVC, 'up-index'])
        if code:
            return put('semsearch', state='failed', finished=now(), note='база или модель индексации не поднялись')
    try:
        put('semsearch', stage='дообновление индекса')
        if not index_project('semsearch', PROJECT, INDEX_OLLAMA):
            return
        put('semsearch', stage='выгрузка для программы')
        code, last = run([SPY, HOME / 'tools' / 'knowledge' / 'semantic_export.py'])
        put('semsearch', state='done' if code == 0 else 'failed', stage='', finished=now(), note='' if code == 0 else last)
    finally:
        if SVC.exists():
            run([SPY, SVC, 'down-index'])
        services_down()


def trial_items():
    try:
        return json.loads(TRIALS.read_text(encoding='utf-8')).get('trials', [])
    except (OSError, ValueError):
        return []


def trials(commit):
    for t in trial_items():
        put('trial-' + t['key'], state='queued', stage='в очереди', label=t.get('label', t['key']), note='')
    for t in trial_items():
        key = 'trial-' + t['key']
        put(key, state='running', stage='дообновление индекса', label=t.get('label', t['key']), model=t['model'],
            commit=commit, started=now(), finished=None, pid=os.getpid(), files=0, chunks=0, note='')
        if not services_up(key):
            continue
        env = {'OLLAMA_EMBEDDING_MODEL': t['model'], 'EMBEDDING_DIM': str(t['dim']),
               'EMBED_QUERY_PREFIX': t.get('prefix', ''), 'OLLAMA_NUM_THREAD': str(t.get('threads', 3)),
               'OLLAMA_NUM_CTX': str(t.get('ctx', 1024))}
        try:
            if index_project(key, t['project'], env):
                put(key, state='done', stage='', finished=now())
        finally:
            services_down()


def start_trials():
    """Пробные — отдельным скрытым процессом: основной прогон их не ждёт."""
    if FOREIGN or not trial_items():
        return
    subprocess.Popen([sys.executable, str(pathlib.Path(__file__).resolve()), '--trials'], cwd=ROOT,
                     stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                     creationflags=HIDDEN | GROUP)


def loop(name, work):
    global log
    lock, again, path = G / (name + '.lock'), G / (name + '.again'), G / (name + '.log')
    if not take_lock(lock, again):
        return
    try:
        while True:
            again.unlink(missing_ok=True)
            commit = head()
            with io.open(path, 'w', encoding='utf-8') as log:
                log.write('==== %s, коммит %s\n' % (now(), commit))
                work(commit)
                log.write('DONE %s\n' % now())
            # Пока шёл прогон, мог появиться коммит: у основного — отметка от
            # хука, у пробных — сравнение с HEAD (хук их не будит, их будит
            # основной прогон, а он уже прошёл).
            if not again.exists() and head() == commit:
                break
    finally:
        lock.unlink(missing_ok=True)


def spawn(flag):
    """Прогон отдельным скрытым процессом: вызвавший его не ждёт."""
    subprocess.Popen([sys.executable, str(pathlib.Path(__file__).resolve()), flag, *ROOT_ARGS], cwd=ROOT,
                     stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                     creationflags=HIDDEN | GROUP)


def stop(which):
    """Остановить идущие прогоны вместе с дочерними процессами (клиент и сервер
    semsearch, codegraph). Прогон, остановленный посреди, помечается ошибкой с
    пометкой «остановлено» — следующий запуск начнёт его заново; индекс по смыслу
    дообновляется по хешу содержимого, сделанное не теряется."""
    global log
    names = {'code': ['reindex-code'], 'sem': ['reindex-sem', 'reindex']}
    keys = {'code': ['codegraph'], 'sem': ['semsearch']}
    for w in (['code', 'sem'] if which == 'all' else [which]):
        for name in names[w]:
            lock = G / (name + '.lock')
            try:
                pid = int(lock.read_text().strip() or 0)
            except (OSError, ValueError):
                pid = 0
            if pid and alive(pid):
                if os.name == 'nt':
                    subprocess.run(['taskkill', '/PID', str(pid), '/T', '/F'], capture_output=True, creationflags=HIDDEN)
                else:
                    os.kill(pid, 9)
            lock.unlink(missing_ok=True)
            (G / (name + '.again')).unlink(missing_ok=True)
        for key in keys[w]:
            state = json.loads(STATUS.read_text(encoding='utf-8')).get(key, {}) if STATUS.exists() else {}
            if state.get('state') == 'running':
                put(key, state='failed', stage='', finished=now(), note='остановлено')
        if w == 'sem' and SVC.exists():
            with io.open(G / 'reindex-sem.log', 'a', encoding='utf-8') as log:
                log.write('==== %s, остановлено\n' % now())
                run([SPY, SVC, 'down-index'])
                services_down()


def main():
    G.mkdir(exist_ok=True)
    if '--stop' in sys.argv:
        rest = sys.argv[sys.argv.index('--stop') + 1:]
        stop(rest[0] if rest and rest[0] in ('code', 'sem') else 'all')
        return 0
    if '--trials' in sys.argv:
        loop('trials', trials)
        return 0
    if '--sem' in sys.argv:
        loop('reindex-sem', semsearch)
        start_trials()
        return 0
    if '--code' not in sys.argv:
        spawn('--sem')
    loop('reindex-code', codegraph)
    return 0


if __name__ == '__main__':
    sys.exit(main())
