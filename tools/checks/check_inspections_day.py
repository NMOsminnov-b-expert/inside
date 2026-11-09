# -*- coding: utf-8 -*-
"""День осмотрщика, сторона регионала: перенос с подтверждением, отчёт задним числом, пробег по дорогам.

Решения пользователя 06.11.2026:
  * перенос выезда осмотрщиком — причина «Объект закрыт», регионал подтверждает; пока не ответил —
    выезд на прежней дате с «запрошен перенос»;
  * отчёт за прошедший день — до 3 рабочих дней, у регионала пометка «сдан позже»;
  * пробег дня — по дорогам через OSRM/OSM (дом → объекты дня → дом).

Что ловит сценарий:
  * запрос переноса сразу меняет дату или не виден регионалу в «Сегодня» и уведомлениях;
  * «Разрешить» не ставит новую дату, «Отклонить» не оставляет прежнюю;
  * нет причины «Объект закрыт»;
  * отчёт старше 3 рабочих дней принимается; сданный позже не помечен;
  * пробег по дорогам не считается или наружу уходит что-то кроме координат.
"""
NAME = 'день осмотрщика: перенос, отчёт позже, пробег'

TOUCHES = ('app/kernel/inspections.js', 'app/kernel/inspectionsDicts.js', 'app/pages/inspections/inspections.js',
           'app/pages/inspections/notify.js', 'app/pages/inspections/route.js', 'app/pages/inspections/detail.js',
           'app/pages/inspections/model.js', 'tools/checks/harness.py')

K = "await import('./app/kernel/inspections.js')"
ISO = "const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');"


def run(t):
    pg = t.page
    t.open('#/inspections?s=people', wait='.ip-person-main')
    t.ck(pg.evaluate("async () => (%s).skipReasons().includes('Объект закрыт')" % K), 'нет причины «Объект закрыт»')
    a = pg.evaluate("""async () => { const K = %s; const R = await import('./app/kernel/registry.js'); %s
      const t = R.getType('civil'); const s = t.records.queryRecords({ filter: { status: ['Удостоверен по документам'] }, offset: 0, limit: 300 }).rows
        .find((x) => !K.assignmentsOf('civil', x.id, { live: false }).length);
      const today = iso(new Date()); const later = new Date(); later.setDate(later.getDate() + 5);
      const x = K.assign({ typeId: 'civil', ocId: s.id, person: 'Айдай', plannedAt: today });
      K.requestMove(x.id, { date: iso(later), reason: 'Объект закрыт', note: 'ремонт' });
      return { id: x.id, today, later: iso(later), now: K.allAssignments().find((y) => y.id === x.id).plannedAt }; }""" % (K, ISO))
    t.ck(a['now'] == a['today'], 'запрос переноса сразу сменил дату: %s' % a)
    t.open('#/inspections?s=today', wait='.ip-today')
    pg.click('.ip-today [data-ip-mode="all"]')
    t.ck(t.wait_for('[data-ip-move-ok="%s"]' % a['id']), 'запроса переноса нет в «Сегодня»')
    t.ck('Запрошен перенос выезда' in pg.evaluate("async () => { const N = await import('./app/pages/inspections/notify.js'); return N.NOTE_KINDS.map((k) => k.label).join('|'); }"),
         'нет вида уведомления о переносе')
    pg.click('[data-ip-move-ok="%s"]' % a['id'])
    now = pg.evaluate("async (id) => (%s).allAssignments().find((y) => y.id === id).plannedAt" % K, a['id'])
    t.ck(now == a['later'], '«Разрешить» не поставило новую дату: %s' % now)
    # Отклонить — дата прежняя.
    pg.evaluate("async ([id, d]) => (%s).requestMove(id, { date: d, reason: 'Погода' })" % K, [a['id'], a['today']])
    t.open('#/inspections?s=today', wait='.ip-today')
    pg.click('.ip-today [data-ip-mode="all"]')
    t.wait_for('[data-ip-move-no="%s"]' % a['id'])
    pg.click('[data-ip-move-no="%s"]' % a['id'])
    # Причина отказа обязательна (пользователь 09.11.2026): без неё — ошибка у поля.
    t.wait_for('[data-ip-move-why="%s"]' % a['id'])
    pg.click('[data-ip-move-refuse="%s"]' % a['id'])
    t.ck(t.wait_until("() => /причину/.test((document.querySelector('[data-ip-move-err]') || {}).textContent || '')"), 'отказ без причины не остановлен')
    pg.fill('[data-ip-move-why="%s"]' % a['id'], 'Объект в плане недели')
    pg.click('[data-ip-move-refuse="%s"]' % a['id'])
    t.wait_until("(id) => !document.querySelector('[data-ip-move-why=\"' + id + '\"]')", a['id'])
    st = pg.evaluate("async (id) => { const x = (%s).allAssignments().find((y) => y.id === id); return [x.plannedAt, !!x.moveReq, (x.moveRefused || {}).why || '']; }" % K, a['id'])
    t.ck(st == [a['later'], False, 'Объект в плане недели'], '«Отклонить» не оставило прежнюю дату или потеряло причину: %s' % st)

    # Отчёт задним числом: до 3 рабочих дней — да, с пометкой; позже — нет.
    rep = pg.evaluate("""async () => { const K = %s; %s
      const back = (n) => { const d = new Date(); let k = 0; while (k < n) { d.setDate(d.getDate() - 1); if (K.workdayOf('Проверка Отчётов', iso(d)).ok) k++; } return iso(d); };
      const ok = K.saveReport({ person: 'Проверка Отчётов', date: back(2), kind: 'evening', km: 10 });
      const old = K.saveReport({ person: 'Проверка Отчётов', date: back(6), kind: 'evening', km: 10 });
      return { ok: !!ok, old: !!old, late: K.dayReport('Проверка Отчётов', back(2)).eveningLate }; }""" % (K, ISO))
    t.ck(rep['ok'] and not rep['old'] and rep['late'], 'отчёт задним числом: окно 3 рабочих дня или пометка не работают: %s' % rep)

    # Пробег по дорогам (OSRM в стенде подменён: 42,5 км); наружу — только координаты.
    km = pg.evaluate("""async () => { const K = %s; const Rt = await import('./app/pages/inspections/route.js'); %s
      const p = K.profileOf('Айдай'); K.saveProfile('Айдай', { ...p, homeGps: '42.874600, 74.569800' });
      const pts = Rt.dayPoints('Айдай', iso(new Date()));
      const urls = []; const f = window.fetch; window.fetch = (u, o) => { urls.push(String(u)); return f(u, o); };
      const km = pts ? await Rt.osrmKm(pts) : null; window.fetch = f;
      return { n: pts ? pts.length : 0, km, url: urls[0] || '' }; }""" % (K, ISO))
    t.ck(km['km'] == 42.5 or (km['n'] == 0 and km['km'] is None), 'пробег по дорогам не посчитан: %s' % km)
    t.ck(not km['url'] or all(ch in '0123456789.,;-' for ch in km['url'].split('/driving/')[1].split('?')[0]),
         'в запрос маршрута ушло не только координаты: %s' % km['url'])
