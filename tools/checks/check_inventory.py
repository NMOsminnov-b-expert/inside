# -*- coding: utf-8 -*-
"""Описи на осмотре (этап Б; решения пользователя 27–29.10.2026: В5–В13).

Что ловит сценарий:
  * у задачи осмотрщика нет блока «Описи» с описями его назначения и ходом
    «N из M осмотрено»; чужая опись открывается по адресу;
  * поиск описи: не находит инв. номер без разделителей, с латиницей вместо
    кириллицы, слова в другом порядке, слово с одной опечаткой; теряет фокус;
  * чипы «Не осмотрено», «П1 n/m», «Нерабочие», «Не найдено» считают не то;
  * «Снять» не кладёт снимок к позиции; «Нерабочее» ставится без снимков
    (В9); «В ремонте» требует снимки (ответ 29.10.2026 — не требует);
    «Отметить осмотренным», «Не найдено», «Снять отметку» не меняют ход;
    «Нет в описи» не добавляет предмет;
  * отметка не общая: ход описи у регионала (подробности назначения) не
    совпадает с отметками осмотрщика (Б3, Б5);
  * панель назначения берёт описи не из базы описей учреждения (Б2);
  * документ на позицию не уходит в очередь «Сканы с осмотров» источником
    «опись» к оператору ЦОД подведа (В11); принятый — не документ позиции
    (В13); документы позиций и карточек не находятся поиском по всем
    документам;
  * прокрутка вбок на 390 и 1280; ошибки консоли.
"""
from urllib.parse import quote

from check_inspector_scan import png, choose

NAME = 'описи на осмотре'

TOUCHES = ('app/kernel/inventories.js', 'app/kernel/allDocs.js', 'app/pages/inspector/*', 'app/pages/inspections/*',
           'app/kernel/scanQueue.js', 'app/pages/scans/*', 'app/pages/docs/*', 'app/kernel/documentsRegistry.js')

ME = 'Осминнов Н.'
TASK = '#/insp/civil/oc-cv-1?as=' + quote(ME)


def no_hscroll(t, where):
    t.ck(t.page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'прокрутка вбок: ' + where)


