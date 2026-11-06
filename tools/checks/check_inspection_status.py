# -*- coding: utf-8 -*-
"""Статус ОЦ и шкала ОИ следуют за осмотром; пустой ОИ не принимается.

Решения пользователя 06.11.2026 по сквозному разбору «от вноса актива до результатов»:
«Шаг — по приёмке ЦОД» («Сам список не меняем»): назначение — ОЦ «Направлен на осмотр»,
снятие всех назначений — снова «Удостоверен по документам», «Принять осмотр» — «Осмотрен»,
приём ОИ — шкала ОИ «Осмотрено», возврат на доосмотр — ОИ «Заполнено», ОЦ «Направлен на
осмотр». Пустой ОИ (ни снимка, ни значения) — «Запрещать».

Что ловит сценарий:
  * назначение не двигает статус ОЦ или снятие не возвращает его;
  * объект с частью назначенных ОИ выпадает из «К назначению» после смены статуса;
  * ОИ без снимков и значений принимается;
  * приём ОИ не ставит «Осмотрено», возврат не откатывает ОИ и ОЦ;
  * под шагом «Направлен на осмотр» нет подписи, где осмотр (назначен, закончен, на доосмотре).
"""
NAME = 'статус от осмотра'

TOUCHES = ('app/kernel/inspections.js', 'app/pages/inspector/results.js', 'app/pages/inspector/tasks.js',
           'app/pages/inspections/model.js', 'app/kernel/oiStage.js', 'app/kernel/status/flow.view.js', 'app/kernel/ocHead.js',
           'app/kernel/inspectionTab.js', 'app/kernel/cards.css')

K = "await import('./app/kernel/inspections.js')"
PICK = """async () => { const R = await import('./app/kernel/registry.js'); const K = %s; const T = await import('./app/pages/inspector/tasks.js');
  const t = R.getType('civil'); const rows = t.records.queryRecords({ filter: { status: ['Удостоверен по документам'] }, offset: 0, limit: 400 }).rows;
  for (const s of rows) { if (K.assignmentsOf('civil', s.id, { live: false }).length) continue;
    const ois = T.ownOis(t.records.loadRecord(s.id)); if (ois.length >= 2) return [s.id, ois[0].id, ois[1].id]; }
  return null; }""" % K
STATE = """async ([oc, a, b]) => { const R = await import('./app/kernel/registry.js'); const S = await import('./app/kernel/oiStage.js');
  const rec = R.getType('civil').records.loadRecord(oc); const st = (id) => S.stageOf(rec.oi.find((o) => o.id === id));
  return { status: rec.status, a: st(a), b: st(b) }; }"""
SUB = "() => ((document.querySelector('.st-full .st-cur .st-sub') || {}).textContent || '')"
QN = "() => +((document.querySelector('[data-ip-team=\"queue\"] b') || {}).textContent || -1)"


def accept(t, pg, oi):
    pg.click('[data-ir-sel="%s"]' % oi)
    t.wait_until("(id) => !!document.querySelector('.ir-det[data-oi=\"' + id + '\"]')", oi)
    pg.click('[data-ir-accept]')


