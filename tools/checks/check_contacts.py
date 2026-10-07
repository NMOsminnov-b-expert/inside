# -*- coding: utf-8 -*-
"""Контакты для связи: свои у ОЦ и подтянутые от узлов дерева учреждений.

Решение пользователя 06.10.2026 (запись графа kontakty-dlya-svyazi-…): у ОЦ —
несколько контактов (имя, должность, телефон, почта, комментарий), в свёрнутом
виде — одна строка сводки; у любого узла дерева учреждений — свои контакты,
они подтягиваются в ОЦ по цепочке от подведа вверх и в ОЦ только показываются.
С 07.10.2026 — во всех типах ОЦ, кроме механизмов (решение пользователя: «во
все ОЦ»; «Механизмы не трогать»). Механика — kernel/contacts.js.

Что ловит сценарий:
  * список контактов раскрыт без запроса — «мозолит глаза»; раскрытый —
    не в выпадающей панели, а раздвигает карточку («не спрятал их в
    скрывающемся меню», 06.10.2026);
  * панель не закрывается щелчком снаружи или Esc; Esc закрывает заодно и
    просмотрщик документов;
  * контакт не удаляется (было: confirm браузера, который может быть
    заблокирован, — теперь окно макета);
  * контакт ОЦ не сохраняется после перезагрузки;
  * контакт учреждения не подтягивается в ОЦ его подведа;
  * подтянутый контакт можно править в ОЦ;
  * контакт учреждения пропадает после перезагрузки;
  * у квартиры, жилого дома, участка или ТС нет поля контактов, или
    добавленный там контакт не переживает перезагрузку.
"""
NAME = 'контакты для связи'

TOUCHES = (
    'app/kernel/contacts.js', 'app/kernel/contacts.css', 'app/modules/civil/card/ocCard.view.js',
    'app/modules/civil/card/ocCard.ctrl.js', 'app/pages/institutions/institutions.js',
    'app/modules/apartment/card/ocCard.view.js', 'app/modules/apartment/card/ocCard.ctrl.js',
    'app/modules/residential-house/card/ocCard.view.js', 'app/modules/residential-house/card/ocCard.ctrl.js',
    'app/modules/land-plot/card/ocCard.view.js', 'app/modules/land-plot/card/ocCard.ctrl.js',
    'app/modules/vehicle/parties.view.js', 'app/modules/vehicle/view.js', 'app/modules/vehicle/ctrl.js',
)

OTHER = ('#/oc/apartment/oc-ap-1', '#/oc/residential-house/oc-rh-1', '#/oc/land-plot/oc-lp-1')

CARD = '#/oc/civil/oc-cv-1'


def _save(pg):
    pg.evaluate("async () => (await import('./app/kernel/persist.js')).saveNow()")


