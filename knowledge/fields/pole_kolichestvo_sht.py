# -*- coding: utf-8 -*-
"""Количество, шт.

Запись графа знаний проекта (knowledge/fields). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'pole-kolichestvo-sht'
KIND = 'поле'
TERM = 'Количество, шт.'
SYNONYMS = []
DEFINITION = ''
STATUS = 'черновик'
SOURCE = 'макет'
TAKEN = '2026-09-30'
VALUE_TYPE = ['целое']
UNIT = ''
LIST_SIZE = 0
TABLE_ROW = False
REQUIRED_IN = []
STAGE = ''
OCCURS = [
    {
        'объект': 'Механизмы и оборудование',
        'часть': 'карточка объекта имущества',
        'блок': '02 Карточка выбранной единицы',
        'пример_экрана': '#/oc/civil/oc-cv-all/oi/oi-cv-all-mech',
        'в_типах_записи': ['Нежилое здание'],
    },
    {
        'объект': 'Офисная техника и мебель',
        'часть': 'карточка объекта имущества',
        'блок': '02 Карточка выбранной единицы',
        'пример_экрана': '#/oc/civil/oc-cv-all/oi/oi-cv-all-office',
        'в_типах_записи': ['Нежилое здание'],
    },
]
LINKS = [{'тип': 'часть', 'куда': 'blok-kartochka-vybrannoy-edinicy', 'папка': 'concepts'}]
