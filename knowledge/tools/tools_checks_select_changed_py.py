# -*- coding: utf-8 -*-
"""tools/checks/select_changed.py

Запись графа знаний проекта (knowledge/tools). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'tools-checks-select-changed-py'
KIND = 'утилита'
TITLE = 'tools/checks/select_changed.py'
TAGS = ['утилита', 'проверки']
STATUS = 'актуально'
DATE = ''
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'tools/checks/select_changed.py'
POINTS = [
    'Отбор проверок по изменённым файлам для run.py --changed. Изменённое берётся из git status (правки, индекс, новые файлы), с доводом base — ещё и diff ветки относительно base.',
    'Имя select_changed, а не select: модуль лежит рядом с run.py и попадает в sys.path, а select — модуль стандартной библиотеки, который затенять нельзя.',
    'IGNORE — документация, снимки, граф знаний, индекс CodeGraph, замеры: их правка браузер не поднимает. EVERYTHING — каркас: правка ведёт к полному прогону.',
    'Сопоставление через fnmatch, а не pathlib.match: звёздочка должна проходить через косые, чтобы «app/modules/*/oi/building/*» покрывало все пять модулей.',
]
