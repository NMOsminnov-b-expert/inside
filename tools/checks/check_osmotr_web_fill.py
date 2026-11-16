# -*- coding: utf-8 -*-
"""
Веб-страница осмотрщика, этап 2 (16.11.2026): осмотр объекта имущества на
месте — экран ОИ (разделы) и экран раздела (поля). Поля — схема осмотра макета
(pages/inspection/form.js, sections), значения — в «Результаты осмотра».

Что ловит сценарий:
  * строка «Состава объекта» не ведёт в осмотр ОИ (механизмы — описью, этап 3, здесь не проверяются);
  * у какого-то вида ОИ (строение нежилое, производственное, жилое; квартира;
    участок; ТС) разделов или полей на экране не столько,
    сколько в схеме осмотра;
  * выбор из списка, ввод числа, отметка в мультивыборе не доходят до
    «Результатов осмотра»; ввод сбивает фокус; нет строки «Сохранено»;
  * первая правка не переводит назначение «в работу»;
  * выбор типа объекта имущества не открывает поля своего типа (назначение
    по факту);
  * обязательные поля участка (сети) не считаются в «обязательных осталось»;
  * снимок не встаёт в выбранную категорию, не переносится, не удаляется;
  * выявленное на месте строение не добавляется, не открывается своей формой
    осмотра, не убирается;
  * комментарий осмотрщика — отдельным разделом, а не полем на экране ОИ;
  * у законченного осмотра поля правятся;
  * на 360 пикселях экран ОИ или раздела прокручивается вбок.
"""
from urllib.parse import quote

from harness import use_cadastre_fixture

NAME = 'осмотр ОИ на месте (веб)'

TOUCHES = (
    'app/pages/osmotr/*', 'app/pages/inspection/form.js', 'app/kernel/geoHere.js', 'app/pages/inspection/tasks.js', 'app/kernel/fieldSchema.js',
    'app/kernel/inspections.js', 'app/kernel/inspectionResults.js', 'app/kernel/registry.js',
)

# Все ОИ осмотрщика: вид, разделы и число видимых полей по схеме осмотра.
OIS = """async () => {
  const d = await import('./app/pages/osmotr/data.js'); const s = (await import('./app/kernel/session.js')).session.state;
  const f = await import('./app/pages/inspection/form.js'); const tk = await import('./app/pages/inspection/tasks.js');
  const r = await import('./app/kernel/inspectionResults.js');
  return d.myObjects(s.person).flatMap((o) => o.ois.map((x) => {
    const rec = tk.loadTask(o.typeId, o.ocId); const oi = tk.ownOis(rec).find((y) => y.id === x.id);
    f.setNetsRec(rec);
    const vals = (r.resultsOf(o.typeId, o.ocId).assets || {})[x.id] || {};
    const secs = f.sections(o.typeId, oi).filter((z) => z.fields.length && z.key !== 'comments')
      .map((z) => ({ key: z.key, n: z.fields.filter((q) => !q.visible || q.visible(vals)).length }));
    const kind = oi.card === 'building' ? (oi.residential ? 'жилое' : oi.litKind === 'prod' ? 'производственное' : 'нежилое') : oi.card;
    return { obj: o.id, oi: x.id, kind, state: o.state, secs };
  }));
}"""
VAL = """async ([id, oi, key]) => { const [t, c] = id.split('|'); const r = (await import('./app/kernel/inspectionResults.js')).resultsOf(t, c);
  const v = (r.assets[oi] || {}); const x = key.split('.').reduce((o, k) => (o == null ? o : o[k]), v); return x === undefined ? null : x; }"""
FINISH = """async ([id, done]) => { const [t, c] = id.split('|'); const k = await import('./app/kernel/inspections.js');
  const s = (await import('./app/kernel/session.js')).session.state; k.finishWork(s.person, t, c, done); k.changed(); }"""
STATE = """async (id) => { const d = await import('./app/pages/osmotr/data.js'); const s = (await import('./app/kernel/session.js')).session.state;
  return (d.myObjects(s.person).find((o) => o.id === id) || {}).state; }"""
SAVED = "() => /^Сохранено \\d\\d:\\d\\d$/.test(document.querySelector('.om-saved')?.textContent || '')"


