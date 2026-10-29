# -*- coding: utf-8 -*-
"""Раздел «Осмотрщики и назначения»: загрузка по дням и связь механик
(решение пользователя 29.10.2026: «осмотры и назначения в регионалах стоит
обьединить»; «нельзя просматривать загруженность, видеть маршруты по дням для
осмотрщиков»; «все механики должны быть подружены между собой»).

Что ловит сценарий:
  * наверху снова две кнопки «Назначения» и «Осмотрщики» вместо одной; у раздела
    нет полосы режимов «Осмотрщики · К назначению · Назначено» или режимы не
    переключаются;
  * у «Все осмотрщики» нет вкладки «Загрузка» первой; в сетке не все
    осмотрщики отбора или не столько дней, сколько выбрано (неделя, 2 недели,
    месяц); число в клетке не совпадает с числом живых назначений на день;
    нерабочий день не помечен;
  * касание клетки не показывает день: объекты дня, «Маршрут дня»,
    «Назначить на этот день»; у нерабочего дня есть «Назначить»;
  * «Маршрут дня» открывает не того осмотрщика или не тот день;
  * «Назначить на этот день» не подставляет осмотрщика и дату в панель, нет
    отметки «Назначение на …»; после назначения клетка дня не выросла на 1;
  * клетка ниже 44 px; прокрутка страницы вбок на 1600, 1100, 760;
  * ошибки консоли.
"""
NAME = 'осмотрщики и назначения: загрузка'

TOUCHES = ('app/pages/inspections/*', 'app/kernel/inspections.js')

LIVE_ON = """async ([name, day]) => { const k = await import('./app/kernel/inspections.js');
  return k.allAssignments().filter((a) => a.person === name && a.plannedAt === day && k.isLive(a)).length; }"""


def no_hscroll(t, where):
    t.ck(t.page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'прокрутка вбок: ' + where)


