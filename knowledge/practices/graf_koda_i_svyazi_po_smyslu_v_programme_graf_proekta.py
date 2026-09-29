# -*- coding: utf-8 -*-
"""Граф кода и связи по смыслу в программе «Граф проекта»

Запись графа знаний проекта (knowledge/practices). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'graf-koda-i-svyazi-po-smyslu-v-programme-graf-proekta'
KIND = 'практика'
TITLE = 'Граф кода и связи по смыслу в программе «Граф проекта»'
TAGS = ['практика', 'граф', 'интерфейс', 'утилита', 'поиск по смыслу']
STATUS = 'действует'
DATE = '2026-09-29'
SOURCE = 'задача Осминова Н. 29.09.2026: «В приложении увижу графы? Оба.» — «Делаем оба.»'
POINTS = [
    'Выведенные (inferred) связи рисуют иначе, чем записанные человеком: пунктиром и своим цветом, с пометкой происхождения в подсказке; одинаковый вид для одного рода связей. При сильном отдалении пунктир сливается — поэтому у выведенных связей ещё и свой цвет. Источники: https://robert-mcdermott.medium.com/from-unstructured-text-to-interactive-knowledge-graphs-using-llms-dd02a1f71cd6 , https://www.yfiles.com/resources/how-to/guide-to-visualizing-knowledge-graphs , https://linkurious.com/blog/knowledge-graph-visualization/ .',
    'Граф зависимостей кода: узлы — файлы (функции — при раскрытии), рёбра — вызовы, импорты, ссылки; файлы группируются по модулям и слоям (кластеры), чтобы были видны архитектурные границы; общие узлы с большим числом зависимых и циклы — отдельно заметны; лишнее скрывается фильтром. Источники: https://blog.tomsawyer.com/dependency-graph-visualization , https://guides.visual-paradigm.com/visualizing-complex-dependency-graphs-graphviz/ , https://www.puppygraph.com/blog/software-dependency-graph .',
    'Как приспособлено (tools/graf, 29.09.2026): в графе знаний — вид связи «похоже по смыслу» (пунктир, свой цвет, переключатель в «Видах связей», в подсказке — степень похожести), связи не участвуют в силовой раскладке, чтобы не перекладывать граф; раскладка «Смысл» — узлы стягиваются по похожести. Режим «Код»: узлы — файлы кода (без записей графа знаний), острова — по модулям (app/kernel, app/modules/<тип>, app/pages, tools/<утилита>), рёбра — вызовы и импорты между файлами с числом; в карточке — функции файла со строками, кто зависит от файла и от кого он, записи графа знаний о нём. Данные — выгрузками tools/knowledge/semantic_export.py и code_export.py в .graf/ (вне git).',
]
LINKS = [
    {'тип': 'применено в', 'куда': 'tools-graf', 'папка': 'tools'},
    {'тип': 'опирается на', 'куда': 'poisk-po-smyslu-codebase-mcp-s-lokalnoy-modelyu', 'папка': 'tools'},
    {'тип': 'относится к', 'куда': 'codegraph', 'папка': 'tools'},
]
