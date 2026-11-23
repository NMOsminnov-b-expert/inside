# -*- coding: utf-8 -*-
"""
Веб-страница осмотрщика (17.11.2026): маршрут к объекту — одной кнопкой, навигатор выбирает система; контакты, добавленные на месте —
как в приложении «Осмотр» (ContactsScreen.kt).

Что ловит сценарий:
  * «Маршрут» — не одна кнопка; на Android — не geo:-ссылка (навигатор выбирает система), на iPhone — не Apple
    Карты, на компьютере — не Google Карты; без точки на карте маршрут не строится по адресу;
  * контакт без ФИО и телефона, с коротким телефоном, с ошибкой в почте или с телефоном, который уже есть,
    сохраняется;
  * добавленный контакт не доходит до «Результатов осмотра» или не виден в «Добавлены на месте»;
    телефон — не ссылка tel:, почта — не mailto:;
  * убранный контакт остаётся на экране;
  * у законченного объекта контакты можно добавлять и убирать;
  * на 360 пикселях объект прокручивается вбок;
  * (19–20.11.2026) в сведениях выезда (карточка «Учреждение / Выезд / Назначил») нет «Оператор ЦОД» с ФИО оператора
    карточки ОЦ, телефоном (tel:) и почтой (mailto:) из профиля сотрудника; оператор попал в «Контакты»
    (контакты — только учреждения и добавленные на месте); «Оператор ЦОД» есть у объекта без оператора.
"""
from harness import use_cadastre_fixture

NAME = 'контакты и маршрут (веб)'

TOUCHES = ('app/pages/osmotr/*', 'app/kernel/inspectionResults.js', 'app/kernel/staffProfiles.js')

OBJS = """async () => { const d = await import('./app/pages/osmotr/data.js'); const s = (await import('./app/kernel/session.js')).session.state;
  return d.myObjects(s.person).map((o) => ({ id: o.id, typeId: o.typeId, ocId: o.ocId, state: o.state, removed: o.removed, returned: (o.returned || []).length,
    lat: o.lat, address: o.address || '', contacts: (o.contacts || []).filter((c) => c.phone).map((c) => c.phone) })); }"""
MINE = """async ([t, c]) => { const r = (await import('./app/kernel/inspectionResults.js')).resultsOf(t, c); return (r.contacts || []).filter((x) => !x.deleted); }"""


