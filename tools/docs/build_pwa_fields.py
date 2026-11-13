# -*- coding: utf-8 -*-
"""Сводка полей приложения «Осмотр» (PWA): что и на каком экране приложения
заполняет осмотрщик. Поля, подписи, перечни, обязательность и условия показа —
разбором Params.kt репозитория приложения (shared/…/core/Params.kt), поэтому
сводка совпадает с кодом. Только экраны приложения (пользователь 13.11.2026:
«Только по экрану осмотрщиков сводку! По мобильному приложению PWA!»).

    python tools/docs/build_pwa_fields.py [--repo C:/vs code/osmotr] [--out docs/Поля осмотра PWA.xlsx]

Решение пользователя 13.11.2026 (pwa-osmotr-otdelnyy-modul-so-svoey-kodovoy-
bazoy-polya-osmotra-v-maket): PWA — отдельный модуль, его поля прописываются
отдельно от схемы прежнего экрана осмотрщика; «После — делаем сводку что и где
заполняется».
"""
import argparse, os, re
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

ap = argparse.ArgumentParser()
ap.add_argument('--repo', default=r'C:\vs code\osmotr')
ap.add_argument('--out', default=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'docs', 'Поля осмотра PWA.xlsx'))
a = ap.parse_args()
src = open(os.path.join(a.repo, r'shared\src\commonMain\kotlin\kg\osmotr\core\Params.kt'), encoding='utf-8').read()

# Перечни: private val NAME = listOf("…", …) [+ "…"]
lists = {}
for m in re.finditer(r'val (\w+) = listOf\(([^)]*)\)(\s*\+\s*"([^"]+)")?', src):
    vals = re.findall(r'"([^"]*)"', m.group(2))
    if m.group(4): vals.append(m.group(4))
    lists[m.group(1)] = vals
for m in re.finditer(r'val (\w+) = (\w+) \+ "([^"]+)"', src):
    if m.group(2) in lists: lists[m.group(1)] = lists[m.group(2)] + [m.group(3)]
consts = dict(re.findall(r'const val (\w+) = "([^"]*)"', src))
lists['OI_TYPES'] = [consts[k] for k in re.search(r'val OI_TYPES = listOf\(([^)]*)\)', src).group(1).replace(' ', '').split(',')]

VIS = {'notFlat': 'тип ОИ — не квартира', 'isFlat': 'тип ОИ — квартира', 'isAgri': 'участок сельскохозяйственный',
       'notAgri': 'участок не сельскохозяйственный (или тип не выбран)'}

def fields_of(body):
    out = []
    for m in re.finditer(r'Field\(([^\n]*)\),?\n', body):
        args = m.group(1)
        key = re.match(r'\s*("([^"]+)"|(\w+))', args)
        key = key.group(2) or consts.get(key.group(3), key.group(3))
        label = re.findall(r'"([^"]*)"', args)[1 if args.lstrip().startswith('"') else 0]
        kind = re.search(r'Kind\.(\w+)', args).group(1)
        opts = []
        lm = re.search(r'Kind\.\w+,\s*(listOf\(([^)]*)\)|(\w+))', args)
        if lm:
            opts = ([t[1:-1] if t.startswith('"') else consts.get(t, t) for t in re.findall(r'"[^"]*"|\w+', lm.group(2))]
                    if lm.group(2) is not None else lists.get(lm.group(3), []))
        vis = re.search(r'visible = (\w+|\{[^}]*\})', args)
        v = ''
        if vis:
            v = VIS.get(vis.group(1), '')
            if not v:
                q = re.search(r'it\["([^"]+)"\] == "([^"]+)"', vis.group(1))
                v = f'при «{q.group(2)}»' if q else vis.group(1)
        out.append({'key': key, 'label': label, 'kind': kind, 'opts': opts, 'req': 'required = ALWAYS' in args, 'vis': v})
    return out

def sections(fn):
    body = re.search(r'private fun ' + fn + r'\(\) = listOf\((.*?)\n    \)\n', src, re.S).group(1)
    marks = [(m.start(), m.group(2)) for m in re.finditer(r'Section\("(\w+)", "([^"]+)"', body)]
    marks += [(m.start(), None) for m in re.finditer(r'^\s*COMMENT,?\s*$', body, re.M)]
    marks.sort()
    secs = []
    for i, (pos, title) in enumerate(marks):
        if title is None:
            secs.append(('Комментарии', [{'key': 'note', 'label': 'Комментарий осмотрщика', 'kind': 'TEXT', 'opts': [], 'req': False, 'vis': ''}]))
            continue
        end = marks[i + 1][0] if i + 1 < len(marks) else len(body)
        chunk = body[pos:end]
        # Поля раздела — после «listOf(» (раздел бывает и в одну строку)
        secs.append((title, fields_of(chunk[chunk.index('listOf(') + len('listOf('):] + '\n')))
    return secs

# Где экран в приложении: путь по папкам объекта осмотра (Params.formOf, Inventory.kt).
SCREEN = {
    'building': 'Объект → Недвижимое → Литера (или найденное) → Параметры',
    'land': 'Объект → Недвижимое → Земельный участок → Параметры',
    'vehicle': 'Объект (ТС) → Параметры осмотра',
}
KIND = {'SELECT': 'выбор одного', 'MULTI': 'выбор нескольких', 'NUMBER': 'число', 'TEXT': 'текст'}

rows = []
for form, what in [('building', 'Литера (строение, квартира)'), ('land', 'Земельный участок'), ('vehicle', 'Транспортное средство')]:
    for title, fs in sections(form):
        for f in fs:
            rows.append([what, SCREEN[form], title, f['label'], KIND[f['kind']], '; '.join(f['opts']), 'да' if f['req'] else '', f['vis']])

# Механизмы и оборудование — не форма параметров, а опись (Inventory.kt): отметки по позиции.
MECH = 'Механизмы и оборудование'
MECH_SCREEN = 'Объект → Механизмы и оборудование → опись → позиция'
for label, kind, opts, req, vis in [
    ('Найдено / не найдено', 'отметка', 'Найдено; Не найдено', '', ''),
    ('Нерабочее', 'отметка', '', '', 'только при снимках'),
    ('Требуется ремонт', 'отметка', '', '', ''),
    ('Причина ремонта', 'текст', '', 'да', 'при «Требуется ремонт»'),
    ('Снимки позиции', 'снимки', '', '', ''),
    ('Комментарий', 'текст', '', '', ''),
]:
    rows.append([MECH, MECH_SCREEN, 'Позиция описи', label, kind, opts, req, vis])

head = ['Объект осмотра', 'Экран в приложении', 'Раздел экрана', 'Поле', 'Вид поля', 'Варианты', 'Обязательное', 'Когда показывается']
widths = [26, 44, 30, 34, 16, 60, 13, 30]
wb = Workbook(); ws = wb.active; ws.title = 'Поля осмотра'
ws.append(head)
for r in rows: ws.append(r)
thin = Side(style='thin', color='BFBFBF')
for i, w in enumerate(widths, 1): ws.column_dimensions[get_column_letter(i)].width = w
for row in ws.iter_rows():
    for c in row:
        c.alignment = Alignment(wrap_text=True, vertical='top'); c.border = Border(top=thin, bottom=thin, left=thin, right=thin)
for c in ws[1]:
    c.font = Font(bold=True); c.fill = PatternFill('solid', fgColor='DCE6F1')
ws.freeze_panes = 'A2'; ws.auto_filter.ref = ws.dimensions
os.makedirs(os.path.dirname(a.out), exist_ok=True)
wb.save(a.out)
print('полей:', len(rows), '→', a.out)
