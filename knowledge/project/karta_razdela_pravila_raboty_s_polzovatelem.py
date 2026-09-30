# -*- coding: utf-8 -*-
"""Раздел «Правила работы с пользователем»

Запись графа знаний проекта (knowledge/project). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'karta-razdela-pravila-raboty-s-polzovatelem'
KIND = 'проект'
TITLE = 'Раздел «Правила работы с пользователем»'
TAGS = ['проект', 'карта раздела']
STATUS = 'действует'
DATE = '2026-09-28'
SOURCE = 'оглавление графа (требование пользователя 28.09.2026); карта раздела — ответ «Берем все» 28.09.2026'
POINTS = [
    'Метки раздела: работа-с-claude, claude-md',
    'Карта раздела: связи «якорь» ведут на ключевые записи раздела; от них — их связи, затем codegraph query по меткам раздела. Карта в оглавлении — связь «раздел» из записи oglavlenie-grafa.',
]
LINKS = [
    {'тип': 'якорь', 'куда': 'dannye-proekta-naruzhu-ne-uhodyat', 'папка': 'rules'},
    {'тип': 'якорь', 'куда': 'zhurnal-izmeneniy', 'папка': 'decisions'},
    {'тип': 'якорь', 'куда': 'sbor-praktik-pered-dizaynom', 'папка': 'rules'},
    {'тип': 'якорь', 'куда': 'plavnost-na-slabom-zheleze', 'папка': 'rules'},
    {'тип': 'якорь', 'куда': 'odin-znak-prepinaniya-znachit-prodolzhat', 'папка': 'rules'},
    {'тип': 'якорь', 'куда': 'vetki-tolko-po-ukazaniyu', 'папка': 'rules'},
    {'тип': 'якорь', 'куда': 'gody-i-periody-ne-zashivat', 'папка': 'rules'},
    {'тип': 'якорь', 'куда': 'familiya-polzovatelya-osminnov', 'папка': 'rules'},
]
