# -*- coding: utf-8 -*-
"""Документы-основания у собственников и пользователей карточки ОЦ — как на проде.

Пользователь 23.11.2026 (снимки блока «Собственники» с прода): «Там делаем механизм как на проде»;
«И они и у пользователей и у собственников могут быть прикреплены. Это 1 список...»; «оно одновременно и
туда и туда может быть прикреплено». Запись графа zapros-dokumentov-na-osmotr-cod-sostavlyaet-regional-
podtverzhdaet-osm. Механизм — kernel/partyDocs.js, общий для всех типов ОЦ.

Что ловит сценарий:
  * прежнее поле ПУД потерялось: совпавшее с документом карточки не стало привязкой, несовпавшее — строкой
    «Не подтверждён документом»;
  * в окне «Документы-основания» не все документы карточки, не работает поиск, окно затемняет экран;
  * документ, привязанный к пользователю, отвязался от собственника (одновременная привязка);
  * «Открепить» не снимает привязку; «Документа нет в системе» не добавляет строку, правка строки не
    доходит до записи, «Убрать» не убирает;
  * строки «Не подтверждён документом» не видны запросу документов (pendingDocsOf);
  * у ТС под собственником нет документов-оснований;
  * ошибки консоли.
"""

NAME = 'документы-основания у сторон ОЦ'

TOUCHES = ('app/kernel/partyDocs.js', 'app/kernel/ocParts.css', 'app/kernel/morph.js', 'app/modules/*/card/parties.*.js',
           'app/modules/vehicle/parties.*.js', 'app/modules/mechanisms/parties.*.js')

REC = "(await import('./app/kernel/registry.js')).getType('civil').records.loadRecord('oc-cv-1')"
SETUP = """async () => { const rec = %s;
  const ga = (rec.oi || []).flatMap((o) => o.docs || []).concat(rec.docs || []).find((d) => /Гос\\. акт/.test(d.name || ''));
  rec.owners = [{ name: 'Собственник А', share: '50', pud: ga ? ga.name : '' }, { name: 'Собственник Б', share: '50', pud: 'Постановление мэрии 5' }];
  rec.users = [{ name: 'Пользователь В', share: '100' }];
  location.hash = '#/'; return ga ? ga.name : null; }""" % REC
DATA = "async () => { const rec = %s; return { owners: JSON.parse(JSON.stringify(rec.owners)), users: JSON.parse(JSON.stringify(rec.users)) }; }" % REC


