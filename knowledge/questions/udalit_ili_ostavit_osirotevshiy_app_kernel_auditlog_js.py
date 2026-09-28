# -*- coding: utf-8 -*-
"""удалить или оставить осиротевший app/kernel/auditLog.js

Запись графа знаний проекта (knowledge/questions). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'udalit-ili-ostavit-osirotevshiy-app-kernel-auditlog-js'
KIND = 'вопрос'
TITLE = 'удалить или оставить осиротевший app/kernel/auditLog.js'
TAGS = ['вопрос', 'residential-house', 'kernel', 'лог-действий']
STATUS = 'открыт'
DATE = '2026-08-26'
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'open: удалить или оставить осиротевший app/kernel/auditLog.js'
POINTS = [
    'После отката V1 audit-log решения (2026-08-26, см. decision: лог действий (аудит) — module-local V2 в residential-house) ни один из 5 модулей больше не импортирует app/kernel/auditLog.js. Не решено: удалить файл как мёртвый код или оставить как историческую референс-реализацию снимок-и-сравнение механизма. Пользователю вопрос ещё не задавался.',
]
LINKS = [{'тип': 'relates_to', 'куда': 'app-kernel-auditlog-js', 'папка': 'code'}]
