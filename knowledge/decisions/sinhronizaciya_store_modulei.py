# -*- coding: utf-8 -*-
"""Просмотрщик, сравнение и лог действий распространили по всем модулям, а поля их состояния в data/store.js доба

Запись графа знаний проекта (knowledge/decisions). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'sinhronizaciya-store-modulei'
KIND = 'решение'
TITLE = ('Просмотрщик, сравнение и лог действий распространили по всем модулям, а поля их состояния в data/store.js '
 'доба')
TAGS = ['решение', 'civil', 'production', 'просмотрщик', 'осмотр', 'лог-действий']
STATUS = 'действует'
DATE = ''
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'decision:sinhronizaciya-store-modulei'
POINTS = ['Просмотрщик, сравнение и лог действий распространили по всем модулям, а поля их состояния в data/store.js '
 'добавили только в civil.',
 'В остальных модулях ключи (splitVW, cmpSplit, cmpHidden, railCollapsed, viewerSidebar, фильтры лога, '
 'pageSel) появлялись лишь после первого обращения, то есть до него читались как undefined.',
 'Состав ключей выровнен по civil; различие осталось только там, где оно осмысленно: mechRows/mechDraft — у '
 'модулей с механизмами (civil, production).']
