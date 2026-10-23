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
)

OC = '#/oc/civil/oc-cv-1/oi/'

SET = """([sel, v]) => { const el = document.querySelector(sel); el.value = v;
    el.dispatchEvent(new Event('change', { bubbles: true })); }"""
OPTS = "(sel) => [...document.querySelector(sel).options].map(o => o.value).filter(Boolean)"
NET = """(key) => { const s = document.querySelector(`[data-oi-net="${key}"]`);
    const f = s.closest('.oi-net'); return { v: s.value, own: f.classList.contains('own'),
    src: f.querySelector('.oi-net-src').textContent.trim() }; }"""


def run(t):
    pg = t.page
    net = lambda key: pg.evaluate(NET, key)

    # 1. По умолчанию для вида: гражданское здание — электро- и водоснабжение.
    t.open(OC + 'oi-cv1-a', wait='[data-oi-net]')
    e, s = net('electricity'), net('sewerage')
    t.ck(e['v'] == 'Подведены' and 'по умолчанию' in e['src'],
         'электроснабжение гражданской литеры не «Подведены» по умолчанию: %s' % e)
    t.ck(s['v'] == '' and not s['own'], 'канализация гражданской литеры не пуста по умолчанию: %s' % s)

    # 2. Значение участка — в литеры на нём, подписано «от участка».
    t.open(OC + 'oi-cv1-l', wait='[data-land-sewerage]')
    opts = pg.evaluate(OPTS, '[data-land-sewerage]')
    t.ck(len(opts) >= 3, 'у канализации участка меньше трёх значений: %s' % opts)
    first, second, third = opts[0], opts[1], opts[2]
    pg.evaluate(SET, ['[data-land-sewerage]', first])
    t.open(OC + 'oi-cv1-a', wait='[data-oi-net]')
    s = net('sewerage')
    t.ck(s['v'] == first and 'от участка' in s['src'] and not s['own'],
         'значение участка не дошло до литеры: %s (у участка %s)' % (s, first))

    # 3. Своё значение литеры — отметка «своё» и «вернуть».
    pg.evaluate(SET, ['[data-oi-net="sewerage"]', second])
    t.wait_until('() => document.querySelector(\'[data-oi-net="sewerage"]\').closest(".oi-net").classList.contains("own")')
    s = net('sewerage')
    t.ck(s['own'] and 'вернуть' in s['src'], 'своё значение литеры не отмечено: %s' % s)

    # 4. Правка участка: своё у литеры — вопрос, «Отмена» его сохраняет; не
    #    правленая литера (котельная) подхватывает новое значение сама.
    t.open(OC + 'oi-cv1-l', wait='[data-land-sewerage]')
    pg.evaluate(SET, ['[data-land-sewerage]', third])
    t.wait_for('[data-modal-cancel]')
    pg.locator('[data-modal-cancel]').click()
    t.open(OC + 'oi-cv1-a', wait='[data-oi-net]')
    s = net('sewerage')
    t.ck(s['v'] == second and s['own'], '«Отмена» не сохранила своё значение литеры: %s' % s)
    t.open(OC + 'oi-cv1-b', wait='[data-oi-net]')
    s = net('sewerage')
    t.ck(s['v'] == third and 'от участка' in s['src'], 'не правленая литера не подхватила значение участка: %s' % s)

    # 5. «Вернуть» снимает своё — значение снова от участка.
    t.open(OC + 'oi-cv1-a', wait='[data-oi-net-back="sewerage"]')
    # Блок сетей литеры на участке свёрнут по умолчанию — развернуть, как человек.
    if not pg.locator('[data-oi-net-back="sewerage"]').is_visible():
        pg.locator('#q-nets [data-card-toggle]').click()
    pg.locator('[data-oi-net-back="sewerage"]').click()
    t.wait_until('() => !document.querySelector(\'[data-oi-net="sewerage"]\').closest(".oi-net").classList.contains("own")')
    s = net('sewerage')
    t.ck(s['v'] == third and 'от участка' in s['src'], '«вернуть» не вернуло значение участка: %s' % s)

    # 6. Правка участка со своим значением у литеры и ответ «Заменить» — своё снято.
    pg.evaluate(SET, ['[data-oi-net="sewerage"]', first])
    t.wait_until('() => document.querySelector(\'[data-oi-net="sewerage"]\').closest(".oi-net").classList.contains("own")')
    t.open(OC + 'oi-cv1-l', wait='[data-land-sewerage]')
    pg.evaluate(SET, ['[data-land-sewerage]', second])
    t.wait_for('[data-modal-ok]')
    pg.locator('[data-modal-ok]').click()
    t.open(OC + 'oi-cv1-a', wait='[data-oi-net]')
    s = net('sewerage')
    t.ck(s['v'] == second and not s['own'], '«Заменить» не сняло своё значение литеры: %s' % s)
