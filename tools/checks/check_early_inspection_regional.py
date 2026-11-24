# -*- coding: utf-8 -*-
"""Досрочный осмотр у регионала: очередь при любом статусе, фильтр, пометка, назначение без смены статуса.

Пользователь 23.11.2026 (запись графа tz-dosrochnoe-napravlenie-oc-oi-na-osmotr-flag-filtr-i-rekomendacii-u): «После
такого направления обьект появляется у регионала и предлагается в том числе в рекомендациях отдельной категорией…
У регионала в экране встраиваем фильтр… Статус при этом не переводится». Порядок работ: «Сначала - карточки, (ЦОД),
потом добавляем в регионала».

Что ловит сценарий:
  * досрочно направленный объект «В заполнении» не попадает в «К назначению»; в счёт идут все ОИ, а не выбранные ЦОД;
  * нет фильтра «Направление: Досрочно» или он пропускает обычные объекты; нет пометки «досрочно» в строке;
  * в окне назначения нет сведений о направлении или отмечен «объект целиком» вместо выбранных ОИ;
  * назначение меняет статус досрочной карточки; назначение без пометки early; после назначения отозвать можно;
  * после назначения выбранных ОИ объект остаётся в очереди; в «Назначено» нет пометки и фильтра;
  * пачка и маршрут назначают все ОИ объекта, а не направленные; обычный объект при назначении статус не двигает.
"""
import base64

NAME = 'досрочный осмотр: регионал'

TOUCHES = ('app/kernel/inspections.js', 'app/kernel/earlyInspection.js', 'app/pages/inspection/tasks.js',
           'app/pages/inspections/model.js', 'app/pages/inspections/assignPane.js', 'app/pages/inspections/inspections.js',
           'app/pages/inspections/inspections.css', 'app/pages/inspections/route.js')

K = "(await import('./app/kernel/inspections.js'))"
WHO = 'Абдылдаев Айсултан Марсович'
REC = "(await import('./app/kernel/registry.js')).getType('civil').records.loadRecord(id)"
# Нежилое здание «В заполнении» с тремя и больше ОИ, без назначений и без флага.
PICK = """async () => { const R = await import('./app/kernel/registry.js'); const K = %s; const t = R.getType('civil');
  const ids = []; for (const s of t.records.queryRecords({ filter: {}, offset: 0, limit: 600 }).rows) {
    const r = t.records.loadRecord(s.id);
    if (r && r.status === 'В заполнении' && !r.early && (r.oi || []).length >= 3 && !K.assignmentsOf('civil', s.id, { live: false }).length) ids.push(s.id);
    if (ids.length === 2) return ids; }
  return null; }""" % K
QUEUE = """async ([id]) => { const M = await import('./app/pages/inspections/model.js'); const R = await import('./app/kernel/registry.js');
  const t = R.getType('civil'); const all = new Map(t.records.queryRecords({ filter: {}, offset: 0, limit: 5000 }).rows.map((s) => ['civil|' + s.id, { ...s, typeId: 'civil' }]));
  const row = M.queueBase(all).find((s) => s.id === id); return row ? { early: row.early, total: row.cov.total, free: row.cov.free } : null; }"""


def open_facets(t):
    pg = t.page
    t.wait_for('[data-ip-ff="early"]')
    if not pg.locator('.ip-facets.open').count():
        pg.locator('[data-ip-ftoggle]:visible').first.click()
    t.wait_for('.ip-facets.open')


