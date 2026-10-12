# -*- coding: utf-8 -*-
"""План месяца, маршрут дня и нормы осмотра.

ТЗ рабочего дня осмотрщика, раздел 7 (запись графа tz-rabota-osmotrschika).

Что ловит сценарий:
  * план месяца не сохраняется из ячейки или не виден в календаре выездов;
  * маршрут дня не строится от дома и обратно, нет карты;
  * точка дома не ставится щелчком по карте;
  * убранный из предложений объект остаётся в маршруте;
  * «Назначить предложенные» не создаёт назначений на этот день;
  * правка нормы осмотра не меняет время осмотра в маршруте;
  * в консоли ошибки.

Тайлы OSM в проверке подменяются пустой картинкой: сценарий не зависит от
сети и не нагружает общедоступный сервер подложки.
"""
import base64

NAME = 'маршрут дня'

TOUCHES = ('app/pages/inspections/*', 'app/kernel/inspections.js', 'app/kernel/inspectionsDemo.js', 'app/vendor/leaflet/*')

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
K = "import('./app/kernel/inspections.js')"
WHO = 'Абдылдаев Айсултан Марсович'


def run(t):
    pg = t.page
    pg.route('https://tile.openstreetmap.org/**', lambda r: r.fulfill(status=200, content_type='image/png', body=PNG))
    t.open('#/inspections', wait='[data-ip-section]')
    pg.click('[data-ip-section="people"]')
    pg.locator('.ip-person-main[data-ip-person="%s"]' % WHO).click()

    # --- план месяца ----------------------------------------------------------
    pg.click('[data-ip-ptab="plan"]')
    t.wait_for('[data-ip-plan]')
    sel = pg.locator('select[data-ip-plan]').last
    day = sel.get_attribute('data-ip-plan')
    sel.select_option('Нарын')
    t.ck(t.wait_until("async ([w, d]) => ((await %s).planOf(w, d) || {}).region === 'Нарын'" % K, [WHO, day]),
         'область плана месяца не сохранилась из ячейки')
    pg.click('[data-ip-ptab="trips"]')
    t.wait_for('.ipc-cal')
    if day[:7] != pg.evaluate("() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }"):
        pg.click('[data-ipc-month="1"]')
    t.ck(t.wait_until("(d) => /Нарын/.test(document.querySelector('.ipc-cal-d[aria-label*=\"' + d.slice(8, 10) + '.' + d.slice(5, 7) + '\"] .ipc-plan')?.textContent || '')", day),
         'область плана не видна в календаре выездов')

    # --- маршрут --------------------------------------------------------------
    pg.click('[data-ip-ptab="route"]')
    t.ck(t.wait_for('.ip-map.leaflet-container', timeout=15000), 'карта маршрута не нарисована')
    t.ck(pg.locator('.ip-stop.home').count() == 2, 'маршрут не начинается и не кончается домом')
    t.ck(pg.locator('.ip-pin').count() >= 2, 'на карте нет точек маршрута')

    # дом — щелчком по карте
    before = pg.evaluate("async (w) => (await %s).profileOf(w).homeGps" % K, WHO)
    pg.click('[data-ip-route-home]')
    t.wait_for('.ip-map.leaflet-container')
    box = pg.locator('.ip-map').bounding_box()
    pg.mouse.click(box['x'] + box['width'] * 0.3, box['y'] + box['height'] * 0.7)
    t.ck(t.wait_until("async ([w, b]) => { const h = (await %s).profileOf(w).homeGps; return !!h && h !== b; }" % K, [WHO, before]),
         'точка дома не сохранилась щелчком по карте')

    # убрать предложенное
    t.wait_for('.ip-stop.home')
    skip = pg.locator('[data-ip-route-skip]')
    if skip.count():
        key = skip.first.get_attribute('data-ip-route-skip')
        skip.first.click()
        t.ck(t.wait_until("(k) => !document.querySelector('[data-ip-route-skip=\"' + k + '\"]')", key), 'убранный объект остался в маршруте')

    # назначить предложенные
    if pg.locator('[data-ip-route-assign]').count():
        rday = pg.input_value('[data-ip-route-set]')
        n0 = pg.evaluate("async ([w, d]) => (await %s).allAssignments().filter((a) => a.person === w && a.plannedAt === d && a.state !== 'removed').length" % K, [WHO, rday])
        want = int(pg.locator('[data-ip-route-assign]').inner_text().split('(')[1].rstrip(')'))
        pg.click('[data-ip-route-assign]')
        t.ck(t.wait_until("async ([w, d, n]) => (await %s).allAssignments().filter((a) => a.person === w && a.plannedAt === d && a.state !== 'removed').length === n" % K, [WHO, rday, n0 + want]),
             '«Назначить предложенные» не создало %s назначений на %s' % (want, rday))
    else:
        t.ck(False, 'в маршруте дня нет предложенных объектов (демо)')

    # --- нормы осмотра ---------------------------------------------------------
    first = pg.locator('.ip-stop:not(.home) .ip-stop-t').first.inner_text()
    pg.locator('.ip-person-main[data-ip-person=""]').click()
    pg.click('[data-ip-atab="norms"]')
    t.wait_for('[data-ip-norm]')
    t.ck(pg.locator('[data-ip-norm-take]').count() >= 1, 'нет норм «по факту» из истории осмотров')
    for k in ('production', 'civil', 'house', 'flat', 'land', 'other'):
        # Правка уходит при уходе из ячейки — как у человека (Tab), а не
        # отдельным событием: второй change от удаляемого поля запускал бы
        # перерисовку внутри перерисовки.
        pg.fill('[data-ip-norm="%s"][data-k="base"]' % k, '120')
        pg.press('[data-ip-norm="%s"][data-k="base"]' % k, 'Tab')
        t.wait_until("(k) => document.querySelector('[data-ip-norm=\"' + k + '\"][data-k=\"base\"]').value === '120'", k)
    pg.locator('.ip-person-main[data-ip-person="%s"]' % WHO).click()
    pg.click('[data-ip-ptab="route"]')
    t.wait_for('.ip-stop:not(.home) .ip-stop-t')
    after = pg.locator('.ip-stop:not(.home) .ip-stop-t').first.inner_text()
    t.ck(pg.locator('.toast').filter(has_text='не сохранил').count() == 0, 'правка норм не сохранилась: %s' % pg.locator('.toast').all_inner_texts())
    t.ck(first != after and 'осмотр 1' in after, 'правка нормы не изменила время осмотра в маршруте: «%s» → «%s»' % (first, after))
    t.ck(pg.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'страница прокручивается вбок')
