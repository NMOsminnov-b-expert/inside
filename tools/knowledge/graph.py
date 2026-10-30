# -*- coding: utf-8 -*-
"""Граф знаний проекта: чтение, запись, проверка, поиск.

Источник записей — база knowledge в PostgreSQL (решение пользователя
30.10.2026 «все же переносим его целиком в psql. Так будет надежнее и
проще»; устройство — tools/knowledge/store.py). Журнал правок — таблица
history в той же базе; копия базы — раз в день, .graf/knowledge-backup/.
Граф не в git (29.10.2026). Папка knowledge/ — выгрузка из базы для
CodeGraph, поиска по смыслу и сборщиков; файл, изменённый в обход базы
(программой «Граф проекта» или руками), при следующем вызове забирается в
базу. Писать — командами ниже или запросом (sql), а не правкой файлов.

Почему выгрузка — Python-файлы, а не YAML или Markdown. CodeGraph находит текст
только в значениях констант исходного кода: у YAML он читает одни ключи
(значения там бывают паролями), Markdown не читает вовсе (проверено
28.09.2026). Поэтому запись — модуль с константами:

    ID, KIND, TITLE, TAGS, STATUS, DATE, SOURCE, POINTS, LINKS, …

и `codegraph query "<фраза>"` находит её по заголовку, метке или пункту.
Файл — данные, не код: он не исполняется, читается разбором (ast).

    python tools/knowledge/graph.py toc            оглавление графа — разделы, метки, якоря
    python tools/knowledge/graph.py rules [--full] действующие правила — в начале работы
    python tools/knowledge/graph.py check [--full] проверить записи и связи; замечания — сводкой (--full — все)
    python tools/knowledge/graph.py suggest [<id>] кандидаты связей: по общим соседям и по сходству текста
    python tools/knowledge/graph.py find <текст>   найти запись (запасной поиск без CodeGraph)
    python tools/knowledge/graph.py tag <метка>    записи с меткой
    python tools/knowledge/graph.py new <папка> <заголовок>   новая запись-заготовка
    python tools/knowledge/graph.py stats          сколько чего и числа качества (связность, одиночки, центры)

  Правка (только граф макета, в базе; история — history):
    graph.py show <id>                         запись целиком
    graph.py new <папка> <заголовок> [--tag м]… [--source …] [--point …]… [--link тип=куда]… [--status …]
    graph.py add <id> <текст пункта>           пункт в конец
    graph.py set <id> <поле> <значение>        статус, заголовок, источник, дата, метки (через запятую), папка
    graph.py link <id> <тип> <куда>            связь; unlink <id> <куда> [тип] — снять
    graph.py put <файл.py> [<папка>]           запись целиком из файла того же формата
    graph.py rm <id>                           удалить (только по прямому указанию)
    graph.py history [<id>] [-n N]             последние правки: кто, когда, что
    graph.py sql "<запрос>"                    запрос к базе: таблицы record, history; виды rec, link
    graph.py sync | backup | init              файлы ↔ база; копия базы; создать базу и забрать файлы

    --root <папка>  — другой проект (папка, где лежит его knowledge/): отдельные
    базы со своим набором папок в knowledge/schema.py, например база
    категорий по описям (02.10.2026). Без ключа — граф макета.

Мультиграф (решение пользователя 13.10.2026: «Вынеси данные оттуда в
отдельный граф… Просто будешь указывать, из какого проекта тебе оно надо… и
между проектами поиск по всем графам тоже. Пускай это будет мультиграф»):

    python tools/knowledge/graph.py graphs                  графы мультиграфа
    python tools/knowledge/graph.py graphs add <папка>      добавить граф
    python tools/knowledge/graph.py --project APCS find …   граф по имени папки
    python tools/knowledge/graph.py --all find …            по всем графам (и tag)

    Список графов — %LOCALAPPDATA%/Graf/multigraph.json (не в проекте и не в
    .claude), плюс недавние проекты программы «Граф проекта» (settings.json
    там же) и граф макета. Тот же список читает программа.
"""
import ast
import datetime
import glob
import io
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
KNOW = os.path.join(ROOT, 'knowledge')
HOME = ROOT   # граф макета — всегда в мультиграфе
DB_MODE = True   # граф макета — в базе (store.py); графы других проектов — файлы
_synced = False

