# -*- coding: utf-8 -*-
"""
Веб-страница осмотрщика: одометр в отчёте дня (пользователь 17.11.2026: «осмотрщик мог передвигаться на такси.
Указываем причину. Могла быть пересадка, тогда прикладывается утреннее фото, 2 фото с пересадки и вечернее фото с
одометра. Каждая пересадка — +2 фото и 2 значения с одометров. Нужны единицы одометра. Мили/км/ч»).

Что ловит сценарий:
  * утренний одометр сдаётся без снимка; снимок не сохраняется (JPEG) или портится при сдаче; нет единицы (по умолчанию км);
  * пересадка: не сохраняются два значения и два снимка, единица новой машины; вечерняя единица не берётся от
    последней машины; пересадка без снимка сдаётся; «Убрать пересадку» не убирает;
  * пробег по одометру не считает отрезки по машинам и мили в км; показания меньше начала пути машины принимаются;
  * такси: сдаётся без причины; вечером спрашивает одометр; пробег не по маршруту; литры считаются;
  * регионал: в карточке дня нет пересадки, такси, единиц; на 360 пикселях отчёт прокручивается вбок.
"""
import datetime

NAME = 'одометр в отчёте дня (веб)'

TOUCHES = ('app/pages/osmotr/*', 'app/kernel/inspections.js', 'app/pages/inspections/detail.js', 'app/pages/inspections/model.js')

PNG = bytes.fromhex('89504e470d0a1a0a0000000d4948445200000001000000010806000000'
                    '1f15c4890000000d4944415478da63f8cfc0f01f0005000201a5c0a3d40000000049454e44ae426082')
REP = """async ([d, kind]) => { const k = await import('./app/kernel/inspections.js'); const s = (await import('./app/kernel/session.js')).session.state; return k.reportOf(s.person, d, kind); }"""
DAY = """async (d) => { const k = await import('./app/kernel/inspections.js'); const s = (await import('./app/kernel/session.js')).session.state;
  const r = k.dayReport(s.person, d); return { km: r.km, kmBy: r.kmBy, litres: r.litres, transfers: r.transfers, taxi: r.taxi, hours: r.hours }; }"""
# Демо-отчёты этих дней уводятся на другую дату: сценарий сдаёт отчёты с нуля.
CLEAR = """async (days) => { const k = await import('./app/kernel/inspections.js'); const s = (await import('./app/kernel/session.js')).session.state;
  k.reportsBetween(days[0] < days[1] ? days[0] : days[1], days[0] < days[1] ? days[1] : days[0]).filter((r) => r.person === s.person).forEach((r) => { r.date = '1900-01-01'; }); k.changed(); }"""


def shot(pg, sel):
    pg.locator(sel).set_input_files([{'name': 'odo.png', 'mimeType': 'image/png', 'buffer': PNG}])


def err(t):
    t.wait_until("() => !document.querySelector('form [data-rep-err]:not([hidden])') ? false : true")
    return t.page.evaluate("() => (document.querySelector('form [data-rep-err]:not([hidden])') || {}).textContent || ''")


