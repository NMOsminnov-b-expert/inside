# -*- coding: utf-8 -*-
"""Инженерное оснащение

Запись графа знаний проекта (knowledge/fields). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'pole-inzhenernoe-osnaschenie'
KIND = 'поле'
TERM = 'Инженерное оснащение'
SYNONYMS = []
DEFINITION = ''
STATUS = 'черновик'
SOURCE = 'макет'
TAKEN = '2026-09-30'
VALUE_TYPE = ['отметка']
UNIT = ''
LIST_SIZE = 0
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
    {
        'объект': 'Производственное строение',
        'часть': 'карточка объекта имущества',
        'блок': '05 Тип и класс капитальности',
        'пример_экрана': '#/oc/civil/oc-cv-all/oi/oi-cv-all-prod',
        'в_типах_записи': ['Нежилое здание'],
    },
]
LINKS = [{'тип': 'часть', 'куда': 'blok-tip-i-klass-kapitalnosti', 'папка': 'concepts'}]
