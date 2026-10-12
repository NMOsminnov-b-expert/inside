# -*- coding: utf-8 -*-
"""Панель осмотров (pages/inspections), шаг (б) ТЗ панели осмотров.

Что ловит сценарий:
  * пункт меню «Осмотры» у роли, отличной от осмотрщика, не ведёт на панель,
    а у осмотрщика не ведёт на его экран;
  * панель назначения: при открытии пуста или открыта модальным окном
    (замечание пользователя 12.10.2026 «Зачем опять модалки?»); без
    осмотрщика назначение проходит молча; перечень ОИ виден при «Объект
    целиком»; назначение на выбранные ОИ не запоминает их; две отметки
    флажками не дают панель на несколько объектов;
  * назначенный объект не уходит из «К назначению» и не появляется в
    «Назначено»; снятие не возвращает его в очередь;
  * «Мои осмотрщики» не переживают перезагрузку;
  * страница вбок прокручивается или в консоли ошибки.
"""
NAME = 'панель осмотров'

TOUCHES = ('app/pages/inspections/*', 'app/kernel/inspections.js', 'app/shell/shell.js',
           'app/kernel/router.js', 'app/kernel/boot.js')


def run(t):
    pg = t.page
    t.open('', wait='.reg-tr')
    pg.click('[data-nav="insp"]')
    if not t.ck(t.wait_for('.ip-pane'), '«Осмотры» не открыли панель осмотров: %s' % pg.evaluate('location.hash')):
        return
    t.ck(pg.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'страница панели прокручивается вбок')

    before = pg.locator('[data-ip-row]').count()
    if not t.ck(before > 0, 'в «К назначению» нет объектов'):
        return
    # Экран не пустой: первая строка выбрана и разобрана в панели сразу.
    first = pg.locator('[data-ip-row]').first.get_attribute('data-ip-row')
    t.ck(pg.locator('tr.cur[data-ip-row="%s"]' % first).count() == 1 and pg.locator('.ip-pane [data-ip-f-ok]').count() == 1,
         'при открытии не выбрана первая строка или панель назначения пуста')

    # --- частично осмотренные остаются в очереди ---------------------------------------
    # Слова пользователя 12.10.2026: «А где частично осмотренные? Фильтрация при
    # поиске в К назначению должна быть». Объект с осмотренными и назначенными ОИ,
    # но со свободными — в очереди, фильтр «Частично осмотрены» его находит, а в
    # панели занятые ОИ не выбираются повторно.
    pg.click('[data-ip-fcov="inspected"]')
    if t.ck(t.wait_until("() => document.querySelectorAll('tr[data-ip-row]').length > 0 && [...document.querySelectorAll('tr[data-ip-row]')].every((r) => r.dataset.cov === 'inspected')"),
            'фильтр «Частично осмотрены» не нашёл частично осмотренных объектов'):
        pg.locator('tr[data-cov="inspected"] td:nth-child(3)').first.click()
        t.wait_for('.ip-pane [data-ip-f-oi]')
        st = pg.evaluate("() => ({ taken: document.querySelectorAll('.ip-pane .ip-check.taken input:disabled').length, free: document.querySelectorAll('.ip-pane [data-ip-f-oi]:not(:disabled):checked').length, whole: document.querySelector('[data-ip-f-whole]').checked })")
        t.ck(st['taken'] >= 1 and st['free'] >= 1 and not st['whole'],
             'у частично осмотренного объекта занятые ОИ не отмечены или свободные не выбраны: %s' % st)
    pg.click('[data-ip-fcov="none"]')
    t.wait_until("() => [...document.querySelectorAll('tr[data-ip-row]')].every((r) => r.dataset.cov === 'none')")
    key = pg.locator('tr[data-cov="none"]').first.get_attribute('data-ip-row')
    pg.locator('tr[data-ip-row="%s"] td:nth-child(3)' % key).click()
    t.wait_for('tr.cur[data-ip-row="%s"]' % key)
    t.ck(pg.locator('.modal-back').count() == 0, 'панель назначения открыта модальным окном')

    # --- панель назначения ---------------------------------------------------------------
    pg.click('[data-ip-f-ok]')
    t.ck('осмотрщика' in pg.inner_text('[data-ip-err]'), 'назначение без осмотрщика не объясняет, чего не хватает')

    has_oi = pg.locator('[data-ip-f-whole]').count() == 1
    if has_oi:
        t.ck(not pg.locator('.ip-oi').is_visible(), 'перечень ОИ виден при «Объект целиком»')
        pg.uncheck('[data-ip-f-whole]')
        t.ck(pg.locator('.ip-oi').is_visible(), 'перечень ОИ не открылся')
        first_oi = pg.locator('[data-ip-f-oi]').first.get_attribute('data-ip-f-oi')
        pg.locator('[data-ip-f-oi]').first.check()
    person = pg.eval_on_selector('[data-ip-f-person]', "s => s.options[1].value")
    pg.select_option('[data-ip-f-person]', person)
    pg.fill('[data-ip-f-date]', '2099-01-15')
    pg.click('[data-ip-f-ok]')
    t.wait_until("(k) => !document.querySelector('[data-ip-row=\"' + k + '\"]')", key)

    got = pg.evaluate("""async (k) => { const [typeId, ocId] = k.split('|'); const m = await import('./app/kernel/inspections.js');
      const a = m.assignmentsOf(typeId, ocId)[0]; return a ? { person: a.person, oi: a.oiIds, date: a.plannedAt } : null; }""", key)
    t.ck(got and got['person'] == person and got['date'] == '2099-01-15', 'назначение из панели не записалось: %s' % got)
    if has_oi and got:
        t.ck(got['oi'] == [first_oi], 'назначение не запомнило выбранный ОИ: %s' % got)
    t.ck(pg.locator('[data-ip-row="%s"]' % key).count() == 0, 'назначенный объект остался в «К назначению»')

    # --- отметки флажками: панель на несколько объектов ----------------------------------
    if pg.locator('[data-ip-check]').count() >= 2:
        pg.locator('[data-ip-check]').nth(0).check()
        t.wait_for('[data-ip-check]')
        pg.locator('[data-ip-check]').nth(1).check()
        t.ck(t.wait_until("() => /Выбрано объектов: 2/.test(document.querySelector('.ip-pane').innerText)"),
             'две отметки не дали панель на несколько объектов')
        pg.click('[data-ip-bulk-clear]')

    # --- «Назначено» и снятие ---------------------------------------------------------
    pg.click('[data-ip-tab="assigned"]')
    t.wait_for('[data-ip-row]')
    mine = pg.evaluate("""async (k) => { const [typeId, ocId] = k.split('|'); const m = await import('./app/kernel/inspections.js');
      const a = m.assignmentsOf(typeId, ocId).find((x) => !x.demo); return a ? a.id : ''; }""", key)
    t.ck(pg.locator('[data-ip-row="%s"]' % mine).count() == 1, 'назначение не видно во вкладке «Назначено»')
    pg.locator('[data-ip-row="%s"] td:nth-child(2)' % mine).click()
    t.wait_for('tr.cur[data-ip-row="%s"]' % mine)
    t.ck(pg.input_value('[data-ip-f-person]') == person, 'панель назначения не показала действующее назначение')
    pg.click('[data-ip-remove]')
    t.wait_for('[data-ip-remove-yes]')
    t.ck(pg.locator('.modal-back').count() == 0, 'подтверждение снятия — модальным окном')
    pg.click('[data-ip-remove-yes]')
    pg.click('[data-ip-tab="queue"]')
    t.ck(t.wait_for('[data-ip-row="%s"]' % key), 'снятое назначение не вернуло объект в «К назначению»')

    # --- планирование (этап 2, решения пользователя 12.10.2026) -------------------------------
    t.open('#/inspections', wait='.ip-page')
    pg.click('[data-ip-section="assign"]')
    pg.click('[data-ip-tab="queue"]')
    t.wait_for('.ip-facets [data-ip-fdue], .ip-facets [data-ip-fcov]')
    t.ck(pg.locator('.ip-grouped tr.ip-grp').count() >= 1, '«К назначению» не сгруппировано по месту выезда')
    # «Кого назначить»: щелчок подставляет человека, отмеченное в панели не сбрасывается
    pg.locator('tr[data-ip-row] td:nth-child(4)').first.click()
    t.wait_for('.ip-rank-b')
    if pg.locator('[data-ip-f-whole]').count() and not pg.locator('[data-ip-f-whole]').is_disabled():
        pg.uncheck('[data-ip-f-whole]')
        pg.locator('[data-ip-f-oi]:not(:disabled)').first.check()
    picked = pg.locator('.ip-rank-b').first.get_attribute('data-ip-pick-person')
    pg.locator('.ip-rank-b').first.click()
    t.ck(t.wait_until("(w) => document.querySelector('[data-ip-f-person]').value === w", picked), '«Кого назначить» не подставил осмотрщика')
    t.ck(pg.locator('[data-ip-f-oi]:checked').count() >= 1, 'выбор осмотрщика сбросил отмеченные ОИ')
    # полоса дней: щелчок по свободному дню ставит дату
    free = pg.locator('.ip-av.free')
    if t.ck(pg.locator('.ip-av').count() == 10, 'нет полосы ближайших 10 дней выбранного осмотрщика') and free.count():
        day = free.first.get_attribute('data-ip-avail-day')
        free.first.click()
        t.ck(t.wait_until("(d) => document.querySelector('[data-ip-f-date]').value === d", day), 'щелчок по дню полосы не поставил плановую дату')
    # срок отмеченным: горящие сверху
    first = pg.locator('[data-ip-check]').first.get_attribute('data-ip-check')
    pg.locator('[data-ip-check]').first.check()
    t.wait_for('[data-ip-dl-date]')
    pg.fill('[data-ip-dl-date]', pg.evaluate("() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }"))
    pg.click('[data-ip-dl-set]')
    t.ck(t.wait_for('tr[data-ip-row="%s"] .ip-due.due-hot' % first), 'срок на сегодня не показан как горящий')
    t.ck(pg.locator('.ip-facets [data-ip-fdue="hot"]').count() == 1, 'в фильтрах нет «Горящие»')
    pg.click('[data-ip-bulk-clear]')

    # «Назначено»: по осмотрщикам, «Переназначить все…», отбор «План на отсутствие»
    pg.click('[data-ip-tab="assigned"]')
    t.wait_for('.ip-grouped tr.ip-grp')
    groups = pg.locator('[data-ip-rg]')
    if t.ck(groups.count() >= 2, '«Назначено» не сгруппировано по осмотрщикам'):
        frm = groups.first.get_attribute('data-ip-rg')
        n0 = pg.evaluate("async (w) => (await import('./app/kernel/inspections.js')).allAssignments().filter((a) => a.person === w && ['assigned', 'progress'].includes(a.state)).length", frm)
        groups.first.click()
        t.wait_for('[data-ip-rg-person]')
        to = pg.eval_on_selector('[data-ip-rg-person]', "s => s.options[1].value")
        pg.select_option('[data-ip-rg-person]', to)
        pg.click('[data-ip-rg-ok]')
        n1 = pg.evaluate("async (w) => (await import('./app/kernel/inspections.js')).allAssignments().filter((a) => a.person === w && ['assigned', 'progress'].includes(a.state)).length", frm)
        t.ck(n0 > 0 and n1 == 0, '«Переназначить все…» не перевело назначения: было %s, осталось %s' % (n0, n1))
        hist = pg.evaluate("async (w) => (await import('./app/kernel/inspections.js')).allAssignments().filter((a) => a.person === w && a.state === 'removed').length", frm)
        t.ck(hist >= n0, 'при переназначении потерялась история прежних назначений')
    t.ck(pg.locator('.ip-facets [data-ip-fpick="stall"], .ip-facets [data-ip-fpick="away"]').count() == 2, 'нет отборов «Зависли» и «План на отсутствие»')

    # --- «Мои осмотрщики» (раздел «Осмотрщики») ---------------------------------------------
    pg.click('[data-ip-section="people"]')
    t.wait_for('.ip-people')
    name = pg.locator('[data-ip-star]').first.get_attribute('data-ip-star')
    pg.locator('[data-ip-star]').first.click()
    pg.click('[data-ip-mode="mine"]')
    t.ck(pg.locator('.ip-person-main[data-ip-person="%s"]' % name).count() == 1, 'осмотрщик не попал в «Мои»')
    pg.evaluate("async () => (await import('./app/kernel/persist.js')).saveNow()")
    pg.reload()
    t.wait_for('.ip-people')
    t.ck(pg.locator('[data-ip-mode="mine"][aria-pressed="true"]').count() == 1 and pg.locator('.ip-person-main[data-ip-person="%s"]' % name).count() == 1,
         '«Мои осмотрщики» не пережили перезагрузку')

    # --- осмотрщику «Осмотры» — его экран ------------------------------------------------
    t.open('', wait='.reg-tr')
    pg.click('[data-user-toggle]')
    pg.check('input[name="um-role"][value="insp"]')
    pg.keyboard.press('Escape')
    pg.click('[data-nav="insp"]')
    t.ck(t.wait_until("() => location.hash.startsWith('#/insp') && !location.hash.startsWith('#/inspections')"),
         'осмотрщику «Осмотры» открыли не его экран: %s' % pg.evaluate('location.hash'))

    # --- поля ввода одного вида ---------------------------------------------------------
    # Замечание пользователя 12.10.2026 «стили боксов для ввода данных разные» и «у
    # календаря та же проблема»: на страницах ядра поля рисовал браузер — рамка и
    # скругление поля даты и комментария не совпадали со списком рядом.
    t.open('#/inspections', wait='.ip-page')
    pg.click('[data-ip-section="assign"]')
    t.wait_for('.ip-pane [data-ip-f-date]')
    look = pg.evaluate("""() => ['.ip-pane .pick-btn', '.ip-pane [data-ip-f-date]', '.ip-pane [data-ip-f-note]'].map((s) => {
      const st = getComputedStyle(document.querySelector(s)); return [st.borderTopColor, st.borderTopLeftRadius, st.borderTopWidth]; })""")
    t.ck(look[0] == look[1] == look[2], 'поля панели оформлены по-разному (список, дата, комментарий): %s' % look)

    # --- выезды, статистика, контакты, области ---------------------------------------
    # Просьбы пользователя 12.10.2026: «не вижу… графиков с демо данными»; «график
    # выездов, аля календарь, при наведении на дату информация за этот день»;
    # «общая статистика в виде графиков uplot»; «для каждого осмотрщика нужны
    # контактные данные»; «фильтрация по областям осмотрщиков».
    t.open('#/inspections', wait='.ip-page')
    # «Статистика по человеку отдельно» (12.10.2026): в «Назначениях» графиков нет.
    pg.click('[data-ip-section="assign"]')
    t.wait_for('.ip-assign')
    t.ck(pg.locator('.ip-assign .uplot, .ip-assign .ipc-cal').count() == 0, 'в «Назначениях» снова графики и календарь — назначения уезжают вниз')
    pg.click('[data-ip-section="people"]')
    t.wait_for('.ip-people')
    pg.click('.ip-person-main[data-ip-person=""]')
    # «Все осмотрщики» — подразделами «Сводка · Статистика» (ответ «Карточка —
    # подразделами» 12.10.2026); строка сводки открывает краткую карточку справа.
    t.wait_for('.ip-ptable tr[data-ip-dp-open]')
    pg.locator('.ip-ptable tr[data-ip-dp-open]').first.click()
    t.ck(t.wait_for('.ip-detail-pane [data-ip-assign-to]'), 'строка сводки не открыла краткую карточку осмотрщика в панели справа')
    t.ck(pg.locator('.modal-back').count() == 0, 'подробности открыты модальным окном, а не панелью')
    pg.keyboard.press('Escape')
    t.ck(t.wait_until("() => !document.querySelector('.ip-detail-pane')"), 'Escape не закрыл панель подробностей')
    pg.click('[data-ip-atab="stats"]')
    t.ck(t.wait_until("() => document.querySelectorAll('.ipc-stats .uplot').length === 2", timeout=15000),
         'в «Статистике» всех осмотрщиков нет двух графиков (uPlot)')
    t.ck(pg.evaluate("async () => { const m = await import('./app/pages/inspections/model.js'); const s = m.weeklySeries(['Абдылдаев Айсултан Марсович', 'Бабашова Даяна Алтынбековна'], 8); return s.oi.flat().some((v) => v > 0); }"),
         'статистика пуста — демо-истории нет')
    # Осмотрщик — с действующими назначениями, из списка «Все»: выше все
    # назначения одного из них переданы другому, и после перезагрузки у него
    # нет ни выездов, ни демо-истории (история строится по осмотрщикам из
    # записей на момент загрузки).
    pg.click('[data-ip-mode="all"]')
    who = pg.evaluate("async () => { const k = await import('./app/kernel/inspections.js'); const n = new Map(); k.allAssignments().filter(k.isLive).forEach((a) => n.set(a.person, (n.get(a.person) || 0) + 1)); return [...n.entries()].sort((a, b) => b[1] - a[1])[0][0]; }")
    pg.locator('.ip-person-main[data-ip-person="%s"]' % who).click()
    pg.click('[data-ip-ptab="trips"]')
    t.ck(t.wait_for('.ipc-cal .ipc-chip'), 'у осмотрщика нет календаря выездов с выездами')
    t.ck(pg.locator('.ip-card-body .uplot').count() == 0, 'в подразделе «Выезды» лишнее — графики (подразделы смешались)')

    # окно дня — при наведении, в пределах экрана
    pg.locator('[data-ipc-cal]').first.hover()
    box = pg.evaluate("() => { const p = document.querySelector('.ipc-pop'); if (!p) return null; const r = p.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: innerWidth, h: innerHeight, n: p.querySelectorAll('li').length }; }")
    t.ck(box and box['n'] > 0, 'наведение на день календаря не показало выезды дня: %s' % box)
    if box:
        t.ck(box['l'] >= 0 and box['r'] <= box['w'] and box['t'] >= 0 and box['b'] <= box['h'], 'окно дня выходит за экран: %s' % box)
    pg.mouse.move(2, 2)
    t.ck(t.wait_until("() => !document.querySelector('.ipc-pop')"), 'окно дня не прячется, когда мышь ушла')

    # щелчок по дню (и будущему) — кто, куда, зачем — в панели справа; вглубь и назад
    future = pg.evaluate("() => { const t = new Date(); const iso = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); const d = [...document.querySelectorAll('[data-ip-dp-open^=\"day:\"]')].find((x) => x.dataset.ipDpOpen.slice(4) >= iso); return d ? d.dataset.ipDpOpen : ''; }")
    if t.ck(future, 'в календаре нет сегодняшнего или будущего дня с выездами'):
        pg.click('[data-ip-dp-open="%s"]' % future)
        t.ck(t.wait_for('.ip-detail-pane .ip-dp-trip'), 'щелчок по будущему дню не открыл выезды в панели справа')
    day = pg.evaluate("() => { const t = new Date(); const iso = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); const d = [...document.querySelectorAll('.ipc-cal [data-ip-dp-open^=\"day:\"]')].find((x) => x.dataset.ipDpOpen.slice(4) < iso); return d ? d.dataset.ipDpOpen.slice(4) : ''; }")
    if t.ck(day, 'в календаре нет прошедшего дня с выездами'):
        pg.click('.ipc-cal [data-ip-dp-open="day:%s"]' % day)
        t.ck(t.wait_until("() => /Итог/.test(document.querySelector('.ip-detail-pane').innerText) && /Зачем/.test(document.querySelector('.ip-detail-pane').innerText)"),
             'в выездах прошедшего дня нет «зачем» и «итога»')
        pg.locator('.ip-detail-pane .ip-dp-trip').first.click()
        t.ck(t.wait_for('.ip-detail-pane [data-ip-dp-back]'), 'из дня нельзя перейти к назначению с возвратом «Назад»')
        pg.click('[data-ip-dp-back]')
        t.ck(t.wait_for('.ip-detail-pane .ip-dp-trip'), '«Назад» не вернул к выездам дня')
        pg.click('[data-ip-dp-history]')
        t.ck(t.wait_until("() => document.querySelector('[data-ip-section=history]').classList.contains('on') && !!document.querySelector('.ipc-ev')"),
             '«Вся история дня» не открыла историю дня')
        t.ck(pg.evaluate("(d) => [...document.querySelectorAll('.ipc-ev time')].every((x) => new Date(x.getAttribute('datetime')).toDateString() === new Date(d + 'T12:00:00').toDateString())", day),
             'в истории дня события других дней')

    # профиль — контакты на месте и сохранение
    pg.click('[data-ip-section="people"]')
    pg.locator('.ip-person-main[data-ip-person="%s"]' % who).click()
    pg.click('[data-ip-ptab="profile"]')
    t.wait_for('[data-ip-c="phone"]')
    t.ck(pg.locator('.modal-back').count() == 0, 'контакты правятся в модальном окне')
    t.ck(not pg.locator('[data-ip-c-bar]').is_visible(), 'подвал сохранения виден без правок')
    # Полный профиль (решение пользователя 12.10.2026): связь, области, график,
    # отпуска; WhatsApp — ссылкой на чат.
    pg.fill('[data-ip-c="phone"]', '+996 555 000 111')
    pg.locator('.ip-reglist label:has([data-ip-c-region][value="Ош"])').click()
    t.ck(pg.locator('[data-ip-c-bar]').is_visible(), 'правка профиля не показала подвал сохранения')
    pg.click('[data-ip-c-save]')
    t.ck(t.wait_for('.ip-card-contacts a[href^="tel:"]'), 'сохранённый телефон не показан в шапке ссылкой для звонка')
    t.ck(pg.locator('.ip-card-contacts a[href^="https://wa.me/996555000111"]').count() == 1, 'нет ссылки на WhatsApp по номеру телефона')
    t.ck(pg.locator('[data-ip-wa-chat][href^="https://wa.me/996555000111"]').count() == 1, 'у поля WhatsApp нет кнопки «Чат» с человеком')

    # отпуск на две недели: свободных дней 0, в шапке отметка, в календаре дни отпуска
    FREE = r"(w) => { const b = [...document.querySelectorAll('.ip-person-main')].find((x) => x.dataset.ipPerson === w); const m = b ? b.innerText.match(/свободно\s+(\d+)/) : null; return m ? +m[1] : -1; }"
    ab = pg.evaluate("() => { const iso = (x) => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); const d = new Date(); const to = new Date(d); to.setDate(to.getDate() + 15); return [iso(d), iso(to)]; }")
    pg.fill('[data-ip-ab="from"]', ab[0])
    pg.fill('[data-ip-ab="to"]', ab[1])
    pg.click('[data-ip-ab-add]')
    t.ck(t.wait_for('.ip-absences li i'), 'отпуск не добавился в профиль')
    t.ck(t.wait_until("(w) => (" + FREE + ")(w) === 0", who), 'отпуск на две недели не обнулил свободные дни: %s' % pg.evaluate(FREE, who))
    t.ck(pg.locator('.ip-card-contacts .ip-badge.away').count() == 1, 'в шапке нет отметки «отпуск до …»')
    pg.click('[data-ip-ptab="trips"]')
    t.ck(t.wait_for('.ipc-cal-d.away'), 'в календаре выездов не отмечены дни отпуска')

    # Карточка по ТЗ рабочего дня осмотрщика (раздел 1–2): доверенность,
    # свои поля, авто. Ловит: новые поля не доходят до сохранения, срок
    # доверенности не предупреждает в шапке, своё поле не появляется в профиле.
    pg.click('[data-ip-section="people"]')
    pg.locator('.ip-person-main[data-ip-person=""]').click()
    pg.click('[data-ip-atab="fields"]')
    pg.fill('[data-ip-cfn="label"]', 'Размер одежды')
    pg.select_option('[data-ip-cfn="kind"]', 'list')
    t.ck(pg.locator('[data-ip-cfn="options"]').is_visible(), 'у выбора из списка нет строки «Варианты»')
    pg.fill('[data-ip-cfn="options"]', 'S, M, L')
    pg.locator('[data-ip-cfn-req]').check()
    pg.click('[data-ip-cf-add]')
    t.ck(t.wait_for('[data-ip-cf-del]'), 'своё поле не добавилось')
    pg.locator('.ip-person-main[data-ip-person="%s"]' % who).click()
    pg.click('[data-ip-ptab="profile"]')
    t.ck(t.wait_for('select[data-ip-cf]'), 'своё поле не появилось в профиле осмотрщика')
    # Обязательное своё поле (ТЗ 1.2): без значения профиль не сохраняется.
    pg.fill('[data-ip-c="note"]', 'проверка обязательного')
    pg.click('[data-ip-c-save]')
    t.ck(t.wait_until("() => [...document.querySelectorAll('.toast')].some((x) => /Заполните поле/.test(x.textContent))"),
         'профиль без обязательного своего поля сохранился молча')
    pg.select_option('select[data-ip-cf]', 'M')
    soon = pg.evaluate("() => { const d = new Date(); d.setDate(d.getDate() + 5); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }")
    pg.fill('[data-ip-c="poaUntil"]', soon)
    pg.fill('[data-ip-c="birthDate"]', '1990-04-01')
    pg.locator('.ip-segf label:has([data-ip-c-radio="cadastre"][value="1"])').click()
    pg.click('[data-ip-c-save]')
    t.ck(t.wait_until("() => /доверенность: \d+ дн\./.test(document.querySelector('.ip-card-contacts')?.innerText || '')"),
         'срок доверенности через 5 дней не предупреждает в шапке')
    saved = pg.evaluate("async (w) => { const p = (await import('./app/kernel/inspections.js')).profileOf(w); return [p.birthDate, p.cadastre, Object.values(p.custom)[0]]; }", who)
    t.ck(saved == ['1990-04-01', True, 'M'], 'профиль сохранён не полностью: %s' % saved)
    pg.click('[data-ip-ptab="car"]')
    pg.fill('[data-ip-car="make"]', 'Toyota Corolla')
    pg.fill('[data-ip-car="consumption"]', '8')
    pg.locator('.ip-segf label:has([data-ip-car-radio][value="АИ-92"])').click()
    pg.click('[data-ip-car-save]')
    t.wait_for('[data-ip-car="make"]')
    car = pg.evaluate("async (w) => (await import('./app/kernel/inspections.js')).profileOf(w).car", who)
    t.ck(car.get('make') == 'Toyota Corolla' and car.get('consumption') == '8' and car.get('fuel') == 'АИ-92', 'авто не сохранено: %s' % car)

    # фильтр по областям — по указанной в профиле
    t.ck(pg.evaluate("() => [...document.querySelectorAll('[data-ip-region] option')].some((o) => o.textContent === 'Ош')"),
         'область из профиля не попала в фильтр областей')
    pg.select_option('[data-ip-region]', 'Ош')
    t.ck(t.wait_until("(w) => { const ns = [...document.querySelectorAll('.ip-person-main[data-ip-person]')].map((b) => b.dataset.ipPerson).filter(Boolean); return ns.length === 1 && ns[0] === w; }", who),
         'фильтр по области не оставил только осмотрщиков этой области')
    pg.select_option('[data-ip-region]', '')

    pg.click('a[href^="#/insp?as="]')
    t.ck(t.wait_until("() => location.hash.startsWith('#/insp?')"), '«Экран осмотрщика» не открыл экран осмотрщика')
    t.wait_until("async (w) => (await import('./app/pages/inspector/tasks.js')).currentInspector() === w", who)
    shown = pg.evaluate("async () => (await import('./app/pages/inspector/tasks.js')).currentInspector()")
    t.ck(shown == who, 'экран осмотрщика открыт не от того человека: %s вместо %s' % (shown, who))
