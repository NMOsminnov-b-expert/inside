# -*- coding: utf-8 -*-
"""Связи «похоже по смыслу» между записями графа — выгрузка для программы.

Решение пользователя 29.09.2026 «В приложении увижу графы? Оба.» — «Делаем
оба.» (практика graf-koda-i-svyazi-po-smyslu-v-programme-graf-proekta).

Вектор записи — средний по её фрагментам в индексе semsearch (codebase-mcp,
PostgreSQL + pgvector, %LOCALAPPDATA%\\semsearch); ближайшие соседи
считаются в самой базе (косинус). Выгрузка — .graf/semantic.json (вне git):
пары похожих записей (не больше TOP на запись, похожесть не ниже порога) и
по 8 ближайших соседей каждой записи для карточки.

Запуск — питоном из окружения semsearch (там asyncpg):

    "%LOCALAPPDATA%\\semsearch\\src\\codebase-mcp\\.venv\\Scripts\\python.exe" tools/knowledge/semantic_export.py

Обновлять после дообновления индекса semsearch (CLAUDE.md, «Граф проекта»,
шаг 5).
"""
import asyncio
import datetime
import json
import os
import sys

# Вывод — UTF-8 и в консоли с cp1251 (стрелки в итоговой строке).
sys.stdout.reconfigure(encoding='utf-8')

import asyncpg

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import graph  # noqa: E402

SEM = os.path.join(os.environ['LOCALAPPDATA'], 'semsearch')
PROJECT = 'inside'   # база — по имени проекта в реестре semsearch (с 02.10.2026 — индекс Qwen3)
MODEL = 'Qwen3-Embedding-0.6B'
TOP = 3          # связей на запись
# Порог похожести — медиана похожести записи с ближайшим соседом (так он был
# подобран 29.09.2026 для nomic: 0,84). Считается по выгрузке: у каждой
# модели своя шкала, и прибитое число после смены модели (02.10.2026, Qwen3)
# отрезало бы почти все связи или пропускало все.
NEIGHBORS = 8    # соседей для карточки

SQL = f"""
with v as (
    select replace(f.relative_path, chr(92), '/') p, avg(c.embedding) e
    from code_chunks c join code_files f on c.code_file_id = f.id
    where not f.is_deleted and c.embedding is not null and f.relative_path like 'knowledge%'
    group by 1)
select a.p, b.p, 1 - (a.e <=> b.e)
from v a cross join lateral (select p, e from v b where b.p <> a.p order by a.e <=> b.e limit {NEIGHBORS}) b
"""


async def main():
    os.environ['NO_PROXY'] = os.environ['no_proxy'] = '127.0.0.1,localhost'
    pw = open(os.path.join(SEM, 'pgpass.txt'), encoding='ascii').read().strip()
    reg = await asyncpg.connect(host='localhost', port=5432, user='postgres', password=pw, database='codebase_mcp_registry')
    try:
        db = await reg.fetchval('select database_name from projects where name = $1', PROJECT)
    finally:
        await reg.close()
    conn = await asyncpg.connect(host='localhost', port=5432, user='postgres', password=pw, database=db)
    try:
        rows = await conn.fetch(SQL)
    finally:
        await conn.close()
    ids = {os.path.relpath(p, ROOT).replace('\\', '/'): r['id'] for _f, p, r in graph.load_all()}
    near = {}
    for a, b, s in rows:
        ia, ib = ids.get(a), ids.get(b)
        if ia and ib:
            near.setdefault(ia, []).append((ib, round(float(s), 4)))
    for lst in near.values():
        lst.sort(key=lambda x: -x[1])
    firsts = sorted(lst[0][1] for lst in near.values() if lst)
    min_sim = round(firsts[len(firsts) // 2], 4) if firsts else 1.0
    pairs = {}
    for ia, lst in near.items():
        for ib, s in lst[:TOP]:
            if s >= min_sim:
                k = tuple(sorted((ia, ib)))
                pairs[k] = max(pairs.get(k, 0), s)
    out = {
        'generated': datetime.datetime.now().isoformat(timespec='seconds'),
        'source': 'semsearch (codebase-mcp), проект %s, модель %s, средний вектор фрагментов записи' % (PROJECT, MODEL),
        'top': TOP, 'min_sim': min_sim,
        'pairs': [[a, b, s] for (a, b), s in sorted(pairs.items(), key=lambda x: -x[1])],
        'neighbors': {k: v for k, v in near.items()},
    }
    os.makedirs(os.path.join(ROOT, '.graf'), exist_ok=True)
    path = os.path.join(ROOT, '.graf', 'semantic.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False)
    print('записей %d, связей по смыслу %d (порог %.3f) → %s' % (len(near), len(pairs), min_sim, os.path.relpath(path, ROOT)))


if __name__ == '__main__':
    asyncio.run(main())
