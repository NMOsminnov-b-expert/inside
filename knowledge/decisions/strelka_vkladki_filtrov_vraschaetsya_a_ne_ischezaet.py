# -*- coding: utf-8 -*-
"""стрелка вкладки фильтров вращается, а не исчезает

Запись графа знаний проекта (knowledge/decisions). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'strelka-vkladki-filtrov-vraschaetsya-a-ne-ischezaet'
KIND = 'решение'
TITLE = 'стрелка вкладки фильтров вращается, а не исчезает'
TAGS = ['решение', 'реестр-оц']
STATUS = 'действует'
DATE = ''
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'decision: стрелка вкладки фильтров вращается, а не исчезает'
POINTS = [
    'Пользователь прямо отклонил предыдущее решение прятать стрелку в закрытом состоянии — стрелка должна быть видна всегда и просто разворачиваться на 180° (тот же принцип, что у шевронов секций фасетов — transform:rotate, а не условный рендер элемента).',
    'app/pages/ocMenu/ocMenu.js: facetsTabInnerHTML() всегда рендерит .reg-facets-tab-arrow; класс .closed добавляет transform:rotate(180deg) в CSS.',
]
LINKS = [
    {
        'тип': 'refines',
        'куда': 'vkladka-paneli-filtrov-razdelnye-elementy-vmesto-smeshannogo-writing-m',
        'папка': 'decisions',
    },
]
