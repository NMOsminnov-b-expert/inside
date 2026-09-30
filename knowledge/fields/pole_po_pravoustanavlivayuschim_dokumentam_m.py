# -*- coding: utf-8 -*-
"""По правоустанавливающим документам, м²

Запись графа знаний проекта (knowledge/fields). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'pole-po-pravoustanavlivayuschim-dokumentam-m'
KIND = 'поле'
TERM = 'По правоустанавливающим документам, м²'
SYNONYMS = []
DEFINITION = ''
STATUS = 'черновик'
SOURCE = 'макет'
TAKEN = '2026-09-30'
VALUE_TYPE = ['число']
UNIT = 'м²'
LIST_SIZE = 0
TABLE_ROW = False
REQUIRED_IN = []
STAGE = ''
OCCURS = [
    {
        'объект': 'Земельный участок',
        'часть': 'карточка объекта имущества',
        'блок': '02 Площади',
        'пример_экрана': '#/oc/apartment/oc-ap-all/oi/oi-ap-all-land',
        'в_типах_записи': [
            'Жилое здание (квартира)',
            'Жилое здание (дом)',
            'Нежилое здание',
            'Земельный участок',
        ],
    },
]
LINKS = [{'тип': 'часть', 'куда': 'blok-ploschadi', 'папка': 'concepts'}]
