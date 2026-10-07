# -*- coding: utf-8 -*-
"""Раздел «Механизмы и транспортные средства»

Запись графа знаний проекта (knowledge/project). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'karta-razdela-mehanizmy-i-transportnye-sredstva'
KIND = 'проект'
TITLE = 'Раздел «Механизмы и транспортные средства»'
TAGS = ['проект', 'карта раздела']
STATUS = 'действует'
DATE = '2026-09-28'
SOURCE = 'оглавление графа (требование пользователя 28.09.2026); карта раздела — ответ «Берем все» 28.09.2026'
POINTS = [
    'Метки раздела: vehicle, mechanisms, распространение, модели-ТС',
    'Карта раздела: связи «якорь» ведут на ключевые записи раздела; от них — их связи, затем codegraph query по меткам раздела. Карта в оглавлении — связь «раздел» из записи oglavlenie-grafa.',
]
LINKS = [
    {'тип': 'якорь', 'куда': 'modeli-ts-po-markam', 'папка': 'terms'},
    {'тип': 'якорь', 'куда': 'mehanizmy-i-ts-v-lyubom-oc', 'папка': 'decisions'},
    {'тип': 'якорь', 'куда': 'kartochka-mekhanizmov-po-klassifikatoru', 'папка': 'decisions'},
    {'тип': 'якорь', 'куда': 'kartochka-ts-baza-modul', 'папка': 'decisions'},
    {'тип': 'якорь', 'куда': 'ts-baza-plyus-modul', 'папка': 'decisions'},
    {'тип': 'якорь', 'куда': 'spectehnika-eto-ts', 'папка': 'decisions'},
]