def run(t):
    pg = t.page
    pg.set_viewport_size({'width': 1600, 'height': 950})
    t.open('#/inspections?s=people', wait='.ip-page')
    t.ck(pg.locator('[data-ip-section="assign"]').count() == 0 and pg.locator('[data-ip-section="people"]').count() == 1
         and 'Осмотрщики и назначения' in pg.inner_text('[data-ip-section="people"]'), 'наверху не одна кнопка «Осмотрщики и назначения»')
    modes = pg.eval_on_selector_all('[data-ip-team]', 'els => els.map((e) => e.dataset.ipTeam)')
    t.ck(modes == ['people', 'queue', 'assigned'], 'полоса режимов раздела не та: %s' % modes)

    pg.click('.ip-person-main[data-ip-person=""]')
    tabs = pg.eval_on_selector_all('[data-ip-atab]', 'els => els.map((e) => e.dataset.ipAtab)')
    t.ck(tabs[:1] == ['load'], '«Загрузка» не первая вкладка «Все осмотрщики»: %s' % tabs)
    pg.click('[data-ip-atab="load"]')
    t.ck(t.wait_for('.ip-load-tbl'), 'нет сетки загрузки')

    # Все осмотрщики отбора — строками; дней — по выбору.
    pg.click('[data-ip-mode="all"]')
    t.wait_until("() => document.querySelectorAll('.ip-load-tbl tbody tr').length > 0")
    names = pg.eval_on_selector_all('.ip-load-tbl tbody .ip-ld-name', 'els => els.map((e) => e.dataset.ipPerson)')
    listed = pg.eval_on_selector_all('.ip-person-main[data-ip-person]:not([data-ip-person=""])', 'els => els.map((e) => e.dataset.ipPerson)')
    t.ck(sorted(names) == sorted(listed), 'в сетке не те осмотрщики, что в списке: %s / %s' % (names, listed))
    for n, label in ((5, 'неделя'), (20, 'месяц'), (10, '2 недели')):
        pg.click('[data-ip-load-days="%d"]' % n)
        t.ck(t.wait_until("([n]) => document.querySelectorAll('.ip-load-tbl thead .ip-ld-day').length === n", [n]), 'дней в сетке не %d (%s)' % (n, label))
    t.ck(all(pg.locator('.ip-ld-b').nth(i).bounding_box()['height'] >= 44 for i in range(3)), 'клетка ниже 44 px')
    no_hscroll(t, 'загрузка 1600')

    # Число в клетке — живые назначения на день.
    keys = pg.eval_on_selector_all('.ip-ld:not(.is-off) [data-ip-load]', 'els => els.slice(0, 40).map((e) => [e.dataset.ipLoad, e.querySelector("b").textContent.trim()])')
    bad = []
    for key, shown in keys:
        name, day = key.split('|')
        n = pg.evaluate(LIVE_ON, [name, day])
        if (str(n) if n else '—') != shown:
            bad.append((key, shown, n))
    t.ck(not bad, 'число в клетке не равно назначениям дня: %s' % bad[:3])
    off = pg.locator('.ip-ld.is-off [data-ip-load]')
    if off.count():
        off.first.click()
        t.ck(t.wait_for('.ip-load-day'), 'нерабочий день не открылся')
        t.ck(pg.locator('[data-ip-load-assign]').count() == 0 and pg.locator('[data-ip-load-route]').count() == 1,
             'у нерабочего дня есть «Назначить» или нет «Маршрут дня»')

    # Рабочий день с объектами — день под сеткой.
    cell = pg.locator('.ip-ld.is-some [data-ip-load], .ip-ld.is-full [data-ip-load], .ip-ld.is-over [data-ip-load]').first
    key = cell.get_attribute('data-ip-load')
    name, day = key.split('|')
    cell.click()
    t.ck(t.wait_until("(k) => !!document.querySelector(`.ip-ld.on [data-ip-load=\"${k}\"]`)", key), 'клетка не выбрана')
    n_day = pg.evaluate(LIVE_ON, [name, day])
    t.ck(pg.locator('.ip-load-objs li').count() == n_day, 'объектов дня под сеткой не %d' % n_day)
    t.ck(pg.locator('[data-ip-load-route]').count() == 1 and pg.locator('[data-ip-load-assign]').count() == 1, 'у дня нет «Маршрут дня» и «Назначить на этот день»')

    # Маршрут дня — тот осмотрщик и тот день.
    pg.click('[data-ip-load-route]')
    t.ck(t.wait_until("(d) => (document.querySelector('[data-ip-route-set]') || {}).value === d", day), 'маршрут открыт не на день %s' % day)
    t.ck(name in pg.inner_text('.ip-card-head'), 'маршрут открыт не у %s' % name)

    # Назначить на этот день — осмотрщик и дата подставлены, клетка растёт.
    pg.click('[data-ip-team="people"]')
    pg.click('.ip-person-main[data-ip-person=""]')
    pg.click('[data-ip-atab="load"]')
    t.wait_for('.ip-load-tbl')
    if not pg.locator('[data-ip-load-assign="%s"]' % key).count():
        pg.click('[data-ip-load="%s"]' % key)
    pg.click('[data-ip-load-assign="%s"]' % key)
    t.ck(t.wait_for('.ip-assign-day'), 'нет отметки «Назначение на …» над очередью')
    t.ck(name in pg.inner_text('.ip-assign-day'), 'в отметке нет осмотрщика')
    t.ck(pg.locator('[data-ip-team="queue"][aria-selected="true"]').count() == 1, 'не открыт режим «К назначению»')
    t.ck(t.wait_until("(d) => (document.querySelector('[data-ip-f-date]') || {}).value === d", day), 'плановая дата в панели не %s' % day)
    who = pg.eval_on_selector('[data-ip-f-person]', 'e => e.value') if pg.locator('[data-ip-f-person]').count() else ''
    t.ck(who == name, 'в панели не %s: %s' % (name, who))
    before = pg.evaluate(LIVE_ON, [name, day])
    pg.click('[data-ip-f-ok]')
    t.ck(t.wait_until("async ([n, d, b]) => { const k = await import('./app/kernel/inspections.js'); return k.allAssignments().filter((a) => a.person === n && a.plannedAt === d && k.isLive(a)).length === b + 1; }",
                      [name, day, before], 9000), 'назначение не легло на выбранный день')
    pg.click('[data-ip-team="people"]')
    pg.click('.ip-person-main[data-ip-person=""]')
    pg.click('[data-ip-atab="load"]')
    t.ck(t.wait_until("([k, n]) => { const b = document.querySelector(`[data-ip-load=\"${k}\"] b`); return b && b.textContent.trim() === String(n); }",
                      [key, before + 1]), 'клетка дня не выросла после назначения')

    for w in (1100, 760):
        pg.set_viewport_size({'width': w, 'height': 900})
        pg.wait_for_timeout(200)
        no_hscroll(t, 'загрузка %d' % w)
