# -*- coding: utf-8 -*-
"""поля ТЗ строения распространены на apartment/oi/building + добавлено «Особенности» (2026-08-25)

Запись графа знаний проекта (knowledge/decisions). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'polya-tz-stroeniya-rasprostraneny-na-apartment-oi-building-dobavleno-o'
KIND = 'решение'
TITLE = 'поля ТЗ строения распространены на apartment/oi/building + добавлено «Особенности» (2026-08-25)'
TAGS = ['решение', 'apartment', 'residential-house']
STATUS = 'действует'
DATE = ''
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'decision: поля ТЗ строения распространены на apartment/oi/building + добавлено «Особенности» (2026-08-25)'
POINTS = ['Ранее (см. decision: реализация полей ТЗ — Квартира и Жилой дом) поля «Тип строения»/«Права на '
 'строение»/лоджии-балконы/мансарда были добавлены только в residential-house/oi/building, копия в '
 'apartment/oi/building («Прочее строение») сознательно не трогалась. Пользователь явно попросил '
 'распространить и туда («Прочие строения реализуем») — сделано зеркально, тем же способом (STRUCTURE_KIND и '
 'MANSARD_TYPE добавлены и в apartment/data/dictionaries.js).',
 'STRUCTURE_KIND переименован из RH_STRUCTURE_KIND (было в residential-house/data/dictionaries.js) — с '
 'приходом в apartment-модуль префикс «RH» (residential-house) стал неверным, название обобщено.',
 'Новое поле oi.features («Особенности» — нестандартная высота потолков и т.п., пригодится при оценке) '
 'добавлено на building-карточку в ОБОИХ модулях, отдельно от oi.comment («Комментарий») — по прямому '
 'требованию пользователя, вне комментариев.',
 'app/modules/apartment/records.js: createRecord() теперь сразу создаёт и пушит в rec.oi одну карточку '
 "квартиры (card:'apartment', литера А) — по прямому требованию пользователя, чтобы не требовать отдельного "
 'клика «+ Добавить ОИ → Квартира» после создания ОЦ. Копия структуры ОИ продублирована внутри records.js '
 '(blankApartmentOi), а не переиспользует createOi() из card/ocCard.ctrl.js — те функции ctx-зависимые '
 '(принимают ctx с host/toast), а records.js работает на чистых данных без ctx.',
 'Проверено Playwright: создание нового ОЦ квартиры → сразу открыть карточку → в таблице ОИ уже есть одна '
 'строка (литера А). Полный smoke-тест (walk-new-build.py, 20000 записей + все 5 модулей) — 0 ошибок '
 'консоли.']
LINKS = [{'тип': 'affects', 'куда': 'app-modules-apartment', 'папка': 'code'},
 {'тип': 'relates_to', 'куда': 'realizaciya-poley-tz-kvartira-i-zhiloy-dom-2026-08-25', 'папка': 'decisions'}]
