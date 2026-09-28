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
    'Вывод с заголовками якорей и числом записей: python tools/knowledge/graph.py toc. Новый раздел или якорь — правкой этой записи (пункт + связь «якорь раздела»); оглавление держать в актуальном виде при каждой крупной задаче.',
    'Открытые вопросы и задачи раздела не требуют: python tools/knowledge/graph.py find, папки questions/ и tasks/ со статусом «открыт».',
    'Раздел «Порядок работы со знаниями» — метки: правило, граф, codegraph; якоря: graf-proekta-poryadok-raboty, graf-znaniy-pervyy-istochnik, codegraph.',
    'Раздел «Правила работы с пользователем» — метки: работа-с-claude, claude-md; якоря: dannye-proekta-naruzhu-ne-uhodyat, claude-md-zhurnal-izmeneniy-vmeste-s-kazhdoy-pravkoy, sbor-praktik-pered-dizaynom.',
    'Раздел «Архитектура макета» — метки: kernel, модуль кода; якоря: izolyaciya-moduley, kartochka-zemelnogo-uchastka-isklyuchenie-iz-izolyacii-moduley, kontrakt-sozdaniya-oc.',
    'Раздел «Гражданское здание — эталон карточек» — метки: civil; якоря: civil-kategorii-liter-i-ts, claude-project-civil-card-correction, app-modules-civil.',
    'Раздел «Механизмы и транспортные средства» — метки: vehicle, mechanisms, распространение; якоря: mehanizmy-i-ts-v-lyubom-oc, kartochka-mekhanizmov-po-klassifikatoru, kartochka-ts-baza-modul, ts-baza-plyus-modul, spectehnika-eto-ts.',
    'Раздел «Методология и расчёты» — метки: методология, расчёт; якоря: tipizaciya-oc-po-vnutrenney-ploschadi, klassy-liter-pomescheniy, rasschitannoe-pole.',
    'Раздел «Роли системы»; якоря: sostav-roley-sistemy, model-roley-ocmenu-role-perms.',
    'Раздел «Документы, фото и просмотрщик» — метки: документы, просмотрщик; якоря: prosmotrshchik-dokumentov-i-foto, rabota-s-dokumentami-v-prosmotrshchike.',
    'Раздел «Оформление интерфейса» — метки: оформление, практика, интерфейс; якоря: sbor-praktik-pered-dizaynom, oformlenie-tablicy-dannyh, oformlenie-vkladok-i-menyu.',
    'Раздел «Проверки» — метки: проверки; якоря: proveryat-povedenie-scenariem-a-ne-chteniem-koda, ozhidaniya-v-proverkah-tolko-po-faktu, tools-checks.',
    'Раздел «Инструменты» — метки: утилита; якоря: tools-graf, tools-razmetka, codegraph, tools-visual-parity, view-graph-prosmotr-grafa.',
    'Раздел «Пул задач программы «Граф проекта»» — метки: пул-граф-проекта; якоря: graf-sortirovka-po-date-dobavleniya-i-izmeneniya, graf-filtr-prozrachnost-vmesto-skrytiya, graf-oglavlenie-v-programme, ikonki-prilozheniy-graf-i-razmetka.',
    'Раздел «Под вопросом — не трогать без указания» — метки: под-вопросом; якоря: claude-project-comparative-hidden, sravnitelnyy-podhod.',
]
LINKS = [
    {
        'тип': 'якорь раздела «Порядок работы со знаниями»',
        'куда': 'graf-proekta-poryadok-raboty',
        'папка': 'rules',
    },
    {
        'тип': 'якорь раздела «Порядок работы со знаниями»',
        'куда': 'graf-znaniy-pervyy-istochnik',
        'папка': 'rules',
    },
    {'тип': 'якорь раздела «Порядок работы со знаниями»', 'куда': 'codegraph', 'папка': 'tools'},
    {
        'тип': 'якорь раздела «Правила работы с пользователем»',
        'куда': 'dannye-proekta-naruzhu-ne-uhodyat',
        'папка': 'rules',
    },
    {
        'тип': 'якорь раздела «Правила работы с пользователем»',
        'куда': 'claude-md-zhurnal-izmeneniy-vmeste-s-kazhdoy-pravkoy',
        'папка': 'rules',
    },
    {
        'тип': 'якорь раздела «Правила работы с пользователем»',
        'куда': 'sbor-praktik-pered-dizaynom',
        'папка': 'rules',
    },
    {'тип': 'якорь раздела «Архитектура макета»', 'куда': 'izolyaciya-moduley', 'папка': 'rules'},
    {
        'тип': 'якорь раздела «Архитектура макета»',
        'куда': 'kartochka-zemelnogo-uchastka-isklyuchenie-iz-izolyacii-moduley',
        'папка': 'rules',
    },
    {'тип': 'якорь раздела «Архитектура макета»', 'куда': 'kontrakt-sozdaniya-oc', 'папка': 'rules'},
    {
        'тип': 'якорь раздела «Гражданское здание — эталон карточек»',
        'куда': 'civil-kategorii-liter-i-ts',
        'папка': 'decisions',
    },
    {
        'тип': 'якорь раздела «Гражданское здание — эталон карточек»',
        'куда': 'claude-project-civil-card-correction',
        'папка': 'rules',
    },
    {
        'тип': 'якорь раздела «Гражданское здание — эталон карточек»',
        'куда': 'app-modules-civil',
        'папка': 'code',
    },
    {
        'тип': 'якорь раздела «Механизмы и транспортные средства»',
        'куда': 'mehanizmy-i-ts-v-lyubom-oc',
        'папка': 'decisions',
    },
    {
        'тип': 'якорь раздела «Механизмы и транспортные средства»',
        'куда': 'kartochka-mekhanizmov-po-klassifikatoru',
        'папка': 'decisions',
    },
    {
        'тип': 'якорь раздела «Механизмы и транспортные средства»',
        'куда': 'kartochka-ts-baza-modul',
        'папка': 'decisions',
    },
    {
        'тип': 'якорь раздела «Механизмы и транспортные средства»',
        'куда': 'ts-baza-plyus-modul',
        'папка': 'decisions',
    },
    {
        'тип': 'якорь раздела «Механизмы и транспортные средства»',
        'куда': 'spectehnika-eto-ts',
        'папка': 'decisions',
    },
    {
        'тип': 'якорь раздела «Методология и расчёты»',
        'куда': 'tipizaciya-oc-po-vnutrenney-ploschadi',
        'папка': 'decisions',
    },
    {'тип': 'якорь раздела «Методология и расчёты»', 'куда': 'klassy-liter-pomescheniy', 'папка': 'sources'},
    {'тип': 'якорь раздела «Методология и расчёты»', 'куда': 'rasschitannoe-pole', 'папка': 'decisions'},
    {'тип': 'якорь раздела «Роли системы»', 'куда': 'sostav-roley-sistemy', 'папка': 'rules'},
    {'тип': 'якорь раздела «Роли системы»', 'куда': 'model-roley-ocmenu-role-perms', 'папка': 'rules'},
    {
        'тип': 'якорь раздела «Документы, фото и просмотрщик»',
        'куда': 'prosmotrshchik-dokumentov-i-foto',
        'папка': 'rules',
    },
    {
        'тип': 'якорь раздела «Документы, фото и просмотрщик»',
        'куда': 'rabota-s-dokumentami-v-prosmotrshchike',
        'папка': 'rules',
    },
    {'тип': 'якорь раздела «Оформление интерфейса»', 'куда': 'sbor-praktik-pered-dizaynom', 'папка': 'rules'},
    {'тип': 'якорь раздела «Оформление интерфейса»', 'куда': 'oformlenie-tablicy-dannyh', 'папка': 'rules'},
    {'тип': 'якорь раздела «Оформление интерфейса»', 'куда': 'oformlenie-vkladok-i-menyu', 'папка': 'rules'},
    {
        'тип': 'якорь раздела «Проверки»',
        'куда': 'proveryat-povedenie-scenariem-a-ne-chteniem-koda',
        'папка': 'rules',
    },
    {'тип': 'якорь раздела «Проверки»', 'куда': 'ozhidaniya-v-proverkah-tolko-po-faktu', 'папка': 'rules'},
    {'тип': 'якорь раздела «Проверки»', 'куда': 'tools-checks', 'папка': 'tools'},
    {'тип': 'якорь раздела «Инструменты»', 'куда': 'tools-graf', 'папка': 'tools'},
    {'тип': 'якорь раздела «Инструменты»', 'куда': 'tools-razmetka', 'папка': 'tools'},
    {'тип': 'якорь раздела «Инструменты»', 'куда': 'codegraph', 'папка': 'tools'},
    {'тип': 'якорь раздела «Инструменты»', 'куда': 'tools-visual-parity', 'папка': 'tools'},
    {'тип': 'якорь раздела «Инструменты»', 'куда': 'view-graph-prosmotr-grafa', 'папка': 'tools'},
    {
        'тип': 'якорь раздела «Пул задач программы «Граф проекта»»',
        'куда': 'graf-sortirovka-po-date-dobavleniya-i-izmeneniya',
        'папка': 'tasks',
    },
    {
        'тип': 'якорь раздела «Пул задач программы «Граф проекта»»',
        'куда': 'graf-filtr-prozrachnost-vmesto-skrytiya',
        'папка': 'tasks',
    },
    {
        'тип': 'якорь раздела «Под вопросом — не трогать без указания»',
        'куда': 'claude-project-comparative-hidden',
        'папка': 'rules',
    },
    {
        'тип': 'якорь раздела «Под вопросом — не трогать без указания»',
        'куда': 'sravnitelnyy-podhod',
        'папка': 'decisions',
    },
    {
        'тип': 'якорь раздела «Пул задач программы «Граф проекта»»',
        'куда': 'graf-oglavlenie-v-programme',
        'папка': 'tasks',
    },
    {
        'тип': 'якорь раздела «Пул задач программы «Граф проекта»»',
        'куда': 'ikonki-prilozheniy-graf-i-razmetka',
        'папка': 'tasks',
    },
    {
        'тип': 'якорь раздела «Методология и расчёты»',
        'куда': 'praktika-dolya-celogo-polosoy',
        'папка': 'practices',
    },
    {
        'тип': 'якорь раздела «Инструменты»',
        'куда': 'praktika-filtr-priglushaet-ne-pryachet',
        'папка': 'practices',
    },
    {
        'тип': 'якорь раздела «Пул задач программы «Граф проекта»»',
        'куда': 'graf-filtr-po-date',
        'папка': 'tasks',
    },
]
