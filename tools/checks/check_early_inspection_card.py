# -*- coding: utf-8 -*-
"""Досрочный осмотр в карточке ОЦ и в реестре: флаг вместо статуса.

Пользователь 23.11.2026 (запись графа tz-dosrochnoe-napravlenie-oc-oi-na-osmotr-flag-filtr-i-rekomendacii-u): «Мы
МОЖЕМ раньше времени направить регионалу со специальной пометкой ОЦ/ОИ на осмотр… Статус при этом не переводится…
Ставится флаг. Досрочно направлен на осмотр, досрочно осмотрен. (Единовременно может быть только 1 флаг)». Ответы:
недвижимость и ТС; ставят ЦОД и регионал; из любого статуса до «Направлен на осмотр». Порядок работ — «Сначала -
карточки, (ЦОД)».

Что ловит сценарий:
  * на шкале статусов у записи «В заполнении» нет отметки «Досрочно…», в свёрнутой шкале — кнопки «Досрочно на
    осмотр…» (пользователь 24.11.2026: «Я не вижу кнопку»), или она не открывает окно;
  * в окне не видно, кого направляют: нет адреса, ЕНИ объекта, у ОИ — подписи и своих сведений (этажность, площадь…)
    (пользователь 24.11.2026: «Непонятно, кого направляешь...»); окно не переносится за заголовок, закрывается щелчком
    мимо или не помнит, куда его перенесли («Форма не должна документы перекрывать... лучше перетаскиваемой сделать»);
  * окно не у отметки, выходит за край, затемняет
    экран; «Выбранные ОИ» без отметок проходит;
  * направление меняет статус; не записаны ОИ, комментарий, кто и когда; нет фиолетовой отметки и значка в свёрнутой
    шкале;
  * «Изменить» не меняет ОИ; «Отозвать» не снимает флаг или стирает след; отозвать при живом назначении можно;
  * отметка есть у роли без права (осмотрщик), у записи «Направлен на осмотр» и дальше, у механизмов; у ТС её нет;
  * в реестре: «Досрочно на осмотр» над выбранными не пропускает неподходящие; нет значка и признака в фильтре;
  * ошибки консоли.
"""
NAME = 'досрочный осмотр: флаг в карточке и реестре'

TOUCHES = ('app/kernel/earlyInspection.js', 'app/kernel/status/early.js', 'app/kernel/status/flow.view.js',
           'app/kernel/status/flow.ctrl.js', 'app/kernel/anchorPop.js', 'app/kernel/ocHead.js', 'app/kernel/flagBadges.js',
           'app/kernel/cards.css', 'app/kernel/tokens.css', 'app/modules/*/records.js', 'app/pages/ocMenu/*.js')

ROLE = "async ([r]) => (await import('./app/kernel/session.js')).session.set({ person: 'Осминнов Н.', role: r })"
REC = "(await import('./app/kernel/registry.js')).getType(t).records.loadRecord(id)"
EARLY = "async ([t, id]) => { const r = %s; return r.early ? JSON.parse(JSON.stringify(r.early)) : null; }" % REC
FIND = """async ([t, st, many]) => { const T = (await import('./app/kernel/registry.js')).getType(t);
  const rows = T.records.queryRecords({ filter: {}, offset: 0, limit: 400 }).rows;
  const r = rows.map((x) => T.records.loadRecord(x.id)).find((x) => x && x.status === st && !x.early && (!many || (x.oi || []).length > 1));
  return r ? r.id : null; }"""


