# -*- coding: utf-8 -*-
"""Имущественный комплекс — разрешить добавление ТС и механизмов в состав ОЦ

Запись графа знаний проекта (knowledge/fields). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'pole-imuschestvennyy-kompleks-razreshit-dobavlenie-ts-i-mehanizmo'
KIND = 'поле'
TERM = 'Имущественный комплекс — разрешить добавление ТС и механизмов в состав ОЦ'
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
        'объект': 'Объект оценки',
        'часть': 'форма записи',
        'блок': '03 Состав и тип имущества',
        'пример_экрана': '#/oc/apartment/oc-ap-all/form',
        'в_типах_записи': [
            'Жилое здание (квартира)',
            'Жилое здание (дом)',
            'Нежилое здание',
            'Земельный участок',
        ],
    },
]
LINKS = [{'тип': 'часть', 'куда': 'blok-sostav-i-tip-imuschestva', 'папка': 'concepts'}]
