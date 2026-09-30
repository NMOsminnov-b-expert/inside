# -*- coding: utf-8 -*-
"""Раздел «Архитектура макета»

Запись графа знаний проекта (knowledge/project). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'karta-razdela-arhitektura-maketa'
KIND = 'проект'
TITLE = 'Раздел «Архитектура макета»'
TAGS = ['проект', 'карта раздела']
STATUS = 'действует'
DATE = '2026-09-28'
SOURCE = 'оглавление графа (требование пользователя 28.09.2026); карта раздела — ответ «Берем все» 28.09.2026'
POINTS = [
    'Метки раздела: kernel, модуль кода',
    'Карта раздела: связи «якорь» ведут на ключевые записи раздела; от них — их связи, затем codegraph query по меткам раздела. Карта в оглавлении — связь «раздел» из записи oglavlenie-grafa.',
]
LINKS = [
    {'тип': 'якорь', 'куда': 'izolyaciya-moduley', 'папка': 'rules'},
    {
        'тип': 'якорь',
        'куда': 'kartochka-zemelnogo-uchastka-isklyuchenie-iz-izolyacii-moduley',
        'папка': 'rules',
    },
    {
        'тип': 'якорь',
        'куда': 'sozdanie-oc-otdelnyy-ekran-marshrut-fizicheski-ne-obschiy-s-redaktirov',
        'папка': 'decisions',
    },
    {'тип': 'якорь', 'куда': 'razmnozhennoe-znanie-iskat-kopii', 'папка': 'practices'},
    {'тип': 'якорь', 'куда': 'lenivyy-modul-i-poryadok-css', 'папка': 'practices'},
]
