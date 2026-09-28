# -*- coding: utf-8 -*-
"""app/kernel/dialog.js

Запись графа знаний проекта (knowledge/code). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'app-kernel-dialog-js'
KIND = 'модуль кода'
TITLE = 'app/kernel/dialog.js'
TAGS = ['модуль кода', 'kernel']
STATUS = 'актуально'
DATE = '2026-09-04'
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'app/kernel/dialog.js'
POINTS = ['Модальные confirm/prompt/select/formDialog вместо нативных браузерных диалогов.',
 '04.09.2026: openModal снимает все существующие .modal-back перед показом нового окна. Два диалога поверх '
 'друг друга — тупик: клик по кнопке нижнего перехватывает фон верхнего. Вопрос прежнего окна к этому '
 'моменту всё равно задан по устаревшему состоянию.']
LINKS = [{'тип': 'depends_on', 'куда': 'app-kernel-dom-js', 'папка': 'code'},
 {'тип': 'part_of', 'куда': 'app-kernel', 'папка': 'code'},
 {'тип': 'записано в', 'куда': 'docs-reestr-kosyakov-md', 'папка': 'rules'}]
