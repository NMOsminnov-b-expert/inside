# -*- coding: utf-8 -*-
"""Положение на этаже

Запись графа знаний проекта (knowledge/fields). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'pole-polozhenie-na-etazhe'
KIND = 'поле'
TERM = 'Положение на этаже'
SYNONYMS = []
DEFINITION = ''
STATUS = 'черновик'
SOURCE = 'макет'
TAKEN = '2026-09-29'
VALUE_TYPE = ['выбор из списка', 'текст']
UNIT = ''
LIST_SIZE = 6
TABLE_ROW = False
REQUIRED_IN = []
STAGE = ''
OCCURS = [
    {
        'объект': 'Квартира',
        'часть': 'карточка объекта имущества',
        'блок': '01 Общие параметры квартиры',
        'пример_экрана': '#/oc/apartment/oc-ap-all/oi/oi-ap-all-flat',
        'в_типах_записи': [
            'Жилое здание (квартира)',
            'Жилое здание (дом)',
            'Нежилое здание',
            'Земельный участок',
        ],
    },
]
