# -*- coding: utf-8 -*-
"""словарь подписей полей лога — свой на модуль

Запись графа знаний проекта (knowledge/decisions). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'slovar-podpisey-poley-loga-svoy-na-modul'
KIND = 'решение'
TITLE = 'словарь подписей полей лога — свой на модуль'
TAGS = ['решение', 'civil', 'apartment', 'residential-house', 'production', 'land-plot']
STATUS = 'действует'
DATE = '2026-08-28'
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'decision: словарь подписей полей лога — свой на модуль'
POINTS = ['audit/fieldLabels.js — единственный файл каталога audit/, который у каждого модуля свой: COMMON собирается '
 'по фактическим полям карточек этого модуля (у квартиры apartment.*, у производственного '
 'wear.*/rentAreas/craneBeam/tempMode/structStrength, и т.д.).',
 'Блок BY_CARD.land одинаков во всех пяти: карточка ЗУ во всех модулях импортируется из land-plot/oi/land '
 '(oi/land/index.js), значит и набор полей у неё один. Локальные oi/land/view.js в civil, production, '
 'residential-house — мёртвый код, оставленный намеренно.',
 'При переносе 2026-08-28 словари заодно приведены к текущей форме данных: лоджии/балконы/террасы давно '
 'стали списками (kernel/areaList.js), а подписи всё ещё ссылались на снятые миграцией '
 'loggiaCount/balconyCount/loggiaBuildArea/balconyBuildArea. В civil была подпись prodCrane, тогда как поле '
 'называется craneBeam.']
LINKS = [{'тип': 'опирается на', 'куда': 'app-modules-land-plot-oi-land', 'папка': 'code'}]
