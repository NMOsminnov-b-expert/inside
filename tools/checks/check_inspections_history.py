# -*- coding: utf-8 -*-
"""«История» назначений: автор и «было → стало».

Решение пользователя 05.11.2026 на вопрос «Автор и «было → стало» в истории назначений»:
«Да, автор и было → стало» — в каждой строке: кто сделал и что изменилось (дата,
осмотрщик, ОИ).

Что ловит сценарий:
  * перенос даты, изменение назначения, переназначение — без «было → стало»;
  * в строке не видно, кто сделал (регионал, а не сам осмотрщик);
  * даты — в виде 2099-03-01, а не 01.03.2099.
"""
NAME = 'история назначений: автор и было → стало'

TOUCHES = ('app/kernel/inspections.js', 'app/pages/inspections/stats.js', 'app/pages/inspections/inspections.js')

K = "await import('./app/kernel/inspections.js')"


def run(t):
    pg = t.page
    t.open('#/inspections?s=people', wait='.ip-person-main')
    got = pg.evaluate("""async () => { const m = %s; const S = await import('./app/kernel/session.js'); const me = S.session.state.person;
      const a = m.allAssignments().find((x) => m.isLive(x) && x.person !== me && (x.oiIds || []).length === 0);
      if (!a) return null;
      const other = m.profileNames ? m.profileNames().find((n) => n !== a.person && n !== me) : null;
      const to = other || [...new Set(m.allAssignments().map((x) => x.person))].find((n) => n !== a.person && n !== me);
      m.moveDateMany([a.id], '2099-03-01');
      m.assign({ typeId: a.typeId, ocId: a.ocId, person: a.person, oiIds: [], docs: [], plannedAt: '2099-03-02', note: 'проверка истории', prevId: a.id });
      const b = m.reassign(a.id, to);
      return { from: a.person, to, me, ocId: a.ocId, b: b && b.id }; }""" % K)
    if not t.ck(got and got['to'], 'нет назначения и второго осмотрщика для проверки истории'):
        return
    pg.click('[data-ip-section="history"]')
    t.wait_for('.ipc-ev')
    texts = pg.evaluate("() => [...document.querySelectorAll('.ipc-ev .ipc-ev-what')].map((x) => x.innerText)")
    t.ck(any('01.03.2099' in x and '→' in x for x in texts), 'перенос даты без «было → стало» в ДД.ММ.ГГГГ: %s' % texts[:6])
    t.ck(any('дата 01.03.2099 → 02.03.2099' in x and 'комментарий' in x for x in texts), 'изменение назначения без «было → стало»: %s' % texts[:6])
    t.ck(any('переназначено: %s → %s' % (got['from'], got['to']) in x for x in texts), 'переназначение без «кто → кому»: %s' % texts[:6])
    t.ck(any('· %s' % got['me'] in x for x in texts), 'в строках истории не видно, кто сделал (%s): %s' % (got['me'], texts[:6]))
