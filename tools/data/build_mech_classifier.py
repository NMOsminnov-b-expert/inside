# -*- coding: utf-8 -*-
"""Классификатор движимого имущества: из таблицы в файл данных модуля.

Источник — «Группы движкимого имущества (параметры).xlsx» в корне проекта,
лист «Классификатор»: класс → подгруппа → тип и параметры каждой подгруппы.
Лист «Модель» того же файла описывает, как этим пользуются: три зависимых
списка и параметры выбранного типа справа. Скрипт переносит данные, а не
логику — логика живёт в карточке механизма.

    python tools/data/build_mech_classifier.py

Пишет app/modules/civil/data/mechClassifier.js. Правка классификатора —
в таблице, затем повторный запуск: файл данных руками не редактируется.

Что делается с текстом при переносе:
  * пробелы по краям и двойные пробелы убираются;
  * первая буква класса и типа делается заглавной — в таблице часть записей
    со строчной, и в выпадающем списке это читалось как опечатка;
  * номер в начале параметра («5. Наработка…») убирается — он остался от
    нумерации столбцов и в одной строке попал в текст;
  * у косой черты пробел ставится с обеих сторон, если в таблице он был
    только с одной («Назначение/ тип» → «Назначение / тип»);
  * пустые параметры не переносятся.
"""
import io
import json
import os
import re
import sys

import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'Группы движкимого имущества (параметры).xlsx')
OUT = os.path.join(ROOT, 'app', 'modules', 'civil', 'data', 'mechClassifier.js')

# Столбцы листа «Классификатор» (строки 1–2 — двухэтажная шапка).
COL_CLASS, COL_SUB, COL_TYPE = 1, 2, 3
COL_BASE = (4, 5)          # «Базовые параметры»: год выпуска, производитель
COL_MAIN = (6, 7, 8)       # «Основные параметры», 1–3
COL_EXTRA = (9, 10)        # «Дополнительные параметры», 4–5


# Опечатки источника, исправленные при переносе. Каждая выводится
# предупреждением при сборке: исправлять её надо и в самой таблице, после чего
# строку отсюда можно убрать.
TYPOS = {
    'толы (рабочие, переговорные, руководителя)': 'столы (рабочие, переговорные, руководителя)',
}


def clean(v):
    s = re.sub(r'\s+', ' ', str(v or '')).strip()
    # Косая черта с пробелом только с одной стороны («Назначение/ тип»,
    # «масляные/ сухие») — опечатка набора: делаем пробелы с обеих сторон.
    s = re.sub(r'(\S)/ (\S)', r'\1 / \2', s)
    s = re.sub(r'(\S) /(\S)', r'\1 / \2', s)
    return s


def cap(s):
    return s[:1].upper() + s[1:] if s else s


def param(s):
    return re.sub(r'^\d+\.\s*', '', clean(s))


def main():
    wb = openpyxl.load_workbook(SRC, data_only=True)
    ws = wb['Классификатор']
    rows = list(ws.iter_rows(values_only=True))

    head = [clean(v) for v in rows[1]]
    base = [head[i] for i in COL_BASE]

    classes = []
    by_class = {}
    problems = []

    for n, r in enumerate(rows[2:], start=3):
        r = list(r) + [None] * 14
        raw_typ = clean(r[COL_TYPE])
        if raw_typ in TYPOS:
            problems.append('строка %d: опечатка в таблице «%s» → «%s» (исправлено при переносе)'
                            % (n, raw_typ, TYPOS[raw_typ]))
            raw_typ = TYPOS[raw_typ]
        cls, sub, typ = cap(clean(r[COL_CLASS])), clean(r[COL_SUB]), cap(raw_typ)
        if not cls:
            continue

        if cls not in by_class:
            by_class[cls] = {'name': cls, 'subgroups': []}
            classes.append(by_class[cls])
        c = by_class[cls]

        if not sub:
            # Класс без подгрупп: в таблице есть только его название.
            if typ:
                problems.append('строка %d: тип без подгруппы' % n)
            continue

        main_p = [param(r[i]) for i in COL_MAIN]
        extra_p = [param(r[i]) for i in COL_EXTRA]

        s = next((x for x in c['subgroups'] if x['name'] == sub), None)
        if not s:
            s = {'name': sub, 'main': [p for p in main_p if p],
                 'extra': [p for p in extra_p if p], 'types': []}
            c['subgroups'].append(s)
        elif s['main'] != [p for p in main_p if p] or s['extra'] != [p for p in extra_p if p]:
            problems.append('строка %d: параметры типа «%s» расходятся с подгруппой «%s»'
                            % (n, typ, sub))
        if typ:
            s['types'].append(typ)

    body = json.dumps({'base': base, 'classes': classes}, ensure_ascii=False, indent=2)
    header = (
        "// ФАЙЛ СОБРАН СКРИПТОМ — не править руками.\n"
        "// Источник: «Группы движкимого имущества (параметры).xlsx», лист «Классификатор».\n"
        "// Пересборка: python tools/data/build_mech_classifier.py\n"
        "//\n"
        "// Классификатор движимого имущества: класс → подгруппа → тип. Параметры\n"
        "// заданы на уровне подгруппы: у всех типов одной подгруппы они одинаковые.\n"
        "// base — базовые параметры, общие для всех классов.\n"
        "//\n"
        "// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: классификатор здесь — статичный файл, собранный из\n"
        "// таблицы. На сервере это справочник с версиями: при правке состава\n"
        "// параметров уже заполненные карточки должны либо остаться на прежней\n"
        "// версии, либо пройти перенос значений. Решение не принято.\n"
    )
    io.open(OUT, 'w', encoding='utf-8', newline='\n').write(
        header + 'export const MECH_CLASSIFIER = ' + body + ';\n')

    n_sub = sum(len(c['subgroups']) for c in classes)
    n_typ = sum(len(s['types']) for c in classes for s in c['subgroups'])
    print('классов %d, подгрупп %d, типов %d' % (len(classes), n_sub, n_typ))
    print('базовые параметры:', base)
    for p in problems:
        print('ВНИМАНИЕ:', p)
    return 0


if __name__ == '__main__':
    sys.exit(main())
