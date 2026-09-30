# -*- coding: utf-8 -*-
"""Практики работы с документами в просмотрщике

Запись графа знаний проекта (knowledge/rules). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'rabota-s-dokumentami-v-prosmotrshchike'
KIND = 'правило'
TITLE = 'Практики работы с документами в просмотрщике'
TAGS = ['правило', 'просмотрщик', 'осмотр']
STATUS = 'действует'
DATE = '2026-09-21'
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'practice:rabota-s-dokumentami-v-prosmotrshchike'
POINTS = [
    "Практики работы с документами в просмотрщике (собраны 21.09.2026 по задаче пользователя: «нет возможности открыть ещё документ, прикрепить ещё документ; обязательны drag'n'drop, множественная вставка с именами файлов, правая кнопка мыши, перестановка вкладок, горячие клавиши как в Adobe Acrobat»).",
    'Загрузка файлов: большая зона с явной пунктирной рамкой и сильным состоянием «отпустите здесь», рядом всегда кнопка выбора файлов (зона не должна быть только для перетаскивания); выбор нескольких файлов сразу; после загрузки — сообщение, сколько именно добавлено. Источники: Uploadcare «File uploader UX best practices», Smart Interface Design Patterns «Drag-and-drop UX», Pencil & Paper «Drag & drop», LogRocket, eBay Playbook «File uploading».',
    'Брошенный мимо зоны файл браузер открывает вместо страницы, и введённое теряется — на странице нужна защита от этого (перехват dragover/drop по документу).',
    'Контекстное меню: только второстепенные действия, сгруппированы по смыслу, у пункта подписана клавиша (так учат горячим клавишам), меню открывается и с клавиатуры (Shift+F10, клавиша меню), навигация стрелками, Enter, Esc, переход по первой букве. Источники: NN/g «Designing effective contextual menus: 10 guidelines», Height «Guide to build context menus», UXPin «Keyboard navigation patterns».',
    'Горячие клавиши Acrobat (Windows): Ctrl+O открыть, Ctrl+W закрыть, Ctrl+Shift+W закрыть все, Ctrl+Tab следующий документ, PgUp/PgDn и ←/→ страницы, Ctrl+Home/End первая/последняя, Ctrl+Shift+N перейти к странице, Alt+←/→ предыдущий/следующий вид, Ctrl+0 страница целиком, Ctrl+1 реальный размер, Ctrl+2 по ширине, Ctrl+=/Ctrl+- масштаб, Ctrl+Shift+=/- поворот, Ctrl+L полноэкранный режим, F4 миниатюры, H рука, Z лупа, V выделение, Ctrl+F найти, Ctrl+P печать, Ctrl+S сохранить, Ctrl+D свойства. Источники: Adobe Help «Keyboard shortcuts in Acrobat», keyshortcuts.net, MakeUseOf.',
    'Chrome не отдаёт странице Ctrl+W, Ctrl+Shift+W, Ctrl+T, Ctrl+N, Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+PageUp/PageDown, а Ctrl+Shift+N занят окном инкогнито (Chromium issue 40576491, Mozilla bug 1052569). Для них в вебе нужны замены, показанные в подсказках и справке.',
]
