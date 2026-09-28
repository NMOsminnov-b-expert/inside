# -*- coding: utf-8 -*-
"""вид ОИ «Земельный участок» в модуле apartment

Запись графа знаний проекта (knowledge/decisions). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'vid-oi-zemelnyy-uchastok-v-module-apartment'
KIND = 'решение'
TITLE = 'вид ОИ «Земельный участок» в модуле apartment'
TAGS = ['решение', 'apartment', 'land-plot']
STATUS = 'действует'
DATE = '2026-08-27'
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'decision: вид ОИ «Земельный участок» в модуле apartment'
POINTS = ['До 2026-08-27 в ОЦ «Жилое здание (квартира)» состав ОИ был только «Квартира» и «Прочее строение» — '
 'земельного участка среди типов ОИ не было вовсе.',
 'Пользователь решил 2026-08-27: «В квартиру тоже добавляем» — структура «участок → литеры» одна на все 5 '
 'типов ОЦ.',
 'Добавлено: OI_TYPES в data/rules.js, запись land в oi/registry.js (площадь из oi.areas.pravo), '
 'oi/land/index.js реэкспортом из land-plot (то же задокументированное исключение из изоляции, что и в '
 'остальных модулях), createLandOi вместо самодельного объекта в createOi.',
 'Локальные oi/land/view.js и ctrl.js в apartment НЕ создавались: в словарях модуля нет '
 'STATUS_BUILD/APARTMENT_RIGHTS/LAND_FORM/LAND_ENCUMBRANCE, которые нужны локальной версии, а грузится всё '
 'равно версия из land-plot.']
LINKS = [{'тип': 'потребовалось для', 'куда': 'derevo-uchastok-litery-bez-avtoprivyazki', 'папка': 'decisions'}]
