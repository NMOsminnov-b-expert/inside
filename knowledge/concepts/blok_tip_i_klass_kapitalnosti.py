# -*- coding: utf-8 -*-
"""Тип и класс капитальности

Запись графа знаний проекта (knowledge/concepts). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'blok-tip-i-klass-kapitalnosti'
KIND = 'понятие'
TERM = 'Тип и класс капитальности'
SYNONYMS = []
CONCEPT_KIND = 'блок карточки'
DEFINITION = ''
STATUS = 'черновик'
SOURCE = 'макет'
TAKEN = '2026-09-30'
OCCURS = [
    {'экран': 'карточка «Гражданское здание»', 'маршрут': '#/oc/civil/oc-cv-all/oi/oi-cv-all-civil'},
    {'экран': 'карточка «Производственное строение»', 'маршрут': '#/oc/civil/oc-cv-all/oi/oi-cv-all-prod'},
    {'экран': 'карточка «Прочее строение»', 'маршрут': '#/oc/civil/oc-cv-all/oi/oi-cv-all-other'},
]
LINKS = [
    {'тип': 'часть', 'куда': 'vid-oi-grazhdanskoe-zdanie', 'папка': 'concepts'},
    {'тип': 'часть', 'куда': 'vid-oi-prochee-stroenie', 'папка': 'concepts'},
    {'тип': 'часть', 'куда': 'vid-oi-proizvodstvennoe-stroenie', 'папка': 'concepts'},
]
