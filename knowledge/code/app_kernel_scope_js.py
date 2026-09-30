# -*- coding: utf-8 -*-
"""app/kernel/scope.js

Запись графа знаний проекта (knowledge/code). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'app-kernel-scope-js'
KIND = 'модуль кода'
TITLE = 'app/kernel/scope.js'
TAGS = ['модуль кода', 'kernel']
STATUS = 'актуально'
DATE = ''
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'app/kernel/scope.js'
POINTS = [
    'DOM-скоуп: делегирование событий и рендер строго внутри root, чтобы экраны не пересекались через document.querySelector.',
]
LINKS = [
    {'тип': 'опирается на', 'куда': 'app-kernel-dom-js', 'папка': 'code'},
    {'тип': 'часть', 'куда': 'app-kernel', 'папка': 'code'},
    {'тип': 'содержит', 'куда': 'pererisovka-ekrana-pri-izmenenii', 'папка': 'questions'},
]
