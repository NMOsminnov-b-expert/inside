# -*- coding: utf-8 -*-
"""Потенциально неиспользуемый код — удалять только по решению пользователя

Запись графа знаний проекта (knowledge/questions). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'potencialno-neispolzuemyy-kod-udalyat-tolko-po-resheniyu-polzovatelya'
KIND = 'вопрос'
TITLE = 'Потенциально неиспользуемый код — удалять только по решению пользователя'
TAGS = ['вопрос', 'чистка кода', 'неиспользуемое', 'осмотр', 'карта', 'литера']
STATUS = 'открыт'
DATE = '2026-10-14'
SOURCE = 'ответы пользователя 13–14.10.2026 в разговоре с Claude Code'
POINTS = [
    'Перечень кода, на который больше ничто не ссылается. Удалять — только по прямому решению пользователя (правило nichego-ne-udalyat-bez-pryamogo-ukazaniya…); пока — «потенциально неиспользуемое».',
    'Функции app/pages/inspections/model.js periodTotals и weeklySeries — после экрана статистики 14.10.2026 (расчёт перенесён в statsData.js: statsFor, seriesOf). Ответ пользователя 14.10.2026: «Запиши в граф как потенциально неиспользуемые».',
    'Прежние копии карточки литеры app/modules/apartment|residential-house|land-plot/oi/building/* (view.js, ctrl.js, floors.*, annexes.js, heating.js, tempMode.js) — с 13.10.2026 index.js в этих папках отдаёт карточку через дверь civil/card.js. Карта на Leaflet: app/vendor/leaflet, app/kernel/cadastreLayers.js, app/kernel/smoothWheel.js — после перехода всех карт на MapLibre GL (12–13.10.2026). Ответ пользователя 13.10.2026 на вопрос об удалении: «Пока оставь».',
]
LINKS = []
