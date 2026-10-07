# -*- coding: utf-8 -*-
"""Пары записей техпаспортов ТС по исходным строкам — для привязки в поиске.

Задача пользователя 06.10.2026: «в поиске привяжем, что чем является, по
файлику УНА… скрипт по исходнику, а не по выжимкам, чтобы он нашёл все пары и
укомпоновал их. Закинул обезличенный файл. Его используй». Вход — обезличенная
книга, лист «Основной», столбцы «Тип ТС», «Марка», «Модель», «Тип кузова»
(A–D); другие листы не читаются.

Значения сравниваются без учёта регистра и лишних пробелов, в книге — самая
частая запись. Пары собираются по строкам, каждая — со счётом строк:

  * «Тип и кузов» — пара «Тип ТС + Тип кузова»: что это за машина. Колонка
    «Привязка» — выбор из листа «Варианты» (все варианты поиска «Вида объекта»:
    базы, виды спецтехники, шаблоны), заранее подставлен первый вариант
    нынешнего поиска (kernel/treeSearch.js findLeaves) по типу и кузову вместе,
    а если так не нашлось — по одному кузову; из равных вариантов берётся тот,
    что служит началом остальных («Бортовой», а не «Бортовой с КМУ»); где
    равные просто разные («цистерна»), привязка пустая с примечанием
    «неоднозначно — выбрать». «Проверено» ставит человек. Категории — что предлагает
    карточка по типу (categoryCandidates).
  * «Марка и модель» — пара «Марка + Модель» и чем эта модель бывает: самые
    частые тип и кузов, их доля, сколько разных сочетаний.
  * «Марка и кузов» — какие кузова у марки (ГАЗ — бортовой, фургон…).
  * «Все сочетания» — четвёрки «тип + марка + модель + кузов».

Повторная сборка не теряет разметку: привязки, отметки и примечания листа
«Тип и кузов» переносятся из прежней книги по паре.

    python tools/docs/build_pary_poiska_ts.py "<обезличенная книга>.xlsx"   # docs/pary-poiska-ts.xlsx
"""
import collections
import json
import os
import re
import subprocess
import sys

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'tools', 'data'))
from ts_templates import renamed  # noqa: E402 — прежние названия шаблонов

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'docs', 'pary-poiska-ts.xlsx')
SHEET = 'Основной'
COLS = ('Тип ТС', 'Марка', 'Модель', 'Тип кузова')
EMPTY = '—'
CARRIER_TYPES = {'легковой', 'прицеп', 'полуприцеп', 'автобус', 'мото'}

