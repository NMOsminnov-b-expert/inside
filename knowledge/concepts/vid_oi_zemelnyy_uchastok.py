# -*- coding: utf-8 -*-
"""Земельный участок

Запись графа знаний проекта (knowledge/concepts). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'vid-oi-zemelnyy-uchastok'
KIND = 'понятие'
TERM = 'Земельный участок'
SYNONYMS = []
CONCEPT_KIND = 'вид объекта имущества'
DEFINITION = ''
STATUS = 'черновик'
SOURCE = 'макет'
TAKEN = '2026-09-15'
OCCURS = [
    {
        'экран': 'карточка объекта имущества в «Жилое здание (квартира)»',
        'маршрут': '#/oc/apartment/oc-ap-all/oi/oi-ap-all-land',
    },
    {
        'экран': 'карточка объекта имущества в «Жилое здание (дом)»',
        'маршрут': '#/oc/residential-house/oc-rh-all/oi/oi-rh-all-land',
    },
]
