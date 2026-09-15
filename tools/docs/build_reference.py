# -*- coding: utf-8 -*-
"""Справочник полей макета: снимает состав с экранов и собирает документы.

Зачем скрипт, а не документ руками. Состав полей меняется на каждой правке
карточек, и написанный однажды справочник устаревает за неделю. Здесь он
снимается с живых экранов — открываются витрины всех типов объекта оценки и
все карточки объектов имущества, — поэтому пересобирается одной командой и
всегда описывает то, что на самом деле видит оценщик.

    python tools/docs/build_reference.py

На выходе два файла в docs/ (оба локальные, никуда не выгружаются):

    spravochnik-poley.xlsx   таблицы: фильтры, сортировка, правка по месту
    spravochnik-poley.docx   тот же состав для чтения и печати

Формат — по требованию пользователя 15.09.2026: отчёты человеку отдаются
в docx и таблицах, а не в markdown.

Разделы — по РД 50-34.698-90 «Описание информационного обеспечения», но
порядок от объекта оценки к объекту имущества: так с макетом работают.
"""
import io
import json
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DOCS = os.path.join(ROOT, 'docs')
PORT = 5599

MODULES = [
    ('apartment', 'ap', 'Жилое здание (квартира)'),
    ('residential-house', 'rh', 'Жилое здание (дом)'),
    ('civil', 'cv', 'Гражданское здание'),
    ('production', 'pr', 'Производственное строение'),
    ('land-plot', 'lp', 'Земельный участок'),
]

OI_KINDS = [
    ('land', 'Земельный участок'),
    ('flat', 'Квартира'),
    ('house', 'Жилой дом'),
    ('civil', 'Гражданское здание'),
    ('prod', 'Производственное строение'),
    ('other', 'Прочее строение'),
    ('mech', 'Механизмы и оборудование'),
    ('office', 'Офисная техника и мебель'),
]

SHORT = {t: s for (_, _, t), s in zip(MODULES, ['Кв', 'Дом', 'Гр', 'Пр', 'ЗУ'])}

# Со страницы снимаем блоки карточек: номер, заголовок, поля и колонки таблиц.
# Подпись поля берём так, как её видит человек, а служебные атрибуты виджетов
# (выпадающий список, мультивыбор, аккордеон) полем не считаем.
PROBE = r"""() => {
  const txt = (el) => {
    if (!el) return '';
    const copy = el.cloneNode(true);
    copy.querySelectorAll('.dev-note, .chev, .pill-mini, .fl-grip').forEach((n) => n.remove());
    return copy.textContent.replace(/\s+/g, ' ').trim();
  };

  const SKIP = /^data-(dd|ps|pick|ms|acc|card|field-err|open|to|add-photo|photo-pop|vsb|struct-opt|heat-opt|cat-all|floor-grip)/;

  const attrOf = (el) => {
    if (el.id) return '#' + el.id;
    const named = [...el.attributes]
      .filter((a) => a.name.startsWith('data-') && !SKIP.test(a.name));
    return named.length ? named[0].name : '';
  };

  const labelOf = (el) => {
    const field = el.closest('.field');
    if (field) {
      const lb = field.querySelector('label, .lbl');
      if (lb) return txt(lb);
    }
    const own = el.closest('label');
    if (own && txt(own)) return txt(own);
    const cell = el.closest('td');
    if (cell) {
      const table = cell.closest('table');
      const ths = table ? [...table.querySelectorAll('thead th')] : [];
      const head = ths[cell.cellIndex];
      if (head && txt(head)) return txt(head);
      const first = txt(cell.closest('tr').cells[0]);
      if (first) return first;
    }
    const headField = el.closest('.head-eni');
    if (headField) return txt(headField.querySelector('label')) || 'Код ЕНИ';
    const mode = el.closest('.aux-mode');
    if (mode) return txt(mode.querySelector('label'));
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    if (el.getAttribute('placeholder')) return '(' + el.getAttribute('placeholder') + ')';
    return '';
  };

  const kindOf = (el) => {
    if (el.tagName === 'TEXTAREA') return 'текст многострочный';
    if (el.tagName === 'SELECT') return 'список';
    const t = (el.getAttribute('type') || 'text').toLowerCase();
    if (t === 'checkbox') return 'отметка';
    if (el.getAttribute('inputmode') === 'decimal') return 'число';
    if (el.getAttribute('inputmode') === 'numeric') return 'целое';
    if (el.hasAttribute('readonly')) return 'только чтение';
    return 'текст';
  };

  const blocks = [];
  document.querySelectorAll('.card').forEach((card) => {
    const head = txt(card.querySelector('h3'));
    if (!head) return;
    const fields = [];
    const seen = new Set();

    card.querySelectorAll('input, select, textarea').forEach((el) => {
      if (el.closest('thead')) return;
      const attr = attrOf(el);
      if (!attr) return;
      const label = labelOf(el);
      const mark = attr + '|' + label;
      if (seen.has(mark)) return;
      seen.add(mark);
      fields.push({
        подпись: label,
        ключ: attr,
        вид: kindOf(el),
        в_таблице: !!el.closest('tbody tr'),
        значения: el.tagName === 'SELECT'
          ? [...el.options].map((o) => o.textContent.trim()).filter(Boolean) : null,
      });
    });

    card.querySelectorAll('[data-struct-field], [data-heat-field]').forEach((el) => {
      const attr = el.dataset.structField
        ? 'data-struct-field=' + el.dataset.structField : 'data-heat-field';
      if (seen.has(attr)) return;
      seen.add(attr);
      const row = el.closest('tr');
      fields.push({
        подпись: txt(row ? row.querySelector('td') : el.closest('.field')),
        ключ: attr,
        вид: 'мультивыбор',
        в_таблице: !!row,
        значения: [...el.querySelectorAll('.ms-opt')].map((o) => txt(o)).filter(Boolean),
      });
    });

    const tables = [];
    card.querySelectorAll('table').forEach((t) => {
      const cols = [...t.querySelectorAll('thead th')].map((th) => txt(th)).filter(Boolean);
      if (cols.length) tables.push(cols);
    });

    blocks.push({ номер: txt(card.querySelector('.card-idx')), заголовок: head,
                  поля: fields, таблицы: tables });
  });
  return blocks;
}"""

