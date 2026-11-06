# -*- coding: utf-8 -*-
"""«Мои осмотры» — только назначения регионала: одно число везде, осмотрщики в карточке по назначениям.

Решение пользователя 06.11.2026 на вопрос «Одно определение «моих осмотров»»: «Только
назначения» — действующие назначения регионала на человека, одно число везде; в карточке
осмотрщики — по назначениям (двое — оба, с ОИ); поле «Осмотрщик» ЦОД руками не задаёт.

Что ловит сценарий:
  * срез «Мне осмотреть» считает по полю карточки и статусу, а не по назначениям;
  * задачи осмотрщика включают объекты «по карточке» без назначения;
  * поле «Осмотрщик» в карточке выбирается руками или показывает одного из двух.
"""
NAME = 'мои осмотры — по назначениям'

TOUCHES = ('app/pages/ocMenu/slices.js', 'app/kernel/inspections.js', 'app/kernel/inspectionTab.js',
           'app/pages/inspector/results.js', 'app/modules/*/card/parties.view.js', 'app/modules/vehicle/parties.view.js',
           'app/modules/mechanisms/parties.view.js')

K = "await import('./app/kernel/inspections.js')"


def run(t):
    pg = t.page
    t.open('', wait='[data-slice="my-insp"]')
    # Объект с двумя осмотрщиками на разные ОИ.
    pick = pg.evaluate("""async () => { const R = await import('./app/kernel/registry.js'); const K = %s; const t = R.getType('civil');
      const s = t.records.queryRecords({ filter: {}, offset: 0, limit: 300 }).rows.find((x) => (t.records.loadRecord(x.id).oi || []).length >= 2
        && !K.assignmentsOf('civil', x.id, { live: false }).length);
      const oi = t.records.loadRecord(s.id).oi;
      K.assign({ typeId: 'civil', ocId: s.id, person: 'Айдай', oiIds: [oi[0].id] });
      K.assign({ typeId: 'civil', ocId: s.id, person: 'Бакыт', oiIds: [oi[1].id] });
      return s.id; }""" % K)
    # Объекты «по карточке» без назначения не считаются задачами.
    st = pg.evaluate("""async () => { const K = %s; const live = K.liveObjectsOf('Айдай');
      const tasks = K.tasksOf('Айдай').filter((x) => x.assign && K.isLive(x.assign)).map((x) => x.typeId + '|' + x.ocId);
      const extra = K.tasksOf('Айдай').filter((x) => !x.assign).length;
      return { live: live.size, tasks: new Set(tasks).size, extra }; }""" % K)
    t.ck(st['extra'] == 0, 'задачи осмотрщика включают объекты без назначения: %s' % st)
    t.ck(st['live'] == st['tasks'], 'число назначений и задач расходится: %s' % st)
    # Срез «Мне осмотреть» у Айдай — то же число.
    per = pg.evaluate("""async () => { const Q = await import('./app/pages/ocMenu/query.js'); const S = await import('./app/pages/ocMenu/slices.js');
      return ['estate', 'movable'].map((kind) => Q.countAll({ ...S.filterForSlice(S.sliceDefs(kind).find((d) => d.key === 'my-insp'), 'Айдай'), kind })); }""")
    t.ck(sum(per) == st['live'], '«Мне осмотреть» (%s) ≠ действующих назначений (%d)' % (per, st['live']))
    # На главной у Айдай — то же число на вкладке «Недвижимое».
    pg.evaluate("async () => (await import('./app/kernel/session.js')).session.set({ person: 'Айдай', role: 'any' })")
    t.ck(t.wait_until("(n) => ((document.querySelector('[data-slice=\"my-insp\"]') || {}).textContent || '').includes(String(n[0]))", [per[0]]),
         'на срезе «Мне осмотреть» не %d: %r' % (per[0], pg.inner_text('[data-slice="my-insp"]')))
    pg.evaluate("async () => (await import('./app/kernel/session.js')).session.set({ person: 'Осминнов Н.', role: 'any' })")
    # Карточка: оба осмотрщика с ОИ, поле только для чтения.
    t.open('#/oc/civil/%s' % pick, wait='[data-oc-head]')
    if pg.locator('[data-tab="general"]').count():
        pg.click('[data-tab="general"]')
    t.wait_for('[data-resp-insp]')
    v = pg.inner_text('[data-resp-insp]')
    t.ck('Айдай —' in v and 'Бакыт —' in v, 'в карточке не оба осмотрщика с ОИ: %r' % v)
    t.ck(pg.locator('[data-resp-insp] input, [data-resp-insp] select, select[data-resp="insp"]').count() == 0,
         'поле «Осмотрщик» в карточке выбирается руками')
