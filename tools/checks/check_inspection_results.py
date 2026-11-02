# -*- coding: utf-8 -*-
"""Результаты осмотра у ЦОД: вкладка карточки ОЦ и срез реестра.

Ответы пользователя 30.10.2026 «Вкладка в карточке + срез» и 02.11.2026
«Снять запрет для вкладки» (исключение из правила kartochki-oc-poka-ne-trogat:
только вкладка и показ, только чтение).

Что ловит сценарий:
  * вкладки «Результаты осмотра» нет у объекта с осмотром (недвижимость, ТС,
    механизмы) или она есть у объекта без осмотров;
  * вкладка не открывается по адресу ?tab=inspection или не возвращается на
    «Общие данные» (у ТС и механизмов вкладок раньше не было);
  * просмотр вкладки создаёт пустые записи результатов (они уйдут в файл
    сотрудника);
  * на 760–1920 подписи обрезаны или страница уезжает вбок;
  * срез ЦОД «Осмотр закончен — проверить» не находит объект с законченным
    осмотром, его счётчик отстаёт или объект остаётся в срезе после снятия
    отметки «завершён».
"""
NAME = 'результаты осмотра у ЦОД'

TOUCHES = (
    'app/pages/inspector/results.js', 'app/pages/inspector/results.css', 'app/pages/inspector/tasks.js',
    'app/pages/inspector/form.js', 'app/kernel/inspectionTab.js', 'app/kernel/ocHead.js',
    'app/kernel/inspections.js', 'app/kernel/inspectionResults.js', 'app/kernel/scanQueue.js', 'app/kernel/registryRows.js',
    'app/modules/*/card/ocCard.view.js', 'app/modules/*/card/ocCard.ctrl.js', 'app/modules/*/index.js',
    'app/modules/*/data/query.js', 'app/modules/vehicle/view.js', 'app/modules/mechanisms/view.js',
    'app/pages/ocMenu/slices.js', 'app/pages/ocMenu/state.js', 'app/pages/ocMenu/ocMenu.js',
)

KI = "await import('./app/kernel/inspections.js')"
TABS = "els => els.map((e) => e.dataset.tab)"


def tabs(pg):
    return pg.eval_on_selector_all('[data-tab]', TABS)


