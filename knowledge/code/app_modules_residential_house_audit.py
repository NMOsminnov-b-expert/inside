# -*- coding: utf-8 -*-
"""app/modules/residential-house/audit

Запись графа знаний проекта (knowledge/code). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'app-modules-residential-house-audit'
KIND = 'модуль кода'
TITLE = 'app/modules/residential-house/audit'
TAGS = ['модуль кода', 'residential-house']
STATUS = 'актуально'
DATE = '2026-08-26'
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'app/modules/residential-house/audit'
POINTS = ['Подкаталог лога действий модуля «Жилое здание (дом)» — единственная реализация фичи на 2026-08-26 (в '
 'kernel не переносилась, остальные 4 модуля ОЦ её не имеют). Файлы: model.js (снимок-и-сравнение, плоское '
 'хранение rec.auditLog, категоризация по ключу, pushOiDeletionLog, pushDocPageLog, resolveDocRef), view.js '
 '(группировка по объекту, два раздела на аккордеон, панель фильтров), ctrl.js (биндинги фильтров и кнопок '
 'перехода), categories.js (4 категории + тона), fieldLabels.js (технический ключ → человеческая подпись, '
 'единственный такой словарь в проекте), access.js (admin видит всё, сотрудник — только свои учреждения '
 'через session.institutions).']
LINKS = [{'тип': 'part_of', 'куда': 'app-modules-residential-house', 'папка': 'code'},
 {'тип': 'depends_on', 'куда': 'app-kernel-session-js', 'папка': 'code'}]
