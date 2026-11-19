# -*- coding: utf-8 -*-
"""
Веб-страница осмотрщика, этап 3 (16.11.2026): описи — как в приложении
«Осмотр» (Inventory.kt): осмотрено — есть снимки или отметка «осмотрено
ранее»; «Нерабочее» — только после снимков; несколько позиций — в одну
карточку с общими снимками; рекомендация «Такие же в описи»; для опознания —
инв. номер, модель, тип имущества, МОЛ (пользователь 16.11.2026).

Что ловит сценарий:
  * опись в объекте не ведёт на экран описи; позиций не столько, сколько в
    описи; поиск по инв. номеру не отбирает или теряет фокус;
  * осмотрщику видны позиции списка «Вне ТЗ»; нет разбивки по спискам;
    в карточке «Место» (в описях его нет);
  * отбор по приоритету и по цене (от — до), порядок по стоимости — не те
    позиции; список сразу не по приоритету (без приоритета — в конце), «по №»
    не по номеру; в строке позиции список («Основной», «Резерв») вместо
    приоритета «П1» (пользователь 19.11.2026);
  * отбор по МОЛ и по коду учёта — не те позиции или не все значения описи; у
    единиц механизмов (МОЛ и кода нет) поля не пустые (пользователь 18.11.2026);
  * у позиции остались ручные «Найдено / Не найдено» или «Требуется ремонт»
    (16.11.2026: «заполняет только если нерабочее»);
  * в карточке нет МОЛ, модели, типа имущества, балансовой стоимости (у описи и
    у единицы механизмов; пользователь 18.11.2026);
  * выбранные позиции не собираются в одну карточку; снимок карточки не
    засчитывается всем её позициям;
  * «Нерабочее» ставится без снимков; «Отметить осмотренным» не ставит
    отметку описи;
  * «Такие же в описи», «Добавить из описи», «Убрать из карточки» не меняют
    состав карточки;
  * отметки механизмов-ОИ не доходят до значений единиц в результатах осмотра;
  * «Нет в описи» не добавляется; на 360 пикселях экраны прокручиваются вбок.
"""
import re
from urllib.parse import quote

from harness import use_cadastre_fixture

NAME = 'описи на месте (веб)'

TOUCHES = ('app/pages/osmotr/*', 'app/kernel/inventories.js', 'app/kernel/inspections.js', 'app/kernel/inspectionResults.js')

OBJS = """async () => { const d = await import('./app/pages/osmotr/data.js'); const s = (await import('./app/kernel/session.js')).session.state;
  return d.myObjects(s.person).flatMap((o) => o.inventories.map((x) => ({ obj: o.id, inv: x.id, kind: x.kind, count: x.count }))); }"""
INV = """async ([obj, inv]) => { const d = await import('./app/pages/osmotr/data.js'); const s = (await import('./app/kernel/session.js')).session.state;
  const x = d.inventoryOf(s.person, obj, inv); return x && { kind: x.kind, oiId: x.oiId || '', items: x.items.map((it) => ({ id: it.id, inv: it.inv, name: it.name, cost: it.cost, balance: it.balance, mol: it.mol, acc: it.acc, list: it.list, no: it.no, qty: it.qty, priority: String(it.priority || ''), own: it.own !== false })) }; }"""


def balance_shown(body, it):
    """Строка «Балансовая стоимость, сом» с суммой позиции (пробелы разрядов не в счёт)."""
    if not float(it.get('balance') or 0):
        return True
    digits = ''.join(ch for ch in body if not ch.isspace())
    return 'Балансоваястоимость,сом' in digits and str(int(round(float(it['balance'])))) in digits


# Список «Вне ТЗ» осмотрщику не виден (osmotr.js OUT_OF_SCOPE).
OUT_RE = re.compile(r'^вне\s*тз$', re.I)
MARK = """async ([inv, it]) => (await import('./app/kernel/inventories.js')).markOf(inv, it) || {}"""
UNIT = """async ([obj, oi, it]) => { const [t, c] = obj.split('|'); const r = (await import('./app/kernel/inspectionResults.js')).resultsOf(t, c);
  return (((r.assets[oi] || {}).u) || {})[it] || {}; }"""
