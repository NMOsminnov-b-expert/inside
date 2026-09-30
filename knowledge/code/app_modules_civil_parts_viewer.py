# -*- coding: utf-8 -*-
"""app/modules/civil/parts/viewer

Запись графа знаний проекта (knowledge/code). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'app-modules-civil-parts-viewer'
KIND = 'модуль кода'
TITLE = 'app/modules/civil/parts/viewer'
TAGS = ['модуль кода', 'civil', 'residential-house', 'просмотрщик', 'осмотр']
STATUS = 'отменено'
DATE = ''
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'app/modules/civil/parts/viewer'
POINTS = [
    'Просмотрщик документов/фото модуля «Гражданское здание». Файлы shell.js (splitWrap/viewerHTML/bindSplitPanes), doc.js, photo.js, compare.js, state.js, ctrl.js + новый pdf.js (отрисовка реального PDF в canvas). compare.js/photo.js/state.js побайтово совпадают с residential-house; расходятся doc.js (реальные файлы), ctrl.js (горячие клавиши, paintPdfCanvases; нет audit-обвязки — каталога audit/ в civil вообще нет) и shell.js.',
    'bindSplitPanes в civil ЛУЧШЕ, чем в остальных 4 модулях: setPointerCapture + слушатели на самой ручке + touch-action:none, тогда как в других — слушатели уровня window. Стоит забрать из civil в остальные, а не наоборот — отложено отдельной задачей (правка 4 чужих модулей).',
    'Передовая версия просмотрщика: правки делаются здесь, потом копируются в остальные 4 модуля (файлы обязаны оставаться посимвольно одинаковыми). Проверять расхождение: diff app/modules/civil/parts/viewer/*.js против такого же пути другого модуля.',
    'bindViewerHotkeys вызывается ОДИН раз на монтирование модуля из index.js рядом с bindCommonUI — не из bindViewer и не из draw(): scope.onDocument только добавляет слушатель, и при вызове на каждую перерисовку одно нажатие «+» меняло зум на 40 % вместо 10 %.',
    '28.09.2026 снято проверкой графа «кода нет»: файла app/modules/civil/parts/viewer нет в репозитории, удалён коммитом 61b6e4e «Просмотрщик перенесён в ядро; гражданское переведено на него» (2026-09-21).',
]
LINKS = [
    {'тип': 'часть', 'куда': 'app-modules-civil', 'папка': 'code'},
    {'тип': 'опирается на', 'куда': 'app-vendor-pdfjs', 'папка': 'tools'},
]
