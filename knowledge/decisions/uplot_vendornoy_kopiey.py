# -*- coding: utf-8 -*-
"""uPlot — графики статистики, вендорной копией

Запись графа знаний проекта (knowledge/decisions). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'uplot-vendornoy-kopiey'
KIND = 'решение'
TITLE = 'uPlot — графики статистики, вендорной копией'
TAGS = ['решение', 'зависимость', 'график', 'осмотр']
STATUS = 'действует'
DATE = '2026-10-12'
SOURCE = 'слова пользователя 12.10.2026 в разговоре с Claude Code'
POINTS = [
    'Слова пользователя 12.10.2026: «Ну и общая статистика в виде графиков uplot»; на вопрос об имени файла charts.js — «Лесом chart js. Лучше uplot!». Графики статистики в макете — uPlot, Chart.js не используется.',
    'Вторая внешняя зависимость проекта после pdf.js и тем же способом (решение pdf-js-pervaya-vneshnyaya-zavisimost-proekta-vendornoy-kopiey-2026-08): app/vendor/uplot/ — uPlot 1.6.32 (MIT), получено npm pack uplot@1.6.32, файлы dist/uPlot.esm.js, uPlot.min.css и LICENSE без изменений, README.md с объяснением. Подключение — ленивым import() и стилем при первом показе графиков (pages/inspections/stats.js mountStats): кто не открывал панель осмотров, библиотеку не скачивает.',
    'Правила работы с uPlot в макете: экземпляры уничтожаются при каждой перерисовке и уходе с экрана (destroyStats), наблюдатель размера отключается; ось Y — от нуля; цвета — из токенов (getComputedStyle), а не литералами; в легенде — итог за период у каждого ряда, значение под курсором — со своей подписью («(7 за неделю)»).',
]
LINKS = [
    {'тип': 'относится к', 'куда': 'panel-osmotrov-tz', 'папка': 'tasks'},
    {
        'тип': 'опирается на',
        'куда': 'pdf-js-pervaya-vneshnyaya-zavisimost-proekta-vendornoy-kopiey-2026-08',
        'папка': 'decisions',
    },
]