def run(t):
    pg = t.page
    pg.set_viewport_size({'width': 1440, 'height': 900})
    t.open('#/', wait='body')
    pg.evaluate(ROLE, ['cod'])
    rid = pg.evaluate(FIND, ['civil', 'В заполнении', True])
    if not t.ck(rid, 'нет нежилого здания «В заполнении» с несколькими ОИ'):
        return
    t.open('#/oc/civil/' + rid, wait='[data-oc-head]')

    # --- направить: выбранные ОИ ---
    # Свёрнутая шкала: кнопка рядом со статусом и открывает то же окно.
    if pg.locator('.st-flow.is-collapsed').count() == 0:
        pg.click('.st-full [data-status-toggle]')
    t.ck(t.wait_until("() => { const b = document.querySelector('.st-mini .st-early-chip.st-early-can[data-early]'); return !!b && b.offsetParent !== null; }"),
         'в свёрнутой шкале нет кнопки «Досрочно на осмотр…»')
    pg.click('.st-mini .st-early-can[data-early]')
    t.ck(t.wait_for('.ea-pop', timeout=4000), 'кнопка в свёрнутой шкале не открыла окно')
    pg.keyboard.press('Escape')
    t.wait_until("() => !document.querySelector('.ea-pop')")
    pg.click('.st-mini [data-status-toggle]')
    t.ck(t.wait_until("() => !!document.querySelector('.st-full .st-early-can[data-early]')"), 'у записи «В заполнении» нет отметки «Досрочно…» на шкале')
    pg.click('.st-full .st-early-can[data-early]')
    t.wait_for('.ea-pop')
    t.ck(pg.evaluate("() => { const r = document.querySelector('.ea-pop').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }"), 'окно выходит за край экрана')
    t.ck(pg.locator('.overlay, .modal-backdrop, dialog[open]').count() == 0, 'окно затемняет экран')
    t.ck(pg.evaluate("() => { const v = document.querySelector('.split > .viewer'); if (!v) return true; const a = v.getBoundingClientRect(); const e = document.querySelector('.ea-pop'); return parseFloat(e.style.left) >= a.right; }"),
         'окно при открытии закрывает просмотрщик документов')
    t.ck(pg.evaluate("() => [...document.querySelectorAll('.ea-pop *')].filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1).length <= 1"),
         'в окне больше одной прокрутки')
    # Кого направляем: объект и сведения каждого ОИ.
    ob = pg.inner_text('.ea-pop .ea-obj')
    eni = pg.evaluate("async ([t, id]) => { const r = %s; return r.eni || ''; }" % REC, ['civil', rid])
    t.ck(len(ob) > 10 and (not eni or eni[-4:] in ob.replace(' ', '').replace('-', '')), 'в окне нет сведений об объекте (адрес, ЕНИ): %r' % ob)
    ois = pg.eval_on_selector_all('.ea-pop .ea-oi', 'els => els.map((e) => e.innerText)')
    t.ck(ois and any('м²' in x for x in ois) and any('этаж' in x for x in ois),
         'у ОИ в окне нет своих сведений (этажность, площадь…): %r' % ois[:4])
    # Перенос за заголовок; щелчок мимо не закрывает; место запоминается.
    POS = "() => { const e = document.querySelector('.ea-pop'); return [parseFloat(e.style.left), parseFloat(e.style.top)]; }"

    def drag(dx, dy):
        h = pg.locator('.ea-pop .apop-h').bounding_box()
        x, y = h['x'] + 60, h['y'] + h['height'] / 2
        pg.mouse.move(x, y)
        pg.mouse.down()
        pg.mouse.move(x + dx, y + dy, steps=6)
        pg.mouse.up()
    p0 = pg.evaluate(POS)
    drag(-200, 60)
    p1 = pg.evaluate(POS)
    t.ck(abs((p0[0] - p1[0]) - 200) < 2 and abs((p1[1] - p0[1]) - 60) < 2, 'окно не переносится за заголовок: %s → %s' % (p0, p1))
    pg.mouse.click(5, 880)
    t.ck(pg.locator('.ea-pop').count() == 1, 'щелчок мимо закрыл переносимое окно')
    pg.click('.ea-pop [data-apop-close]')
    t.ck(t.wait_until("() => !document.querySelector('.ea-pop')"), '«×» не закрыл окно')
    pg.click('.st-full .st-early-can[data-early]')
    t.wait_for('.ea-pop')
    p2 = pg.evaluate(POS)
    t.ck(abs(p2[0] - p1[0]) < 2 and abs(p2[1] - p1[1]) < 2, 'окно не помнит, куда его перенесли: %s и %s' % (p1, p2))
    drag(200, -60)  # назад — дальше сценарий нажимает отметки под окном
    pg.check('.ea-pop [data-ea-scope][value="some"]')
    t.wait_for('.ea-pop [data-ea-oi]')
    pg.click('.ea-pop [data-ea-send]')
    t.ck(t.wait_until("() => /хотя бы один ОИ/.test(document.querySelector('.ea-pop .ea-err')?.textContent || '')"), '«Выбранные ОИ» без отметок прошло')
    oi = pg.get_attribute('.ea-pop [data-ea-oi]', 'data-ea-oi')
    pg.check('.ea-pop [data-ea-oi="%s"]' % oi)
    pg.fill('.ea-pop [data-ea-note]', 'Учреждение просит до конца месяца')
    pg.click('.ea-pop [data-ea-send]')
    t.ck(t.wait_until("() => !document.querySelector('.ea-pop')"), 'окно не закрылось после «Направить»')
    e = pg.evaluate(EARLY, ['civil', rid])
    st = pg.evaluate("async ([t, id]) => %s.status" % REC, ['civil', rid])
    t.ck(e and e['state'] == 'sent' and e['oiIds'] == [oi] and e['note'] == 'Учреждение просит до конца месяца' and e['by'] and e['at'], 'флаг записан не так: %s' % e)
    t.ck(st == 'В заполнении', 'досрочное направление сменило статус: %s' % st)
    t.ck(t.wait_until("() => !!document.querySelector('.st-early-sent[data-early]') && !!document.querySelector('.st-early-chip.st-early-sent')"), 'нет отметки «Досрочно направлен» на шкале или в свёрнутой шкале')

    # --- сведения, изменить ---
    pg.click('.st-full .st-early-sent[data-early]')
    t.wait_for('.ea-pop .ea-facts')
    info = pg.inner_text('.ea-pop')
    t.ck('Направил' in info and 'Осминнов Н.' in info and 'ждёт назначения' in info, 'в сведениях нет «Направил» или состояния осмотра: %r' % info)
    pg.click('.ea-pop [data-ea-edit]')
    pg.check('.ea-pop [data-ea-scope][value="all"]')
    pg.click('.ea-pop [data-ea-send]')
    t.ck(t.wait_until("async ([t, id]) => { const r = %s; return r.early && r.early.oiIds.length === 0 && r.early.log.some((x) => x.kind === 'edited'); }" % REC, ['civil', rid]), '«Изменить» не перевело на весь объект или нет следа правки')

    # --- отозвать ---
    pg.click('.st-full .st-early-sent[data-early]')
    pg.click('.ea-pop [data-ea-off]')
    t.ck(pg.locator('.ea-pop [data-ea-off-yes]').count() == 1, '«Отозвать» без подтверждения')
    pg.click('.ea-pop [data-ea-off-yes]')
    t.ck(t.wait_until("async ([t, id]) => { const r = %s; return !r.early && (r.earlyLog || []).some((x) => x.kind === 'cancelled'); }" % REC, ['civil', rid]), '«Отозвать» не сняло флаг или стёрло след')
    t.ck(t.wait_until("() => !!document.querySelector('.st-early-can[data-early]')"), 'после отзыва нет отметки «Досрочно…»')

    # Отозвать при живом назначении нельзя.
    err = pg.evaluate("""async ([t, id]) => { const E = await import('./app/kernel/earlyInspection.js'); const K = await import('./app/kernel/inspections.js');
      const r = %s; E.sendEarly(r, t, {}); K.assign({ typeId: t, ocId: id, person: 'Айдай' });
      try { E.cancelEarly(r, t); return ''; } catch (x) { return x.message; } }""" % REC, ['civil', rid])
    t.ck('Осмотрщик уже назначен' in err, 'отозвать при живом назначении можно: %r' % err)
    # Esc закрывает окно.
    t.open('#/', wait='body')
    t.open('#/oc/civil/' + rid, wait='[data-oc-head]')
    pg.click('.st-full .st-early-sent[data-early]')
    t.wait_for('.ea-pop')
    pg.keyboard.press('Escape')
    t.ck(t.wait_until("() => !document.querySelector('.ea-pop')"), 'Escape не закрыл окно')

    # --- кому и где отметки нет ---
    pg.evaluate(ROLE, ['insp'])
    r2 = pg.evaluate(FIND, ['civil', 'В заполнении', False])
    t.open('#/oc/civil/' + r2, wait='[data-oc-head]')
    t.ck(pg.locator('[data-early]').count() == 0, 'у осмотрщика есть «Досрочно…»')
    pg.evaluate(ROLE, ['cod'])
    r3 = pg.evaluate(FIND, ['civil', 'Направлен на осмотр', False])
    if r3:
        t.open('#/oc/civil/' + r3, wait='[data-oc-head]')
        t.ck(pg.locator('[data-early]').count() == 0, 'у записи «Направлен на осмотр» есть «Досрочно…»')
    m = pg.evaluate("async () => { const T = (await import('./app/kernel/registry.js')).getType('mechanisms'); return T.records.queryRecords({ filter: {}, offset: 0, limit: 5 }).rows[0].id; }")
    pg.evaluate("async ([id]) => { const r = (await import('./app/kernel/registry.js')).getType('mechanisms').records.loadRecord(id); r.status = 'В заполнении'; }", [m])
    t.open('#/oc/mechanisms/' + m, wait='[data-oc-head]')
    t.ck(pg.locator('[data-early]').count() == 0, 'у механизмов есть «Досрочно…»')
    v = pg.evaluate("""async () => { const T = (await import('./app/kernel/registry.js')).getType('vehicle'); const id = T.records.queryRecords({ filter: {}, offset: 0, limit: 5 }).rows[0].id;
      const r = T.records.loadRecord(id); r.status = 'Удостоверен по документам'; delete r.early; return id; }""")
    t.open('#/oc/vehicle/' + v, wait='[data-oc-head]')
    t.ck(t.wait_until("() => !!document.querySelector('.st-early-can[data-early]')"), 'у ТС нет «Досрочно…»')

    # --- реестр: массовое действие, значок, признак в фильтре ---
    pg.evaluate("""async ([a, b]) => { const T = (await import('./app/kernel/registry.js')).getType('civil');
      T.records.loadRecord(a).status = 'Удостоверен по документам'; delete T.records.loadRecord(a).early; T.records.loadRecord(b).status = 'Оценён'; }""", ['oc-cv-1', 'oc-cv-2'])
    enis = pg.evaluate("async () => { const T = (await import('./app/kernel/registry.js')).getType('civil'); return ['oc-cv-1', 'oc-cv-2'].map((id) => T.records.loadRecord(id).eni); }")
    t.open('#/', wait='[data-locator]')
    picked = 0
    for oc, eni in zip(['oc-cv-1', 'oc-cv-2'], enis):
        pg.fill('[data-locator]', eni)
        if t.wait_until("([id]) => !!document.querySelector('[data-select=\"' + id + '\"]')", [oc]):
            pg.click('[data-select="%s"]' % oc)
            picked += 1
    t.ck(picked == 2, 'в реестре не нашлись строки oc-cv-1 и oc-cv-2 (отмечено %d)' % picked)
    if picked == 2 and t.ck(t.wait_until("() => !!document.querySelector('[data-bulk=\"early\"]')"), 'в панели выбранных нет «Досрочно на осмотр»'):
        pg.click('[data-bulk="early"]')
        pg.click('[data-modal-ok]')
        t.ck(t.wait_until("async () => { const T = (await import('./app/kernel/registry.js')).getType('civil'); return !!T.records.loadRecord('oc-cv-1').early && !T.records.loadRecord('oc-cv-2').early; }"),
             '«Досрочно на осмотр» в реестре не направило подходящую или направило «Оценён»')
        pg.fill('[data-locator]', enis[0])
        t.ck(t.wait_until("() => !!document.querySelector('.reg-badge.early')"), 'в реестре нет значка досрочного направления')
    t.ck(pg.evaluate("async () => (await import('./app/pages/ocMenu/state.js')).FLAG_LABELS.earlySent === 'досрочно на осмотр'"), 'в фильтре реестра нет признака «досрочно на осмотр»')
