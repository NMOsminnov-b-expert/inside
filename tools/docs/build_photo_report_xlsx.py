# -*- coding: utf-8 -*-
"""Отчёт по фото регионалов в Excel: разобранное — отдельно, косяки — по листу на область.

У каждой строки — ссылки на папку с фото и на папку объекта: щелчок открывает папку в
проводнике (диск Y:). Разбор путей — тот же, что в аудите (photo_audit/).

Листы:
  Сводка          — по областям: сколько разобрано, сколько косяков, по каким причинам;
  Разобрано       — папки, которые уходят в литеру автоматически (уровни A, B), с пометкой,
                    что сверить (адрес только до села, вложенный объект, «Литер А 1»);
  <область>       — косяки области: папки, которые не разбираются автоматически, с причиной
                    и тем, что сделать; сгруппированы по причине и объекту;
  Не недвижимость — транспорт, оборудование и снимки документов: у них свой маршрут.

    python tools/docs/build_photo_report_xlsx.py

На выходе — «Анализ по фото регионалов/отчёт_фото_по_областям.xlsx» (локальный файл).
"""
import os
import sys
import collections as C

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.hyperlink import Hyperlink

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'photo_audit'))
from common import SRC_DIR, BS, PREF  # noqa: E402
from parse import parse_all, MANUAL, CHECK, manual_reason, check_reasons, object_key  # noqa: E402

OUT = os.path.join(SRC_DIR, 'отчёт_фото_по_областям.xlsx')
# в перечне пути записаны с префиксом длинных путей «\\?\»; для ссылки в проводник он не нужен
ROOT = PREF[4:]
LONG = 259      # длиннее — проводник Windows может не открыть папку по ссылке
AUTO = ('A', 'A*', 'B', 'B*')
SHORT = {'Баткенская область': 'Баткен', 'Джалал-Абадская область': 'Джалал-Абад', 'Иссык-Кульская область': 'Иссык-Куль',
         'Нарынская область': 'Нарын', 'Ошская область': 'Ош', 'Таласская область': 'Талас', 'Чуйская область': 'Чуй'}
MAN = {k: (label, do) for k, label, do in MANUAL}
MAN_ORDER = {k: i for i, (k, _, _) in enumerate(MANUAL)}
CHK = {k: label for k, label, _ in CHECK}
TIER_TEXT = {'A': 'литера и категория', 'A*': 'литера и категория, адрес до села', 'B': 'литера, категория «Прочее»',
             'B*': 'литера, категория «Прочее», адрес до села'}
ADDR = {'full': 'улица и номер', 'place': 'только населённый пункт', 'name': 'только название'}
KIND = {'X-ТС': 'Транспорт', 'X-EQP': 'Оборудование', 'X-DOC': 'Снимки документов'}

HEAD_FILL = PatternFill('solid', fgColor='1F4E5F')
GROUP_FILL = PatternFill('solid', fgColor='E8EEF1')
WARN_FILL = PatternFill('solid', fgColor='FFF2CC')
HEAD_FONT = Font(color='FFFFFF', bold=True, size=10)
CELL_FONT = Font(size=10)
BOLD_FONT = Font(size=10, bold=True)
LINK_FONT = Font(size=10, color='0563C1', underline='single')
THIN = Side(style='thin', color='D9D9D9')
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
TOC = 'Сводка'


def full_path(parts):
    return ROOT + BS.join(parts)


def folder_link(cell, path, text):
    """Ссылка на папку: щелчок открывает её в проводнике."""
    cell.value = text
    cell.hyperlink = Hyperlink(ref=cell.coordinate, target=path, display=text)
    cell.font = LINK_FONT


def sheet_link(cell, name):
    cell.hyperlink = Hyperlink(ref=cell.coordinate, location="'%s'!A1" % name, display=str(cell.value))
    cell.font = LINK_FONT