# Папка → вид записи.
FOLDERS = {
    'concepts': 'понятие',     # реестр: понятия, снятые с макета
    'fields': 'поле',          # реестр: поля, снятые с макета
    'terms': 'понятие',        # понятия из прежнего графа, с пояснениями
    'decisions': 'решение',
    'rules': 'правило',
    'questions': 'вопрос',
    'tasks': 'задача',
    'practices': 'практика',
    'sources': 'источник',
    'tools': 'утилита',
    'code': 'модуль кода',
    'project': 'проект',
}
STATUSES = {'действует', 'отменено', 'открыт', 'закрыт', 'отложено', 'актуально', 'черновик', 'подтверждён'}
_DEFAULT = (dict(FOLDERS), set(STATUSES))


def use_root(root):
    """Работать с другим проектом. Набор папок и статусов — из его
    knowledge/schema.py, если он есть:

        FOLDERS = [('папка', 'вид', 'Подпись', '#цвет'), …]
        STATUSES = ['…', …]          (необязательно)

    Тот же файл читает программа «Граф проекта» (Schema.Load)."""
    global ROOT, KNOW, FOLDERS, STATUSES, DB_MODE
    ROOT = os.path.abspath(root)
    DB_MODE = os.path.normcase(ROOT) == os.path.normcase(os.path.abspath(HOME))
    KNOW = os.path.join(ROOT, 'knowledge')
    FOLDERS, STATUSES = dict(_DEFAULT[0]), set(_DEFAULT[1])
    sp = os.path.join(KNOW, 'schema.py')
    if os.path.exists(sp):
        tree = ast.parse(io.open(sp, encoding='utf-8').read())
        for node in tree.body:
            if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
                name, value = node.targets[0].id, ast.literal_eval(node.value)
                if name == 'FOLDERS':
                    FOLDERS = {t[0]: t[1] for t in value}
                elif name == 'STATUSES':
                    STATUSES = set(value)

# Поле записи → имя константы в файле.
KEYS = [
    ('id', 'ID'), ('вид', 'KIND'), ('заголовок', 'TITLE'), ('термин', 'TERM'), ('синонимы', 'SYNONYMS'),
    ('вид_понятия', 'CONCEPT_KIND'), ('определение', 'DEFINITION'), ('метки', 'TAGS'), ('статус', 'STATUS'),
    ('дата', 'DATE'), ('источник', 'SOURCE'), ('снято', 'TAKEN'), ('прежнее_имя', 'OLD_NAME'),
    ('понятие_реестра', 'REGISTRY_CONCEPT'), ('тип_значения', 'VALUE_TYPE'), ('единица', 'UNIT'),
    ('значений_в_списке', 'LIST_SIZE'), ('строка_таблицы', 'TABLE_ROW'), ('обязательное_в', 'REQUIRED_IN'),
    ('этап_заполнения', 'STAGE'), ('встречается', 'OCCURS'), ('пункты', 'POINTS'), ('связи', 'LINKS'),
]
TO_CONST = dict(KEYS)
TO_KEY = {c: k for k, c in KEYS}


def file_name(rid):
    return rid.replace('-', '_') + '.py'


def path_of(folder, rid):
    return os.path.join(KNOW, folder, file_name(rid))


def read(path):
    """Запись из файла: константы верхнего уровня, значения — литералы."""
    tree = ast.parse(io.open(path, encoding='utf-8').read(), path)
    rec = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            name = node.targets[0].id
            if name.isupper():
                rec[TO_KEY.get(name, name.lower())] = ast.literal_eval(node.value)
    return rec


# Запись значений — одна и та же в graph.py и в программе «Граф проекта»
# (tools/graf, Literal.cs): файл, сохранённый из любого места, выходит байт
# в байт одинаковым, и в git видна только суть правки. Правило: значение в
# строку, если строка с отступом и именем влезает в WIDTH; иначе список или
# словарь — по элементу на строку. Строки не переносятся.
WIDTH = 110


