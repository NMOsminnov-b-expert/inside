# -*- coding: utf-8 -*-
"""Панель осмотров (pages/inspections), шаг (б) ТЗ панели осмотров.

Что ловит сценарий:
  * пункт меню «Осмотры» у роли, отличной от осмотрщика, не ведёт на панель,
    а у осмотрщика не ведёт на его экран;
  * панель назначения: при открытии пуста или открыта модальным окном
    (замечание пользователя 12.10.2026 «Зачем опять модалки?»); без
    осмотрщика назначение проходит молча; перечень ОИ виден при «Объект
    целиком»; назначение на выбранные ОИ не запоминает их; две отметки
    флажками не дают панель на несколько объектов;
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

    before = pg.locator('[data-ip-row]').count()
    if not t.ck(before > 0, 'в «К назначению» нет объектов'):
        return
    # Экран не пустой: первая строка выбрана и разобрана в панели сразу.
    key = pg.locator('[data-ip-row]').first.get_attribute('data-ip-row')
    t.ck(pg.locator('tr.cur[data-ip-row="%s"]' % key).count() == 1 and pg.locator('.ip-pane [data-ip-f-ok]').count() == 1,
         'при открытии не выбрана первая строка или панель назначения пуста')
    t.ck(pg.locator('.modal-back').count() == 0, 'панель назначения открыта модальным окном')

    # --- панель назначения ---------------------------------------------------------------
    pg.click('[data-ip-f-ok]')
    t.ck('осмотрщика' in pg.inner_text('[data-ip-err]'), 'назначение без осмотрщика не объясняет, чего не хватает')

    has_oi = pg.locator('[data-ip-f-whole]').count() == 1
    if has_oi:
        t.ck(not pg.locator('.ip-oi').is_visible(), 'перечень ОИ виден при «Объект целиком»')
        pg.uncheck('[data-ip-f-whole]')
        t.ck(pg.locator('.ip-oi').is_visible(), 'перечень ОИ не открылся')
        first_oi = pg.locator('[data-ip-f-oi]').first.get_attribute('data-ip-f-oi')
        pg.locator('[data-ip-f-oi]').first.check()
    person = pg.eval_on_selector('[data-ip-f-person]', "s => s.options[1].value")
    pg.select_option('[data-ip-f-person]', person)
    pg.fill('[data-ip-f-date]', '2099-01-15')
    pg.click('[data-ip-f-ok]')
    t.wait_until("(k) => !document.querySelector('[data-ip-row=\"' + k + '\"]')", key)

    got = pg.evaluate("""async (k) => { const [typeId, ocId] = k.split('|'); const m = await import('./app/kernel/inspections.js');
      const a = m.assignmentsOf(typeId, ocId)[0]; return a ? { person: a.person, oi: a.oiIds, date: a.plannedAt } : null; }""", key)
    t.ck(got and got['person'] == person and got['date'] == '2099-01-15', 'назначение из панели не записалось: %s' % got)
    if has_oi and got:
        t.ck(got['oi'] == [first_oi], 'назначение не запомнило выбранный ОИ: %s' % got)
    t.ck(pg.locator('[data-ip-row="%s"]' % key).count() == 0, 'назначенный объект остался в «К назначению»')

    # --- отметки флажками: панель на несколько объектов ----------------------------------
    if pg.locator('[data-ip-check]').count() >= 2:
        pg.locator('[data-ip-check]').nth(0).check()
        t.wait_for('[data-ip-check]')
        pg.locator('[data-ip-check]').nth(1).check()
        t.ck(t.wait_until("() => /Выбрано объектов: 2/.test(document.querySelector('.ip-pane').innerText)"),
             'две отметки не дали панель на несколько объектов')
        pg.click('[data-ip-bulk-clear]')

    # --- «Назначено» и снятие ---------------------------------------------------------
    pg.click('[data-ip-tab="assigned"]')
    t.wait_for('[data-ip-row]')
    t.ck(pg.locator('[data-ip-row]').count() >= 1, 'назначение не видно во вкладке «Назначено»')
    t.ck(pg.input_value('[data-ip-f-person]') == person, 'панель назначения не показала действующее назначение')
    pg.click('[data-ip-remove]')
    t.wait_for('[data-ip-remove-yes]')
    t.ck(pg.locator('.modal-back').count() == 0, 'подтверждение снятия — модальным окном')
    pg.click('[data-ip-remove-yes]')
    pg.click('[data-ip-tab="queue"]')
    t.ck(t.wait_for('[data-ip-row="%s"]' % key), 'снятое назначение не вернуло объект в «К назначению»')

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
