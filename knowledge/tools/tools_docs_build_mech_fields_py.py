# -*- coding: utf-8 -*-
"""tools/docs/build_mech_fields.py

Запись графа знаний проекта (knowledge/tools). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'tools-docs-build-mech-fields-py'
KIND = 'утилита'
TITLE = 'tools/docs/build_mech_fields.py'
TAGS = ['утилита', 'документы']
STATUS = 'актуально'
DATE = ''
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'tools/docs/build_mech_fields.py'
POINTS = [
    'Собирает docs/mehanizmy-polya.xlsx — состав полей карточки механизмов на согласование с пользователем: листы «Обзор», «Поля по подгруппам», «Уточнения по типам».',
    'Состав снимается не с экранов, а с самого справочника mechFields.js через node-дамп tools/docs/mech_fields_dump.mjs: справочник и есть источник, а перебирать 141 тип по экранам дорого.',
    'Варианты выбора в таблице разделены точкой с запятой: в самих вариантах есть десятичная запятая («0,2S»).',
]
LINKS = [{'тип': 'снимает состав с', 'куда': 'app-modules-civil-data-mechfields-js', 'папка': 'code'}]
