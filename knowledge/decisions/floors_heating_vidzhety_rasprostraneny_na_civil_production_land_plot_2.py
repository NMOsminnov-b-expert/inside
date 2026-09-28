# -*- coding: utf-8 -*-
"""floors/heating виджеты распространены на civil, production, land-plot (2026-08-25)

Запись графа знаний проекта (knowledge/decisions). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'floors-heating-vidzhety-rasprostraneny-na-civil-production-land-plot-2'
KIND = 'решение'
TITLE = 'floors/heating виджеты распространены на civil, production, land-plot (2026-08-25)'
TAGS = ['решение', 'civil', 'apartment', 'residential-house', 'production', 'land-plot']
STATUS = 'действует'
DATE = ''
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'decision: floors/heating виджеты распространены на civil, production, land-plot (2026-08-25)'
POINTS = [
    'Категоризированная поэтажная развёртка (Надземные/Подземные/Мансардные, чекбокс-целиком-категория, readonly вместо перевёрнутого disabled) и компактный мультивыбор отопления (2 группы Выбрано/Не выбрано, floating dropdown) — ранее сделаны только для apartment и residential-house — теперь скопированы в civil, production, land-plot (файлы floors.model.js, floors.view.js, heating.js + добавлены биндинги data-cat-all и делегирование data-heat-opt/data-heat-other в ctrl.js каждого модуля; CSS .ms-* обновлён в module.css каждого).',
    "Важное исключение: civil независимо (кем-то ещё, вероятно 'kirill') уже получил свой контрол «Конструктивный тип мансарды» (data-mansard, свой словарь MANSARD_TYPE со значениями 'Отсутствует/Совмещённая/Ломаная/Односкатная/Прочее', в общей карточке, не в поэтажной развёртке) — поэтому в civil/oi/building/floors.view.js НЕ добавлялось повторное поле мансарды внутри категории (в отличие от apartment/residential-house/production/land-plot, где оно теперь есть) — иначе получилось бы 2 контрола на одно и то же поле oi.mansardType.",
    "MANSARD_TYPE (['Мансарда','Полумансарда']) добавлен как новый словарь в production и land-plot (там раньше не было конструктивного типа мансарды вообще).",
]
LINKS = [
    {
        'тип': 'relates_to',
        'куда': 'kompaktnyy-multivybor-otopleniya-2-gruppy-floating-dropdown-2026-08-25',
        'папка': 'decisions',
    },
    {
        'тип': 'relates_to',
        'куда': 'poetazhnaya-razvertka-stroeniya-kategorii-nadzemnye-podzemnye-mansardn',
        'папка': 'decisions',
    },
]
