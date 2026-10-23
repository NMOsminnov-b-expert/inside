# -*- coding: utf-8 -*-
"""Инженерные сети ОИ в карточках: по умолчанию по типу, копия от участка, своё.

Решение пользователя 16.10.2026 (запись графа
inzhenernye-seti-v-kazhdom-oi-znacheniya-po-tipu-kopiya-ot-uchastka-ob): у ОИ
блок сетей; значение — своё, иначе участка, за которым ОИ закреплён, иначе по
умолчанию для его вида; участок поменяли — ОИ без своего значения подхватывают
сами, со своим — вопрос; своё можно «вернуть». До 23.10.2026 карточная сторона
ничем не проверялась (вопрос пользователя «Что по тестам на инженерных сетях?»).

Ловит:
  * у литеры не те значения по умолчанию для её вида (гражданское здание —
    электро- и водоснабжение «Подведены», остальное пусто);
  * значение участка не доходит до литеры, или доходит, но подписано не
    «от участка»;
  * своё значение литеры затирается правкой участка без вопроса, или «Отмена»
    его всё-таки затирает;
  * не правленая литера не подхватывает новое значение участка;
  * «вернуть» не снимает своё значение.
"""
NAME = 'сети ОИ в карточках'

TOUCHES = (
    'app/modules/land-plot/oi/land/oiNets.js', 'app/modules/land-plot/oi/land/ctrl.js',
    'app/modules/civil/oi/building/*', 'app/modules/apartment/oi/apartment/*',
    'app/modules/civil/data/seed.js', 'app/kernel/cardToggle.js',
)

OC = '#/oc/civil/oc-cv-1/oi/'
N2 = '#/oc/civil/oc-cv-nets2/oi/'  # два участка (засев civil, 23.10.2026)
N0 = '#/oc/civil/oc-cv-nets0/oi/'  # без участка, объектов несколько
OWN_ON = "() => document.querySelector('[data-oi-net=sewerage]').closest('.oi-net').classList.contains('own')"
OWN_OFF = "() => !document.querySelector('[data-oi-net=sewerage]').closest('.oi-net').classList.contains('own')"
KEYS = ('electricity', 'centralWater', 'sewerage', 'gasification', 'centralHeating')

SET = """([sel, v]) => { const el = document.querySelector(sel); el.value = v;
    el.dispatchEvent(new Event('change', { bubbles: true })); }"""
OPTS = "(sel) => [...document.querySelector(sel).options].map(o => o.value).filter(Boolean)"
NET = """(key) => { const s = document.querySelector(`[data-oi-net="${key}"]`);
    const f = s.closest('.oi-net'); return { v: s.value, own: f.classList.contains('own'),
    src: f.querySelector('.oi-net-src').textContent.trim() }; }"""


# Переход по якорю страницу не перезагружает: ожидание поля засчитывалось
# старым экраном, и проверка читала прежний ОИ (поймано прогоном 23.10.2026).
# До перехода всё на странице помечается — ждём узел, нарисованный заново.


