# -*- coding: utf-8 -*-
"""Тип нежилого здания: как его определяет система — документ Word для чтения
человеком (методика простыми словами, без кода).

    python tools/docs/build_tip_nezhilogo_zdaniya.py [--out docs/поля-и-справочники/Тип нежилого здания.docx]

Источники — решения графа tipizaciya-oc-po-vnutrenney-ploschadi,
civil-kategorii-liter-i-ts, zony-litery и код макета: app/modules/civil/card/
typology.js (тип ОЦ), app/modules/civil/oi/building/capClass.js (типы литер,
назначения по факту), app/modules/civil/card.js (меню «+ Добавить ОИ»).
Порог, названия типов и перечни назначений читаются из кода, примеры
считаются тем же правилом, что и в макете.
"""
import argparse, os, re
from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ap = argparse.ArgumentParser()
ap.add_argument('--out', default=os.path.join(ROOT, 'docs', 'поля-и-справочники', 'Тип нежилого здания.docx'))
a = ap.parse_args()

# --- из кода макета --------------------------------------------------------
cap = open(os.path.join(ROOT, r'app\modules\civil\oi\building\capClass.js'), encoding='utf-8').read()
PURPOSES = {k: re.findall(r"'([^']+)'", v) for k, v in re.findall(r"\n  (civil|prod|other): \[(.*?)\],", cap.split('export const PURPOSES')[1].split('};')[0], re.S)}
typ = open(os.path.join(ROOT, r'app\modules\civil\card\typology.js'), encoding='utf-8').read()
assert 'export const THRESHOLD = 100 / 3 - 5;' in typ, 'порог в typology.js изменился — обновить текст документа'
THRESHOLD = 100 / 3 - 5
KINDS = [('civil', 'Гражданское', 'гражданская'), ('prod', 'Производственное', 'производственно-складская'), ('other', 'Прочие', 'прочие')]


def typology(areas):
    """То же правило, что typologyOf в typology.js."""
    total = sum(areas.values())
    counted = [lbl for key, lbl, _ in KINDS if total and areas.get(key, 0) / total * 100 >= THRESHOLD]
    if not counted: return 'Нежилое здание · тип не определён'
    if len(counted) == 3: return 'Смешанное'
    return ', '.join(c if i == 0 else c.lower() for i, c in enumerate(counted))


# --- оформление -------------------------------------------------------------
BLUE = RGBColor(0x1F, 0x4E, 0x8C)
INK = RGBColor(0x22, 0x2B, 0x36)
GREY = RGBColor(0x5B, 0x66, 0x73)

doc = Document()
sec = doc.sections[0]
sec.left_margin = sec.right_margin = Cm(2.2)
sec.top_margin = sec.bottom_margin = Cm(2)
st = doc.styles['Normal']
st.font.name = 'Segoe UI'; st.font.size = Pt(10.5); st.font.color.rgb = INK
st.element.rPr.rFonts.set(qn('w:eastAsia'), 'Segoe UI')
st.paragraph_format.space_after = Pt(6); st.paragraph_format.line_spacing = 1.15
for name, size in (('Heading 1', 15), ('Heading 2', 12.5)):
    h = doc.styles[name]
    h.font.name = 'Segoe UI Semibold'; h.font.size = Pt(size); h.font.color.rgb = BLUE; h.font.bold = False
    h.element.rPr.rFonts.set(qn('w:eastAsia'), 'Segoe UI Semibold')
    h.paragraph_format.space_before = Pt(16 if name == 'Heading 1' else 10); h.paragraph_format.space_after = Pt(6)


def shade(cell, hex_):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd'); shd.set(qn('w:val'), 'clear'); shd.set(qn('w:color'), 'auto'); shd.set(qn('w:fill'), hex_)
    tcPr.append(shd)


def borders(table, color='C9D3E0'):
    tblPr = table._tbl.tblPr
    b = OxmlElement('w:tblBorders')
    for side in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        e = OxmlElement(f'w:{side}'); e.set(qn('w:val'), 'single'); e.set(qn('w:sz'), '4'); e.set(qn('w:color'), color)
        b.append(e)
    tblPr.append(b)


