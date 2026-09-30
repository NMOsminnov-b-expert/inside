# -*- coding: utf-8 -*-
"""Раздел «Инструменты»

Запись графа знаний проекта (knowledge/project). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'karta-razdela-instrumenty'
KIND = 'проект'
TITLE = 'Раздел «Инструменты»'
TAGS = ['проект', 'карта раздела']
STATUS = 'действует'
DATE = '2026-09-28'
SOURCE = 'оглавление графа (требование пользователя 28.09.2026); карта раздела — ответ «Берем все» 28.09.2026'
POINTS = [
    'Метки раздела: утилита',
    'Карта раздела: связи «якорь» ведут на ключевые записи раздела; от них — их связи, затем codegraph query по меткам раздела. Карта в оглавлении — связь «раздел» из записи oglavlenie-grafa.',
]
LINKS = [
    {'тип': 'якорь', 'куда': 'tools-graf', 'папка': 'tools'},
    {'тип': 'якорь', 'куда': 'tools-razmetka', 'папка': 'tools'},
    {'тип': 'якорь', 'куда': 'codegraph', 'папка': 'tools'},
    {'тип': 'якорь', 'куда': 'tools-visual-parity', 'папка': 'tools'},
    {'тип': 'якорь', 'куда': 'view-graph-prosmotr-grafa', 'папка': 'tools'},
    {'тип': 'якорь', 'куда': 'praktika-filtr-priglushaet-ne-pryachet', 'папка': 'practices'},
    {'тип': 'якорь', 'куда': 'poisk-po-smyslu-codebase-mcp-s-lokalnoy-modelyu', 'папка': 'tools'},
    {'тип': 'якорь', 'куда': 'zamer-plavnosti-na-slabom-zheleze', 'папка': 'practices'},
    {'тип': 'якорь', 'куда': 'poisk-po-grafu-zamery-apcs', 'папка': 'practices'},
]
