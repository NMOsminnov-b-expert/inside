# -*- coding: utf-8 -*-
"""Порядок работы со знаниями: граф knowledge/ через CodeGraph

Запись графа знаний проекта (knowledge/rules). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'graf-proekta-poryadok-raboty'
KIND = 'правило'
TITLE = 'Порядок работы со знаниями: граф knowledge/ через CodeGraph'
TAGS = ['правило', 'граф', 'codegraph', 'работа-с-claude']
STATUS = 'действует'
DATE = '2026-09-28'
SOURCE = ('решение пользователя 28.09.2026 (graf-proekta-knowledge-vmesto-servera-pamyati); CLAUDE.md, раздел «Граф '
 'проекта»')
POINTS = ['В начале работы — python tools/knowledge/graph.py rules.',
 'Сначала граф, до вопроса пользователю и до чтения кода: codegraph query "<фраза>"; запасной поиск — '
 'graph.py find / tag.',
 'Чего нет в графе — спросить человека; ответ сразу в граф (graph.py new <папка> <заголовок> или пункт в '
 'запись) с датой, поводом и цитатой; метки — в TAGS.',
 'Коммит вместе с правкой; описание коммита — журнал: что и почему поменялось в знаниях.',
 'После записи — graph.py check и codegraph sync.',
 'Никаких знаний, логов и заметок в .claude/ — ни в проекте, ни в профиле.']
LINKS = [{'тип': 'следует из', 'куда': 'graf-proekta-knowledge-vmesto-servera-pamyati', 'папка': 'decisions'}]
