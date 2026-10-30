# -*- coding: utf-8 -*-
"""Хук Claude Code SessionStart — начало работы без ручных шагов.

Аудит настроек 30.10.2026 («Тоже надо алгоритмизировать»): то, что CLAUDE.md
велел делать руками в начале работы и после перерыва, делает хук. Вывод
хука Claude Code кладёт в начало разговора — и при старте, и после сжатия
разговора, так что правила не теряются при сжатии:

  * состояние инструментов: PostgreSQL и Ollama поиска по смыслу,
    реранкер, индекс CodeGraph (правило posle-pereryva-proverit-chto-vse-
    instrumenty-podnyaty) — упавшее не поднимается здесь, а называется;
  * git: ветка, неподтверждённые правки, неотправленные коммиты;
  * разделы графа (без якорей — полное оглавление: graph.py toc) и
    действующие правила по группам (graph.py rules).

Подключение — .claude/settings.json проекта, событие SessionStart.
"""
import io
import os
import subprocess
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HIDDEN = 0x08000000 if os.name == 'nt' else 0
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')


def run(cmd, timeout=60):
    try:
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, timeout=timeout, creationflags=HIDDEN,
                           env=dict(os.environ, PYTHONIOENCODING='utf-8', NO_PROXY='127.0.0.1,localhost'))
        return r.stdout.decode('utf-8', 'replace').strip()
    except (OSError, subprocess.TimeoutExpired) as e:
        return 'не выполнено: %s' % e


def http_ok(url):
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        return opener.open(url, timeout=2).status == 200
    except Exception:
        return False


def tools_state():
    sys.path.insert(0, os.path.join(ROOT, 'tools', 'knowledge'))
    import store
    state = [('PostgreSQL', store.pg_up()),
             ('Ollama', http_ok('http://127.0.0.1:11434/api/version')),
             ('реранкер', http_ok('http://127.0.0.1:8091/health')),
             ('индекс CodeGraph', os.path.exists(os.path.join(ROOT, '.codegraph')))]
    down = [n for n, ok in state if not ok]
    line = 'Инструменты: ' + ', '.join('%s — %s' % (n, 'да' if ok else 'НЕТ') for n, ok in state)
    if down:
        line += ('\n  Не поднято: %s. PostgreSQL граф поднимет сам (graph.py); поиск по смыслу поднимает '
                 'сервер MCP semsearch при старте, вручную — "%%LOCALAPPDATA%%\\semsearch\\...\\python.exe" '
                 'svc.py up. Сказать пользователю.' % ', '.join(down))
    return line


def git_state():
    branch = run(['git', 'branch', '--show-current'])
    dirty = len([l for l in run(['git', 'status', '--porcelain']).splitlines() if l.strip()])
    ahead = run(['git', 'rev-list', '--count', '@{u}..HEAD'])
    return 'Git: ветка «%s», неподтверждённых файлов %d, неотправленных коммитов %s' % (
        branch, dirty, ahead if ahead.isdigit() else '—')


def sections():
    out = []
    for ln in run([sys.executable, 'tools/knowledge/graph.py', 'toc']).splitlines():
        if ln.startswith('## '):
            out.append('  ' + ln[3:])
    return '\n'.join(out)


def main():
    print('# Начало работы (хук SessionStart, tools/hooks/session_start.py)\n')
    print(tools_state())
    print(git_state())
    print('\n## Разделы графа знаний (полностью — graph.py toc; запись — graph.py show <id>)')
    print(sections())
    print('\n# Действующие правила (граф; полный текст — graph.py show <id>)')
    print(run([sys.executable, 'tools/knowledge/graph.py', 'rules']))


if __name__ == '__main__':
    main()
