# -*- coding: utf-8 -*-
"""Рассчитанное поле — только для чтения, пересчёт сразу

Запись графа знаний проекта (knowledge/decisions). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'rasschitannoe-pole'
KIND = 'решение'
TITLE = 'Рассчитанное поле — только для чтения, пересчёт сразу'
TAGS = ['решение', 'civil', 'vehicle', 'методология']
STATUS = 'действует'
DATE = '2026-09-23'
SOURCE = 'прежний граф знаний (перенос 28.09.2026)'
OLD_NAME = 'practice:rasschitannoe-pole'
POINTS = [
    'Практика (собрана 23.09.2026): рассчитанное поле показывается только для чтения и пересчитывается сразу при смене исходных полей (ActivityInfo «Calculated field» https://www.activityinfo.org/support/docs/forms/calculated-field.html; Oracle «Read-Only Calculated Fields» https://docs.oracle.com/en/cloud/saas/applications-common/26a/cgsac/read-only-calculated-fields.html; Cognito Forms). Зависимые поля скрыты, пока не сделан выбор-родитель (NN/g «Progressive Disclosure» https://www.nngroup.com/articles/progressive-disclosure/; PatternFly «Progressive Disclosure»).',
    'Как применено в гражданском (23.09.2026): «Класс ОИ» — текст без ввода, считается по признакам в блоке «Класс капитальности»; пока признаков не хватает — перечень недостающих вместо класса. Вид литеры (три варианта) — переключатель, как «Вид объекта» у ТС; признаки класса и доп. параметры показываются по выбранному виду.',
]
