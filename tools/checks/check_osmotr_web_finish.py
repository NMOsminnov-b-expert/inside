# -*- coding: utf-8 -*-
"""
Веб-страница осмотрщика: исход выезда на экране объекта — «Осмотр закончен», «Вернуть в работу», «Осмотр не
состоялся». С 17.11.2026: незаполненное обязательное — «осмотрено частично»: выезд целиком уходит на следующий
рабочий день без подтверждения, регионалу — уведомление; «Перенести» объединён с «Осмотр не состоялся» (причина,
пояснение и необязательная дата переноса — её подтверждает регионал).

Что ловит сценарий:
  * при незаполненном обязательном нет предупреждения; «остаток» не уходит на следующий рабочий день, объект
    закрывается, нет события «перенесено» и уведомления регионалу;
  * объект без незаполненного не закрывается; «Вернуть в работу» не возвращает;
  * отдельный блок «Перенести» остался;
  * «Осмотр не состоялся» без даты пишет перенос; с датой — не доходит запрос переноса; исход не пишется в
    результаты и событие регионалу;
  * окна поверх экрана.
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

    # --- осмотрено частично: остаток — на следующий рабочий день ---
    go()
    pg.locator('[data-finish-ask]').click()
    t.ck(t.wait_until("() => !!document.querySelector('.om-ask')"), '«Осмотр закончен» без подтверждения на месте')
    t.ck(pg.locator('dialog[open], [role=dialog]').count() == 0, 'подтверждение — окном поверх экрана')
    if t.ck(pg.locator('.om-ask li').count() > 0 and pg.locator('[data-finish="partial"]').count() == 1, 'у нового объекта нет незаполненного обязательного или кнопки «Остаток на …»'):
        nxt = pg.evaluate("async () => { const k = await import('./app/kernel/inspections.js'); const s = (await import('./app/kernel/session.js')).session.state; const d = new Date(); const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); return k.nextWorkday(s.person, iso); }")
        t.ck(nxt[8:10] + '.' + nxt[5:7] in pg.locator('[data-finish="partial"]').inner_text(), 'на кнопке не дата следующего рабочего дня %s' % nxt)
        pg.locator('[data-finish="partial"]').click()
        t.ck(t.wait_until("""async ([id, d]) => { const [t, c] = id.split('|'); const k = await import('./app/kernel/inspections.js'); const s = (await import('./app/kernel/session.js')).session.state;
          const l = k.myAssignsOn(s.person, t, c).filter(k.isLive); return l.length && l.every((a) => a.plannedAt === d && a.state !== 'done'); }""", [obj, nxt]),
             'остаток не ушёл на следующий рабочий день или объект закрыт')
        t.ck(pg.evaluate("async (id) => { const [t, c] = id.split('|'); return (await import('./app/kernel/inspections.js')).eventsOf({ typeId: t, ocId: c }).some((e) => e.kind === 'carried'); }", obj),
             'нет события «перенесено»')
        t.ck(pg.evaluate("async () => (await import('./app/pages/inspections/notify.js')).notifications(new Map(), []).some((x) => x.kind === 'carried')"),
             'регионалу нет уведомления «Остаток перенесён»')

    # --- закончен полностью: объект без обязательных полей (ТС) ---
    ts = pg.evaluate("""async () => { const d = await import('./app/pages/osmotr/data.js'); const s = (await import('./app/kernel/session.js')).session.state;
      const o = d.myObjects(s.person).find((x) => x.state !== 'done' && !x.removed && x.entity === 'vehicle'); return o && o.id; }""")
    if t.ck(ts, 'нет открытого ТС — полное окончание не проверено'):
        pg.evaluate("(id) => { location.hash = '#/osmotr?v=obj&id=' + encodeURIComponent(id); }", ts)
        t.wait_for('.om-app[data-v="obj"] .om-finish')
        pg.locator('[data-finish-ask]').click()
        t.wait_for('[data-finish="full"]')
        pg.locator('[data-finish="full"]').click()
        t.ck(t.wait_until("async (id) => (await (%s)(id)).state === 'done'" % STATE, ts), 'объект без незаполненного не закончен')
        t.ck(t.wait_until("() => !!document.querySelector('[data-reopen]')"), 'у законченного нет «Вернуть в работу»')
        pg.locator('[data-reopen]').click()
        t.ck(t.wait_until("async (id) => (await (%s)(id)).state !== 'done'" % STATE, ts), '«Вернуть в работу» не вернуло объект')

    # --- осмотр не состоялся: без даты — только исход; с датой — и запрос переноса ---
    go()
    t.ck(pg.locator('.om-more-act > summary', has_text='Перенести').count() == 0, 'остался отдельный блок «Перенести»')
    pg.locator('.om-more-act', has_text='Осмотр не состоялся').locator('summary').click()
    pg.locator('[data-outcome] input[value="Нет доступа"]').check()
    pg.locator('[data-outcome] textarea[name=note]').fill('Охрана не пустила')
    pg.locator('[data-outcome] button[type=submit]').click()
    t.ck(t.wait_until("async (id) => { const x = await (%s)(id); return x.r && x.r.reason === 'Нет доступа' && x.ev.includes('Нет доступа — Охрана не пустила'); }" % OUTCOME, obj),
         'исход «не состоялся» не дошёл до результатов и событий')
    t.ck(not pg.evaluate(STATE, obj).get('moveReq'), 'без даты ушёл запрос переноса')
    t.ck(t.wait_until("() => document.querySelector('.om-finish').textContent.includes('Осмотр не состоялся: Нет доступа')"), 'исход не виден на объекте')
    go()
    pg.locator('.om-more-act', has_text='Осмотр не состоялся').locator('summary').click()
    pg.locator('[data-outcome] input[value="Объект закрыт"]').check()
    later = (datetime.date.today() + datetime.timedelta(days=5)).isoformat()
    pg.fill('[data-outcome] input[name=date]', later)
    pg.locator('[data-outcome] button[type=submit]').click()
    t.ck(t.wait_until("async ([id, d]) => { const m = (await (%s)(id)).moveReq || {}; return m.date === d && m.reason === 'Объект закрыт'; }" % STATE, [obj, later]), 'запрос переноса из «не состоялся» не дошёл')
    t.ck(t.wait_until("() => document.querySelector('.om-finish').textContent.includes('Перенос запрошен')"), 'запрос переноса не виден на объекте')

    pg.set_viewport_size({'width': 360, 'height': 780})
    go()
    over = pg.evaluate("() => { const s = document.querySelector('.om-scr'); return s.scrollWidth - s.clientWidth; }")
    t.ck(over <= 0, 'объект на 360 px прокручивается вбок на %d px' % over)
