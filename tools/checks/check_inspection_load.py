# -*- coding: utf-8 -*-
"""Планирование: сетка «осмотрщик × день», «День осмотрщика», назначение по клетке.

Прежде — «Загрузка» раздела «Осмотрщики и назначения» (решение пользователя 29.10.2026:
«осмотры и назначения в регионалах стоит обьединить»; «нельзя просматривать загруженность,
видеть маршруты по дням для осмотрщиков»; «все механики должны быть подружены между собой»).
С 17.11.2026 (ТЗ tz-ekran-regionalov-…, этапы 1–3) — центр Планирования.

Что ловит сценарий:
  * меню не в одну строку «Сегодня · Планирование · Люди · Кадастр · Журнал»; снова есть
    отдельная полоса режимов; у Планирования нет переключателя «К назначению · Назначено»;
  * в Планировании нет сетки; в ней не те осмотрщики, что в срезе, или не столько дней,
    сколько выбрано; число в клетке не совпадает с живыми назначениями на день;
  * клетка не открывает «День осмотрщика» справа: выезды дня, отчёты, «Маршрут дня»,
    «Назначить на этот день»; у нерабочего дня есть «Назначить»;
  * «Маршрут дня» открывает не того осмотрщика или не тот день;
  * «Назначить на этот день» не подставляет осмотрщика и дату; клетка не выросла на 1;
  * отмечен объект очереди — щелчок по клетке не подставил осмотрщика и дату в панель;
  * перетаскивание назначения на клетку не перенесло его; «Отменить» не вернуло;
  * слой «Факт» без отметок утреннего и вечернего отчётов по прошедшим дням;
  * «Карта» не убирает сетку; прежний адрес «Загрузки» (s=people&t=load) не ведёт в сетку;
  * клетка ниже 44 px; прокрутка страницы вбок на 1600, 1100, 760;
  * ошибки консоли.
"""
NAME = 'планирование: сетка «осмотрщик × день»'

TOUCHES = ('app/pages/inspections/*', 'app/kernel/inspections.js')

LIVE_ON = """async ([name, day]) => { const k = await import('./app/kernel/inspections.js');
  return k.allAssignments().filter((a) => a.person === name && a.plannedAt === day && k.isLive(a)).length; }"""
TRIPS = """async ([name, day]) => { const M = await import('./app/pages/inspections/model.js'); return M.tripsOfDay(M.summaries(), name, day).length; }"""
ACTIVE = """async () => { const M = await import('./app/pages/inspections/model.js'); return M.inspectorRows(M.summaries()).filter((p) => !p.fired).map((p) => p.name); }"""


def no_hscroll(t, where):
    t.ck(t.page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'прокрутка вбок: ' + where)


