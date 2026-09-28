# -*- coding: utf-8 -*-
"""tools/docs/build_render_analysis.py

Запись графа знаний проекта (knowledge/tools). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'tools-docs-build-render-analysis-py'
KIND = 'утилита'
TITLE = 'tools/docs/build_render_analysis.py'
TAGS = ['утилита', 'документы', 'разметка']
STATUS = 'актуально'
DATE = ''
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'tools/docs/build_render_analysis.py'
POINTS = [
    'Собирает docs/pererisovka-razbor.docx: разбор перерисовки экрана при добавлении и удалении.',
    'Замеры снимает с живых экранов Playwright-ом (узлы, поля, вес разметки, время пересборки, доля реально изменившейся разметки, сохранился ли фокус), поэтому документ не расходится с макетом.',
]
LINKS = [{'тип': 'собирает документ по', 'куда': 'pererisovka-ekrana-pri-izmenenii', 'папка': 'questions'}]