def run(t):
    pg = t.page
    use_cadastre_fixture(pg)
    pg.set_viewport_size({'width': 400, 'height': 860})
    t.open('#/osmotr', wait='.om-app[data-v="today"]')
    objs = pg.evaluate(OBJS)
    live = [o for o in objs if o['state'] != 'done' and not o['removed']]
    if not t.ck(live, 'нет открытых объектов — сценарию не на чем проверить'):
        return
    o = live[0]

    def open_obj(oid):
        pg.evaluate("(id) => { location.hash = '#/osmotr?v=obj&id=' + encodeURIComponent(id); }", oid)
        t.wait_until("(id) => document.querySelector('.om-app[data-v=obj] .om-title') && decodeURIComponent(location.hash).includes(id)", [oid])

    # --- маршрут: одна кнопка, выбор навигатора — системе телефона ---
    open_obj(o['id'])
    t.ck(pg.locator('.om-place a.om-route').count() == 1, 'у объекта нет одной кнопки «Маршрут»')
    RH = "async ([p, ua]) => (await import('./app/pages/osmotr/osmotr.js')).routeHref(p, ua)"
    PT = {'lat': 42.87, 'lon': 74.57, 'title': 'Объект'}
    ADDR = {'address': 'г. Ош, ул. Примерная, 1'}
    AND, IOS, PC = 'Mozilla/5.0 (Linux; Android 14)', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'Mozilla/5.0 (Windows NT 10.0)'
    t.ck(pg.evaluate(RH, [PT, AND]).startswith('geo:42.87,74.57?q=42.87,74.57('), 'Android: маршрут — не geo:-ссылка (выбор навигатора системой)')
    t.ck(pg.evaluate(RH, [ADDR, AND]).startswith('geo:0,0?q=%D0%B3'), 'Android без точки: geo:-ссылка не по адресу')
    t.ck(pg.evaluate(RH, [PT, IOS]) == 'maps://?daddr=42.87,74.57', 'iPhone: маршрут — не Apple Карты')
    t.ck(pg.evaluate(RH, [PT, PC]).startswith('https://www.google.com/maps/dir/'), 'компьютер: маршрут — не Google Карты в браузере')
    t.ck(pg.evaluate(RH, [{}, AND]) == '', 'без точки и адреса предлагается маршрут')

    # --- оператор ЦОД карточки ОЦ — в сведениях выезда, не в «Контактах» ---
    cods = pg.evaluate("""async () => { const d = await import('./app/pages/osmotr/data.js'); const tk = await import('./app/pages/inspection/tasks.js');
      const sp = await import('./app/kernel/staffProfiles.js'); const s = (await import('./app/kernel/session.js')).session.state;
      return d.myObjects(s.person).map((o) => { const rec = tk.loadTask(o.typeId, o.ocId) || {}; const who = (rec.resp || {}).cod || '';
        return { id: o.id, who, prof: sp.staffProfile(who) }; }); }""")
    with_cod = next((x for x in cods if x['prof'] and x['prof']['phone'] and x['prof']['email']), None)
    if t.ck(with_cod, 'нет объекта, у карточки которого оператор ЦОД с телефоном и почтой в профиле'):
        open_obj(with_cod['id'])
        first = pg.locator('.om-facts .om-cod')
        pr = with_cod['prof']
        t.ck(first.count() == 1, 'в сведениях выезда нет «Оператор ЦОД»')
        t.ck('Оператор ЦОД' not in pg.locator('.om-contacts').inner_text(), 'оператор ЦОД остался в «Контактах»')
        txt = first.inner_text()
        t.ck(with_cod['who'] in txt and 'Оператор ЦОД' in txt, 'в строке нет ФИО оператора ЦОД карточки (%s) или подписи: %r' % (with_cod['who'], txt))
        t.ck(pr['phone'] in txt and pr['email'] in txt, 'в строке оператора ЦОД нет телефона или почты текстом: %r' % txt)
        tel = 'tel:' + ''.join(ch for ch in pr['phone'] if ch.isdigit() or ch == '+')
        t.ck(first.locator('a[href="%s"]' % tel).count() == 1 and first.locator('a[href="mailto:%s"]' % pr['email']).count() == 1,
             'у оператора ЦОД телефон — не tel: или почта — не mailto:')
    none = next((x for x in cods if not x['who']), None)
    if none:
        open_obj(none['id'])
        t.ck(pg.locator('.om-cod').count() == 0, 'у объекта без оператора ЦОД есть «Оператор ЦОД»')
    t.ck(pg.evaluate("async () => (await import('./app/kernel/staffProfiles.js')).staffProfile('  ')") is None, 'профиль без имени — не пусто')
    open_obj(o['id'])

    # --- контакты: проверки ввода ---
    add = pg.locator('.om-ct-add')
    add.locator('summary').click()
    form = pg.locator('[data-ct-add]')
    err = form.locator('[data-ct-err]')
    form.locator('button[type=submit]').click()
    t.ck(t.wait_until("() => /ФИО или телефон/.test(document.querySelector('[data-ct-err]')?.textContent || '')"), 'контакт без ФИО и телефона не остановлен')
    form.locator('[name=name]').fill('Иванов Иван')
    form.locator('[name=phone]').fill('12-3')
    form.locator('button[type=submit]').click()
    t.ck('шести цифр' in err.inner_text(), 'короткий телефон не остановлен')
    form.locator('[name=phone]').fill('+996 555 123 456')
    form.locator('[name=email]').fill('ivanov@')
    form.locator('button[type=submit]').click()
    t.ck('Почта' in err.inner_text(), 'почта с ошибкой не остановлена')
    form.locator('[name=email]').fill('ivanov@example.kg')
    form.locator('[name=role]').fill('Завхоз')
    form.locator('[name=note]').fill('ключи от подвала')
    form.locator('button[type=submit]').click()
    t.ck(t.wait_until("async (a) => (await (%s)(a)).some((c) => c.name === 'Иванов Иван' && c.phone === '+996 555 123 456' && c.role === 'Завхоз' && c.email === 'ivanov@example.kg' && c.by)" % MINE,
                      [o['typeId'], o['ocId']]), 'контакт не дошёл до «Результатов осмотра»')
    t.ck(t.wait_until("() => [...document.querySelectorAll('.om-contact')].some((c) => c.textContent.includes('Иванов Иван'))"), 'добавленный контакт не виден')
    line = pg.locator('.om-contact', has_text='Иванов Иван')
    t.ck(line.locator('a[href="tel:+996555123456"]').count() == 1, 'телефон контакта — не ссылка tel:')
    t.ck(line.locator('a[href="mailto:ivanov@example.kg"]').count() == 1, 'почта контакта — не ссылка mailto:')
    t.ck(pg.locator('.om-cap-sub', has_text='Добавлены на месте').count() == 1, 'нет подзаголовка «Добавлены на месте»')

    # Повтор телефона — не сохраняется.
    pg.locator('.om-ct-add summary').click()
    form.locator('[name=name]').fill('Другой')
    form.locator('[name=phone]').fill('+996555123456')
    form.locator('button[type=submit]').click()
    t.ck(t.wait_until("() => /уже есть/.test(document.querySelector('[data-ct-err]')?.textContent || '')"), 'контакт с тем же телефоном не остановлен')

    # Убрать.
    line.locator('[data-ct-del]').click()
    t.ck(t.wait_until("() => ![...document.querySelectorAll('.om-contact')].some((c) => c.textContent.includes('Иванов Иван'))"), 'убранный контакт остался на экране')
    t.ck(len(pg.evaluate(MINE, [o['typeId'], o['ocId']])) == 0, 'убранный контакт остался в «Результатах осмотра»')

    # --- законченный объект: только просмотр ---
    done = next((x for x in objs if x['state'] == 'done' and not x['returned']), None)
    if t.ck(done, 'нет законченного объекта — только просмотр контактов не проверен'):
        open_obj(done['id'])
        t.ck(pg.locator('.om-ct-add').count() == 0, 'у законченного объекта можно добавить контакт')

    pg.set_viewport_size({'width': 360, 'height': 780})
    open_obj(o['id'])
    over = pg.evaluate("() => { const s = document.querySelector('.om-scr'); return s.scrollWidth - s.clientWidth; }")
    t.ck(over <= 0, 'объект на 360 px прокручивается вбок на %d px' % over)
