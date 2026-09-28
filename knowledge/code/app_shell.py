# -*- coding: utf-8 -*-
"""app/shell

Запись графа знаний проекта (knowledge/code). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'app-shell'
KIND = 'модуль кода'
TITLE = 'app/shell'
TAGS = ['модуль кода']
STATUS = 'актуально'
DATE = ''
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'app/shell'
POINTS = ['Чистый каркас окна: сайдбар (collapse), крошки #crumbs, ящик заметок #notesDrawer, активный пункт '
 'навигации.',
 'Не знает про ОЦ/ОИ — только рисует то, что передают через setCrumbs/setDrawer/updateDrawer/setActiveNav.']
LINKS = [{'тип': 'part_of', 'куда': 'inside', 'папка': 'project'}]
