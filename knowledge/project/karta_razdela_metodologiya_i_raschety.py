# -*- coding: utf-8 -*-
"""Раздел «Методология и расчёты»

Запись графа знаний проекта (knowledge/project). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'karta-razdela-metodologiya-i-raschety'
KIND = 'проект'
TITLE = 'Раздел «Методология и расчёты»'
TAGS = ['проект', 'карта раздела']
STATUS = 'действует'
DATE = '2026-09-28'
SOURCE = 'оглавление графа (требование пользователя 28.09.2026); карта раздела — ответ «Берем все» 28.09.2026'
POINTS = [
    'Метки раздела: методология, расчёт',
    'Карта раздела: связи «якорь» ведут на ключевые записи раздела; от них — их связи, затем codegraph query по меткам раздела. Карта в оглавлении — связь «раздел» из записи oglavlenie-grafa.',
]
LINKS = [
    {'тип': 'якорь', 'куда': 'tipizaciya-oc-po-vnutrenney-ploschadi', 'папка': 'decisions'},
    {'тип': 'якорь', 'куда': 'klassy-liter-pomescheniy', 'папка': 'sources'},
    {'тип': 'якорь', 'куда': 'rasschitannoe-pole', 'папка': 'decisions'},
    {'тип': 'якорь', 'куда': 'praktika-dolya-celogo-polosoy', 'папка': 'practices'},
]