def go(t, q, wait):
    t.page.evaluate("(q) => { location.hash = '#/osmotr?' + q; }", q)
    return t.wait_until("(w) => !!document.querySelector(w)", wait, timeout=5000)


def qs(obj, oi, sec=''):
    q = 'v=%s&id=%s&oi=%s' % ('sec' if sec else 'oi', quote(obj, safe=''), quote(oi, safe=''))
    return q + ('&s=' + sec if sec else '')


def run(t):
    pg = t.page
    use_cadastre_fixture(pg)
    pg.set_viewport_size({'width': 400, 'height': 860})
    t.open('#/osmotr', wait='.om-app[data-v="today"]')
    kinds = {}
    for x in pg.evaluate(OIS):
        kinds.setdefault(x['kind'], x)
    print('виды ОИ у осмотрщика:', ', '.join(sorted(kinds)))
    for need in ('нежилое', 'производственное', 'жилое', 'apartment', 'land', 'vehicle'):
        t.ck(need in kinds, 'у осмотрщика нет ОИ вида «%s» — сценарию не на чем проверить' % need)
    # Не покрыто: механизмы и оборудование в составе объекта не показываются — их осматривают описью
    # (отметки позиций, как в приложении «Осмотр»); экран описи — этап 3 переноса.

    # --- состав объекта ведёт в осмотр ОИ ---
    b = kinds['нежилое']
    obj, oi = b['obj'], b['oi']
    pg.evaluate(FINISH, [obj, False])
    go(t, 'v=obj&id=' + quote(obj, safe=''), '.om-app[data-v="obj"] .om-title')
    link = pg.locator('a.om-oi-link[href*="oi=%s"]' % quote(oi, safe=''))
    t.ck(link.count() == 1, 'в составе объекта нет строки-ссылки на ОИ %s' % oi)
    if link.count():
        link.click()
        t.ck(t.wait_until("() => !!document.querySelector('.om-app[data-v=\"oi\"] .om-secrow')"), 'строка состава не открыла осмотр ОИ')

    # --- у каждого вида ОИ разделы и поля — как в схеме осмотра ---
    for kind, x in sorted(kinds.items()):
        t.ck(go(t, qs(x['obj'], x['oi']), '.om-app[data-v="oi"] .om-title'), '%s: экран ОИ не открылся' % kind)
        n = pg.locator('.om-secrow').count()
        t.ck(n == len(x['secs']), '%s: разделов на экране %d, в схеме %d' % (kind, n, len(x['secs'])))
        for s in x['secs']:
            ok = go(t, qs(x['obj'], x['oi'], s['key']), '.om-app[data-v="sec"] .om-form')
            got = pg.locator('.om-field').count() if ok else -1
            t.ck(got == s['n'], '%s, раздел %s: полей на экране %d, в схеме %d' % (kind, s['key'], got, s['n']))

    # --- правка полей строения: список, число, тип объекта, мультивыбор ---
    go(t, qs(obj, oi, 'general'), '.om-app[data-v="sec"] .om-form')
    sel = pg.locator('select[data-f="buildType"]')
    opt = sel.locator('option').nth(1).inner_text().strip()
    sel.select_option(label=opt)
    t.ck(t.wait_until(SAVED), 'после правки нет строки «Сохранено»')
    t.ck(pg.evaluate(VAL, [obj, oi, 'buildType']) == opt, 'выбор «Расположение строения» не дошёл до результатов осмотра')
    t.ck(t.wait_until("async (id) => (await (%s)(id)) === 'progress'" % STATE, obj), 'первая правка не перевела назначение «в работу»')
    inp = pg.locator('input[data-f="floorsN"]')
    inp.click()
    inp.press_sequentially('3')
    pg.wait_for_timeout(450)  # перерисовка по событию назначения приходит через 300 мс — ввод не должен сбиться
    inp.press_sequentially('2')
    t.ck(pg.evaluate("() => document.activeElement && document.activeElement.dataset.f") == 'floorsN', 'ввод числа сбивает фокус')
    t.ck(str(pg.evaluate(VAL, [obj, oi, 'floorsN'])) == '32', 'этажность не сохранилась: %s' % pg.evaluate(VAL, [obj, oi, 'floorsN']))

    go(t, qs(obj, oi, 'capclass'), '.om-app[data-v="sec"] .om-form')
    kind_sel = pg.locator('select[data-f="litKind"]')
    t.ck(kind_sel.count() == 1, 'в «Тип и класс капитальности» нет поля «Тип объекта имущества»')
    if kind_sel.count():
        cur = kind_sel.evaluate('(e) => e.value')
        labels = [o.strip() for o in kind_sel.locator('option').all_inner_texts()]
        other = next((lb for lb in labels[1:] if lb != cur), None)
        kind_sel.select_option(label=other)
        t.ck(t.wait_until("() => [...document.querySelectorAll('.om-flabel')].some((l) => l.textContent.startsWith('Назначение по факту'))"),
             'выбор типа объекта имущества не открыл «Назначение по факту»')

    go(t, qs(obj, oi, 'nets'), '.om-app[data-v="sec"] .om-form')
    opt_btn = pg.locator('.om-ms .om-opt').first
    key = opt_btn.get_attribute('data-ms')
    word = opt_btn.get_attribute('data-opt')
    opt_btn.click()
    t.ck(t.wait_until("(w) => [...document.querySelectorAll('.om-ms .om-opt')].some((b) => b.dataset.opt === w && b.getAttribute('aria-pressed') === 'true')", word),
         'отметка в мультивыборе не встала')
    t.ck(pg.evaluate(VAL, [obj, oi, key]) == [word], 'мультивыбор не сохранился: %s' % pg.evaluate(VAL, [obj, oi, key]))

    # --- комментарий — прямо на экране ОИ, без отдельного раздела (16.11.2026) ---
    go(t, qs(obj, oi), '.om-app[data-v="oi"] .om-note-card')
    t.ck(pg.locator('.om-secrow', has_text='Комментарии').count() == 0, 'комментарий остался отдельным разделом')
    note = pg.locator('.om-note-card textarea[data-f="note"]')
    note.fill('')
    note.press_sequentially('Ворота с торца')
    t.ck(t.wait_until("async ([id, oi]) => (await (%s)([id, oi, 'note'])) === 'Ворота с торца'" % VAL, [obj, oi]), 'комментарий на экране ОИ не сохранился')
    t.ck(pg.evaluate("() => document.activeElement && document.activeElement.dataset.f") == 'note', 'ввод комментария сбивает фокус')

    # --- фото ОИ: съёмка в выбранную категорию, перенос в другую, удаление ---
    PHOTOS = """async ([id, oi]) => { const [t, c] = id.split('|'); return (await import('./app/kernel/inspectionResults.js')).resultsOf(t, c).photos
      .filter((p) => p.oiId === oi && !p.deleted).map((p) => ({ id: p.id, cat: p.cat })); }"""
    n0 = len(pg.evaluate(PHOTOS, [obj, oi]))
    go(t, qs(obj, oi) + '&tab=photo&cat=' + quote('Кровля'), '.om-app[data-v="oi"] .om-shoot')
    th0 = pg.locator('.om-thumb').count()
    png = bytes.fromhex('89504e470d0a1a0a0000000d4948445200000001000000010806000000'
                        '1f15c4890000000d4944415478da63f8cfc0f01f0005000201a5c0a3d40000000049454e44ae426082')
    pg.locator('[data-shoot]').first.set_input_files([{'name': 'a.png', 'mimeType': 'image/png', 'buffer': png},
                                                      {'name': 'b.png', 'mimeType': 'image/png', 'buffer': png}])
    ok = t.wait_until("([n]) => document.querySelectorAll('.om-thumb').length === n", [th0 + 2])
    t.ck(ok, 'снятые снимки не появились у ОИ')
    ph = pg.evaluate(PHOTOS, [obj, oi])
    t.ck(len(ph) == n0 + 2 and all(p['cat'] == 'Кровля' for p in ph[-2:]), 'снимки не в выбранной категории «Кровля»: %s' % ph[-2:])
    t.ck(pg.locator('.om-objtabs .om-btab.on', has_text='Фото').count() == 1, 'вкладка «Фото» не отмечена')
    go(t, 'v=ph&id=%s&oi=%s&ph=%s' % (quote(obj, safe=''), quote(oi, safe=''), ph[-1]['id']), '.om-app[data-v="ph"] .om-photo')
    pg.locator('[data-ph-cat]').select_option(label='Фасад')
    t.ck(t.wait_until("async ([id, oi, ph]) => (await (%s)([id, oi])).some((p) => p.id === ph && p.cat === 'Фасад')" % PHOTOS, [obj, oi, ph[-1]['id']]),
         'перенос снимка в другую категорию не сохранился')
    pg.locator('[data-ph-del]').click()
    t.ck(t.wait_until("() => /v=oi/.test(location.hash) && /tab=photo/.test(location.hash)"), 'после удаления снимка не вернулись к фото ОИ')
    t.ck(len(pg.evaluate(PHOTOS, [obj, oi])) == n0 + 1, 'снимок не удалился')

    # --- обязательные поля участка ---
    land = kinds['land']
    pg.evaluate(FINISH, [land['obj'], False])
    go(t, qs(land['obj'], land['oi']), '.om-app[data-v="oi"] .om-title')
    t.ck(pg.locator('.om-secrow', has_text='Инженерные сети').locator('.om-prog-req').count() == 1, 'у сетей участка не видно «обязательных осталось»')
    go(t, qs(land['obj'], land['oi'], 'nets'), '.om-app[data-v="sec"] .om-form')
    for k in ('electricity', 'centralWater', 'sewerage', 'gasification'):
        pg.locator('select[data-f="%s"]' % k).select_option(index=1)
        t.wait_until("(k) => document.querySelector('select[data-f=\"' + k + '\"]').value !== ''", k)
    go(t, qs(land['obj'], land['oi']), '.om-app[data-v="oi"] .om-title')
    t.ck(pg.locator('.om-secrow', has_text='Инженерные сети').locator('.om-prog-req').count() == 0, 'после заполнения сетей «обязательных осталось» не ушло')

    # --- выявлено на месте: добавить строение, осмотреть, убрать ---
    go(t, 'v=obj&id=' + quote(obj, safe=''), '.om-app[data-v="obj"] [data-found]')
    pg.locator('[data-found] select[name=cat]').select_option('prod')
    pg.fill('[data-found] input[name=name]', 'Склад во дворе')
    pg.locator('[data-found] button[type=submit]').click()
    t.ck(t.wait_until("() => /v=oi/.test(location.hash) && /oi=found-/.test(location.hash) && !!document.querySelector('.om-secrow')"),
         'добавленное строение не открылось осмотром ОИ')
    t.ck(pg.locator('.om-title').inner_text().strip() == 'Склад во дворе', 'у выявленного не то название: %s' % pg.locator('.om-title').inner_text())
    t.ck(pg.locator('.om-secrow', has_text='Доп параметры').count() == 1, 'у выявленного производственного нет раздела «Доп параметры»')
    go(t, 'v=obj&id=' + quote(obj, safe=''), '.om-app[data-v="obj"] .om-found')
    t.ck(pg.locator('.om-found a.om-oi-link', has_text='Склад во дворе').count() == 1, 'выявленного нет в блоке «Выявлено на месте»')
    pg.locator('.om-found a.om-oi-link', has_text='Склад во дворе').click()
    t.wait_for('[data-found-del]')
    pg.locator('[data-found-del]').click()
    t.ck(t.wait_until("() => /v=obj/.test(location.hash) && !!document.querySelector('.om-found') && !document.querySelector('.om-found a.om-oi-link')"),
         'выявленное строение не убралось')

    # --- законченный осмотр — только просмотр ---
    pg.evaluate(FINISH, [obj, True])
    go(t, qs(obj, oi, 'general'), '.om-app[data-v="sec"] .om-form')
    t.ck(t.wait_until("() => !!document.querySelector('.om-warn') && [...document.querySelectorAll('.om-form [data-f], .om-form [data-ms]')].every((e) => e.disabled)"),
         'у законченного осмотра поля правятся')

    # --- ширины ---
    pg.set_viewport_size({'width': 360, 'height': 780})
    for q in (qs(obj, oi), qs(obj, oi, 'capclass'), qs(land['obj'], land['oi'], 'place')):
        go(t, q, '.om-app .om-title')
        over = pg.evaluate("() => { const s = document.querySelector('.om-scr'); return s.scrollWidth - s.clientWidth; }")
        t.ck(over <= 0, '%s на 360 px прокручивается вбок на %d px' % (q, over))
