# -*- coding: utf-8 -*-
"""Граф из выгрузки в Markdown — в отдельный проект с knowledge/ (мультиграф).

Решение пользователя 13.10.2026: «Вынеси данные оттуда в отдельный граф. У
нас есть поддержка нескольких проектов. Просто будешь указывать, из какого
проекта тебе оно надо… Ну и между проектами поиск по всем графам тоже.
Пускай это будет мультиграф».

Выгрузка — «все-записи.md» графа другого проекта (так выгружен граф APCS):

    <a id="ID"></a>
    ## Заголовок
    `ID` · вид · статус · дата
    Метки: a, b
    > коротко
    текст, ### подразделы, списки, таблицы, код
    **Код:** … **Источник:** … **Связи:** тип → [id](#id); …
    ---

Запись проекта — тот же формат, что у макета (tools/knowledge/graph.py):
коротко — первый пункт, абзац и пункт списка — по пункту, подраздел —
приставкой «[подраздел]», таблица и код — одним пунктом; «Код:» — пунктом,
«Источник:» — SOURCE, «Связи:» и «### Связи» — LINKS. Проект пересобирается
целиком: записи в папках видов удаляются и пишутся заново.

    python tools/knowledge/import_md_graph.py <все-записи.md> <папка проекта>

Сама выгрузка и проект — данные пользователя: в git макета не идут и
никуда не копируются (правило «Данные проекта наружу не уходят»).
"""
import glob
import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import graph  # noqa: E402

# `ID` · вид · статус [· важность: … · …] · дата — между статусом и датой
# бывают свои поля (у задач APCS — важность); они идут пунктом.
HEAD = re.compile(r'^`([^`]+)` · ([^·]+) · ([^·]+) · (.*?)\s*(\d{4}-\d{2}-\d{2})\s*$')
LINK = re.compile(r'\s*([^;\[\]]+?)\s*→\s*\[[^\]]*\]\(#([^)]+)\)')
LIST_LINK = re.compile(r'^\s*[-*]\s*\[[^\]]*\]\(#([^)]+)\)\s*(?:[—–-]\s*(.*))?$')


def split_records(text):
    """Куски между якорями <a id>: заголовок «## …» и тело."""
    parts = re.split(r'(?m)^<a id="([^"]+)"></a>\s*$', text)
    for i in range(1, len(parts), 2):
        body = parts[i + 1]
        body = re.split(r'(?m)^---\s*$', body)[0]
        yield parts[i], body.strip('\n')


def blocks(lines):
    """Абзацы, пункты списков, таблицы и код — отдельными кусками."""
    out, cur, fence = [], [], False

    def flush():
        if cur:
            out.append(list(cur))
            cur.clear()
    for ln in lines:
        if fence:
            cur.append(ln)
            if ln.strip().startswith('```'):
                fence = False
                flush()
            continue
        s = ln.strip()
        if s.startswith('```'):
            flush()
            cur.append(ln)
            fence = True
        elif not s:
            flush()
        elif s.startswith('### ') or s.startswith('#### '):
            flush()
            out.append([ln])
        elif re.match(r'^([-*]|\d+\.)\s', s):
            if cur and not cur[0].lstrip().startswith('|'):
                flush()
            cur.append(ln)
        elif s.startswith('|'):
            if cur and not cur[0].strip().startswith('|'):
                flush()
            cur.append(ln)
        else:
            if cur and cur[0].strip().startswith('|'):
                flush()
            cur.append(ln)
    flush()
    return out


def parse(rid, body):
    lines = body.split('\n')
    title = ''
    meta = None
    tags, summary, rest = [], [], []
    for i, ln in enumerate(lines):
        if not title and ln.startswith('## '):
            title = ln[3:].strip()
            continue
        m = HEAD.match(ln.strip())
        if m and meta is None:
            meta = m
            continue
        if meta is not None and not rest and ln.startswith('Метки:'):
            tags = [t.strip() for t in ln[len('Метки:'):].split(',') if t.strip()]
            continue
        if meta is not None and not rest and ln.startswith('> '):
            summary.append(ln[2:].strip())
            continue
        if meta is not None and (rest or ln.strip()):
            rest.append(ln)
    if not meta:
        return None
    kind, status, date = meta.group(2).strip(), meta.group(3).strip(), meta.group(5)
    source, links, points = '', [], []
    extra = meta.group(4).strip(' ·')
    if extra:
        points.append(extra)
    if summary:
        points.append(' '.join(summary))
    section = ''
    for b in blocks(rest):
        first = b[0].strip()
        if first.startswith('#'):
            section = first.lstrip('#').strip()
            continue
        if first.startswith('**Источник:**'):
            source = ' '.join(x.strip() for x in b)[len('**Источник:**'):].strip()
            continue
        if first.startswith('**Связи:**'):
            for t, to in LINK.findall(' '.join(x.strip() for x in b)[len('**Связи:**'):]):
                links.append({'тип': t.strip(' «»'), 'куда': to})
            continue
        if section == 'Связи' and LIST_LINK.match(first):
            m = LIST_LINK.match(first)
            links.append({'тип': 'связано', 'куда': m.group(1)})
            continue
        if first.startswith('```') or first.startswith('|'):
            txt = '\n'.join(b)
        else:
            txt = re.sub(r'^[-*]\s+', '', ' '.join(x.strip() for x in b))
        if first.startswith('**Код:**'):
            txt = 'Код: ' + txt[len('**Код:**'):].strip()
        points.append(('[%s] ' % section if section else '') + txt)
    return {'id': rid, 'вид': kind, 'заголовок': title, 'метки': tags, 'статус': status, 'дата': date,
            'источник': source or 'выгрузка графа', 'пункты': points, 'связи': links}


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    src, root = sys.argv[1], sys.argv[2]
    graph.use_root(root)
    by_kind = {}
    for folder, kind in graph.FOLDERS.items():
        by_kind.setdefault(kind, folder)   # «понятие» → concepts (первая папка вида)
    text = io.open(src, encoding='utf-8').read().replace('\r\n', '\n')
    recs = [r for r in (parse(rid, body) for rid, body in split_records(text)) if r]
    for folder in graph.FOLDERS:
        for p in glob.glob(os.path.join(graph.KNOW, folder, '*.py')):
            os.remove(p)
    where = {r['id']: by_kind.get(r['вид'], 'project') for r in recs}
    lost = 0
    for r in recs:
        keep = []
        for ln in r['связи']:
            if ln['куда'] in where:
                ln['папка'] = where[ln['куда']]
                keep.append(ln)
            else:
                lost += 1
        r['связи'] = keep
        graph.save(where[r['id']], r)
    counts = {}
    for f in where.values():
        counts[f] = counts.get(f, 0) + 1
    print('записей: %d (%s); связей в никуда отброшено: %d' % (
        len(recs), ', '.join('%s %d' % kv for kv in sorted(counts.items())), lost))


if __name__ == '__main__':
    main()
