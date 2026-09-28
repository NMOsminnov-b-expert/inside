# -*- coding: utf-8 -*-
"""app/kernel/fmt.js

Запись графа знаний проекта (knowledge/code). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'app-kernel-fmt-js'
KIND = 'модуль кода'
TITLE = 'app/kernel/fmt.js'
TAGS = ['модуль кода', 'kernel']
STATUS = 'актуально'
DATE = ''
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'app/kernel/fmt.js'
POINTS = ['Числа/строки: num, fmt, round2, norm.',
 'parseEni используется не только при показе: формы ОЦ (ocForm.ctrl.js, ocCreateForm.ctrl.js) читают из поля '
 '#fEni строку с маской и кладут в rec.eni цифры. Если менять маску — проверять этот путь.']
LINKS = [{'тип': 'part_of', 'куда': 'app-kernel', 'папка': 'code'}]
