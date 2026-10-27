# -*- coding: utf-8 -*-
"""Раздел «Осмотры»

Запись графа знаний проекта (knowledge/project). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'karta-razdela-osmotry'
KIND = 'проект'
TITLE = 'Раздел «Осмотры»'
TAGS = ['проект', 'карта раздела']
STATUS = 'действует'
DATE = '2026-10-12'
SOURCE = 'постановка пользователя 12.10.2026 «Необходимо заняться панелью осмотров… ТЗ идет в граф»'
POINTS = [
    'Метки раздела: осмотр, осмотрщик, региональный менеджер, расхождение, опись',
    'Карта раздела: связи «якорь» ведут на ключевые записи раздела; от них — их связи, затем codegraph query по меткам раздела. Карта в оглавлении — связь «раздел» из записи oglavlenie-grafa.',
]
LINKS = [
    {'тип': 'якорь', 'куда': 'panel-osmotrov-tz', 'папка': 'tasks'},
    {'тип': 'якорь', 'куда': 'osmotry-dva-otdelnyh-interfeysa-u-osmotrschika-mobilnyy', 'папка': 'decisions'},
    {
        'тип': 'якорь',
        'куда': 'polya-osmotra-vtoroe-znachenie-ryadom-a-ne-pravka-dannyh-cod',
        'папка': 'decisions',
    },
    {'тип': 'якорь', 'куда': 'status-osmotren-stavit-cod', 'папка': 'decisions'},
    {'тип': 'якорь', 'куда': 'docs-tz-70-etap-osmotrov-md', 'папка': 'sources'},
    {'тип': 'якорь', 'куда': 'opyt-prilozheniya-osmotr-dlya-paneli-osmotrov', 'папка': 'practices'},
    {'тип': 'якорь', 'куда': 'opis-oborudovaniya-i-mehanizmov', 'папка': 'terms'},
    {'тип': 'якорь', 'куда': 'panel-naznacheniya-ispolniteley', 'папка': 'practices'},
    {'тип': 'якорь', 'куда': 'ekran-osmotrschika-pererabotat-ergonomika', 'папка': 'tasks'},
    {'тип': 'якорь', 'куда': 'panel-podrobnostey-sprava', 'папка': 'practices'},
    {'тип': 'якорь', 'куда': 'upravlenie-osmotrschikami-instrumenty', 'папка': 'decisions'},
    {'тип': 'якорь', 'куда': 'zametki-po-osmotrschikam-12-10-2026', 'папка': 'sources'},
    {'тип': 'якорь', 'куда': 'tz-rabota-osmotrschika', 'папка': 'tasks'},
    {'тип': 'якорь', 'куда': 'tz-osmotry-ts-oborudovaniya-i-skanov', 'папка': 'tasks'},
]