def make_sheet(wb, title, cols, freeze='A2'):
    ws = wb.create_sheet(title)
    ws.append([c for c, _ in cols])
    for i, (_, w) in enumerate(cols, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
        c = ws.cell(row=1, column=i)
        c.font, c.fill, c.border = HEAD_FONT, HEAD_FILL, BORDER
        c.alignment = Alignment(vertical='center', wrap_text=True)
    ws.row_dimensions[1].height = 30
    ws.freeze_panes = freeze
    return ws


def style_row(ws, r, ncols, fill=None, bold=False):
    for i in range(1, ncols + 1):
        c = ws.cell(row=r, column=i)
        c.border = BORDER
        c.alignment = Alignment(vertical='top', wrap_text=True)
        if c.hyperlink is None:
            c.font = BOLD_FONT if bold else CELL_FONT
        if fill:
            c.fill = fill


def add_row(ws, values, links, ncols, fill=None, bold=False):
    """values — значения колонок; links — {номер колонки: (путь, подпись)}."""
    ws.append(list(values))
    r = ws.max_row
    for col, (path, text) in links.items():
        folder_link(ws.cell(row=r, column=col), path, text)
    style_row(ws, r, ncols, fill, bold)
    return r


def finish(ws, ncols):
    ws.auto_filter.ref = 'A1:%s%d' % (get_column_letter(ncols), ws.max_row)
    back = ws.cell(row=1, column=ncols + 1, value='← Сводка')
    sheet_link(back, TOC)
    ws.column_dimensions[get_column_letter(ncols + 1)].width = 12


def links_of(p):
    """Ссылки на папку и на папку объекта; пометка, если путь слишком длинный для проводника."""
    fp = full_path([p['obl'], p['dist']] + p['segs'])
    op = full_path(list(object_key(p)))
    obj_name = object_key(p)[-1]
    note = 'путь длиннее 260 знаков — проводник может не открыть' if len(fp) > LONG else ''
    return fp, op, obj_name, note


def build():
    P = parse_all()
    oblasts = sorted({p['obl'] for p in P}, key=lambda o: SHORT[o])
    wb = Workbook()
    toc = wb.active
    toc.title = TOC

    # --- разобрано ----------------------------------------------------------------------------
    cols = [('Область', 13), ('Район', 18), ('Заказчик', 26), ('Объект (открыть папку)', 36),
            ('Папка с фото (открыть)', 30), ('Литера', 8), ('Категория', 16), ('Этаж', 9), ('Что уходит', 22),
            ('Адрес объекта', 14), ('ЕНИ', 16), ('Сверить', 34), ('Полный путь', 90), ('Примечание', 22)]
    ws = make_sheet(wb, 'Разобрано', cols, freeze='E2')
    done = sorted((p for p in P if p['tier'] in AUTO), key=lambda p: (SHORT[p['obl']], p['dist'], object_key(p), p['segs']))
    for p in done:
        fp, op, obj_name, note = links_of(p)
        chk = '; '.join(CHK[c] for c in check_reasons(p))
        add_row(ws, [SHORT[p['obl']], p['dist'], p.get('org') or '', None, None, ', '.join(p['lits']),
                     ', '.join(p['cats']) or ('Внутр. помещения' if p['floor'] else 'Прочее' if p['lits'] else ''),
                     p['floor'] or '', TIER_TEXT[p['tier']], ADDR.get(p['addr_q'], ''), p.get('eni') or '', chk, fp, note],
                {4: (op, obj_name), 5: (fp, p['segs'][-1])}, len(cols), fill=WARN_FILL if chk else None)
    finish(ws, len(cols))

    # --- косяки по областям --------------------------------------------------------------------
    kcols = [('Причина', 30), ('Что сделать', 34), ('Район', 18), ('Заказчик', 26), ('Объект (открыть папку)', 36),
             ('Папка с фото (открыть)', 30), ('Найдено в пути', 18), ('Адрес объекта', 14), ('Полный путь', 90),
             ('Примечание', 22)]
    summary = {}
    for o in oblasts:
        bad = [p for p in P if p['obl'] == o and manual_reason(p)]
        bad.sort(key=lambda p: (MAN_ORDER[manual_reason(p)], p['dist'], object_key(p), p['segs']))
        ws = make_sheet(wb, SHORT[o], kcols, freeze='F2')
        cur = None
        for p in bad:
            code = manual_reason(p)
            label, do = MAN[code]
            if code != cur:
                n = sum(manual_reason(q) == code for q in bad)
                m = len({object_key(q) for q in bad if manual_reason(q) == code})
                add_row(ws, ['%s — папок %d, объектов %d' % (label, n, m), do] + [''] * (len(kcols) - 2), {},
                        len(kcols), fill=GROUP_FILL, bold=True)
                cur = code
            fp, op, obj_name, note = links_of(p)
            found = ', '.join(x for x in ['литеры ' + ', '.join(p['lits']) if p['lits'] else '',
                                          ', '.join(p['cats']), p['floor'] or ''] if x)
            add_row(ws, [label, do, p['dist'], p.get('org') or '', None, None, found, ADDR.get(p['addr_q'], 'не найден'),
                         fp, note], {5: (op, obj_name), 6: (fp, p['segs'][-1])}, len(kcols))
        finish(ws, len(kcols))
        summary[o] = bad

    # --- не недвижимость -----------------------------------------------------------------------
    xcols = [('Что это', 16), ('Область', 13), ('Район', 18), ('Заказчик', 26), ('Папка с фото (открыть)', 40),
             ('Полный путь', 90), ('Примечание', 22)]
    ws = make_sheet(wb, 'Не недвижимость', xcols, freeze='E2')
    other = sorted((p for p in P if p['tier'] in KIND), key=lambda p: (p['tier'], SHORT[p['obl']], p['dist'], p['segs']))
    for p in other:
        fp, _, _, note = links_of(p)
        add_row(ws, [KIND[p['tier']], SHORT[p['obl']], p['dist'], p.get('org') or '', None, fp, note],
                {5: (fp, p['segs'][-1])}, len(xcols))
    finish(ws, len(xcols))

    # --- сводка ---------------------------------------------------------------------------------
    head = ['Область', 'Папок всего', 'Недвижимость', 'Разобрано', 'Доля разобранного', 'Из них сверить', 'Косяков',
            'Объектов с косяками'] + [label for _, label, _ in MANUAL] + ['Транспорт', 'Оборудование', 'Снимки документов']
    toc.append(head)
    for i, h in enumerate(head, start=1):
        c = toc.cell(row=1, column=i)
        c.font, c.fill, c.border = HEAD_FONT, HEAD_FILL, BORDER
        c.alignment = Alignment(vertical='center', wrap_text=True)
        toc.column_dimensions[get_column_letter(i)].width = 14 if i > 1 else 16
    toc.row_dimensions[1].height = 75
    for o in oblasts + [None]:
        xs = [p for p in P if o is None or p['obl'] == o]
        re_ = [p for p in xs if p['tier'] not in KIND]
        ok = [p for p in xs if p['tier'] in AUTO]
        bad = [p for p in xs if manual_reason(p)]
        rc = C.Counter(manual_reason(p) for p in bad)
        t = C.Counter(p['tier'] for p in xs)
        row = [SHORT[o] if o else 'Все области', len(xs), len(re_), len(ok), len(ok) / len(re_) if re_ else 0,
               sum(1 for p in ok if check_reasons(p)), len(bad), len({object_key(p) for p in bad})] + \
              [rc[k] for k, _, _ in MANUAL] + [t['X-ТС'], t['X-EQP'], t['X-DOC']]
        toc.append(row)
        r = toc.max_row
        style_row(toc, r, len(head), fill=GROUP_FILL if o is None else None, bold=o is None)
        for i in range(2, len(head) + 1):
            c = toc.cell(row=r, column=i)
            c.alignment = Alignment(horizontal='right', vertical='top')
            c.number_format = '0%' if i == 5 else '#,##0'
        if o:
            sheet_link(toc.cell(row=r, column=1), SHORT[o])
    toc.freeze_panes = 'B2'
    r = toc.max_row + 2
    toc.cell(row=r, column=1, value='Листы').font = BOLD_FONT
    for name, what in [('Разобрано', 'папки, которые уходят в литеру автоматически; жёлтые — сверить найденное'),
                       *[(SHORT[o], 'косяки области по причинам: что не разбирается автоматически и что сделать')
                         for o in oblasts],
                       ('Не недвижимость', 'транспорт, оборудование и снимки документов — свой маршрут импорта')]:
        r += 1
        c = toc.cell(row=r, column=1, value=name)
        sheet_link(c, name)
        toc.cell(row=r, column=2, value=what).font = CELL_FONT
    r += 2
    toc.cell(row=r, column=1, value='Ссылки в колонках «Объект» и «Папка с фото» открывают папку в проводнике '
             '(диск Y:). Путь длиннее 260 знаков проводник может не открыть — такие строки помечены в «Примечании».'
             ).font = CELL_FONT
    wb.save(OUT)
    return len(done), sum(len(v) for v in summary.values()), len(other), sum(1 for p in P if len(links_of(p)[0]) > LONG)


if __name__ == '__main__':
    d, b, o, lng = build()
    print('разобрано: %d, косяков: %d, не недвижимость: %d, длинных путей: %d' % (d, b, o, lng))
    print('собрано: %s' % OUT)
