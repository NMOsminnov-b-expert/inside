# -*- coding: utf-8 -*-
"""Что изменилось в макете после появления ПУД у собственников и пользователей.

Срез — с коммита 6128e1c (10.09.2026), которым поле ПУД появилось в блоке
сторон, по текущее состояние ветки. Документ отвечает на вопрос «что стало», а
не пересказывает историю правок, поэтому из журнала изменений берётся не всё:

  * транспортные средства и механизмы разбираются отдельно;
  * служебное — уборка кода, проверки, документы, граф знаний, слияния веток;
  * косметика — отступы, края блоков, подложки, тихие поля, значки;
  * «Распространено» — та же правка в остальных типах ОЦ: в документе она
    названа один раз, там, где сделана;
  * местоположение и демо-данные — решение пользователя 22.09.2026.

Отбор ручной, списками ниже: по формулировке журнала машина не отличит
заметное пользователю от служебного.

    python tools/docs/build_audit_posle_pud.py

На выходе — docs/audit-posle-pud.docx (локальный файл, никуда не выгружается).
"""
import glob
import io
import json
import os
import re
import subprocess
import sys

from docx import Document
from docx.shared import Pt

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DOCS = os.path.join(ROOT, 'docs')
OUT = os.path.join(DOCS, 'audit-posle-pud.docx')

sys.path.insert(0, os.path.join(ROOT, 'tools', 'docs'))
import change_log_data as LOG  # noqa: E402

PUD_COMMIT = '6128e1c'
PUD_DATE = '20260910'

# --- что не попадает в документ ----------------------------------------------
DROP_SECTIONS = {
    'Механизмы', 'ТС', 'ТС (ОЦ)', 'ТС (ОИ)', 'ТС и механизмы',   # отдельный разбор
    'Демо-данные', 'Карточка ОЦ: местоположение',                # решение 22.09.2026
    'Документы', 'Документы ТЗ', 'Проверки', 'Код', 'Правила',   # служебное
    'Граф знаний', 'Ветки', 'Прочее', 'Лог правок', 'Оформление',
    'Шапка сайта', 'Таблицы карточки ОИ',
}
DROP_KINDS = {'Распространено', 'Уборка кода', 'Проверки', 'Документы',
              'Граф знаний', 'Правила работы', 'Слияние веток', 'Оформление'}
# Отдельные записи: косметика и технические переносы, которых пользователь не
# видит. Ключ — начало формулировки из журнала.
DROP_ROWS = (
    'Над закреплённой плашкой',              # просвечивание полей при прокрутке
    'Между блоками карточки ОИ появились',   # промежутки между блоками
    'Шапка и блоки 01, 02, 03 — по одному',  # общий край
    'Верх блока 01 выровнен',                # отступ
    'Под закреплённой шапкой — подложка',    # подложка и растворение
    'Просмотрщик перенесён из модуля',       # перенос в ядро
    'Внутренние стили просмотрщика',
    'Шкала статусов (данные, разметка',
    'Стили шапки ОЦ, шкалы статусов',
    'Общее оформление карточек ОЦ',
    'Классы режимов просмотрщика',
    'Значки состояния в строке реестра',
    'Число с единицей измерения',
    'Набор возможностей задаётся окружением',
)

# Разделы журнала названы по экранам макета; в документе они называются по
# объектам, с которыми работает пользователь (требование 22.09.2026).
SECTIONS = [
    ('Объект оценки', ['Карточка ОЦ']),
    ('Объект оценки: учреждение, собственники и ответственные', ['Карточка ОЦ: стороны']),
    ('Объект оценки: шапка и статусы', ['Карточка ОЦ: шапка', 'Карточка ОЦ: статусы']),
    ('Объект оценки: перечень объектов имущества', ['Перечень ОИ']),
    ('Объект имущества: здание', ['Карточка литеры', 'Карточка литеры: площади']),
    ('Объект имущества: квартира', ['Квартира']),
    ('Объект имущества: земельный участок', ['Карточка участка']),
    ('Объект имущества: общее для всех видов', ['Карточки ОИ', 'Карточки ОЦ и ОИ']),
    ('Пристройки', ['Пристройки']),
    ('Поэтажная развёртка', ['Поэтажная развёртка']),
    ('Инженерные сети', ['Инженерные сети']),
    ('Фотографии', ['Фото']),
    ('Ввод чисел', ['Числовые поля']),
    ('Просмотрщик документов и фотографий',
     ['Просмотрщик', 'Просмотрщик: документы', 'Просмотрщик: отдельное окно']),
    ('Реестр объектов оценки', ['Реестр ОЦ']),
    ('Экраны осмотрщика', ['Экраны осмотрщика']),
    ('Название системы', ['Интерфейс']),
]

# Открытые вопросы, которые пользователь на экране не увидит: они про код.
DROP_OPEN = (
    'Разряды в макете разделяются',
    'Разбор 17.09.2026 по запросу пользователя',
    'На листе «Схема движки»',
)

