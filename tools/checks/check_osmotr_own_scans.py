# -*- coding: utf-8 -*-
"""Скан документа на месте: самостоятельный или по запросу; к чему крепится; кто и когда отсканировал и принял.

Пользователь 23.11.2026 (запись графа naydennye-na-meste-dokumenty-nedvizhimost-k-oc-ts-i-mehanizmy-k-samomu):
«Прикреплять найденные на месте документы нужно не на уровне ОИ, а на уровне ОЦ. Для недвижки. Для ТС на уровне самого
ТС»; «осмотрщик вне зависимости от наличия запроса может сам отсканировать документ  отправить его… Если ТС заведена
как ОИ, то крепится к ОИ (но все равно видно и в ОЦ), если ТС заведена как ОЦ, то на уровне ОЦ. У механизмов
автоматически в их карточку по той же логике»; «скан может быть как самостоятельный, так и по запросу»; «Обязательно
нам надо сохранять кто и когда отсканировал»; «Так же кто принял и обработал. И когда».

Что ловит сценарий:
  * у осмотрщика на экране объекта нет «Документы на месте» и «Отсканировать документ»; скан не уходит в ЦОД, без
    автора и времени, не у ОЦ; название не сохраняется; «Убрать» срабатывает без подтверждения;
  * на экране ТС-ОИ скан не крепится к этому ОИ; на экране литеры блок есть; в описи механизма блока нет;
  * возвращённый ЦОД скан не предлагает «Переснять», не видна причина; пересъёмка не возвращает в «Ждёт ЦОД»;
  * у ЦОД в «К чему относится» есть литера или нет ТС; скан ТС по умолчанию не к ТС; ядро принимает документ к литере;
  * принятый документ без «отсканировал» и «принял» (кто, когда); правка ЦОД не оставляет следа (кто, когда, что);
  * ответ на строку запроса по ЕНИ ТС-ОИ по умолчанию не к этому ТС;
  * ошибки консоли.
"""
from urllib.parse import quote

NAME = 'осмотрщик: документы на месте и к чему крепятся'

TOUCHES = ('app/pages/osmotr/osmotr.js', 'app/pages/osmotr/osmotr.css', 'app/kernel/scanQueue.js', 'app/pages/scans/scans.js',
           'app/pages/inspection/tasks.js', 'app/kernel/inspectionResults.js')

R = "(await import('./app/kernel/inspectionResults.js'))"
Q = "(await import('./app/kernel/scanQueue.js'))"
REC = "(await import('./app/kernel/registry.js')).getType('civil').records.loadRecord('oc-cv-1')"
PNG = {'name': 'скан.png', 'mimeType': 'image/png', 'buffer': bytes([137, 80, 78, 71, 13, 10, 26, 10])}
OWN = "%s.resultsOf('civil', 'oc-cv-1').scans.filter((s) => !s.inv)" % R
OBJ = '#/osmotr?v=obj&id=' + quote('civil|oc-cv-1', safe='')
OI = '#/osmotr?v=oi&id=' + quote('civil|oc-cv-1', safe='') + '&oi='


