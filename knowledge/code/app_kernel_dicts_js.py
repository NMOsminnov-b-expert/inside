# -*- coding: utf-8 -*-
"""app/kernel/dicts.js

Запись графа знаний проекта (knowledge/code). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'app-kernel-dicts-js'
KIND = 'модуль кода'
TITLE = 'app/kernel/dicts.js'
TAGS = ['модуль кода', 'kernel', 'документы', 'оформление']
STATUS = 'актуально'
DATE = ''
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'app/kernel/dicts.js'
POINTS = ['Модель справочников: сбор из модулей через реестр, каталог точек подключения, использование значений, '
 'операции создания/копирования/удаления, назначения.',
 'Ядро по-прежнему не знает типов ОЦ: состав приходит из data/dictExport.js каждого модуля через registry.',
 'optionsFor(typeId, card, field) возвращает значения назначенного справочника либо null — тогда модуль '
 'читает свой встроенный перечень. Это даёт постепенное внедрение по одному полю.',
 'canEditDicts() проверяет права внутри модели, а не только в интерфейсе — правило нельзя обойти прямым '
 'вызовом.']
LINKS = [{'тип': 'реализует', 'куда': 'spravochniki-model', 'папка': 'decisions'},
 {'тип': 'использует', 'куда': 'app-kernel-registry-js', 'папка': 'code'},
 {'тип': 'реализует', 'куда': 'spravochnik-na-odno-pole', 'папка': 'decisions'},
 {'тип': 'реализует', 'куда': 'katalogi-spravochnikov', 'папка': 'decisions'},
 {'тип': 'реализует', 'куда': 'avtoprivyazka-pri-perenose', 'папка': 'decisions'},
 {'тип': 'реализует', 'куда': 'papki-vnutri-tipa-oi', 'папка': 'decisions'},
 {'тип': 'реализует', 'куда': 'privyazka-po-klyuchu-polya', 'папка': 'decisions'}]
