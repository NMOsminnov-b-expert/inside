# -*- coding: utf-8 -*-
"""app/vendor/pdfjs

Запись графа знаний проекта (knowledge/tools). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'app-vendor-pdfjs'
KIND = 'утилита'
TITLE = 'app/vendor/pdfjs'
TAGS = ['утилита', 'civil', 'просмотрщик']
STATUS = 'актуально'
DATE = ''
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'app/vendor/pdfjs'
POINTS = ['Вендорная копия PDF.js (pdfjs-dist 4.6.82, ESM) — единственная внешняя зависимость проекта. Файлы: '
 'pdf.min.js, pdf.worker.min.js, LICENSE, README.md. Переименованы из .mjs в .js из-за MIME-типа у python '
 'http.server (см. README и decision про первую внешнюю зависимость). Используется только из '
 'app/modules/civil/parts/viewer/pdf.js ленивым import().']
LINKS = [{'тип': 'part_of', 'куда': 'inside', 'папка': 'project'}]