def run(t):
    pg = t.page
    pg.set_viewport_size({'width': 400, 'height': 860})
    t.open(OBJ, wait='.om-app[data-v="obj"]')
    me = pg.evaluate("async () => (await import('./app/kernel/session.js')).session.state.person")

    # --- ОЦ: свой скан без запроса ---
    t.ck(t.wait_until("() => !!document.querySelector('#om-scans [data-scan-add=\"\"]')"), 'на экране объекта нет «Отсканировать документ»')
    n0 = pg.evaluate("async () => %s.length" % OWN)
    pg.set_input_files('#om-scans [data-scan-add=""]', [PNG, {**PNG, 'name': 'скан-2.png'}])
    t.ck(t.wait_until("async ([n]) => %s.length === n + 1" % OWN, [n0]), 'скан не появился в результатах осмотра')
    sc = pg.evaluate("async () => { const s = %s.at(-1); return { id: s.id, oiId: s.oiId, by: s.by, at: s.at, n: s.pages.length }; }" % OWN)
    t.ck(sc['oiId'] == '' and sc['by'] == me and sc['at'] and sc['n'] == 2, 'скан на ОЦ не тот (ОИ, кто, когда, страницы): %s' % sc)
    row = '[data-scan-row="%s"]' % sc['id']
    t.ck(t.wait_until("([s]) => document.querySelector(s)?.textContent.includes('Ждёт ЦОД')", [row]), 'у скана нет «Ждёт ЦОД»')
    t.ck(me in pg.locator(row).inner_text(), 'в строке скана нет, кто отсканировал')
    pg.fill(row + ' [data-scan-title]', 'Справка БТИ')
    pg.dispatch_event(row + ' [data-scan-title]', 'change')
    t.ck(t.wait_until("async ([id]) => %s.find((s) => s.id === id).title === 'Справка БТИ'" % OWN, [sc['id']]), 'название скана не сохранилось')
    key = pg.evaluate("async ([id]) => (%s.scanQueue({ state: 'wait' }).find((x) => x.scanId === id) || {}).key || ''" % Q, [sc['id']])
    t.ck(key, 'скан не в очереди ЦОД')

    # «Убрать» — с подтверждением.
    pg.set_input_files('#om-scans [data-scan-add=""]', [PNG])
    t.wait_until("async ([n]) => %s.length === n + 2" % OWN, [n0])
    gone = pg.evaluate("async () => %s.at(-1).id" % OWN)
    t.wait_for('[data-scan-del="%s"]' % gone)
    pg.click('[data-scan-del="%s"]' % gone)
    t.ck(pg.evaluate("async ([id]) => %s.some((s) => s.id === id)" % OWN, [gone]), '«Убрать» сработало без подтверждения')
    pg.click('[data-scan-del-yes="%s"]' % gone)
    t.ck(t.wait_until("async ([id]) => !%s.some((s) => s.id === id)" % OWN, [gone]), '«Убрать скан» не убрало')

    # --- ТС-ОИ: к самому ТС; литера — без блока ---
    t.open(OI + 'oi-cv1-v1', wait='.om-app[data-v="oi"]')
    t.ck(t.wait_until("() => !!document.querySelector('#om-scans [data-scan-add=\"oi-cv1-v1\"]')"), 'на экране ТС нет «Отсканировать документ»')
    pg.set_input_files('#om-scans [data-scan-add="oi-cv1-v1"]', [PNG])
    t.ck(t.wait_until("async () => %s.some((s) => s.oiId === 'oi-cv1-v1')" % OWN), 'скан с экрана ТС не к этому ТС')
    t.open(OI + 'oi-cv1-b', wait='.om-app[data-v="oi"]')
    t.ck(pg.locator('#om-scans').count() == 0, 'на экране литеры есть «Документы на месте» — документ недвижимости крепится к ОЦ')

    # --- ЦОД: правило в ядре, отметки «отсканировал», «принял», правка ---
    ois = pg.evaluate("async () => { const rec = %s; const ids = %s.docHolderOis(rec).map((o) => o.id); return [ids, (rec.oi || []).filter((o) => o.card === 'vehicle' || o.card === 'mech').map((o) => o.id)]; }" % (REC, Q))
    t.ck(ois[0] == ois[1] and 'oi-cv1-v1' in ois[0] and 'oi-cv1-b' not in ois[0], 'выбор ОИ для документа не «все ТС и механизмы, без литер»: %s' % ois)
    err = pg.evaluate("async ([k]) => { try { %s.acceptScan(k, { oiId: 'oi-cv1-b' }); return ''; } catch (e) { return e.message; } }" % Q, [key])
    t.ck('крепится к объекту оценки' in err, 'ядро приняло документ к литере: %s' % err)
    doc = pg.evaluate("""async ([k]) => { const q = %s; const rec = %s; const d = q.acceptScan(k, { docType: 'Прочее' });
      const at = (rec.docs || []).includes(d) ? 'oc' : 'не у ОЦ';
      const sc = JSON.parse(JSON.stringify(d.scanned || null)); const ac = JSON.parse(JSON.stringify(d.accepted || null));
      q.editAccepted(k, { docType: 'Прочее', title: 'Справка БТИ, правка' });
      return { at, scanned: sc, accepted: ac, edits: d.edits || null }; }""" % (Q, REC), [key])
    t.ck(doc['at'] == 'oc' and doc['scanned'] and doc['scanned']['by'] == me and doc['scanned']['at'] == sc['at'], 'в документе нет, кто и когда отсканировал: %s' % doc)
    t.ck(doc['accepted'] and doc['accepted']['by'] and doc['accepted']['at'], 'в документе нет, кто и когда принял: %s' % doc)
    t.ck(doc['edits'] and doc['edits'][-1]['by'] and doc['edits'][-1]['at'] and 'название' in doc['edits'][-1]['text'], 'правка ЦОД без следа: %s' % doc)

    # Форма приёма скана ТС: в «К чему относится» — ОЦ и ТС, литеры нет, по умолчанию — ТС.
    pg.set_viewport_size({'width': 1440, 'height': 900})
    tk = pg.evaluate("async () => %s.scanQueue({ state: 'wait' }).find((x) => x.ocId === 'oc-cv-1' && x.oiId === 'oi-cv1-v1').key" % Q)
    t.open('#/scans?who=all&key=' + quote(tk, safe=''), wait='[data-sc-f-oi]')
    o = pg.evaluate("() => [...document.querySelectorAll('[data-sc-f-oi] option')].map((x) => [x.value, x.selected])")
    t.ck([v for v, _ in o] == [''] + ois[0] and dict(o).get('oi-cv1-v1'), 'в «К чему относится» не «ОЦ, ТС и механизмы» или скан ТС не к ТС по умолчанию: %s' % o)

    # --- возврат на пересъёмку ---
    rk = pg.evaluate("async ([k]) => { const q = %s; const it = q.scanQueue({}).find((x) => x.key === k); q.returnScan(k, 'нечитаемо'); return it.scanId; }" % Q, [tk])
    pg.set_viewport_size({'width': 400, 'height': 860})
    t.open(OI + 'oi-cv1-v1', wait='.om-app[data-v="oi"]')
    t.ck(t.wait_until("([id]) => !!document.querySelector('[data-scan-retake=\"' + id + '\"]')", [rk]), 'у возвращённого скана нет «Переснять»')
    t.ck('нечитаемо' in pg.locator('[data-scan-row="%s"]' % rk).inner_text(), 'не видна причина возврата')
    pg.set_input_files('[data-scan-retake="%s"]' % rk, [PNG])
    t.ck(t.wait_until("async ([id]) => !%s.find((x) => x.id === id).retake" % OWN, [rk]), 'пересъёмка не вернула скан в «Ждёт ЦОД»')

    # --- механизм (опись): тот же блок к своему ОИ ---
    mi = pg.evaluate("""async () => { const D = await import('./app/pages/osmotr/data.js'); const S = await import('./app/kernel/session.js');
      for (const o of D.myObjects(S.session.state.person)) { const i = (o.inventories || []).find((x) => x.kind === 'mech'); if (i) return [o.id, o.typeId, o.ocId, i.id, i.id.replace(/^mech:/, '')]; } return null; }""")
    if t.ck(mi, 'у осмотрщика нет механизма — блок описи не проверен'):
        pg.evaluate("async ([t, o, oi]) => { %s.addResultScan(t, o, [new File([new Uint8Array([1])], 'м.png', { type: 'image/png' })], { title: 'Паспорт механизма', oiId: oi, by: 'Проверка' }); }" % R, [mi[1], mi[2], mi[4]])
        t.open('#/osmotr?v=inv&id=' + quote(mi[0], safe='') + '&inv=' + quote(mi[3], safe=''), wait='.om-app[data-v="inv"]')
        t.ck(t.wait_until("() => document.querySelector('#om-scans')?.textContent.includes('Паспорт механизма')"), 'в описи механизма нет «Документы на месте» со сканом механизма')

    # --- ответ по строке запроса с ЕНИ ТС — по умолчанию к ТС ---
    cad = pg.evaluate("""async () => { const rec = %s; const ts = rec.oi.find((o) => o.id === 'oi-cv1-v1'); if (!ts.eni) ts.eni = '9-99-99-9999-0001';
      const K = await import('./app/kernel/inspections.js'); const q = %s;
      const r = K.createCadRequest({ kind: 'site', person: '', rows: [{ typeId: 'civil', ocId: 'oc-cv-1', eni: ts.eni, doc: 'Техпаспорт ТС' }] });
      const row = r.rows[0];
      await K.answerCadRow(r.id, row.id, { result: 'got', file: new File([new Uint8Array([137, 80, 78, 71])], 'ts.png', { type: 'image/png' }), onSite: true });
      const it = q.scanQueue({}).find((x) => x.key === 'cad|' + r.id + '|' + row.id); return it ? it.oiId : 'нет в очереди'; }""" % (REC, Q))
    t.ck(cad == 'oi-cv1-v1', 'ответ по ЕНИ ТС по умолчанию не к ТС: %s' % cad)
