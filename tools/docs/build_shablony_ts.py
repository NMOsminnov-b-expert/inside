# -*- coding: utf-8 -*-
"""Шаблоны машин ТС: модули × носители и перечень шаблонов — для проверки наборов.

Указание пользователя 06.10.2026: «Необходимо обеспечить полноценные наборы.
Посмотри, чего не хватает… Все „а вдруг“ должны быть проверены». Книга
снимается с каталога карточки (TS_TEMPLATES, TS_MODULE_GROUPS), то есть с того,
что видит поиск: матрица «модуль × носитель» показывает пустые места, перечень —
каждый шаблон с составом, «Типом ТС» и другими названиями. Источник наборов —
tools/data/ts_templates.py (CARRIERS).

    python tools/docs/build_shablony_ts.py   # docs/shablony-ts.xlsx
"""
import json
import os
import subprocess
import sys

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'docs', 'shablony-ts.xlsx')
sys.path.insert(0, os.path.join(ROOT, 'tools', 'data'))
from ts_templates import CARRIER  # noqa: E402

HEAD = PatternFill('solid', fgColor='DCEBF8')
YES = PatternFill('solid', fgColor='E3F1E6')
WRAP = Alignment(wrap_text=True, vertical='top')


def catalog():
    js = ("import('./app/modules/vehicle/data/tsCatalog.js').then((m) => console.log(JSON.stringify({"
          "templates: m.TS_TEMPLATES, groups: m.TS_MODULE_GROUPS.map((g) => [g.group, g.items.map((i) => i.name)]) })))")
    out = subprocess.run(['node', '--input-type=module', '-e', js], cwd=ROOT, capture_output=True, encoding='utf-8')
    return json.loads(out.stdout)


def sheet(ws, head, rows, widths):
    ws.append(head)
    for c in ws[1]:
        c.font = Font(bold=True)
        c.fill = HEAD
        c.alignment = Alignment(wrap_text=True, vertical='center')
    for r in rows:
        ws.append(r)
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    for row in ws.iter_rows(min_row=2):
        for c in row:
            c.alignment = WRAP
    ws.freeze_panes = 'C2' if ws.title == 'Модули и носители' else 'B2'
    ws.auto_filter.ref = ws.dimensions


def build():
    data = catalog()
    keys = list(CARRIER)
    carriers_of = {}
    for t in data['templates']:
        if len(t['modules']) == 1:
            carriers_of.setdefault(t['modules'][0]['kind'], set()).add(t['carrier'])
    wb = Workbook()
    ws = wb.active
    ws.title = 'Модули и носители'
    rows = []
    for group, items in data['groups']:
        for kind in items:
            have = carriers_of.get(kind, set())
            rows.append([group, kind] + ['да' if k in have else '' for k in keys] + [len(have)])
    sheet(ws, ['Группа', 'Модуль'] + [CARRIER[k][3] for k in keys] + ['Носителей'], rows,
          [20, 38] + [11] * len(keys) + [10])
    for row in ws.iter_rows(min_row=2, min_col=3, max_col=2 + len(keys)):
        for c in row:
            if c.value == 'да':
                c.fill = YES
    ws.row_dimensions[1].height = 48

    ws2 = wb.create_sheet('Шаблоны')
    rows = [[t['name'], CARRIER[t['carrier']][3], ' + '.join(m['kind'] for m in t['modules']) or '—',
             t['vtype'] or '—', ', '.join(t['aliases'])] for t in data['templates']]
    sheet(ws2, ['Шаблон', 'Носитель', 'Модули', 'Тип ТС, вид кузова', 'Другие названия (поиск)'], rows,
          [40, 22, 50, 32, 50])
    wb.save(OUT)
    return len(data['templates']), len(rows)


if __name__ == '__main__':
    n, _ = build()
    print('docs/shablony-ts.xlsx собран: шаблонов %d' % n)