def para(text='', bold_prefix=None, size=None, color=None, after=None, style=None):
    p = doc.add_paragraph(style=style)
    if bold_prefix:
        r = p.add_run(bold_prefix); r.bold = True
        if color: r.font.color.rgb = color
    r = p.add_run(text)
    if size: r.font.size = Pt(size)
    if color: r.font.color.rgb = color
    if after is not None: p.paragraph_format.space_after = Pt(after)
    return p


def bullet(text, bold_prefix=None):
    p = para(text, bold_prefix, style='List Bullet'); p.paragraph_format.space_after = Pt(3)
    return p


def callout(title, text, fill='EAF1FB', edge='1F4E8C'):
    t = doc.add_table(rows=1, cols=1); t.alignment = WD_TABLE_ALIGNMENT.CENTER
    c = t.cell(0, 0); shade(c, fill); borders(t, edge)
    p = c.paragraphs[0]; r = p.add_run(title); r.bold = True; r.font.color.rgb = BLUE
    p2 = c.add_paragraph(text); p2.paragraph_format.space_after = Pt(2)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def table(head, rows, widths, center_cols=()):
    t = doc.add_table(rows=1, cols=len(head)); t.alignment = WD_TABLE_ALIGNMENT.CENTER
    borders(t)
    for i, h in enumerate(head):
        c = t.rows[0].cells[i]; shade(c, '1F4E8C')
        r = c.paragraphs[0].add_run(h); r.bold = True; r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF); r.font.size = Pt(9.5)
    for k, row in enumerate(rows):
        cells = t.add_row().cells
        for i, v in enumerate(row):
            p = cells[i].paragraphs[0]
            if isinstance(v, tuple): r = p.add_run(v[0]); r.bold = True
            else: r = p.add_run(str(v))
            r.font.size = Pt(9.5)
            if i in center_cols: p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            if k % 2: shade(cells[i], 'F4F7FB')
    for row in t.rows:
        for i, w in enumerate(widths): row.cells[i].width = Cm(w)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return t


# --- текст ------------------------------------------------------------------
t = doc.add_paragraph(); r = t.add_run('Тип нежилого здания'); r.font.size = Pt(22); r.font.color.rgb = BLUE
r.font.name = 'Segoe UI Semibold'
s = doc.add_paragraph(); r = s.add_run('как его определяет система'); r.font.size = Pt(13); r.font.color.rgb = GREY
s.paragraph_format.space_after = Pt(14)

para('Тип нежилого здания определяется в два шага. Сначала у каждой литеры здания указывают её тип — по фото с осмотра. '
     'Затем система сама считает тип всего здания: смотрит, какая часть внутренней площади приходится на литеры каждого типа.')

steps = doc.add_table(rows=1, cols=3); steps.alignment = WD_TABLE_ALIGNMENT.CENTER
for i, (title, text) in enumerate([('Шаг 1 · литера', 'Тип каждой литеры указывает человек: гражданская, производственно-складская или прочие.'),
                                    ('→', ''),
                                    ('Шаг 2 · здание', 'Тип здания считает система по долям внутренней площади литер.')]):
    c = steps.cell(0, i)
    if i != 1: shade(c, 'EAF1FB')
    p = c.paragraphs[0]; p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    rr = p.add_run(title); rr.bold = True; rr.font.color.rgb = BLUE; rr.font.size = Pt(12 if i != 1 else 20)
    if text:
        p2 = c.add_paragraph(text); p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
for i, w in enumerate((7.2, 1.2, 7.2)):
    steps.rows[0].cells[i].width = Cm(w)
doc.add_paragraph()

doc.add_heading('Шаг 1. Тип литеры', level=1)
para('Литеру заводят просто как «Здание». Её тип указывают позже, внутри карточки литеры, в блоке «Тип и класс капитальности» — '
     'по тому, что видно на фото. Назначение по техпаспорту служит только ориентиром: в техпаспорте его часто нет, '
     'написано просто «здание» или указано неверно.')
para('Типов три:')
ex = lambda k, n=5: '; '.join(PURPOSES[k][:n]) + ' и др.'
table(['Тип литеры', 'Что это', 'Назначение по факту — примеры'], [
    (('Гражданская',), 'Помещения для людей: офисы, торговля, услуги, учреждения', ex('civil')),
    (('Производственно-складская',), 'Цеха, склады и всё, что служит производству и технике', ex('prod')),
    (('Прочие',), 'Некапитальные и хозяйственные строения', ex('other')),
], (4.2, 5.4, 6.8))
para('После выбора типа указывают назначение по факту — из перечня своего типа.')

