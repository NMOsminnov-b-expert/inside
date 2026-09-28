# -*- coding: utf-8 -*-
"""floors.view.js в модулях РАЗНЫЕ

Запись графа знаний проекта (knowledge/rules). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'floors-view-js-v-modulyah-raznye'
KIND = 'правило'
TITLE = 'floors.view.js в модулях РАЗНЫЕ'
TAGS = ['правило', 'civil', 'apartment', 'residential-house']
STATUS = 'действует'
DATE = ''
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'convention: floors.view.js в модулях РАЗНЫЕ'
POINTS = ['Файлы oi/*/floors.view.js НЕ идентичны между карточками: у карточки квартиры (apartment и '
 'residential-house) есть собственный экспорт apartmentFloorsBlock, которого нет у карточек зданий.',
 'Я скопировал версию civil поверх всех и сломал загрузку карточек квартиры («does not provide an export '
 'named apartmentFloorsBlock»). Такие правки надо применять В КАЖДОМ файле отдельно заменой фрагмента, а не '
 'копированием файла целиком.',
 'Общее правило: перед копированием файла между модулями убедиться, что версии действительно совпадают '
 '(diff), — совпадают parts/notes, parts/struct, heating.js, но НЕ floors.view.js.']