def run(t):
    pg = t.page
    pg.set_viewport_size({'width': 1600, 'height': 950})
    t.open('#/inspections?s=people', wait='.ip-page')
    menu = pg.eval_on_selector_all('.ip-sections [data-ip-section]', "els => els.map((e) => [e.dataset.ipSection, e.textContent.replace(/\\s*\\d+\\s*$/, '').trim()])")  # «Журнал» — с числом событий
    t.ck(menu == [['today', 'Сегодня'], ['assign', 'Планирование'], ['people', 'Люди'], ['cadastre', 'Кадастр'], ['history', 'Журнал']],
         'меню не «Сегодня · Планирование · Люди · Кадастр · Журнал»: %s' % menu)
    t.ck(pg.locator('[data-ip-team]').count() == 0, 'у «Людей» осталась полоса режимов')
    pg.click('.ip-slice [data-ip-mode="all"]')
    pg.click('[data-ip-section="assign"]')
    t.wait_for('.ip-qswitch')
    modes = pg.eval_on_selector_all('.ip-work .ip-qswitch [data-ip-team]', 'els => els.map((e) => e.dataset.ipTeam)')
    t.ck(modes == ['queue', 'assigned'], 'переключатель очереди в списке не тот: %s' % modes)
    if pg.locator('[data-ip-center="grid"][aria-pressed="false"]').count():
        pg.click('[data-ip-center="grid"]')
    t.ck(t.wait_for('.ip-board .ip-load-tbl'), 'в Планировании нет сетки «осмотрщик × день»')

    # Осмотрщики среза — строками; дней — по выбору.
    names = pg.eval_on_selector_all('.ip-load-tbl tbody .ip-ld-name', 'els => els.map((e) => e.dataset.ipPerson)')
    want = pg.evaluate(ACTIVE)
    t.ck(sorted(names) == sorted(want), 'в сетке не те осмотрщики, что в срезе: %s / %s' % (names, want))
    for n, label in ((5, 'неделя'), (20, 'месяц'), (10, '2 недели')):
        pg.click('[data-ip-load-days="%d"]' % n)
        t.ck(t.wait_until("([n]) => document.querySelectorAll('.ip-load-tbl thead .ip-ld-day').length === n", [n]), 'дней в сетке не %d (%s)' % (n, label))
    t.ck(all(pg.locator('.ip-ld-b').nth(i).bounding_box()['height'] >= 44 for i in range(3)), 'клетка ниже 44 px')
    no_hscroll(t, 'сетка 1600')

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
        t.ck(t.wait_for('.ip-detail-pane'), 'нерабочий день не открылся справа')
        t.ck(pg.locator('.ip-detail-pane [data-ip-load-assign]').count() == 0 and pg.locator('.ip-detail-pane [data-ip-load-route]').count() == 1,
             'у нерабочего дня есть «Назначить» или нет «Маршрут дня»')

    # Рабочий день с объектами — «День осмотрщика» справа.
    cell = pg.locator('.ip-ld.is-some [data-ip-load], .ip-ld.is-full [data-ip-load], .ip-ld.is-over [data-ip-load]').first
    key = cell.get_attribute('data-ip-load')
    name, day = key.split('|')
    cell.click()
    t.ck(t.wait_until("(k) => !!document.querySelector(`.ip-ld.on [data-ip-load=\"${k}\"]`)", key), 'клетка не выбрана')
    t.ck(t.wait_until("(n) => (document.querySelector('.ip-detail-pane h2') || {}).textContent === n", name), 'справа не «День осмотрщика» %s' % name)
    n_trips = pg.evaluate(TRIPS, [name, day])
    t.ck(pg.locator('.ip-detail-pane .ip-dp-trip').count() == n_trips, 'выездов дня в панели не %d' % n_trips)
    heads = pg.eval_on_selector_all('.ip-detail-pane .ip-sec h3', 'els => els.map((e) => e.textContent.trim())')
    t.ck('Утренний отчёт' in heads and 'Вечерний отчёт' in heads, 'в «Дне осмотрщика» нет отчётов: %s' % heads)

    # Маршрут дня — тот осмотрщик и тот день.
    pg.click('.ip-detail-pane [data-ip-load-route]')
    t.ck(t.wait_until("(d) => (document.querySelector('[data-ip-route-set]') || {}).value === d", day), 'маршрут открыт не на день %s' % day)
    t.ck(name in pg.inner_text('.ip-card-head'), 'маршрут открыт не у %s' % name)

    # Назначить на этот день — осмотрщик и дата подставлены, клетка растёт.
    pg.click('[data-ip-section="assign"]')
    t.wait_for('.ip-board [data-ip-load="%s"]' % key)
    pg.click('[data-ip-load="%s"]' % key)
    pg.click('.ip-detail-pane [data-ip-load-assign="%s"]' % key)
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
    t.ck(t.wait_until("([k, n]) => { const b = document.querySelector(`[data-ip-load=\"${k}\"] b`); return b && b.textContent.trim() === String(n); }",
                      [key, before + 1]), 'клетка дня не выросла после назначения')
    if pg.locator('[data-ip-assign-day-clear]').count():
        pg.click('[data-ip-assign-day-clear]')

    # Отмечен объект — щелчок по клетке подставляет осмотрщика и день.
    row = pg.locator('[data-ip-check]').first
    row.check()
    free = pg.locator('.ip-ld:not(.is-off) [data-ip-load]').nth(3)
    fkey = free.get_attribute('data-ip-load')
    free.click()
    fname, fday = fkey.split('|')
    t.ck(t.wait_until("([n, d]) => (document.querySelector('[data-ip-f-person]') || {}).value === n && (document.querySelector('[data-ip-f-date]') || {}).value === d", [fname, fday]),
         'щелчок по клетке с отмеченным объектом не подставил %s и %s' % (fname, fday))
    pg.click('[data-ip-bulk-clear]') if pg.locator('[data-ip-bulk-clear]').count() else None

    # Перетаскивание назначения на другую клетку — перенос; «Отменить» возвращает.
    pg.click('[data-ip-team="assigned"]')
    t.wait_for('[data-ip-aperson]')
    pg.locator('.ip-aperson:not(.ip-aperson-all)').first.click()
    t.wait_for('tr[data-ip-row]')
    aid = pg.locator('tr[data-ip-row]').first.get_attribute('data-ip-row')
    was = pg.evaluate("async (id) => { const k = await import('./app/kernel/inspections.js'); const a = k.assignmentById(id); return [a.person, a.plannedAt]; }", aid)
    dest = pg.locator('.ip-ld:not(.is-off) [data-ip-load]').nth(6)
    dkey = dest.get_attribute('data-ip-load')
    pg.drag_and_drop('tr[data-ip-row="%s"]' % aid, '[data-ip-load="%s"]' % dkey)
    dname, dday = dkey.split('|')
    t.ck(t.wait_until("async ([w, n, d]) => { const k = await import('./app/kernel/inspections.js'); return k.allAssignments().some((a) => k.isLive(a) && a.person === n && a.plannedAt === d && a.ocId === w); }",
                      [pg.evaluate("async (id) => (await import('./app/kernel/inspections.js')).assignmentById(id).ocId", aid), dname, dday]),
         'перетаскивание не перенесло назначение на %s' % dkey)
    t.ck(t.wait_for('.toast.has-act .toast-act'), 'после переноса нет «Отменить»')
    oc = pg.evaluate("async (id) => (await import('./app/kernel/inspections.js')).assignmentById(id).ocId", aid)
    pg.click('.toast.has-act .toast-act')
    t.ck(t.wait_until("async ([oc, p, d]) => { const k = await import('./app/kernel/inspections.js'); return k.allAssignments().some((a) => k.isLive(a) && a.ocId === oc && a.person === p && (a.plannedAt || '') === (d || '')); }",
                      [oc, was[0], was[1]]), '«Отменить» не вернуло осмотрщика и дату: %s' % was)

    # Слой «Факт»: по прошедшим дням — отметки утреннего и вечернего отчётов.
    pg.click('[data-ip-load-days="10"]')
    pg.click('[data-ip-layer="fact"]')
    t.ck(t.wait_for('.ip-ld.is-fact'), 'в слое «Факт» нет клеток прошедших дней')
    t.ck(pg.locator('.ip-ld.is-fact .ip-fx').count() >= 2, 'в слое «Факт» нет отметок «У» и «В»')
    # Легенда «Факт» (26.11.2026 «Поплыло»): значок и подпись — одной парой, в одну строку, без полоски-образца в значке.
    leg = pg.evaluate("""() => [...document.querySelectorAll('.ip-load-legend .ip-lg-fx')].map((s) => ({
      one: Math.abs(s.querySelector('.ip-fx').getBoundingClientRect().top - s.getBoundingClientRect().top) < 6 && s.getBoundingClientRect().height < 26,
      bar: getComputedStyle(s, '::before').content !== 'none' }))""")
    t.ck(len(leg) == 3 and all(x['one'] and not x['bar'] for x in leg), 'легенда «Факт» поплыла: %s' % leg)
    pg.click('[data-ip-layer="plan"]')

    # «Карта» — без сетки; прежний адрес «Загрузки» — в сетку.
    pg.click('[data-ip-center="map"]')
    t.ck(t.wait_until("() => !document.querySelector('.ip-board')"), '«Карта» не убрала сетку')
    pg.click('[data-ip-center="grid"]')
    t.open('#/inspections?s=people&t=load', wait='.ip-page')
    t.ck(t.wait_for('.ip-board .ip-load-tbl') and pg.locator('[data-ip-section="assign"][aria-selected="true"]').count() == 1,
         'прежний адрес «Загрузки» не открыл сетку Планирования')

    # Граница правой панели (26.11.2026 «Подвинул блок справа и перерисовка — привет»): шире панель — уже сетка,
    # островки сцены не прыгают по высоте (перезапись style стирала --scene-top).
    sep = pg.locator('[data-ip-split="pane"]')
    if t.ck(sep.count() == 1, 'нет границы правой панели'):
        box = "() => { const b = document.querySelector('.ip-board').getBoundingClientRect(), c = document.querySelector('.ip-cview').getBoundingClientRect(); return [Math.round(b.top), Math.round(b.right), Math.round(c.top)]; }"
        was = pg.evaluate(box)
        sep.focus()
        for _ in range(3):
            pg.keyboard.press('Shift+ArrowLeft')
        now = pg.evaluate(box)
        t.ck(now[0] == was[0] and now[2] == was[2] and now[1] < was[1],
             'граница панели: сетка сдвинулась по высоте или не сузилась: было %s, стало %s' % (was, now))
        sep.dblclick()

    for w in (1100, 760):
        pg.set_viewport_size({'width': w, 'height': 900})
        pg.wait_for_timeout(200)
        no_hscroll(t, 'сетка %d' % w)
