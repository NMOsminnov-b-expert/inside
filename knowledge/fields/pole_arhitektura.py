# -*- coding: utf-8 -*-
"""Архитектура

Запись графа знаний проекта (knowledge/fields). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'pole-arhitektura'
KIND = 'поле'
TERM = 'Архитектура'
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
        'объект': 'Гражданское здание',
        'часть': 'карточка объекта имущества',
        'блок': '05 Тип и класс капитальности',
        'пример_экрана': '#/oc/civil/oc-cv-all/oi/oi-cv-all-civil',
        'в_типах_записи': ['Нежилое здание'],
    },
]
