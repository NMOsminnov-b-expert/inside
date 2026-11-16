# -*- coding: utf-8 -*-
"""
Веб-страница осмотрщика, этап 3 (16.11.2026): исход выезда на экране объекта —
как в приложении «Осмотр»: «Осмотр закончен» (при незаполненном обязательном —
предупреждение и «неполный»), «Вернуть в работу», «Перенести» (запрос
регионалу), «Осмотр не состоялся» (причина из перечня приложения).

Что ловит сценарий:
  * «Осмотр закончен» не предупреждает о незаполненном обязательном или не
    отмечает назначение «неполным»; объект не становится законченным;
  * «Вернуть в работу» не возвращает объект в работу;
  * запрос переноса не доходит до назначения (moveReq) или не виден;
  * «Осмотр не состоялся» не пишет исход в результаты и событие регионалу;
  * окна поверх экрана (правило «без модальных окон»).
"""
import datetime
from urllib.parse import quote

from harness import use_cadastre_fixture

NAME = 'исход выезда (веб)'

TOUCHES = ('app/pages/osmotr/*', 'app/kernel/inspections.js', 'app/kernel/inspectionResults.js')

STATE = """async (id) => { const d = await import('./app/pages/osmotr/data.js'); const s = (await import('./app/kernel/session.js')).session.state;
  const o = d.myObjects(s.person).find((x) => x.id === id) || {}; return { state: o.state, moveReq: o.moveReq }; }"""
ASSIGNS = """async (id) => { const [t, c] = id.split('|'); const k = await import('./app/kernel/inspections.js'); const s = (await import('./app/kernel/session.js')).session.state;
  return k.myAssignsOn(s.person, t, c).map((a) => ({ state: a.state, incomplete: !!a.incomplete })); }"""
OUTCOME = """async (id) => { const [t, c] = id.split('|'); const k = await import('./app/kernel/inspections.js');
  return { r: (await import('./app/kernel/inspectionResults.js')).resultsOf(t, c).outcome || null,
    ev: k.eventsOf({ typeId: t, ocId: c }).filter((e) => e.kind === 'outcome').map((e) => e.text) }; }"""


def run(t):
    pg = t.page
    use_cadastre_fixture(pg)
    pg.set_viewport_size({'width': 400, 'height': 860})
    t.open('#/osmotr', wait='.om-app[data-v="today"]')
    obj = pg.evaluate("""async () => { const d = await import('./app/pages/osmotr/data.js'); const s = (await import('./app/kernel/session.js')).session.state;
      const o = d.myObjects(s.person).find((x) => x.state !== 'done' && !x.removed && !x.moveReq && x.entity === 'real' && x.ois.length); return o && o.id; }""")
    t.ck(obj, 'нет открытого объекта недвижимости — сценарию не на чем проверить')
    if not obj:
        return
    q = 'v=obj&id=' + quote(obj, safe='')

    def go():
        pg.evaluate("(q) => { location.hash = '#/osmotr?' + q; }", q)
        t.wait_for('.om-app[data-v="obj"] .om-finish')

    # --- осмотр закончен: предупреждение о незаполненном, «неполный» ---
    go()
    pg.locator('[data-finish-ask]').click()
    t.ck(t.wait_until("() => !!document.querySelector('.om-ask')"), '«Осмотр закончен» без подтверждения на месте')
    t.ck(pg.locator('dialog[open], [role=dialog]').count() == 0, 'подтверждение — окном поверх экрана')
    incomplete = pg.locator('[data-finish="incomplete"]').count() == 1
    t.ck(incomplete == (pg.locator('.om-ask li').count() > 0), 'список незаполненного не сходится с кнопкой «неполный»')
    pg.locator('[data-finish]').click()
    t.ck(t.wait_until("async (id) => (await (%s)(id)).state === 'done'" % STATE, obj), 'объект не закончен')
    a = pg.evaluate(ASSIGNS, obj)
    t.ck(all(x['state'] == 'done' for x in a), 'назначения не закончены: %s' % a)
    t.ck(all(x['incomplete'] == incomplete for x in a), 'отметка «неполный» не та: %s, ожидалось %s' % (a, incomplete))
    t.ck(t.wait_until("() => !!document.querySelector('[data-reopen]')"), 'у законченного нет «Вернуть в работу»')

    # --- вернуть в работу ---
    pg.locator('[data-reopen]').click()
    t.ck(t.wait_until("async (id) => (await (%s)(id)).state !== 'done'" % STATE, obj), '«Вернуть в работу» не вернуло объект')
    t.ck(t.wait_until("() => !!document.querySelector('[data-finish-ask]')"), 'после возврата нет «Осмотр закончен»')

    # --- осмотр не состоялся ---
    pg.locator('.om-more-act', has_text='Осмотр не состоялся').locator('summary').click()
    pg.locator('[data-outcome] input[value="Нет доступа"]').check()
    pg.locator('[data-outcome] textarea[name=note]').fill('Охрана не пустила')
    pg.locator('[data-outcome] button[type=submit]').click()
    t.ck(t.wait_until("async (id) => { const x = await (%s)(id); return x.r && x.r.reason === 'Нет доступа' && x.ev.includes('Нет доступа — Охрана не пустила'); }" % OUTCOME, obj),
         'исход «не состоялся» не дошёл до результатов и событий')
    t.ck(t.wait_until("() => document.querySelector('.om-finish').textContent.includes('Осмотр не состоялся: Нет доступа')"), 'исход не виден на объекте')

    # --- перенос ---
    go()
    pg.locator('.om-more-act', has_text='Перенести').locator('summary').click()
    tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
    pg.fill('[data-move] input[name=date]', tomorrow)
    pg.locator('[data-move] button[type=submit]').click()
    t.ck(t.wait_until("async ([id, d]) => ((await (%s)(id)).moveReq || {}).date === d" % STATE, [obj, tomorrow]), 'запрос переноса не дошёл до назначения')
    t.ck(t.wait_until("() => document.querySelector('.om-finish').textContent.includes('Перенос запрошен')"), 'запрос переноса не виден на объекте')

    pg.set_viewport_size({'width': 360, 'height': 780})
    go()
    over = pg.evaluate("() => { const s = document.querySelector('.om-scr'); return s.scrollWidth - s.clientWidth; }")
    t.ck(over <= 0, 'объект на 360 px прокручивается вбок на %d px' % over)
