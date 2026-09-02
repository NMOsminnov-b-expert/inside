# -*- coding: utf-8 -*-
"""Основа: экраны открываются, данные сохраняются, лог пишется, слушатели не копятся."""
NAME = 'основа'

MODULES = [
    ('apartment', 'oc-ap-1'),
    ('civil', 'oc-cv-1'),
    ('residential-house', 'oc-rh-1'),
    ('production', 'oc-pr-1'),
    ('land-plot', 'oc-lp-1'),
]


def run(t):
    pg = t.page

    # --- каждый модуль открывается, карточки ОИ тоже ---
    for mod, ocid in MODULES:
        t.open('#/oc/%s/%s' % (mod, ocid))
        t.ck(pg.locator('.card').count() > 0, '%s: карточка ОЦ не отрисовалась' % mod)

        openers = pg.locator('tr[data-open-oi], .oi-land-open')
        if openers.count():
            openers.first.click()
            pg.wait_for_timeout(700)
            t.ck(pg.locator('.ctx-plate').count() > 0, '%s: карточка ОИ без плашки' % mod)

    # --- несуществующие маршруты не роняют приложение ---
    for route in ('#/oc/civil/НЕТ-ТАКОГО', '#/oc/нет-модуля/oc-1', '#/нет-страницы'):
        t.open(route, wait='.card, .arc, .reg-thead')
        t.ck(len(t.text().strip()) > 40, 'маршрут %s дал пустой экран' % route)

    # --- правка карточки переживает уход и возврат ---
    t.open('#/oc/civil/oc-cv-1')
    pg.locator('tr[data-open-oi]').first.click()
    pg.wait_for_timeout(700)
    nm = pg.locator('[data-oi-name]')
    if t.ck(nm.count() > 0, 'в карточке литеры нет поля названия'):
        nm.fill('Проверка сохранения')
        nm.dispatch_event('change')
        pg.wait_for_timeout(400)
        pg.locator('[data-back]').first.dispatch_event('click')
        pg.wait_for_timeout(800)
        pg.locator('tr[data-open-oi]').first.click()
        pg.wait_for_timeout(700)
        t.ck(pg.locator('[data-oi-name]').input_value() == 'Проверка сохранения',
             'правка названия литеры не сохранилась')

    # --- лог действий доступен и пишется ---
    pg.locator('[data-back]').first.dispatch_event('click')
    pg.wait_for_timeout(800)
    logs = [x for x in pg.locator('.tab').all() if 'ог' in x.inner_text()]
    if t.ck(bool(logs), 'вкладки лога действий нет при роли по умолчанию'):
        logs[0].click()
        pg.wait_for_timeout(800)
        rows = pg.locator('.tbl tbody tr').count()
        t.ck(rows > 0, 'лог действий пуст после правки карточки')

    # --- заголовок вкладки браузера различает экраны ---
    t.open('', wait='.reg-thead')
    reg = pg.title()
    t.open('#/oc/civil/oc-cv-1')
    card = pg.title()
    t.ck(reg != card, 'заголовок вкладки одинаков на реестре и карточке: %r' % reg)
    t.ck('Inside' in card, 'в заголовке вкладки нет имени системы: %r' % card)

    # --- слушатели документа не накапливаются при переходах ---
    cdp = pg.context.new_cdp_session(pg)

    def listeners():
        obj = cdp.send('Runtime.evaluate', {'expression': 'document'})
        res = cdp.send('DOMDebugger.getEventListeners', {'objectId': obj['result']['objectId']})
        return len(res.get('listeners', []))

    t.open('#/oc/civil/oc-cv-1')
    before = listeners()
    for _ in range(8):
        t.open('#/oc/apartment/oc-ap-1')
        t.open('#/oc/civil/oc-cv-1')
    after = listeners()
    t.ck(after <= before + 2,
         'слушатели на document копятся при переходах: было %d, стало %d' % (before, after))