MENU_PROBE = r"""() => ({
  виды_ОИ: [...document.querySelectorAll('[data-add-oi]')].map((b) => b.dataset.addOi),
  вкладки: [...document.querySelectorAll('.tabs .tab')]
    .map((t) => t.textContent.replace(/\s+/g, ' ').trim()),
})"""


def collect():
    """Снять состав полей со всех экранов макета."""
    from playwright.sync_api import sync_playwright

    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd=ROOT,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)
    data = {'ОЦ': {}, 'ОИ': {}, 'меню': {}}
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page(viewport={'width': 1600, 'height': 1200})
            base = 'http://127.0.0.1:%d/app.html' % PORT

            for mod, tag, title in MODULES:
                pg.goto('%s#/oc/%s/oc-%s-all' % (base, mod, tag))
                pg.wait_for_selector('.card', timeout=20000)
                pg.wait_for_timeout(600)
                pg.evaluate("""() => document.querySelectorAll('.card.closed')
                    .forEach(c => c.classList.remove('closed'))""")
                data['ОЦ'][title] = {
                    'модуль': mod,
                    'маршрут': '#/oc/%s/oc-%s-all' % (mod, tag),
                    'блоки': pg.evaluate(PROBE),
                }
                tog = pg.locator('[data-dd-toggle]')
                if tog.count():
                    tog.first.click()
                    pg.wait_for_timeout(300)
                data['меню'][title] = pg.evaluate(MENU_PROBE)

                pg.goto('%s#/oc/%s/oc-%s-all/form' % (base, mod, tag))
                pg.wait_for_selector('.card', timeout=20000)
                pg.wait_for_timeout(500)
                data['ОЦ'][title]['форма'] = pg.evaluate(PROBE)

                for suffix, kind in OI_KINDS:
                    url = '%s#/oc/%s/oc-%s-all/oi/oi-%s-all-%s' % (base, mod, tag, tag, suffix)
                    pg.goto(url)
                    try:
                        pg.wait_for_selector('.oi-stack .card', timeout=6000)
                    except Exception:
                        continue
                    pg.wait_for_timeout(500)
                    pg.evaluate("""() => document.querySelectorAll('.card.closed')
                        .forEach(c => c.classList.remove('closed'))""")
                    data['ОИ'].setdefault(kind, {})[title] = {
                        'маршрут': url.replace(base, ''),
                        'блоки': pg.evaluate(PROBE),
                    }
                print('  снято: %s' % title)
            b.close()
    finally:
        srv.terminate()
    return data


# --- разбор снятого ---------------------------------------------------------

