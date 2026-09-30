# -*- coding: utf-8 -*-
"""Категория ОЦ

Запись графа знаний проекта (knowledge/fields). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'pole-kategoriya-oc'
KIND = 'поле'
TERM = 'Категория ОЦ'
SYNONYMS = []
DEFINITION = ''
STATUS = 'черновик'
SOURCE = 'макет'
TAKEN = '2026-09-30'
VALUE_TYPE = ['выбор из списка']
UNIT = ''
LIST_SIZE = 1
TABLE_ROW = False
REQUIRED_IN = []
STAGE = ''
OCCURS = [
    {
        'объект': 'Объект оценки',
        'часть': 'форма записи',
        'блок': '01 Основные параметры',
        'пример_экрана': '#/oc/apartment/oc-ap-all/form',
        'в_типах_записи': [
            'Жилое здание (квартира)',
            'Жилое здание (дом)',
            'Нежилое здание',
            'Земельный участок',
        ],
    },
]
LINKS = [{'тип': 'часть', 'куда': 'blok-osnovnye-parametry', 'папка': 'concepts'}]
