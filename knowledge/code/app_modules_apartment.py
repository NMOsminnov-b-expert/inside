# -*- coding: utf-8 -*-
"""app/modules/apartment

Запись графа знаний проекта (knowledge/code). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'app-modules-apartment'
KIND = 'модуль кода'
TITLE = 'app/modules/apartment'
TAGS = ['модуль кода', 'apartment', 'просмотрщик']
STATUS = 'актуально'
DATE = ''
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'app/modules/apartment'
POINTS = ['ОЦ-тип «Жилое здание (квартира)»: квартиры в МКД.',
 'Виды ОИ: apartment, building (oi/registry.js).',
 'Стандартная внутренняя структура: manifest.js, records.js, data/*, card/ (ocCard, ocForm, oiTable.view.js, '
 'ctxPlate.js, addOiMenu.js, parties.view.js), oi/<вид>/, parts/{docs,notes,photos,viewer}.']
LINKS = [{'тип': 'depends_on', 'куда': 'app-kernel', 'папка': 'code'},
 {'тип': 'part_of', 'куда': 'inside', 'папка': 'project'}]
