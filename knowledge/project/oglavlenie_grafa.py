# -*- coding: utf-8 -*-
"""Оглавление графа: разделы, метки и якоря

Запись графа знаний проекта (knowledge/project). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'oglavlenie-grafa'
KIND = 'проект'
TITLE = 'Оглавление графа: разделы, метки и якоря'
TAGS = ['проект', 'граф', 'оглавление']
STATUS = 'действует'
DATE = '2026-09-28'
SOURCE = 'требование пользователя 28.09.2026'
POINTS = [
    'Оглавление графа — первая точка входа: разделы, их метки и якоря (ключевые записи раздела). Нужная запись ищется от раздела: якорь → его связи → codegraph query по меткам раздела. Требование пользователя 28.09.2026: «пропиши правило обращаться к оглавлению графа, оно требуется; это же оглавление надо будет отображать и в программе… эти якоря понадобятся тебе для более простого поиска информации».',
    'Вывод с заголовками якорей и числом записей: python tools/knowledge/graph.py toc. Раздел — запись-карта knowledge/project/karta_razdela_*.py (связь «раздел» отсюда), ключевые записи раздела — связи «якорь» из карты, метки раздела — первый пункт карты «Метки раздела: …». Новый раздел — новая карта и связь «раздел» здесь; новый якорь — связь «якорь» в карте. Оглавление держать в актуальном виде при каждой крупной задаче.',
    'Открытые вопросы и задачи раздела не требуют: python tools/knowledge/graph.py find, папки questions/ и tasks/ со статусом «открыт».',
    '28.09.2026 оглавление переведено на карты разделов (Maps of Content, практика kak-uluchshat-graf-znaniy-…; ответ пользователя «Берем все»): оглавление → 13 карт → якоря, вместо 43 прямых связей. Якорь kontrakt-sozdaniya-oc (снят, заменён) заменён действующим решением sozdanie-oc-otdelnyy-ekran-….',
]
LINKS = [
    {'тип': 'раздел', 'куда': 'karta-razdela-poryadok-raboty-so-znaniyami', 'папка': 'project'},
    {'тип': 'раздел', 'куда': 'karta-razdela-pravila-raboty-s-polzovatelem', 'папка': 'project'},
    {'тип': 'раздел', 'куда': 'karta-razdela-arhitektura-maketa', 'папка': 'project'},
    {'тип': 'раздел', 'куда': 'karta-razdela-grazhdanskoe-zdanie-etalon-kartochek', 'папка': 'project'},
    {'тип': 'раздел', 'куда': 'karta-razdela-mehanizmy-i-transportnye-sredstva', 'папка': 'project'},
    {'тип': 'раздел', 'куда': 'karta-razdela-metodologiya-i-raschety', 'папка': 'project'},
    {'тип': 'раздел', 'куда': 'karta-razdela-roli-sistemy', 'папка': 'project'},
    {'тип': 'раздел', 'куда': 'karta-razdela-dokumenty-foto-i-prosmotrschik', 'папка': 'project'},
    {'тип': 'раздел', 'куда': 'karta-razdela-oformlenie-interfeysa', 'папка': 'project'},
    {'тип': 'раздел', 'куда': 'karta-razdela-proverki', 'папка': 'project'},
    {'тип': 'раздел', 'куда': 'karta-razdela-instrumenty', 'папка': 'project'},
    {'тип': 'раздел', 'куда': 'karta-razdela-pul-zadach-programmy-graf-proekta', 'папка': 'project'},
    {'тип': 'раздел', 'куда': 'karta-razdela-pod-voprosom-ne-trogat-bez-ukazaniya', 'папка': 'project'},
]
