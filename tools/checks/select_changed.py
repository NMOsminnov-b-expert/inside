# -*- coding: utf-8 -*-
"""Отбор проверок по изменённым файлам (`run.py --changed`).

Зачем: полный прогон стоит две с половиной минуты, и платить их за правку одной
строки не за что. Каждый сценарий объявляет у себя TOUCHES — пути, от которых
он зависит; здесь по списку изменённых файлов собирается, кого правка задела.

Главное свойство — осторожность. Всё, что не разобрано однозначно, ведёт к
полному прогону, а не к пропуску:

  * правка каркаса (оболочка, роутер, хранилище, сам каркас проверок) — всё;
  * изменённый файл, которого не назвал ни один сценарий, — тоже всё, и в
    отчёте видно, какой именно файл оказался незнакомым: это подсказка, что
    какому-то сценарию пора дописать TOUCHES;
  * ничего содержательного не изменено — не запускается ничего.

Так быстрый прогон не может тихо пропустить дефект: он либо знает, кого
касается правка, либо честно гонит всё. Отсюда и правило пользоваться им по
ходу работы, а перед коммитом всё равно прогонять полностью.

Имя файла — select_changed, а не select: модуль лежит рядом с run.py и попадает
в sys.path, а select — модуль стандартной библиотеки, который затенять нельзя.
"""
import fnmatch
import os
import subprocess

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

# Файлы, которые на макет не влияют: документация, граф знаний, снимки, индекс
# графа кода, замеры прогонов. Их правка не повод поднимать браузер.
IGNORE = (
    '*.md', '*.png', '*.jpg', '*.jpeg', '*.xlsx', '*.pdf', '*.txt',
    'docs/*', '.claude/*', '.codegraph/*', '.vscode/*',
    '.gitignore', '.gitattributes', '.mcp.json',
    'tools/visual-parity/*', 'tools/checks/.times.json',
)

# Правка любого из этих файлов задевает всё: на них держатся все сценарии без
# исключения, и разбираться, кого именно задело, дороже, чем прогнать целиком.
EVERYTHING = (
    'app.html', 'app/main.js', 'app/shell/*',
    'app/kernel/boot.js', 'app/kernel/router.js', 'app/kernel/scope.js',
    'app/kernel/store.js', 'app/kernel/session.js', 'app/kernel/registry.js',
    'app/kernel/dom.js', 'app/kernel/css.js', 'app/kernel/tokens.css',
    'tools/checks/harness.py', 'tools/checks/run.py',
    'tools/checks/select_changed.py',
)


# Область «весь макет». Её объявляют сплошные сценарии — «основа» (экраны
# открываются, правки сохраняются, слушатели не копятся) и «интерфейс без кода»
# (обход всех экранов на служебные значения в тексте). Они идут при любой правке
# макета, но НЕ считаются владельцами файла: иначе незнакомый файл всегда
# оказывался бы «разобранным» и защита от пропуска не срабатывала бы.
BROAD = 'app/*'


def hit(path, patterns):
    """Совпадает ли путь хоть с одним образцом.

    fnmatch, а не pathlib.match: здесь звёздочка должна проходить и через
    косые, чтобы «app/modules/*/oi/building/*» покрывало все пять модулей.
    """
    return any(fnmatch.fnmatch(path, p) for p in (patterns or ()))


def _git(*args):
    r = subprocess.run(('git',) + args, cwd=ROOT, capture_output=True)
    return (r.stdout or b'').decode('utf-8', 'replace')


def changed_paths(base=None):
    """Что изменено: рабочее дерево целиком — правки, индекс, новые файлы.

    С base — ещё и всё, что накопила ветка относительно неё: перед вливанием
    важно не то, что не сохранено, а то, что уйдёт в другую ветку.
    """
    paths = set()
    for entry in _git('status', '--porcelain', '-z').split('\0'):
        if len(entry) < 4:
            continue
        p = entry[3:]
        if entry[0] == 'R':                  # переименование записано как «A -> B»
            p = p.split(' -> ')[-1]
        paths.add(p)
    if base:
        paths.update(_git('diff', '--name-only', '%s...HEAD' % base).split('\n'))
    return sorted(p.strip().strip('"').replace('\\', '/') for p in paths if p.strip())


def select(mods, base=None):
    """Вернуть (какие сценарии запускать, пояснение почему)."""
    changed = [p for p in changed_paths(base) if not hit(p, IGNORE)]
    if not changed:
        return [], 'в макете ничего не изменено — запускать нечего'

    frame = [p for p in changed if hit(p, EVERYTHING)]
    if frame:
        return mods, 'правка каркаса (%s) — прогон целиком' % ', '.join(frame[:2])

    by_file = {m.FILE: m for m in mods}
    narrow = [m for m in mods if BROAD not in (getattr(m, 'TOUCHES', ()) or ())]
    picked = {}
    unknown = []

    for p in changed:
        # Правка самого сценария — запустить его, даже если TOUCHES о нём молчит.
        own = os.path.basename(p)
        if p.startswith('tools/checks/') and own in by_file:
            picked.setdefault(own, []).append(own)
            continue

        owners = [m for m in narrow if hit(p, getattr(m, 'TOUCHES', ()))]
        if not owners:
            unknown.append(p)
            continue
        for m in owners:
            picked.setdefault(m.FILE, []).append(p)

    if unknown:
        return mods, ('область не разобрана (%s) — прогон целиком'
                      % ', '.join(unknown[:3]))

    # Сплошные сценарии идут при любой правке макета — они и есть страховка на
    # случай, когда TOUCHES у кого-то описан неточно.
    for m in mods:
        if BROAD in (getattr(m, 'TOUCHES', ()) or ()):
            picked.setdefault(m.FILE, []).append('любая правка макета')

    chosen = [m for m in mods if m.FILE in picked]
    why = '; '.join(
        '%s <- %s' % (m.NAME, ', '.join(dict.fromkeys(
            os.path.basename(x) for x in picked[m.FILE]))[:60])
        for m in chosen)
    return chosen, 'изменено файлов: %d. %s' % (len(changed), why)
