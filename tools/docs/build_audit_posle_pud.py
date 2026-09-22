# -*- coding: utf-8 -*-
"""Что изменилось в макете после появления ПУД у собственников и пользователей.

Срез берётся с коммита 6128e1c (10.09.2026) — им поле ПУД появилось в блоке
сторон — и до текущего состояния ветки. Транспортные средства и механизмы из
среза исключены: они разбираются отдельно.

Источники — те же, что и у самого макета: журнал изменений
(tools/docs/change_log_data.py, он же собирается в docs/reestr-izmeneniy.xlsx),
история git и записи графа знаний (.claude/knowledge-graph/log/*.json).
Поэтому документ пересобирается одной командой и не расходится с макетом.

    python tools/docs/build_audit_posle_pud.py

На выходе — docs/audit-posle-pud.docx (локальный файл, никуда не выгружается).
"""
import glob
import io
import re
import json
import os
import subprocess
import sys

from docx import Document
from docx.shared import Pt

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DOCS = os.path.join(ROOT, 'docs')
OUT = os.path.join(DOCS, 'audit-posle-pud.docx')

sys.path.insert(0, os.path.join(ROOT, 'tools', 'docs'))
import change_log_data as LOG  # noqa: E402

# Коммит, которым появилось поле ПУД, и дата графа для отбора записей.
PUD_COMMIT = '6128e1c'
PUD_DATE = '20260910'

# Разбирается отдельно — в срез не входит.
SKIP = {'Механизмы', 'ТС', 'ТС (ОЦ)', 'ТС (ОИ)', 'ТС и механизмы'}

# Те же темы в записях графа: имена узлов латиницей, текст — кириллицей.
SKIP_WORDS = re.compile('|'.join([
    'механизм', 'mekhanizm', 'mehanizm', 'спецтехн', 'spectehn', 'транспорт',
    'автомобил', 'vehicle', r'(?<![а-яa-z])тс(?![а-яa-z])', r'(?<![a-z])ts-',
    r'(?<![a-z])vin(?![a-z])',
]))

# Разделы журнала: что относится к составу данных, а что к поведению макета.
# Списком, а не догадкой по тексту: одна и та же формулировка может быть и про
# поле, и про механику, и разложить их может только человек.
FIELDS_SECTIONS = {
    'Карточка ОЦ', 'Карточка ОЦ: стороны', 'Карточка ОЦ: местоположение',
    'Карточка ОЦ: код ЕНИ', 'Карточка ОИ', 'Карточка ОИ: код ЕНИ', 'Карточки ОИ',
    'Карточка литеры', 'Карточка литеры: площади', 'Карточка участка', 'Квартира',
    'Перечень ОИ', 'Пристройки', 'Поэтажная развёртка', 'Инженерные сети',
    'Числовые поля', 'Справочники', 'Кадастр', 'Фото', 'Демо-данные',
}
MECHANICS_SECTIONS = {
    'Просмотрщик', 'Просмотрщик: документы', 'Просмотрщик: отдельное окно',
    'Карточка ОЦ: статусы', 'Карточка ОЦ: шапка', 'Карточки ОЦ и ОИ', 'Документы',
    'Учреждения', 'Архив', 'Реестр ОЦ', 'Сохранение', 'Лог правок', 'Интерфейс',
    'Шапка сайта', 'Оформление', 'Таблицы карточки ОИ', 'Экраны осмотрщика',
    'Форма осмотра',
}
SERVICE_SECTIONS = {'Код', 'Проверки', 'Правила', 'Граф знаний', 'Ветки', 'Прочее',
                    'Документы ТЗ'}


def commit_date(sha):
    out = subprocess.run(['git', 'log', '-1', '--format=%ad', '--date=short', sha],
                         cwd=ROOT, capture_output=True)
    return out.stdout.decode('utf-8').strip()


def commits_after(sha):
    out = subprocess.run(['git', 'rev-list', '--count', sha + '..HEAD'],
                         cwd=ROOT, capture_output=True)
    return out.stdout.decode('utf-8').strip()


def rows_after():
    """Записи журнала после строки про ПУД, кроме ТС и механизмов."""
    start = next(i for i, r in enumerate(LOG.CHANGES) if r['c'] == PUD_COMMIT) + 1
    return [r for r in LOG.CHANGES[start:] if r['where'] not in SKIP]


def renames_after():
    """Переименования, попавшие в тот же срез."""
    start = next((i for i, r in enumerate(LOG.RENAMES) if r[0] == 'c9d5d58'), 0)
    return [r for r in LOG.RENAMES[start:]
            if not any(s in r[1] for s in ('Механизм', 'ТС'))]


