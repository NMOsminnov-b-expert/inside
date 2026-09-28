# -*- coding: utf-8 -*-
"""сводки и запросы реестра

Запись графа знаний проекта (knowledge/rules). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'svodki-i-zaprosy-reestra'
KIND = 'правило'
TITLE = 'сводки и запросы реестра'
TAGS = ['правило']
STATUS = 'действует'
DATE = ''
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'convention: сводки и запросы реестра'
POINTS = ['Модуль отдаёт не «все сводки», а страницы по запросу: queryRecords, countRecords, facets, locate, '
 'getSummary, loadRecord, totalCount, setStatus, assignResponsible.',
 'Рассчитано на десятки тысяч записей.']
