# -*- coding: utf-8 -*-
"""
Веб-страница осмотрщика: передвижение в отчёте дня (пользователь 17.11.2026: «осмотрщик мог передвигаться на такси.
Указываем причину. Могла быть пересадка, тогда прикладывается утреннее фото, 2 фото с пересадки и вечернее фото с
одометра. Каждая пересадка — +2 фото и 2 значения с одометров. Нужны единицы одометра. Мили/км/ч»; «Если у нас такси,
одометр не отправляем. Пересадка могла быть с авто на такси, с такси на авто. Если у нас не было авто, не просим
одометр»). День — цепочка отрезков «Авто» и «Такси».

Что ловит сценарий:
  * утренний одометр сдаётся без снимка; снимок не сохраняется (JPEG) или портится при сдаче; нет единицы;
  * авто → такси → авто: у такси спрашивается одометр; такси без причины сдаётся; после такси спрашивается
    «одометр сданной машины»; единица вечером не от последней машины; пробег не по отрезкам авто (мили в км);
  * такси → авто: вечером не спрашивается одометр машины; пробег не по одометру;
  * весь день на такси: где-то спрашивается одометр; литры считаются; вечерний отчёт сдаётся без утреннего;
  * «Одометра нет» у машины после пересадки не переводит пробег на маршрут;
  * показания меньше начала пути машины принимаются;
  * регионал: в карточке дня нет цепочки «с утра / после пересадки», такси с причиной, единиц;
  * на 360 пикселях отчёт прокручивается вбок.
"""
import datetime

NAME = 'одометр в отчёте дня (веб)'

TOUCHES = ('app/pages/osmotr/*', 'app/kernel/inspections.js', 'app/pages/inspections/detail.js', 'app/pages/inspections/model.js')

PNG = bytes.fromhex('89504e470d0a1a0a0000000d4948445200000001000000010806000000'
                    '1f15c4890000000d4944415478da63f8cfc0f01f0005000201a5c0a3d40000000049454e44ae426082')
REP = """async ([d, kind]) => { const k = await import('./app/kernel/inspections.js'); const s = (await import('./app/kernel/session.js')).session.state; return k.reportOf(s.person, d, kind); }"""
DAY = """async (d) => { const k = await import('./app/kernel/inspections.js'); const s = (await import('./app/kernel/session.js')).session.state;
  const r = k.dayReport(s.person, d); return { km: r.km, kmBy: r.kmBy, litres: r.litres, transfers: r.transfers, taxi: r.taxi, legs: r.legs.map((l) => l.mode).join('>') }; }"""
# Демо-отчёты этих дней уводятся на другую дату: сценарий сдаёт отчёты с нуля.
CLEAR = """async ([a, b]) => { const k = await import('./app/kernel/inspections.js'); const s = (await import('./app/kernel/session.js')).session.state;
  k.reportsBetween(a, b).filter((r) => r.person === s.person).forEach((r) => { r.date = '1900-01-01'; }); k.changed(); }"""
JPEG = "(x) => /^data:image\\/jpeg;base64,/.test(x || '')"


def shot(loc):
    loc.set_input_files([{'name': 'odo.png', 'mimeType': 'image/png', 'buffer': PNG}])


def err(t):
    t.wait_until("() => !!document.querySelector('form [data-rep-err]:not([hidden])')")
    return t.page.evaluate("() => (document.querySelector('form [data-rep-err]:not([hidden])') || {}).textContent || ''")


def submit(pg, form):
    pg.locator('[data-%s] button[type=submit]' % form).click()


