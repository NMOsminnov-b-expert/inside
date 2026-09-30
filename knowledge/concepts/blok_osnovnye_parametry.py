# -*- coding: utf-8 -*-
"""Основные параметры

Запись графа знаний проекта (knowledge/concepts). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'blok-osnovnye-parametry'
KIND = 'понятие'
TERM = 'Основные параметры'
SYNONYMS = []
CONCEPT_KIND = 'блок карточки'
DEFINITION = ''
STATUS = 'черновик'
SOURCE = 'макет'
TAKEN = '2026-09-30'
OCCURS = [
    {'экран': 'карточка «Объект оценки»', 'маршрут': '#/oc/land-plot/oc-lp-all'},
    {'экран': 'карточка «Земельный участок»', 'маршрут': '#/oc/apartment/oc-ap-all/oi/oi-ap-all-land'},
]
LINKS = [
    {'тип': 'часть', 'куда': 'obekt-ocenki', 'папка': 'concepts'},
    {'тип': 'часть', 'куда': 'vid-oi-zemelnyy-uchastok', 'папка': 'concepts'},
]