def run(t):
    pg = t.page
    fill = lambda k, v: pg.fill('[data-ct-f$="|%s"]' % k, v)

    t.open(CARD, wait='[data-ct-toggle="oc"]')
    t.ck(pg.locator('.ct-pop').count() == 0, 'контакты раскрыты без запроса')

    # --- свой контакт ОЦ ---------------------------------------------------------
    pg.click('[data-ct-toggle="oc"]')
    pg.click('[data-ct-add="oc"]')
    t.wait_for('[data-ct-f$="|name"]')
    fill('name', 'Контакт Объекта')
    fill('position', 'Завхоз')
    fill('phone', '+996 555 00-11-22')
    pg.keyboard.press('Enter')
    t.wait_until("() => !document.querySelector('.ct-form')")
    _save(pg)
    pg.reload()
    t.wait_for('[data-ct-toggle="oc"]')
    t.ck('Контакт Объекта' in pg.locator('[data-ct-toggle="oc"]').inner_text(),
         'контакт ОЦ не пережил перезагрузку: %s' % pg.locator('[data-ct-toggle="oc"]').inner_text())

    # --- контакт подведа — подтягивается в ОЦ ----------------------------------------
    podved = pg.evaluate("""async () => (await import('./app/modules/civil/data/store.js'))
      .records.find((r) => r.id === 'oc-cv-1').podved""")
    t.open('#/institutions?name=%s&tab=contacts' % podved, wait='[data-ct-add="inst"]')
    pg.click('[data-ct-add="inst"]')
    fill('name', 'Контакт Подведа')
    fill('email', 'podved@example.kg')
    pg.keyboard.press('Enter')
    t.wait_until("() => !document.querySelector('.ct-form')")
    _save(pg)

    pg.reload()
    t.wait_for('[data-itab="contacts"]')
    t.ck('Контакт Подведа' in pg.locator('.ict-panel').inner_text(), 'контакт учреждения не пережил перезагрузку')

    t.open(CARD, wait='[data-ct-toggle="oc"]')
    if not pg.locator('.ct-pop').count():
        pg.click('[data-ct-toggle="oc"]')
    t.wait_for('.ct-pop .ct-group.from')
    pos = pg.evaluate("() => getComputedStyle(document.querySelector('.ct-pop')).position")
    t.ck(pos == 'fixed', 'контакты не в выпадающей панели: %s' % pos)
    t.ck('Контакт Подведа' in pg.locator('.ct-group.from').inner_text(), 'контакт подведа не подтянулся в ОЦ')
    t.ck(pg.locator('.ct-group.from [data-ct-edit], .ct-group.from [data-ct-del]').count() == 0,
         'подтянутый контакт можно править в ОЦ')
    t.ck('+1' in pg.locator('.ct-sum').inner_text(), 'в сводке не учтён подтянутый контакт')

    # --- закрытие: Esc (просмотрщик остаётся), щелчок снаружи ------------------------
    viewer = pg.locator('[data-vclose]').count()
    pg.keyboard.press('Escape')
    t.wait_until("() => !document.querySelector('.ct-pop')")
    t.ck(pg.locator('[data-vclose]').count() == viewer, 'Esc закрыл заодно просмотрщик')
    pg.click('[data-ct-toggle="oc"]')
    t.wait_for('.ct-pop')
    pg.mouse.click(5, 5)
    t.wait_until("() => !document.querySelector('.ct-pop')")

    # --- удаление — окном макета ------------------------------------------------------
    pg.click('[data-ct-toggle="oc"]')
    t.wait_for('.ct-item.own [data-ct-del]')
    pg.click('.ct-item.own [data-ct-del]')
    t.wait_for('.modal-back [data-modal-ok]')
    pg.click('.modal-back [data-modal-ok]')
    t.wait_until("() => !document.querySelector('.ct-item.own')")
    t.ck(pg.locator('.ct-pop').count() == 1, 'после удаления панель закрылась')
    _save(pg)
    pg.reload()
    t.wait_for('[data-ct-toggle="oc"]')
    t.ck('Контакт Объекта' not in pg.locator('.ct-sum').inner_text(), 'удалённый контакт вернулся после перезагрузки')

    # --- остальные типы ОЦ: поле есть, свой контакт сохраняется ----------------------
    def own_contact(where):
        t.wait_for('[data-ct-toggle="oc"]')
        pg.click('[data-ct-toggle="oc"]')
        pg.click('[data-ct-add="oc"]')
        t.wait_for('[data-ct-f$="|name"]')
        fill('name', 'Контакт ' + where)
        pg.keyboard.press('Enter')
        t.wait_until("() => !document.querySelector('.ct-form')")
        _save(pg)
        pg.reload()
        t.wait_for('[data-ct-toggle="oc"]')
        t.ck(('Контакт ' + where) in pg.locator('[data-ct-toggle="oc"]').inner_text(),
             '%s: контакт не пережил перезагрузку' % where)

    for route in OTHER:
        t.open(route, wait='.card')
        t.ck(pg.locator('[data-ct-toggle="oc"]').count() == 1, '%s: нет поля «Контакты для связи»' % route)
        if pg.locator('[data-ct-toggle="oc"]').count():
            own_contact(route.split('/')[2])
    t.open('', wait='.reg-tr')
    pg.click('.reg-create [data-dd-toggle]')
    pg.click('.reg-create [data-create="vehicle"]')
    t.wait_for('[data-ts-cat]')
    t.ck(pg.locator('[data-ct-toggle="oc"]').count() == 1, 'у ТС нет поля «Контакты для связи»')
    if pg.locator('[data-ct-toggle="oc"]').count():
        own_contact('ТС')
