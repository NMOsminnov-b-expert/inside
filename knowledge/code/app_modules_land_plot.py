# -*- coding: utf-8 -*-
"""app/modules/land-plot

Запись графа знаний проекта (knowledge/code). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'app-modules-land-plot'
KIND = 'модуль кода'
TITLE = 'app/modules/land-plot'
TAGS = ['модуль кода', 'land-plot']
STATUS = 'актуально'
DATE = ''
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'app/modules/land-plot'
POINTS = ['ОЦ-тип «Земельный участок»: участок как самостоятельный ОЦ.', 'Виды ОИ: land, building.']
LINKS = [{'тип': 'depends_on', 'куда': 'app-kernel', 'папка': 'code'},
 {'тип': 'part_of', 'куда': 'inside', 'папка': 'project'}]