def quote(s):
    q = '"' if ("'" in s and '"' not in s) else "'"
    out = []
    for ch in s:
        if ch == '\\':
            out.append('\\\\')
        elif ch == q:
            out.append('\\' + q)
        elif ch == '\n':
            out.append('\\n')
        elif ch == '\r':
            out.append('\\r')
        elif ch == '\t':
            out.append('\\t')
        elif ord(ch) < 0x20 or ord(ch) == 0x7f:
            out.append('\\x%02x' % ord(ch))
        else:
            out.append(ch)
    return q + ''.join(out) + q


def inline(v):
    if isinstance(v, bool):
        return 'True' if v else 'False'
    if v is None:
        return 'None'
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, str):
        return quote(v)
    if isinstance(v, (list, tuple)):
        return '[' + ', '.join(inline(x) for x in v) + ']'
    if isinstance(v, dict):
        return '{' + ', '.join(quote(k) + ': ' + inline(x) for k, x in v.items()) + '}'
    raise TypeError('значение не поддерживается: %r' % (v,))


def literal(v, indent=0, lead=0):
    """lead — сколько знаков строки уже занято перед значением."""
    one = inline(v)
    if lead + len(one) <= WIDTH or not isinstance(v, (list, tuple, dict)) or not v:
        return one
    pad = ' ' * (indent + 4)
    if isinstance(v, dict):
        rows = []
        for k, x in v.items():
            head = quote(k) + ': '
            rows.append(pad + head + literal(x, indent + 4, indent + 4 + len(head)) + ',')
        return '{\n' + '\n'.join(rows) + '\n' + ' ' * indent + '}'
    rows = [pad + literal(x, indent + 4, indent + 4) + ',' for x in v]
    return '[\n' + '\n'.join(rows) + '\n' + ' ' * indent + ']'


def render(folder, rec):
    title = rec.get('заголовок') or rec.get('термин') or rec.get('id')
    # Первая строка описания модуля — заголовок в одну строку; обратная
    # косая и тройные кавычки в описании недопустимы — заменяются.
    doc = ' '.join(str(title).split()).replace('"""', '«»').replace('\\', '/')
    out = ['# -*- coding: utf-8 -*-',
           '"""' + doc,
           '',
           'Запись графа знаний проекта (knowledge/%s). Файл — данные, не код:' % folder,
           'читается разбором (tools/knowledge/graph.py), не исполняется.',
           '"""']
    for k, v in rec.items():
        const = TO_CONST.get(k, re.sub(r'\W', '_', k).upper())
        head = const + ' = '
        out.append(head + literal(v, 0, len(head)))
    return '\n'.join(out) + '\n'


def _store():
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import store
    return store


def save(folder, rec):
    if DB_MODE:
        _store().put(folder, rec)
        return
    os.makedirs(os.path.join(KNOW, folder), exist_ok=True)
    with io.open(path_of(folder, rec['id']), 'w', encoding='utf-8', newline='\n') as f:
        f.write(render(folder, rec))


def load_all(folders=None):
    global _synced
    if DB_MODE:
        st = _store()
        if not _synced:
            st.sync()
            _synced = True
        return [(f, path_of(f, r['id']), r) for f, r in st.rows(folders)]
    out = []
    for folder in folders or FOLDERS:
        for p in sorted(glob.glob(os.path.join(KNOW, folder, '*.py'))):
            out.append((folder, p, read(p)))
    return out


# --- проверка -------------------------------------------------------------

