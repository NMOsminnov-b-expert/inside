# -*- coding: utf-8 -*-
"""
Веб-страница осмотрщика (19.11.2026): «Автомобили, выявленные на месте».
Пользователь: «добавить в недвижимое и движимое кнопку автомобили выявленные на месте, при нажатии на кнопку будет
создаваться карточка во вкладке выезды, некоторые поля типа адреса, организации, даты осмотра копируются, в этой
карточке будут поля марка модель и номер, при выходе с этой страницы будет выбор сохранить или удалить». Ответы: у
недвижимости и ТС; черновик при объекте; только три поля; выбор — только у этих карточек, пока не сохранён.

Что ловит сценарий:
  * у объекта недвижимости или ТС нет кнопки «Добавить автомобиль», у законченного — есть;
  * кнопка не заводит карточку или не открывает её; не скопированы адрес, учреждение, дата выезда;
  * в карточке не три поля (марка, модель, госномер) или правка не доходит до записи;
  * с несохранённой карточки можно уйти ссылкой или «Назад» браузера без выбора «Сохранить / Удалить»;
  * «Сохранить» без марки, модели и госномера сохраняет;
  * после «Сохранить» из выбора не уходит туда, куда шли; сохранённая карточка снова спрашивает при уходе;
  * «Удалить» не удаляет автомобиль;
  * во «Выездах» (тип «Транспорт») нет строки автомобиля или она ведёт не на его карточку;
  * автомобиль попал в «Выявлено на месте» (строения).
"""
from urllib.parse import quote

from harness import use_cadastre_fixture

NAME = 'автомобили, выявленные на месте (веб)'

TOUCHES = ('app/pages/osmotr/*', 'app/pages/inspection/tasks.js', 'app/pages/inspection/results.js')

OBJS = """async () => { const d = await import('./app/pages/osmotr/data.js');
  const s = (await import('./app/kernel/session.js')).session.state;
  return { me: s.person, objs: d.myObjects(s.person).map((o) => ({ id: o.id, typeId: o.typeId, ocId: o.ocId, state: o.state, removed: o.removed,
    entity: o.entity, address: o.address, institution: o.institution, plannedAt: o.plannedAt, title: o.title })) }; }"""
CARS = """async (id) => { const [t, c] = id.split('|'); const r = (await import('./app/kernel/inspectionResults.js')).resultsOf(t, c);
  return (r.found || []).filter((f) => f.car).map((f) => ({ id: f.id, unsaved: !!f.unsaved, copy: f.copy, f: f.vehicle.f, by: f.foundBy, card: f.card })); }"""


def q_of(pg):
    return pg.evaluate("() => Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''))")


def go(t, q, wait):
    t.page.evaluate("(q) => { location.hash = '#/osmotr?' + q; }", q)
    return t.wait_until("(w) => !!document.querySelector(w)", wait, timeout=5000)


def obj_q(o):
    return 'v=obj&id=' + quote(o, safe='')


def add_car(t, oid):
    pg = t.page
    go(t, obj_q(oid), '.om-app[data-v="obj"] [data-car-add]')
    pg.locator('[data-car-add]').click()
    return t.wait_until("() => !!document.querySelector('.om-app[data-v=\"car\"] #om-car-make')", timeout=5000)


