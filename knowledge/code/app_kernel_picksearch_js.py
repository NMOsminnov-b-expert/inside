# -*- coding: utf-8 -*-
"""app/kernel/pickSearch.js

Запись графа знаний проекта (knowledge/code). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'app-kernel-picksearch-js'
KIND = 'модуль кода'
TITLE = 'app/kernel/pickSearch.js'
TAGS = ['модуль кода', 'kernel']
STATUS = 'актуально'
DATE = '2026-09-05'
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'app/kernel/pickSearch.js'
POINTS = [
    'Одиночный выбор с поиском: pickSearchHTML({key, value, options, ...}) и bindPickSearch(scope, key, onPick). Строки-кнопки .ps-opt, поиск скрытием строк, кнопка «Очистить».',
    'Появился 05.09.2026 по требованию пользователя: учреждение и подведомственная организация во всех пяти типах ОЦ должны быть не текстовыми полями, а выбором из списка с поиском («сейчас оно некорректно работает»).',
    'При смене учреждения подвед сбрасывается, если не принадлежит выбранному учреждению: список подведов считается через podvedNamesOf(institution) из kernel/institutions.js.',
]
LINKS = [{'тип': 'опирается на', 'куда': 'app-kernel-institutions-js', 'папка': 'code'}]
