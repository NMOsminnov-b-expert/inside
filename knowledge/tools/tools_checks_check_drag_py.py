# -*- coding: utf-8 -*-
"""tools/checks/check_drag.py

Запись графа знаний проекта (knowledge/tools). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'tools-checks-check-drag-py'
KIND = 'утилита'
TITLE = 'tools/checks/check_drag.py'
TAGS = ['утилита', 'просмотрщик', 'проверки', 'осмотр']
STATUS = 'актуально'
DATE = ''
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'tools/checks/check_drag.py'
POINTS = ['Проверка переноса и открепления литер: привязка броском на участок, открепление броском в просмотрщик, '
 'шапку, боковое меню и в промежуток между участками, тексты подсказки, снятие подсказки после броска.',
 'Перетаскивание эмулируется событиями DragEvent с DataTransfer: настоящий HTML5 drag&drop через мышь '
 'Playwright не воспроизводит.']
LINKS = [{'тип': 'проверяет', 'куда': 'otkreplenie-litery-brosok-kuda-ugodno', 'папка': 'decisions'},
 {'тип': 'часть', 'куда': 'tools-checks', 'папка': 'tools'}]
