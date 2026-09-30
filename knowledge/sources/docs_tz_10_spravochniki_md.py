# -*- coding: utf-8 -*-
"""docs/tz/10-spravochniki.md

Запись графа знаний проекта (knowledge/sources). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'docs-tz-10-spravochniki-md'
KIND = 'источник'
TITLE = 'docs/tz/10-spravochniki.md'
TAGS = ['источник', 'документы']
STATUS = 'актуально'
DATE = '2026-09-02'
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'docs/tz/10-spravochniki.md'
POINTS = [
    'ТЗ раздела «Справочники»: модель, операции, права, экран, порядок работ, что проверяем автоматически.',
    'Замеры на 02.09.2026: 41 перечень, 133 точки использования, 106 полей <select>, 15 мультивыборов, 3 перечня уже разошлись между модулями.',
    'Раздел 1.1 отделяет справочники от системных перечней: STATUS_OC, LAND_TYPES, BUILD_TYPE, CATCLASS, LETTER_SEQ и другие управляют логикой карточек и правке не подлежат.',
]
LINKS = [
    {'тип': 'реализует', 'куда': 'spravochniki-model', 'папка': 'decisions'},
    {'тип': 'реализует', 'куда': 'spravochnik-na-odno-pole', 'папка': 'decisions'},
]