def run(t):
    pg = t.page
    pg.set_viewport_size({'width': 1440, 'height': 900})
    t.open('#/', wait='body')
    pg.evaluate("async () => (await import('./app/kernel/session.js')).session.set({ person: 'Осминнов Н.', role: 'any' })")
    pick = pg.evaluate(PICK)
    if not t.ck(pick, 'нет двух нежилых зданий «В заполнении» с тремя ОИ без назначений'):
        return
    rid, rid2 = pick
    ois = pg.evaluate("async ([id]) => %s.oi.map((o) => o.id)" % REC, [rid])
    t.ck(pg.evaluate(QUEUE, [rid]) is None, 'объект «В заполнении» без флага уже в очереди')

    # ЦОД досрочно направляет два ОИ из трёх.
    pg.evaluate("""async ([id, a, b]) => { const E = await import('./app/kernel/earlyInspection.js');
      E.sendEarly(%s, 'civil', { oiIds: [a, b], note: 'Учреждение просит до пятницы' }); }""" % REC, [rid, ois[0], ois[1]])
    q = pg.evaluate(QUEUE, [rid])
    t.ck(q and q['early'] and q['total'] == 2 and q['free'] == 2, 'в очереди нет досрочного объекта или ОИ не те: %s' % q)
    free = pg.evaluate("async ([id]) => (await import('./app/pages/inspections/model.js')).freeOiIds('civil', id)", [rid])
    t.ck(sorted(free) == sorted(ois[:2]), 'для пачки и маршрута свободны не направленные ОИ: %s' % free)

    # --- экран регионала: фильтр, пометка, окно назначения ---
    t.open('#/inspections?s=people', wait='.ip-person-main')
    pg.click('[data-ip-section="assign"]')
    pg.click('[data-ip-team="queue"]')
    open_facets(t)
    pg.click('[data-ip-ff="early"][data-ip-fv="early"]')
    t.ck(t.wait_until("([k]) => !!document.querySelector('[data-ip-row=\"' + k + '\"]')", ['civil|' + rid]), 'фильтр «Досрочно» не показал объект')
    rows = pg.eval_on_selector_all('tr[data-ip-row]', 'els => els.map((e) => [e.dataset.ipRow, !!e.querySelector(".ip-flag.early")])')
    t.ck(rows and all(e for _, e in rows), 'фильтр «Досрочно» пропустил объекты без пометки: %s' % [k for k, e in rows if not e][:5])
    pg.locator('[data-ip-row="civil|%s"] td:nth-child(3)' % rid).click()
    t.wait_for('.ip-pane .ip-early')
    info = pg.inner_text('.ip-pane .ip-early')
    t.ck('Досрочно направлен' in info and 'Осминнов Н.' in info and 'до пятницы' in info, 'в окне назначения нет сведений о направлении: %r' % info)
    checked = pg.eval_on_selector_all('[data-ip-f-oi]:checked', 'els => els.map((e) => e.dataset.ipFOi)')
    whole = pg.locator('[data-ip-f-whole]')
    t.ck(sorted(checked) == sorted(ois[:2]) and (whole.count() == 0 or not whole.is_checked()), 'в окне отмечены не направленные ОИ: %s' % checked)

    # --- назначение: статус не меняется, пометка early, отозвать нельзя ---
    a = pg.evaluate("async ([id, a, b]) => { const x = %s.assign({ typeId: 'civil', ocId: id, person: 'Айдай', oiIds: [a, b], plannedAt: '2099-03-03' }); return { early: !!x.early }; }" % K, [rid, ois[0], ois[1]])
    st = pg.evaluate("async ([id]) => %s.status" % REC, [rid])
    t.ck(st == 'В заполнении', 'назначение сменило статус досрочной карточки: %s' % st)
    t.ck(a['early'], 'у назначения нет пометки досрочного')
    t.ck(pg.evaluate(QUEUE, [rid]) is None, 'после назначения направленных ОИ объект остался в очереди')
    err = pg.evaluate("async ([id]) => { const E = await import('./app/kernel/earlyInspection.js'); try { E.cancelEarly(%s, 'civil'); return ''; } catch (x) { return x.message; } }" % REC, [rid])
    t.ck('уже назначен' in err, 'досрочное направление отзывается при живом назначении: %r' % err)
    # Сняли назначение — статус прежний, объект снова в очереди.
    pg.evaluate("async ([id]) => { const K = %s; K.assignmentsOf('civil', id).forEach((x) => K.unassign(x.id)); }" % K, [rid])
    st = pg.evaluate("async ([id]) => %s.status" % REC, [rid])
    t.ck(st == 'В заполнении' and pg.evaluate(QUEUE, [rid]), 'снятие назначения сменило статус или убрало объект из очереди: %s' % st)

    # «Назначено»: пометка и фильтр.
    pg.evaluate("async ([id, a]) => %s.assign({ typeId: 'civil', ocId: id, person: 'Айдай', oiIds: [a], plannedAt: '2099-03-03' })" % K, [rid, ois[0]])
    pg.click('[data-ip-team="assigned"]')
    t.wait_for('[data-ip-aperson]')
    pg.click('[data-ip-aperson="Айдай"]')
    open_facets(t)
    pg.click('[data-ip-ff="early"][data-ip-fv="early"]')
    t.ck(t.wait_until("() => [...document.querySelectorAll('tr[data-ip-row]')].some((e) => !!e.querySelector('.ip-flag.early'))"), 'в «Назначено» нет пометки «досрочно» у досрочного назначения')
    t.ck(pg.evaluate("() => [...document.querySelectorAll('tr[data-ip-row]')].every((e) => !!e.querySelector('.ip-flag.early'))"), 'фильтр «Досрочно» в «Назначено» пропустил обычные')

    # Обычный объект: первое назначение по-прежнему двигает статус «Удостоверен по документам» → «Направлен на осмотр».
    pg.evaluate("async ([id]) => { %s.status = 'Удостоверен по документам'; }" % REC, [rid2])
    pg.evaluate("async ([id]) => %s.assign({ typeId: 'civil', ocId: id, person: 'Айдай', plannedAt: '2099-03-04' })" % K, [rid2])
    st2 = pg.evaluate("async ([id]) => %s.status" % REC, [rid2])
    t.ck(st2 == 'Направлен на осмотр', 'обычное назначение не перевело статус: %s' % st2)

    # --- предложения на день: досрочные — отдельной категорией ---
    # Карта и кадастр — пустыми ответами: проверка не зависит от сети (как check_inspection_route).
    png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
    empty = '{"type":"FeatureCollection","features":[]}'
    pg.route('https://tile.openstreetmap.org/**', lambda r: r.fulfill(status=200, content_type='image/png', body=png))
    pg.route('http://127.0.0.1:8787/portal/**', lambda r: r.fulfill(status=200, content_type='application/json', body=empty))
    pg.route('**/cadastre/**', lambda r: r.fulfill(status=200, content_type='application/json', body=empty))
    t.open('#/inspections', wait='[data-ip-section]')
    pg.click('[data-ip-section="people"]')
    pg.locator('.ip-person-main[data-ip-person="%s"]' % WHO).click()
    pg.click('[data-ip-ptab="route"]')
    t.wait_for('.ip-stop.home')
    pg.click('[data-ip-route-add="prop"]')
    if not t.ck(t.wait_until("() => document.querySelectorAll('[data-ip-route-skip]').length > 0"), 'у осмотрщика нет предложений на день — нечем проверить категорию'):
        return
    keys = pg.eval_on_selector_all('[data-ip-route-skip]', 'els => els.map((e) => e.dataset.ipRouteSkip)')
    sent = pg.evaluate("""async (keys) => { const R = await import('./app/kernel/registry.js'); const E = await import('./app/kernel/earlyInspection.js');
      for (const k of keys) { const [ty, id] = k.split('|'); const r = R.getType(ty).records.loadRecord(id);
        if (r && E.canSendEarly(r, ty)) { E.sendEarly(r, ty, {}); return k; } } return ''; }""", keys)
    if not t.ck(sent, 'среди предложенных нет объекта, который можно направить досрочно: %s' % keys[:5]):
        return
    # Перерисовка маршрута — переключателем: сводки берутся заново.
    pg.click('[data-ip-route-add="prop"]')
    pg.click('[data-ip-route-add="prop"]')
    t.ck(t.wait_until("(k) => !!document.querySelector('.ip-stop.early [data-ip-route-skip=\"' + k + '\"]')", sent), 'досрочный объект среди предложенных не выделен своей категорией')
    # На карте: отметка досрочного — фиолетовая; в склейке с назначенным побеждает назначенное.
    n = pg.get_attribute('.ip-stop.early', 'data-ip-stop')
    pin = '''(n) => { const has = (txt) => txt.split(/, */).some((p) => { const m = p.match(/^(\d+)(?:–(\d+))?$/); return m && +n >= +m[1] && +n <= +(m[2] || m[1]); })
      || /…$/.test(txt) && txt.split(/, */).includes(n);
      const el = [...document.querySelectorAll('.ip-pin')].find((e) => has(e.textContent.replace('…', '')));
      return el ? (el.classList.contains('early') || el.classList.contains('fixed')) : null; }'''
    t.ck(t.wait_until(pin, n), 'на карте отметка досрочного предложенного объекта (№%s) не фиолетовая' % n)