doc.add_heading('Если в одной литере части разного типа', level=2)
para('Бывает, что в одном здании, например, общежитие и цех. Тогда литеру делят на подгруппы помещений. '
     'У каждой подгруппы свой тип и своя площадь. Литера в целом показывает тип своей самой большой подгруппы, '
     'а в расчёт типа здания (шаг 2) идёт каждая подгруппа отдельно.')

doc.add_heading('Что ещё важно', level=2)
bullet('пункт «Прочее строение» в меню «+ Добавить ОИ» сразу заводит литеру с типом «Прочие»;', None)
bullet('литера «Жилой дом» — жилая, у неё нет типа нежилой литеры, и в расчёт типа нежилого здания она не входит.', None)

doc.add_heading('Шаг 2. Тип здания', level=1)
para('Тип здания (объекта оценки) считает система — вручную он не выбирается и пересчитывается сам, '
     'когда меняются типы или площади литер.')
para('Как считается:')
for i, s_ in enumerate([
    'берётся внутренняя площадь (по внутреннему обмеру) каждой литеры, у которой выбран тип; если литера разделена на подгруппы — площадь каждой подгруппы;',
    'площади складываются по трём типам;',
    'для каждого типа считается его доля в общей площади;',
    'тип учитывается, если его доля не меньше 28⅓ %.',
], 1):
    para(s_, f'{i}. ', after=3)
callout('Почему 28⅓ %',
        'Типов три, значит «честная» доля каждого — треть, 33⅓ %. Допуск — 5 %: тип засчитывается, если его доля хотя бы 33⅓ − 5 = 28⅓ %.')

para('Что получается:')
table(['Сколько типов учтено', 'Тип здания'], [
    ('Один', 'Гражданское · Производственное · Прочие'),
    ('Два', 'Гражданское, производственное · Гражданское, прочие · Производственное, прочие'),
    ('Три', 'Смешанное'),
    ('Ни одного (нет литер с выбранным типом или у них нет площади)', 'Нежилое здание · тип не определён'),
], (6.4, 10))

doc.add_heading('Что в расчёт не входит', level=2)
for s_ in ['литеры, у которых тип ещё не выбран (система показывает, сколько их);',
           'жилые дома;',
           'вспомогательные постройки;',
           'земельный участок;',
           'механизмы и оборудование, транспортные средства.']:
    bullet(s_)

doc.add_heading('Примеры', level=1)
para('Площадь — внутренняя, м². Тип здания посчитан тем же правилом, что в системе.')
rows = []
for c, p, o in [(700, 200, 100), (450, 450, 100), (300, 600, 100), (250, 600, 150), (340, 330, 330), (0, 500, 0)]:
    tot = c + p + o
    sh = lambda v: f'{v / tot * 100:.0f} %'.replace('.', ',')
    rows.append((f'{c}', f'{p}', f'{o}', f'{sh(c)} / {sh(p)} / {sh(o)}', (typology({'civil': c, 'prod': p, 'other': o}),)))
table(['Гражданская', 'Производ.-складская', 'Прочие', 'Доли', 'Тип здания'], rows, (2.6, 3.2, 2.2, 4.0, 4.4), (0, 1, 2, 3))
para('Третий пример показывает порог: гражданской площади всего 30 %, но это больше 28⅓ %, поэтому тип засчитан — '
     'здание «Гражданское, производственное». В четвёртом гражданской 25 % — меньше порога, и здание просто «Производственное».',
     size=9.5, color=GREY)

doc.add_heading('Где тип виден в системе', level=1)
bullet('в шапке карточки объекта оценки — поле «Тип ОЦ»; при наведении видны доли каждого типа и сколько литер без типа;', None)
bullet('в реестре объектов — столбец «Тип ОЦ» и фильтр по нему;', None)
bullet('в сводной по капитальности под перечнем объектов имущества — тип и площадь каждой литеры и подгруппы.', None)

os.makedirs(os.path.dirname(a.out), exist_ok=True)
doc.save(a.out)
print('→', a.out)