# Записи графа про транспорт и механизмы — в отдельный разбор.
SKIP_WORDS = re.compile('|'.join([
    'механизм', 'mekhanizm', 'mehanizm', 'спецтехн', 'spectehn', 'транспорт',
    'автомобил', 'vehicle', r'(?<![а-яa-z])тс(?![а-яa-z])', r'(?<![a-z])ts-',
    r'(?<![a-z])vin(?![a-z])',
]))


def commit_date(sha):
    out = subprocess.run(['git', 'log', '-1', '--format=%ad', '--date=short', sha],
                         cwd=ROOT, capture_output=True)
    return out.stdout.decode('utf-8').strip()


def rows_after():
    start = next(i for i, r in enumerate(LOG.CHANGES) if r['c'] == PUD_COMMIT) + 1
    out = []
    for r in LOG.CHANGES[start:]:
        if r['where'] in DROP_SECTIONS or r['kind'] in DROP_KINDS:
            continue
        if any(r['what'].startswith(x) for x in DROP_ROWS):
            continue
        out.append(r)
    return out


def renames_after():
    start = next((i for i, r in enumerate(LOG.RENAMES) if r[0] == 'c9d5d58'), 0)
    return [r for r in LOG.RENAMES[start:]
            if not any(s in r[1] for s in ('Механизм', 'ТС'))]


def decisions():
    """Решения, принятые за период. Практики и правила работы — служебное."""
    out, seen = [], set()
    for f in sorted(glob.glob(os.path.join(ROOT, '.claude', 'knowledge-graph', 'log', '*.json'))):
        if os.path.basename(f) < PUD_DATE:
            continue
        for e in json.load(io.open(f, encoding='utf-8')).get('entities', []):
            if e.get('entityType') not in ('Decision', 'OpenQuestion'):
                continue
            text = (e.get('observations') or [''])[0]
            if SKIP_WORDS.search((e['name'] + ' ' + text).lower()) or e['name'] in seen:
                continue
            seen.add(e['name'])
            out.append((e['entityType'], text))
    return out


# --- разметка -----------------------------------------------------------------
def h(doc, text, level):
    doc.add_heading(text, level=level)


def p(doc, text):
    doc.add_paragraph(text)


def bullets(doc, items):
    for it in items:
        doc.add_paragraph(it, style='List Bullet')


def table(doc, head, rows):
    t = doc.add_table(rows=1, cols=len(head))
    t.style = 'Light Grid Accent 1'
    for i, name in enumerate(head):
        t.rows[0].cells[i].text = name
    for r in rows:
        cells = t.add_row().cells
        for i, v in enumerate(r):
            cells[i].text = str(v if v is not None else '')


def build():
    rows = rows_after()
    ren = renames_after()
    notes = decisions()

    doc = Document()
    doc.styles['Normal'].font.size = Pt(10)

    h(doc, 'Макет после появления ПУД у собственников и пользователей', 0)
    p(doc, 'Что изменилось с %s по текущую версию. Перечислено то, что видно в работе: '
           'поля, перечни, поведение экранов. Уборка кода, проверки, документы и косметика '
           'не перечисляются; транспортные средства и механизмы разбираются отдельно.'
      % commit_date(PUD_COMMIT))

    used = 0
    for title, keys in SECTIONS:
        here = [r for r in rows if r['where'] in keys]
        if not here:
            continue
        used += len(here)
        h(doc, title, 1)
        bullets(doc, [r['what'] for r in here])

    known = {k for _, keys in SECTIONS for k in keys}
    other = [r for r in rows if r['where'] not in known]
    if other:
        h(doc, 'Прочее', 1)
        bullets(doc, ['%s: %s' % (r['where'], r['what']) for r in other])

    h(doc, 'Переименованные поля', 1)
    p(doc, 'По этим строкам сверяют подписи в остальных карточках.')
    table(doc, ['Где', 'Было', 'Стало'], [[r[1], r[2], r[3]] for r in ren])

    # Решения и основания в документ не идут: он о том, что стало, а не о том,
    # почему так решили (требование пользователя 22.09.2026).
    dec = []
    opened = [t for k, t in notes if k == 'OpenQuestion'
              and not any(t.startswith(x) for x in DROP_OPEN)]
    if opened:
        h(doc, 'Осталось нерешённым', 1)
        bullets(doc, opened)

    if not os.path.isdir(DOCS):
        os.makedirs(DOCS)
    doc.save(OUT)
    return {'пунктов': len(rows), 'в разделах': used, 'вне разделов': len(other),
            'переименований': len(ren), 'решений': len(dec), 'открытых': len(opened)}


if __name__ == '__main__':
    res = build()
    print('docs/audit-posle-pud.docx собран')
    for k, v in res.items():
        print('  %-18s %s' % (k, v))
