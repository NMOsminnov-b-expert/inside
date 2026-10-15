# -*- coding: utf-8 -*-
"""Работа вне выездов: день отмечается в календаре и перестаёт быть свободным.

ТЗ рабочего дня осмотрщика, раздел 4 (запись графа tz-rabota-osmotrschika).

Что ловит сценарий:
  * день без выездов в календаре осмотрщика не открывается — работу вне
    выездов отметить негде;
  * командировка без области записывается молча;
  * отмеченный день остаётся в «свободно N дн.» и в подсказке «Кого
    назначить» показан свободным (п. 4.2 ТЗ);
  * метки вида нет в календаре; запись не удаляется;
  * в консоли ошибки.
"""
NAME = 'работа вне выездов'

TOUCHES = ('app/pages/inspections/*', 'app/kernel/inspections.js', 'app/kernel/inspectionsDemo.js')

K = "import('./app/kernel/inspections.js')"
M = "import('./app/pages/inspections/model.js')"


def run(t):
    pg = t.page
    t.open('#/inspections', wait='[data-ip-section]')
    # Ближайший свободный рабочий день осмотрщика — без выездов и без
    # работы вне выездов (из модели, а не по календарю: тот зависит от даты).
    pick = pg.evaluate("""async () => {
      const k = await %s; const m = await %s;
      for (const p of m.inspectorRows(m.summaries()).filter((x) => !x.fired)) {
        const d = m.availability(p.name, 10).find((x) => !x.off && !x.load && !x.act);
        if (d) return [p.name, d.day, m.freeDays(p.name, 10)];
      }
      return null; }""" % (K, M))
    if not t.ck(pick, 'нет ни одного свободного рабочего дня у осмотрщиков на две недели'):
        return
    who, day, free0 = pick

    pg.click('[data-ip-section="people"]')
    pg.locator('.ip-person-main[data-ip-person="%s"]' % who).click()
    pg.click('[data-ip-ptab="trips"]')
    t.wait_for('.ipc-cal')
    if day[:7] != pg.evaluate("() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }"):
        pg.click('[data-ipc-month="1"]')
    cell = '.ipc-cal-d[data-ip-dp-open="day:%s"]' % day
    if not t.ck(t.wait_for(cell), 'день без выездов %s в календаре не открывается' % day):
        return
    pg.click(cell)
    t.wait_for('[data-ip-act-add]')

    # Командировка без области — не молча.
    pg.select_option('[data-ip-act="kind"]', 'trip')
    t.ck(pg.locator('[data-ip-act="region"]').is_visible(), 'у командировки нет поля «Область»')
    pg.click('[data-ip-act-add]')
    t.ck(t.wait_until("() => /област/i.test(document.querySelector('[data-ip-act-err]')?.textContent || '')"),
         'командировка без области не остановилась')

    pg.select_option('[data-ip-act="kind"]', 'home')
    t.ck(not pg.locator('[data-ip-act="region"]').is_visible(), 'у работы дома показано поле «Область»')
    pg.fill('[data-ip-act="note"]', 'разбор снимков')
    pg.click('[data-ip-act-add]')
    t.ck(t.wait_for('.ip-act-list li'), 'работа дома не записалась в панели дня')
    t.ck(t.wait_for(cell + ' .ipc-chip.k-act'), 'в календаре нет метки работы вне выездов')

    free1, reason = pg.evaluate("""async ([w, d]) => {
      const m = await %s; const all = m.summaries();
      const people = m.inspectorRows(all);
      const any = m.queueBase(all)[0];
      // Подбор «кому и когда» (route.js, recommendAssign; 15.10.2026).
      const R = await import('./app/pages/inspections/route.js');
      const r = any ? R.recommendAssign(all, people, [{ typeId: any.typeId, ocId: any.ocId }], d).find((p) => p.name === w) : null;
      return [m.freeDays(w, 10), r ? r.reasons.map((x) => (x.ok ? '+' : '-') + x.text).join('|') : ''];
    }""" % M, [who, day])
    t.ck(free1 == free0 - 1, 'день с работой дома остался свободным: было %s, стало %s' % (free0, free1))
    t.ck('-дома' in reason, '«Кого назначить» не показал, что в этот день работа дома: %s' % reason)

    pg.locator('.ip-act-list [data-ip-act-del]').first.click()
    t.ck(t.wait_until("() => !document.querySelector('.ip-act-list li')"), 'запись работы вне выездов не удалилась')
    t.ck(pg.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'страница прокручивается вбок')