# Варианты — те же, что видит поиск «Вида объекта» в карточке (ctrl.js:
# kindLeaves + templateLeaves); подпись варианта — «вид: название».
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
  // Равные по баллу и порядку варианты: если один из них — начало остальных
  // («Бортовой» и «Бортовой с КМУ»), берётся он; если они просто разные
  // («цистерна»: бензовоз, водовоз, ассенизаторская…) — неоднозначно: первым
  // стоит первый по алфавиту, привязывать по нему нельзя.
  find: Object.fromEntries(input.q.map((q) => {
    let l = findLeaves(L, q).list;
    const mod = (x) => x.name.split(' — ')[0];
    const tied = l.filter((x) => x.score === l[0].score && (x.order || 0) === (l[0].order || 0));
    const root = tied.find((x) => tied.every((y) => mod(y).startsWith(mod(x))));
    if (root) l = [root, ...l.filter((x) => x !== root)];
    return [q, { top: l.slice(0, 3).map(label), tie: tied.length > 1 && !root }];
  })),
  cats: Object.fromEntries(input.types.map((v) => [v, t.categoryCandidates(v)])),
}));
"""

HEAD = PatternFill('solid', fgColor='DCEBF8')
NONE = PatternFill('solid', fgColor='F8D7D3')


def key(v):
    return re.sub(r'\s+', ' ', str(v)).strip().lower() if v is not None and str(v).strip() else ''


class Spell:
    """Самая частая запись значения по ключу."""

    def __init__(self):
        self.seen = collections.defaultdict(collections.Counter)

    def add(self, v):
        k = key(v)
        if k:
            self.seen[k][re.sub(r'\s+', ' ', str(v)).strip()] += 1
        return k

    def __call__(self, k):
        return self.seen[k].most_common(1)[0][0] if k else EMPTY


def read(book):
    wb = load_workbook(book, read_only=True)
    ws = wb[SHEET]
    head = next(ws.iter_rows(min_row=1, max_row=1, max_col=len(COLS), values_only=True))
    assert tuple(head) == COLS, 'в листе «%s» другие столбцы: %s' % (SHEET, head)
    spell, rows = Spell(), []
    for r in ws.iter_rows(min_row=2, max_col=len(COLS), values_only=True):
        ks = tuple(spell.add(v) for v in r)
        if any(ks):
            rows.append(ks)
    wb.close()
    return rows, spell


def previous():
    """Разметка прежней книги: (тип, кузов) → (привязка, проверено, примечание)."""
    if not os.path.exists(OUT):
        return {}
    wb = load_workbook(OUT, read_only=True)
    out = {}
    if 'Тип и кузов' in wb.sheetnames:
        for r in wb['Тип и кузов'].iter_rows(min_row=2, values_only=True):
            if r[0] is not None:
                out[(key(r[0]) if r[0] != EMPTY else '', key(r[1]) if r[1] != EMPTY else '')] = (
                    renamed(r[4]) if r[4] else r[4], r[5], r[7])
    wb.close()
    return out


def sheet(wb, title, head, rows, widths, freeze='C2'):
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
    ws.freeze_panes = freeze
    ws.auto_filter.ref = ws.dimensions
    return ws


def share(n, total):
    return '%d%%' % round(100 * n / total) if total else ''


def build(book):
    rows, sp = read(book)
    T, M, MO, K = range(4)
    type_body = collections.Counter((r[T], r[K]) for r in rows)
    make_model = collections.Counter((r[M], r[MO]) for r in rows)
    make_body = collections.Counter((r[M], r[K]) for r in rows)
    full = collections.Counter(rows)
    by_model = collections.defaultdict(collections.Counter)
    for r in rows:
        by_model[(r[M], r[MO])][(r[T], r[K])] += 1

    # Запрос в поиск — тип и кузов вместе там, где тип называет носитель
    # («легковой фургон» — легковой, «прицеп цистерна» — цистерна на прицепе);
    # «грузовой», «специальный», «грузопассажирский», «СТМ» носителя не уточняют
    # и только сбивают выдачу (на многоосное шасси, на голую базу) — с ними
    # ищется один кузов. Ничего не нашлось — один кузов, без кузова — тип.
    ask = lambda t, k: ' '.join(sp(x) for x in ((t if t in CARRIER_TYPES or not k else ''), k) if x)
    q = sorted({ask(t, k) for t, k in type_body} | {sp(k) for _, k in type_body if k})
    types = sorted({sp(t) for t, _ in type_body if t})
    res = subprocess.run(['node', '--input-type=module', '-e', JS, json.dumps({'q': q, 'types': types}, ensure_ascii=False)],
                         cwd=ROOT, capture_output=True, encoding='utf-8')
    if res.returncode:
        raise SystemExit(res.stderr)
    found = json.loads(res.stdout)
    old = previous()

    wb = Workbook()
    wb.remove(wb.active)

    tb = []
    for (t, k), n in type_body.most_common():
        f = found['find'].get(ask(t, k))
        if not (f and f['top']) and k:
            f = found['find'].get(sp(k))
        hits, tie = (f['top'], f['tie']) if f else ([], False)
        bind, checked, note = old.get((t, k), (None, None, None))
        auto = '' if tie else (hits[0] if hits else '')
        tb.append((sp(t), sp(k), n, ', '.join(found['cats'].get(sp(t), [])) or EMPTY,
                   bind if bind is not None else auto, checked or '',
                   '; '.join(hits if tie else hits[1:]), note or ('неоднозначно — выбрать' if tie and bind is None else '')))
    ws = sheet(wb, 'Тип и кузов', ['Тип ТС', 'Тип кузова', 'Строк', 'Категории по типу', 'Привязка', 'Проверено',
                                   'Другие варианты поиска', 'Примечание'], tb, [18, 34, 9, 30, 50, 12, 60, 36])
    n = len(tb) + 1
    variants = found['variants']
    dv = DataValidation(type='list', formula1="='Варианты'!$A$2:$A$%d" % (len(variants) + 1), allow_blank=True,
                        showErrorMessage=False)
    ws.add_data_validation(dv)
    dv.add('E2:E%d' % n)
    yes = DataValidation(type='list', formula1='"да,нет"', allow_blank=True)
    ws.add_data_validation(yes)
    yes.add('F2:F%d' % n)
    for row in ws.iter_rows(min_row=2, max_row=n):
        if not row[4].value:
            for c in row:
                c.fill = NONE

    mm = []
    for (m, mo), n_ in make_model.most_common():
        combos = by_model[(m, mo)]
        (t, k), top = combos.most_common(1)[0]
        mm.append((sp(m), sp(mo), n_, sp(t), sp(k), share(top, n_), len(combos)))
    sheet(wb, 'Марка и модель', ['Марка', 'Модель', 'Строк', 'Чаще всего: тип ТС', 'Чаще всего: тип кузова',
                                 'Доля', 'Разных сочетаний типа и кузова'], mm, [22, 30, 9, 18, 34, 9, 14])

    mb = [(sp(m), sp(k), n_) for (m, k), n_ in sorted(make_body.items(), key=lambda x: (x[0][0], -x[1]))]
    sheet(wb, 'Марка и кузов', ['Марка', 'Тип кузова', 'Строк'], mb, [22, 34, 9])

    fr = [(sp(t), sp(m), sp(mo), sp(k), n_) for (t, m, mo, k), n_ in full.most_common()]
    sheet(wb, 'Все сочетания', ['Тип ТС', 'Марка', 'Модель', 'Тип кузова', 'Строк'], fr, [18, 22, 30, 34, 9])

    sheet(wb, 'Варианты', ['Вариант', 'Состав или группа'], variants, [60, 60], freeze='A2')

    summary = [('Строк', len(rows)), ('Пар «тип + кузов»', len(type_body)),
               ('из них без привязки', sum(1 for r in tb if not r[4])),
               ('из них проверено', sum(1 for r in tb if r[5] == 'да')),
               ('Пар «марка + модель»', len(make_model)),
               ('моделей с одним сочетанием типа и кузова', sum(1 for r in mm if r[6] == 1)),
               ('Пар «марка + кузов»', len(make_body)), ('Сочетаний всех четырёх', len(full)),
               ('Вариантов поиска', len(variants))]
    sheet(wb, 'Итог', ['Показатель', 'Значение'], summary, [44, 12], freeze='A2')
    wb.move_sheet('Итог', offset=-(len(wb.sheetnames) - 1))
    wb.save(OUT)
    return summary


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    sys.stdout.reconfigure(encoding='utf-8')
    for k, v in build(sys.argv[1]):
        print('%-44s %s' % (k, v))
    print('docs/pary-poiska-ts.xlsx собран')
