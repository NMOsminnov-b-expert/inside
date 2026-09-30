# -*- coding: utf-8 -*-
"""app/modules/residential-house

Запись графа знаний проекта (knowledge/code). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'app-modules-residential-house'
KIND = 'модуль кода'
TITLE = 'app/modules/residential-house'
TAGS = ['модуль кода', 'apartment', 'residential-house']
STATUS = 'актуально'
DATE = ''
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'app/modules/residential-house'
POINTS = [
    'ОЦ-тип «Жилое здание (дом)»: индивидуальные дома с литерами (building), квартирами (apartment), землёй (land).',
    'Виды ОИ: building, apartment, land.',
]
LINKS = [
    {'тип': 'опирается на', 'куда': 'app-kernel', 'папка': 'code'},
    {'тип': 'часть', 'куда': 'inside', 'папка': 'project'},
    {'тип': 'опирается на', 'куда': 'app-kernel-session-js', 'папка': 'code'},
]
