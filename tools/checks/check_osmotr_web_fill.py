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
    топлива, общего состояния; у строения есть класс капитальности; тип
    участка не переключает сельхозхарактеристики и сети;
  * тип ОИ правится осмотрщиком или не тот, что в составе объекта (в том
    числе при прежнем значении в результатах); у строения или квартиры
    остались «Общие параметры» (пользователь 18.11.2026: «в составе объекта
    нельзя менять», «общие параметры убираем»);
  * обязательные поля участка (сети) не считаются в «обязательных осталось»;
  * снимок не встаёт в выбранную категорию, не переносится, не удаляется;
  * выявленное на месте строение не добавляется, не убирается; у «Выявлено на
    месте» список видов вместо текстового поля, строение без названия
    добавляется; внутри выявленного — что-то кроме комментария и снимков
    (пользователь 18.11.2026);
  * «Добавить литеру» (18.11.2026): нет кнопки в «Составе объекта» здания или
    она есть у квартиры; литера без буквы или с буквой, которая уже есть в
    составе, добавляется; добавленная не встаёт в состав с буквой (а встаёт в
    «Выявлено на месте»), не открывается формой здания, не убирается;
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
    const secs = P.pwaSections(oi).filter((z) => z.key !== 'comments' && !z.fixed)
      .map((z) => ({ key: z.key, n: z.fields.filter((q) => !q.visible || q.visible(vals)).length })).filter((z) => z.n);
    const kind = oi.card === 'building' ? (oi.residential ? 'жилое' : oi.litKind === 'prod' ? 'производственное' : 'нежилое') : oi.card;
    return { obj: o.id, oi: x.id, kind, state: o.state, secs, objKind: def.objKind || '' };
  }));
}"""
VAL = """async ([id, oi, key]) => { const [t, c] = id.split('|'); const r = (await import('./app/kernel/inspectionResults.js')).resultsOf(t, c);
  const v = (r.assets[oi] || {}); const x = key.split('.').reduce((o, k) => (o == null ? o : o[k]), v); return x === undefined ? null : x; }"""
FINISH = """async ([id, done]) => { const [t, c] = id.split('|'); const k = await import('./app/kernel/inspections.js');
  const s = (await import('./app/kernel/session.js')).session.state; k.finishWork(s.person, t, c, done); k.changed(); }"""
STATE = """async (id) => { const d = await import('./app/pages/osmotr/data.js'); const s = (await import('./app/kernel/session.js')).session.state;
  return (d.myObjects(s.person).find((o) => o.id === id) || {}).state; }"""
FACT = """(l) => { const dt = [...document.querySelectorAll('.om-oifacts dt')].find((e) => e.textContent === l);
  return dt ? dt.nextElementSibling.textContent : null; }"""
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
    t.ck('Регистрационный номер' not in lb, 'госномер у ТС правится (17.11.2026: «рег номер осмотрщик не редактирует»)')
    for w in ('Пробег', 'Единица измерения расстояния', 'Моточасы, ч', 'Руль', 'Тип топлива', 'Общее состояние', 'Комментарий осмотрщика'):
        t.ck(w in lb, 'у ТС нет поля «%s» приложения' % w)
    go(t, qs(obj, oi), '.om-app[data-v="oi"] .om-title')
    lb = pg.locator('.om-secrow b').all_inner_texts()
    for w in ('Санузел', 'Инженерные сети'):
        t.ck(w in lb, 'у строения нет «%s» приложения' % w)
    for w in ('Тип ОИ', 'Общие параметры', 'Общие параметры квартиры'):
        t.ck(w not in lb, 'у строения остался раздел «%s» (18.11.2026: тип ОИ — только показать, общие параметры убраны)' % w)
    # Тип ОИ — фактом из состава, без поля выбора; у каждого вида — свой.
    for kind in ('нежилое', 'жилое', 'apartment'):
        x = kinds[kind]
        go(t, qs(x['obj'], x['oi']), '.om-app[data-v="oi"] .om-title')
        t.ck(pg.evaluate(FACT, 'Тип ОИ') == x['objKind'], '%s: тип ОИ на экране «%s», в составе «%s»' % (kind, pg.evaluate(FACT, 'Тип ОИ'), x['objKind']))
        t.ck(pg.locator('[data-f="objKind"]').count() == 0, '%s: тип ОИ можно поменять' % kind)
        lb = pg.locator('.om-secrow b').all_inner_texts()
        t.ck('Общие параметры квартиры' not in lb and 'Общие параметры' not in lb, '%s: остались «Общие параметры»: %s' % (kind, lb))
    # Прежнее значение в результатах (тип меняли до 18.11.2026) — не в счёт: тип по составу.
    pg.evaluate("""async ([id, oi]) => { const [t, c] = id.split('|'); (await import('./app/kernel/inspectionResults.js')).valuesOf(t, c, oi).objKind = 'Квартира'; }""", [obj, oi])
    go(t, 'v=obj&id=' + quote(obj, safe=''), '.om-app[data-v="obj"] .om-title')
    go(t, qs(obj, oi), '.om-app[data-v="oi"] .om-oifacts')
    t.ck(pg.evaluate(FACT, 'Тип ОИ') == b['objKind'], 'прежний тип ОИ из результатов перебил тип из состава: %s' % pg.evaluate(FACT, 'Тип ОИ'))
    lb = pg.locator('.om-secrow b').all_inner_texts()
    t.ck('Санузел' in lb and 'Инженерные сети' in lb, 'прежний тип ОИ «Квартира» переключил форму: %s' % lb)
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

    # --- правка полей строения: список, мультивыбор; число — у ТС ---
    go(t, qs(obj, oi, 'nets'), '.om-app[data-v="sec"] .om-form')
    sel = pg.locator('select[data-f="electricity"]')
    opt = sel.locator('option').nth(1).inner_text().strip()
    sel.select_option(label=opt)
    t.ck(t.wait_until(SAVED), 'после правки нет строки «Сохранено»')
    t.ck(pg.evaluate(VAL, [obj, oi, 'electricity']) == opt, 'выбор «Наличие электроснабжения» не дошёл до результатов осмотра')
    t.ck(t.wait_until("async (id) => (await (%s)(id)) === 'progress'" % STATE, obj), 'первая правка не перевела назначение «в работу»')
    t.ck(pg.locator('.om-acc[data-sec="nets"][open]').count() == 1, 'раздел свернулся после правки')
    pg.evaluate(FINISH, [ts['obj'], False])
    go(t, qs(ts['obj'], ts['oi']), '.om-app[data-v="oi"] .om-form')
    inp = pg.locator('input[data-f="f.mileage"]')
    inp.fill('')
    inp.click()
    inp.press_sequentially('3')
    pg.wait_for_timeout(450)  # перерисовка по событию назначения приходит через 300 мс — ввод не должен сбиться
    inp.press_sequentially('2')
    t.ck(pg.evaluate("() => document.activeElement && document.activeElement.dataset.f") == 'f.mileage', 'ввод числа сбивает фокус')
    t.ck(str(pg.evaluate(VAL, [ts['obj'], ts['oi'], 'f.mileage'])) == '32', 'пробег не сохранился: %s' % pg.evaluate(VAL, [ts['obj'], ts['oi'], 'f.mileage']))

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
    t.ck(pg.locator('[data-found] select').count() == 0 and pg.locator('[data-found] input[name=name]').count() == 1,
         'в «Выявлено на месте» не одно текстовое поле (18.11.2026: «просто текстовое поле»)')
    n_found = pg.locator('.om-found a.om-oi-link').count()
    pg.evaluate("() => document.querySelector('[data-found] input[name=name]').removeAttribute('required')")
    pg.fill('[data-found] input[name=name]', '   ')
    pg.locator('[data-found] button[type=submit]').click()
    t.ck(t.wait_until("() => document.activeElement && document.activeElement.name === 'name'"), 'пустое название не вернуло фокус в поле')
    t.ck(t.wait_until("() => /v=obj/.test(location.hash)") and pg.locator('.om-found a.om-oi-link').count() == n_found, 'строение без названия добавилось')
    pg.fill('[data-found] input[name=name]', 'Склад во дворе')
    pg.locator('[data-found] button[type=submit]').click()
    t.ck(t.wait_until("() => /v=oi/.test(location.hash) && /oi=found-/.test(location.hash) && !!document.querySelector('.om-note-card textarea[data-f=note]')"),
         'добавленное строение не открылось осмотром ОИ с комментарием')
    t.ck(pg.locator('.om-title').inner_text().strip() == 'Склад во дворе', 'у выявленного не то название: %s' % pg.locator('.om-title').inner_text())
    t.ck(pg.locator('.om-secrow, .om-oifacts, .om-empty, .om-idrow .om-chip, .om-scr [data-f]:not([data-f=note])').count() == 0,
         'внутри выявленного не только комментарий и снимки (разделы, тип ОИ, поля или «заполнено»)')
    t.ck(pg.locator('.om-objtabs .om-btab', has_text='Фото').count() == 1, 'у выявленного нет вкладки «Фото»')
    note = pg.locator('.om-note-card textarea[data-f="note"]')
    note.press_sequentially('Металлический, без фундамента')
    t.ck(t.wait_until("async ([id, oi]) => (await (%s)([id, oi, 'note'])) === 'Металлический, без фундамента'" % VAL,
                      [obj, pg.evaluate("() => new URLSearchParams(location.hash.split('?')[1]).get('oi')")]), 'комментарий выявленного не сохранился')
    go(t, 'v=obj&id=' + quote(obj, safe=''), '.om-app[data-v="obj"] .om-found')
    t.ck(pg.locator('.om-found a.om-oi-link', has_text='Склад во дворе').count() == 1, 'выявленного нет в блоке «Выявлено на месте»')
    pg.locator('.om-found a.om-oi-link', has_text='Склад во дворе').click()
    t.wait_for('[data-found-del]')
    pg.locator('[data-found-del]').click()
    t.ck(t.wait_until("() => /v=obj/.test(location.hash) && !!document.querySelector('.om-found') && !document.querySelector('.om-found a.om-oi-link')"),
         'выявленное строение не убралось')

    # --- «Добавить литеру» в составе объекта ---
    LETTERS = """(id) => [...document.querySelectorAll('.om-comp:not(.om-found) a.om-oi-link .om-sq')].map((e) => e.textContent.trim()).filter((x) => x.length && x.length < 4)"""
    go(t, 'v=obj&id=' + quote(obj, safe=''), '.om-app[data-v="obj"] [data-liter-open]')
    had = pg.evaluate(LETTERS)
    t.ck(had, 'в составе объекта нет литер с буквой — повтор буквы не проверить')
    found_n = pg.locator('.om-found a.om-oi-link').count()
    pg.locator('[data-liter-open]').click()
    t.wait_for('[data-liter] #om-liter-letter')
    t.ck(pg.evaluate("() => document.activeElement && document.activeElement.id") == 'om-liter-letter', 'форма литеры открылась без фокуса на букве')
    pg.select_option('#om-liter-cat', 'prod')
    pg.fill('#om-liter-name', 'Склад у ворот')
    pg.evaluate("() => document.querySelector('#om-liter-letter').removeAttribute('required')")
    pg.locator('[data-liter] button[type=submit]').click()
    t.ck(t.wait_until("() => /Укажите букву/.test(document.querySelector('[data-liter] .om-warn')?.textContent || '')"), 'литера без буквы добавилась или нет подсказки')
    t.ck(pg.locator('#om-liter-name').input_value() == 'Склад у ворот', 'после ошибки пропало введённое название')
    if had:
        pg.fill('#om-liter-letter', had[0].lower())
        pg.locator('[data-liter] button[type=submit]').click()
        t.ck(t.wait_until("(l) => (document.querySelector('[data-liter] .om-warn')?.textContent || '').includes('Литера ' + l + ' уже есть')", had[0]),
             'литера с буквой %s, которая уже есть в составе, добавилась' % had[0])
    new = next(c for c in 'ЯЮЭЬЫ' if c not in had)
    pg.fill('#om-liter-letter', new)
    pg.locator('[data-liter] button[type=submit]').click()
    t.ck(t.wait_until("() => /v=oi/.test(location.hash) && /oi=found-/.test(location.hash) && !!document.querySelector('.om-secrow')"), 'добавленная литера не открылась осмотром ОИ')
    t.ck(pg.locator('.om-oihead .om-sq').inner_text().strip() == new and pg.locator('.om-title').inner_text().strip() == 'Склад у ворот',
         'у добавленной литеры не та буква или название: %s / %s' % (pg.locator('.om-oihead .om-sq').inner_text(), pg.locator('.om-title').inner_text()))
    lb = pg.locator('.om-secrow b').all_inner_texts()
    t.ck('Санузел' in lb and 'Инженерные сети' in lb, 'у добавленной литеры не форма здания: %s' % lb)
    t.ck(pg.evaluate(FACT, 'Тип ОИ') == 'Здание', 'у литеры вида «Производственно-складское» тип ОИ не «Здание»: %s' % pg.evaluate(FACT, 'Тип ОИ'))
    go(t, 'v=obj&id=' + quote(obj, safe=''), '.om-app[data-v="obj"] [data-liter-open]')
    t.ck(pg.evaluate(LETTERS) == had + [new], 'добавленной литеры нет в «Составе объекта»: %s' % pg.evaluate(LETTERS))
    t.ck(pg.locator('.om-found a.om-oi-link').count() == found_n, 'добавленная литера попала в «Выявлено на месте»')
    row = pg.locator('.om-comp:not(.om-found) a.om-oi-link', has_text='Склад у ворот')
    t.ck(row.count() == 1 and 'добавлена на месте' in row.inner_text(), 'у литеры в составе нет пометки «добавлена на месте»')
    row.click()
    t.wait_for('[data-found-del]')
    t.ck('Убрать литеру' in pg.locator('[data-found-del]').inner_text(), 'у добавленной литеры кнопка не «Убрать литеру»')
    pg.locator('[data-found-del]').click()
    t.ck(t.wait_until("([l]) => /v=obj/.test(location.hash) && !!document.querySelector('[data-liter-open]') && ![...document.querySelectorAll('.om-comp a.om-oi-link')].some((a) => a.textContent.includes('Склад у ворот'))", [new]),
         'добавленная литера не убралась из состава')
    flat = next((x for x in pg.evaluate(OIS) if x['obj'].startswith('apartment|')), None)
    t.ck(flat, 'у осмотрщика нет квартиры — кнопку «Добавить литеру» у квартиры не проверить')
    if flat:
        go(t, 'v=obj&id=' + quote(flat['obj'], safe=''), '.om-app[data-v="obj"] .om-title')
        t.ck(pg.locator('[data-liter-open]').count() == 0, 'у квартиры есть «Добавить литеру»')

    # --- законченный осмотр — только просмотр ---
    pg.evaluate(FINISH, [obj, True])
    go(t, qs(obj, oi, 'nets'), '.om-app[data-v="sec"] .om-form')
    t.ck(t.wait_until("() => document.querySelector('.om-idrow').textContent.includes('только просмотр') && [...document.querySelectorAll('.om-form [data-f], .om-form [data-ms]')].every((e) => e.disabled)"),
         'у законченного осмотра поля правятся')
    go(t, 'v=obj&id=' + quote(obj, safe=''), '.om-app[data-v="obj"] .om-title')
    t.ck(pg.locator('[data-liter-open]').count() == 0, 'у законченного осмотра есть «Добавить литеру»')

    # --- ширины ---
    pg.set_viewport_size({'width': 360, 'height': 780})
    for q in (qs(obj, oi), qs(obj, oi, 'nets'), qs(land['obj'], land['oi'], 'place')):
        go(t, q, '.om-app .om-title')
        over = pg.evaluate("() => { const s = document.querySelector('.om-scr'); return s.scrollWidth - s.clientWidth; }")
        t.ck(over <= 0, '%s на 360 px прокручивается вбок на %d px' % (q, over))
