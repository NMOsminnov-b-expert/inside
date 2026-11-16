"""Описи на осмотре (этап Б; решения пользователя 27–29.10.2026: В5–В13).

Отметки по описи ставит приложение «Осмотр» через мост (файлы папки описи →
kernel/inventories.js markItem, addItemPhoto; акты — сканы описи), это ловит
check_osmotr_bridge.py. Прежний экран осмотрщика #/insp с описью (поиск, чипы,
отметки, «Нет в описи», документ на позицию) убран 16.11.2026; здесь отметки
и документ кладутся теми же функциями ядра, что вызывает мост.

Что ловит сценарий:
  * ход описи (progressOf) не сходится с отметками: «Нерабочее», «Не найдено»,
    снятие отметки;
  * отметка не общая: ход описи у регионала (подробности назначения) не
    совпадает с отметками осмотрщика (Б3, Б5);
  * панель назначения берёт описи не из базы описей учреждения (Б2);
  * документ на позицию не уходит в очередь «Сканы с осмотров» источником
    «опись» к оператору ЦОД подведа (В11); принятый — не документ позиции
    (В13); документы позиций и карточек не находятся поиском по всем
    документам;
  * отчёт по описи: листы, итог, «Нет в описи»; прокрутка вбок на 1280.
"""
from urllib.parse import quote


NAME = 'описи на осмотре'

TOUCHES = ('app/kernel/inventories.js', 'app/kernel/allDocs.js', 'app/pages/osmotr/bridge.js', 'app/pages/inspections/*',
           'app/kernel/scanQueue.js', 'app/pages/scans/*', 'app/pages/docs/*', 'app/kernel/documentsRegistry.js')

ME = 'Осминнов Н.'


def no_hscroll(t, where):
    t.ck(t.page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'прокрутка вбок: ' + where)


