# -*- coding: utf-8 -*-
"""
Веб-страница осмотрщика (17.11.2026): маршрут к объекту — выбор навигатора; контакты, добавленные на месте —
как в приложении «Осмотр» (ContactsScreen.kt).

Что ловит сценарий:
  * «Маршрут» ведёт в один навигатор, а не даёт выбор 2ГИС / Apple / Google / «Другой»; без точки на карте
    маршрут не строится по адресу;
  * контакт без ФИО и телефона, с коротким телефоном, с ошибкой в почте или с телефоном, который уже есть,
    сохраняется;
  * добавленный контакт не доходит до «Результатов осмотра» или не виден в «Добавлены на месте»;
    телефон — не ссылка tel:, почта — не mailto:;
  * убранный контакт остаётся на экране;
  * у законченного объекта контакты можно добавлять и убирать;
  * на 360 пикселях объект прокручивается вбок.
"""
from harness import use_cadastre_fixture

NAME = 'контакты и маршрут (веб)'

TOUCHES = ('app/pages/osmotr/*', 'app/kernel/inspectionResults.js')

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

    # --- маршрут: выбор навигатора ---
    open_obj(o['id'])
    pick = pg.locator('.om-place .om-navpick')
    t.ck(pick.count() == 1, 'у объекта нет «Маршрут»')
    pick.locator('summary').click()
    hrefs = pg.eval_on_selector_all('.om-place .om-navpick .om-nav a', 'l => l.map((a) => a.getAttribute("href"))')
    t.ck(len(hrefs) == 4 and '2gis' in hrefs[0] and 'apple' in hrefs[1] and 'google' in hrefs[2] and hrefs[3].startswith('geo:'),
         'маршрут — не выбор 2ГИС / Apple / Google / «Другой»: %s' % hrefs)
    # Без точки — по адресу.
    by_addr = pg.evaluate("async () => (await import('./app/pages/osmotr/osmotr.js')).navLinks({ address: 'г. Ош, ул. Примерная, 1' }).map(([, u]) => u)")
    t.ck(len(by_addr) == 4 and all('%D0%9E%D1%88' in u for u in by_addr), 'без точки маршрут не строится по адресу: %s' % by_addr)
    t.ck(pg.evaluate("async () => (await import('./app/pages/osmotr/osmotr.js')).navLinks({}).length") == 0, 'без точки и адреса предлагается маршрут')

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
