# -*- coding: utf-8 -*-
"""Категория жилого строения

Запись графа знаний проекта (knowledge/fields). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'pole-kategoriya-zhilogo-stroeniya'
KIND = 'поле'
TERM = 'Категория жилого строения'
SYNONYMS = []
DEFINITION = ''
STATUS = 'черновик'
SOURCE = 'макет'
TAKEN = '2026-09-30'
VALUE_TYPE = ['выбор из списка']
UNIT = ''
LIST_SIZE = 4
TABLE_ROW = False
REQUIRED_IN = []
STAGE = ''
OCCURS = [
    {
        'объект': 'Жилой дом',
        'часть': 'карточка объекта имущества',
        'блок': '01 Общие параметры',
        'пример_экрана': '#/oc/apartment/oc-ap-all/oi/oi-ap-all-house',
        'в_типах_записи': [
            'Жилое здание (квартира)',
            'Жилое здание (дом)',
            'Нежилое здание',
            'Земельный участок',
        ],
    },
]
LINKS = [{'тип': 'часть', 'куда': 'blok-obschie-parametry', 'папка': 'concepts'}]
