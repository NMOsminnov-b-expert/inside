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
               хешу содержимого), затем tools/knowledge/semantic_export.py.

Ход пишется в .graf/index-status.json (вне git) — его читает программа:

  {"codegraph": {...}, "semsearch": {...}}, у каждого:
    state    running | done | failed | skipped
    stage    что идёт сейчас (подпись для человека)
    commit   коммит, на котором прогон начат; индекс актуален, если он
             совпадает с текущим HEAD
    started, finished — время ISO; pid — процесс прогона (running без
             живого процесса — прогон оборвался)
    files, chunks — у semsearch: сколько файлов и фрагментов обработано
    note     последняя строка вывода при ошибке

Один прогон за раз: коммит во время прогона оставляет .graf/reindex.again,
и прогон повторяется по окончании. Журнал — .graf/reindex.log.

    python tools/hooks/reindex.py
"""
import ctypes, datetime, io, json, os, pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
G = ROOT / '.graf'
STATUS = G / 'index-status.json'
LOCK = G / 'reindex.lock'
AGAIN = G / 'reindex.again'
LOG = G / 'reindex.log'

LOCAL = pathlib.Path(os.environ.get('LOCALAPPDATA', ''))
CG = LOCAL / 'codegraph' / 'current' / 'bin' / 'codegraph.cmd'
SPY = LOCAL / 'semsearch' / 'src' / 'codebase-mcp' / '.venv' / 'Scripts' / 'python.exe'
SCLIENT = LOCAL / 'semsearch' / 'client.py'
# PostgreSQL и Ollama живут, только пока нужны: svc.py поднимает их перед
# индексом и гасит после, если нет сервера MCP Claude Code (просьба
# пользователя 30.09.2026 «накладные расходы оптимизировать по-максимуму»).
SVC = LOCAL / 'semsearch' / 'svc.py'

# Python на localhost ходит через корпоративный прокси, если не сказать иначе.
ENV = dict(os.environ, NO_PROXY='127.0.0.1,localhost', no_proxy='127.0.0.1,localhost', PYTHONIOENCODING='utf-8')
HIDDEN = 0x08000000 if os.name == 'nt' else 0  # CREATE_NO_WINDOW

state = {}
log = None


def now():
    return datetime.datetime.now().isoformat(timespec='seconds')


def save():
    tmp = STATUS.with_suffix('.tmp')
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding='utf-8')
    os.replace(tmp, STATUS)


def put(key, **kw):
    state.setdefault(key, {}).update(kw)
    save()


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


def take_lock():
    try:
        fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        try:
            pid = int(LOCK.read_text().strip() or 0)
        except (OSError, ValueError):
            pid = 0
        if pid and alive(pid):
            AGAIN.write_text('')
            return False
        LOCK.unlink(missing_ok=True)  # прогон оборвался — замок ничей
        return take_lock()
    os.write(fd, str(os.getpid()).encode())
    os.close(fd)
    return True


def run(cmd, on_line=None):
    """Запустить, вывод — в журнал; вернуть (код, последняя строка)."""
    log.write('$ %s\n' % ' '.join(map(str, cmd)))
    log.flush()
    p = subprocess.Popen([str(c) for c in cmd], cwd=ROOT, env=ENV, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                         text=True, encoding='utf-8', errors='replace', creationflags=HIDDEN)
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
    code, last = run([sys.executable, 'tools/knowledge/code_export.py'])
    put('codegraph', state='done' if code == 0 else 'failed', stage='', finished=now(), note='' if code == 0 else last)


PROGRESS = re.compile(r'\b(pending|running|completed|failed|cancelled)\s+файлов\s+(\S+)\s+фрагментов\s+(\S+)')


def semsearch(commit):
    if not SPY.exists() or not SCLIENT.exists():
        return put('semsearch', state='skipped', stage='', commit='', finished=now(), note='поиск по смыслу не установлен')
    put('semsearch', state='running', stage='запуск базы и модели', commit=commit, started=now(), finished=None,
        pid=os.getpid(), files=0, chunks=0, note='')
    if SVC.exists():
        code, last = run([SPY, SVC, 'up'])
        if code:
            return put('semsearch', state='failed', finished=now(), note='база или модель не поднялись')
    try:
        semsearch_run()
    finally:
        if SVC.exists():
            run([SPY, SVC, 'down'])


def semsearch_run():
    put('semsearch', stage='дообновление индекса')

    last_state = ['']

    def seen(line):
        m = PROGRESS.search(line)
        if m:
            last_state[0] = m.group(1)
            f, c = (int(x) if x.isdigit() else 0 for x in m.group(2, 3))
            put('semsearch', files=f, chunks=c)

    code, last = run([SPY, SCLIENT, 'index', ROOT.as_posix(), 'inside'], seen)
    if code or last_state[0] != 'completed':
        return put('semsearch', state='failed', finished=now(), note=last)
    put('semsearch', stage='выгрузка для программы')
    code, last = run([SPY, 'tools/knowledge/semantic_export.py'])
    put('semsearch', state='done' if code == 0 else 'failed', stage='', finished=now(), note='' if code == 0 else last)


def main():
    global log, state
    G.mkdir(exist_ok=True)
    if not take_lock():
        return 0
    try:
        while True:
            AGAIN.unlink(missing_ok=True)
            try:
                state = json.loads(STATUS.read_text(encoding='utf-8'))
            except (OSError, ValueError):
                state = {}
            commit = head()
            with io.open(LOG, 'w', encoding='utf-8') as log:
                log.write('==== %s, коммит %s\n' % (now(), commit))
                codegraph(commit)
                semsearch(commit)
                log.write('DONE %s\n' % now())
            if not AGAIN.exists():
                break
    finally:
        LOCK.unlink(missing_ok=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
