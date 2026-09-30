# -*- coding: utf-8 -*-
"""частичный ре-рендер ocMenu (renderShell/renderData)

Запись графа знаний проекта (knowledge/decisions). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'chastichnyy-re-render-ocmenu-rendershell-renderdata'
KIND = 'решение'
TITLE = 'частичный ре-рендер ocMenu (renderShell/renderData)'
TAGS = ['решение', 'реестр-оц']
STATUS = 'действует'
DATE = ''
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'decision: частичный ре-рендер ocMenu (renderShell/renderData)'
POINTS = [
    'app/pages/ocMenu/ocMenu.js: render() разделён на renderShell() (полная пересборка — вызывается на mount/onRoute/превью/сворачивание фильтров/смену роли/смену объёма демо-данных) и renderData() (обновляет только срезы, фасеты, тулбар, шапку таблицы и строки — вызывается на ввод в поиске/фильтре, клики по срезам/фасетам, сортировку, колонки).',
    'Локатор, роль и кнопка «Создать ОЦ» живут в reg-top/локаторе, которые renderData вообще не трогает — поэтому фокус в поле поиска не теряется и не нужен старый хак с сохранением каретки.',
    'Причина: раньше любой ввод в поиске вызывал полный setHTML() всего блока .reg, включая локатор и шапку — заметный визуальный «прыжок» и повод для хака с восстановлением фокуса/каретки.',
]
LINKS = [
    {
        'тип': 'реализует',
        'куда': 'stranica-ne-dolzhna-pererisovyvatsya-celikom-pri-poiske-v-filtre',
        'папка': 'questions',
    },
]