def run(t):
    pg = t.page
    t.open('#/inspections', wait='.ip-page')
    # Опись назначения осмотрщика на oc-cv-1 (демо).
    inv_id = pg.evaluate("""async (me) => { const k = await import('./app/kernel/inspections.js');
      const a = k.allAssignments().find((x) => x.person === me && x.typeId === 'civil' && x.ocId === 'oc-cv-1' && (x.inventories || []).length);
      return a ? a.inventories[0] : ''; }""", ME)
    if not t.ck(bool(inv_id), 'у демо-назначения на oc-cv-1 нет описи'):
        return
    data = pg.evaluate("async (id) => { const I = await import('./app/kernel/inventories.js'); const v = I.inventoryById(id); return { total: v.items.length, items: v.items.slice(0, 40) }; }", inv_id)
    first = data['items'][0]['id']
    second = data['items'][1]['id']
    I = "await import('./app/kernel/inventories.js')"

    # Отметки — как их ставит мост: «Нерабочее» со снимком, «Не найдено», снятие.
    pg.evaluate("""async ([i, f, me]) => { const I = %s;
      I.addItemPhoto(i, f, new File([new Uint8Array([137, 80, 78, 71])], 'a.png', { type: 'image/png' }), { by: me });
      I.markItem(i, f, { state: 'seen', cond: 'Нерабочее' }, { by: me }); }""" % I, [inv_id, first, ME])
    pg.evaluate("async ([i, s, me]) => (%s).markItem(i, s, { state: 'missing' }, { by: me })" % I, [inv_id, second, ME])
    pr = pg.evaluate("async (i) => (%s).progressOf(i)" % I, inv_id)
    t.ck(pr['seen'] == 1 and pr['missing'] == 1 and pr['broken'] == 1, 'ход описи не тот: %s' % pr)
    pg.evaluate("async ([i, s]) => (%s).unmarkItem(i, s)" % I, [inv_id, second])
    pr = pg.evaluate("async (i) => (%s).progressOf(i)" % I, inv_id)
    t.ck(pr['missing'] == 0, 'снятие отметки не сняло «Не найдено»')
    pg.evaluate("async ([i, me]) => (%s).addExtra(i, { name: 'Холодильник Атлант' }, { by: me })" % I, [inv_id, ME])

    # Документ на позицию — скан описи (как акт из приложения) → очередь ЦОД → документ позиции.
    pg.evaluate("""async ([i, f, me]) => { const R = await import('./app/kernel/inspectionResults.js');
      R.addResultScan('civil', 'oc-cv-1', [new File([new Uint8Array([137, 80, 78, 71])], 'Паспорт станка.png', { type: 'image/png' })],
        { title: 'Паспорт станка', by: me, inv: { invId: i, itemIds: [f] } }); R.saveResults(); }""", [inv_id, first, ME])
    q = """async ([i, f]) => { const Q = await import('./app/kernel/scanQueue.js');
      return Q.scanQueue({ source: 'опись' }).filter((x) => x.inv && x.inv.invId === i && (x.inv.itemIds || [x.inv.itemId]).includes(f))
        .map((x) => ({ key: x.key, title: x.title, cod: x.cod, state: x.state })); }"""
    t.ck(t.wait_until("async ([i, f]) => { const Q = await import('./app/kernel/scanQueue.js'); return Q.scanQueue({ source: 'опись' }).some((x) => x.inv && (x.inv.itemIds || [x.inv.itemId]).includes(f)); }", [inv_id, first], 9000),
         'документ на позицию не в очереди источником «опись»')
    items = pg.evaluate(q, [inv_id, first])
    t.ck(items and items[0]['title'] == 'Паспорт станка' and items[0]['state'] == 'wait', 'в очереди не тот скан: %s' % items)
    cod = pg.evaluate("""async (i) => { const I = await import('./app/kernel/inventories.js'); const N = await import('./app/kernel/institutions.js');
      const v = I.inventoryById(i); const n = N.allNodes().find((x) => x.name === (v.podved || v.institution)); const s = n ? N.staffOf(n).cod : null; return s ? s.name : ''; }""", inv_id)
    if cod and items:
        t.ck(items[0]['cod'] == cod, 'скан по описи не у оператора ЦОД подведа: %s / %s' % (items[0]['cod'], cod))
    if items:
        pg.evaluate("async (k) => (await import('./app/kernel/scanQueue.js')).acceptScan(k, { docType: 'Прочее' })", items[0]['key'])
    docs = pg.evaluate("async ([i, f]) => (await import('./app/kernel/inventories.js')).itemDocsOf(i, f).map((d) => d.name)", [inv_id, first])
    t.ck('Паспорт станка' in docs, 'принятый скан не стал документом позиции: %s' % docs)

    pg.set_viewport_size({'width': 1280, 'height': 900})
    no_hscroll(t, 'опись 1280')

    # Поиск по всем документам: документ позиции и документ карточки.
    t.open('#/docs', wait='[data-docs-source]')
    pg.fill('[data-docs-q]', 'Паспорт станка')
    t.ck(t.wait_until("() => [...document.querySelectorAll('tbody tr')].some((r) => /Опись:/.test(r.textContent))"), 'документ позиции не нашёлся в «Документах»')
    pg.fill('[data-docs-q]', 'Паспорт котла')
    t.ck(t.wait_until("() => !!document.querySelector('tbody tr[data-doc-href]')"), 'документ карточки не нашёлся в «Документах»')
    pg.select_option('[data-docs-source]', 'registry')
    t.ck(t.wait_until("() => !document.querySelector('tbody tr[data-doc-href]')"), 'отбор «Реестр документов» показывает документы карточек')
    pg.select_option('[data-docs-source]', '')

    # Регионал: панель назначения — описи из базы; подробности — ход описи.
    aid = pg.evaluate("""async (i) => { const k = await import('./app/kernel/inspections.js');
      const a = k.allAssignments().find((x) => (x.inventories || []).includes(i)); return a ? a.id : ''; }""", inv_id)
    t.ck(bool(aid), 'нет назначения с описью')
    cont = pg.evaluate("async () => (await import('./app/pages/inspections/model.js')).objectContents('civil', 'oc-cv-1').inventories.map((x) => x.id)")
    t.ck(inv_id in cont, 'панель назначения берёт описи не из базы описей учреждения: %s' % cont)
    t.open('#/inspections?s=assign&t=assigned&ap=' + quote(ME), wait='.ip-page')
    pg.evaluate("(id) => { const el = document.querySelector(`[data-ip-dp-open=\"assign:${id}\"]`); if (el) el.click(); }", aid)
    if not pg.locator('.ip-detail-pane, .ip-dp').count():
        t.open('#/inspections?s=people&p=%s&t=assigns' % quote(ME), wait='.ip-page')
        pg.locator('[data-ip-dp-open="assign:%s"]' % aid).first.click()
    t.ck(t.wait_until("() => /осмотрено\\s*1\\s*из/.test(document.body.innerText)"), 'в подробностях назначения нет хода описи «осмотрено 1 из …»')

    # Отчёт по описи (Б5): листы как в «Осмотре», итог сходится с отметками, кнопка выгружает.
    sheets = pg.evaluate("async (i) => (await import('./app/kernel/inventories.js')).inventoryReportSheets(i).map((s) => ({ name: s.name, rows: s.rows }))", inv_id)
    names = [x['name'] for x in sheets]
    t.ck(names[0] == 'Итог' and names[-2:] == ['По дням', 'Нет в описи'] and 'Основной' in names, 'листы отчёта не те: %s' % names)
    tot = sheets[0]['rows'][-1]
    t.ck(tot[0] == 'Всего' and tot[2] == data['total'] and tot[3] == 1, 'итог отчёта не сходится с отметками: %s' % tot)
    ex = pg.evaluate("async (i) => (await import('./app/kernel/inventories.js')).extrasOf(i)", inv_id)
    t.ck(any(r[0] == 'Холодильник Атлант' for r in sheets[-1]['rows']), 'в «Нет в описи» нет добавленного предмета: %s / %s' % (sheets[-1]['rows'], ex))
    btn = pg.locator('[data-ip-inv-report="%s"]' % inv_id)
    if btn.count():
        with pg.expect_download() as dl:
            btn.first.click()
        t.ck(dl.value.suggested_filename.endswith('.xlsx'), 'кнопка отчёта не отдала xlsx')
    else:
        t.ck(False, 'в подробностях назначения нет кнопки «Отчёт по описи»')
