# -*- coding: utf-8 -*-
"""План месяца, маршрут дня и нормы осмотра.

ТЗ рабочего дня осмотрщика, раздел 7 (запись графа tz-rabota-osmotrschika).

Что ловит сценарий:
  * план месяца не сохраняется из ячейки или не виден в календаре выездов;
  * маршрут дня не строится от дома и обратно, нет карты;
  * точка дома не ставится щелчком по карте;
  * убранный из предложений объект остаётся в маршруте;
  * «Назначить предложенные» не создаёт назначений на этот день;
  * правка нормы осмотра не меняет расчёт маршрута; прогноз времени осмотра
    снова виден на экране (убран 13.10.2026);
  * в консоли ошибки.

Тайлы OSM в проверке подменяются пустой картинкой: сценарий не зависит от
сети и не нагружает общедоступный сервер подложки.
"""
import base64

NAME = 'маршрут дня'

TOUCHES = ('app/pages/inspections/*', 'app/kernel/inspections.js', 'app/kernel/inspectionsDemo.js', 'app/vendor/maplibre/*', 'app/kernel/mapgl.js', 'app/kernel/cadastreLayersGL.js')

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
K = "import('./app/kernel/inspections.js')"
WHO = 'Абдылдаев Айсултан Марсович'


def run(t):
    pg = t.page
    pg.route('https://tile.openstreetmap.org/**', lambda r: r.fulfill(status=200, content_type='image/png', body=PNG))
    # Кадастровые слои (участки и строения вокруг, с масштаба 16) — пустым
    # ответом: проверка не зависит ни от прокси, ни от портала.
    EMPTY = '{"type":"FeatureCollection","features":[]}'
    pg.route('http://127.0.0.1:8787/portal/**', lambda r: r.fulfill(status=200, content_type='application/json', body=EMPTY))
    pg.route('**/cadastre/**', lambda r: r.fulfill(status=200, content_type='application/json', body=EMPTY))
    t.open('#/inspections', wait='[data-ip-section]')
    pg.click('[data-ip-section="people"]')
    pg.locator('.ip-person-main[data-ip-person="%s"]' % WHO).click()

    # --- план месяца ----------------------------------------------------------
    pg.click('[data-ip-ptab="plan"]')
    t.wait_for('[data-ip-plan]')
    sel = pg.locator('select[data-ip-plan]').last
    day = sel.get_attribute('data-ip-plan')
    # Область — домашняя у осмотрщика (Бишкек): с 14.10.2026 демо-объекты
    # стоят на настоящих участках, и Нарын (≈ 255 км от дома) в день с
    # возвращением не укладывается — предложений там честно нет.
    sel.select_option('Бишкек')
    t.ck(t.wait_until("async ([w, d]) => ((await %s).planOf(w, d) || {}).region === 'Бишкек'" % K, [WHO, day]),
         'область плана месяца не сохранилась из ячейки')
    pg.click('[data-ip-ptab="trips"]')
    t.wait_for('.ipc-cal')
    if day[:7] != pg.evaluate("() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }"):
        pg.click('[data-ipc-month="1"]')
    t.ck(t.wait_until("(d) => /Бишкек/.test(document.querySelector('.ipc-cal-d[aria-label*=\"' + d.slice(8, 10) + '.' + d.slice(5, 7) + '\"] .ipc-plan')?.textContent || '')", day),
         'область плана не видна в календаре выездов')

    # --- маршрут --------------------------------------------------------------
    pg.click('[data-ip-ptab="route"]')
    t.ck(t.wait_for('.ip-map.maplibregl-map', timeout=15000), 'карта маршрута не нарисована')
    t.ck(pg.locator('.ip-stop.home').count() == 2, 'маршрут не начинается и не кончается домом')
    t.ck(pg.locator('.ip-pin').count() >= 2, 'на карте нет точек маршрута')

    # Зум кнопкой и колесом: масштаб меняется, значки стоят на своих точках
    # (замечания пользователя 13.10.2026: «при прокрутке маркеры слетают»,
    # «зум перестал работать» — перегруппировка значков при каждом масштабе
    # и перевписывание маршрута по наблюдателю размера ставили значки мимо
    # точек и перехватывали зум).
    # Карта — MapLibre (13.10.2026): значок — HTML-элемент у своей точки,
    # box._pins — значки и их координаты.
    drift = """() => { const box = document.querySelector('[data-ip-map]'); const map = box._map; const b = box.getBoundingClientRect(); let d = 0;
      (box._pins || []).forEach(({ el, ll }) => { const p = map.project(ll); const r = el.getBoundingClientRect();
        d = Math.max(d, Math.abs(r.left + r.width / 2 - b.left - p.x), Math.abs(r.top + r.height / 2 - b.top - p.y)); });
      return [map.getZoom(), Math.round(d)]; }"""
    idle = "() => { const b = document.querySelector('[data-ip-map]'); const m = b && b._map; return !!m && m.loaded() && !m.isMoving() && !m.isZooming(); }"
    t.wait_until(idle)
    t.wait(300)
    z0, _ = pg.evaluate(drift)
    pg.click('[data-ip-map] .maplibregl-ctrl-zoom-in')   # своя кнопка: у «Осмотров» есть ещё карта-сцена
    # Масштаб — списком: число вторым доводом wait_until считает пределом ожидания.
    t.wait_until("([z]) => { const m = document.querySelector('[data-ip-map]')._map; return m.getZoom() > z && !m.isMoving() && !m.isZooming(); }", [z0])
    z1, d1 = pg.evaluate(drift)
    t.ck(z1 > z0 and d1 <= 3, 'зум кнопкой: масштаб %s → %s, значки мимо точек на %s px' % (z0, z1, d1))
    mb = pg.locator('.ip-map').bounding_box()
    pg.mouse.move(mb['x'] + mb['width'] * 0.7, mb['y'] + mb['height'] * 0.4)
    for _ in range(3):
        pg.mouse.wheel(0, -250)
        t.wait(90)
    t.wait_until("([z]) => { const m = document.querySelector('[data-ip-map]')._map; return m.getZoom() > z && !m.isMoving() && !m.isZooming(); }", [z1])
    t.wait(500)
    z2, d2 = pg.evaluate(drift)
    t.ck(z2 > z1 and d2 <= 3, 'зум колесом: масштаб %s → %s, значки мимо точек на %s px' % (z1, z2, d2))

    # дом — щелчком по карте
    before = pg.evaluate("async (w) => (await %s).profileOf(w).homeGps" % K, WHO)
    pg.click('[data-ip-route-home]')
    t.wait_for('.ip-map.maplibregl-map')
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
    # С 13.10.2026 время осмотра в маршруте не показывается (указание
    # пользователя «Прогнозируемое время осмотра надо убрать»; «Только скрыть
    # в маршруте») — нормы проверяются по расчёту маршрута, а на экране —
    # что прогноза нет.
    stop_t = pg.locator('.ip-stop:not(.home) .ip-stop-t').first.inner_text()
    t.ck('осмотр' not in stop_t and '→' not in stop_t, 'в маршруте снова прогноз времени осмотра: «%s»' % stop_t)
    t.ck(pg.locator('.ip-tile', has_text='Осмотры').count() == 0 and pg.locator('.ip-tile', has_text='Возвращение').count() == 0,
         'в плитках маршрута снова «Осмотры» или «Возвращение»')
    INSP = """async (w) => { const m = await import('./app/pages/inspections/model.js'); const r = await import('./app/pages/inspections/route.js'); const day = document.querySelector('[data-ip-route-set]').value; return r.dayRoute(m.summaries(), w, day, new Set()).stops.map((x) => x.inspect).join(','); }"""
    first = pg.evaluate(INSP, WHO)
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
    after = pg.evaluate(INSP, WHO)
    t.ck(pg.locator('.toast').filter(has_text='не сохранил').count() == 0, 'правка норм не сохранилась: %s' % pg.locator('.toast').all_inner_texts())
    t.ck(first != after, 'правка нормы не изменила расчёт времени осмотра в маршруте: «%s» → «%s»' % (first, after))
    t.ck(pg.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'страница прокручивается вбок')
