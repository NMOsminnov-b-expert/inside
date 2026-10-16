# -*- coding: utf-8 -*-
"""Выбор узла из дерева: поиск с полным путём и обзор по уровням

Запись графа знаний проекта (knowledge/practices). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'vybor-uzla-iz-dereva-poisk-s-polnym-putem-i-obzor-po-urovnyam'
KIND = 'практика'
TITLE = 'Выбор узла из дерева: поиск с полным путём и обзор по уровням'
TAGS = ['практика', 'реестр описей', 'интерфейс', 'дерево', 'поиск']
STATUS = 'действует'
DATE = '2026-10-16'
SOURCE = 'Пользователь 16.10.2026: «А еще нет указания узлов. Используй практики ui/ux для этого»; «Узлы тоже можно добавлять. нужна древовидная структура просмотра». Источники: скилл ui-ux-pro-max (Autocomplete, No Results); https://www.saasui.design/blog/saas-tree-view-file-explorer-ux-patterns ; https://developer.mescius.com/wijmo/docs/Topics/Nav/TreeView/Lazy-Loading ; https://term-ui.hexdocs.pm/TermUI.Widgets.TreeView.html ; https://www.telerik.com/blogs/simplify-hierarchical-selection-blazor-telerik-dropdowntree ; https://help.sap.com/SAPhelp_nw73/helpdata/en/4a/5b5d3c17b752f6e10000000a42189c/content.htm ; https://mantine.dev/core/cascader ; https://documentation.voss-solutions.com/release_21.1/html/_sources/src/user/concepts-navigating-the-hierarchy.rst.txt'
POINTS = [
    'Дерево: раскрытие по уровням, дети подгружаются при раскрытии (большие и глубокие деревья); всегда видно, где ты в структуре (выбранный узел выделен, предки раскрыты, путь крошками); стрелки — вверх/вниз по строкам, вправо — раскрыть, влево — свернуть или к родителю (saasui.design, mescius, term-ui).',
    'Выбор узла в форме — поле с поиском по мере ввода (скилл ui-ux-pro-max: Autocomplete), у каждого результата — полный путь предков: одинаковые имена на разных ветках иначе не различить (Telerik DropDownTree, SAP — крошка в строке результата). «Не найдено» — с подсказкой, что ввести (скилл: No Results).',
    'Рядом с поиском — обзор по уровням: крошки сверху, дети уровня списком, переход внутрь и «выбрать этот уровень» (Mantine Cascader — значение = путь от корня; крошки с выбором следующего уровня). Постоянно открытое дерево в форме занимает много места (Telerik) — в формах оно не ставится, только на экране «Учреждения».',
    'Применено в реестре описей (C:/vs code/reestr-opisey, коммит f23eac6): экран «Учреждения» — дерево слева (числа описей и позиций по поддереву, подгрузка, стрелки), карточка узла справа (крошки, актуальная опись, ссылки на свод, описи, позиции; добавить учреждение и подвед, правка кода и имени с пересчётом путей поддерева); общий выбор узла nodes.js — во всех отборах, загрузке и просмотре описи вместо списков из тысяч путей.',
]
LINKS = [
    {'тип': 'относится к', 'куда': 'tz-reestr-opisey', 'папка': 'tasks'},
    {'тип': 'опирается на', 'куда': 'sbor-praktik-pered-dizaynom', 'папка': 'rules'},
]
