# -*- coding: utf-8 -*-
"""«Запросить документы»: ЦОД составляет, регионал проверяет, осмотрщик сканирует, ЦОД принимает.

Пользователь 23.11.2026 (запись графа zapros-dokumentov-na-osmotr-cod-sostavlyaet-regional-podtverzhdaet-osm):
«ЦОД заполняет, какие документы нужны (можно подхватывать по умолчанию те, что заведены как нет в системе),
Регионал валидирует (подтверждает) и оно улетает на осмотр с запросом. Осмотрщик сканирует и потом это улетает в
ЦОД…»; «Регионал может и править и менять и отклонять список»; «Если документа нет на месте оставляет
неприкрепленным. Просто спрашиваем при окончании осмотра, найдены ли эти документы»; принятый скан — «Привязать
само»; «наполни макет демоданными».

Что ловит сценарий:
  * нет демо-запросов в трёх состояниях; у подтверждённого нет запроса «Документы на месте» на объект;
  * в карточке нет блока «Запросить документы»; по умолчанию нет строк «Не подтверждён документом» или есть уже
    запрошенные; пустой запрос уходит; отправленный не встаёт «На проверке»;
  * у регионала на «Сегодня» нет запроса на проверке; правка, удаление и добавление строки не доходят до запроса;
    отказ без причины проходит; подтверждение не создаёт запрос «Документы на месте» со строками и участником;
  * у осмотрщика блок называется не «Запросить документы»; «Нет на месте» в счёте;
  * при окончании осмотра нет вопроса «Найдены ли документы по запросу?»; «Прикрепить» не ведёт к блоку;
    «Документов нет» не ставит «Нет на месте»;
  * принятый ЦОД скан не привязан к собственнику вместо строки «Не подтверждён документом», без реквизитов;
  * ошибки консоли.
"""
from urllib.parse import quote

NAME = 'запросить документы: ЦОД → регионал → осмотрщик → ЦОД'

TOUCHES = ('app/kernel/docRequests.js', 'app/kernel/partyDocs.js', 'app/kernel/scanQueue.js', 'app/kernel/inspections.js',
           'app/pages/osmotr/osmotr.js', 'app/pages/inspections/inspections.js', 'app/kernel/ocParts.css')

DQ = "(await import('./app/kernel/docRequests.js'))"
K = "(await import('./app/kernel/inspections.js'))"
REC = "(await import('./app/kernel/registry.js')).getType('civil').records.loadRecord"


