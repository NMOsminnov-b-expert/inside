# -*- coding: utf-8 -*-
"""app/kernel/session.js

Запись графа знаний проекта (knowledge/code). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'app-kernel-session-js'
KIND = 'модуль кода'
TITLE = 'app/kernel/session.js'
TAGS = ['модуль кода', 'residential-house', 'kernel', 'реестр-оц', 'лог-действий', 'восстановлено']
STATUS = 'актуально'
DATE = '2026-08-25'
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'app/kernel/session.js'
POINTS = ['Общая «сессия» макета — {person, role, institutions} — видна и меню ОЦ (app/pages/ocMenu), и всем 5 '
 'модулям одновременно; хранится через kernel/store.js createStore (те же {get state, set(patch), '
 "subscribe(fn)}). ROLES (список ролей) переехал сюда из ocMenu/state.js вместе с добавлением роли 'admin' — "
 'переезд случился ещё в рамках V1 audit-log решения (2026-08-25, см. decision: лог изменений ОЦ — '
 'снимок-и-сравнение, роль admin), но сам файл в граф ещё не был занесён.',
 'institutions: string[] — учреждения, за которыми закреплён текущий сотрудник (кроме admin — тот видит '
 'всё). Добавлено 2026-08-26 для доступа к логу действий (см. decision: лог действий (аудит) — module-local '
 'V2 в residential-house). Пока нет реальных учётных записей — управляется вручную через текстовое поле в '
 'ocMenu whoHTML (data-institutions, значения через запятую), видимое только для ролей, отличных от '
 'admin/any — явный плейсхолдер для тестирования, не настоящее назначение сотрудников учреждениям.',
 'isAdmin()/roleLabel() — вспомогательные функции поверх session.state; используются и в ocMenu (whoHTML), и '
 'в app/modules/residential-house/audit/access.js + audit/view.js.',
 '[восстановлено] Общая «сессия» макета — {person, role, institutions} — видна и меню ОЦ (app/pages/ocMenu), '
 'и всем 5 модулям одновременно; хранится через kernel/store.js createStore (те же {get state, set(patch), '
 "subscribe(fn)}). ROLES (список ролей) переехал сюда из ocMenu/state.js вместе с добавлением роли 'admin' — "
 'переезд случился в рамках V1 audit-log решения (2026-08-25, см. decision: лог изменений ОЦ — '
 'снимок-и-сравнение, роль admin), но сам файл как узел графа заведён только сейчас (2026-08-26).']
LINKS = [{'тип': 'part_of', 'куда': 'app-kernel', 'папка': 'code'},
 {'тип': 'uses', 'куда': 'app-kernel-store-js', 'папка': 'code'}]