def run(t):
    pg = t.page
    use_cadastre_fixture(pg)
    pg.set_viewport_size({'width': 400, 'height': 860})
    t.open('#/osmotr', wait='.om-app[data-v="today"]')
    info = pg.evaluate(OBJS)
    me, objs = info['me'], info['objs']
    live = [o for o in objs if o['state'] != 'done' and not o['removed']]
    real = next((o for o in live if o['entity'] == 'real' and o['address']), None)
    veh = next((o for o in live if o['entity'] == 'vehicle'), None)
    inv = next((o for o in live if o['entity'] == 'inventory'), None)
    if not t.ck(real and veh, 'нет незаконченных объектов недвижимости и ТС у осмотрщика'):
        return

    # --- кнопка: у недвижимости и ТС, не у описи ---
    if inv:
        go(t, obj_q(inv['id']), '.om-app[data-v="obj"] .om-title')
        t.ck(pg.locator('[data-car-add]').count() == 0, 'у описи (механизмы) есть «Добавить автомобиль»')

    # --- новая карточка: копия адреса, учреждения, даты; три поля ---
    t.ck(add_car(t, real['id']), 'кнопка не открыла карточку автомобиля')
    cq = q_of(pg)
    cars = pg.evaluate(CARS, real['id'])
    car = next((c for c in cars if c['id'] == cq.get('car')), None)
    if not t.ck(car and car['unsaved'] and car['card'] == 'vehicle' and car['by'] == me, 'карточка не заведена несохранённым черновиком ТС: %s' % cars):
        return
    want_date = real['plannedAt'] or pg.evaluate("async () => (await import('./app/pages/osmotr/data.js')).isoDay()")
    t.ck(car['copy'] == {'address': real['address'], 'institution': real['institution'], 'date': want_date}, 'скопировано не то: %s' % car['copy'])
    facts = pg.locator('.om-facts').inner_text()
    t.ck(real['address'] in facts and '%s.%s.%s' % (want_date[8:10], want_date[5:7], want_date[:4]) in facts, 'в карточке не видно адреса и даты осмотра: %s' % facts)
    labels = pg.locator('.om-car-form .om-flabel').all_inner_texts()
    t.ck(labels == ['Марка', 'Модель', 'Госномер'], 'поля карточки: %s' % labels)
    t.ck(pg.locator('.om-idrow .om-chip').inner_text() == 'Не сохранён', 'нет отметки «Не сохранён»')

    # --- уход ссылкой: выбор; «Сохранить» пустого — отказ; «Остаться» ---
    pg.locator('.om-back').click()
    t.ck(t.wait_until("() => !!document.querySelector('#om-leave')"), 'уход ссылкой «Назад» без выбора «Сохранить / Удалить»')
    t.ck(q_of(pg).get('v') == 'car', 'ушли с несохранённой карточки')
    pg.locator('#om-leave [data-car-save]').click()
    t.ck(t.wait_until("() => /Укажите марку/.test((document.querySelector('#om-leave .om-warn') || {}).textContent || '')"), 'пустой автомобиль сохраняется без марки, модели и госномера')
    t.ck(pg.evaluate(CARS, real['id'])[-1]['unsaved'], 'пустой автомобиль сохранён')
    pg.locator('#om-leave [data-car-stay]').click()
    t.ck(t.wait_until("() => !document.querySelector('#om-leave')"), '«Остаться» не убрало выбор')

    # --- поля — в запись, заголовок — по ним ---
    pg.fill('#om-car-make', 'Toyota')
    pg.fill('#om-car-model', 'Camry')
    pg.fill('#om-car-plate', '01KG777AAA')
    car = next(c for c in pg.evaluate(CARS, real['id']) if c['id'] == cq['car'])
    t.ck(car['f'] == {'make': 'Toyota', 'model': 'Camry', 'plate': '01KG777AAA'}, 'поля не дошли до записи: %s' % car['f'])
    t.ck(pg.locator('.om-title').inner_text() == 'Toyota Camry · 01KG777AAA', 'заголовок карточки: %s' % pg.locator('.om-title').inner_text())

    # --- «Назад» браузера: выбор, «Сохранить» — уход туда, куда шли ---
    pg.evaluate("() => history.back()")
    t.ck(t.wait_until("() => !!document.querySelector('#om-leave')"), '«Назад» браузера ушёл без выбора')
    t.ck(q_of(pg).get('v') == 'car', 'после «Назад» адрес не вернулся к карточке')
    pg.locator('#om-leave [data-car-save]').click()
    t.ck(t.wait_until("() => document.querySelector('.om-app').dataset.v === 'obj'"), 'после «Сохранить» не ушли с карточки')
    car = next(c for c in pg.evaluate(CARS, real['id']) if c['id'] == cq['car'])
    t.ck(not car['unsaved'], 'автомобиль не сохранён')
    block = pg.locator('.om-cars').inner_text() if pg.locator('.om-cars').count() else ''
    t.ck('Toyota Camry' in block, 'в блоке объекта нет автомобиля: %s' % block)
    found = pg.locator('.om-found').inner_text() if pg.locator('.om-found').count() else ''
    t.ck('Toyota' not in found, 'автомобиль попал в «Выявлено на месте» (строения)')

    # --- «Выезды», «Транспорт»: строка автомобиля ведёт на его карточку ---
    go(t, 'v=trips&f=vehicle&s=all', '.om-app[data-v="trips"]')
    rows = pg.evaluate("""() => [...document.querySelectorAll('a.om-obj')].map((a) => ({ t: a.querySelector('.om-obj-title').textContent,
      k: a.querySelector('.om-obj-kind').textContent, q: Object.fromEntries(new URLSearchParams(a.getAttribute('href').split('?')[1])) }))""")
    row = next((r for r in rows if r['t'] == 'Toyota Camry · 01KG777AAA'), None)
    t.ck(row and 'выявленный на месте' in row['k'] and row['q'].get('v') == 'car' and row['q'].get('car') == cq['car'], 'во «Выездах» (Транспорт) нет строки автомобиля: %s' % rows)
    if row:
        pg.locator('a.om-obj', has_text='Toyota Camry').first.click()
        t.wait_until("() => !!document.querySelector('.om-app[data-v=\"car\"] #om-car-make')", timeout=5000)
        pg.locator('.om-back').click()
        t.ck(t.wait_until("() => document.querySelector('.om-app').dataset.v === 'obj'"), 'сохранённый автомобиль снова спрашивает при уходе')

    # --- у ТС: «Удалить» из выбора ---
    t.ck(add_car(t, veh['id']), 'у ТС кнопка не открыла карточку автомобиля')
    vq = q_of(pg)
    pg.locator('.om-back').click()
    t.wait_until("() => !!document.querySelector('#om-leave')")
    pg.locator('#om-leave [data-car-del]').click()
    t.ck(t.wait_until("() => document.querySelector('.om-app').dataset.v === 'obj'"), 'после «Удалить» не ушли с карточки')
    t.ck(not any(c['id'] == vq['car'] for c in pg.evaluate(CARS, veh['id'])), '«Удалить» не удалило автомобиль')

    # --- законченный осмотр — кнопки нет ---
    pg.evaluate("""async (id) => { const [t, c] = id.split('|'); const k = await import('./app/kernel/inspections.js');
      const s = (await import('./app/kernel/session.js')).session.state; k.finishWork(s.person, t, c, true); k.changed(); }""", real['id'])
    go(t, obj_q(real['id']), '.om-app[data-v="obj"] .om-cars')
    t.ck(pg.locator('[data-car-add]').count() == 0, 'у законченного осмотра можно добавить автомобиль')
