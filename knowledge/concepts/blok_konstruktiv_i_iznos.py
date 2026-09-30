# -*- coding: utf-8 -*-
"""Конструктив и износ

Запись графа знаний проекта (knowledge/concepts). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'blok-konstruktiv-i-iznos'
KIND = 'понятие'
TERM = 'Конструктив и износ'
SYNONYMS = []
CONCEPT_KIND = 'блок карточки'
DEFINITION = ''
STATUS = 'черновик'
SOURCE = 'макет'
TAKEN = '2026-09-30'
OCCURS = [
    {'экран': 'карточка «Квартира»', 'маршрут': '#/oc/apartment/oc-ap-all/oi/oi-ap-all-flat'},
    {'экран': 'карточка «Жилой дом»', 'маршрут': '#/oc/apartment/oc-ap-all/oi/oi-ap-all-house'},
    {'экран': 'карточка «Гражданское здание»', 'маршрут': '#/oc/apartment/oc-ap-all/oi/oi-ap-all-civil'},
    {'экран': 'карточка «Производственное строение»', 'маршрут': '#/oc/apartment/oc-ap-all/oi/oi-ap-all-prod'},
    {'экран': 'карточка «Прочее строение»', 'маршрут': '#/oc/apartment/oc-ap-all/oi/oi-ap-all-other'},
]
LINKS = [
    {'тип': 'часть', 'куда': 'vid-oi-grazhdanskoe-zdanie', 'папка': 'concepts'},
    {'тип': 'часть', 'куда': 'vid-oi-kvartira', 'папка': 'concepts'},
    {'тип': 'часть', 'куда': 'vid-oi-prochee-stroenie', 'папка': 'concepts'},
    {'тип': 'часть', 'куда': 'vid-oi-proizvodstvennoe-stroenie', 'папка': 'concepts'},
    {'тип': 'часть', 'куда': 'vid-oi-zhiloy-dom', 'папка': 'concepts'},
]
