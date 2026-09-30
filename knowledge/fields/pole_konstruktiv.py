# -*- coding: utf-8 -*-
"""Конструктив

Запись графа знаний проекта (knowledge/fields). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'pole-konstruktiv'
KIND = 'поле'
TERM = 'Конструктив'
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
        'объект': 'Производственное строение',
        'часть': 'карточка объекта имущества',
        'блок': '06 Доп параметры (производственное строение)',
        'пример_экрана': '#/oc/apartment/oc-ap-all/oi/oi-ap-all-prod',
        'в_типах_записи': ['Жилое здание (квартира)', 'Жилое здание (дом)', 'Земельный участок'],
    },
]
LINKS = [{'тип': 'часть', 'куда': 'blok-dop-parametry-proizvodstvennoe-stroenie', 'папка': 'concepts'}]
