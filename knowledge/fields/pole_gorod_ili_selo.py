# -*- coding: utf-8 -*-
"""Город или село

Запись графа знаний проекта (knowledge/fields). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'pole-gorod-ili-selo'
KIND = 'поле'
TERM = 'Город или село'
SYNONYMS = []
DEFINITION = ''
STATUS = 'черновик'
SOURCE = 'макет'
TAKEN = '2026-09-29'
VALUE_TYPE = ['выбор из списка']
UNIT = ''
LIST_SIZE = 14
TABLE_ROW = False
REQUIRED_IN = []
STAGE = ''
OCCURS = [
    {
        'объект': 'Объект оценки',
        'часть': 'форма записи',
        'блок': '02 Местоположение',
        'пример_экрана': '#/oc/apartment/oc-ap-all/form',
        'в_типах_записи': [
            'Жилое здание (квартира)',
            'Жилое здание (дом)',
            'Нежилое здание',
            'Земельный участок',
        ],
    },
]
