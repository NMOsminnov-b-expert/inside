# -*- coding: utf-8 -*-
"""civil — устаревшие локальные поля участка (RIGHTS/LAND_SHAPE и т.п.)

Запись графа знаний проекта (knowledge/questions). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'civil-ustarevshie-lokalnye-polya-uchastka-rights-land-shape-i-t-p'
KIND = 'вопрос'
TITLE = 'civil — устаревшие локальные поля участка (RIGHTS/LAND_SHAPE и т.п.)'
TAGS = ['вопрос', 'civil', 'residential-house', 'production', 'land-plot', 'оформление']
STATUS = 'открыт'
DATE = '2026-09-08'
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'open: civil — устаревшие локальные поля участка (RIGHTS/LAND_SHAPE и т.п.)'
POINTS = ['После перевода civil на импорт карточки участка из land-plot, независимая более ранняя работа над участком '
 'в civil (data/dictionaries.js: RIGHTS, LAND_SHAPE; поля areaPud/areaBuilt/easements/easementsArea в '
 'исходном createOi) стала недостижимой (карточка больше не рендерит эти поля) — но не удалена. Стоит '
 'решить: убрать как мёртвый код, или это временно, пока не решено про civil окончательно.',
 'Подтверждено 08.09.2026 и всё ещё открыто: мёртвые локальные карточки участка лежат в трёх модулях — '
 'civil/oi/land/view.js (46 строк), production (30), residential-house (99). Ни один из них никто не '
 'вызывает: oi/land/index.js каждого модуля импортирует render и bind из land-plot/oi/land/*. Вред '
 'конкретный: поиск по коду находит поля, которых в интерфейсе давно нет.']
LINKS = [{'тип': 'derived_from',
  'куда': 'kartochka-zemelnogo-uchastka-isklyuchenie-iz-izolyacii-moduley',
  'папка': 'rules'}]
