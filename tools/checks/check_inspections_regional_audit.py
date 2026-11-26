# -*- coding: utf-8 -*-
"""Экран регионала после аудита 24.11.2026: досрочные в «Сегодня» и уведомлениях, сортировка очереди, поиск, срок.

Пользователь 24.11.2026 (запись графа audit-ekrana-regionala-24-11-2026-dosrochnye-otbory-poisk-uvedomleniya):
«Необходимо тщательно продумать интерфейс, возможности фильтрации, поиска, уведомлений»; о досрочных — «фильтр
сделать по признакам. По статусам например. Если фильтра нет - вперемешку (но можно отсортировать по например дате
перевода на осмотр, по иным метрикам)»; направить досрочно — «поиском ЕНИ в поиске сверху с переходом… на карточку».

Что ловит сценарий:
  * досрочно направленный объект без назначения не виден в «Сегодня → Досрочно направлены» или строка не ведёт в очередь;
  * нет уведомления «Досрочно направлен на осмотр»; после отзыва — нет «Досрочное направление отозвано»;
  * «Отметить прочитанными эти» при выбранном виде отмечает и уведомления других видов;
  * в очереди нет отбора «Статус ОЦ» или он пропускает другие статусы; нет порядка «Направлены позже» / «Без группировки»
    или строки идут не по дате направления; нет строки «направлен досрочно ДД.ММ»;
  * в «Что осмотреть» у ОИ нет ЕНИ и опознавательных сведений; у направленного ОИ нет пометки «досрочно»;
  * Ctrl K: у объекта, который можно направить досрочно, нет подсказки «можно направить досрочно»;
  * срок в панели назначения сохраняется сразу при выборе даты, а не по «Назначить»;
  * отметки «прочитано» одного регионала видны другому (ответ пользователя 24.11.2026 «Отметки у каждого свои»);
  * передача осмотрщика другому регионалу не попадает в журнал профиля; новому регионалу нет уведомления «Осмотрщик
    передан» с тем, от кого и сколько в работе, или оно не открывает карточку осмотрщика;
  * ЦОД изменил состав досрочного направления после назначения — у назначения нет пометки «состав изменён», в панели нет
    «добавлены — … убраны — …», «Привести к составу» не отмечает ОИ направления; в «Подробностях назначения» нет раздела
    «Досрочно направлен»; в «Журнале» нет событий «досрочно направил» и «изменил досрочное направление»;
  * срок, выбранный в панели, теряется по «Назначить» (перерисовка сбрасывала черновик);
  * экран «Регионалы» (с личными данными осмотрщиков) открыт ролям, кроме регионального менеджера и администратора,
    или виден их пункт меню; регионалу экран не открывается (ответ пользователя 26.11.2026).
"""
NAME = 'экран регионала: аудит 24.11 (досрочные, сортировка, уведомления, срок)'

TOUCHES = ('app/pages/inspections/inspections.js', 'app/pages/inspections/model.js', 'app/pages/inspections/notify.js',
           'app/pages/inspections/assignPane.js', 'app/pages/inspections/inspections.css', 'app/kernel/earlyInspection.js',
           'app/kernel/statusStamp.js', 'app/kernel/inspections.js', 'app/pages/inspection/tasks.js', 'app/kernel/session.js',
           'app/pages/inspections/detail.js', 'app/pages/inspections/stats.js', 'app/shell/shell.js')

K = "(await import('./app/kernel/inspections.js'))"
REC = "(await import('./app/kernel/registry.js')).getType('civil').records.loadRecord(id)"
# Нежилые здания «В заполнении» с тремя и больше ОИ, без назначений и без флага.
PICK = """async () => { const R = await import('./app/kernel/registry.js'); const K = %s; const t = R.getType('civil');
  const ids = []; for (const s of t.records.queryRecords({ filter: {}, offset: 0, limit: 600 }).rows) {
    const r = t.records.loadRecord(s.id);
    if (r && r.status === 'В заполнении' && !r.early && (r.oi || []).length >= 3 && !K.assignmentsOf('civil', s.id, { live: false }).length) ids.push(s.id);
    if (ids.length === 3) return ids; }
  return null; }""" % K


def facets(t):
    pg = t.page
    t.wait_for('[data-ip-ff]')
    if not pg.locator('.ip-facets.open').count():
        pg.locator('[data-ip-ftoggle]:visible').first.click()
    t.wait_for('.ip-facets.open')


