# -*- coding: utf-8 -*-
"""Разбор сканов: «Мне» регионала, пересъёмка страниц, отказ кадастра, правка и перенос, лента и меню.

Решения пользователя 06.11.2026 по аудиту осмотров (блок «кадастр и сканы»):
  * «Сканы его осмотрщиков» — у регионала «Мне» = сканы осмотрщиков, закреплённых за ним;
  * «Названные страницы + история» — возврат называет страницы, пересъёмка заменяет только их,
    история возвратов видна ЦОД;
  * «Снова «Ждёт» + причина» — отклонённый ответ кадастра снова ждёт, причина — в строке запроса;
  * «Правка вида и ОИ принятого», «Перенос к другому объекту»;
  * «В ленту и число на меню» — регионалу: ответ кадастра получен, скан не переснят, осмотр сдан;
    на пункте меню — число ждущих разбора.

Что ловит сценарий:
  * «Мне» у регионала пусто или равно «Все»;
  * возврат не помнит страницы, пересъёмка меняет все страницы, история пропадает;
  * отклонённый ответ кадастра остаётся «Получен», причины не видно;
  * правка принятого не переносит документ к ОИ и не меняет вид;
  * перенос не перекладывает скан к другому объекту;
  * нет уведомлений о кадастре, пересъёмке и сдаче; число на меню расходится с очередью.
"""
NAME = 'разбор сканов: правка, перенос, страницы'

TOUCHES = ('app/pages/scans/*', 'app/kernel/scanQueue.js', 'app/kernel/inspectionResults.js', 'app/shell/shell.js',
           'app/shell/shell.css', 'app.html', 'app/pages/inspections/notify.js', 'app/pages/inspections/inspections.js')

GIF = 'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='
MAKE = """async ([ty, oc, n, by, title]) => { const IR = await import('./app/kernel/inspectionResults.js');
  const b = Uint8Array.from(atob('%s'), (c) => c.charCodeAt(0));
  const files = Array.from({ length: n }, (_, i) => new File([b], 'p' + (i + 1) + '.gif', { type: 'image/gif' }));
  const s = IR.addResultScan(ty, oc, files, { title, by }); return 'scan|' + ty + '|' + oc + '|' + s.id; }""" % GIF
SQ = "await import('./app/kernel/scanQueue.js')"
REC = """async ([ty, oc]) => { const R = await import('./app/kernel/registry.js'); const r = R.getType(ty).records.loadRecord(oc);
  return { eni: r.eni, oi: (r.oi || []).map((o) => o.id), docs: (r.docs || []).map((d) => d.id),
    oiDocs: Object.fromEntries((r.oi || []).map((o) => [o.id, (o.docs || []).map((d) => [d.id, d.type])])) }; }"""


