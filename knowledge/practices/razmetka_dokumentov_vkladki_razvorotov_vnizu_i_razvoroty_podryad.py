# -*- coding: utf-8 -*-
"""Разметка документов: вкладки разворотов внизу и развороты подряд

Запись графа знаний проекта (knowledge/practices). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'razmetka-dokumentov-vkladki-razvorotov-vnizu-i-razvoroty-podryad'
KIND = 'практика'
TITLE = 'Разметка документов: вкладки разворотов внизу и развороты подряд'
TAGS = ['практика', 'разметка', 'интерфейс', 'клавиши', 'утилита']
STATUS = 'действует'
DATE = '2026-09-29'
SOURCE = 'сообщение пользователя 29.09.2026: «снизу сделать переключение между страницами (полотнами). Как в excel или corel draw… Надо — переключил режим и у тебя уже вертикально страницы по порядку»'
POINTS = [
    'CorelDRAW (product.corel.com/help, «Add, duplicate, rename, and delete pages», «Position and order pages»): вкладки страниц в навигаторе документа внизу; кнопки добавить страницу до и после; правая кнопка по вкладке — вставить до/после, переименовать, удалить; порядок — перетаскиванием вкладки. Применено: полоса вкладок разворотов текущей главы над строкой состояния — ‹ ›, «+», меню правой кнопки, перетаскивание, двойной щелчок — переименовать.',
    'Excel (excelcampus.com shortcuts-worksheet-tabs; keyboardgym.com excel sheet-navigation): Ctrl+PageDown / Ctrl+PageUp — следующий / предыдущий лист; при многих вкладках — список для перехода (правая кнопка по стрелкам). Применено: Ctrl+PageDown / Ctrl+PageUp — развороты (как в Excel), PageDown / PageUp — тоже; главы — Ctrl+Shift+PageDown / PageUp; список всех разворотов — Ctrl+P и кнопка у вкладок.',
    'CorelDRAW Multipage view (coreldraw.com/en/learn/tutorials/multipage-view; «Page views»): все страницы сразу, без щелчков по вкладкам; раскладка столбцом — для документов с порядком страниц. Применено: режим «Подряд» — все развороты проекта столбцом по главам, в порядке следования; прокрутка — текущий разворот следует за ней; щелчок — выбрать, двойной щелчок или Enter — открыть для правки; переключатель у вкладок и Ctrl+Shift+V.',
]
LINKS = [
    {'тип': 'применено в', 'куда': 'tools-razmetka', 'папка': 'tools'},
    {
        'тип': 'продолжает',
        'куда': 'interfeys-razmetki-dokumentov-klavishi-palitra-komand-inspektor-po-vyb',
        'папка': 'practices',
    },
]
