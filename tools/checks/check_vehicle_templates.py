# -*- coding: utf-8 -*-
"""Шаблоны машин в поиске карточки ТС: база, модули и «Тип ТС» одним выбором.

Решение пользователя 06.10.2026 (запись графа shablony-mashin-v-poiske-ts-…):
вариации вроде эвакуатора и самосвала собираются из поиска; у шаблона
несколько названий — ищется по любому; свои шаблоны (база + модули) общие;
пока — грузовое. Механика — app/modules/vehicle/templates.js, данные —
tools/data/ts_templates.py, поиск — kernel/treeSearch.js.

Что ловит сценарий:
  * обиходное название («фура», «воровайка») не находит шаблон;
  * общее слово («грузовик») выбирает один шаблон вместо всех подходящих;
  * у трала нет полного набора носителей (полуприцеп, прицеп, грузовое ТС);
  * выбор шаблона не ставит категорию, базу, модули или «Тип ТС»; шаблон на
    спецтехнике не ставит вид машины;
  * «Тип ТС» из техпаспорта перезаписывается шаблоном;
  * свой шаблон не сохраняется, не находится или не удаляется;
  * выдача поиска уходит за край окна.
"""
NAME = 'шаблоны машин ТС'

TOUCHES = ('app/modules/vehicle/templates.js', 'app/modules/vehicle/ctrl.js', 'app/kernel/treeSearch.js',
           'app/modules/vehicle/data/tsCatalog.js', 'tools/data/ts_templates.py')


def run(t):
    pg = t.page
    t.open('', wait='.reg-tr')
    pg.click('.reg-create [data-dd-toggle]')
    pg.click('.reg-create [data-create="vehicle"]')
    t.wait_for('#ts-find-q')

    names = lambda: pg.eval_on_selector_all('#ts-find-list .tsr-opt .tsr-name', 'els => els.map((e) => e.textContent.trim())')

    def find(q):
        pg.fill('#ts-find-q', q)
        t.wait_until("() => !document.querySelector('#ts-find-list').hidden")
        return names()

    t.ck(find('фура')[:1] == ['Седельное ТС'], '«фура» не нашла седельный тягач: %s' % names())
    many = find('грузовик')
    t.ck(len(many) >= 10 and 'Самосвал — грузовое ТС' in many and 'Фургон — грузовое ТС' in many,
         '«грузовик» не вывел все шаблоны: %s' % many)
    inside = pg.evaluate("() => document.querySelector('#ts-find-list').getBoundingClientRect().bottom <= innerHeight")
    t.ck(inside, 'выдача поиска ушла за нижний край окна')

    # Трал — полуприцеп к седельному тягачу, не надстройка грузовика (замечание
    # пользователя 06.10.2026).
    # Полные наборы: трал — и полуприцеп, и прицеп, и надстройка грузового ТС
    # (указание пользователя 06.10.2026: «Трал может быть как полуприцепом, так
    # и прицепом, так и модулем грузового»).
    trals = find('трал')
    for need in ('Трал — полуприцеп', 'Трал — прицеп', 'Трал — грузовое ТС'):
        t.ck(need in trals, 'у трала нет шаблона «%s»: %s' % (need, trals))

    # «Тип ТС» из техпаспорта шаблон не перезаписывает.
    pg.keyboard.press('Escape')
    t.ck('Бортовой с КМУ — грузовое ТС' in find('воровайка'), '«воровайка» не нашла бортовой с КМУ: %s' % names())
    pg.locator('#ts-find-list .tsr-opt', has_text='Бортовой с КМУ — грузовое ТС').dispatch_event('mousedown')
    t.wait_for('[data-ts-mitem]')
    mods = pg.eval_on_selector_all('[data-ts-mitem] .vh-mrow', 'els => els.map((e) => e.textContent)')
    t.ck(pg.input_value('[data-ts-cat]') == 'Грузовое' and pg.input_value('[data-ts-base]') == 'Грузовое ТС',
         'шаблон не поставил категорию и базу')
    t.ck(len(mods) == 2 and 'Бортовая платформа' in mods[0] and 'КМУ' in mods[1], 'шаблон не добавил модули: %s' % mods)
    t.ck(pg.input_value('[data-tsf="main|vtype"]') == 'грузовой, бортовой с КМУ', 'шаблон не записал «Тип ТС»')

    pg.fill('[data-tsf="main|vtype"]', 'грузовой бортовой (по ТП)')
    pg.locator('[data-tsf="main|vtype"]').press('Tab')
    find('эвакуатор с манипулятором')
    pg.locator('#ts-find-list .tsr-opt', has_text='Эвакуатор с манипулятором').first.dispatch_event('mousedown')
    t.wait_until("() => document.querySelectorAll('[data-ts-mitem]').length === 3")
    t.ck(pg.input_value('[data-tsf="main|vtype"]') == 'грузовой бортовой (по ТП)', 'шаблон перезаписал «Тип ТС» из техпаспорта')

    # Шаблон на спецтехнике: вид машины и модуль.
    pg.reload()
    t.wait_for('#ts-find-q')
    t.ck('Гидромолот — экскаватор' in find('гидромолот'), 'нет шаблона гидромолота на экскаваторе: %s' % names())
    pg.locator('#ts-find-list .tsr-opt', has_text='Гидромолот — экскаватор').first.dispatch_event('mousedown')
    t.wait_for('[data-ts-skind]')
    t.ck(pg.input_value('[data-ts-cat]') == 'Специализированная техника' and pg.input_value('[data-ts-skind]') == 'Экскаватор',
         'шаблон не поставил вид спецтехники')
    t.wait_for('[data-ts-mitem]')
    mods = pg.eval_on_selector_all('[data-ts-mitem] .vh-mrow', 'els => els.map((e) => e.textContent)')
    t.ck(any('Гидромолот' in m for m in mods), 'шаблон не добавил гидромолот: %s' % mods)

    # Свой шаблон: сохранить, найти по своему названию, удалить.
    pg.click('[data-ts-tpl-save]')
    t.wait_for('.modal-back [data-modal-field="name"]')
    pg.fill('[data-modal-field="name"]', 'Проверочный набор')
    pg.fill('[data-modal-field="aliases"]', 'проверочник')
    pg.click('.modal-back [data-modal-ok]')
    t.wait_until("() => !document.querySelector('.modal-back')")
    t.ck(find('проверочник') == ['Проверочный набор'], 'свой шаблон не находится по своему названию: %s' % names())
    pg.dispatch_event('#ts-find-list [data-tsr-del]', 'mousedown')
    t.wait_for('.modal-back [data-modal-ok]')
    pg.click('.modal-back [data-modal-ok]')
    t.wait_until("() => !document.querySelector('.modal-back')")
    pg.fill('#ts-find-q', 'проверочник')
    t.wait_until("() => !document.querySelector('#ts-find-list').hidden")
    t.ck(not names(), 'свой шаблон не удалился')