def check():
    """Обязательные поля, известные вид и статус, уникальные id, связи ведут
    в существующие записи, имя файла совпадает с id."""
    recs = load_all()
    problems = []
    ids = {}
    for folder, p, r in recs:
        rid = r.get('id')
        rel = os.path.relpath(p, ROOT)
        if not rid:
            problems.append('%s: нет ID' % rel)
            continue
        if not DB_MODE and os.path.basename(p) != file_name(rid):
            problems.append('%s: имя файла не совпадает с ID %s' % (rel, rid))
        if rid in ids:
            problems.append('%s: ID %s уже есть в %s' % (rel, rid, ids[rid]))
        ids[rid] = rel
        if not (r.get('заголовок') or r.get('термин')):
            problems.append('%s: нет заголовка (TITLE или TERM)' % rel)
        if r.get('вид') != FOLDERS[folder] and not (folder == 'terms' and r.get('вид') == 'понятие'):
            problems.append('%s: вид «%s» не для папки %s' % (rel, r.get('вид'), folder))
        if r.get('статус') and r['статус'] not in STATUSES:
            problems.append('%s: неизвестный статус «%s»' % (rel, r['статус']))
        if folder not in ('concepts', 'fields') and not isinstance(r.get('метки'), list):
            problems.append('%s: нет меток (TAGS)' % rel)
        # Пункт в одну-две буквы — строка, разобранная по символам (так при
        # переносе из прежнего графа рассыпалась запись main-aktualizirovan).
        crumbs = [x for x in r.get('пункты') or [] if len(re.sub(r'^\[восстановлено\]\s*', '', str(x)).strip()) <= 2]
        if crumbs:
            problems.append('%s: пунктов из одной-двух букв: %d — текст рассыпан по символам' % (rel, len(crumbs)))
    for folder, p, r in recs:
        for link in r.get('связи') or []:
            if 'куда' in link and link['куда'] not in ids:
                problems.append('%s: связь «%s» ведёт в несуществующую запись %s'
                                % (os.path.relpath(p, ROOT), link.get('тип'), link['куда']))
    return recs, problems