def menus_of(data):
    out = {}
    for _, _, title in MODULES:
        seen = []
        for k in data['меню'][title]['виды_ОИ']:
            if k not in seen:
                seen.append(k)
        out[title] = seen
    return out


def dict_index(data):
    """Перечни значений и поля, которые их используют."""
    found = {}
    def walk(blocks, where):
        for b in blocks:
            for f in b['поля']:
                vals = [v for v in (f['значения'] or []) if v and v != '—']
                if len(vals) > 1:
                    found.setdefault(tuple(vals), set()).add((f['подпись'], f['ключ']))
    for t in data['ОЦ']:
        walk(data['ОЦ'][t]['блоки'], t)
        walk(data['ОЦ'][t]['форма'], t)
    for kind in data['ОИ']:
        for t in data['ОИ'][kind]:
            walk(data['ОИ'][kind][t]['блоки'], kind)
    return found


def divergences(data):
    rows = []
    for kind, per_oc in data['ОИ'].items():
        keys = {t: {f['ключ'] for b in v['блоки'] for f in b['поля']} for t, v in per_oc.items()}
        if len({len(v) for v in keys.values()}) == 1:
            continue
        full = max(keys.values(), key=len)
        for t, k in keys.items():
            miss = full - k
            if miss:
                rows.append((kind, t, ', '.join(sorted(x.replace('data-', '') for x in miss))))
    return rows


def key(k):
    return k.replace('data-', '')


# --- таблицы ----------------------------------------------------------------

def build_xlsx(data, path):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    head_fill = PatternFill('solid', fgColor='DCE9F7')
    head_font = Font(bold=True, color='1F3A5F')
    wrap = Alignment(vertical='top', wrap_text=True)

    def sheet(title, columns, rows, widths):
        ws = wb.create_sheet(title)
        ws.append(columns)
        for c in range(1, len(columns) + 1):
            cell = ws.cell(row=1, column=c)
            cell.fill = head_fill
            cell.font = head_font
            cell.alignment = Alignment(vertical='center', wrap_text=True)
            ws.column_dimensions[get_column_letter(c)].width = widths[c - 1]
        for r in rows:
            ws.append(list(r))
        ws.freeze_panes = 'A2'
        ws.auto_filter.ref = 'A1:%s%d' % (get_column_letter(len(columns)), ws.max_row)
        for row in ws.iter_rows(min_row=2):
            for cell in row:
                cell.alignment = wrap
        return ws

    wb.remove(wb.active)

    # 1. структура
    menus = menus_of(data)
    kinds = []
    for t in menus:
        for k in menus[t]:
            if k not in kinds:
                kinds.append(k)
    rows = []
    for k in kinds:
        rows.append([k] + [(menus[t].index(k) + 1 if k in menus[t] else '—')
                           for _, _, t in MODULES])
    sheet('Структура ОЦ-ОИ', ['Вид объекта имущества'] + [SHORT[t] for _, _, t in MODULES],
          rows, [42] + [10] * len(MODULES))

    # 2. поля объекта оценки
    rows = []
    first = data['ОЦ'][MODULES[0][2]]
    for src, where in (('форма', 'Форма записи'), ('блоки', 'Карточка')):
        for b in first[src]:
            for f in b['поля']:
                rows.append([where, b['номер'], b['заголовок'], f['подпись'],
                             key(f['ключ']), f['вид'],
                             len(f['значения']) if f['значения'] else ''])
    sheet('Поля ОЦ', ['Раздел', '№ блока', 'Блок', 'Поле', 'Ключ', 'Вид', 'Значений'],
          rows, [16, 9, 34, 46, 26, 20, 10])

    # 3. поля объектов имущества
    rows = []
    for _, kind in OI_KINDS:
        per_oc = data['ОИ'].get(kind)
        if not per_oc:
            continue
        where = [t for _, _, t in MODULES if t in per_oc]
        base = per_oc[where[0]]
        for b in base['блоки']:
            for f in b['поля']:
                rows.append([kind, ', '.join(SHORT[t] for t in where), b['номер'],
                             b['заголовок'], f['подпись'], key(f['ключ']), f['вид'],
                             'да' if f['в_таблице'] else '',
                             len(f['значения']) if f['значения'] else ''])
    sheet('Поля ОИ', ['Вид ОИ', 'Заводится в', '№ блока', 'Блок', 'Поле', 'Ключ',
                      'Вид', 'В таблице', 'Значений'],
          rows, [26, 20, 9, 32, 44, 26, 18, 10, 10])

    # 4. таблицы карточек
    rows = []
    for _, kind in OI_KINDS:
        per_oc = data['ОИ'].get(kind)
        if not per_oc:
            continue
        base = per_oc[[t for _, _, t in MODULES if t in per_oc][0]]
        for b in base['блоки']:
            for cols in b['таблицы']:
                rows.append([kind, b['заголовок'], ', '.join(cols)])
    sheet('Таблицы карточек', ['Вид ОИ', 'Блок', 'Колонки'], rows, [26, 34, 90])

    # 5. справочники
    rows = []
    for vals, users in sorted(dict_index(data).items(), key=lambda kv: -len(kv[0])):
        names = sorted({u[0] for u in users if u[0]})
        title = names[0] if names else '—'
        rows.append([title, len(vals), '; '.join(sorted({key(u[1]) for u in users})),
                     '; '.join(vals)])
    sheet('Справочники', ['Справочник', 'Значений', 'Поля', 'Значения'],
          rows, [34, 10, 40, 110])

    # 6. расхождения
    sheet('Расхождения', ['Вид ОИ', 'В каком ОЦ', 'Чего не хватает'],
          divergences(data), [26, 32, 40])

    # 7. указатель
    index = {}
    for _, _, t in MODULES:
        for src, note in (('форма', 'ОЦ · форма записи'), ('блоки', 'ОЦ · карточка')):
            for b in data['ОЦ'][t].get(src, []):
                for f in b['поля']:
                    index.setdefault((key(f['ключ']), f['подпись']), set()).add(
                        '%s · %s' % (note, b['заголовок']))
    for kind, per_oc in data['ОИ'].items():
        for t, v in per_oc.items():
            for b in v['блоки']:
                for f in b['поля']:
                    index.setdefault((key(f['ключ']), f['подпись']), set()).add(
                        'ОИ «%s» · %s' % (kind, b['заголовок']))
    rows = [[k, label, '; '.join(sorted(places))] for (k, label), places in sorted(index.items())]
    sheet('Указатель', ['Ключ', 'Поле', 'Где находится'], rows, [26, 46, 80])

    wb.save(path)
    return path


