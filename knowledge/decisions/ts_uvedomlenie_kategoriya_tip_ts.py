# -*- coding: utf-8 -*-
"""23.09.2026, указание пользователя:

Запись графа знаний проекта (knowledge/decisions). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'ts-uvedomlenie-kategoriya-tip-ts'
KIND = 'решение'
TITLE = '23.09.2026, указание пользователя:'
TAGS = ['решение', 'vehicle']
STATUS = 'действует'
DATE = '2026-09-23'
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'decision:ts-uvedomlenie-kategoriya-tip-ts'
POINTS = [
    '23.09.2026, указание пользователя: если категория выбрана руками и не совпадает с тем, что подбирается по записи «Тип ТС», показывается уведомление (ctx.toast, warn), а не предупреждение под полем и не запрет.',
]
LINKS = [{'тип': 'applies_to', 'куда': 'app-modules-vehicle', 'папка': 'code'}]
