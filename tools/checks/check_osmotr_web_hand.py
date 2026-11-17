# -*- coding: utf-8 -*-
"""Исходы осмотра: «не состоялся» — сам на следующий рабочий день; «Сдать с причиной»; перечень причин.

ТЗ tz-ekran-regionalov-odna-stroka-menyu-obschiy-srez-planirovanie-den-os, этап 5 (аудит 17.11.2026):
«Сам на след. рабочий день» с уведомлением регионалу; «Сдаем с причиной. Варианты из выпадающего поля и
возможность указать свой вариант текстом»; перенос — не в прошлое; «Осмотрен» в вечернем отчёте — только
законченный осмотр.

Что ловит сценарий:
  * «Осмотр не состоялся» без даты оставляет выезд на своём дне; нет события «перенесено» с пометкой
    «не состоялся»; регионалу нет уведомления «Осмотр не состоялся»; нет блока на «Сегодня»;
  * перенос отчёта за прошедший день уходит в прошлое;
  * у незаконченного объекта нет «Сдать с причиной»; без причины сдаётся; сданный не «неполный» или без
    причины; причина не видна регионалу (уведомление, блок «Сдано с причиной»);
  * перечень причин из «Люди» → «Настройки» не доходит до осмотрщика; «Убрать» не убирает;
  * в вечернем отчёте «Осмотрен» доступен незаконченному выезду;
  * ошибки консоли.
"""
from urllib.parse import quote

NAME = 'исходы: не состоялся, сдать с причиной'

TOUCHES = ('app/pages/osmotr/osmotr.js', 'app/kernel/inspections.js', 'app/pages/inspections/notify.js',
           'app/pages/inspections/model.js', 'app/pages/inspections/inspections.js')

PICK = """async (skip) => { const d = await import('./app/pages/osmotr/data.js'); const s = (await import('./app/kernel/session.js')).session.state;
  const o = d.myObjects(s.person).find((x) => x.state !== 'done' && !x.removed && !x.moveReq && x.entity === 'real' && x.ois.length && !skip.includes(x.id)); return o && o.id; }"""
LIVE = """async (id) => { const [t, c] = id.split('|'); const k = await import('./app/kernel/inspections.js'); const s = (await import('./app/kernel/session.js')).session.state;
  return k.myAssignsOn(s.person, t, c).map((a) => ({ state: a.state, plannedAt: a.plannedAt, incomplete: !!a.incomplete, reason: a.incompleteReason || '' })); }"""
TODAY = """() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }"""
OWN = 'Проверка: ключи у сторожа'
NEW = 'Проверка: нет пропуска'


