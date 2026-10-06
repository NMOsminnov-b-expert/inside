# -*- coding: utf-8 -*-
"""Пары «запись техпаспорта → вариант справочника ТС» для привязки в поиске.

Задача пользователя 06.10.2026: «в поиске привяжем, что чем является, по
файлику УНА. Напишешь скрипт для составления пар? Потом внедришь». Вход —
обезличенная книга уникальных значений (tools/data/unique_values.py), только
листы «Столбец I» (вид кузова) и «Столбец F» (тип ТС); исходная книга УНА под
запретом и не читается.

Книга пар — для разметки человеком: у каждой записи вида кузова колонка
«Привязка» — выбор из списка всех вариантов поиска (шаблоны, базы, виды
спецтехники; лист «Варианты»), заранее подставлен первый вариант нынешнего
поиска (kernel/treeSearch.js findLeaves по каталогу карточки). «Проверено»
ставит человек. Пустая привязка — записи нет соответствия в справочнике.
По типу ТС — какие категории предлагает карточка (categoryCandidates).

Повторная сборка не теряет разметку: привязки и отметки из прежней книги
docs/pary-poiska-ts.xlsx переносятся по записи.

    python tools/docs/build_pary_poiska_ts.py "<книга уникальных>.xlsx"   # docs/pary-poiska-ts.xlsx
"""
import json
import os
import subprocess
import sys

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'docs', 'pary-poiska-ts.xlsx')
EMPTY = '(пусто)'

# Варианты — те же, что видит поиск «Вида объекта» в карточке (ctrl.js:
# templateLeaves + kindLeaves); подпись варианта — «вид: название».
JS = r"""
const [{ findLeaves }, m, t] = await Promise.all([import('./app/kernel/treeSearch.js'),
  import('./app/modules/vehicle/data/tsCatalog.js'), import('./app/modules/vehicle/tsModel.js')]);
const SELF = 'Специализированная техника';
const L = [];
for (const b of m.TS_BASES.filter((b) => b.name !== 'Прочее')) L.push({ name: b.name, aliases: b.aliases || [], order: -1,
  path: [b.category], extra: [b.hint, b.examples].filter(Boolean).join(' '), what: 'база', where: b.category });
for (const g of m.TS_SELF_GROUPS) for (const it of g.items) L.push({ name: it.name, aliases: it.aliases || [], order: -1,
  path: [SELF, g.group], extra: it.examples, what: 'спецтехника', where: g.group });
for (const x of m.TS_TEMPLATES) L.push({ name: x.name, aliases: x.aliases, order: x.order,
  path: ['Шаблон: ' + [x.base, ...x.modules.map((z) => z.kind)].join(' + ')], what: 'шаблон',
  where: [x.base, ...x.modules.map((z) => z.kind)].join(' + ') });
const label = (l) => `${l.what}: ${l.name}`;
const input = JSON.parse(process.argv[1]);
console.log(JSON.stringify({
  variants: L.map((l) => [label(l), l.where]),
  I: input.I.map((v) => { const r = findLeaves(L, v); return [v, r.list.slice(0, 3).map(label), r.list.length + r.more]; }),
  F: input.F.map((v) => [v, t.categoryCandidates(v)]),
}));
"""

HEAD = PatternFill('solid', fgColor='DCEBF8')
NONE = PatternFill('solid', fgColor='F8D7D3')


def read(book):
    wb = load_workbook(book, read_only=True)
    data = {}
    for col in ('F', 'I'):
        ws = wb['Столбец %s' % col]
        data[col] = [(str(r[0]), r[1]) for r in ws.iter_rows(min_row=2, max_col=2, values_only=True)
                     if r[0] is not None and str(r[0]) != EMPTY]
    wb.close()
    return data


def previous():
    """Разметка прежней книги: запись → (привязка, проверено, примечание)."""
    if not os.path.exists(OUT):
        return {}
    wb = load_workbook(OUT, read_only=True)
    out = {}
    for r in wb['Вид кузова (I)'].iter_rows(min_row=2, values_only=True):
        if r[0] is not None:
            out[str(r[0]).lower()] = (r[2], r[3], r[6] if len(r) > 6 else None)
    wb.close()
    return out


def sheet(wb, title, head, rows, widths):
    ws = wb.create_sheet(title)
    ws.append(head)
    for c in ws[1]:
        c.font = Font(bold=True)
        c.fill = HEAD
        c.alignment = Alignment(wrap_text=True, vertical='center')
    for r in rows:
        ws.append(list(r))
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    for row in ws.iter_rows(min_row=2):
        for c in row:
            c.alignment = Alignment(wrap_text=True, vertical='top')
    ws.freeze_panes = 'B2'
    ws.auto_filter.ref = ws.dimensions
    return ws


def build(book):
    data = read(book)
    vals = {'I': [v for v, _ in data['I']], 'F': [v for v, _ in data['F']]}
    res = subprocess.run(['node', '--input-type=module', '-e', JS, json.dumps(vals, ensure_ascii=False)], cwd=ROOT,
                         capture_output=True, encoding='utf-8')
    if res.returncode:
        raise SystemExit(res.stderr)
    found = json.loads(res.stdout)
    top = {v: (t, n) for v, t, n in found['I']}
    old = previous()

    rows = []
    for v, n in data['I']:
        t, total = top[v]
        bind, checked, note = old.get(v.lower(), (None, None, None))
        rows.append((v, n, bind if bind is not None else (t[0] if t else ''), checked or '',
                     '; '.join(t[1:]) if t else '', total, note or ''))
    rows.sort(key=lambda r: -r[1])

    wb = Workbook()
    wb.remove(wb.active)
    ws = sheet(wb, 'Вид кузова (I)', ['Запись', 'Строк', 'Привязка', 'Проверено', 'Другие варианты поиска',
                                      'Вариантов в выдаче', 'Примечание'], rows, [36, 9, 50, 12, 60, 12, 40])
    variants = found['variants']
    wv = sheet(wb, 'Варианты', ['Вариант', 'Состав или группа'], variants, [60, 60])
    n = len(rows) + 1
    dv = DataValidation(type='list', formula1="='Варианты'!$A$2:$A$%d" % (len(variants) + 1), allow_blank=True,
                        showErrorMessage=False)
    ws.add_data_validation(dv)
    dv.add('C2:C%d' % n)
    yes = DataValidation(type='list', formula1='"да,нет"', allow_blank=True)
    ws.add_data_validation(yes)
    yes.add('D2:D%d' % n)
    for row in ws.iter_rows(min_row=2, max_row=n):
        if not row[2].value:
            for c in row:
                c.fill = NONE

    cand = dict((v, c) for v, c in found['F'])
    frows = [(v, n_, ', '.join(cand.get(v, [])) or '—') for v, n_ in data['F']]
    sheet(wb, 'Тип ТС (F)', ['Запись', 'Строк', 'Категории, которые предлагает карточка'], frows, [24, 9, 60])
    wb.move_sheet('Варианты', offset=1)
    wb.save(OUT)
    return len(rows), sum(1 for r in rows if not r[2]), len(variants), sum(1 for r in rows if r[3] == 'да')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    sys.stdout.reconfigure(encoding='utf-8')
    pairs, empty, variants, checked = build(sys.argv[1])
    print('docs/pary-poiska-ts.xlsx собран: записей %d, без привязки %d, проверено %d, вариантов %d'
          % (pairs, empty, checked, variants))