def run(t):
    pg = t.page
    pg.set_viewport_size({'width': 1600, 'height': 900})

    # --- недвижимость: вкладка, адрес, ничего не пишет -----------------------------
    t.open('#/oc/civil/oc-cv-1', wait='[data-oc-head]')
    t.ck('inspection' in tabs(pg), 'у объекта с осмотром нет вкладки: %s' % tabs(pg))
    n0 = pg.evaluate("async () => (await import('./app/kernel/inspectionResults.js')).allResults().length")
    pg.click('[data-tab="inspection"]')
    t.wait_for('.ir')
    t.ck('tab=inspection' in pg.evaluate('() => location.hash'), 'вкладка не в адресе')
    t.ck(pg.locator('.ir .ir-sum').count() == 1, 'нет сводки осмотра')
    t.ck(pg.locator('.ir [data-ir-sel]').count() > 0, 'нет списка ОИ')
    t.ck(pg.evaluate("async () => (await import('./app/kernel/inspectionResults.js')).allResults().length") == n0,
         'просмотр вкладки создал записи результатов')
    if pg.locator('[data-ir-sel="__obj"]').count():
        pg.click('[data-ir-sel="__obj"]')
        t.wait_until("() => !!document.querySelector('.ir-det h3') && document.querySelector('.ir-det h3').textContent.includes('Объект в целом')")
    t.ck(pg.locator('.ir a[href*="#/scans"]').count() > 0, 'у сканов нет ссылки на разбор')

    # --- объект среза из демо-объёма: значения и снимки по ОИ дописываются при открытии
    sl = pg.evaluate("""async () => { const R = await import('./app/kernel/inspectionResults.js');
      const r = R.allResults().find((x) => x.demo && /-b\d+$/.test(x.ocId) && (x.voices || []).length && (x.scans || []).length);
      return r ? [r.typeId, r.ocId] : null; }""")
    if t.ck(sl, 'нет демо-осмотра объекта из демо-объёма (срез ЦОД)'):
        t.open('#/oc/%s/%s?tab=inspection' % tuple(sl), wait='.ir-work')
        rows = pg.eval_on_selector_all('[data-ir-sel]:not([data-ir-sel="__obj"])', 'els => els.map((e) => e.innerText)')
        t.ck(rows and all('значений' in r and 'снимков' in r for r in rows), 'у ОИ объекта среза нет значений или снимков: %s' % rows)
        t.ck(pg.locator('.ir-thumb').count() == 16, 'у ОИ объекта среза не полная страница снимков')

    # --- приёмка ЦОД: «В карточку», «Принять ОИ», возврат с причиной ----------------
    # (решение priemka-osmotra-cod-vo-vkladke-rezultaty-osmotra-po-oi-vozvrat-po-oi-v)
    t.open('#/oc/civil/oc-pr-1?tab=inspection', wait='.ir-work')
    t.ck(pg.locator('.ir-foot [data-ir-accept-all]').is_visible(), 'подвал решений не на экране')
    pg.click('[data-ir-accept-all]')
    t.ck(t.wait_until("() => /Не приняты/.test((document.querySelector('.ir-msg') || {}).textContent || '')"), '«Принять осмотр» не назвал непринятые ОИ')
    n0 = pg.locator('.ir-cmp tr.diff').count()
    if t.ck(n0 > 0, 'у выбранного ОИ нет расхождения для «В карточку»'):
        pg.locator('.ir-cmp tr.diff [data-ir-apply]').first.click()
        t.ck(t.wait_until("([n]) => document.querySelectorAll('.ir-cmp tr.diff').length === n - 1", [n0]), '«В карточку» не сняло расхождение')
    pg.click('[data-ir-accept]')
    t.ck(t.wait_until("() => /принят/.test(document.querySelector('.ir-item.on').textContent)"), 'ОИ не принят')
    pg.locator('[data-ir-sel]').nth(1).click()
    pg.click('[data-ir-return]')
    t.ck(t.wait_until("() => !!document.querySelector('[data-ir-reason]') && !document.querySelector('.modal')"), 'причина возврата — не на месте или окном')
    pg.click('[data-ir-return-go]')
    t.ck(t.wait_until("() => /причину/.test((document.querySelector('.ir-msg') || {}).textContent || '')"), 'возврат без причины не остановлен')
    pg.fill('[data-ir-reason]', 'Нет снимков кровли')
    pg.click('[data-ir-return-go]')
    t.ck(t.wait_until("() => /на доосмотре/.test(document.querySelector('.ir-item.on').textContent)"), 'ОИ не на доосмотре')
    st = pg.evaluate("""async () => { const K = await import('./app/kernel/inspections.js');
      return { states: K.allAssignments().filter((a) => a.ocId === 'oc-pr-1' && a.state !== 'removed').map((a) => a.state),
        ev: K.eventsOf({ ocId: 'oc-pr-1' }).filter((e) => e.kind === 'returned').map((e) => e.text) }; }""")
    t.ck('progress' in st['states'] and 'Нет снимков кровли' in st['ev'], 'возврат не вернул назначение в работу с причиной: %s' % st)

    # --- лента на тысячи снимков: страница 16, категории, крупный просмотр -----------
    oid = pg.evaluate("""async () => { const R = await import('./app/kernel/inspectionResults.js'); const r = R.resultsOf('civil', 'oc-pr-1');
      const id = Object.keys(r.assets)[0]; const src = r.photos.find((p) => p.dataUrl).dataUrl;
      for (let i = 0; i < 3000; i++) r.photos.push({ id: 'big-' + i, name: 'x', dataUrl: src, oiId: id, cat: i % 7 ? 'Внутр. помещения' : 'Фасад', at: new Date().toISOString(), by: 'проверка' });
      return id; }""")
    t.open('#/oc/civil/oc-pr-1?tab=inspection', wait='.ir-work')
    pg.click('[data-ir-sel="%s"]' % oid)
    t.ck(t.wait_until("() => document.querySelectorAll('.ir-thumb').length === 16"), 'на странице ленты не 16 снимков')
    pg.click('[data-irp="1"]')
    t.ck(t.wait_until("() => /17–32/.test(document.querySelector('.ir-pager').textContent)"), 'лента не листается страницами')
    pg.click('[data-irc="Фасад"]')
    t.ck(t.wait_until("() => /из 4[0-9]{2}/.test(document.querySelector('.ir-pager').textContent)"), 'чип категории не сузил ленту')
    pg.locator('.ir-thumb').first.click()
    t.ck(t.wait_until("() => !!document.querySelector('.irv-img') && !document.querySelector('.ir-thumbs')"), 'крупный просмотр не встал на место ленты')
    hh = pg.evaluate("() => Math.round(document.querySelector('.irv-stage').getBoundingClientRect().height)")
    t.ck(hh > 300, 'сцена просмотра схлопнулась: %d px' % hh)
    pg.keyboard.press('ArrowRight')
    t.ck(t.wait_until("() => document.querySelector('.irv-n').textContent.trim().startsWith('2')"), '→ не листает')
    pg.click('[data-irv-zoom="1"]')
    pg.click('[data-irv-rot]')
    pg.wait_for_timeout(200)
    edge = pg.evaluate("""() => { const s = document.querySelector('.irv-stage').getBoundingClientRect(); const i = document.querySelector('.irv-img').getBoundingClientRect();
      return [Math.round(i.left - s.left), Math.round(i.top - s.top)]; }""")
    t.ck(edge[0] >= 0 and edge[1] >= 0, 'повёрнутый увеличенный снимок ушёл за левый или верхний край: %s' % edge)
    pg.keyboard.press('Escape')
    t.ck(t.wait_until("() => !!document.querySelector('.ir-thumbs')"), 'Esc не вернул к ленте')
    for w in (1920, 1280, 1100, 900, 760):
        pg.set_viewport_size({'width': w, 'height': 900})
        m = pg.evaluate("""() => { const d = document.scrollingElement;
          const cut = [...document.querySelectorAll('.ir dt, .ir dd, .ir th, .ir td, .ir .card-head h3, .ir-item-t')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent.trim().slice(0, 30));
          return { hscroll: d.scrollWidth > d.clientWidth, cut }; }""")
        t.ck(not m['hscroll'] and not m['cut'], '%d: вбок или обрезано: %s' % (w, m))
    pg.set_viewport_size({'width': 1600, 'height': 900})

    # --- ТС: вкладка и возврат --------------------------------------------------------
    t.open('#/oc/vehicle/oc-vehicle-d2', wait='[data-oc-head]')
    t.ck(tabs(pg) == ['general', 'inspection'], 'вкладки ТС не те: %s' % tabs(pg))
    pg.click('[data-tab="inspection"]')
    t.wait_for('.ir')
    t.ck(pg.locator('.ir-cmp tbody td[data-l="На осмотре"]').count() > 0, 'у ТС не показаны значения осмотра')
    pg.click('[data-tab="general"]')
    t.ck(t.wait_until("() => !/tab=/.test(location.hash) && !document.querySelector('.ir')"), 'ТС не вернулась на «Общие данные»')

    # --- объект без осмотров — вкладки нет; механизмы — появляется после назначения ---
    none = pg.evaluate("""async () => { const R = await import('./app/kernel/registry.js'); const I = await import('./app/kernel/inspectionTab.js');
      for (const t of R.sortedTypes()) { const s = t.records.queryRecords({ filter: {}, offset: 0, limit: 400 }).rows.find((x) => !I.hasInspection(t.manifest.id, x.id));
        if (s) return [t.manifest.id, s.id]; } return null; }""")
    t.open('#/oc/%s/%s' % tuple(none), wait='[data-oc-head]')
    t.ck('inspection' not in tabs(pg), 'вкладка у объекта без осмотров: %s' % none)
    mech = pg.evaluate("""async () => { const R = await import('./app/kernel/registry.js'); const t = R.getType('mechanisms');
      const s = t && t.records.queryRecords({ filter: {}, offset: 0, limit: 50 }).rows[0]; return s ? s.id : null; }""")
    if mech:
        pg.evaluate("async (id) => (%s).assign({ typeId: 'mechanisms', ocId: id, person: 'Айдай' })" % KI, mech)
        t.open('#/oc/mechanisms/%s' % mech, wait='[data-oc-head]')
        t.ck('inspection' in tabs(pg), 'у механизмов с назначением нет вкладки')
        pg.click('[data-tab="inspection"]')
        t.ck(t.wait_until("() => !!document.querySelector('.ir')"), 'вкладка механизмов не открылась')

    # --- срез ЦОД «Осмотр закончен — проверить» ---------------------------------------
    t.open('#/', wait='[data-slice]')
    me = pg.evaluate("async () => (await import('./app/kernel/session.js')).session.state.person")
    pick = pg.evaluate("""async (me) => { const R = await import('./app/kernel/registry.js'); const K = %s;
      for (const t of R.sortedTypes()) { const s = t.records.queryRecords({ filter: { status: ['Удостоверен по документам'], mine: { role: 'cod', person: me } }, offset: 0, limit: 50 }).rows
        .find((x) => !K.assignmentsOf(t.manifest.id, x.id, { live: false }).length); if (s) return [t.manifest.id, s.id, s.title]; } return null; }""" % KI, me)
    t.ck(pick, 'нет записи ЦОД без назначений для сценария')
    if not pick:
        return
    pg.evaluate("""async ([ty, id]) => { const K = %s; K.assign({ typeId: ty, ocId: id, person: 'Айдай' }); K.finishWork('Айдай', ty, id, true); }""" % KI, pick[:2])
    t.open('#/?x=1', wait='[data-slice="my-cod-insp"]')
    t.open('#/', wait='[data-slice="my-cod-insp"]')
    pg.click('[data-slice="my-cod-insp"]')
    t.ck(t.wait_until("(t) => document.body.innerText.includes(t)", pick[2]), 'объекта с законченным осмотром нет в срезе')
    n = pg.inner_text('[data-slice="my-cod-insp"]')
    rows = pg.locator('[data-row], tbody tr').count()
    t.ck(any(ch.isdigit() for ch in n) and int(''.join(ch for ch in n if ch.isdigit())) >= 1, 'счётчик среза не обновился: %s (строк %d)' % (n, rows))
    t.ck('Осмотр закончен' in t.text() or pg.locator('text=Срез: Осмотр закончен').count() > 0, 'нет метки отбора среза')
    pg.evaluate("async ([ty, id]) => (%s).finishWork('Айдай', ty, id, false)" % KI, pick[:2])
    t.ck(not pg.evaluate("async (k) => (%s).finishedObjects().has(k)" % KI, '%s|%s' % (pick[0], pick[1])),
         'после снятия отметки объект остался законченным')
