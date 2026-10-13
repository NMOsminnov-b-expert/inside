# -*- coding: utf-8 -*-
"""Состав недвижимости: что есть в каждом ОЦ и его ОИ, с коэффициентами.

Запрос пользователя 13.10.2026 (срочно): «по всей недвижке получить отчёт.
Что и в каких ОЦ + ОИ имеется. (Если это какие-то коэффициенты, то,
соответственно, и их значения). Каждый ОЦ на своей странице в excel».

Состав снимается с живых экранов (сборщик справочника полей
build_reference.py: витрина и форма каждого типа ОЦ, карточки всех видов ОИ),
коэффициенты — из кода карточек (coef_dump.mjs: признаки класса
капитальности, границы классов, шкала технического состояния). Вкладка
«Сравнительный подход» не берётся — она спрятана и под вопросом.

    python tools/docs/build_otchet_nedvizhimost.py   → docs/sostav-nedvizhimosti.xlsx
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import build_reference as ref  # noqa: E402

OUT = os.path.join(ROOT, 'docs', 'sostav-nedvizhimosti.xlsx')
# Литеры с классом капитальности и шкалой состояния (civil/oi/building).
BUILDING_KINDS = {'Гражданское здание': 'civil', 'Производственное строение': 'prod', 'Прочее строение': 'other'}
SHEET = {'Жилое здание (квартира)': 'Квартира', 'Жилое здание (дом)': 'Жилой дом',
         'Нежилое здание': 'Нежилое здание', 'Земельный участок': 'Земельный участок'}
COLS = ['Уровень', 'Вид ОИ', 'Блок', 'Поле / признак', 'Вид значения', 'Ед.', 'Значения (варианты)', 'Коэффициент', 'Пояснение']
WIDTHS = [11, 24, 30, 34, 16, 7, 46, 12, 60]


def num(v):
    return ('%g' % v).replace('.', ',') if isinstance(v, (int, float)) else str(v)


def field_rows(level, kind, blocks, seen):
    rows = []
    for b in blocks:
        head = ((b['номер'] + ' ') if b['номер'] else '') + b['заголовок']
        for f in b['поля']:
            label = f['подпись'] or ('(' + ref.key(f['ключ']) + ')')
            mark = (b['заголовок'], label)
            if mark in seen:
                continue
            seen.add(mark)
            vals = [v for v in (f['значения'] or []) if v and v != '—']
            rows.append([level, kind, head, label, f['вид'] + (' · в таблице' if f['в_таблице'] else ''),
                         f['единица'], '\n'.join(vals), '', f['пояснение']])
        for cols in b['таблицы']:
            mark = (b['заголовок'], 'таблица:' + '|'.join(cols))
            if mark in seen:
                continue
            seen.add(mark)
            rows.append([level, kind, head, 'Таблица — колонки', 'таблица', '', '\n'.join(cols), '', ''])
    return rows


def coef_rows(kind, key, coef):
    rows = []
    blk = 'Класс капитальности — признаки (считает система)'
    for sign in coef['signs'].get(key, []):
        if sign.get('height'):
            for top, k, label in sign['height']:
                rows.append(['ОИ', kind, blk, sign['label'], 'число из замеров', 'м', label, num(k), 'диапазон высоты'])
        for opt in sign.get('options', []):
            rows.append(['ОИ', kind, blk, sign['label'] + (' (можно несколько — среднее)' if sign.get('multi') else ''),
                         'выбор', '', opt[0], num(opt[1]), opt[2] if len(opt) > 2 else ''])
    if key in coef['signs']:
        for lo, hi, cls in coef['pockets']:
            rows.append(['ОИ', kind, 'Класс капитальности — границы', 'К (произведение коэффициентов)', 'расчёт', '',
                         'класс %s' % cls, ('%s–%s' % (num(lo) if lo is not None else '0', num(hi))), 'граница — в класс выше'])
    else:
        rows.append(['ОИ', kind, 'Класс капитальности', 'К', 'расчёт', '', 'прочие постройки', '0,05', 'фиксированное значение для прочих'])
    for s in coef['condition']:
        rows.append(['ОИ', kind, 'Шкала технического состояния', 'Состояние', 'выбор', '%', s['label'],
                     num(s['rank']) if s.get('rank') is not None else '',
                     'износ %s–%s %%, средний %% ремонта %s; коэффициент — ранг состояния' % (s['wearFrom'], s['wearTo'], num(s['repair']))])
    return rows


def main():
    coef = json.loads(subprocess.run(['node', os.path.join(HERE, 'coef_dump.mjs')], cwd=ROOT,
                                     capture_output=True, check=True).stdout.decode('utf-8'),
                      parse_constant=None)
    data = ref.collect()
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter
    wb = Workbook()
    wb.remove(wb.active)
    head_fill = PatternFill('solid', fgColor='DCE9F7')
    oc_fill = PatternFill('solid', fgColor='F3F6FA')
    head_font = Font(bold=True, color='1F3A5F')
    wrap = Alignment(vertical='top', wrap_text=True)
    for _, _, title in ref.MODULES:
        ws = wb.create_sheet(SHEET[title])
        ws.append(COLS)
        for c in range(1, len(COLS) + 1):
            cell = ws.cell(row=1, column=c)
            cell.fill, cell.font = head_fill, head_font
            cell.alignment = Alignment(vertical='center', wrap_text=True)
        oc = data['ОЦ'][title]
        seen = set()
        rows = field_rows('ОЦ', '', oc['блоки'], seen) + field_rows('ОЦ', '', oc.get('форма', []), seen)
        for kind, per_oc in data['ОИ'].items():
            if title not in per_oc:
                continue
            rows += field_rows('ОИ', kind, per_oc[title]['блоки'], set())
            if kind in BUILDING_KINDS:
                rows += coef_rows(kind, BUILDING_KINDS[kind], coef)
        for r in rows:
            ws.append(r)
            if r[0] == 'ОЦ':
                for c in range(1, len(COLS) + 1):
                    ws.cell(row=ws.max_row, column=c).fill = oc_fill
        for i, w in enumerate(WIDTHS, 1):
            ws.column_dimensions[get_column_letter(i)].width = w
        for row in ws.iter_rows(min_row=2):
            for cell in row:
                cell.alignment = wrap
        ws.freeze_panes = 'A2'
        ws.auto_filter.ref = 'A1:%s%d' % (get_column_letter(len(COLS)), ws.max_row)
        print('  %-26s строк %d' % (SHEET[title], ws.max_row - 1))
    wb.save(OUT)
    print('записано:', os.path.relpath(OUT, ROOT))


if __name__ == '__main__':
    main()
