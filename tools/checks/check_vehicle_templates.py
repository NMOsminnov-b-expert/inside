# -*- coding: utf-8 -*-
"""Шаблоны машин в поиске карточки ТС: база, модули и «Тип ТС» одним выбором.

Решение пользователя 06.10.2026 (запись графа shablony-mashin-v-poiske-ts-…):
вариации вроде эвакуатора и самосвала собираются из поиска; у шаблона
несколько названий — ищется по любому; свои шаблоны (база + модули) общие;
пока — грузовое. Механика — app/modules/vehicle/templates.js, данные —
tools/data/ts_templates.py, поиск — kernel/treeSearch.js.

Что ловит сценарий:
  * обиходное название («фура», «воровайка») не находит шаблон;
  * запись техпаспорта как есть («вилочный погрузчик/штабелер», «седан»,
    «автомобиль скорой помощи») не находит вид или первым стоит чужой;
  * общее слово («грузовик») выбирает один шаблон вместо всех подходящих;
  * у трала нет полного набора носителей (полуприцеп, прицеп, грузовое ТС);
  * выбор шаблона не ставит категорию, базу, модули или «Тип ТС»; шаблон на
    спецтехнике не ставит вид машины;
  * «Тип ТС» из техпаспорта перезаписывается шаблоном;
  * свой шаблон не сохраняется, не находится или не удаляется;
  * выдача поиска уходит за край окна;
  * модель («65115») не находится, не подписано, что она соберёт, выбор не
    ставит базу и модули или не пишет «Марка, модель»; модель, записанная
    по-разному (ГАЗ 53), даёт один вариант.
"""
import re

NAME = 'шаблоны машин ТС'