def reindex_in_background():
    """tools/hooks/reindex.py скрытым процессом: CodeGraph и поиск по смыслу (ход —
    .graf/index-status.json, журналы — .graf/reindex-*.log)."""
    import subprocess
    script = os.path.join(ROOT, 'tools', 'hooks', 'reindex.py')
    if not os.path.exists(script):
        return
    flags = 0x08000000 | 0x00000008 if os.name == 'nt' else 0  # без окна, отдельно от консоли
    try:
        subprocess.Popen([sys.executable, script], cwd=ROOT, creationflags=flags,
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print('индексы обновляются в фоне (CodeGraph и поиск по смыслу)')
    except OSError as e:
        print('индексы не запущены: %s' % e)


# --- команды ---------------------------------------------------------------

def cmd_rules(full=False):
    """Действующие правила: одна строка — заголовок и ID; full — с пунктами.
    Короткий вид — для начала работы: полный текст правила читается по ID
    (codegraph query <ID> или файл knowledge/rules/<id>.py)."""
    # Группы — метки «правила-…» (сортировка правил 30.10.2026, аудит настроек).
    groups = {}
    for folder, p, r in load_all(['rules']):
        if r.get('статус') != 'действует':
            continue
        g = next((t for t in r.get('метки') or [] if t.startswith('правила-')), 'правила-прочее')
        groups.setdefault(g, []).append(r)
    order = ['правила-работа', 'правила-интерфейс', 'правила-проверки', 'правила-код']
    for g in sorted(groups, key=lambda x: order.index(x) if x in order else len(order)):
        print('\n## %s' % g.split('-', 1)[1].capitalize())
        for r in groups[g]:
            print('- %s  [%s]' % (' '.join(str(r.get('заголовок')).split()), r['id']))
            if full:
                for pt in r.get('пункты') or []:
                    print('    · ' + ' '.join(str(pt).split()))


def sections(recs):
    """Разделы оглавления: [(название, метки, якоря)]. Оглавление → связь
    «раздел» → карта раздела (knowledge/project/karta_razdela_*.py) →
    связи «якорь»; метки — пункт карты «Метки раздела: …» (карты разделов —
    28.09.2026, практика Maps of Content)."""
    toc = recs.get('oglavlenie-grafa')
    out = []
    for ln in (toc[1].get('связи') or []) if toc else []:
        m = recs.get(ln.get('куда'))
        if ln.get('тип') != 'раздел' or not m:
            continue
        name = re.sub(r'^Раздел «(.*)»$', r'\1', str(m[1].get('заголовок') or ''))
        tags = []
        for pt in m[1].get('пункты') or []:
            if str(pt).startswith('Метки раздела:'):
                tags = [t.strip() for t in str(pt).split(':', 1)[1].split(',') if t.strip() not in ('', '—')]
        out.append((name, tags, [l.get('куда') for l in m[1].get('связи') or [] if l.get('тип') == 'якорь']))
    return out


def cmd_toc():
    """Оглавление графа (knowledge/project/oglavlenie_grafa.py): разделы, их
    метки с числом записей и якоря с заголовками — первая точка входа в граф
    (требование пользователя 28.09.2026)."""
    recs = {r['id']: (folder, r) for folder, p, r in load_all()}
    toc = recs.get('oglavlenie-grafa')
    if not toc:
        sys.exit('нет записи knowledge/project/oglavlenie_grafa.py')
    by_tag = {}
    for folder, r in recs.values():
        for t in r.get('метки') or []:
            by_tag[t] = by_tag.get(t, 0) + 1
    for name, tags, anchors in sections(recs):
        print('\n## %s' % name + (('   метки: ' + ', '.join('%s (%d)' % (t, by_tag.get(t, 0)) for t in tags)) if tags else ''))
        for a in anchors:
            folder, r = recs.get(a, ('?', {}))
            title = ' '.join(str(r.get('заголовок') or r.get('термин') or '').split())
            print('  %-9s %-48s %s' % (folder, a[:48], title[:90]))


def cmd_find(text):
    if DB_MODE:
        load_all()
        hits, total = _store().find(text)
        for folder, rid, title, rank in hits:
            print('%-10s %-50s %s' % (folder, rid[:50], title))
        print('найдено: %d' % total)
        return
    words = [w.lower() for w in text.split()]
    hits = []
    for folder, p, r in load_all():
        body = ' '.join(str(v) for v in r.values()).lower()
        score = sum(body.count(w) for w in words)
        if all(w in body for w in words):
            hits.append((score, folder, r))
    for score, folder, r in sorted(hits, key=lambda x: -x[0])[:30]:
        print('%-10s %-50s %s' % (folder, r['id'][:50], r.get('заголовок') or r.get('термин')))
    print('найдено: %d' % len(hits))


# --- мультиграф -------------------------------------------------------------

def _graf_dir():
    return os.path.join(os.environ.get('LOCALAPPDATA') or os.path.expanduser('~'), 'Graf')


def graphs():
    """Графы мультиграфа: [(имя, папка)] — граф макета, multigraph.json,
    недавние проекты программы «Граф проекта»; только папки с knowledge/."""
    import json
    paths = [HOME]
    for name, key in (('multigraph.json', 'Graphs'), ('settings.json', 'Recent')):
        try:
            data = json.load(io.open(os.path.join(_graf_dir(), name), encoding='utf-8-sig'))
            paths += [g.get('Path') for g in data.get(key) or [] if g.get('Path')]
        except (OSError, ValueError):
            pass
    out, seen = [], set()
    for p in paths:
        k = os.path.normcase(os.path.abspath(p))
        if k not in seen and os.path.isdir(os.path.join(p, 'knowledge')):
            seen.add(k)
            out.append((os.path.basename(os.path.abspath(p)), os.path.abspath(p)))
    return out


def cmd_graphs(args):
    import json
    if args[:1] == ['add'] and len(args) > 1:
        path = os.path.abspath(args[1])
        if not os.path.isdir(os.path.join(path, 'knowledge')):
            sys.exit('в %s нет knowledge/' % path)
        f = os.path.join(_graf_dir(), 'multigraph.json')
        try:
            data = json.load(io.open(f, encoding='utf-8-sig'))
        except (OSError, ValueError):
            data = {'Graphs': []}
        if not any(os.path.normcase(g['Path']) == os.path.normcase(path) for g in data['Graphs']):
            data['Graphs'].append({'Path': path, 'Name': os.path.basename(path)})
        os.makedirs(os.path.dirname(f), exist_ok=True)
        io.open(f, 'w', encoding='utf-8').write(json.dumps(data, ensure_ascii=False, indent=2))
    for name, path in graphs():
        n = sum(len(glob.glob(os.path.join(path, 'knowledge', d, '*.py'))) for d in os.listdir(os.path.join(path, 'knowledge'))
                if os.path.isdir(os.path.join(path, 'knowledge', d)))
        print('%-14s %5d  %s' % (name, n, path))


def find_graph(name):
    for n, p in graphs():
        if n.lower() == name.lower() or os.path.normcase(p) == os.path.normcase(os.path.abspath(name)):
            return p
    if os.path.isdir(os.path.join(name, 'knowledge')):
        return name
    sys.exit('нет графа «%s»; графы: %s' % (name, ', '.join(n for n, _ in graphs())))


def cmd_tag(tag):
    n = 0
    for folder, p, r in load_all():
        if tag in (r.get('метки') or []):
            print('%-10s %-10s %-50s %s' % (folder, r.get('статус', ''), r['id'][:50], r.get('заголовок')))
            n += 1
    print('записей с меткой «%s»: %d' % (tag, n))


def author():
    out = subprocess.run(['git', 'config', 'user.name'], cwd=ROOT, stdout=subprocess.PIPE)
    return out.stdout.decode('utf-8', 'replace').strip()


def _opts(args, name):
    """Значения повторяемого ключа --name из списка аргументов (вынимаются)."""
    out = []
    while name in args:
        i = args.index(name)
        out.append(args[i + 1])
        del args[i:i + 2]
    return out


def cmd_new(folder, args):
    from migrate_from_graph import slug  # noqa: E402 — транслитерация одна на весь граф
    if folder not in FOLDERS:
        sys.exit('нет папки «%s»; папки: %s' % (folder, ', '.join(FOLDERS)))
    tags, sources = _opts(args, '--tag'), _opts(args, '--source')
    points, links, status = _opts(args, '--point'), _opts(args, '--link'), _opts(args, '--status')
    title = ' '.join(args)
    rid = slug(title)
    rec = {
        'id': rid, 'вид': FOLDERS[folder], 'заголовок': title,
        'метки': [FOLDERS[folder]] + [t for t in tags if t != FOLDERS[folder]],
        'статус': status[0] if status else ('открыт' if folder in ('questions', 'tasks') else 'действует'),
        'дата': datetime.date.today().isoformat(),
        'источник': sources[0] if sources else 'кто решил, где: сообщение, документ, совещание',
        'пункты': points, 'связи': [],
    }
    if DB_MODE:
        load_all()  # сверка файлов с базой до правки
        if _store().get(rid)[1]:
            sys.exit('уже есть: ' + rid)
        for ln in links:
            typ, _, dst = ln.partition('=')
            rec['связи'].append(_link(typ, dst))
    elif os.path.exists(path_of(folder, rid)):
        sys.exit('уже есть: ' + os.path.relpath(path_of(folder, rid), ROOT))
    save(folder, rec)
    print(rid, '—', os.path.relpath(path_of(folder, rid), ROOT), '— автор:', author())


# --- правка записей в базе ----------------------------------------------------

FIELDS = {'статус': 'статус', 'status': 'статус', 'заголовок': 'заголовок', 'title': 'заголовок',
          'источник': 'источник', 'source': 'источник', 'дата': 'дата', 'date': 'дата',
          'метки': 'метки', 'tags': 'метки', 'вид': 'вид', 'папка': 'папка', 'folder': 'папка',
          'термин': 'термин', 'определение': 'определение'}


def _need(rid):
    if not DB_MODE:
        sys.exit('правка командами — только граф макета (в базе)')
    load_all()
    folder, rec = _store().get(rid)
    if not rec:
        sys.exit('нет записи ' + rid)
    return folder, rec


def _link(typ, dst):
    f, r = _store().get(dst)
    if not r:
        sys.exit('связь ведёт в несуществующую запись ' + dst)
    return {'тип': typ, 'куда': dst, 'папка': f}


def cmd_show(rid):
    folder, rec = _need(rid)
    print(render(folder, rec), end='')


def cmd_add(rid, text):
    folder, rec = _need(rid)
    rec['пункты'] = list(rec.get('пункты') or []) + [text]
    save(folder, rec)
    print('%s: пунктов %d' % (rid, len(rec['пункты'])))


def cmd_set(rid, field, value):
    folder, rec = _need(rid)
    key = FIELDS.get(field.lower())
    if not key:
        sys.exit('поле: ' + ', '.join(sorted(set(FIELDS.values()))))
    if key == 'папка':
        if value not in FOLDERS:
            sys.exit('нет папки ' + value)
        folder, rec['вид'] = value, FOLDERS[value]
    elif key == 'метки':
        rec['метки'] = [t.strip() for t in value.split(',') if t.strip()]
    else:
        if key == 'статус' and value not in STATUSES:
            sys.exit('статус: ' + ', '.join(sorted(STATUSES)))
        rec[key] = value
    save(folder, rec)
    print('%s: %s = %s' % (rid, key, value))


def cmd_link(rid, typ, dst):
    folder, rec = _need(rid)
    links = list(rec.get('связи') or [])
    if any(l.get('тип') == typ and l.get('куда') == dst for l in links):
        print('связь уже есть')
        return
    rec['связи'] = links + [_link(typ, dst)]
    save(folder, rec)
    print('%s —%s→ %s' % (rid, typ, dst))


def cmd_unlink(rid, dst, typ=None):
    folder, rec = _need(rid)
    before = list(rec.get('связи') or [])
    rec['связи'] = [l for l in before if not (l.get('куда') == dst and (typ is None or l.get('тип') == typ))]
    save(folder, rec)
    print('снято связей: %d' % (len(before) - len(rec['связи'])))


def cmd_put(path, folder=None):
    rec = read(path)
    if not rec.get('id'):
        sys.exit('в файле нет ID')
    if DB_MODE:
        load_all()
    if not folder:
        parent = os.path.basename(os.path.dirname(os.path.abspath(path)))
        kinds = {v: k for k, v in FOLDERS.items() if k not in ('terms', 'fields')}
        folder = parent if parent in FOLDERS else (_store().get(rec['id'])[0] or kinds.get(rec.get('вид')))
    if folder not in FOLDERS:
        sys.exit('папка записи не определена — укажите: put <файл> <папка>')
    save(folder, rec)
    print('%s → %s' % (rec['id'], folder))


def cmd_rm(rid):
    _need(rid)
    print('удалена' if _store().delete(rid) else 'нет записи')


def cmd_history(args):
    import json
    n = int(_opts(args, '-n')[0]) if '-n' in args else 30
    for num, rid, at, by, op, old, new in _store().history(args[0] if args else None, n):
        what = ''
        if old and new:
            o, w = json.loads(old), json.loads(new)
            what = ', '.join(k for k in dict.fromkeys(list(o) + list(w)) if o.get(k) != w.get(k))
        print('%s  %-28s %-7s %-50s %s' % (at.strftime('%Y-%m-%d %H:%M'), (by or '')[:28], op, rid[:50], what))


def cmd_sql(query):
    load_all()  # сначала забрать файлы, изменённые в обход базы
    cols, data, count = _store().sql(query)
    if cols:
        print(' | '.join(cols))
        for row in data:
            print(' | '.join('' if v is None else ' '.join(str(v).split()) for v in row))
        print('строк: %d' % len(data))
    else:
        print('затронуто строк: %d' % count)
        _store().sync()  # правка запросом — сразу в файлы выгрузки


def cmd_stats():
    import quality
    recs = load_all()
    counts = {}
    for folder, p, r in recs:
        counts[folder] = counts.get(folder, 0) + 1
    for k, v in counts.items():
        print('%-10s %d' % (k, v))
    print('всего', sum(counts.values()))
    print()
    for k, v in quality.numbers(recs).items():
        print('%-26s %s' % (k, v))


def vocab():
    try:
        from structure_review import VOCAB
        return VOCAB
    except ImportError:
        return None


def cmd_warnings(recs, full):
    import quality
    ws = quality.warnings(recs, vocab(), ROOT)
    groups = {}
    for kind, rid, text in ws:
        groups.setdefault(kind, []).append((rid, text))
    for kind, items in groups.items():
        print('замечание «%s»: %d' % (kind, len(items)))
        for rid, text in items if full else items[:3]:
            print('    %s — %s' % (rid, text))
        if not full and len(items) > 3:
            print('    … ещё %d (--full)' % (len(items) - 3))
    return len(ws)


def cmd_suggest(only):
    import quality
    rows = quality.suggest(load_all(), only=only, top=15)
    for a, b, aa, tx in rows[:40]:
        print('%-46s %-46s соседи %.2f  текст %.2f' % (a[:46], b[:46], aa, tx))
    print('кандидатов: %d' % len(rows))


def main():
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    # Консоль Windows (cp1251) не знает «→» и подобного — заменяем, а не падаем.
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(errors='replace')
    args = sys.argv[1:]
    if '--root' in args:
        i = args.index('--root')
        use_root(args[i + 1])
        del args[i:i + 2]
    if '--project' in args:
        i = args.index('--project')
        use_root(find_graph(args[i + 1]))
        del args[i:i + 2]
    if '--all' in args:
        args.remove('--all')
        if not args or args[0] not in ('find', 'tag'):
            sys.exit('--all — только с find и tag')
        for name, path in graphs():
            use_root(path)
            print('=== %s' % name)
            cmd_find(' '.join(args[1:])) if args[0] == 'find' else cmd_tag(args[1])
        return
    if not args:
        print(__doc__)
        return
    cmd = args[0]
    if cmd == 'check':
        recs, problems = check()
        for pr in problems:
            print(pr)
        notes = cmd_warnings(recs, '--full' in args)
        print('записей: %d, ошибок: %d, замечаний к наполнению: %d' % (len(recs), len(problems), notes))
        # Граф не в git (решение пользователя 29.10.2026 «Не отдаем в гит knowledge», запись
        # graf-znaniy-ne-uhodit-v-git-tolko-na-etom-kompyutere): коммита по правке графа нет, и
        # хук post-commit индексы не обновит — их обновляет проверка, в фоне, как хук.
        if DB_MODE and not problems:
            out = _store().backup()
            if out:
                print('копия базы графа:', os.path.relpath(out, ROOT))
        if not problems and '--no-reindex' not in args and os.environ.get('INSIDE_NO_REINDEX') != '1':
            reindex_in_background()
        sys.exit(1 if problems else 0)
    elif cmd == 'rules':
        cmd_rules('--full' in args)
    elif cmd == 'toc':
        cmd_toc()
    elif cmd == 'find':
        cmd_find(' '.join(args[1:]))
    elif cmd == 'tag':
        cmd_tag(args[1])
    elif cmd == 'new':
        cmd_new(args[1], args[2:])
    elif cmd == 'show':
        cmd_show(args[1])
    elif cmd == 'add':
        cmd_add(args[1], ' '.join(args[2:]))
    elif cmd == 'set':
        cmd_set(args[1], args[2], ' '.join(args[3:]))
    elif cmd == 'link':
        cmd_link(args[1], args[2], args[3])
    elif cmd == 'unlink':
        cmd_unlink(args[1], args[2], args[3] if len(args) > 3 else None)
    elif cmd == 'put':
        cmd_put(args[1], args[2] if len(args) > 2 else None)
    elif cmd == 'rm':
        cmd_rm(args[1])
    elif cmd == 'history':
        cmd_history(args[1:])
    elif cmd == 'sql':
        cmd_sql(' '.join(args[1:]))
    elif cmd == 'sync':
        _store().sync()
    elif cmd == 'backup':
        out = _store().backup(force=True)
        print(out or 'копия не сделана')
    elif cmd == 'init':
        _store().init()
        _store().sync()
    elif cmd == 'stats':
        cmd_stats()
    elif cmd == 'graphs':
        cmd_graphs(args[1:])
    elif cmd == 'suggest':
        cmd_suggest(args[1] if len(args) > 1 else None)
    else:
        print(__doc__)


if __name__ == '__main__':
    main()
