# -*- coding: utf-8 -*-
"""app/kernel

Запись графа знаний проекта (knowledge/code). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'app-kernel'
KIND = 'модуль кода'
TITLE = 'app/kernel'
TAGS = ['модуль кода', 'kernel']
STATUS = 'актуально'
DATE = ''
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'app/kernel'
POINTS = ['Ядро приложения: не знает ни одного типа ОЦ и ни одного вида ОИ (правило из app/README.md).',
 'Единственное исключение — kernel/registry.js, который статически импортирует manifest.js и records.js всех '
 'пяти модулей.']
LINKS = [{'тип': 'part_of', 'куда': 'inside', 'папка': 'project'}]
