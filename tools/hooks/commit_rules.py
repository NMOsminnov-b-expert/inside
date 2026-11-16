# -*- coding: utf-8 -*-
"""Правила коммита — проверкой, а не памятью (аудит настроек 30.10.2026,
«Тоже надо алгоритмизировать»).

    python tools/hooks/commit_rules.py pre-commit
    python tools/hooks/commit_rules.py commit-msg <файл описания>
    python tools/hooks/commit_rules.py pre-push   (строки «ref sha ref sha» на входе)

pre-commit — журнал изменений вместе с правкой (требование пользователя
21.09.2026, CLAUDE.md «Журнал изменений — вместе с каждой правкой»): если в
коммите есть файлы, а tools/docs/change_log_data.py среди них нет, коммит
останавливается. Слияние не проверяется. Разово пропустить —
INSIDE_NO_CHANGELOG=1 git commit … (например, коммит одних снимков).

Данные — не в git (пользователь 16.11.2026: «Запрещаем их отправку»):
документы docs/, карточки data/local/, ответы Кадастра и Дарека
(tools/checks/fixtures/, app/data/analytics/), граф знаний (knowledge/,
.claude/knowledge-graph/), архивы и таблицы. pre-commit не даёт их добавить
или изменить (убрать из git можно), pre-push не отправляет коммиты, в
которых они есть. Уже лежащее в истории на GitHub остаётся там.

commit-msg — кто ставил задачу (пользователь 30.10.2026: «Главное, что бы
можно было посмотреть, с какого аккаунта коммит был сделан. Что бы было
понятно, кто ставил задачу»): аккаунт — автор коммита в git; задача —
строка «Задача: <кто>» в конце описания. Строка обязательна для коммита
из Claude Code (переменная CLAUDECODE); строка «Co-Authored-By: Claude» —
отказ всегда (авторство — люди, правило 03.09.2026).
"""
import os
import re
import subprocess
import sys

ROOT = subprocess.run(['git', 'rev-parse', '--show-toplevel'], capture_output=True, text=True).stdout.strip()
LOG = 'tools/docs/change_log_data.py'
FORBIDDEN = re.compile(r'^(docs/|data/local/|tools/checks/fixtures/|app/data/analytics/|knowledge/|\.claude/knowledge-graph/)'
                       r'|\.(zip|rar|7z|xlsx|docx)$', re.I)
ZERO = '0' * 40
NUL = chr(0)


def git_paths(*args):
    out = subprocess.run(['git', *args, '-z'], capture_output=True, cwd=ROOT).stdout.decode('utf-8', 'replace')
    return sorted({p.strip() for p in out.replace('\n', NUL).split(NUL) if p.strip()})


def staged():
    return git_paths('diff', '--cached', '--name-only')


def forbidden(paths):
    bad = [p for p in paths if FORBIDDEN.search(p)]
    if bad:
        sys.stderr.write('Эти файлы в git не идут (правило «Данные проекта наружу не уходят»):\n'
                         + ''.join('  %s\n' % p for p in bad[:20])
                         + ('  … ещё %d\n' % (len(bad) - 20) if len(bad) > 20 else '')
                         + 'Убрать из коммита: git rm --cached <путь>; путь — в .gitignore.\n')
    return bad


def pre_commit():
    if forbidden(git_paths('diff', '--cached', '--name-only', '--diff-filter=d')):
        return 1
    if os.environ.get('INSIDE_NO_CHANGELOG') == '1' or os.path.exists(os.path.join(ROOT, '.git', 'MERGE_HEAD')):
        return 0
    files = staged()
    if files and LOG not in files:
        sys.stderr.write(
            'Коммит без строки в журнале изменений (%s).\n'
            'Каждая правка макета — строка row(...) в том же коммите (CLAUDE.md, «Журнал изменений»).\n'
            'Разово пропустить: INSIDE_NO_CHANGELOG=1 git commit ...\n' % LOG)
        return 1
    return 0


def pre_push(lines):
    # Проверяются только коммиты, которых на GitHub ещё нет.
    for line in lines:
        parts = line.split()
        if len(parts) != 4 or parts[1] == ZERO:
            continue
        local, remote = parts[1], parts[3]
        rng = [local, '--not', '--remotes'] if remote == ZERO else ['%s..%s' % (remote, local)]
        if forbidden(git_paths('log', '--pretty=format:', '--name-only', '--diff-filter=d', *rng)):
            sys.stderr.write('push остановлен: %s\n' % parts[2])
            return 1
    return 0


def commit_msg(path):
    text = open(path, encoding='utf-8', errors='replace').read()
    body = '\n'.join(l for l in text.splitlines() if not l.startswith('#'))
    if re.search(r'^co-authored-by:.*claude', body, re.I | re.M):
        sys.stderr.write('Строка «Co-Authored-By: Claude» запрещена: автор коммита — человек '
                         '(правило claude-md-avtorstvo-kommitov-lyudi-a-ne-claude). Кто ставил задачу — строкой «Задача: …».\n')
        return 1
    if os.environ.get('CLAUDECODE') and not re.search(r'^Задача: \S', body, re.M):
        sys.stderr.write('Коммит из Claude Code без строки «Задача: <кто поставил>» в конце описания.\n')
        return 1
    return 0


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else ''
    if mode == 'pre-commit':
        sys.exit(pre_commit())
    if mode == 'pre-push':
        sys.exit(pre_push(sys.stdin.read().splitlines()))
    if mode == 'commit-msg':
        sys.exit(commit_msg(sys.argv[2]))
    sys.exit(__doc__)
