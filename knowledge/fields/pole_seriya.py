# -*- coding: utf-8 -*-
"""Серия

Запись графа знаний проекта (knowledge/fields). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'pole-seriya'
KIND = 'поле'
TERM = 'Серия'
SYNONYMS = []
DEFINITION = ''
STATUS = 'черновик'
SOURCE = 'макет'
TAKEN = '2026-09-30'
VALUE_TYPE = ['выбор из списка', 'текст']
UNIT = ''
LIST_SIZE = 9
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
LINKS = [{'тип': 'часть', 'куда': 'blok-obschie-parametry-kvartiry', 'папка': 'concepts'}]
