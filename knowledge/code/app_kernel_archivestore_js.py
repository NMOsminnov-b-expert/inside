# -*- coding: utf-8 -*-
"""app/kernel/archiveStore.js

Запись графа знаний проекта (knowledge/code). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'app-kernel-archivestore-js'
KIND = 'модуль кода'
TITLE = 'app/kernel/archiveStore.js'
TAGS = ['модуль кода', 'kernel']
STATUS = 'актуально'
DATE = ''
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'app/kernel/archiveStore.js'
POINTS = [
    'Единое хранилище архива на всю систему: плоский список записей, пакеты (batchId/batchRole), markRestored, индексы по коду ЕНИ (eniIndexes, eniTaken, ocEntryByEni).',
    "Появилось вместо rec.archive (архив внутри записи ОЦ): удалённый объект некуда было положить, а документы реестра и учреждений не принадлежат ни одному ОЦ. Старое поле мигрируется при первом чтении в записи kind:'document' и удаляется.",
    'ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: список растёт бесконечно (архив вечен) — на сервере это таблица со своими индексами и страничной выборкой.',
]
