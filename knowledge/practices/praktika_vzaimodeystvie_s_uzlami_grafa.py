# -*- coding: utf-8 -*-
"""Взаимодействие с узлами графа: окружение при наведении, меню узла, подписи без наложения

Запись графа знаний проекта (knowledge/practices). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'praktika-vzaimodeystvie-s-uzlami-grafa'
KIND = 'практика'
TITLE = 'Взаимодействие с узлами графа: окружение при наведении, меню узла, подписи без наложения'
TAGS = ['практика', 'граф', 'интерфейс']
STATUS = 'действует'
DATE = '2026-09-28'
SOURCE = 'поиск 28.09.2026'
POINTS = [
    'Разгружать картину фильтрами и выделением окружения; кодировать вид цветом, связность — размером. Источник: https://cambridge-intelligence.com/graph-visualization-ux-how-to-avoid-wrecking-your-graph-visualization/ .',
    'Меню узла по правой кнопке, раскрытие соседей, навигация с клавиатуры: https://www.yfiles.com/resources/how-to/guide-to-visualizing-knowledge-graphs , https://github.com/aws/graph-explorer , https://docs.oracle.com/en/database/oracle/property-graph/25.4/pgvtr/graph-interaction-options.html .',
    'Как приспособлено: наведение приглушает всё, кроме узла и соседей (сильнее выбора); подписи ставятся по важности (выбранный, наведённый, соседи, найденные, крупные) и пропускаются, если легли бы на уже поставленную; у правого края подпись уходит влево от узла; под подписью — полупрозрачная подложка.',
]
LINKS = [{'тип': 'реализовано в', 'куда': 'tools-graf', 'папка': 'tools'}]
