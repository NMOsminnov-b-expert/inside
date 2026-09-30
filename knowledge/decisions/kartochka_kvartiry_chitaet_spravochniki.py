# -*- coding: utf-8 -*-
"""Карточка квартиры читает справочники через opt()

Запись графа знаний проекта (knowledge/decisions). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'kartochka-kvartiry-chitaet-spravochniki'
KIND = 'решение'
TITLE = 'Карточка квартиры читает справочники через opt()'
TAGS = ['решение', 'apartment', 'residential-house', 'документы']
STATUS = 'действует'
DATE = '2026-09-08'
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'decision:kartochka-kvartiry-chitaet-spravochniki'
POINTS = [
    '08.09.2026. В карточке квартиры (oi/apartment/view.js модулей apartment и residential-house) конструктивный состав и статус брали перечень напрямую из dictionaries.js, минуя opt(): поле выглядело словарным, но правка справочника его не меняла.',
    "Исправлено: 8 материалов (включая новый цоколь) и статус читаются через opt('apartment', ...), в dictExport всех пяти модулей объявлены слоты card:'apartment'. У типа ОИ «Квартира» в разделе «Справочники» стало 14 справочников вместо пяти.",
    'Карточка квартиры своя только у apartment и residential-house; остальные три модуля переиспользуют её из apartment (oi/apartment/index.js).',
]
LINKS = [{'тип': 'опирается на', 'куда': 'slovari-polnye-perechni-rabochey-sistemy', 'папка': 'decisions'}]
