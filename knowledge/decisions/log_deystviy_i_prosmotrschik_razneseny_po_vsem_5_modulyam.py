# -*- coding: utf-8 -*-
"""лог действий и просмотрщик разнесены по всем 5 модулям

Запись графа знаний проекта (knowledge/decisions). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'log-deystviy-i-prosmotrschik-razneseny-po-vsem-5-modulyam'
KIND = 'решение'
TITLE = 'лог действий и просмотрщик разнесены по всем 5 модулям'
TAGS = ['решение',
 'civil',
 'apartment',
 'residential-house',
 'production',
 'land-plot',
 'просмотрщик',
 'осмотр',
 'лог-действий']
STATUS = 'действует'
DATE = '2026-08-28'
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'decision: лог действий и просмотрщик разнесены по всем 5 модулям'
POINTS = ['2026-08-28 закрыты пункты 3.1/3.2/3.3 Фазы 9 плана (docs/tz/00-tz.md): просмотрщик, реальные файлы и лог '
 'действий доведены до одинакового состояния во всех пяти модулях. Порядок был задан пользователем заранее: '
 'сначала довести на передовой версии (civil), потом совместить с логами, и только потом разносить.',
 'Лог действий (audit/) скопирован в apartment, production, land-plot; residential-house и civil подтянуты '
 'до общей версии. Копия, а не общий код в kernel — правило изоляции модулей и то, что набор полей у типов '
 'ОЦ разный. Общими остаются только access.js, categories.js, ctrl.js, model.js, view.js — они посимвольно '
 'одинаковы во всех пяти; свой на модуль только fieldLabels.js.',
 'Просмотрщик перенесён целиком: parts/viewer/{compare,ctrl,doc,photo,pdf,shell,sidebar,state}.js + '
 'parts/docs/model.js + parts/photos/{model,blocks,explorer}.js — все эти файлы во всех пяти модулях теперь '
 'идентичны. Улучшенный bindSplitPanes (setPointerCapture) приехал вместе с shell.js.',
 'module.css четырёх модулей пересобран из civil/module.css заменой префикса body[data-module="…"]. Это '
 'безопасно и проверено: до переноса файлы пяти модулей отличались ТОЛЬКО этим префиксом (diff на '
 'нормализованных копиях давал 0 строк для apartment/production/land-plot и ровно блок логов для '
 'residential-house).',
 'Проверено сценарием scratchpad/verify_spread.py: 60 проверок на 5 модулях, 0 ошибок консоли — лента '
 'миниатюр, гамбургер сайдбара, зум по «+», молчание клавиш при фокусе в поле ввода, вкладка «Логи», панель '
 'фильтров, попадание правки поля литеры в лог с человекочитаемой подписью. Плюс verify_pdf_spread.py: '
 'настоящий 4-страничный PDF в apartment даёт 4 миниатюры, счётчик «1 / 4», непустые canvas, а перестановка '
 'страниц пишется в лог как «Перенесено».',
 'Смоук tools/visual-parity/walk-new-build.py (20 011 записей, 5 модулей) — 0 ошибок консоли.']
LINKS = [{'тип': 'потребовало', 'куда': 'id-dokumenta-skvoznoy-po-zapisi-nextdocid', 'папка': 'decisions'},
 {'тип': 'потребовало', 'куда': 'slovar-podpisey-poley-loga-svoy-na-modul', 'папка': 'decisions'},
 {'тип': 'источник переноса', 'куда': 'app-modules-civil-parts-viewer', 'папка': 'code'}]