def run(t):
    pg = t.page
    t.open('#/inspections?s=people', wait='.ip-person-main')
    pick = pg.evaluate(PICK)
    if not t.ck(pick, 'нет гражданского ОЦ «Удостоверен по документам» без назначений и с двумя ОИ'):
        return
    oc, a, b = pick
    keys = [oc, a, b]
    pg.click('[data-ip-team="queue"]')
    t.wait_for('[data-ip-team="queue"] b')
    n0 = pg.evaluate(QN)

    # Часть ОИ — статус «Направлен на осмотр», объект остаётся в очереди (свободный ОИ).
    pg.evaluate("async ([oc, a]) => (%s).assign({ typeId: 'civil', ocId: oc, person: 'Айдай', oiIds: [a] })" % K, [oc, a])
    st = pg.evaluate(STATE, keys)
    t.ck(st['status'] == 'Направлен на осмотр', 'назначение не перевело ОЦ в «Направлен на осмотр»: %s' % st)
    t.ck(t.wait_until("([n]) => +((document.querySelector('[data-ip-team=\"queue\"] b') || {}).textContent || -1) === n", [n0]),
         'объект с частью назначенных ОИ выпал из «К назначению»: было %s, стало %s' % (n0, pg.evaluate(QN)))
    t.open('#/oc/civil/%s' % oc, wait='[data-oc-head]')
    t.ck(pg.evaluate(SUB) == 'назначен', 'под шагом «Направлен на осмотр» нет подписи «назначен»: %r' % pg.evaluate(SUB))
    # Сняли все назначения — снова «Удостоверен по документам».
    pg.evaluate("async (oc) => { const K = %s; K.assignmentsOf('civil', oc).forEach((x) => K.unassign(x.id)); }" % K, oc)
    t.ck(pg.evaluate(STATE, keys)['status'] == 'Удостоверен по документам', 'снятие всех назначений не вернуло «Удостоверен по документам»')

    # Осмотр закончен: у ОИ a — снимок, у ОИ b — ничего.
    pg.evaluate("""async ([oc, a, b]) => { const K = %s; const IR = await import('./app/kernel/inspectionResults.js');
      K.assign({ typeId: 'civil', ocId: oc, person: 'Айдай', oiIds: [a, b] });
      const r = IR.resultsOf('civil', oc);
      r.photos.push({ id: 'st-a', name: 'a.jpg', dataUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', oiId: a, cat: 'Фасад', at: new Date().toISOString(), by: 'Айдай' });
      IR.saveResults(); K.finishWork('Айдай', 'civil', oc, true); }""" % K, [oc, a, b])
    t.open('#/oc/civil/%s?tab=inspection' % oc, wait='.ir')
    t.ck(pg.evaluate(SUB) == 'ждёт приёмки', 'нет подписи «ждёт приёмки» под шагом: %r' % pg.evaluate(SUB))
    accept(t, pg, b)
    t.ck(t.wait_until("() => /принять нельзя/.test((document.querySelector('.ir-msg') || {}).textContent || '')"), 'пустой ОИ не остановлен при приёмке')
    t.ck('принят' not in pg.inner_text('.ir-nav-tbl tr.on'), 'пустой ОИ принят')
    accept(t, pg, a)
    t.ck(t.wait_until("() => /принят/.test(document.querySelector('.ir-nav-tbl tr.on').textContent)"), 'ОИ со снимком не принят')
    t.ck(pg.evaluate(STATE, keys)['a'] == 'Осмотрено', 'приём ОИ не поставил «Осмотрено»: %s' % pg.evaluate(STATE, keys))

    # b получает снимок — принимается; весь осмотр — «Осмотрен».
    pg.evaluate("""async ([oc, b]) => { const IR = await import('./app/kernel/inspectionResults.js'); const r = IR.resultsOf('civil', oc);
      r.photos.push({ id: 'st-b', name: 'b.jpg', dataUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', oiId: b, cat: 'Фасад', at: new Date().toISOString(), by: 'Айдай' }); IR.saveResults(); }""", [oc, b])
    t.open('#/oc/civil/%s?tab=inspection' % oc, wait='.ir')
    accept(t, pg, b)
    t.ck(t.wait_until("() => /принят/.test(document.querySelector('.ir-nav-tbl tr.on').textContent)"), 'ОИ со снимком (b) не принят')
    pg.click('[data-ir-accept-all]')
    t.wait_until("() => /Осмотр принят/.test((document.querySelector('.ir-msg') || {}).textContent || '')")
    t.ck(pg.evaluate(STATE, keys)['status'] == 'Осмотрен', '«Принять осмотр» не перевёл ОЦ в «Осмотрен»: %s, %r' % (pg.evaluate(STATE, keys), pg.inner_text('.ir-msg') if pg.locator('.ir-msg').count() else ''))

    # Возврат ОИ a: ОИ — «Заполнено», ОЦ — «Направлен на осмотр».
    pg.click('[data-ir-sel="%s"]' % a)
    pg.click('[data-ir-return]')
    pg.fill('[data-ir-reason]', 'Нет снимков кровли')
    pg.click('[data-ir-return-go]')
    t.wait_until("() => /на доосмотре/.test(document.querySelector('.ir-nav-tbl tr.on').textContent)")
    st = pg.evaluate(STATE, keys)
    t.ck(st['a'] == 'Заполнено' and st['b'] == 'Осмотрено', 'возврат не откатил шкалу ОИ: %s' % st)
    t.ck(st['status'] == 'Направлен на осмотр', 'возврат не вернул ОЦ в «Направлен на осмотр»: %s' % st)
    t.ck(t.wait_until("() => ((document.querySelector('.st-full .st-cur .st-sub') || {}).textContent || '') === 'на доосмотре'"),
         'нет подписи «на доосмотре» под шагом: %r' % pg.evaluate(SUB))