def run(t):
    pg = t.page
    pg.route('**/route/v1/**', lambda r: r.fulfill(status=200, content_type='application/json', body='{"code":"NoRoute","routes":[]}'))
    pg.set_viewport_size({'width': 400, 'height': 860})
    t.open('#/osmotr', wait='.om-app[data-v="today"]')
    d1 = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    d2 = (datetime.date.today() - datetime.timedelta(days=2)).isoformat()
    pg.evaluate(CLEAR, [d2, d1])

    # --- авто с пересадкой на машину в милях ---
    t.open('#/osmotr?v=report&date=' + d1, wait='[data-morning]')
    pg.fill('#om-odo', '120345')
    pg.locator('[data-morning] button[type=submit]').click()
    t.ck('снимок' in err(t), 'утренний одометр без снимка не остановлен')
    t.ck(pg.evaluate(REP, [d1, 'morning']) is None, 'утренний отчёт сдан без снимка одометра')
    shot(pg, '[data-morning] [data-odo-shot]')
    t.wait_until("() => !!document.querySelector('[data-morning] input[name=odometer_ph]').value")
    pg.locator('[data-morning] button[type=submit]').click()
    t.ck(t.wait_until("async (a) => { const r = await (%s)(a); return r && r.odometer === '120345' && r.unit === 'км' && r.mode === 'car' && /^data:image\\/jpeg/.test(r.photo); }" % REP, [d1, 'morning']),
         'утренний одометр не сохранился с единицей «км» и снимком')

    t.wait_for('[data-transfer-add]')
    pg.locator('[data-transfer-add]').click()
    tr = pg.locator('[data-transfer]').first
    tr.locator('[data-k=endOdo]').fill('120400')
    tr.locator('[data-k=startOdo]').fill('5000')
    tr.locator('select[data-k=unit]').select_option('мили')
    t.ck(pg.locator('[data-odo-day] > .om-odo [data-odo-u]').inner_text().strip() == 'мили', 'вечерняя единица не взята от новой машины')
    pg.fill('#om-odo-e', '5010')
    shot(pg, '[data-odo-day] > .om-odo [data-odo-shot]')
    t.wait_until("() => !!document.querySelector('[data-evening] input[name=odometer_ph]').value")
    pg.locator('[data-evening] button[type=submit]').click()
    t.ck('Пересадка 1' in err(t), 'пересадка без снимков не остановлена')
    shot(pg, '[data-transfer] .om-odo:nth-of-type(1) [data-odo-shot]')
    shot(pg, '[data-transfer] .om-odo:nth-of-type(2) [data-odo-shot]')
    t.wait_until("() => [...document.querySelectorAll('[data-transfer] input[type=hidden]')].every((x) => x.value)")
    # Вторая пересадка без значений — останавливает; «Убрать пересадку» — снимает её.
    pg.locator('[data-transfer-add]').click()
    pg.locator('[data-evening] button[type=submit]').click()
    t.ck('Пересадка 2' in err(t), 'пустая вторая пересадка не остановлена')
    pg.locator('[data-transfer]').nth(1).locator('[data-transfer-del]').click()
    t.ck(pg.locator('[data-transfer]').count() == 1, '«Убрать пересадку» не убрала')
    pg.locator('[data-evening] button[type=submit]').click()
    t.ck(t.wait_until("""async (a) => { const r = await (%s)(a); return r && r.odometer === '5010' && r.transfers.length === 1 && r.transfers[0].unit === 'мили'
      && r.transfers[0].endOdo === '120400' && r.transfers[0].startOdo === '5000' && [r.transfers[0].endPhoto, r.transfers[0].startPhoto, r.photo].every((x) => /^data:image\/jpeg;base64,/.test(x || '')); }""" % REP, [d1, 'evening']),
         'вечерний отчёт с пересадкой не сохранился (значения, снимки, единица)')
    day = pg.evaluate(DAY, d1)
    t.ck(day['kmBy'] == 'odometer' and day['km'] == 71.1 and day['transfers'] == 1 and day['litres'] is not None,
         'пробег по одометру с пересадкой: ждали 55 км + 10 миль = 71,1 км, получили %s' % day)

    # Показания меньше начала пути машины — не принимаются.
    t.open('#/osmotr?v=report&date=' + d1, wait='[data-odo-day]')
    pg.fill('#om-odo-e', '4000')
    pg.locator('[data-evening] button[type=submit]').click()
    t.ck('меньше' in err(t), 'вечерний одометр меньше начала пути принят')
    t.ck(pg.evaluate(REP, [d1, 'evening'])['odometer'] == '5010', 'неверные показания записались')

    pg.set_viewport_size({'width': 360, 'height': 780})
    over = pg.evaluate("() => { const s = document.querySelector('.om-scr'); return s.scrollWidth - s.clientWidth; }")
    t.ck(over <= 0, 'отчёт с пересадкой на 360 px прокручивается вбок на %d px' % over)
    pg.set_viewport_size({'width': 400, 'height': 860})

    # --- такси ---
    t.open('#/osmotr?v=report&date=' + d2, wait='[data-morning]')
    pg.locator('[data-morning] input[value=taxi]').check()
    t.ck(pg.locator('#om-odo').is_hidden() and pg.locator('#om-taxi').is_visible(), 'при «Такси» одометр не спрятан или нет причины')
    pg.locator('[data-morning] button[type=submit]').click()
    t.ck('такси' in err(t), 'такси без причины не остановлено')
    pg.fill('#om-taxi', 'Авто в ремонте')
    pg.locator('[data-morning] button[type=submit]').click()
    t.ck(t.wait_until("async (a) => { const r = await (%s)(a); return r && r.mode === 'taxi' && r.taxiReason === 'Авто в ремонте' && !r.odometer; }" % REP, [d2, 'morning']),
         'утро на такси не сохранилось с причиной')
    t.wait_for('[data-evening]')
    t.ck(pg.locator('[data-odo-day]').count() == 0 and pg.locator('#om-km').is_visible(), 'вечером на такси спрашивается одометр или нет пробега по маршруту')
    pg.fill('#om-km', '30')
    pg.locator('[data-evening] button[type=submit]').click()
    t.wait_until("async (a) => !!(await (%s)(a))" % REP, [d2, 'evening'])
    day = pg.evaluate(DAY, d2)
    t.ck(day['taxi'] and day['kmBy'] == 'taxi' and day['km'] == 30 and day['litres'] is None, 'такси: ждали пробег по маршруту 30 км без литров, получили %s' % day)

    # --- регионал: карточка дня ---
    html = pg.evaluate("""async ([d1, d2]) => { const s = (await import('./app/kernel/session.js')).session.state; const det = await import('./app/pages/inspections/detail.js');
      const k = await import('./app/kernel/inspections.js'); const m = await import('./app/pages/inspections/model.js');
      const f = (d) => det.detailHTML(m.summaries(), [], k.allAssignments(), [{ kind: 'report', name: s.person, date: d }]); return [f(d1), f(d2)]; }""", [d1, d2])
    t.ck('Пересадка 1' in html[0] and 'мили' in html[0] and 'пересадок 1' in html[0], 'у регионала в карточке дня нет пересадки с единицами')
    t.ck('такси' in html[1] and 'Авто в ремонте' in html[1], 'у регионала в карточке дня нет такси с причиной')
