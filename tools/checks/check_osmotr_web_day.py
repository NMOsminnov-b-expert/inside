# -*- coding: utf-8 -*-
"""
Веб-страница осмотрщика, этап 3 (16.11.2026): отчёт дня и запросы документов
из Кадастра — как в приложении «Осмотр» (EstateDay.kt, EstateCadastre.kt).

Что ловит сценарий:
  * «Начал день» не сохраняет утренний отчёт (одометр, «Одометра нет»);
  * вечерний отчёт сдаётся без причины у «Частично» и «Не состоялся»;
    «Не состоялся» не уходит исходом выезда; пробег, осмотренные, частичные
    и комментарий не доходят до отчёта;
  * на «Сегодня» нет строки «Отчёт дня» с тем, что сдано;
  * запрос документов: ответ «Получен» без файла принимается; ответ не доходит
    до строки запроса; нет строки запросов в меню и на «Сегодня»;
  * запрос на 120 документов: нет филиала с адресом, ответственным (tel:) и
    кнопкой «Маршрут»; строки не ограничены; поиск
    и отбор «Отвечено» не работают; форма ответа видна без раскрытия; после
    ответа не раскрывается следующая; осмотрщику видна «Причина ЦОД»;
  * на 360 пикселях экраны прокручиваются вбок.
"""
import datetime

from harness import use_cadastre_fixture

NAME = 'отчёт дня и запросы (веб)'

TOUCHES = ('app/pages/osmotr/*', 'app/kernel/inspections.js', 'app/pages/inspections/route.js')

REPORT = """async ([kind]) => { const k = await import('./app/kernel/inspections.js'); const s = (await import('./app/kernel/session.js')).session.state;
  const d = new Date(); const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return k.reportOf(s.person, iso, kind); }"""
PNG = bytes.fromhex('89504e470d0a1a0a0000000d4948445200000001000000010806000000'
                    '1f15c4890000000d4944415478da63f8cfc0f01f0005000201a5c0a3d40000000049454e44ae426082')


