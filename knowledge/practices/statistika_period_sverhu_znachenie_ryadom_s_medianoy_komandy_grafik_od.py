# -*- coding: utf-8 -*-
"""Статистика: период сверху, значение рядом с медианой команды, график — одна ось

Запись графа знаний проекта (knowledge/practices). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'statistika-period-sverhu-znachenie-ryadom-s-medianoy-komandy-grafik-od'
KIND = 'практика'
TITLE = 'Статистика: период сверху, значение рядом с медианой команды, график — одна ось'
TAGS = ['практика', 'статистика', 'осмотр', 'график', 'uPlot', 'таблица', 'интерфейс']
STATUS = 'действует'
DATE = '2026-10-14'
SOURCE = 'сбор практик 14.10.2026 к экрану статистики осмотров: скилл dataviz, поиск в интернете'
POINTS = [
    'Период — одной строкой над всем, что он задаёт: пресеты «неделя / месяц / квартал» и шаг стрелками от текущей даты; фильтр задаёт все плитки, таблицы и графики ниже (скилл dataviz, references/interaction.md: «filters scope everything below them», дата — первый фильтр, пресеты прежде произвольного диапазона; https://www.saasui.design/blog/saas-date-time-picker-ux-patterns, https://docs.explo.co/creating-dashboards/ui-elements/controls/date). Здесь: app/pages/inspections/stats.js periodBar, один период на «Все осмотрщики» и карточку осмотрщика — переходя к человеку, смотришь тот же отрезок.',
    'Число без опорного значения ничего не говорит: значение человека — рядом с медианой команды, названо, что за опора; медиана, а не среднее, — один выброс не сдвигает опору (https://fanruan.com/en/blog/what-is-a-benchmark-dashboard, https://docs.waydev.co/docs/benchmarking, https://help.calabrio.com/Content/user-guides/performance-management/kpi-dashboard.htm, https://help.resimpli.com/en/articles/11504793-kpi-dashboards-overview-individual-comparison-dashboard). Здесь: у осмотрщика — столбец «Медиана команды», у всех — строка медианы в итоге таблицы; хуже медианы больше чем на 10% — подсвечено; на графике осмотрщика медиана — пунктиром.',
    'Одна ось на график: две величины разного масштаба — два графика (скилл dataviz, «One axis. Never a dual-axis chart»). Здесь: у осмотрщика прежде ОИ и снимки делили две оси — теперь два графика.',
    'Цвета линий — постоянный порядок, проверенный сценарием validate_palette.js скилла dataviz на светлой и тёмной теме: #1668c9, #008a6e, #c07c1e, #7a41b8, #c2367f, #5b7f12; прежние сланцевый и бирюзовый не прошли порог насыщенности (читались серыми); красный в линиях не берётся — он у тревожных значений.',
    'Итог и медиана — в своих столбцах, складывается только складываемое: строка «Итого» — только объекты и ОИ, доли и средние — в строке медианы (правило проекта, CLAUDE.md «Итоги»).',
]
LINKS = [
    {'тип': 'реализовано в', 'куда': 'ekran-statistiki-osmotrov-pokazateli-i-vygruzka-xlsx', 'папка': 'tasks'},
    {'тип': 'опирается на', 'куда': 'uplot-vendornoy-kopiey', 'папка': 'decisions'},
]