def run(t):
    pg = t.page
    pg.set_viewport_size({'width': 400, 'height': 860})
    t.open('#/osmotr', wait='.om-app[data-v="today"]')
    today = pg.evaluate(TODAY)
    a = pg.evaluate(PICK, [])
    if not t.ck(a, 'нет открытого объекта недвижимости — сценарию не на чем проверить'):
        return

    def go(id_):
        pg.evaluate("(id) => { location.hash = '#/osmotr?v=obj&id=' + encodeURIComponent(id); }", id_)
        t.wait_for('.om-app[data-v="obj"] .om-finish')

    # --- «Осмотр не состоялся» без даты — сам на следующий рабочий день ---
    nxt = pg.evaluate("""async (d) => { const k = await import('./app/kernel/inspections.js'); const s = (await import('./app/kernel/session.js')).session.state;
      return k.nextWorkday(s.person, d); }""", today)
    go(a)
    pg.locator('.om-more-act', has_text='Осмотр не состоялся').locator('summary').click()
    t.ck(nxt[8:10] + '.' + nxt[5:7] in pg.locator('[data-outcome]').inner_text(), 'в подсказке нет даты следующего рабочего дня %s' % nxt)
    pg.locator('[data-outcome] input[value="Нет доступа"]').check()
    pg.locator('[data-outcome] button[type=submit]').click()
    t.ck(t.wait_until("async ([id, d]) => { const l = (await (%s)(id)).filter((x) => x.state !== 'done'); return l.length && l.every((x) => x.plannedAt === d); }" % LIVE, [a, nxt]),
         '«не состоялся» без даты: выезд не ушёл на %s' % nxt)
    t.ck(pg.evaluate("""async (id) => { const [t, c] = id.split('|'); return (await import('./app/kernel/inspections.js')).eventsOf({ typeId: t, ocId: c })
      .some((e) => e.kind === 'carried' && e.failed && /не состоялся: Нет доступа/.test(e.text)); }""", a), 'нет события «перенесено» с пометкой «не состоялся»')
    t.ck(pg.evaluate("async () => (await import('./app/pages/inspections/notify.js')).notifications(new Map(), []).some((x) => x.kind === 'failed' && /Нет доступа/.test(x.text))"),
         'регионалу нет уведомления «Осмотр не состоялся»')

    # --- перенос не в прошлое ---
    past = pg.evaluate("""async (id) => { const [t, c] = id.split('|'); const k = await import('./app/kernel/inspections.js'); const s = (await import('./app/kernel/session.js')).session.state;
      return k.carryOver(s.person, t, c, { from: '2020-01-06', reason: 'проверка' }); }""", a)
    t.ck(past and past >= today, 'перенос отчёта за прошедший день ушёл в прошлое: %s' % past)

    # --- перечень причин: «Люди» → «Настройки» ---
    pg.set_viewport_size({'width': 1440, 'height': 900})
    t.open('#/inspections?s=people&t=norms', wait='[data-ip-block="reasons"]')
    pg.fill('[data-ip-reason-new]', NEW)
    pg.click('[data-ip-reason-add]')
    t.ck(t.wait_until("([x]) => [...document.querySelectorAll('.ip-reason-list li span')].some((e) => e.textContent === x)", [NEW]), 'новая причина не появилась в перечне')
    idx = pg.evaluate("(x) => [...document.querySelectorAll('.ip-reason-list li span')].findIndex((e) => e.textContent === 'Не на месте')")
    if t.ck(idx >= 0, 'в перечне нет начальной причины «Не на месте»'):
        pg.click('[data-ip-reason-del="%d"]' % idx)
        t.ck(t.wait_until("() => ![...document.querySelectorAll('.ip-reason-list li span')].some((e) => e.textContent === 'Не на месте')"), '«Убрать» не убрало причину')

    # --- «Сдать с причиной»: свой вариант и вариант из перечня ---
    pg.set_viewport_size({'width': 400, 'height': 860})
    t.open('#/osmotr', wait='.om-app[data-v="today"]')
    # Свежее (не демо) назначение: уведомления «Осмотр сдан» по демо-назначениям не строятся. Новый объект
    # из очереди — без результатов, обязательное не заполнено.
    b = pg.evaluate("""async (d) => { const M = await import('./app/pages/inspections/model.js'); const k = await import('./app/kernel/inspections.js');
      const s = (await import('./app/kernel/session.js')).session.state;
      const q = M.queueBase(M.summaries()).find((x) => x.typeId === 'civil' && x.cov.state === 'none');
      if (!q) return null; k.assign({ typeId: q.typeId, ocId: q.id, person: s.person, plannedAt: d }); return q.typeId + '|' + q.id; }""", today)
    if not t.ck(b, 'в очереди нет нежилого здания без назначений — «Сдать с причиной» не проверено'):
        return
    go(b)
    pg.locator('[data-finish-ask]').click()
    t.wait_for('.om-ask')
    t.ck(pg.locator('.om-ask li').count() > 0 and pg.locator('[data-hand]').count() == 1, 'у объекта с незаполненным обязательным нет «Сдать с причиной»')
    pg.locator('.om-hand > summary').click()
    opts = pg.eval_on_selector_all('[data-hand] select[name=reason] option', 'els => els.map((e) => e.textContent)')
    t.ck(NEW in opts and 'Не на месте' not in opts and opts[-1] == 'Свой вариант', 'перечень у осмотрщика не тот: %s' % opts)
    pg.select_option('[data-hand] select[name=reason]', value='')
    pg.locator('[data-hand] button[type=submit]').click()
    t.ck(t.wait_until("() => !document.querySelector('[data-hand-err]').hidden"), 'без причины нет ошибки')
    t.ck(all(x['state'] != 'done' for x in pg.evaluate(LIVE, b)), 'объект сдан без причины')
    pg.fill('[data-hand] input[name=own]', OWN)
    pg.locator('[data-hand] button[type=submit]').click()
    t.ck(t.wait_until("async ([id, r]) => { const l = await (%s)(id); return l.length && l.every((x) => x.state === 'done' && x.incomplete && x.reason === r); }" % LIVE, [b, OWN]),
         'сданный с причиной — не «неполный» или без причины')
    t.ck(pg.evaluate("async (r) => (await import('./app/pages/inspections/notify.js')).notifications(new Map(), []).some((x) => x.kind === 'handed' && x.text.includes('неполный: ' + r))", OWN),
         'в уведомлении регионалу нет причины')

    # --- «Сегодня» регионала: блоки «Осмотр не состоялся» и «Сдано с причиной» ---
    pg.set_viewport_size({'width': 1440, 'height': 900})
    t.open('#/inspections?s=today', wait='.ip-today-b')
    if pg.locator('.ip-slice [data-ip-mode="all"][aria-pressed="false"]').count():
        pg.click('.ip-slice [data-ip-mode="all"]')
    t.ck(t.wait_until("() => !!document.querySelector('.ip-today-b[aria-label=\"Осмотр не состоялся\"]')"), 'на «Сегодня» нет блока «Осмотр не состоялся»')
    t.ck(t.wait_until("([r]) => (document.querySelector('.ip-today-b[aria-label=\"Сдано с причиной\"]') || {}).textContent?.includes(r)", [OWN]),
         'на «Сегодня» нет блока «Сдано с причиной» с причиной')

    # --- вечерний отчёт: «Осмотрен» — только законченный ---
    pg.set_viewport_size({'width': 400, 'height': 860})
    t.open('#/osmotr?v=report&date=' + quote(today), wait='[data-evening]')
    trips = pg.evaluate("""async () => { const k = await import('./app/kernel/inspections.js');
      return [...document.querySelectorAll('[data-evening] .om-trip')].map((f) => { const x = k.assignmentById(f.dataset.trip);
        return { id: f.dataset.trip, open: !!x && x.state !== 'done', dis: !!f.querySelector('input[value="done"]')?.disabled }; }); }""")
    t.ck(any(x['open'] for x in trips), 'в вечернем отчёте нет незаконченного выезда — запрет «Осмотрен» не проверен')
    bad = [x['id'] for x in trips if x['open'] and not x['dis']]
    t.ck(not bad, 'в вечернем отчёте «Осмотрен» доступен незаконченным выездам: %s' % bad)
