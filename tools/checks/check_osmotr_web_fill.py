# -*- coding: utf-8 -*-
"""
Веб-страница осмотрщика, этап 2 (16.11.2026): осмотр объекта имущества на
месте — экран ОИ (разделы) и экран раздела (поля). Поля — схема осмотра макета
(pages/inspection/form.js, sections), значения — в «Результаты осмотра».

Что ловит сценарий:
  * строка «Состава объекта» не ведёт в осмотр ОИ; раздел не раскрывается на месте
    или сворачивается после правки; у ТС поля разложены по разделам (механизмы — описью, этап 3, здесь не проверяются);
  * у какого-то вида ОИ (строение нежилое, производственное, жилое; квартира;
    участок; ТС) разделов или полей на экране не столько,
    сколько в схеме осмотра;
  * выбор из списка, ввод числа, отметка в мультивыборе не доходят до
    «Результатов осмотра»; ввод сбивает фокус; нет строки «Сохранено»;
  * первая правка не переводит назначение «в работу»;
  * поля не как в приложении «Осмотр» (Params.kt, сводка «Поля осмотра PWA»):
    у ТС есть «Адрес на момент осмотра» (убран 16.11.2026) или нет руля,
    топлива, общего состояния; у строения нет «Тип ОИ» или есть класс
    капитальности; тип ОИ «Квартира» не переключает форму; тип участка не
    переключает сельхозхарактеристики и сети;
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
    'app/pages/osmotr/*', 'app/kernel/geoHere.js', 'app/pages/inspection/tasks.js', 'app/kernel/fieldSchema.js',
    'app/kernel/inspections.js', 'app/kernel/inspectionResults.js', 'app/kernel/registry.js',
)

# Все ОИ осмотрщика: вид, разделы и число видимых полей по полям приложения «Осмотр» (params.js, Params.kt).
OIS = """async () => {
  const d = await import('./app/pages/osmotr/data.js'); const s = (await import('./app/kernel/session.js')).session.state;
  const P = await import('./app/pages/osmotr/params.js'); const tk = await import('./app/pages/inspection/tasks.js');
  const r = await import('./app/kernel/inspectionResults.js');
  return d.myObjects(s.person).flatMap((o) => o.ois.map((x) => {
    const rec = tk.loadTask(o.typeId, o.ocId); const oi = tk.ownOis(rec).find((y) => y.id === x.id);
    const own = (r.resultsOf(o.typeId, o.ocId).assets || {})[x.id] || {}; const def = P.pwaDefaults(oi);
    const vals = { ...def, ...own, f: { ...(def.f || {}), ...(own.f || {}) } };
    const secs = P.pwaSections(oi).filter((z) => z.key !== 'comments')
      .map((z) => ({ key: z.key, n: z.fields.filter((q) => !q.visible || q.visible(vals)).length })).filter((z) => z.n);
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
    # Категории снимков ТС — без «Модули», даже у машины с модулями (пользователь 17.11.2026).
    cats = pg.evaluate("async () => (await import('./app/pages/inspection/tasks.js')).photoCatsOf({ card: 'vehicle', vehicle: { modules: [{ kind: 'Кран' }] } })")
    t.ck(cats == ['Машина', 'Документы на месте', 'Прочее'], 'категории снимков ТС: %s' % cats)
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

    # --- у каждого вида ОИ разделы и поля — как в схеме осмотра; разделы раскрываются на месте, у ТС — без разделов ---
    for kind, x in sorted(kinds.items()):
        t.ck(go(t, qs(x['obj'], x['oi']), '.om-app[data-v="oi"] .om-title'), '%s: экран ОИ не открылся' % kind)
        if kind == 'vehicle':
            t.ck(pg.locator('.om-acc').count() == 0, 'у ТС поля разложены по разделам (16.11.2026: «Там их мало»)')
            got = pg.locator('.om-accs .om-field').count()
            t.ck(got == sum(s['n'] for s in x['secs']), 'ТС: полей на экране %d, в схеме %d' % (got, sum(s['n'] for s in x['secs'])))
            continue
        acc = x['secs']
        n = pg.locator('.om-acc').count()
        t.ck(n == len(acc), '%s: разделов на экране %d, в схеме %d' % (kind, n, len(acc)))
        t.ck(pg.locator('.om-scr .om-accs > .om-form').count() == 0, '%s: поля вперемешку с разделами (16.11.2026: «В литерах каша»)' % kind)
        t.ck(pg.locator('.om-acc[open]').count() == 0, '%s: разделы раскрыты сразу' % kind)
        for s in acc:
            summ = pg.locator('.om-acc[data-sec="%s"] > summary' % s['key'])
            summ.click()
            ok = t.wait_until("(k) => document.querySelector('.om-acc[data-sec=\"' + k + '\"]').open", s['key'])
            got = pg.locator('.om-acc[data-sec="%s"] .om-field:visible' % s['key']).count() if ok else -1
            t.ck(got == s['n'], '%s, раздел %s: полей на экране %d, в схеме %d' % (kind, s['key'], got, s['n']))
        t.ck(t.wait_until("() => /v=oi/.test(location.hash)"), '%s: раскрытие раздела увело с экрана ОИ' % kind)

    # --- поля — как в приложении «Осмотр» (сводка «Поля осмотра PWA»), у ТС — без адреса на момент осмотра ---
    def labels():
        return [x.replace('*', '').strip() for x in pg.locator('.om-flabel').all_inner_texts()]
    ts = kinds['vehicle']
    go(t, qs(ts['obj'], ts['oi']), '.om-app[data-v="oi"] .om-form')
    lb = labels()
    t.ck('Адрес на момент осмотра' not in lb, 'у ТС осталось «Адрес на момент осмотра» (16.11.2026: «убираем у ТС»)')
    for w in ('Регистрационный номер', 'Пробег', 'Единица', 'Моточасы, ч', 'Руль', 'Тип топлива', 'Общее состояние', 'Комментарий осмотрщика'):
        t.ck(w in lb, 'у ТС нет поля «%s» приложения' % w)
    go(t, qs(obj, oi), '.om-app[data-v="oi"] .om-title')
    lb = pg.locator('.om-secrow b').all_inner_texts()
    for w in ('Тип ОИ', 'Общие параметры', 'Санузел', 'Инженерные сети'):
        t.ck(w in lb, 'у строения нет «%s» приложения' % w)
    for w in ('Тип и класс капитальности', 'Доп параметры (производственное строение)'):
        t.ck(w not in lb, 'у строения есть «%s» — в приложении нет' % w)
    land = kinds['land']
    pg.evaluate(FINISH, [land['obj'], False])
    go(t, qs(land['obj'], land['oi'], 'type'), '.om-app[data-v="sec"] .om-title')
    t.ck(pg.locator('select[data-f="landType"]').count() == 1, 'у участка нет «Тип земельного участка»')
    pg.locator('select[data-f="landType"]').select_option(label='Сельскохозяйственный')
    t.ck(t.wait_until("() => !!document.querySelector('.om-acc[data-sec=agri]') && !document.querySelector('.om-acc[data-sec=nets]')"),
         'сельхозучасток: нет «Сельскохозяйственных характеристик» или остались инженерные сети')
    pg.locator('select[data-f="landType"]').select_option(label='Несельскохозяйственный')
    t.ck(t.wait_until("() => !document.querySelector('.om-acc[data-sec=agri]') && !!document.querySelector('.om-acc[data-sec=nets]')"),
         'несельхозучасток: остались сельхозхарактеристики или нет сетей')

    # --- правка полей строения: список, число, тип ОИ, мультивыбор ---
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

    t.ck(pg.locator('.om-acc[data-sec="general"][open]').count() == 1, 'раздел свернулся после правки')
    go(t, qs(obj, oi, 'kind'), '.om-acc[data-sec="kind"][open]')
    kind_sel = pg.locator('.om-acc[data-sec="kind"] select[data-f="objKind"]')
    t.ck(kind_sel.count() == 1, 'в разделе «Тип ОИ» нет поля')
    kind_sel.select_option(label='Квартира')
    t.ck(t.wait_until("() => [...document.querySelectorAll('.om-secrow b')].some((b) => b.textContent === 'Общие параметры квартиры') && ![...document.querySelectorAll('.om-secrow b')].some((b) => b.textContent === 'Общие параметры')"),
         'тип ОИ «Квартира» не переключил форму на квартиру')
    pg.locator('select[data-f="objKind"]').select_option(label='Здание')
    t.ck(t.wait_until("() => [...document.querySelectorAll('.om-secrow b')].some((b) => b.textContent === 'Общие параметры')"), 'тип ОИ «Здание» не вернул форму строения')

    go(t, qs(obj, oi, 'sanuzel'), '.om-acc[data-sec="sanuzel"][open]')
    opt_btn = pg.locator('.om-acc[data-sec="sanuzel"] .om-opt').first
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
    go(t, qs(land['obj'], land['oi']), '.om-app[data-v="oi"] .om-title')
    t.ck(pg.locator('.om-secrow', has_text='Инженерные сети').locator('.om-prog-req').count() == 1, 'у сетей участка не видно «обязательных осталось»')
    go(t, qs(land['obj'], land['oi'], 'nets'), '.om-app[data-v="sec"] .om-form')
    for k in ('electricity', 'centralWater', 'sewerage', 'gasification', 'centralHeating'):
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
    t.ck(pg.locator('select[data-f="objKind"]').evaluate('(e) => e.value') == 'Здание', 'у выявленного производственного тип ОИ не «Здание»')
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
    t.ck(t.wait_until("() => document.querySelector('.om-idrow').textContent.includes('только просмотр') && [...document.querySelectorAll('.om-form [data-f], .om-form [data-ms]')].every((e) => e.disabled)"),
         'у законченного осмотра поля правятся')

    # --- ширины ---
    pg.set_viewport_size({'width': 360, 'height': 780})
    for q in (qs(obj, oi), qs(obj, oi, 'nets'), qs(land['obj'], land['oi'], 'place')):
        go(t, q, '.om-app .om-title')
        over = pg.evaluate("() => { const s = document.querySelector('.om-scr'); return s.scrollWidth - s.clientWidth; }")
        t.ck(over <= 0, '%s на 360 px прокручивается вбок на %d px' % (q, over))