def run(t):
    pg = t.page
    pg.route('**/route/v1/**', lambda r: r.fulfill(status=200, content_type='application/json', body='{"code":"NoRoute","routes":[]}'))
    pg.set_viewport_size({'width': 400, 'height': 860})
    t.open('#/osmotr', wait='.om-app[data-v="today"]')
    day = [(datetime.date.today() - datetime.timedelta(days=k)).isoformat() for k in (1, 2, 3)]
    d1, d2, d3 = day
    pg.evaluate(CLEAR, [d3, d1])

    def vis(sel):
        return pg.locator(sel).first.is_visible()

    # --- авто → такси → авто (мили) ---
    t.open('#/osmotr?v=report&date=' + d1, wait='[data-morning]')
    pg.fill('#om-odo', '120345')
    submit(pg, 'morning')
    t.ck('снимок' in err(t), 'утренний одометр без снимка не остановлен')
    t.ck(pg.evaluate(REP, [d1, 'morning']) is None, 'утренний отчёт сдан без снимка одометра')
    shot(pg.locator('[data-morning] [data-odo-shot]'))
    t.wait_until("() => !!document.querySelector('[data-morning] input[name=odometer_ph]').value")
    submit(pg, 'morning')
    t.ck(t.wait_until("async (a) => { const r = await (%s)(a); return r && r.odometer === '120345' && r.unit === 'км' && r.mode === 'car' && (%s)(r.photo); }" % (REP, JPEG), [d1, 'morning']),
         'утренний одометр не сохранился с единицей «км» и снимком')

    t.wait_for('[data-transfer-add]')
    pg.locator('[data-transfer-add]').click()
    t1 = pg.locator('[data-transfer]').nth(0)
    t1.locator('[data-k=endOdo]').fill('120400')
    shot(t1.locator('[data-end] [data-odo-shot]'))
    t1.locator('[data-k=mode][value=taxi]').check()
    t.ck(not t1.locator('[data-k=startOdo]').is_visible() and t1.locator('[data-k=taxiReason]').is_visible(), 'пересадка на такси спрашивает одометр или не спрашивает причину')
    t.ck(not vis('[data-end-day] .om-odo'), 'после пересадки на такси вечером спрашивается одометр')
    submit(pg, 'evening')
    t.ck('причину такси' in err(t), 'пересадка на такси без причины не остановлена')
    t1.locator('[data-k=taxiReason]').fill('Пробка, оставил машину')
    pg.locator('[data-transfer-add]').click()
    t2 = pg.locator('[data-transfer]').nth(1)
    t.ck(not t2.locator('[data-end]').is_visible(), 'после такси спрашивается «одометр сданной машины»')
    t2.locator('[data-k=startOdo]').fill('5000')
    t2.locator('select[data-k=unit]').select_option('мили')
    shot(t2.locator('[data-leg=car] [data-odo-shot]'))
    t.ck(vis('[data-end-day] .om-odo') and pg.locator('[data-end-day] [data-odo-u]').inner_text().strip() == 'мили', 'вечером не спрашивается одометр машины в милях')
    t.ck(not vis('[data-km-route]'), 'при одометрах у всех машин спрашивается пробег по маршруту')
    pg.fill('#om-odo-e', '5010')
    shot(pg.locator('[data-end-day] [data-odo-shot]'))
    t.wait_until("() => [...document.querySelectorAll('[data-evening] .om-odo-shot input[type=hidden]')].filter((x) => !x.closest('[hidden]')).every((x) => x.value)")
    submit(pg, 'evening')
    t.ck(t.wait_until("""async (a) => { const r = await (%s)(a); const [x, y] = (r && r.transfers) || []; const jpg = %s;
      return !!(r && x && y && x.mode === 'taxi' && x.taxiReason === 'Пробка, оставил машину' && x.endOdo === '120400' && !x.startOdo && jpg(x.endPhoto)
        && y.mode === 'car' && !y.endOdo && y.startOdo === '5000' && y.unit === 'мили' && jpg(y.startPhoto) && r.odometer === '5010' && jpg(r.photo)); }""" % (REP, JPEG), [d1, 'evening']),
         'вечерний отчёт авто → такси → авто не сохранился как надо')
    r = pg.evaluate(DAY, d1)
    t.ck(r['legs'] == 'car>taxi>car' and r['kmBy'] == 'odometer' and r['km'] == 71.1 and r['taxi'] and r['litres'] is not None,
         'авто → такси → авто: ждали 55 км + 10 миль = 71,1 км по одометру, получили %s' % r)

    t.open('#/osmotr?v=report&date=' + d1, wait='[data-end-day]')
    pg.fill('#om-odo-e', '4000')
    submit(pg, 'evening')
    t.ck('меньше' in err(t), 'вечерний одометр меньше начала пути принят')
    t.ck(pg.evaluate(REP, [d1, 'evening'])['odometer'] == '5010', 'неверные показания записались')
    pg.set_viewport_size({'width': 360, 'height': 780})
    over = pg.evaluate("() => { const s = document.querySelector('.om-scr'); return s.scrollWidth - s.clientWidth; }")
    t.ck(over <= 0, 'отчёт с пересадками на 360 px прокручивается вбок на %d px' % over)
    pg.set_viewport_size({'width': 400, 'height': 860})

    # --- такси → авто; «Одометра нет» у новой машины ---
    t.open('#/osmotr?v=report&date=' + d2, wait='[data-morning]')
    pg.locator('[data-morning] input[value=taxi]').check()
    t.ck(not vis('#om-odo') and vis('#om-taxi'), 'утром при «Такси» одометр не спрятан или нет причины')
    submit(pg, 'morning')
    t.ck('такси' in err(t), 'утро на такси без причины не остановлено')
    pg.fill('#om-taxi', 'Авто в ремонте')
    submit(pg, 'morning')
    t.ck(t.wait_until("async (a) => { const r = await (%s)(a); return !!(r && r.mode === 'taxi' && r.taxiReason === 'Авто в ремонте' && !r.odometer && !r.photo); }" % REP, [d2, 'morning']),
         'утро на такси не сохранилось с причиной и без одометра')
    t.wait_for('[data-evening] [data-transfer-add]')
    t.ck(not vis('[data-end-day] .om-odo') and vis('#om-km'), 'день на такси: вечером спрашивается одометр или нет пробега по маршруту')
    pg.locator('[data-transfer-add]').click()
    tr = pg.locator('[data-transfer]').nth(0)
    t.ck(not tr.locator('[data-end]').is_visible(), 'пересадка с такси спрашивает одометр сданной машины')
    tr.locator('[data-k=noOdo]').check()
    t.ck(not tr.locator('[data-k=startOdo]').is_visible() and not vis('[data-end-day] .om-odo') and vis('#om-km'), '«Одометра нет» у новой машины не прячет одометр или не открывает маршрут')
    tr.locator('[data-k=noOdo]').uncheck()
    tr.locator('[data-k=startOdo]').fill('100')
    shot(tr.locator('[data-leg=car] [data-odo-shot]'))
    pg.fill('#om-odo-e', '130')
    shot(pg.locator('[data-end-day] [data-odo-shot]'))
    t.wait_until("() => [...document.querySelectorAll('[data-evening] .om-odo-shot input[type=hidden]')].filter((x) => !x.closest('[hidden]')).every((x) => x.value)")
    submit(pg, 'evening')
    t.wait_until("async (a) => !!(await (%s)(a))" % REP, [d2, 'evening'])
    r = pg.evaluate(DAY, d2)
    t.ck(r['legs'] == 'taxi>car' and r['kmBy'] == 'odometer' and r['km'] == 30 and r['taxi'] and r['litres'] is not None,
         'такси → авто: ждали 30 км по одометру машины, получили %s' % r)

    # --- весь день на такси; вечер без утра не сдаётся ---
    t.open('#/osmotr?v=report&date=' + d3, wait='[data-evening]')
    t.ck('утренний отчёт' in pg.locator('[data-evening]').inner_text() and pg.locator('[data-evening] button[type=submit]').is_disabled(),
         'вечерний отчёт можно сдать без утреннего')
    pg.locator('[data-morning] input[value=taxi]').check()
    pg.fill('#om-taxi', 'Нет машины')
    submit(pg, 'morning')
    t.wait_for('[data-evening] [data-day-legs]')
    t.ck(pg.locator('[data-evening] .om-odo:visible').count() == 0, 'день на такси: вечером спрашивается одометр')
    pg.fill('#om-km', '25')
    submit(pg, 'evening')
    t.wait_until("async (a) => !!(await (%s)(a))" % REP, [d3, 'evening'])
    r = pg.evaluate(DAY, d3)
    t.ck(r['legs'] == 'taxi' and r['kmBy'] == 'taxi' and r['km'] == 25 and r['litres'] is None, 'весь день на такси: ждали 25 км по маршруту без литров, получили %s' % r)

    # --- регионал: карточка дня ---
    html = pg.evaluate("""async (days) => { const s = (await import('./app/kernel/session.js')).session.state; const det = await import('./app/pages/inspections/detail.js');
      const k = await import('./app/kernel/inspections.js'); const m = await import('./app/pages/inspections/model.js');
      return days.map((d) => det.detailHTML(m.summaries(), [], k.allAssignments(), [{ kind: 'report', name: s.person, date: d }])); }""", day)
    t.ck(all(x in html[0] for x in ('После пересадки 2', 'мили', 'Пробка, оставил машину', 'пересадок 2')), 'у регионала нет цепочки авто → такси → авто с единицами')
    t.ck('С утра' in html[1] and 'Авто в ремонте' in html[1], 'у регионала нет «с утра — такси» с причиной')
    t.ck('весь день на такси' in html[2], 'у регионала не сказано, что весь день на такси')
