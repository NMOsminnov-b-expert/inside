# -*- coding: utf-8 -*-
"""изоляция модулей

Запись графа знаний проекта (knowledge/rules). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'izolyaciya-moduley'
KIND = 'правило'
TITLE = 'изоляция модулей'
TAGS = ['правило']
STATUS = 'действует'
DATE = ''
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'convention: изоляция модулей'
POINTS = ['modules/* → kernel — можно; modules/* → modules/* — нельзя; kernel|shell|pages → modules/* — нельзя, кроме '
 'kernel/registry.js.',
 'Проверяется на код-ревью (зафиксировано в app/README.md).',
 'Следствие: перенос ОЦ между типами не поддерживается — требует обмена данными между модулями.']
LINKS = [{'тип': 'governs', 'куда': 'app-kernel', 'папка': 'code'},
 {'тип': 'governs', 'куда': 'app-modules-apartment', 'папка': 'code'},
 {'тип': 'governs', 'куда': 'app-modules-residential-house', 'папка': 'code'},
 {'тип': 'governs', 'куда': 'app-modules-civil', 'папка': 'code'},
 {'тип': 'governs', 'куда': 'app-modules-production', 'папка': 'code'},
 {'тип': 'governs', 'куда': 'app-modules-land-plot', 'папка': 'code'},
 {'тип': 'governs', 'куда': 'app-pages-ocmenu', 'папка': 'code'},
 {'тип': 'governs', 'куда': 'rasshirennyy-sostav-poley-oi-grazhdanskoe-zdanie', 'папка': 'decisions'}]
