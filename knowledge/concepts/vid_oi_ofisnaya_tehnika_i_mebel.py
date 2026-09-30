# -*- coding: utf-8 -*-
"""Офисная техника и мебель

Запись графа знаний проекта (knowledge/concepts). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'vid-oi-ofisnaya-tehnika-i-mebel'
KIND = 'понятие'
TERM = 'Офисная техника и мебель'
SYNONYMS = []
CONCEPT_KIND = 'вид объекта имущества'
DEFINITION = ''
STATUS = 'черновик'
SOURCE = 'макет'
TAKEN = '2026-09-30'
OCCURS = [
    {
        'экран': 'карточка объекта имущества в «Нежилое здание»',
        'маршрут': '#/oc/civil/oc-cv-all/oi/oi-cv-all-office',
    },
]
LINKS = [{'тип': 'относится к', 'куда': 'obekt-imuschestva', 'папка': 'concepts'}]
