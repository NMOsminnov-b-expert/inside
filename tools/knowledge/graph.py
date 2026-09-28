# -*- coding: utf-8 -*-
"""Граф знаний проекта — knowledge/: чтение, запись, проверка, поиск.

Решение пользователя 28.09.2026: знания проекта живут в графе knowledge/ в
git; ищем по нему CodeGraph (RAG); записи размечаются метками; журнал —
история коммитов и их описания.

Почему запись — Python-файл, а не YAML или Markdown. CodeGraph находит текст
только в значениях констант исходного кода: у YAML он читает одни ключи
(значения там бывают паролями), Markdown не читает вовсе (проверено
28.09.2026). Поэтому запись — модуль с константами:

    ID, KIND, TITLE, TAGS, STATUS, DATE, SOURCE, POINTS, LINKS, …

и `codegraph query "<фраза>"` находит её по заголовку, метке или пункту.
Файл — данные, не код: он не исполняется, читается разбором (ast).

    python tools/knowledge/graph.py toc            оглавление графа — разделы, метки, якоря
    python tools/knowledge/graph.py rules [--full] действующие правила — в начале работы
    python tools/knowledge/graph.py check          проверить записи и связи
    python tools/knowledge/graph.py find <текст>   найти запись (запасной поиск без CodeGraph)
    python tools/knowledge/graph.py tag <метка>    записи с меткой
    python tools/knowledge/graph.py new <папка> <заголовок>   новая запись-заготовка
    python tools/knowledge/graph.py stats          сколько чего
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


def save(folder, rec):
    os.makedirs(os.path.join(KNOW, folder), exist_ok=True)
    with io.open(path_of(folder, rec['id']), 'w', encoding='utf-8', newline='\n') as f:
        f.write(render(folder, rec))


def load_all(folders=None):
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
        if os.path.basename(p) != file_name(rid):
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
    for folder, p, r in recs:
        for link in r.get('связи') or []:
            if 'куда' in link and link['куда'] not in ids:
                problems.append('%s: связь «%s» ведёт в несуществующую запись %s'
                                % (os.path.relpath(p, ROOT), link.get('тип'), link['куда']))
    return recs, problems


# --- команды ---------------------------------------------------------------

def cmd_rules(full=False):
    """Действующие правила: одна строка — заголовок и ID; full — с пунктами.
    Короткий вид — для начала работы: полный текст правила читается по ID
    (codegraph query <ID> или файл knowledge/rules/<id>.py)."""
    for folder, p, r in load_all(['rules']):
        if r.get('статус') != 'действует':
            continue
        print('- %s  [%s]' % (' '.join(str(r.get('заголовок')).split()), r['id']))
        if full:
            for pt in r.get('пункты') or []:
                print('    · ' + ' '.join(str(pt).split()))


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
    sections = []
    for ln in toc[1].get('связи') or []:
        name = re.sub(r'^якорь раздела «(.*)»$', r'\1', ln.get('тип', ''))
        if name not in [s[0] for s in sections]:
            sections.append((name, []))
        [s for s in sections if s[0] == name][0][1].append(ln.get('куда'))
    tags_of = {}
    for pt in toc[1].get('пункты') or []:
        m = re.match(r'Раздел «(.*?)»(?: — метки: (.*?))?; якоря:', pt)
        if m:
            tags_of[m.group(1)] = [t.strip() for t in (m.group(2) or '').split(',') if t.strip()]
    for name, anchors in sections:
        tags = tags_of.get(name, [])
        print('\n## %s' % name + (('   метки: ' + ', '.join('%s (%d)' % (t, by_tag.get(t, 0)) for t in tags)) if tags else ''))
        for a in anchors:
            folder, r = recs.get(a, ('?', {}))
            title = ' '.join(str(r.get('заголовок') or r.get('термин') or '').split())
            print('  %-9s %-48s %s' % (folder, a[:48], title[:90]))


def cmd_find(text):
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


def cmd_new(folder, title):
    from migrate_from_graph import slug  # noqa: E402 — транслитерация одна на весь граф
    rid = slug(title)
    rec = {
        'id': rid, 'вид': FOLDERS[folder], 'заголовок': title, 'метки': [FOLDERS[folder]],
        'статус': 'открыт' if folder in ('questions', 'tasks') else 'действует',
        'дата': datetime.date.today().isoformat(), 'источник': 'кто решил, где: сообщение, документ, совещание',
        'пункты': [], 'связи': [],
    }
    if os.path.exists(path_of(folder, rid)):
        sys.exit('уже есть: ' + os.path.relpath(path_of(folder, rid), ROOT))
    save(folder, rec)
    print(os.path.relpath(path_of(folder, rid), ROOT), '— автор git:', author())


def cmd_stats():
    counts = {}
    for folder, p, r in load_all():
        counts[folder] = counts.get(folder, 0) + 1
    for k, v in counts.items():
        print('%-10s %d' % (k, v))
    print('всего', sum(counts.values()))


def main():
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return
    cmd = args[0]
    if cmd == 'check':
        recs, problems = check()
        for pr in problems:
            print(pr)
        print('записей: %d, замечаний: %d' % (len(recs), len(problems)))
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
        cmd_new(args[1], ' '.join(args[2:]))
    elif cmd == 'stats':
        cmd_stats()
    else:
        print(__doc__)


if __name__ == '__main__':
    main()