def run(t):
    pg = t.page
    net = lambda key: pg.evaluate(NET, key)

    def go(route, wait):
        # Тот же адрес — экран не перерисуется, переходить незачем.
        if pg.evaluate('() => location.hash') == route:
            return
        pg.evaluate("() => document.querySelectorAll('*').forEach((e) => e.setAttribute('data-stale', ''))")
        t.open(route, wait=wait + ':not([data-stale])')

    # 0. Блок свёрнут, если ОИ на участке, и открыт без участка — до того, как
    #    его разворачивают руками ниже (свёрнутость помнится на вкладку).
    go(OC + 'oi-cv1-a', wait='#q-nets')
    t.ck(pg.evaluate("document.querySelector('#q-nets').classList.contains('collapsed')"),
         'блок сетей литеры на участке не свёрнут')
    t.ck('от участка' in pg.inner_text('#q-nets .card-head'), 'у блока на участке нет подписи «от участка»')
    go(N0 + 'oi-cvn0-a', wait='#q-nets')
    t.ck(not pg.evaluate("document.querySelector('#q-nets').classList.contains('collapsed')"),
         'блок сетей литеры без участка свёрнут')
    t.ck('участка нет' in pg.inner_text('#q-nets .card-head'), 'у блока без участка нет подписи «участка нет»')

    # 0а. По умолчанию — для каждого вида ОИ (решение 16.10.2026): гражданское,
    #     квартира, жилой дом — электро- и водоснабжение; производственное —
    #     электроснабжение; прочее — ничего. Канализация, газ, отопление — пусто.
    for route, kind, want in (
        (N0 + 'oi-cvn0-a', 'гражданское', {'electricity': 'Подведены', 'centralWater': 'Подведены'}),
        (N0 + 'oi-cvn0-b', 'производственное', {'electricity': 'Подведены'}),
        (N0 + 'oi-cvn0-k', 'квартира', {'electricity': 'Подведены', 'centralWater': 'Подведены'}),
        (N2 + 'oi-cvn2-c', 'прочее (участок пуст)', {}),
        ('#/oc/residential-house/oc-rh-3/oi/oi-rh3-a', 'жилой дом', {'electricity': 'Подведены', 'centralWater': 'Подведены'}),
    ):
        go(route, wait='[data-oi-net]')
        got = {k: net(k)['v'] for k in KEYS}
        t.ck(got == {k: want.get(k, '') for k in KEYS}, 'по умолчанию у вида «%s» не то: %s' % (kind, got))

    # 1. По умолчанию для вида: гражданское здание — электро- и водоснабжение.
    go(OC + 'oi-cv1-a', wait='[data-oi-net]')
    e, s = net('electricity'), net('sewerage')
    t.ck(e['v'] == 'Подведены' and 'по умолчанию' in e['src'],
         'электроснабжение гражданской литеры не «Подведены» по умолчанию: %s' % e)
    t.ck(s['v'] == '' and not s['own'], 'канализация гражданской литеры не пуста по умолчанию: %s' % s)

    # 2. Значение участка — в литеры на нём, подписано «от участка».
    go(OC + 'oi-cv1-l', wait='[data-land-sewerage]')
    opts = pg.evaluate(OPTS, '[data-land-sewerage]')
    t.ck(len(opts) >= 3, 'у канализации участка меньше трёх значений: %s' % opts)
    first, second, third = opts[0], opts[1], opts[2]
    pg.evaluate(SET, ['[data-land-sewerage]', first])
    go(OC + 'oi-cv1-a', wait='[data-oi-net]')
    s = net('sewerage')
    t.ck(s['v'] == first and 'от участка' in s['src'] and not s['own'],
         'значение участка не дошло до литеры: %s (у участка %s)' % (s, first))

    # 3. Своё значение литеры — отметка «своё» и «вернуть».
    pg.evaluate(SET, ['[data-oi-net="sewerage"]', second])
    t.wait_until(OWN_ON)
    s = net('sewerage')
    t.ck(s['own'] and 'вернуть' in s['src'], 'своё значение литеры не отмечено: %s' % s)

    # 4. Правка участка: своё у литеры — вопрос, «Отмена» его сохраняет; не
    #    правленая литера (котельная) подхватывает новое значение сама.
    go(OC + 'oi-cv1-l', wait='[data-land-sewerage]')
    pg.evaluate(SET, ['[data-land-sewerage]', third])
    t.wait_for('[data-modal-cancel]')
    pg.locator('[data-modal-cancel]').click()
    go(OC + 'oi-cv1-a', wait='[data-oi-net]')
    s = net('sewerage')
    t.ck(s['v'] == second and s['own'], '«Отмена» не сохранила своё значение литеры: %s' % s)
    go(OC + 'oi-cv1-b', wait='[data-oi-net]')
    s = net('sewerage')
    t.ck(s['v'] == third and 'от участка' in s['src'], 'не правленая литера не подхватила значение участка: %s' % s)

    # 5. «Вернуть» снимает своё — значение снова от участка.
    go(OC + 'oi-cv1-a', wait='[data-oi-net-back="sewerage"]')
    # Блок сетей литеры на участке свёрнут по умолчанию — развернуть, как человек.
    if not pg.locator('[data-oi-net-back="sewerage"]').is_visible():
        pg.locator('#q-nets [data-card-toggle]').click()
    pg.locator('[data-oi-net-back="sewerage"]').click()
    t.wait_until(OWN_OFF)
    s = net('sewerage')
    t.ck(s['v'] == third and 'от участка' in s['src'], '«вернуть» не вернуло значение участка: %s' % s)

    # 6. Правка участка со своим значением у литеры и ответ «Заменить» — своё снято.
    pg.evaluate(SET, ['[data-oi-net="sewerage"]', first])
    t.wait_until(OWN_ON)
    go(OC + 'oi-cv1-l', wait='[data-land-sewerage]')
    pg.evaluate(SET, ['[data-land-sewerage]', second])
    t.wait_for('[data-modal-ok]')
    pg.locator('[data-modal-ok]').click()
    go(OC + 'oi-cv1-a', wait='[data-oi-net]')
    s = net('sewerage')
    t.ck(s['v'] == second and not s['own'], '«Заменить» не сняло своё значение литеры: %s' % s)

    # 7. Значение, равное унаследованному, своим не становится; «Не выбрано»
    #    снимает своё.
    pg.evaluate(SET, ['[data-oi-net="sewerage"]', second])
    t.wait_for('[data-oi-net]')
    t.ck(not net('sewerage')['own'], 'значение, равное участку, сочтено своим')
    pg.evaluate(SET, ['[data-oi-net="sewerage"]', first])
    t.wait_until(OWN_ON)
    pg.evaluate(SET, ['[data-oi-net="sewerage"]', ''])
    t.wait_until(OWN_OFF)
    s = net('sewerage')
    t.ck(s['v'] == second and 'от участка' in s['src'], '«Не выбрано» не вернуло значение участка: %s' % s)

    # 8. Два участка: каждый ОИ — от своего; незакреплённый — от первого;
    #    правка одного участка не трогает ОИ другого. Квартира — как литера.
    go(N2 + 'oi-cvn2-l1', wait='[data-land-sewerage]')
    pg.evaluate(SET, ['[data-land-sewerage]', first])
    go(N2 + 'oi-cvn2-l2', wait='[data-land-sewerage]')
    pg.evaluate(SET, ['[data-land-sewerage]', third])
    for oi, want, who in (('oi-cvn2-a', first, 'литера на участке 1'), ('oi-cvn2-k', first, 'квартира на участке 1'),
                          ('oi-cvn2-b', third, 'литера на участке 2'), ('oi-cvn2-c', first, 'незакреплённая литера')):
        go(N2 + oi, wait='[data-oi-net]')
        s = net('sewerage')
        t.ck(s['v'] == want and 'от участка' in s['src'], '%s: не значение своего участка: %s (ждали %s)' % (who, s, want))
    # Своё у квартиры; правка участка 1 — вопрос со списком, «Заменить» — своё снято.
    go(N2 + 'oi-cvn2-k', wait='[data-oi-net]')
    pg.evaluate(SET, ['[data-oi-net="sewerage"]', second])
    t.wait_until(OWN_ON)
    go(N2 + 'oi-cvn2-l1', wait='[data-land-sewerage]')
    pg.evaluate(SET, ['[data-land-sewerage]', third])
    t.wait_for('[data-modal-ok]')
    t.ck('Встроенное помещение' in pg.inner_text('.modal'), 'в вопросе нет квартиры со своим значением')
    pg.locator('[data-modal-ok]').click()
    go(N2 + 'oi-cvn2-k', wait='[data-oi-net]')
    s = net('sewerage')
    t.ck(s['v'] == third and not s['own'], 'квартира: «Заменить» не сняло своё: %s' % s)
    go(N2 + 'oi-cvn2-b', wait='[data-oi-net]')
    t.ck(net('sewerage')['v'] == third, 'правка участка 1 задела литеру участка 2')
    # Правка участка 2 — не задевает ОИ участка 1.
    go(N2 + 'oi-cvn2-l2', wait='[data-land-sewerage]')
    pg.evaluate(SET, ['[data-land-sewerage]', first])
    go(N2 + 'oi-cvn2-b', wait='[data-oi-net]')
    t.ck(net('sewerage')['v'] == first, 'литера участка 2 не подхватила свой участок')
    go(N2 + 'oi-cvn2-a', wait='[data-oi-net]')
    t.ck(net('sewerage')['v'] == third, 'правка участка 2 задела литеру участка 1')
