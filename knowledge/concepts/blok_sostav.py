# -*- coding: utf-8 -*-
"""Состав

Запись графа знаний проекта (knowledge/concepts). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'blok-sostav'
KIND = 'понятие'
TERM = 'Состав'
SYNONYMS = []
CONCEPT_KIND = 'блок карточки'
DEFINITION = ''
STATUS = 'черновик'
SOURCE = 'макет'
TAKEN = '2026-09-30'
OCCURS = [
    {'экран': 'карточка «Механизмы и оборудование»', 'маршрут': '#/oc/civil/oc-cv-all/oi/oi-cv-all-mech'},
    {'экран': 'карточка «Офисная техника и мебель»', 'маршрут': '#/oc/civil/oc-cv-all/oi/oi-cv-all-office'},
]
LINKS = [
    {'тип': 'часть', 'куда': 'vid-oi-mehanizmy-i-oborudovanie', 'папка': 'concepts'},
    {'тип': 'часть', 'куда': 'vid-oi-ofisnaya-tehnika-i-mebel', 'папка': 'concepts'},
]
