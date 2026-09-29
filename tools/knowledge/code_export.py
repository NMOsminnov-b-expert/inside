# -*- coding: utf-8 -*-
"""Граф кода — выгрузка из индекса CodeGraph для программы «Граф проекта».

Решение пользователя 29.09.2026 «В приложении увижу графы? Оба.» — «Делаем
оба.» (практика graf-koda-i-svyazi-po-smyslu-v-programme-graf-proekta).

Читает .codegraph/codegraph.db (только чтение). Узлы — файлы кода (записи
графа знаний knowledge/ — не код, их нет); у файла — модуль (остров), язык,
функции, методы и классы со строкой начала. Рёбра — файл → файл по вызовам,
импортам, ссылкам и созданию объектов, с числом случаев. Выгрузка —
.graf/code.json (вне git).

    python tools/knowledge/code_export.py

Обновлять после codegraph sync.
"""
import collections
import datetime
import json
import os
import sqlite3

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = os.path.join(ROOT, '.codegraph', 'codegraph.db')


def module_of(path):
    """Остров файла: app/kernel, app/modules/<тип>, app/pages/<страница>,
    tools/<утилита>, иначе — верхняя папка."""
    parts = path.split('/')
    if parts[0] == 'app' and len(parts) > 2 and parts[1] in ('modules', 'pages'):
        return '/'.join(parts[:3])
    if parts[0] in ('app', 'tools') and len(parts) > 2:
        return '/'.join(parts[:2])
    return parts[0] if len(parts) > 1 else '(корень)'


def main():
    c = sqlite3.connect('file:%s?mode=ro' % DB.replace('\\', '/'), uri=True)
    files = {p: lang for p, lang in c.execute("select path, language from files") if not p.startswith('knowledge/')}
    syms = collections.defaultdict(list)
    for kind, name, path, line in c.execute(
            "select kind, name, file_path, start_line from nodes where kind in ('function','method','class') order by file_path, start_line"):
        if path in files:
            syms[path].append([kind, name, line])
    edges = collections.Counter()
    for a, b, kind in c.execute(
            "select ns.file_path, nt.file_path, e.kind from edges e join nodes ns on ns.id = e.source join nodes nt on nt.id = e.target "
            "where e.kind in ('calls','imports','references','instantiates') and ns.file_path <> nt.file_path"):
        if a in files and b in files:
            edges[(a, b, kind)] += 1
    out = {
        'generated': datetime.datetime.now().isoformat(timespec='seconds'),
        'source': 'CodeGraph (.codegraph/codegraph.db)',
        'files': [{'path': p, 'lang': lang, 'module': module_of(p), 'symbols': syms.get(p, [])} for p, lang in sorted(files.items())],
        'edges': [[a, b, k, n] for (a, b, k), n in sorted(edges.items())],
    }
    os.makedirs(os.path.join(ROOT, '.graf'), exist_ok=True)
    path = os.path.join(ROOT, '.graf', 'code.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False)
    pairs = len({(a, b) for a, b, _k in edges})
    print('файлов %d, модулей %d, связей файл→файл %d → %s' % (
        len(files), len({module_of(p) for p in files}), pairs, os.path.relpath(path, ROOT)))


if __name__ == '__main__':
    main()