FINISH = """async ([id, done]) => { const [t, c] = id.split('|'); const k = await import('./app/kernel/inspections.js');
  const s = (await import('./app/kernel/session.js')).session.state; k.finishWork(s.person, t, c, done); k.changed(); }"""
PNG = bytes.fromhex('89504e470d0a1a0a0000000d4948445200000001000000010806000000'
                    '1f15c4890000000d4944415478da63f8cfc0f01f0005000201a5c0a3d40000000049454e44ae426082')


def go(t, q, wait):
    t.page.evaluate("(q) => { location.hash = '#/osmotr?' + q; }", q)
    return t.wait_until("(w) => !!document.querySelector(w)", wait, timeout=5000)


def inv_q(obj, inv, extra=''):
    return 'v=inv&id=%s&inv=%s%s' % (quote(obj, safe=''), quote(inv, safe=''), extra)


def item_q(obj, inv, it):
    return 'v=item&id=%s&inv=%s&it=%s' % (quote(obj, safe=''), quote(inv, safe=''), quote(it, safe=''))


def run(t):
    pg = t.page
    use_cadastre_fixture(pg)
    pg.set_viewport_size({'width': 400, 'height': 860})
    t.open('#/osmotr', wait='.om-app[data-v="today"]')
    # Механизмы-ОЦ осмотрщику в демо не назначены — назначаем запись сами (её единицы — опись «механизмов»).
    pg.evaluate("""async () => { const R = await import('./app/kernel/registry.js'); const K = await import('./app/kernel/inspections.js');
      const s = (await import('./app/kernel/session.js')).session.state; const t = R.getType('mechanisms');
      const r = t && t.records.queryRecords({ filter: {}, offset: 0, limit: 50 }).rows.find((x) => x.mech && (x.mech.mechanisms || []).length);
      if (r && !K.assignmentsOf('mechanisms', r.id).some((a) => a.person === s.person)) K.assign({ typeId: 'mechanisms', ocId: r.id, person: s.person });
      K.changed(); }""")
    allinv = pg.evaluate(OBJS)
    org = next((x for x in allinv if x['kind'] == 'inv'), None)
    mech = next((x for x in allinv if x['kind'] == 'mech'), None)
    t.ck(org, 'у осмотрщика нет описи учреждения — сценарию не на чем проверить')
    t.ck(mech, 'у осмотрщика нет механизмов — сценарию не на чем проверить')
    if not org:
        return
    obj, inv = org['obj'], org['inv']
    pg.evaluate(FINISH, [obj, False])
    data = pg.evaluate(INV, [obj, inv])
    own = [it for it in data['items'] if it['own']]
    by_id = {it['id']: it for it in own}

    # --- объект → опись, поиск ---
    go(t, 'v=obj&id=' + quote(obj, safe=''), '.om-app[data-v="obj"] .om-title')
    link = pg.locator('a.om-oi-link[href*="v=inv"][href*="inv=%s"]' % quote(inv, safe=''))
    t.ck(link.count() == 1, 'в объекте нет ссылки на опись')
    link.click()
    t.ck(t.wait_until("() => !!document.querySelector('.om-app[data-v=\"inv\"] .om-invrow')"), 'опись не открылась')
    t.ck(pg.locator('.om-invrow').count() == min(len(data['items']), 200), 'позиций на экране %d, в описи %d' % (pg.locator('.om-invrow').count(), len(data['items'])))
    it0 = next(x for x in own if x['inv'])
    pg.fill('[data-invq]', it0['inv'])
    t.ck(t.wait_until("(n) => document.querySelectorAll('.om-invrow').length >= 1 && [...document.querySelectorAll('.om-invrow')].every((r) => r.textContent.includes(n))", it0['inv']),
         'поиск по инв. номеру не отобрал позицию')
    t.ck(pg.evaluate("() => document.activeElement && document.activeElement.id") == 'om-inv-q', 'поиск по описи теряет фокус')

    # --- разбивка по спискам: «Вне ТЗ» осмотрщику не видно, места (кабинета) нет ---
    out = own[-1]
    pg.evaluate("async ([inv, id]) => { const it = (await import('./app/kernel/inventories.js')).inventoryById(inv).items.find((x) => x.id === id); it.list = 'Вне ТЗ'; (await import('./app/kernel/inspections.js')).changed(); }", [inv, out['id']])
    go(t, inv_q(obj, inv), '.om-app[data-v="inv"] .om-invrow')
    t.ck(t.wait_until("(i) => ![...document.querySelectorAll('.om-invrow a.om-row-tx')].some((a) => (a.getAttribute('href') || '').includes('it=' + i))", out['id']),
         'позиция «Вне ТЗ» видна осмотрщику')
    # Шапка описи компактная: фильтры свёрнуты, первая позиция видна без прокрутки (16.11.2026: «занимает кучу места»).
    t.ck(pg.locator('.om-filters').count() == 0, 'панель фильтров раскрыта сразу')
    top = pg.evaluate("() => document.querySelector('.om-invrow').getBoundingClientRect().top")
    t.ck(top < 420, 'первая позиция описи на 400×860 ниже %d px — шапка занимает много места' % top)
    pg.locator('[data-filters]').click()
    t.wait_for('.om-filters')
    t.ck(pg.locator('.om-filters .om-seg', has_text='Вне ТЗ').count() == 0, 'в разбивке по спискам есть «Вне ТЗ»')
    t.ck(pg.locator('.om-filters .om-seg', has_text='Основной').count() == 1, 'нет разбивки по спискам')
    data['items'] = [x for x in data['items'] if x['id'] != out['id']]
    own = [x for x in own if x['id'] != out['id']]

    # --- приоритет, цена, порядок (16.11.2026: «фильтрация по приоритетам. Обязательно. Как и по цене») ---
    ROWS = "() => [...document.querySelectorAll('.om-invrow a.om-row-tx')].map((a) => new URLSearchParams(a.getAttribute('href').split('?')[1] || '').get('it') || a.dataset.sel)"
    items = {x['id']: x for x in data['items']}
    go(t, inv_q(obj, inv, '&p=1'), '.om-app[data-v="inv"] .om-filters')
    got = pg.evaluate(ROWS)
    t.ck(got and all(items[i]['priority'] == '1' for i in got) and len(got) == sum(1 for x in data['items'] if x['priority'] == '1'),
         'отбор П1 показал не те позиции (%d)' % len(got))
    t.ck(pg.locator('.om-filters .om-seg.on', has_text='П1').count() == 1, 'чип П1 не отмечен')
    t.ck('П1' in pg.locator('.om-found-n').inner_text(), 'включённый отбор П1 не виден строкой под поиском')
    go(t, inv_q(obj, inv), '.om-app[data-v="inv"] #om-inv-min')
    pg.fill('#om-inv-min', '100000')
    t.ck(t.wait_until("() => /min=100000/.test(location.hash)"), 'цена «от» не попала в адрес')
    t.wait_until("([n]) => document.querySelectorAll('.om-invrow').length === n", [sum(1 for x in data['items'] if float(x['cost'] or 0) >= 100000)])
    got = pg.evaluate(ROWS)
    want = [x['id'] for x in data['items'] if float(x['cost'] or 0) >= 100000]
    t.ck(sorted(got) == sorted(want), 'отбор по цене от 100 000: на экране %d, ожидалось %d' % (len(got), len(want)))
    t.ck(pg.evaluate("() => document.activeElement && document.activeElement.id") == 'om-inv-min', 'ввод цены теряет фокус')
    go(t, inv_q(obj, inv, '&max=20000&sort=cost'), '.om-app[data-v="inv"] .om-invrow')
    got = pg.evaluate(ROWS)
    costs = [float(items[i]['cost'] or 0) for i in got]
    t.ck(costs and max(costs) <= 20000 and costs == sorted(costs, reverse=True), 'цена «до» с порядком «по стоимости» — не тот список')
    # Сразу — по приоритету, внутри — по №; в строке — «П<n>», а не список (пользователь 19.11.2026).
    go(t, inv_q(obj, inv), '.om-app[data-v="inv"] .om-invrow')
    got = pg.evaluate(ROWS)
    key = [(int(items[i]['priority'] or 9), items[i]['no']) for i in got]
    t.ck(len({k[0] for k in key}) > 1 and key == sorted(key), 'список описи сразу не по приоритету: %s' % key[:12])
    t.ck(pg.locator('.om-found-n').count() == 0, 'порядок по приоритету считается включённым отбором')
    smalls = pg.locator('.om-invrow a.om-row-tx small').all_inner_texts()
    t.ck(all(('П' + items[i]['priority']) in sm for i, sm in zip(got, smalls) if items[i]['priority']), 'в строке позиции нет приоритета «П<n>»')
    lists_seen = {items[i]['list'] for i in got if items[i]['list']}
    t.ck(lists_seen and not any(l in sm for sm in smalls for l in lists_seen), 'в строке позиции остался список (%s)' % ', '.join(lists_seen))
    if not pg.locator('[data-invsort]').count():
        pg.locator('[data-filters]').click()
    t.wait_for('[data-invsort]')
    t.ck(pg.evaluate("() => { const s = document.querySelector('[data-invsort]'); return s.options[s.selectedIndex].text; }") == 'по приоритету', 'в «Порядке» сразу выбрано не «по приоритету»')
    go(t, inv_q(obj, inv, '&sort=no'), '.om-app[data-v="inv"] .om-invrow')
    nos = [items[i]['no'] for i in pg.evaluate(ROWS)]
    t.ck(nos == sorted(nos) and 'по №' in pg.locator('.om-found-n').inner_text(), 'порядок «по №» — не по номеру или не виден строкой')

    # --- отбор по МОЛ и коду учёта ---
    scope = [x for x in data['items'] if not OUT_RE.match(x.get('list') or '')]
    for k in ('mol', 'acc'):
        vals = sorted({x[k] for x in scope if x[k]})
        t.ck(len(vals) >= 2, 'в описи меньше двух значений «%s» — отбор не на чем проверить' % k)
        if not vals:
            continue
        go(t, inv_q(obj, inv), '.om-app[data-v="inv"] .om-invrow')
        if not pg.locator('.om-filters').count():
            pg.locator('[data-filters]').click()
        t.wait_for('#om-inv-%s' % k)
        opts = pg.locator('#om-inv-%s option' % k).evaluate_all('(o) => o.map((e) => e.value)')
        t.ck(opts == [''] + vals, 'отбор «%s»: значения %s, в описи %s' % (k, opts[1:], vals))
        v = vals[-1]
        pg.locator('#om-inv-%s' % k).select_option(value=v)
        t.ck(t.wait_until("([k, v]) => new URLSearchParams(location.hash.split('?')[1]).get(k) === v", [k, v]), 'отбор «%s» не попал в адрес' % k)
        want = sorted(x['id'] for x in scope if x[k] == v)
        t.wait_until("([n]) => document.querySelectorAll('.om-invrow').length === n", [min(len(want), 200)])
        got = sorted(pg.evaluate(ROWS))
        t.ck(got == want[:200] if len(want) <= 200 else len(got) == 200, 'отбор «%s» = %s: на экране %d, ожидалось %d' % (k, v, len(got), len(want)))
        t.ck(v in pg.locator('.om-found-n').inner_text(), 'включённый отбор «%s» не виден строкой под поиском' % k)
    if mech:
        go(t, inv_q(mech['obj'], mech['inv']), '.om-app[data-v="inv"] .om-invrow')
        if not pg.locator('.om-filters').count():
            pg.locator('[data-filters]').click()
        t.wait_for('#om-inv-mol')
        for k in ('mol', 'acc'):
            sel = pg.locator('#om-inv-%s' % k)
            t.ck(sel.is_disabled() and sel.evaluate("(e) => e.options.length === 1 && e.value === '' && e.options[0].text === ''"),
                 'у единиц механизмов поле «%s» не пустое (значений нет)' % k)

    # --- позиция: опознание, нет ручных «найдено» и «ремонта», нерабочее — после снимков, осмотрено ранее ---
    go(t, item_q(obj, inv, it0['id']), '.om-app[data-v="item"] .om-members')
    body = pg.locator('.om-scr').inner_text()
    for w in ('Модель', 'Тип имущества', 'МОЛ', 'Инв. номер'):
        t.ck(w in body, 'в карточке позиции нет «%s»' % w)
    t.ck(balance_shown(body, it0), 'в карточке позиции описи нет балансовой стоимости (%s)' % it0.get('balance'))
    t.ck('Место' not in body, 'в карточке позиции есть «Место» — в описях его нет (16.11.2026: «Не выдумывай»)')
    for w in ('Не найдено', 'Требуется ремонт', 'Причина ремонта'):
        t.ck(w not in body, 'в карточке позиции осталось «%s» (16.11.2026: «заполняет только если нерабочее»)' % w)
    t.ck(pg.locator('[data-mk-broken]').first.is_disabled(), '«Нерабочее» доступно без снимков')
    pg.locator('[data-mk-earlier]').first.click()
    t.ck(t.wait_until("async (a) => { const m = await (%s)(a); return m.state === 'seen' && m.earlier; }" % MARK, [inv, it0['id']]), '«Отметить осмотренным» не дошло до отметки описи')
    pg.locator('[data-mk-earlier]').first.click()
    t.ck(t.wait_until("async (a) => { const m = await (%s)(a); return m.state === '' && !m.earlier; }" % MARK, [inv, it0['id']]), 'отметка «осмотрено» не снялась')

    # --- две позиции — в одну карточку, снимок карточки — обеим ---
    pair = [x for x in own if x['id'] != it0['id']][:2]
    go(t, inv_q(obj, inv), '.om-app[data-v="inv"] .om-invrow')
    for x in pair:
        pg.locator('.om-check[data-sel="%s"]' % x['id']).click()
        t.wait_until("(i) => document.querySelector('.om-check[data-sel=\"' + i + '\"]').getAttribute('aria-pressed') === 'true'", x['id'])
    pg.locator('[data-sel-group]').click()
    t.ck(t.wait_until("() => /v=item/.test(location.hash) && document.querySelectorAll('.om-member').length === 2"), 'выбранные позиции не собрались в одну карточку')
    g = [pg.evaluate(MARK, [inv, x['id']]).get('group') for x in pair]
    t.ck(g[0] and g[0] == g[1], 'у позиций карточки разная группа: %s' % g)
    pg.locator('[data-mk-shoot]').first.set_input_files([{'name': 'p.png', 'mimeType': 'image/png', 'buffer': PNG}])
    t.ck(t.wait_until("() => document.querySelectorAll('.om-item .om-thumb').length === 1"), 'снимок карточки не появился')
    t.ck(all(pg.evaluate(MARK, [inv, x['id']]).get('state') == 'seen' for x in pair), 'снимок карточки не отметил осмотренными все её позиции')
    t.ck(t.wait_until("() => [...document.querySelectorAll('[data-mk-broken]')].every((b) => !b.disabled)"), 'после снимков «Нерабочее» недоступно')
    pg.locator('[data-mk-broken="%s"]' % pair[1]['id']).click()
    t.ck(t.wait_until("async (a) => (await (%s)(a)).cond === 'Нерабочее'" % MARK, [inv, pair[1]['id']]), '«Нерабочее» не дошло до отметки описи')
    t.ck(pg.evaluate(MARK, [inv, pair[0]['id']]).get('cond', '') == '', '«Нерабочее» встало и соседней позиции карточки')

    # --- «Добавить из описи» и «Убрать из карточки» ---
    lead = pair[0]['id']
    pg.locator('a.om-btn', has_text='Добавить из описи').click()
    t.ck(t.wait_until("() => /v=inv/.test(location.hash) && /to=/.test(location.hash) && !!document.querySelector('.om-selbar')"), '«Добавить из описи» не открыло опись с выбором')
    extra = next(x for x in own if x['id'] not in (it0['id'], pair[0]['id'], pair[1]['id']))
    pg.locator('.om-check[data-sel="%s"]' % extra['id']).click()
    pg.locator('[data-sel-add]').click()
    t.ck(t.wait_until("() => /v=item/.test(location.hash) && document.querySelectorAll('.om-member').length === 3"), '«Добавить из описи» не добавило позицию в карточку')
    pg.locator('[data-card-remove="%s"]' % extra['id']).click()
    t.ck(t.wait_until("() => document.querySelectorAll('.om-member').length === 2"), '«Убрать из карточки» не убрало позицию')
    t.ck(not pg.evaluate(MARK, [inv, extra['id']]).get('group'), 'у убранной позиции осталась группа')

    # --- рекомендация «Такие же в описи» ---
    def unit(x):
        return (float(x['cost'] or 0) / (x['qty'] or 1)) if x['cost'] else None
    twin = next((a for a in own if a['id'] not in (it0['id'], pair[0]['id'], pair[1]['id'], extra['id'])
                 and sum(1 for b in own if b['id'] != a['id'] and b['name'] == a['name'] and unit(b) == unit(a)) >= 1), None)
    t.ck(twin, 'в описи нет одинаковых позиций для рекомендации — нечем проверить')
    if twin:
        go(t, item_q(obj, inv, twin['id']), '.om-app[data-v="item"] .om-members')
        t.ck(t.wait_until("() => !!document.querySelector('[data-card-similar]')"), 'нет рекомендации «Такие же в описи»')
        n = int(''.join(ch for ch in pg.locator('[data-card-similar]').inner_text().split(':')[1].split('—')[0] if ch.isdigit()))
        pg.locator('[data-card-similar]').click()
        t.ck(t.wait_until("([n]) => document.querySelectorAll('.om-member').length === n", [n + 1]), '«Такие же в описи» не добавило %d позиций' % n)

    # --- отбор «Нерабочие» ---
    go(t, inv_q(obj, inv, '&f=broken'), '.om-app[data-v="inv"] .om-title')
    t.ck(pg.locator('.om-invrow').count() >= 1 and pg.locator('.om-invrow .om-chip', has_text='Нерабочее').count() == pg.locator('.om-invrow').count(),
         'отбор «Нерабочие» показал не те позиции')

    # --- «Нет в описи» ---
    go(t, inv_q(obj, inv), '.om-app[data-v="inv"] [data-extra]')
    pg.fill('[data-extra] input[name=name]', 'Принтер без бирки')
    pg.fill('[data-extra] input[name=comment]', 'кабинет 12')
    pg.locator('[data-extra] button[type=submit]').click()
    t.ck(t.wait_until("async (i) => (await import('./app/kernel/inventories.js')).extrasOf(i).some((x) => x.name === 'Принтер без бирки')", inv),
         '«Нет в описи» не добавилось')

    # --- механизмы-ОИ: значения единиц ---
    if mech:
        pg.evaluate(FINISH, [mech['obj'], False])
        md = pg.evaluate(INV, [mech['obj'], mech['inv']])
        u = next((x for x in md['items'] if float(x['balance'] or 0)), md['items'][0])
        go(t, item_q(mech['obj'], mech['inv'], u['id']), '.om-app[data-v="item"] .om-members')
        t.ck(float(u['balance'] or 0) > 0, 'у единиц механизмов в демо нет стоимости — балансовую не проверить')
        t.ck(balance_shown(pg.locator('.om-scr').inner_text(), u), 'в карточке единицы механизмов нет балансовой стоимости (%s)' % u.get('balance'))
        pg.locator('[data-mk-shoot]').first.set_input_files([{'name': 'u.png', 'mimeType': 'image/png', 'buffer': PNG}])
        t.ck(t.wait_until("async (a) => (await (%s)(a)).found === 'Найдено'" % UNIT, [mech['obj'], md['oiId'], u['id']]), 'снимок единицы механизмов не отметил её осмотренной')
        t.wait_until("() => !document.querySelector('[data-mk-broken]').disabled")
        pg.locator('[data-mk-broken]').first.click()
        t.ck(t.wait_until("async (a) => (await (%s)(a)).state === 'Нерабочее'" % UNIT, [mech['obj'], md['oiId'], u['id']]), '«Нерабочее» единицы не дошло до результатов осмотра')

    # --- ширины ---
    pg.set_viewport_size({'width': 360, 'height': 780})
    for q in (inv_q(obj, inv), item_q(obj, inv, lead)):
        go(t, q, '.om-app .om-title')
        over = pg.evaluate("() => { const s = document.querySelector('.om-scr'); return s.scrollWidth - s.clientWidth; }")
        t.ck(over <= 0, '%s на 360 px прокручивается вбок на %d px' % (q, over))