def graph_notes():
    """Решения, правила и открытые вопросы графа за тот же период."""
    out = {'Decision': [], 'Convention': [], 'OpenQuestion': []}
    seen = set()
    for f in sorted(glob.glob(os.path.join(ROOT, '.claude', 'knowledge-graph', 'log', '*.json'))):
        if os.path.basename(f) < PUD_DATE:
            continue
        data = json.load(io.open(f, encoding='utf-8'))
        for e in data.get('entities', []):
            kind = e.get('entityType')
            if kind not in out:
                continue
            text = (e.get('observations') or [''])[0]
            low = (e['name'] + ' ' + text).lower()
            # Отбрасываем записи про транспорт и механизмы — они разбираются
            # отдельно. Имена узлов латиницей, поэтому ищем и так, и так.
            if SKIP_WORDS.search(low):
                continue
            if e['name'] in seen:
                continue
            seen.add(e['name'])
            out[kind].append(text)
    return out


# --- разметка документа -------------------------------------------------------
def h(doc, text, level):
    doc.add_heading(text, level=level)


def p(doc, text, bold=False):
    par = doc.add_paragraph()
    run = par.add_run(text)
    run.bold = bold
    return par


def bullets(doc, items):
    for it in items:
        doc.add_paragraph(it, style='List Bullet')


def table(doc, head, rows, widths=None):
    t = doc.add_table(rows=1, cols=len(head))
    t.style = 'Light Grid Accent 1'
    for i, name in enumerate(head):
        t.rows[0].cells[i].text = name
    for r in rows:
        cells = t.add_row().cells
        for i, v in enumerate(r):
            cells[i].text = str(v if v is not None else '')
    return t


def section_table(doc, rows, sections):
    data = []
    for sec in sorted(sections):
        here = [r for r in rows if r['where'] == sec]
        for r in here:
            data.append([sec, r['kind'], r['what'], r['why'] or ''])
    table(doc, ['Раздел', 'Вид', 'Что изменилось', 'Основание'], data)
    return len(data)


def build():
    rows = rows_after()
    ren = renames_after()
    notes = graph_notes()

    doc = Document()
    doc.styles['Normal'].font.size = Pt(10)

    h(doc, 'Макет после появления ПУД у собственников и пользователей', 0)
    p(doc, 'Срез: с %s (коммит %s, поле ПУД в блоке сторон) по текущее состояние ветки '
           'refactor-TS. За это время в макет вошло коммитов: %s; записей журнала '
           'изменений: %d, из них %d — транспортные средства и механизмы, они здесь не '
           'разбираются.'
      % (commit_date(PUD_COMMIT), PUD_COMMIT, commits_after(PUD_COMMIT),
         len(rows) + sum(1 for r in LOG.CHANGES if r['where'] in SKIP),
         sum(1 for r in LOG.CHANGES if r['where'] in SKIP)))

    h(doc, 'Сводка по разделам', 1)
    counts = {}
    for r in rows:
        counts[r['where']] = counts.get(r['where'], 0) + 1
    table(doc, ['Раздел', 'Изменений'],
          sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])))

    h(doc, 'Состав данных: поля, справочники, перечни', 1)
    n_fields = section_table(doc, rows, FIELDS_SECTIONS & set(counts))

    h(doc, 'Переименования полей', 1)
    p(doc, 'По этим строкам сверяют подписи в остальных карточках: переименование, сделанное '
           'в одном типе ОЦ, обязано дойти до других.')
    table(doc, ['Где', 'Было', 'Стало'], [[r[1], r[2], r[3]] for r in ren])

    h(doc, 'Механики и поведение', 1)
    n_mech = section_table(doc, rows, MECHANICS_SECTIONS & set(counts))

    h(doc, 'Служебное: код, проверки, правила работы', 1)
    n_serv = section_table(doc, rows, SERVICE_SECTIONS & set(counts))

    h(doc, 'Решения, принятые за период', 1)
    bullets(doc, notes['Decision'])

    h(doc, 'Правила и собранные практики', 1)
    bullets(doc, notes['Convention'])

    if notes['OpenQuestion']:
        h(doc, 'Открытые вопросы', 1)
        bullets(doc, notes['OpenQuestion'])

    if not os.path.isdir(DOCS):
        os.makedirs(DOCS)
    doc.save(OUT)
    return {'записей в срезе': len(rows), 'поля': n_fields, 'механики': n_mech,
            'служебное': n_serv, 'переименований': len(ren),
            'решений': len(notes['Decision']), 'правил': len(notes['Convention']),
            'открытых вопросов': len(notes['OpenQuestion'])}


if __name__ == '__main__':
    res = build()
    print('docs/audit-posle-pud.docx собран')
    for k, v in res.items():
        print('  %-18s %s' % (k, v))
