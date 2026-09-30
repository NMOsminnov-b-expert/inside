# -*- coding: utf-8 -*-
"""сворачиваемая панель фильтров (по аналогии с ящиком заметок)

Запись графа знаний проекта (knowledge/decisions). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'svorachivaemaya-panel-filtrov-po-analogii-s-yaschikom-zametok'
KIND = 'решение'
TITLE = 'сворачиваемая панель фильтров (по аналогии с ящиком заметок)'
TAGS = ['решение', 'реестр-оц']
STATUS = 'действует'
DATE = ''
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'decision: сворачиваемая панель фильтров (по аналогии с ящиком заметок)'
POINTS = [
    'aside.reg-facets-wrap + кнопка-вкладка .reg-facets-tab — та же схема, что у .notes-drawer/.notes-tab в app/shell (ширина 0↔238px по transition, вертикальная подпись на вкладке), но локальная для страницы ocMenu, без завязки на kernel/shell.setDrawer (тот слот занят заметками ОЦ/ОИ и не подходит для фильтров меню).',
    'Открыта по умолчанию (state.facetsOpen = true), переключается кликом по вкладке, состояние не сохраняется в адресе (как и было с прочими UI-предпочтениками — density, columns).',
]
LINKS = [{'тип': 'влияет на', 'куда': 'app-pages-ocmenu', 'папка': 'code'}]