def run(t):
    pg = t.page
    pg.set_viewport_size({'width': 1440, 'height': 900})
    # Внешний геокодер в «Перейти» — пустым ответом: проверка не зависит от сети.
    pg.route('https://photon.komoot.io/**', lambda r: r.fulfill(status=200, content_type='application/json', body='{"features":[]}'))
    t.open('#/', wait='body')
    pg.evaluate("async () => (await import('./app/kernel/session.js')).session.set({ person: 'Осминнов Н.', role: 'any' })")
    pick = pg.evaluate(PICK)
    if not t.ck(pick, 'нет трёх нежилых зданий «В заполнении» с тремя ОИ без назначений'):
        return
    a, b, c = pick
    ois = pg.evaluate("async ([id]) => %s.oi.map((o) => o.id)" % REC, [a])
    # Ctrl K — до направления: объект можно направить досрочно.
    eni_c = pg.evaluate("async ([id]) => { const r = %s; return String(r.eni || '').replace(/\\D/g, ''); }" % REC, [c])
    # a — направлен давно (2 ОИ из трёх), b — направлен позже и затем отозван.
    pg.evaluate("""async ([a, b, o1, o2]) => { const E = await import('./app/kernel/earlyInspection.js'); const R = await import('./app/kernel/registry.js');
      const t = R.getType('civil'); const ra = t.records.loadRecord(a), rb = t.records.loadRecord(b);
      E.sendEarly(ra, 'civil', { oiIds: [o1, o2], note: 'Проверка аудита' });
      E.sendEarly(rb, 'civil', {});
      const d = new Date(Date.now() - 2 * 864e5); ra.early.at = d.toISOString(); }""", [a, b, ois[0], ois[1]])

    # --- «Сегодня»: досрочно направленные без назначения ---
    t.open('#/inspections', wait='[data-ip-section]')
    pg.click('[data-ip-section="today"]')
    t.ck(t.wait_until("(k) => !!document.querySelector('[data-ip-today-q=\"' + k + '\"]')", 'civil|' + a), 'в «Сегодня» нет блока «Досрочно направлены» с объектом')
    pg.click('[data-ip-today-q="civil|%s"]' % a)
    t.ck(t.wait_until("(k) => !!document.querySelector('tr.cur[data-ip-row=\"' + k + '\"], .ip-pane .ip-early')", 'civil|' + a), 'строка «Досрочно направлены» не открыла объект в очереди')

    # --- «Что осмотреть»: ЕНИ и сведения ОИ, пометка «досрочно» ---
    t.wait_for('.ip-pane')
    briefs = pg.eval_on_selector_all('.ip-pane .ip-oi-brief', 'els => els.map((e) => e.textContent.trim())')
    t.ck(len(briefs) >= 2 and all(x for x in briefs), 'в «Что осмотреть» у ОИ нет ЕНИ и опознавательных сведений: %s' % briefs[:4])
    t.ck(pg.locator('.ip-pane .ip-flag.early').count() >= 2, 'у направленных ОИ в «Что осмотреть» нет пометки «досрочно»')

    # --- срок: при выборе даты не сохраняется, по «Назначить» — сохраняется ---
    if t.ck(pg.locator('[data-ip-f-deadline]').count() == 1, 'в панели назначения нет поля срока'):
        pg.fill('[data-ip-f-deadline]', '2099-05-05')
        pg.dispatch_event('[data-ip-f-deadline]', 'change')
        d0 = pg.evaluate("async ([id]) => %s.deadlineOf('civil', id)" % K, [a])
        t.ck(d0 != '2099-05-05', 'срок сохранился при выборе даты, до «Назначить»')
        if not pg.input_value('[data-ip-f-person]'):
            pg.select_option('[data-ip-f-person]', index=1)
        pg.click('[data-ip-f-ok]')
        t.ck(t.wait_until("async ([id]) => (await import('./app/kernel/inspections.js')).deadlineOf('civil', id) === '2099-05-05'", [a]),
             'срок не сохранился по «Назначить»: срок %r, ошибка панели %r' % (pg.evaluate("async ([id]) => (await import('./app/kernel/inspections.js')).deadlineOf('civil', id)", [a]),
                                                                       pg.inner_text('[data-ip-err]') if pg.locator('[data-ip-err]').count() else ''))
        pg.evaluate("async ([id]) => { const K = %s; K.assignmentsOf('civil', id).forEach((x) => K.unassign(x.id)); }" % K, [a])

    # --- очередь: отбор «Статус ОЦ», порядок, без группировки, строка направления ---
    t.open('#/inspections', wait='[data-ip-section]')
    pg.click('[data-ip-section="assign"]'); pg.click('[data-ip-team="queue"]')
    facets(t)
    t.ck(pg.locator('[data-ip-ff="status"]').count() > 0, 'в отборах очереди нет «Статус ОЦ»')
    pg.locator('[data-ip-ff="status"][data-ip-fv="В заполнении"]').first.click()
    t.ck(t.wait_until("() => document.querySelectorAll('tr[data-ip-row]').length > 0"), 'отбор «Статус ОЦ: В заполнении» оставил очередь пустой')
    stats = pg.evaluate("""async () => { const M = await import('./app/pages/inspections/model.js');
      const keys = [...document.querySelectorAll('tr[data-ip-row]')].map((e) => e.dataset.ipRow);
      const R = await import('./app/kernel/registry.js');
      return keys.map((k) => { const [ty, id] = k.split('|'); const r = R.getType(ty).records.loadRecord(id); return r ? r.status : ''; }); }""")
    t.ck(stats and all(s == 'В заполнении' for s in stats), 'отбор «Статус ОЦ» пропустил другие статусы: %s' % sorted(set(stats))[:5])
    pg.select_option('[data-ip-qgroup]', 'none')
    pg.select_option('[data-ip-qsort]', 'sentNew')
    t.ck(t.wait_until("() => !document.querySelector('.ip-grouped tr.ip-grp') && document.querySelectorAll('tr[data-ip-row]').length > 0"), '«Без группировки» оставил строки групп')
    order = pg.eval_on_selector_all('tr[data-ip-row]', 'els => els.map((e) => e.dataset.ipRow)')
    ia, ib = ('civil|' + a) in order and order.index('civil|' + a), ('civil|' + b) in order and order.index('civil|' + b)
    t.ck(ia is not False and ib is not False and ib < ia, '«Направлены позже»: позже направленный объект не выше: a=%s b=%s' % (ia, ib))
    sub = pg.inner_text('tr[data-ip-row="civil|%s"]' % a)
    t.ck('направлен досрочно' in sub, 'в строке очереди нет «направлен досрочно ДД.ММ»: %r' % sub[:200])
    pg.select_option('[data-ip-qsort]', 'due'); pg.select_option('[data-ip-qgroup]', 'place')

    # --- уведомления: направлен, отозван; «Отметить прочитанными эти» — только вид ---
    pg.evaluate("async ([id]) => (await import('./app/kernel/earlyInspection.js')).cancelEarly(%s, 'civil')" % REC, [b])
    t.open('#/inspections', wait='[data-ip-section]')
    pg.click('[data-ip-section="notes"]')
    t.wait_for('[data-ip-notes-kind="earlySent"]')
    pg.click('[data-ip-notes-kind="earlySent"]')
    t.ck(t.wait_until("() => [...document.querySelectorAll('.ip-note')].some((e) => e.textContent.includes('Проверка аудита'))"), 'нет уведомления «Досрочно направлен на осмотр»')
    pg.click('[data-ip-notes-kind="earlyCancelled"]')
    t.ck(t.wait_until("() => document.querySelectorAll('.ip-note').length > 0"), 'нет уведомления «Досрочное направление отозвано»')
    unread_other = pg.evaluate("() => [...document.querySelectorAll('.ip-person-main[data-ip-notes-kind]')].length")
    pg.click('[data-ip-notes-kind="earlySent"]')
    pg.check('[data-ip-notes-unread]')
    before = pg.locator('.ip-note.unread').count()
    if before and pg.locator('[data-ip-notes-readall]').count():
        t.ck('эти' in pg.inner_text('[data-ip-notes-readall]'), 'при выбранном виде кнопка не «Отметить прочитанными эти»')
        pg.click('[data-ip-notes-readall]')
        pg.click('[data-ip-notes-kind="earlyCancelled"]')
        t.ck(t.wait_until("() => document.querySelectorAll('.ip-note.unread').length > 0"), '«Отметить прочитанными эти» отметило и уведомления другого вида')
    t.ck(unread_other > 0, 'нет списка видов уведомлений')

    # --- Ctrl K: подсказка «можно направить досрочно» ---
    if t.ck(eni_c, 'у объекта для поиска нет ЕНИ'):
        pg.click('[data-ip-jump]')
        pg.fill('[data-ip-jump]', eni_c)
        t.ck(t.wait_until("() => [...document.querySelectorAll('.ip-jump-list li')].some((e) => e.textContent.includes('можно направить досрочно'))"),
             'Ctrl K: у объекта «В заполнении» нет подсказки «можно направить досрочно»')

    # --- отметки «прочитано» — у каждого регионала свои; передача осмотрщика (ответ пользователя 24.11.2026) ---
    me = 'Осминнов Н.'
    other = 'Проверка Регионал'
    who = pg.evaluate("""async (me) => { const K = (await import('./app/kernel/inspections.js'));
      const n = K.profileNames().find((x) => !K.profileOf(x).fired && K.profileOf(x).manager && K.profileOf(x).manager !== me);
      return n ? [n, K.profileOf(n).manager] : null; }""", me)
    if not t.ck(who, 'нет осмотрщика, закреплённого за другим регионалом, — нечем проверить передачу'):
        return
    name, was = who
    pg.evaluate("async ([n, me]) => (await import('./app/kernel/inspections.js')).saveProfile(n, { manager: me })", [name, me])
    log = pg.evaluate("async (n) => (await import('./app/kernel/inspections.js')).profileOf(n).managerLog || []", name)
    t.ck(log and log[-1]['from'] == was and log[-1]['to'] == me, 'смена регионала не записана в журнал профиля: %s' % log[-1:])
    t.open('#/inspections', wait='[data-ip-section]')
    pg.click('[data-ip-section="notes"]')
    t.wait_for('[data-ip-notes-kind="transferred"]')
    pg.click('[data-ip-notes-kind="transferred"]')
    sel = '.ip-note[data-ip-note^="transferred|%s|"]' % name
    t.ck(t.wait_until("(s) => !!document.querySelector(s)", sel), 'новому регионалу нет уведомления «Осмотрщик передан»')
    txt = pg.inner_text(sel) if pg.locator(sel).count() else ''
    t.ck(('от ' + was) in txt and 'в работе' in txt, 'в уведомлении о передаче нет, от кого и сколько в работе: %r' % txt)
    nid = pg.get_attribute(sel, 'data-ip-note')
    pg.click(sel)
    t.ck(t.wait_until("(n) => !!document.querySelector('.ip-person.on [data-ip-person=\"' + n + '\"], [data-ip-ptab=\"trips\"][aria-current=\"true\"], [data-ip-ptab=\"trips\"].on')", name),
         'уведомление о передаче не открыло карточку осмотрщика')
    # Другой регионал: уведомление о досрочном направлении (видно обоим, Осминнов отметил его прочитанным выше) у него
    # не прочитано; Осминнову — по-прежнему прочитано.
    early_unread = """(t) => { const e = [...document.querySelectorAll('.ip-note')].find((x) => x.textContent.includes(t)); return e ? !e.classList.contains('unread') ? 'read' : 'unread' : ''; }"""
    pg.evaluate("async (o) => (await import('./app/kernel/session.js')).session.set({ person: o, role: 'any' })", other)
    t.open('#/inspections', wait='[data-ip-section]')
    pg.click('[data-ip-section="notes"]')
    t.wait_for('[data-ip-notes-kind="earlySent"]')
    pg.click('[data-ip-notes-kind="earlySent"]')
    if pg.is_checked('[data-ip-notes-unread]'):
        pg.uncheck('[data-ip-notes-unread]')
    t.wait_until("(t) => [...document.querySelectorAll('.ip-note')].some((x) => x.textContent.includes(t))", 'Проверка аудита')
    st_other = pg.evaluate(early_unread, 'Проверка аудита')
    t.ck(st_other == 'unread', 'отметка «прочитано» одного регионала видна другому: %r' % st_other)
    pg.evaluate("async (me) => (await import('./app/kernel/session.js')).session.set({ person: me, role: 'any' })", me)
    t.open('#/inspections', wait='[data-ip-section]')
    pg.click('[data-ip-section="notes"]')
    t.wait_for('[data-ip-notes-kind="earlySent"]')
    pg.click('[data-ip-notes-kind="earlySent"]')
    if pg.is_checked('[data-ip-notes-unread]'):
        pg.uncheck('[data-ip-notes-unread]')
    t.wait_until("(t) => [...document.querySelectorAll('.ip-note')].some((x) => x.textContent.includes(t))", 'Проверка аудита')
    st_me = pg.evaluate(early_unread, 'Проверка аудита')
    t.ck(st_me == 'read', 'своя отметка «прочитано» пропала после входа другого регионала: %r' % st_me)
    pg.evaluate("async ([n, w]) => (await import('./app/kernel/inspections.js')).saveProfile(n, { manager: w })", [name, was])

    # --- ЦОД меняет состав досрочного направления после назначения (24.11.2026) ---
    drift = pg.evaluate("""async () => {
      const K = await import('./app/kernel/inspections.js'); const R = await import('./app/kernel/registry.js');
      const E = await import('./app/kernel/earlyInspection.js'); const t = R.getType('civil');
      for (const x of t.records.queryRecords({ filter: {}, offset: 0, limit: 600 }).rows) {
        const r = t.records.loadRecord(x.id);
        if (!r || r.status !== 'В заполнении' || r.early || (r.oi || []).length < 3 || K.assignmentsOf('civil', x.id, { live: false }).length) continue;
        const o = r.oi.map((y) => y.id);
        E.sendEarly(r, 'civil', { oiIds: [o[0], o[1]], note: 'Проверка состава' });
        const who = K.profileNames ? K.profileNames()[0] : '';
        K.assign({ typeId: 'civil', ocId: x.id, person: who, oiIds: [o[0], o[1]], docs: [], inventories: [], plannedAt: new Date().toISOString().slice(0, 10), note: '' });
        E.updateEarly(r, { oiIds: [o[0], o[2]], note: 'Проверка состава' });
        const a = K.assignmentsOf('civil', x.id).find(K.isLive);
        return { id: x.id, person: a.person, aid: a.id, want: [o[0], o[2]].sort() };
      }
      return null; }""")
    if not t.ck(drift, 'нет нежилого здания «В заполнении» с тремя ОИ без назначений — нечем проверить расхождение состава'):
        return
    t.open('#/inspections', wait='[data-ip-section]')
    pg.click('[data-ip-section="assign"]')
    pg.click('[data-ip-team="assigned"]')
    pg.click('[data-ip-aperson="%s"]' % drift['person'])
    row = pg.locator('tr[data-ip-row="%s"]' % drift['aid'])
    t.ck(t.wait_until("(k) => !!document.querySelector('tr[data-ip-row=\"' + k + '\"] .ip-flag.drift')", drift['aid']), 'у назначения нет пометки «состав изменён»')
    row.click()
    t.wait_for('[data-ip-early-sync]')
    txt = pg.inner_text('.ip-early')
    t.ck('добавлены' in txt and 'убраны' in txt, 'в панели не сказано, что добавлено и что убрано: %r' % txt[:300])
    pg.click('[data-ip-early-sync]')
    got = sorted(pg.eval_on_selector_all('.ip-pane [data-ip-f-oi]:checked', 'els => els.map((e) => e.dataset.ipFOi)'))
    t.ck(got == drift['want'], '«Привести к составу» отметило не ОИ направления: %s, ждали %s' % (got, drift['want']))
    pg.click('[data-ip-f-ok]')
    t.ck(t.wait_until("async ([id]) => !(await import('./app/pages/inspections/model.js')).earlyDrift('civil', id)", [drift['id']]),
         'после сохранения состава расхождение осталось')
    pg.click('[data-ip-section="history"]')
    t.ck(t.wait_until("() => document.querySelectorAll('.k-earlySent').length > 0 && document.querySelectorAll('.k-earlyEdited').length > 0"),
         'в «Журнале» нет событий досрочного направления')

    # --- доступ к экрану по роли (26.11.2026) ---
    ROLE = "async (r) => (await import('./app/kernel/session.js')).session.set({ role: r })"
    pg.evaluate(ROLE, 'cod')
    t.ck(t.wait_until("() => document.querySelector('.ip-denied') && !document.querySelector('.ip-topline')"),
         'под ролью «оператор ЦОД» экран «Регионалы» открыт')
    t.ck(t.wait_until("() => { const b = document.querySelector('[data-nav=insp]'); return !b || b.hidden; }"),
         'под ролью «оператор ЦОД» виден пункт меню «Регионалы»')
    pg.evaluate(ROLE, 'rm')
    t.ck(t.wait_until("() => !document.querySelector('.ip-denied') && !!document.querySelector('[data-ip-section]')"),
         'региональному менеджеру экран «Регионалы» не открылся после смены роли')
    t.ck(pg.evaluate("() => !document.querySelector('[data-nav=insp]').hidden"), 'региональному менеджеру не виден пункт меню «Регионалы»')
    pg.evaluate(ROLE, 'any')