TOUCHES = ('app/modules/vehicle/templates.js', 'app/modules/vehicle/ctrl.js', 'app/kernel/treeSearch.js',
           'app/modules/vehicle/data/tsCatalog.js', 'tools/data/ts_templates.py', 'app/modules/vehicle/data/tsModels.js')


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
    # Записи техпаспортов как есть (сверка с реестром ТС учреждений 06.10.2026,
    # docs/sverka-tipov-ts.xlsx): знаки, лишние слова, кузов легкового.
    for q, first in (('седан', 'Легковой автомобиль и внедорожник'), ('платформа', 'Бортовой — грузовое ТС'),
                     ('вилочный погрузчик/штабелер', 'Вилочный погрузчик'), ('кунг', 'Кузов-фургон (КУНГ) — грузовое ТС'),
                     ('автомобиль скорой помощи', 'Скорая помощь класса A (санитарная) — легковой'),
                     ('погрузчик', 'Вилочный погрузчик')):
        t.ck(find(q)[:1] == [first], '«%s» первым не «%s»: %s' % (q, first, names()[:3]))
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

    # Шаблон выбран — в «Тип ТС» его запись (решение пользователя 07.10.2026);
    # в поиске — слова, а не аббревиатуры («заместо КМУ — манипулятор»).
    pg.keyboard.press('Escape')
    t.ck('Бортовой с манипулятором (КМУ) — грузовое ТС' in find('воровайка'), '«воровайка» не нашла бортовой с манипулятором: %s' % names())
    pg.locator('#ts-find-list .tsr-opt', has_text='Бортовой с манипулятором (КМУ) — грузовое ТС').dispatch_event('mousedown')
    t.wait_for('[data-ts-mitem]')
    mods = pg.eval_on_selector_all('[data-ts-mitem] .vh-mrow', 'els => els.map((e) => e.textContent)')
    t.ck(pg.input_value('[data-ts-cat]') == 'Грузовое' and pg.input_value('[data-ts-base]') == 'Грузовое ТС',
         'шаблон не поставил категорию и базу')
    t.ck(len(mods) == 2 and 'Бортовая платформа' in mods[0] and 'КМУ' in mods[1], 'шаблон не добавил модули: %s' % mods)
    t.ck(pg.input_value('[data-tsf="main|vtype"]') == 'грузовой, бортовой с манипулятором (КМУ)', 'шаблон не записал «Тип ТС»')

    # Выбран пункт — из него запись «Тип ТС», и у базы тоже (решение
    # пользователя 07.10.2026: «Если мы выбираем пункт, из него обязательно
    # подтягиваем данные»; снимок: «вездех» → база вездехода оставляла «вездех»).
    pg.fill('#ts-find-q', '')
    pg.click('#ts-find-q')
    pg.keyboard.type('вездех')
    t.wait_until("() => !document.querySelector('#ts-find-list').hidden")
    t.ck(names()[:1] == ['Вездеход, гусеничный транспортёр'], '«вездех» первым не база вездехода: %s' % names()[:3])
    pg.keyboard.press('Enter')
    t.wait_until("() => document.querySelector('#ts-find-q').value === 'вездеход'")
    # Шаблон без своей формулировки в техпаспорте — по правилу «носитель, вид».
    pg.fill('#ts-find-q', '')
    pg.click('#ts-find-q')
    pg.keyboard.type('буровая установка')
    t.wait_until("() => !document.querySelector('#ts-find-list').hidden")
    pg.locator('#ts-find-list .tsr-opt', has_text='Буровая установка — грузовое ТС').first.click()
    t.wait_until("() => document.querySelector('#ts-find-q').value === 'специальный, буровая установка'")
    # Записи техпаспорта своей категории — в выдаче единого поля, по слову кузова
    # — первыми (замечание пользователя 07.10.2026: «вбил седан, а мне заместо
    # „легковой, седан“ выдало „легковой“ — не дело»); пустое поле по щелчку —
    # список записей; шаблон по своему слову остаётся выше записи.
    pg.fill('#ts-find-q', '')
    t.wait_until("() => !document.querySelector('#ts-find-list').hidden")
    t.ck(len(names()) >= 20 and all(',' in n or ' ' in n for n in names()[:5]),
         'пустое поле не показало записи техпаспорта: %s' % names()[:3])
    pg.keyboard.type('седан')
    t.wait_until("() => [...document.querySelectorAll('#ts-find-list .tsr-name')].some((e) => e.textContent === 'легковой, седан')")
    pg.keyboard.press('Enter')
    t.wait_until("() => document.querySelector('#ts-find-q').value === 'легковой, седан'")
    t.wait_until("() => document.querySelector('[data-ts-cat]') && document.querySelector('[data-ts-cat]').value === 'Легковое'")
    t.ck(find('самосвал')[:1] == ['Самосвал — грузовое ТС'], '«самосвал» первым не шаблон: %s' % names()[:3])
    pg.keyboard.press('Escape')

    # Ничего не выбрано — вписанный текст остаётся.
    pg.fill('#ts-find-q', 'грузовой бортовой по ТП')
    pg.locator('#ts-find-q').press('Tab')
    t.ck(pg.input_value('[data-tsf="main|vtype"]') == 'грузовой бортовой по ТП', 'вписанный без выбора текст пропал')

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

    # Модель из записей техпаспортов: выбор ставит базу и модули по тому, чем
    # модель чаще записана, и пишет «Марка, модель» (задача пользователя
    # 06.10.2026: «модель вбить, и нам уже выбралась база… и модули подтянуть»).
    pg.reload()
    t.wait_for('#ts-find-q')
    got = find('65115')
    t.ck(got[:1] == ['КАМАЗ 65115'], '«65115» первым не КАМАЗ 65115: %s' % got[:4])
    note = pg.eval_on_selector_all('#ts-find-list .tsr-opt', 'els => els[0].innerText')
    t.ck('Самосвал' in note, 'у модели не подписано, что она соберёт: %r' % note)
    pg.locator('#ts-find-list .tsr-opt').first.dispatch_event('mousedown')
    t.wait_for('[data-ts-mitem]')
    mods = pg.eval_on_selector_all('[data-ts-mitem] .vh-mrow', 'els => els.map((e) => e.textContent)')
    t.ck(pg.input_value('[data-ts-cat]') == 'Грузовое' and pg.input_value('[data-ts-base]') == 'Грузовое ТС',
         'модель не поставила категорию и базу')
    t.ck(any('Самосвальный кузов' in m for m in mods), 'модель не добавила модуль: %s' % mods)
    t.wait_for('[data-tsf="main|make"]')
    t.ck(pg.input_value('[data-tsf="main|make"]') == 'КАМАЗ 65115', 'модель не записалась в «Марка, модель»')
    t.ck(len([n for n in find('газ 53') if n == 'ГАЗ 53']) >= 2, 'у ГАЗ 53 нет нескольких вариантов: %s' % names()[:6])
    pg.keyboard.press('Escape')

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

    # Трал: свои поля модуля — длина, аппарели (трапы) по приводу и конструкции,
    # передняя загрузка, подвеска; число осей и тормоза — у полуприцепа в полях
    # базы (заметки пользователя 07.10.2026: «Отдельно по тралам»).
    pg.reload()
    t.wait_for('#ts-find-q')
    find('трал')
    pg.locator('#ts-find-list .tsr-opt', has_text='Трал — полуприцеп').first.dispatch_event('mousedown')
    t.wait_for('[data-ts-mitem]')
    has = lambda sel: pg.locator(sel).count() > 0
    # Модуль трала — по кнопке-заголовку: в раскрытом соседнем модуле его
    # название есть в списке модулей.
    pg.locator('[data-ts-mpick]', has_text='Низкорамная платформа (трал)').first.click()
    t.wait_until("() => document.querySelectorAll('.vh-mform [data-tsf$=\"|dlinaPlatformy\"]').length === 1")
    for key in ('dlinaPlatformy', 'appareliTrapyPrivod', 'appareliTrapyKonstrukciya', 'perednyayaZagruzkaSemnyyGusak',
                'tipPodveski'):
        t.ck(has('.vh-mform [data-tsf$="|%s"]' % key), 'у трала нет поля %s' % key)
    t.ck(has('[data-tsf="main|axles"]') and has('[data-tsf="main|brakeType"]'), 'у полуприцепа под тралом нет осей или тормозов')
