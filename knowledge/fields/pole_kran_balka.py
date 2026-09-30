# -*- coding: utf-8 -*-
"""Кран-балка

Запись графа знаний проекта (knowledge/fields). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'pole-kran-balka'
KIND = 'поле'
TERM = 'Кран-балка'
SYNONYMS = []
DEFINITION = ''
STATUS = 'черновик'
SOURCE = 'макет'
TAKEN = '2026-09-29'
VALUE_TYPE = ['выбор из списка']
UNIT = ''
LIST_SIZE = 4
TABLE_ROW = False
REQUIRED_IN = []
STAGE = ''
OCCURS = [
    {
        'объект': 'Производственное строение',
        'часть': 'карточка объекта имущества',
        'блок': '05 Тип и класс капитальности',
        'пример_экрана': '#/oc/civil/oc-cv-all/oi/oi-cv-all-prod',
        'в_типах_записи': ['Нежилое здание'],
    },
]
