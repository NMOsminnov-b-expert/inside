# -*- coding: utf-8 -*-
"""app/kernel/registry.js

Запись графа знаний проекта (knowledge/code). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'app-kernel-registry-js'
KIND = 'модуль кода'
TITLE = 'app/kernel/registry.js'
TAGS = ['модуль кода', 'kernel']
STATUS = 'актуально'
DATE = ''
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'app/kernel/registry.js'
POINTS = [
    'Список типов ОЦ (OC_TYPES).',
    'Единственное исключение из правила изоляции ядра: статически импортирует manifest.js и records.js каждого модуля, код карточки (index.js) — лениво через load().',
]
LINKS = [
    {'тип': 'относится к', 'куда': 'app-modules-apartment', 'папка': 'code'},
    {'тип': 'относится к', 'куда': 'app-modules-residential-house', 'папка': 'code'},
    {'тип': 'относится к', 'куда': 'app-modules-civil', 'папка': 'code'},
    {'тип': 'относится к', 'куда': 'app-modules-production', 'папка': 'code'},
    {'тип': 'относится к', 'куда': 'app-modules-land-plot', 'папка': 'code'},
    {'тип': 'часть', 'куда': 'app-kernel', 'папка': 'code'},
]