def run(t):
    pg = t.page
    pg.set_viewport_size({'width': 1440, 'height': 900})
    t.open('#/oc/civil/oc-cv-1', wait='[data-oc-head]')
    ga = pg.evaluate(SETUP)
    if not t.ck(ga, 'у oc-cv-1 нет документа «Гос. акт» — сценарию не на чем проверить'):
        return
    pg.evaluate("() => { location.hash = '#/oc/civil/oc-cv-1'; }")
    t.wait_for('[data-pd="owner|0"]')

    # Прежний ПУД: совпал — привязка; не совпал — строка «Не подтверждён документом».
    t.ck(ga in pg.locator('[data-pd="owner|0"] .pd-chips').inner_text(), 'ПУД, совпавший с документом карточки, не стал привязкой')
    t.ck(pg.locator('[data-pd="owner|0"] .pd-unc').count() == 0, 'у совпавшего ПУД лишняя строка «Не подтверждён документом»')
    t.ck(pg.locator('[data-pd="owner|1"] [data-pd-uk="type"]').input_value() == 'Постановление мэрии 5', 'несовпавший ПУД не стал строкой «Не подтверждён документом»')
    t.ck(pg.locator('.pt-card .pt-pud').count() == 0, 'осталась колонка ПУД')

    # Окно «Документы-основания» у пользователя: все документы карточки, поиск, без затемнения.
    total = pg.evaluate("async () => (await import('./app/kernel/partyDocs.js')).cardDocs(%s).length" % REC)
    pg.click('[data-pd-pick="user|0"]')
    t.wait_for('.pd-pop')
    t.ck('Документы-основания · Пользователь В' in pg.locator('.pd-pop-h').inner_text(), 'заголовок окна не тот')
    t.ck(pg.locator('.pd-pop .pd-li').count() == total, 'в окне не все документы карточки: %d из %d' % (pg.locator('.pd-pop .pd-li').count(), total))
    t.ck(pg.evaluate("() => { const r = document.querySelector('.pd-pop').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }"),
         'окно выходит за край экрана')
    t.ck(pg.locator('.overlay, .modal-backdrop, dialog[open]').count() == 0, 'окно затемняет экран')
    t.ck(pg.locator('.pd-pop [data-pd-pv]').count() == 1, 'в окне нет предпросмотра')
    pg.fill('.pd-pop [data-pd-q]', 'zzzz-нет-такого')
    t.ck(t.wait_until("() => document.querySelectorAll('.pd-pop .pd-li').length === 0"), 'поиск не отбирает')
    pg.fill('.pd-pop [data-pd-q]', '')
    t.wait_until("([n]) => document.querySelectorAll('.pd-pop .pd-li').length === n", [total])
    pg.evaluate("(n) => [...document.querySelectorAll('.pd-pop .pd-li')].find((li) => li.textContent.includes(n)).querySelector('[data-pd-ck]').click()", ga)
    t.ck(t.wait_until("() => /Привязать \\(1\\)/.test(document.querySelector('[data-pd-bind]').textContent)"), 'отметка не посчиталась')
    pg.click('[data-pd-bind]')
    t.ck(t.wait_until("() => !document.querySelector('.pd-pop')"), 'окно не закрылось после «Привязать»')
    t.ck(t.wait_until("(n) => (document.querySelector('[data-pd=\"user|0\"] .pd-chips') || {}).textContent?.includes(n)", ga), 'документ не привязался к пользователю')
    t.ck(ga in pg.locator('[data-pd="owner|0"] .pd-chips').inner_text(), 'привязка к пользователю сняла её у собственника')

    # Открепить у собственника — у пользователя остаётся.
    pg.click('[data-pd="owner|0"] [data-pd-off]')
    t.ck(t.wait_until("() => !document.querySelector('[data-pd=\"owner|0\"] .pd-chips')"), '«Открепить» не сняло привязку')
    d = pg.evaluate(DATA)
    t.ck(d['owners'][0].get('docs') == [] and len(d['users'][0].get('docs') or []) == 1, 'данные привязок не те: %s / %s' % (d['owners'][0].get('docs'), d['users'][0].get('docs')))

    # «Документа нет в системе»: строка, правка, «Убрать».
    pg.click('[data-pd-none="owner|1"]')
    t.ck(t.wait_until("() => document.querySelectorAll('[data-pd=\"owner|1\"] [data-pd-u]').length === 2"), '«Документа нет в системе» не добавило строку')
    row = pg.locator('[data-pd="owner|1"] [data-pd-u]').nth(1)
    row.locator('[data-pd-uk="type"]').fill('Решение')
    row.locator('[data-pd-uk="type"]').dispatch_event('change')
    row.locator('[data-pd-uk="no"]').fill('42')
    row.locator('[data-pd-uk="no"]').dispatch_event('change')
    d = pg.evaluate(DATA)
    u = d['owners'][1].get('unconfirmed') or []
    t.ck(len(u) == 2 and u[1]['type'] == 'Решение' and u[1]['no'] == '42' and u[0]['type'] == 'Постановление мэрии 5', 'строки «Не подтверждён» в записи не те: %s' % u)
    pend = pg.evaluate("async () => (await import('./app/kernel/partyDocs.js')).pendingDocsOf(%s).map((x) => x.party + ':' + x.row.type)" % REC)
    t.ck(pend == ['Собственник Б:Постановление мэрии 5', 'Собственник Б:Решение'], 'запросу документов видны не те строки: %s' % pend)
    row.locator('[data-pd-udel]').click()
    t.ck(t.wait_until("() => document.querySelectorAll('[data-pd=\"owner|1\"] [data-pd-u]').length === 1"), '«Убрать» не убрало строку')

    # Escape закрывает окно.
    pg.click('[data-pd-pick="owner|1"]')
    t.wait_for('.pd-pop')
    pg.keyboard.press('Escape')
    t.ck(t.wait_until("() => !document.querySelector('.pd-pop')"), 'Escape не закрыл окно')

    # ТС: под собственником — тот же механизм.
    t.open('#/oc/vehicle/oc-vehicle-d1', wait='[data-oc-head]')
    if pg.locator('[data-parties-sum]').count():
        pg.click('[data-parties-toggle]')
    t.ck(t.wait_until("() => !!document.querySelector('[data-pd=\"owner|0\"] [data-pd-pick]')"), 'у ТС под собственником нет документов-оснований')

    # Перерисовка не сдвигает карту участка (замечание пользователя 23.11.2026 «поломалося»: сверка снимала с
    # узла карты класс maplibregl-map, и карта рисовалась поверх блока собственников).
    t.open('#/oc/civil/oc-cv-b91', wait='[data-oc-head]')
    if t.ck(t.wait_until("() => { const m = document.querySelector('#ocMapBox'); return !!m && !!m._map; }"), 'у oc-cv-b91 нет карты участка — сдвиг не проверен'):
        pg.locator('[data-pd-none]').first.click()
        t.wait_until("() => !!document.querySelector('[data-pd-u]')")
        t.ck(pg.evaluate("() => document.querySelector('#ocMapBox').classList.contains('maplibregl-map')"), 'перерисовка сняла с карты класс maplibregl-map')
        t.ck(pg.evaluate("() => { const m = document.querySelector('#ocMapBox canvas'); const h = document.querySelector('[data-oc-map] .oc-map-tg'); return !!m && !!h && m.getBoundingClientRect().top > h.getBoundingClientRect().top; }"),
             'карта участка нарисована выше своего раздела')
