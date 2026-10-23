# -*- coding: utf-8 -*-
"""После перерыва — проверить, что все инструменты подняты

Запись графа знаний проекта (knowledge/rules). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'posle-pereryva-proverit-chto-vse-instrumenty-podnyaty'
KIND = 'правило'
TITLE = 'После перерыва — проверить, что все инструменты подняты'
TAGS = ['правило', 'работа-с-claude', 'инструменты', 'semsearch', 'реестр описей']
STATUS = 'действует'
DATE = '2026-10-23'
SOURCE = 'Пользователь 23.10.2026: «И еще. Замечаешь перерыв - обязательно проверяй состояние инструментов. Все ли поднято.»'
POINTS = [
    'Признак перерыва — сменилась дата, долго не было сообщений, команда, которая раньше шла секунды, висит или падает на соединении. Тогда до работы — проверка всего, на что опирается задача, и подъём упавшего; в ответе — что было лежащим и что поднято.',
    'Что проверять: semsearch — svc.py status (PostgreSQL и Ollama в %LOCALAPPDATA%\\semsearch; поднять — svc.py up, с NO_PROXY=127.0.0.1,localhost; Python — %LOCALAPPDATA%\\semsearch\\src\\codebase-mcp\\.venv); CodeGraph — %LOCALAPPDATA%\\codegraph\\current\\bin\\codegraph.cmd status; реестр описей — PostgreSQL разработки на 5433 (pg_isready; поднять — pg_ctl из %LOCALAPPDATA%\\semsearch\\pgsql\\bin с -D C:\\vs code\\reestr-opisey\\.dev\\pgdata; после перезагрузки остаётся postmaster.pid мёртвого процесса — pg_ctl с ним справляется) и сервер разработки на 8000 (deploy\\dev.cmd или runserver).',
    'Повод: 23.10.2026 после недельного перерыва тесты реестра повисли без единой строки вывода — PostgreSQL разработки и semsearch были выключены после перезагрузки, сервер реестра не работал; заметил это не сразу.',
]
LINKS = [
    {'тип': 'относится к', 'куда': 'tz-reestr-opisey', 'папка': 'tasks'},
    {'тип': 'относится к', 'куда': 'poisk-po-smyslu-codebase-mcp-s-lokalnoy-modelyu', 'папка': 'tools'},
]
