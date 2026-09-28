# -*- coding: utf-8 -*-
"""Раздел «Пул задач программы «Граф проекта»»

Запись графа знаний проекта (knowledge/project). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'karta-razdela-pul-zadach-programmy-graf-proekta'
KIND = 'проект'
TITLE = 'Раздел «Пул задач программы «Граф проекта»»'
TAGS = ['проект', 'карта раздела']
STATUS = 'действует'
DATE = '2026-09-28'
SOURCE = 'оглавление графа (требование пользователя 28.09.2026); карта раздела — ответ «Берем все» 28.09.2026'
POINTS = [
    'Метки раздела: пул-граф-проекта',
    'Карта раздела: связи «якорь» ведут на ключевые записи раздела; от них — их связи, затем codegraph query по меткам раздела. Карта в оглавлении — связь «раздел» из записи oglavlenie-grafa.',
]
LINKS = [
    {'тип': 'якорь', 'куда': 'graf-sortirovka-po-date-dobavleniya-i-izmeneniya', 'папка': 'tasks'},
    {'тип': 'якорь', 'куда': 'graf-filtr-prozrachnost-vmesto-skrytiya', 'папка': 'tasks'},
    {'тип': 'якорь', 'куда': 'graf-oglavlenie-v-programme', 'папка': 'tasks'},
    {'тип': 'якорь', 'куда': 'ikonki-prilozheniy-graf-i-razmetka', 'папка': 'tasks'},
    {'тип': 'якорь', 'куда': 'graf-filtr-po-date', 'папка': 'tasks'},
]