def run(t):
    pg = t.page
    pg.set_viewport_size({'width': 1440, 'height': 900})
    t.open('#/oc/civil/oc-cv-1', wait='[data-oc-head]')

    # --- демо ---
    demo = pg.evaluate("async () => %s.allDocRequests().map((r) => ({ id: r.id, ocId: r.ocId, state: r.state, cad: r.cadId || '' }))" % DQ)
    states = sorted(d['state'] for d in demo if d['id'].startswith('dr-demo-'))
    t.ck(states == ['approved', 'rejected', 'review'], 'демо-запросы не в трёх состояниях: %s' % states)
    ap = next((d for d in demo if d['state'] == 'approved'), None)
    cad = pg.evaluate("async (id) => { const r = %s.cadRequest(id); return r ? { kind: r.kind, rows: r.rows.map((x) => [x.doc, !!x.party, x.result]) } : null; }" % K, ap['cad'] if ap else '')
    t.ck(cad and cad['kind'] == 'site' and len(cad['rows']) == 3 and cad['rows'][0][1], 'у подтверждённого демо нет запроса «Документы на месте» с участником: %s' % cad)

    # --- ЦОД в карточке: составить ---
    t.wait_for('[data-dq]')
    t.ck(pg.locator('[data-dq] .dq-req').count() >= 1, 'в карточке не виден подтверждённый запрос')
    pg.click('[data-dq-new]')
    t.wait_for('[data-dq-form]')
    rows0 = pg.locator('[data-dq-row]').count()
    t.ck(rows0 == 0, 'по умолчанию повторена строка, уже запрошенная в открытом запросе: %d' % rows0)
    pg.click('[data-dq-send]')
    t.ck(t.wait_until("() => !document.querySelector('[data-dq-err]').hidden"), 'пустой запрос ушёл')
    pg.click('[data-dq-add]')
    pg.fill('[data-dq-row="0"] [data-dq-k="type"]', 'Генплан')
    pg.fill('[data-dq-row="0"] [data-dq-k="note"]', 'проверка')
    pg.click('[data-dq-send]')
    t.ck(t.wait_until("async () => %s.docRequestsOf('civil', 'oc-cv-1').some((r) => r.state === 'review' && r.rows[0].type === 'Генплан')" % DQ), 'отправленный запрос не встал «На проверке»')

    # По умолчанию — строки «Не подтверждён документом».
    pg.evaluate("""async () => { const rec = %s('oc-cv-b91'); rec.owners = [{ name: 'Собственник Проверка', share: '100', docs: [],
      unconfirmed: [{ id: 'u-chk-1', type: 'Постановление', no: '7', date: '2024-01-15', issuer: '' }] }]; location.hash = '#/'; }""" % REC)
    pg.evaluate("() => { location.hash = '#/oc/civil/oc-cv-b91'; }")
    t.wait_for('[data-dq-new]')
    pg.click('[data-dq-new]')
    t.ck(t.wait_until("() => document.querySelector('[data-dq-row=\"0\"] [data-dq-k=\"type\"]')?.value === 'Постановление'"), 'по умолчанию нет строки «Не подтверждён документом»')
    pg.click('[data-dq-send]')
    t.wait_until("async () => %s.docRequestsOf('civil', 'oc-cv-b91').some((r) => r.state === 'review')" % DQ)

    # --- регионал на «Сегодня» ---
    t.open('#/inspections?s=today', wait='.ip-today-b')
    if pg.locator('.ip-slice [data-ip-mode="all"][aria-pressed="false"]').count():
        pg.click('.ip-slice [data-ip-mode="all"]')
    t.ck(t.wait_until("() => !!document.querySelector('.ip-today-b[aria-label=\"Запросы ЦОД на проверке\"] [data-ip-dq]')"), 'на «Сегодня» нет запросов ЦОД на проверке')
    rid = pg.evaluate("async () => %s.docRequestsOf('civil', 'oc-cv-b91').find((r) => r.state === 'review').id" % DQ)
    li = '[data-ip-dq="%s"]' % rid
    pg.fill(li + ' [data-ip-dq-row="0"] [data-ip-dq-k="no"]', '7-а')
    pg.dispatch_event(li + ' [data-ip-dq-row="0"] [data-ip-dq-k="no"]', 'change')
    t.ck(t.wait_until("async (id) => %s.docRequest(id).rows[0].no === '7-а'" % DQ, rid), 'правка строки регионалом не дошла до запроса')
    pg.click(li + ' [data-ip-dq-add]')
    t.ck(t.wait_until("async (id) => %s.docRequest(id).rows.length === 2" % DQ, rid), '«+ документ» не добавил строку')
    pg.click(li + ' [data-ip-dq-del="1"]')
    t.ck(t.wait_until("async (id) => %s.docRequest(id).rows.length === 1" % DQ, rid), '«Убрать» не убрал строку')
    pg.click(li + ' [data-ip-dq-ok]')
    t.ck(t.wait_until("async (id) => %s.docRequest(id).state === 'approved'" % DQ, rid), '«Подтвердить» не подтвердил')
    made = pg.evaluate("async (id) => { const r = %s.docRequest(id); const c = %s.cadRequest(r.cadId); return c ? [c.kind, c.rows.length, c.rows[0].party && c.rows[0].party.uid, c.rows[0].doc] : null; }" % (DQ, K), rid)
    t.ck(made and made[0] == 'site' and made[2] == 'u-chk-1' and '№ 7-а' in made[3], 'подтверждение не создало запрос «Документы на месте»: %s' % made)
    gid = pg.evaluate("async () => %s.docRequestsOf('civil', 'oc-cv-1').find((r) => r.state === 'review').id" % DQ)
    gli = '[data-ip-dq="%s"]' % gid
    t.wait_for(gli)
    pg.click(gli + ' [data-ip-dq-no]')
    pg.click(gli + ' [data-ip-dq-refuse]')
    t.ck(t.wait_until("(s) => document.querySelector(s + ' [data-ip-dq-err]')?.textContent.length > 0", gli), 'отказ без причины прошёл')
    pg.fill(gli + ' [data-ip-dq-why]', 'генплан уже есть')
    pg.click(gli + ' [data-ip-dq-refuse]')
    t.ck(t.wait_until("async (id) => %s.docRequest(id).state === 'rejected' && %s.docRequest(id).reason === 'генплан уже есть'" % (DQ, DQ), gid), 'отказ с причиной не записан')

    # --- принятый ЦОД скан — привязка к собственнику вместо строки ---
    bound = pg.evaluate("""async () => { const k = %s; const S = await import('./app/kernel/scanQueue.js'); const dq = %s;
      const r = dq.allDocRequests().find((x) => x.id === 'dr-demo-1'); const c = k.cadRequest(r.cadId); const row = c.rows.find((x) => x.party);
      const f = new File([new Uint8Array([137, 80, 78, 71])], 'scan.png', { type: 'image/png' });
      await k.answerCadRow(c.id, row.id, { result: 'got', file: f, onSite: true });
      S.acceptScan('cad|' + c.id + '|' + row.id);
      const rec = %s(row.ocId); const o = rec.owners.find((x) => (x.docs || []).length);
      const doc = (rec.docs || []).find((d) => o && o.docs.includes('oc|' + d.id));
      return { left: rec.owners.flatMap((x) => x.unconfirmed || []).some((u) => u.id === row.party.uid), doc: doc ? [doc.type, doc.no, doc.date] : null }; }""" % (K, DQ, REC))
    t.ck(not bound['left'] and bound['doc'] and bound['doc'][0] == 'Постановление' and bound['doc'][1] == '123-т', 'принятый скан не привязан к собственнику с реквизитами: %s' % bound)

    # --- осмотрщик: блок и вопрос при окончании ---
    pg.set_viewport_size({'width': 400, 'height': 860})
    t.open('#/osmotr?v=obj&id=' + quote('civil|oc-cv-1', safe=''), wait='.om-app[data-v="obj"]')
    t.ck(t.wait_until("() => document.querySelector('#om-site .om-card-h')?.textContent.startsWith('Запросить документы')"), 'блок у осмотрщика называется не «Запросить документы»')
    t.ck(pg.locator('#om-site .om-badge-n').inner_text().strip() == '1', 'в счёте блока «Нет на месте» или принятое: %s' % pg.locator('#om-site .om-badge-n').inner_text())
    pg.click('[data-finish-ask]')
    t.ck(t.wait_until("() => document.querySelector('[data-docs-ask]')?.textContent.includes('Найдены ли документы по запросу?')"), 'при окончании нет вопроса о документах')
    t.ck('Техпаспорт' in pg.locator('[data-docs-ask]').inner_text(), 'в вопросе нет ждущего документа')
    pg.click('[data-docs-attach]')
    t.ck(t.wait_until("() => !document.querySelector('[data-docs-ask]') && !!document.querySelector('#om-site')"), '«Прикрепить» не вернуло к блоку')
    pg.click('[data-finish-ask]')
    t.wait_for('[data-docs-none]')
    pg.click('[data-docs-none]')
    t.ck(t.wait_until("async () => { const c = %s.cadRequest('cr-demo-dr-demo-1'); return c.rows[1].result === 'missing'; }" % K), '«Документов нет» не поставило «Нет на месте»')
    t.ck(t.wait_until("() => !document.querySelector('[data-docs-ask]') && !!document.querySelector('.om-ask')"), 'после «Документов нет» не продолжилось окончание осмотра')
