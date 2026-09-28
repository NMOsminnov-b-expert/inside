# -*- coding: utf-8 -*-
"""tools/checks/check_dropdown.py

Запись графа знаний проекта (knowledge/tools). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'tools-checks-check-dropdown-py'
KIND = 'утилита'
TITLE = 'tools/checks/check_dropdown.py'
TAGS = ['утилита', 'проверки']
STATUS = 'актуально'
DATE = ''
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'tools/checks/check_dropdown.py'
POINTS = [
    'Проверка своих выпадающих списков: на экранах не остаётся нативных select.select, выбор мышью и клавиатурой доходит до селекта, подпись кнопки видит значение, выставленное через select_option, список рисуется в <body>, подсказка не перекрывает первый пункт.',
]
LINKS = [{'тип': 'проверяет', 'куда': 'app-kernel-dropdown-js', 'папка': 'code'}]
