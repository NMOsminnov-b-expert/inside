# -*- coding: utf-8 -*-
"""Тип земельного участка

Запись графа знаний проекта (knowledge/fields). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'pole-tip-zemelnogo-uchastka'
KIND = 'поле'
TERM = 'Тип земельного участка'
SYNONYMS = []
DEFINITION = ''
STATUS = 'черновик'
SOURCE = 'макет'
TAKEN = '2026-09-30'
VALUE_TYPE = ['выбор из списка']
UNIT = ''
LIST_SIZE = 3
TABLE_ROW = False
REQUIRED_IN = []
STAGE = ''
OCCURS = [
    {
        'объект': 'Земельный участок',
        'часть': 'карточка объекта имущества',
        'блок': '01 Основные параметры',
        'пример_экрана': '#/oc/apartment/oc-ap-all/oi/oi-ap-all-land',
        'в_типах_записи': [
            'Жилое здание (квартира)',
            'Жилое здание (дом)',
            'Нежилое здание',
            'Земельный участок',
        ],
    },
]
LINKS = [{'тип': 'часть', 'куда': 'blok-osnovnye-parametry', 'папка': 'concepts'}]
