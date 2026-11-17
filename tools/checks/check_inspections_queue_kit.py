# -*- coding: utf-8 -*-
"""Отдельные карточки ТС — в «К назначению», отбор «Состав».

Замечание пользователя 17.11.2026: «у нас ТС — отдельные карточки… если у нас
отдельно все, то как назначать то? Я не вижу ТС к назначению». Демо назначало
все четыре отдельных ТС — очередь их не показывала; у очереди не было отбора
по составу, как у «Назначено».

Что ловит сценарий:
  * в очереди нет отдельной карточки ТС, у которой нет назначения;
  * нет отбора «Состав» или «С ТС» оставляет не ТС, а теряет карточку ТС;
  * ошибки консоли.
"""

NAME = 'очередь: отдельные ТС и отбор «Состав»'

TOUCHES = ('app/pages/inspections/model.js', 'app/kernel/inspectionsDemo.js', 'app/pages/inspections/inspections.js')


def run(t):
    pg = t.page
    pg.set_viewport_size({'width': 1440, 'height': 900})
    t.open('#/inspections?s=assign&t=queue', wait='.ip-qswitch')
    # Ожидание — по данным: отдельные ТС без назначения и ОЦ со свободным ТС в составе.
    want = pg.evaluate("""async () => { const M = await import('./app/pages/inspections/model.js');
      const kit = M.QUEUE_FACETS.find((f) => f.key === 'kit');
      const q = M.queueBase(M.summaries());
      return { ts: q.filter((s) => s.typeId === 'vehicle').map((s) => s.typeId + '|' + s.id),
               kit: q.filter((s) => kit.val(s).includes('vehicle')).length }; }""")
    t.ck(len(want['ts']) >= 1, 'в очереди нет ни одной отдельной карточки ТС')
    if not pg.locator('.ip-facets.open').count():
        pg.locator('[data-ip-ftoggle]:visible').first.click()
    t.ck(t.wait_for('.ip-facets .ip-facet[aria-label="Состав"]', timeout=5000), 'нет отбора «Состав»')
    pg.click('.ip-facets [data-ip-ff="kit"][data-ip-fv="vehicle"]')
    t.ck(t.wait_until("() => document.querySelector('[data-ip-ff=\"kit\"][data-ip-fv=\"vehicle\"]').getAttribute('aria-pressed') === 'true'"),
         '«С ТС» не отметилось')
    for k in want['ts']:
        t.ck(t.wait_until("(k) => !!document.querySelector('[data-ip-row=\"' + CSS.escape(k) + '\"]')", [k]),
             'с отбором «С ТС» нет строки %s' % k)
    n = pg.locator('[data-ip-row]').count()
    t.ck(n == want['kit'], 'с отбором «С ТС» строк %d, ожидалось %d' % (n, want['kit']))
