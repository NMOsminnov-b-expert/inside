# -*- coding: utf-8 -*-
"""app/pages/ocMenu

Запись графа знаний проекта (knowledge/code). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'app-pages-ocmenu'
KIND = 'модуль кода'
TITLE = 'app/pages/ocMenu'
TAGS = ['модуль кода', 'реестр-оц']
STATUS = 'актуально'
DATE = ''
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'app/pages/ocMenu'
POINTS = [
    '«Меню ОЦ» — табличный виртуализированный реестр всех ОЦ (правился в последнем коммите «Изменение меню ОЦ», c3bceb7).',
    'Файлы: ocMenu.js, state.js, query.js, slices.js, facets.js, table.js, locator.js, preview.js.',
    "Локатор распознаёт ЕНИ/литеру/адрес; строка срезов-чипов; фасеты; сортируемая таблица; превью; экспорт CSV (';' + BOM для Excel).",
    'Складывает страницы всех модулей через k-way merge в query.js.',
    'Виртуализация: 20 000 записей ведут себя как 20 (фасеты ~23мс, подсчёт итога ~1мс, окно таблицы ~12мс).',
]
LINKS = [
    {'тип': 'aggregates_records_from', 'куда': 'app-modules-apartment', 'папка': 'code'},
    {'тип': 'aggregates_records_from', 'куда': 'app-modules-residential-house', 'папка': 'code'},
    {'тип': 'aggregates_records_from', 'куда': 'app-modules-civil', 'папка': 'code'},
    {'тип': 'aggregates_records_from', 'куда': 'app-modules-production', 'папка': 'code'},
    {'тип': 'aggregates_records_from', 'куда': 'app-modules-land-plot', 'папка': 'code'},
    {'тип': 'part_of', 'куда': 'inside', 'папка': 'project'},
    {'тип': 'depends_on', 'куда': 'app-kernel-session-js', 'папка': 'code'},
    {'тип': 'использует', 'куда': 'app-kernel-columns-js', 'папка': 'code'},
]
