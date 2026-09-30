# -*- coding: utf-8 -*-
"""Раздел «Оформление интерфейса»

Запись графа знаний проекта (knowledge/project). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'karta-razdela-oformlenie-interfeysa'
KIND = 'проект'
TITLE = 'Раздел «Оформление интерфейса»'
TAGS = ['проект', 'карта раздела']
STATUS = 'действует'
DATE = '2026-09-28'
SOURCE = 'оглавление графа (требование пользователя 28.09.2026); карта раздела — ответ «Берем все» 28.09.2026'
POINTS = [
    'Метки раздела: оформление, практика, интерфейс',
    'Карта раздела: связи «якорь» ведут на ключевые записи раздела; от них — их связи, затем codegraph query по меткам раздела. Карта в оглавлении — связь «раздел» из записи oglavlenie-grafa.',
]
LINKS = [
    {'тип': 'якорь', 'куда': 'sbor-praktik-pered-dizaynom', 'папка': 'rules'},
    {'тип': 'якорь', 'куда': 'oformlenie-tablicy-dannyh', 'папка': 'rules'},
    {'тип': 'якорь', 'куда': 'oformlenie-vkladok-i-menyu', 'папка': 'rules'},
    {'тип': 'якорь', 'куда': 'tri-sostoyaniya-ozhidanie-pustota-otkaz', 'папка': 'practices'},
    {'тип': 'якорь', 'куда': 'primitivy-interfeysa-po-roli', 'папка': 'practices'},
    {'тип': 'якорь', 'куда': 'kontrast-meryat-cvet-preduprezhdeniya-v-tekste', 'папка': 'practices'},
    {'тип': 'якорь', 'куда': 'dvizhenie-otvechaet-na-vopros-i-stoit-malo', 'папка': 'practices'},
    {'тип': 'якорь', 'куда': 'polzunki-prokrutki-i-kraya-lent', 'папка': 'practices'},
]