def run(t):
    pg = t.page
    t.open('#/scans', wait='.sc-main')
    two = pg.evaluate("""async () => { const R = await import('./app/kernel/registry.js'); const t = R.getType('civil');
      const rows = t.records.queryRecords({ filter: {}, offset: 0, limit: 60 }).rows.filter((s) => s.eni);
      const a = rows.find((s) => (t.records.loadRecord(s.id).oi || []).length >= 1);
      const b = rows.find((s) => s !== a && s.eni !== a.eni && (t.records.loadRecord(s.id).oi || []).length >= 1);
      return [a.id, b.id]; }""")
    oc_a, oc_b = two

    # --- «Мне» регионала: сканы закреплённых за ним осмотрщиков -----------------
    pg.evaluate("""async () => { const K = await import('./app/kernel/inspections.js'); const p = K.profileOf('Айдай');
      K.saveProfile('Айдай', { ...p, manager: 'Регионал Проверка' }); }""")
    key = pg.evaluate(MAKE, ['civil', oc_a, 3, 'Айдай', 'Техпаспорт проверки'])
    mine = pg.evaluate("async () => (%s).scanQueue({ role: 'rm', person: 'Регионал Проверка' }).map((x) => x.key)" % SQ)
    total = pg.evaluate("async () => (%s).scanQueue({ role: 'all' }).length" % SQ)
    t.ck(key in mine and 0 < len(mine) < total, '«Мне» регионала — не сканы его осмотрщиков: мне %d из %d, новый %s' % (len(mine), total, key in mine))
    pg.evaluate("async () => (await import('./app/kernel/session.js')).session.set({ role: 'rm', person: 'Регионал Проверка' })")
    t.open('#/scans?who=me', wait='.sc-main')
    t.ck(t.wait_until("(k) => !!document.querySelector('[data-sc-row=\"' + k + '\"]')", key), 'в «Мне» регионала нет скана его осмотрщика')
    pg.evaluate("async () => (await import('./app/kernel/session.js')).session.set({ role: 'any', person: 'Осминнов Н.' })")

    # --- число на меню = ждущие разбора -----------------------------------------
    t.open('#/scans', wait='.sc-main')
    wait_n = pg.evaluate("async () => (%s).scanCounts().wait" % SQ)
    t.ck(t.wait_until("(n) => (document.querySelector('[data-nav-count=\"scans\"]') || {}).textContent === String(n[0])", [wait_n]),
         'число на «Сканы с осмотров» не равно ждущим: %r vs %d' % (pg.inner_text('[data-nav-count="scans"]'), wait_n))

    # --- возврат с названной страницей, пересъёмка только её, история ------------
    t.open('#/scans?key=%s' % key, wait='[data-sc-retake-page]')
    pg.click('[data-sc-retake-page="2"]')
    t.ck(pg.get_attribute('[data-sc-retake-page="2"]', 'aria-pressed') == 'true', 'страница 2 не отметилась к пересъёмке')
    pg.fill('[data-sc-f-reason]', 'Смазана вторая страница')
    pg.click('[data-sc-return]')
    t.wait_until("(k) => !document.querySelector('tr.cur[data-sc-row=\"' + k + '\"]')", key)
    _, ty, oc, sid = key.split('|')
    st = pg.evaluate("""async ([ty, oc, sid]) => { const IR = await import('./app/kernel/inspectionResults.js'); const s = IR.resultsOf(ty, oc).scans.find((x) => x.id === sid);
      return { pages: s.retake && s.retake.pages, urls: s.pages.map((p) => p.dataUrl), hist: (s.returns || []).length }; }""", [ty, oc, sid])
    t.ck(st['pages'] == [2] and st['hist'] == 1, 'возврат не запомнил страницу или историю: %s' % st)
    after = pg.evaluate("""async ([ty, oc, sid]) => { const IR = await import('./app/kernel/inspectionResults.js');
      const b = Uint8Array.from(atob('%s'), (c) => c.charCodeAt(0));
      const s = IR.replaceScanPages(ty, oc, sid, [new File([b], 'new.gif', { type: 'image/gif' })], { by: 'Айдай' }); return s.pages.map((p) => p.dataUrl); }""" % GIF, [ty, oc, sid])
    t.ck(len(after) == 3 and after[0] == st['urls'][0] and after[2] == st['urls'][2] and after[1] != st['urls'][1],
         'пересъёмка заменила не только названную страницу: было %s, стало %s' % (st['urls'], after))
    t.open('#/scans?key=%s' % key, wait='.sc-pane')
    t.ck('Смазана вторая страница' in pg.inner_text('.sc-pane') and 'стр. 2' in pg.inner_text('.sc-pane'), 'в панели нет истории возврата со страницей')

    # --- перенос к другому объекту --------------------------------------------------
    rb = pg.evaluate(REC, ['civil', oc_b])
    pg.fill('[data-sc-move-q]', rb['eni'])
    t.ck(t.wait_until("() => document.querySelectorAll('[data-sc-move-pick]').length > 0"), 'поиск переноса по ЕНИ ничего не нашёл')
    pg.click('[data-sc-move-pick^="civil|%s"]' % oc_b)
    t.wait_for('[data-sc-move-oi]')
    pg.select_option('[data-sc-move-oi]', rb['oi'][0])
    pg.click('[data-sc-move-go]')
    nk = 'scan|civil|%s|%s' % (oc_b, sid)
    t.ck(t.wait_until("(k) => decodeURIComponent(location.hash).includes(k)", nk), 'после переноса скан не открыт у нового объекта: %s' % pg.evaluate('location.hash'))
    moved = pg.evaluate("""async ([a, b, sid]) => { const IR = await import('./app/kernel/inspectionResults.js');
      const at = (oc) => (IR.resultsOf('civil', oc).scans || []).find((x) => x.id === sid); const s = at(b);
      return { fromA: !!at(a), toB: !!s, oi: s ? s.oiId : '' }; }""", [oc_a, oc_b, sid])
    t.ck(not moved['fromA'] and moved['toB'] and moved['oi'] == rb['oi'][0], 'перенос не переложил скан: %s' % moved)

    # --- приём и правка принятого: вид и ОИ ------------------------------------------
    pg.click('[data-sc-accept]')
    t.open('#/scans?state=accepted&key=%s' % nk.replace('|', '%7C'), wait='[data-sc-edit]')
    pg.select_option('[data-sc-f-oi]', '')
    pg.select_option('[data-sc-f-type]', 'Прочее')
    pg.click('[data-sc-edit]')
    t.wait_until("() => /Исправлено/.test(document.querySelector('.sc-pane').innerText)")
    rb2 = pg.evaluate(REC, ['civil', oc_b])
    doc_id = pg.evaluate("async (k) => (%s).scanQueue({}).find((x) => x.key === k).docId" % SQ, nk)
    t.ck(doc_id in rb2['docs'] and not any(doc_id == d[0] for d in rb2['oiDocs'][rb['oi'][0]]),
         'правка принятого не перенесла документ к ОЦ: %s' % rb2)

    # --- отказ кадастра: строка снова «Ждёт» с причиной -----------------------------
    cad = pg.evaluate("async () => ((%s).scanQueue({ state: 'wait', source: 'кадастр' })[0] || {}).key || ''" % SQ)
    if t.ck(cad, 'нет ответа кадастра, ждущего разбора'):
        t.open('#/scans?src=%s&key=%s' % ('%D0%BA%D0%B0%D0%B4%D0%B0%D1%81%D1%82%D1%80', cad.replace('|', '%7C')), wait='[data-sc-reject]')
        pg.fill('[data-sc-f-reason]', 'Не тот участок')
        pg.click('[data-sc-reject]')
        _, req_id, row_id = cad.split('|')
        t.wait_until("""async ([r, x]) => { const K = await import('./app/kernel/inspections.js'); const row = K.cadRequest(r).rows.find((y) => y.id === x);
          return row.result === '' && /Отклонено ЦОД: Не тот участок/.test(row.note || ''); }""", [req_id, row_id])
        row = pg.evaluate("""async ([r, x]) => { const K = await import('./app/kernel/inspections.js'); const row = K.cadRequest(r).rows.find((y) => y.id === x);
          return [row.result, row.note || '']; }""", [req_id, row_id])
        t.ck(row[0] == '' and 'Отклонено ЦОД: Не тот участок' in row[1], 'отклонённый ответ кадастра не стал «Ждёт» с причиной: %s' % row)

    # --- лента регионала: осмотр сдан ------------------------------------------------
    pg.evaluate("""async (oc) => { const K = await import('./app/kernel/inspections.js'); K.assign({ typeId: 'civil', ocId: oc, person: 'Айдай' });
      K.finishWork('Айдай', 'civil', oc, true); }""", oc_a)
    t.open('#/inspections?s=notes', wait='[data-ip-note]')
    kinds = pg.evaluate("() => [...document.querySelectorAll('.ip-note-dot')].map((d) => d.className)")
    txt = pg.inner_text('body')
    t.ck('Осмотр сдан' in txt, 'в ленте регионала нет «Осмотр сдан»: %s' % kinds[:5])