def run(t):
    pg = t.page
    pg.set_viewport_size({'width': 390, 'height': 860})
    t.open(TASK, wait='.ins-body')
    t.ck(t.wait_for('.inv-task'), 'у задачи нет блока «Описи»')
    links = pg.locator('.inv-task-a')
    t.ck(links.count() >= 1, 'в блоке «Описи» нет описей назначения')
    t.ck('из' in links.first.inner_text() and 'осмотрено' in links.first.inner_text(), 'у описи нет хода «N из M осмотрено»')
    inv_id = pg.evaluate("() => decodeURIComponent(document.querySelector('.inv-task-a').getAttribute('href').split('/inv/')[1] || '')")
    data = pg.evaluate("async (id) => { const I = await import('./app/kernel/inventories.js'); const v = I.inventoryById(id); return { total: v.items.length, items: v.items.slice(0, 40) }; }", inv_id)
    links.first.click()
    t.ck(t.wait_for('.inv-list'), 'опись не открылась')
    no_hscroll(t, 'опись 390')
    t.ck(str(data['total']) in pg.inner_text('.inv-sum'), 'в сводке нет числа позиций')

    # Поиск: инв. номер без разделителей и латиницей; слова в другом порядке; опечатка.
    it = data['items'][3]
    raw = it['inv'].replace('-', '')
    lat = raw.translate(str.maketrans('АВЕКМНОРСТХ', 'ABEKMHOPCTX'))
    for q, label in ((raw, 'номер без разделителей'), (lat, 'номер латиницей')):
        pg.fill('[data-inv-q]', q)
        t.ck(t.wait_until("(n) => [...document.querySelectorAll('.inv-row .mono')].some((e) => e.textContent.trim() === n)", it['inv']),
             'поиск не нашёл %s (%s)' % (it['inv'], label))
    t.ck(pg.evaluate("() => document.activeElement && document.activeElement.hasAttribute('data-inv-q')"), 'поиск теряет фокус')
    words = it['name'].split()
    if len(words) >= 2:
        pg.fill('[data-inv-q]', ' '.join(reversed(words)))
        t.ck(t.wait_until("(n) => [...document.querySelectorAll('.inv-main b')].some((e) => e.textContent.trim() === n)", it['name']), 'слова в другом порядке не нашлись')
    long = next((w for w in it['name'].split() if len(w) >= 6), None)
    if long:
        typo = long[:2] + long[3:]
        pg.fill('[data-inv-q]', typo)
        t.ck(t.wait_until("() => document.querySelectorAll('.inv-row').length > 0"), 'опечатка «%s» не прощена' % typo)
    pg.fill('[data-inv-q]', '')
    t.wait_until("(n) => document.querySelectorAll('.inv-row').length === Math.min(n, 60)", data['total'])

    # Позиция: «Нерабочее» без снимков — нельзя; «В ремонте» — можно; снимок, отметки.
    first = data['items'][0]['id']
    second = data['items'][1]['id']
    pg.click('[data-inv-open="%s"]' % first)
    pg.select_option('[data-inv-cond="%s"]' % first, 'Нерабочее')
    t.ck(t.wait_until("() => /только при снимках/.test(document.body.innerText)"), '«Нерабочее» без снимков не остановлено')
    t.ck(pg.input_value('[data-inv-cond="%s"]' % first) != 'Нерабочее', '«Нерабочее» без снимков осталось выбранным')
    pg.select_option('[data-inv-cond="%s"]' % first, 'В ремонте')
    t.ck(t.wait_until("([i, f]) => import('./app/kernel/inventories.js').then((I) => (I.markOf(i, f) || {}).cond === 'В ремонте')", [inv_id, first]),
         '«В ремонте» без снимков не принято')
    choose(pg, '.inv-item [data-inv-shoot="%s"]' % first, [{'name': 'a.png', 'mimeType': 'image/png', 'buffer': png(120, 90)}])
    t.ck(t.wait_until("([i, f]) => import('./app/kernel/inventories.js').then((I) => ((I.markOf(i, f) || {}).photos || []).length === 1)", [inv_id, first]),
         'снимок не лёг к позиции')
    pg.select_option('[data-inv-cond="%s"]' % first, 'Нерабочее')
    t.ck(t.wait_until("([i, f]) => import('./app/kernel/inventories.js').then((I) => (I.markOf(i, f) || {}).cond === 'Нерабочее')", [inv_id, first]),
         '«Нерабочее» со снимком не принято')
    pg.click('[data-inv-open="%s"]' % second)
    pg.click('[data-inv-missing="%s"]' % second)
    pr = pg.evaluate("async (i) => (await import('./app/kernel/inventories.js')).progressOf(i)", inv_id)
    t.ck(pr['seen'] == 1 and pr['missing'] == 1 and pr['broken'] == 1, 'ход описи не тот: %s' % pr)
    t.ck(t.wait_until("() => /2.*из/.test(document.querySelector('.inv-sum-main').textContent)"), 'сводка не показала «2 из …»')
    cnt = lambda k: int(pg.locator('[data-inv-chip="%s"] b' % k).inner_text().split('/')[0])
    t.ck(cnt('broken') == 1 and cnt('missing') == 1 and cnt('todo') == data['total'] - 2, 'чипы считают не то')
    pg.click('[data-inv-chip="missing"]')
    t.ck(t.wait_until("() => document.querySelectorAll('.inv-row').length === 1"), 'отбор «Не найдено» не на одну позицию')
    pg.click('[data-inv-chip="all"]')
    if not pg.locator('[data-inv-unmark="%s"]' % second).count():
        pg.click('[data-inv-open="%s"]' % second)
    pg.click('[data-inv-unmark="%s"]' % second)
    pr = pg.evaluate("async (i) => (await import('./app/kernel/inventories.js')).progressOf(i)", inv_id)
    t.ck(pr['missing'] == 0, '«Снять отметку» не сняла «Не найдено»')

    # «Нет в описи».
    pg.click('[data-inv-extra]')
    pg.fill('[data-inv-x-name]', 'Холодильник Атлант')
    pg.click('[data-inv-extra-form] button[type="submit"]')
    t.ck(t.wait_until("(i) => import('./app/kernel/inventories.js').then((I) => I.extrasOf(i).some((x) => x.name === 'Холодильник Атлант'))", inv_id),
         '«Нет в описи» не добавило предмет')

    # Документ на позицию → очередь ЦОД (источник «опись») → документ позиции.
    if not pg.locator('[data-inv-doc="%s"]' % first).count():
        pg.click('[data-inv-open="%s"]' % first)
    choose(pg, '[data-inv-doc="%s"]' % first, [{'name': 'Паспорт станка.png', 'mimeType': 'image/png', 'buffer': png(200, 280)}])
    t.ck(t.wait_for('.modal.vattach'), 'документ на позицию не через окно прикрепления')
    pg.fill('[data-att-name="0"]', 'Паспорт станка')
    pg.click('[data-att-ok]')
    q = """async ([i, f]) => { const Q = await import('./app/kernel/scanQueue.js');
      return Q.scanQueue({ source: 'опись' }).filter((x) => x.inv && x.inv.invId === i && x.inv.itemId === f)
        .map((x) => ({ key: x.key, title: x.title, cod: x.cod, state: x.state })); }"""
    t.ck(t.wait_until("([i, f]) => import('./app/kernel/scanQueue.js').then((Q) => Q.scanQueue({ source: 'опись' }).some((x) => x.inv && x.inv.itemId === f))", [inv_id, first], 9000),
         'документ на позицию не в очереди источником «опись»')
    items = pg.evaluate(q, [inv_id, first])
    t.ck(items and items[0]['title'] == 'Паспорт станка' and items[0]['state'] == 'wait', 'в очереди не тот скан: %s' % items)
    cod = pg.evaluate("""async (i) => { const I = await import('./app/kernel/inventories.js'); const N = await import('./app/kernel/institutions.js');
      const v = I.inventoryById(i); const n = N.allNodes().find((x) => x.name === (v.podved || v.institution)); const s = n ? N.staffOf(n).cod : null; return s ? s.name : ''; }""", inv_id)
    if cod:
        t.ck(items[0]['cod'] == cod, 'скан по описи не у оператора ЦОД подведа: %s / %s' % (items[0]['cod'], cod))
    doc = pg.evaluate("async (k) => (await import('./app/kernel/scanQueue.js')).acceptScan(k, { docType: 'Прочее' })", items[0]['key'])
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
