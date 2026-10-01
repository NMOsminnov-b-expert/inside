# -*- coding: utf-8 -*-
"""Реестр ОЦ на главной: вкладки категорий, срезы как виды, фильтры, таблица

Запись графа знаний проекта (knowledge/practices). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'reestr-vkladki-vidy-filtry'
KIND = 'практика'
TITLE = 'Реестр ОЦ на главной: вкладки категорий, срезы как виды, фильтры, таблица'
TAGS = ['практика', 'реестр', 'главная', 'таблица', 'срезы', 'фильтры', 'интерфейс']
STATUS = 'действует'
DATE = '2026-10-01'
SOURCE = 'задача Осминнова Н. 01.10.2026 «доработать главную страницу… по-максимуму прокачиваем ui ux. В том числе для этого кидал тебе граф APCS»'
POINTS = [
    'Вкладки — для независимых разделов, сегменты — для взаимоисключающих видов одного содержимого, чипы — для независимых фильтров, которых можно выбрать несколько (SAP Fiori: https://www.sap.com/design-system/fiori-design-ios/v26-4/components/segmented-control/usage , https://www.sap.com/design-system/fiori-design-android/v26-4/components/input-and-selection/chips/usage ). Здесь: «Недвижимое» и «Движимое» — вкладки (разные колонки, срезы, фильтры); применённые фильтры — чипы с крестиком над таблицей.',
    'Вкладки с числом записей в заголовке, по умолчанию — самая частая (Alberta design system «Show different views of data in a table»: https://v2.design.alberta.ca/examples/show-different-views-of-data-in-a-table ).',
    'Срезы — сохранённые виды таблицы (Basis «Saved views»: https://design.basis.com/patterns/saved-views ; Procore «Saved Views for Quick Filtering»: https://v2.support.procore.com/product-manuals/unearth/tutorials/Saved_Views_for_Quick_Filtering ): вид — это отбор, а не украшение; живёт строкой видов над таблицей, без отдельной карточки. Здесь: «мои задачи» (по роли) и «требуют внимания» (заметки, расхождения, ML, без движения) — две группы одной строки, у каждой вкладки свои (пользователь: «По категориям свои»).',
    'Таблица: важное слева, обрезка с многоточием и полным текстом в подсказке, панель действий над таблицей, плотность как выбор (https://www.setproduct.com/blog/data-table-ui-design , https://ninjatables.com/big-data-table-design/ ). Здесь: «Объект» — две строки (адрес и тип), чтобы не терять колонку на типе; ЕНИ — первый код и «+N».',
    'Из графа APCS (перенесено 30.09.2026): скругление по роли (контейнер 12, элемент 8, вставка 4, чип — полностью) — primitivy-interfeysa-po-roli; три состояния блока — ожидание (заглушка в форме строк), пустота (что смягчить), отказ — tri-sostoyaniya-ozhidanie-pustota-otkaz; текст предупреждения — своим токеном — kontrast-meryat-cvet-preduprezhdeniya-v-tekste; раскладка проверяется замером на 1440, 1280, 1024 — shlyuz-interfeysa-zamer-raskladki.',
    'Служебное макета (роль «я: …», демо-объём, подсказка клавиш) — не в рабочей зоне: роль и объём — в меню пользователя, клавиши — по «?».',
]
LINKS = [
    {'тип': 'применяется в', 'куда': 'glavnaya-vkladki-nedvizhimoe-dvizhimoe', 'папка': 'tasks'},
    {'тип': 'уточняет', 'куда': 'primitivy-interfeysa-po-roli', 'папка': 'practices'},
    {'тип': 'уточняет', 'куда': 'tri-sostoyaniya-ozhidanie-pustota-otkaz', 'папка': 'practices'},
]