def run(t):
    pg = t.page
    use_cadastre_fixture(pg)
    # Пробег по дорогам — внешний сервис; в проверке его нет (ответ «не посчитан»).
    pg.route('**/route/v1/**', lambda r: r.fulfill(status=200, content_type='application/json', body='{"code":"NoRoute","routes":[]}'))
    pg.set_viewport_size({'width': 400, 'height': 860})
    t.open('#/osmotr', wait='.om-app[data-v="today"]')
    today = datetime.date.today().isoformat()
    # Два выезда на сегодня: один — «Частично», другой — «Не состоялся».
    trips = pg.evaluate("""async (day) => { const k = await import('./app/kernel/inspections.js'); const s = (await import('./app/kernel/session.js')).session.state;
      const list = k.assignmentsOfPerson(s.person).filter((a) => a.state !== 'done').slice(0, 2);
      list.forEach((a) => k.takeForDay(a.id, day)); k.changed(); return list.map((a) => ({ id: a.id, typeId: a.typeId, ocId: a.ocId })); }""", today)
    t.ck(len(trips) == 2, 'нет двух открытых назначений на день — сценарию не на чем проверить')

    t.ck(t.wait_until("() => [...document.querySelectorAll('.om-row')].some((r) => r.textContent.includes('Отчёт дня'))"), 'на «Сегодня» нет «Отчёт дня»')
    t.ck('день не начат' in pg.locator('.om-row', has_text='Отчёт дня').inner_text(), 'строка «Отчёт дня» не говорит, что день не начат')

    # --- утро ---
    t.open('#/osmotr?v=report', wait='[data-morning]')
    pg.fill('#om-odo', '120345')
    pg.locator('[data-morning] button[type=submit]').click()
    t.ck(t.wait_until("async () => ((await (%s)(['morning'])) || {}).odometer === '120345'" % REPORT), 'утренний отчёт не сохранился')
    t.ck(t.wait_until("() => document.querySelector('[data-morning]').textContent.includes('День начат')"), 'нет «День начат в …»')

    # --- вечер: без причин не сдаётся ---
    t.ck(pg.locator('[data-evening] .om-trip').count() >= 2, 'в вечернем отчёте нет выездов дня')
    a, b = trips
    pg.locator('[data-trip="%s"] input[value=partial]' % a['id']).check(force=True)
    pg.locator('[data-trip="%s"] input[value=failed]' % b['id']).check(force=True)
    pg.fill('#om-km', '84')
    pg.locator('[data-evening] button[type=submit]').click()
    t.ck(pg.locator('.om-trip-err:not([hidden])').count() == 2, 'вечерний отчёт без причин не остановлен')
    t.ck(pg.evaluate(REPORT, ['evening']) is None, 'вечерний отчёт сдан без причин')
    pg.fill('#om-pr-%s' % a['id'], 'Не пустили на второй этаж')
    pg.locator('[data-trip="%s"] input[name="f_%s"][value="Нет доступа"]' % (b['id'], b['id'])).check(force=True)
    pg.fill('#om-day-note', 'Дождь')
    pg.locator('[data-evening] button[type=submit]').click()
    t.ck(t.wait_until("async ([a]) => { const r = await (%s)(['evening']); return r && r.km === '84' && r.note === 'Дождь' && r.partial.length === 1 && r.partial[0].assignId === a && r.partial[0].reason === 'Не пустили на второй этаж'; }" % REPORT, [a['id']]),
         'вечерний отчёт не дошёл (пробег, частично с причиной, комментарий)')
    t.ck(t.wait_until("""async ([t, c]) => (await import('./app/kernel/inspections.js')).eventsOf({ typeId: t, ocId: c }).some((e) => e.kind === 'outcome' && e.text === 'Нет доступа')""", [b['typeId'], b['ocId']]),
         '«Не состоялся» не ушло исходом выезда')
    t.open('#/osmotr', wait='.om-app[data-v="today"]')
    t.ck('сдан' in pg.locator('.om-row', has_text='Отчёт дня').inner_text(), 'на «Сегодня» не видно, что отчёт сдан')

    # --- запрос документов: создаём сами (120 строк, филиал), отвечаем ---
    req = pg.evaluate("""async ([t, c]) => { const k = await import('./app/kernel/inspections.js'); const s = (await import('./app/kernel/session.js')).session.state;
      const docs = ['Технический паспорт', 'Выписка из ЕГРП']; for (let i = 3; i <= 120; i++) docs.push('Документ ' + i);
      const r = k.createCadRequest({ person: s.person, branch: 'kb-osh', rows: docs.map((doc) => ({ typeId: t, ocId: c, doc, note: 'причина цод' })) });
      return { id: r.id, rows: r.rows.map((x) => x.id) }; }""", [a['typeId'], a['ocId']])
    t.open('#/osmotr?v=menu', wait='.om-app[data-v="menu"]')
    t.ck(pg.locator('.om-row', has_text='Запросы документов').locator('.om-n').inner_text().strip() not in ('', '0'), 'в меню нет счётчика ждущих запросов')
    t.open('#/osmotr?v=cad', wait='[data-req]')
    t.ck('ответ 0 из 120' in pg.locator('[data-req="%s"]' % req['id']).inner_text(), 'в списке запросов нет сводки «ответ 0 из 120»')
    pg.locator('[data-req="%s"]' % req['id']).click()
    t.wait_for('.om-branch')
    br = pg.locator('.om-branch').inner_text()
    t.ck('Ошский филиал' in br and 'Ташиев' in br, 'нет филиала и ответственного: %r' % br)
    t.ck(pg.locator('.om-branch a[href^="tel:"]').count() == 1, 'телефон ответственного — не ссылка tel:')
    t.ck(pg.locator('.om-branch a.om-route').count() == 1, 'у филиала нет кнопки «Маршрут»')
    t.ck(pg.locator('.om-cadline').count() == 60 and 'уточните поиск' in pg.locator('.om-app').inner_text(), '120 строк не ограничены 60 с подсказкой')
    t.ck(pg.locator('form[data-cad]').count() == 0, 'форма ответа видна без раскрытия строки')
    t.ck('причина цод' not in pg.locator('.om-app').inner_text().lower(), '«Причина ЦОД» видна осмотрщику')
    pg.fill('#om-cad-q', 'ЕГРП')
    t.ck(t.wait_until("() => document.querySelectorAll('.om-cadline').length === 1"), 'поиск по документу не отобрал одну строку')
    pg.fill('#om-cad-q', '')
    t.ck(t.wait_until("() => document.querySelectorAll('.om-cadline').length === 60"), 'сброс поиска не вернул строки')
    pg.locator('[data-cad-open="%s"]' % req['rows'][0]).click()
    f1 = pg.locator('form[data-row="%s"]' % req['rows'][0])
    f1.locator('input[value=got]').check(force=True)
    f1.locator('button[type=submit]').click()
    t.ck(t.wait_until("(r) => { const e = document.querySelector('form[data-row=\"' + r + '\"] [data-cad-err]'); return e && !e.hidden; }", req['rows'][0]),
         '«Получен» без файла не остановлен')
    f1.locator('[data-cad-file]').set_input_files([{'name': 'tp.png', 'mimeType': 'image/png', 'buffer': PNG}])
    f1.locator('button[type=submit]').click()
    ROW = """async ([q, r]) => { const k = await import('./app/kernel/inspections.js'); return (k.allCadRequests().find((x) => x.id === q).rows.find((x) => x.id === r)) || {}; }"""
    t.ck(t.wait_until("async (a) => { const x = await (%s)(a); return x.result === 'got' && !!x.file; }" % ROW, [req['id'], req['rows'][0]]), 'ответ «Получен» с файлом не дошёл до запроса')
    # После ответа раскрывается следующая ждущая строка.
    t.ck(t.wait_until("(r) => !!document.querySelector('form[data-row=\"' + r + '\"]')", req['rows'][1]), 'после ответа не раскрылась следующая строка')
    t.ck(pg.locator('.om-cadline').count() == 60 and 'ответ 1 из 120' in pg.locator('.om-cadprog').inner_text(), 'ход ответов не обновился')
    f2 = pg.locator('form[data-row="%s"]' % req['rows'][1])
    f2.locator('input[value=refused]').check(force=True)
    f2.locator('textarea[name=answer]').fill('Архив закрыт')
    f2.locator('button[type=submit]').click()
    t.ck(t.wait_until("async (a) => { const x = await (%s)(a); return x.result === 'refused' && x.answer === 'Архив закрыт'; }" % ROW, [req['id'], req['rows'][1]]), 'ответ «Отказ» с пояснением не дошёл')
    pg.locator('.om-seg', has_text='Отвечено').click()
    t.ck(t.wait_until("() => document.querySelectorAll('.om-cadline').length === 2"), 'отбор «Отвечено» не показал две строки')

    pg.set_viewport_size({'width': 360, 'height': 780})
    for route in ('#/osmotr?v=report', '#/osmotr?v=cad', '#/osmotr?v=cad&r=' + req['id']):
        t.open(route, wait='.om-app .om-title')
        over = pg.evaluate("() => { const s = document.querySelector('.om-scr'); return s.scrollWidth - s.clientWidth; }")
        t.ck(over <= 0, '%s на 360 px прокручивается вбок на %d px' % (route, over))
