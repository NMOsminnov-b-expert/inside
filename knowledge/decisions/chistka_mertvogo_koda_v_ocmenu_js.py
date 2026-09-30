# -*- coding: utf-8 -*-
"""чистка мёртвого кода в ocMenu.js

Запись графа знаний проекта (knowledge/decisions). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'chistka-mertvogo-koda-v-ocmenu-js'
KIND = 'решение'
TITLE = 'чистка мёртвого кода в ocMenu.js'
TAGS = ['решение', 'реестр-оц']
STATUS = 'действует'
DATE = ''
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'decision: чистка мёртвого кода в ocMenu.js'
POINTS = [
    'Убраны рабочие остатки убранной канбан-доски: обработчики drag&drop на [data-card]/[data-stage-col] внутри bindRows(), а также полностью нерабочий переключатель вида (data-view/state.view) — ни одной кнопки, которая бы их вызывала, в шаблонах не было.',
    'Убраны data-sort-sel/data-sort-dir — обработчики были навешены, но ни один шаблон никогда не рендерил элементы с этими атрибутами (единственный реальный способ сортировки — клик по заголовку th[data-sort]).',
    'Убраны неиспользуемые: переменная ctx в mountOcMenu, state.columnsOpen, экспорт tableShellHTML из table.js, импорт activeColumns в ocMenu.js, CSS-класс .is-table (терял смысл единственного варианта), правки .reg-drop-*/.reg-locator-drop, .d-normal/.d-compact.',
    'Исправлен комментарий-реликт «Срезы и воронка» (воронки статусов в коде уже не было — только осиротевшая строка комментария).',
]
LINKS = [{'тип': 'влияет на', 'куда': 'app-pages-ocmenu', 'папка': 'code'}]
