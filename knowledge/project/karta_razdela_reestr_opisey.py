# -*- coding: utf-8 -*-
"""Раздел «Реестр описей»

Запись графа знаний проекта (knowledge/project). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'karta-razdela-reestr-opisey'
KIND = 'проект'
TITLE = 'Раздел «Реестр описей»'
TAGS = ['проект', 'карта раздела']
STATUS = 'действует'
DATE = '2026-10-16'
SOURCE = 'постановка пользователя 16.10.2026 «Делаем нормальное веб приложение… ТЗ пока что оформляем в графе»'
POINTS = [
    'Метки раздела: реестр описей, опись, импорт, база данных, история статистики',
    'Карта раздела: связи «якорь» ведут на ключевые записи раздела; от них — их связи, затем codegraph query по меткам раздела. Карта в оглавлении — связь «раздел» из записи oglavlenie-grafa.',
]
LINKS = [
    {'тип': 'якорь', 'куда': 'tz-reestr-opisey', 'папка': 'tasks'},
    {'тип': 'якорь', 'куда': 'normalizovannaya-opis-format', 'папка': 'terms'},
    {'тип': 'якорь', 'куда': 'oshibki-apcs-uchtennye-v-reestre-opisey', 'папка': 'practices'},
    {'тип': 'якорь', 'куда': 'vybor-uzla-iz-dereva-poisk-s-polnym-putem-i-obzor-po-urovnyam', 'папка': 'practices'},
    {'тип': 'якорь', 'куда': 'opis-oborudovaniya-i-mehanizmov', 'папка': 'terms'},
    {'тип': 'якорь', 'куда': 'kategorizaciya-mehanizmov-i-oborudovaniya-po-realnym-opisyam-i-import', 'папка': 'tasks'},
]
