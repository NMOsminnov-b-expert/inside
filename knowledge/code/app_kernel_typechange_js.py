# -*- coding: utf-8 -*-
"""app/kernel/typeChange.js

Запись графа знаний проекта (knowledge/code). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'app-kernel-typechange-js'
KIND = 'модуль кода'
TITLE = 'app/kernel/typeChange.js'
TAGS = ['модуль кода', 'civil', 'production', 'kernel']
STATUS = 'актуально'
DATE = ''
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'app/kernel/typeChange.js'
POINTS = [
    'Смена типа объекта оценки и вида объекта имущества (ТЗ docs/tz/30-uchastok-pravki.md §9). Тип ОЦ — это модуль, в котором живёт запись, поэтому смена типа = переезд между модулями: takeRecord в старом + restoreRecord в новом (те же функции, что сделаны для архива), идентификатор сохраняется.',
    'Поля, которых нет в новой карточке, НЕ стираются: они остаются в записи и возвращаются при обратной смене. Список таких полей считается сравнением с образцом живой записи нового типа; человеческие подписи берутся у модуля (records.fieldLabel из audit/fieldLabels.js).',
    'Образец берётся из существующей записи, а не создаётся через createRecord: createRecord кладёт запись в список, и в реестре появился бы мусор.',
    'Виды ОИ ядро получает из модуля (records.oiTypes): у civil и production список разделён на REALTY_OI_TYPES и MOVABLE_OI_TYPES, поэтому там реэкспорт — объединение обоих.',
]
LINKS = [{'тип': 'использует', 'куда': 'app-kernel-registry-js', 'папка': 'code'}]
