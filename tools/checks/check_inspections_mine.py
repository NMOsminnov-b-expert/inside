# -*- coding: utf-8 -*-
"""«Мои / Все» в панели регионала ограничивает выбор исполнителя.

Решение пользователя 05.11.2026 на вопрос «Регионал как исполнитель и «Мои / Все»»: «Мои — и
в выборе» — регионал может быть исполнителем; при «Мои» в подборе «Кто поедет» и в выборе
осмотрщика — только закреплённые за ним и он сам, при «Все» — любой.

Что ловит сценарий:
  * при «Мои» в выборе осмотрщика и в «Кто поедет» есть чужие;
  * при «Мои» в выборе нет самого регионала;
  * при «Все» чужих нет (переключатель сужает навсегда).
"""
NAME = '«Мои / Все» в назначении'

TOUCHES = ('app/pages/inspections/inspections.js', 'app/pages/inspections/assignPane.js', 'app/kernel/inspections.js')

OPTS = "() => [...document.querySelectorAll('.ip-pane [data-ip-f-person] option')].map((o) => o.value).filter(Boolean)"
PICKS = "() => [...document.querySelectorAll('.ip-pane [data-ip-pick-person]')].map((b) => b.dataset.ipPickPerson)"


def run(t):
    pg = t.page
    t.open('#/inspections?s=people', wait='[data-ip-mode]')
    mine = pg.evaluate("""async () => { const m = await import('./app/kernel/inspections.js'); const S = await import('./app/kernel/session.js');
      const me = S.session.state.person; const names = [...new Set(m.allAssignments().map((a) => a.person))];
      return { me, mine: names.filter((n) => m.profileOf(n).manager === me) }; }""")
    me, own = mine['me'], set(mine['mine'])
    # «Мои / Все» — в списке осмотрщиков; выбор держится и в «К назначению».
    pg.click('[data-ip-mode="mine"]')
    pg.click('[data-ip-team="queue"]')
    t.wait_for('tr[data-ip-row]')
    pg.locator('tr[data-ip-row] td:nth-child(3)').first.click()
    t.wait_for('.ip-pane [data-ip-f-person]')
    opts = pg.evaluate(OPTS)
    picks = pg.evaluate(PICKS)
    t.ck(me in opts, 'при «Мои» в выборе осмотрщика нет самого регионала (%s): %s' % (me, opts))
    t.ck(all(x == me or x in own for x in opts), 'при «Мои» в выборе осмотрщика чужие: %s' % [x for x in opts if x != me and x not in own])
    t.ck(all(x == me or x in own for x in picks), 'при «Мои» в «Кто поедет» чужие: %s' % [x for x in picks if x != me and x not in own])
    pg.click('[data-ip-team="people"]')
    pg.click('[data-ip-mode="all"]')
    pg.click('[data-ip-team="queue"]')
    t.wait_for('tr[data-ip-row]')
    pg.locator('tr[data-ip-row] td:nth-child(3)').first.click()
    t.wait_for('.ip-pane [data-ip-f-person]')
    t.ck(t.wait_until("() => [...document.querySelectorAll('.ip-pane [data-ip-f-person] option')].filter((o) => o.value).length > %d" % len(opts)),
         'при «Все» в выборе осмотрщика не больше людей, чем при «Мои»')
