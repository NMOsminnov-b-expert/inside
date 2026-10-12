# -*- coding: utf-8 -*-
"""Панель осмотров (pages/inspections), шаг (б) ТЗ панели осмотров.

Что ловит сценарий:
  * пункт меню «Осмотры» у роли, отличной от осмотрщика, не ведёт на панель,
    а у осмотрщика не ведёт на его экран;
  * окно назначения: без осмотрщика назначение проходит молча (должна быть
    подсказка, чего не хватает); перечень ОИ виден при «Объект целиком»;
    назначение на выбранные ОИ не запоминает их;
  * назначенный объект не уходит из «К назначению» и не появляется в
    «Назначено»; снятие не возвращает его в очередь;
  * «Мои осмотрщики» не переживают перезагрузку;
  * страница вбок прокручивается или в консоли ошибки.
"""
NAME = 'панель осмотров'

TOUCHES = ('app/pages/inspections/*', 'app/kernel/inspections.js', 'app/shell/shell.js',
           'app/kernel/router.js', 'app/kernel/boot.js')


def run(t):
    pg = t.page
    t.open('', wait='.reg-tr')
    pg.click('[data-nav="insp"]')
    if not t.ck(t.wait_for('.ip-people'), '«Осмотры» не открыли панель осмотров: %s' % pg.evaluate('location.hash')):
        return
    t.ck(pg.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'страница панели прокручивается вбок')

    before = pg.locator('[data-ip-open]').count()
    if not t.ck(before > 0, 'в «К назначению» нет объектов'):
        return
    key = pg.locator('[data-ip-open]').first.get_attribute('data-ip-open')

    # --- окно назначения -------------------------------------------------------------
    pg.locator('[data-ip-open] td:nth-child(3)').first.click()
    t.wait_for('.ia-modal')
    pg.click('[data-ia-ok]')
    t.ck('осмотрщика' in pg.inner_text('[data-ia-err]'), 'назначение без осмотрщика не объясняет, чего не хватает')
    t.ck(pg.locator('.ia-modal').count() == 1, 'окно закрылось без осмотрщика')

    has_oi = pg.locator('[data-ia-oi-all]').count() == 1
    if has_oi:
        t.ck(not pg.locator('.ia-oi').is_visible(), 'перечень ОИ виден при «Объект целиком»')
        pg.uncheck('[data-ia-oi-all]')
        t.ck(pg.locator('.ia-oi').is_visible(), 'перечень ОИ не открылся')
        first_oi = pg.locator('[data-ia-oi]').first.get_attribute('data-ia-oi')
        pg.locator('[data-ia-oi]').first.check()
    person = pg.eval_on_selector('[data-ia-person]', "s => s.options[1].value")
    pg.select_option('[data-ia-person]', person)
    pg.fill('[data-ia-date]', '2099-01-15')
    pg.click('[data-ia-ok]')
    t.wait_until("() => !document.querySelector('.ia-modal')")

    got = pg.evaluate("""async (k) => { const [typeId, ocId] = k.split('|'); const m = await import('./app/kernel/inspections.js');
      const a = m.assignmentsOf(typeId, ocId)[0]; return a ? { person: a.person, oi: a.oiIds, date: a.plannedAt } : null; }""", key)
    t.ck(got and got['person'] == person and got['date'] == '2099-01-15', 'назначение из окна не записалось: %s' % got)
    if has_oi and got:
        t.ck(got['oi'] == [first_oi], 'назначение не запомнило выбранный ОИ: %s' % got)
    t.ck(pg.locator('[data-ip-open="%s"]' % key).count() == 0, 'назначенный объект остался в «К назначению»')

    # --- «Назначено» и снятие ---------------------------------------------------------
    pg.click('[data-ip-tab="assigned"]')
    t.wait_for('[data-ip-edit]')
    t.ck(pg.locator('[data-ip-edit]').count() >= 1, 'назначение не видно во вкладке «Назначено»')
    pg.locator('[data-ip-unassign]').first.click()
    t.wait_for('[data-modal-ok]')
    pg.click('[data-modal-ok]')
    pg.click('[data-ip-tab="queue"]')
    t.ck(t.wait_for('[data-ip-open="%s"]' % key), 'снятое назначение не вернуло объект в «К назначению»')

    # --- «Мои осмотрщики» ------------------------------------------------------------------
    name = pg.locator('[data-ip-star]').first.get_attribute('data-ip-star')
    pg.locator('[data-ip-star]').first.click()
    pg.click('[data-ip-mode="mine"]')
    t.ck(pg.locator('[data-ip-person="%s"]' % name).count() == 1, 'осмотрщик не попал в «Мои»')
    pg.evaluate("async () => (await import('./app/kernel/persist.js')).saveNow()")
    pg.reload()
    t.wait_for('.ip-people')
    t.ck(pg.locator('[data-ip-mode="mine"][aria-pressed="true"]').count() == 1 and pg.locator('[data-ip-person="%s"]' % name).count() == 1,
         '«Мои осмотрщики» не пережили перезагрузку')

    # --- осмотрщику «Осмотры» — его экран ------------------------------------------------
    t.open('', wait='.reg-tr')
    pg.click('[data-user-toggle]')
    pg.check('input[name="um-role"][value="insp"]')
    pg.keyboard.press('Escape')
    pg.click('[data-nav="insp"]')
    t.ck(t.wait_until("() => location.hash.startsWith('#/insp') && !location.hash.startsWith('#/inspections')"),
         'осмотрщику «Осмотры» открыли не его экран: %s' % pg.evaluate('location.hash'))
