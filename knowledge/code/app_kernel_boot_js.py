# -*- coding: utf-8 -*-
"""app/kernel/boot.js

Запись графа знаний проекта (knowledge/code). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'app-kernel-boot-js'
KIND = 'модуль кода'
TITLE = 'app/kernel/boot.js'
TAGS = ['модуль кода', 'kernel', 'реестр-оц']
STATUS = 'актуально'
DATE = ''
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'app/kernel/boot.js'
POINTS = [
    'Точка сборки приложения: инициализирует shell, слушает router, монтирует ocMenu или карточку ОЦ модуля через type.load().',
    'Формирует объект host (navigate, crumbs, drawer, toast/dialog, ensureStyle) — единственный API, который получают модули и страницы.',
]
LINKS = [
    {'тип': 'uses', 'куда': 'app-kernel-router-js', 'папка': 'code'},
    {'тип': 'uses', 'куда': 'app-kernel-registry-js', 'папка': 'code'},
    {'тип': 'uses', 'куда': 'app-kernel-dialog-js', 'папка': 'code'},
    {'тип': 'uses', 'куда': 'app-kernel-toast-js', 'папка': 'code'},
    {'тип': 'uses', 'куда': 'app-kernel-css-js', 'папка': 'code'},
    {'тип': 'mounts', 'куда': 'app-shell', 'папка': 'code'},
    {'тип': 'mounts', 'куда': 'app-pages-ocmenu', 'папка': 'code'},
    {'тип': 'part_of', 'куда': 'app-kernel', 'папка': 'code'},
]
