# -*- coding: utf-8 -*-
"""Рекурсивно собирает текстовые файлы проекта (.py/.js/.ts/.html/.css/.md/...)

Запись графа знаний проекта (knowledge/tools). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'collect-context-py'
KIND = 'утилита'
TITLE = 'Рекурсивно собирает текстовые файлы проекта (.py/.js/.ts/.html/.css/.md/...)'
TAGS = ['утилита']
STATUS = 'актуально'
DATE = ''
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'collect_context.py'
POINTS = [
    'Рекурсивно собирает текстовые файлы проекта (.py/.js/.ts/.html/.css/.md/...) в один context.txt с маркерами FILE: — подготовка контекста для LLM.',
]
LINKS = [{'тип': 'опирается на', 'куда': 'inside', 'папка': 'project'}]