# --- документ ---------------------------------------------------------------

def build_docx(data, path):
    from docx import Document
    from docx.shared import Pt, Cm
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    doc = Document()
    doc.styles['Normal'].font.name = 'Calibri'
    doc.styles['Normal'].font.size = Pt(10)
    for s in doc.sections:
        s.left_margin = s.right_margin = Cm(1.8)

    doc.add_heading('Справочник полей макета', level=0)
    p = doc.add_paragraph(
        'Состав данных: какие поля есть у объекта оценки и у каждого вида объекта '
        'имущества, в каком типе объекта оценки они встречаются и в каком блоке '
        'карточки находятся.')
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    doc.add_paragraph(
        'Состав снят с экранов макета, поэтому описывает то, что видит оценщик. '
        'Пересобирается командой: python tools/docs/build_reference.py')
    doc.add_paragraph('Документ внутренний. Выгрузка за пределы компании запрещена.')

    def table(columns, rows, widths=None):
        t = doc.add_table(rows=1, cols=len(columns))
        t.style = 'Light Grid Accent 1'
        for i, c in enumerate(columns):
            cell = t.rows[0].cells[i]
            cell.text = c
            for r in cell.paragraphs[0].runs:
                r.font.bold = True
                r.font.size = Pt(9)
        for row in rows:
            cells = t.add_row().cells
            for i, v in enumerate(row):
                cells[i].text = str(v)
                for par in cells[i].paragraphs:
                    for r in par.runs:
                        r.font.size = Pt(9)
        if widths:
            for i, wcm in enumerate(widths):
                for row in t.rows:
                    row.cells[i].width = Cm(wcm)
        doc.add_paragraph()

    # 1. структура
    doc.add_heading('1. Структура: объект оценки → объект имущества', level=1)
    doc.add_heading('1.1. Типы объектов оценки', level=2)
    table(['Тип объекта оценки', 'Модуль', 'Витрина'],
          [[t, data['ОЦ'][t]['модуль'], data['ОЦ'][t]['маршрут']] for _, _, t in MODULES],
          [6.5, 4.0, 6.5])

    doc.add_heading('1.2. Какие объекты имущества где заводятся', level=2)
    doc.add_paragraph('Цифра — место в меню «Добавить ОИ», прочерк — вид недоступен.')
    menus = menus_of(data)
    kinds = []
    for t in menus:
        for k in menus[t]:
            if k not in kinds:
                kinds.append(k)
    table(['Вид объекта имущества'] + [SHORT[t] for _, _, t in MODULES],
          [[k] + [(menus[t].index(k) + 1 if k in menus[t] else '—') for _, _, t in MODULES]
           for k in kinds],
          [8.0] + [1.7] * len(MODULES))

    doc.add_heading('1.3. Карточки объектов имущества', level=2)
    table(['Карточка', 'Кем используется'], [
        ['Земельный участок', 'вид «Земельный участок»'],
        ['Квартира', 'вид «Квартира»'],
        ['Строение', 'жилой дом, гражданское, производственное, прочее строение'],
        ['Движимое имущество', 'механизмы и оборудование, офисная техника и мебель'],
    ], [5.0, 12.0])

    # 2. объект оценки
    doc.add_heading('2. Объект оценки', level=1)
    doc.add_paragraph('Состав полей одинаков во всех пяти типах.')
    first = data['ОЦ'][MODULES[0][2]]
    doc.add_paragraph('Вкладки карточки: %s.'
                      % ', '.join(data['меню'][MODULES[0][2]]['вкладки']))

    for src, title in (('форма', '2.1. Форма записи'), ('блоки', '2.2. Блоки карточки')):
        doc.add_heading(title, level=2)
        for b in first[src]:
            if not b['поля']:
                continue
            doc.add_heading('%s %s' % (b['номер'], b['заголовок']), level=3)
            table(['Поле', 'Ключ', 'Вид'],
                  [[f['подпись'], key(f['ключ']), f['вид']] for f in b['поля']],
                  [8.0, 5.5, 3.5])

    # 3. объекты имущества
    doc.add_heading('3. Объекты имущества', level=1)
    for n, (_, kind) in enumerate(OI_KINDS, 1):
        per_oc = data['ОИ'].get(kind)
        if not per_oc:
            continue
        where = [t for _, _, t in MODULES if t in per_oc]
        doc.add_heading('3.%d. %s' % (n, kind), level=2)
        doc.add_paragraph('Заводится в: %s.' % ', '.join(where))
        base = per_oc[where[0]]
        for b in base['блоки']:
            if not b['поля']:
                continue
            doc.add_heading('%s %s' % (b['номер'], b['заголовок']), level=3)
            table(['Поле', 'Ключ', 'Вид'],
                  [[f['подпись'], key(f['ключ']),
                    f['вид'] + (' · в таблице' if f['в_таблице'] else '')]
                   for f in b['поля']],
                  [8.0, 5.5, 3.5])
        tables = [(b['заголовок'], cols) for b in base['блоки'] for cols in b['таблицы']]
        if tables:
            doc.add_paragraph('Таблицы карточки:')
            table(['Блок', 'Колонки'], [[h, ', '.join(c)] for h, c in tables], [5.0, 12.0])

    # 4. справочники
    doc.add_heading('4. Справочники значений', level=1)
    for i, (vals, users) in enumerate(
            sorted(dict_index(data).items(), key=lambda kv: -len(kv[0])), 1):
        names = sorted({u[0] for u in users if u[0]})
        doc.add_heading('4.%d. %s — значений: %d'
                        % (i, names[0] if names else '—', len(vals)), level=3)
        doc.add_paragraph('Поля: %s' % '; '.join(sorted({key(u[1]) for u in users})))
        doc.add_paragraph('; '.join(vals))

    # 5. расхождения
    doc.add_heading('5. Расхождения, замеченные при сборе', level=1)
    rows = divergences(data)
    if rows:
        table(['Вид ОИ', 'В каком ОЦ', 'Чего не хватает'], rows, [5.0, 6.0, 6.0])
    else:
        doc.add_paragraph('Не обнаружено.')

    doc.save(path)
    return path


def main():
    print('Снимаю состав полей с экранов макета…')
    data = collect()

    os.makedirs(DOCS, exist_ok=True)
    xlsx = build_xlsx(data, os.path.join(DOCS, 'spravochnik-poley.xlsx'))
    docx = build_docx(data, os.path.join(DOCS, 'spravochnik-poley.docx'))

    for p in (xlsx, docx):
        print('готово: %s (%d КБ)' % (os.path.relpath(p, ROOT), os.path.getsize(p) // 1024))


if __name__ == '__main__':
    main()
