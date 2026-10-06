# -*- coding: utf-8 -*-
"""Контакты для связи: свои у ОЦ и подтянутые от узлов дерева учреждений.

Решение пользователя 06.10.2026 (запись графа kontakty-dlya-svyazi-…): у ОЦ —
несколько контактов (имя, должность, телефон, почта, комментарий), в свёрнутом
виде — одна строка сводки; у любого узла дерева учреждений — свои контакты,
они подтягиваются в ОЦ по цепочке от подведа вверх и в ОЦ только показываются.
Пока — нежилое здание. Механика — kernel/contacts.js.

Что ловит сценарий:
  * список контактов раскрыт без запроса — «мозолит глаза»;
  * контакт ОЦ не сохраняется после перезагрузки;
  * контакт учреждения не подтягивается в ОЦ его подведа;
  * подтянутый контакт можно править в ОЦ;
  * контакт учреждения пропадает после перезагрузки.
"""
NAME = 'контакты для связи'

TOUCHES = (
    'app/kernel/contacts.js', 'app/kernel/contacts.css', 'app/modules/civil/card/ocCard.view.js',
    'app/modules/civil/card/ocCard.ctrl.js', 'app/pages/institutions/institutions.js',
)

CARD = '#/oc/civil/oc-cv-1'


def _save(pg):
    pg.evaluate("async () => (await import('./app/kernel/persist.js')).saveNow()")


def run(t):
    pg = t.page
    fill = lambda k, v: pg.fill('[data-ct-f$="|%s"]' % k, v)

    t.open(CARD, wait='[data-ct-toggle="oc"]')
    t.ck(pg.locator('.ct-panel').count() == 0, 'контакты раскрыты без запроса')

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
    t.ck('Контакт Подведа' in pg.locator('.ct-panel').inner_text(), 'контакт учреждения не пережил перезагрузку')

    t.open(CARD, wait='[data-ct-toggle="oc"]')
    if not pg.locator('.ct-panel').count():
        pg.click('[data-ct-toggle="oc"]')
    t.wait_for('.ct-group.from')
    t.ck('Контакт Подведа' in pg.locator('.ct-group.from').inner_text(), 'контакт подведа не подтянулся в ОЦ')
    t.ck(pg.locator('.ct-group.from [data-ct-edit], .ct-group.from [data-ct-del]').count() == 0,
         'подтянутый контакт можно править в ОЦ')
    t.ck('и ещё 1' in pg.locator('[data-ct-toggle="oc"]').inner_text(), 'в сводке не учтён подтянутый контакт')
