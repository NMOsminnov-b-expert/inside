# -*- coding: utf-8 -*-
"""Вспомогательные постройки оцениваются

Запись графа знаний проекта (knowledge/fields). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'pole-vspomogatelnye-postroyki-ocenivayutsya'
KIND = 'поле'
TERM = 'Вспомогательные постройки оцениваются'
SYNONYMS = []
DEFINITION = ''
STATUS = 'черновик'
SOURCE = 'макет'
TAKEN = '2026-09-30'
VALUE_TYPE = ['выбор из списка']
UNIT = ''
LIST_SIZE = 2
TABLE_ROW = False
REQUIRED_IN = []
STAGE = ''
OCCURS = [
    {
        'объект': 'Земельный участок',
        'часть': 'карточка объекта имущества',
        'блок': '03 Инженерные сети',
        'пример_экрана': '#/oc/apartment/oc-ap-all/oi/oi-ap-all-land',
        'в_типах_записи': [
            'Жилое здание (квартира)',
            'Жилое здание (дом)',
            'Нежилое здание',
            'Земельный участок',
        ],
    },
]
LINKS = [{'тип': 'часть', 'куда': 'blok-inzhenernye-seti', 'папка': 'concepts'}]
