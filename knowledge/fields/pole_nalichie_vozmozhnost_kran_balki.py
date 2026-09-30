# -*- coding: utf-8 -*-
"""Наличие/возможность кран-балки

Запись графа знаний проекта (knowledge/fields). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'pole-nalichie-vozmozhnost-kran-balki'
KIND = 'поле'
TERM = 'Наличие/возможность кран-балки'
SYNONYMS = []
DEFINITION = ''
STATUS = 'черновик'
SOURCE = 'макет'
TAKEN = '2026-09-29'
VALUE_TYPE = ['выбор из списка']
UNIT = ''
LIST_SIZE = 2
TABLE_ROW = False
REQUIRED_IN = []
STAGE = ''
OCCURS = [
    {
        'объект': 'Производственное строение',
        'часть': 'карточка объекта имущества',
        'блок': '06 Доп параметры (производственное строение)',
        'пример_экрана': '#/oc/apartment/oc-ap-all/oi/oi-ap-all-prod',
        'в_типах_записи': ['Жилое здание (квартира)', 'Жилое здание (дом)', 'Земельный участок'],
    },
]
