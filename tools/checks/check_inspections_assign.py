# -*- coding: utf-8 -*-
"""Назначения на осмотр (kernel/inspections.js), шаг (а) ТЗ панели осмотров.

Что ловит сценарий:
  * роли «Региональный менеджер» нет в переключателе, или ей не видна кнопка
    «Назначить осмотрщика» в реестре;
  * массовое назначение из реестра пишет только resp.insp и не заводит
    назначение (у осмотрщика не будет ни документов, ни истории);
  * назначение не попадает в журнал событий или не переживает перезагрузку;
  * снятие назначения не очищает осмотрщика в записи;
  * экран осмотрщика не видит задачу, назначенную на отдельный ОИ (поле
    resp.insp одно на запись — задача должна прийти из назначения).
"""
NAME = 'назначения на осмотр'

TOUCHES = ('app/kernel/inspections.js', 'app/pages/inspector/tasks.js', 'app/pages/ocMenu/ocMenu.js',
           'app/pages/ocMenu/state.js', 'app/kernel/session.js', 'app/kernel/persist.js')

INSP = "async () => await import('./app/kernel/inspections.js')"


def run(t):
    pg = t.page
    t.open('', wait='.reg-tr')

    # --- роль --------------------------------------------------------------------
    pg.click('[data-user-toggle]')
    if not t.ck(pg.locator('input[name="um-role"][value="rm"]').count() == 1, 'в переключателе нет роли «Региональный менеджер»'):
        return
    pg.check('input[name="um-role"][value="rm"]')
    pg.keyboard.press('Escape')

    # --- массовое назначение из реестра ----------------------------------------------
    row = pg.locator('.reg-tr[data-row]').first
    type_id, oc_id = row.get_attribute('data-row').split('|')
    row.locator('input[data-select]').check()
    if not t.ck(t.wait_for('[data-bulk="insp"]'), 'региональному менеджеру не видна кнопка «Назначить осмотрщика»'):
        return
    pg.click('[data-bulk="insp"]')
    t.wait_for('[data-modal-opt]')
    person = pg.locator('[data-modal-opt]').first.get_attribute('data-modal-opt')
    pg.locator('[data-modal-opt]').first.click()

    got = pg.evaluate("""async ([typeId, ocId]) => { const m = await import('./app/kernel/inspections.js');
      const a = m.assignmentsOf(typeId, ocId).filter((x) => !x.demo); const ev = m.eventsOf({ typeId, ocId }).filter((x) => !x.demo);
      return { n: a.length, person: a[0] && a[0].person, by: a[0] && a[0].by, ev: ev.map((e) => e.kind) }; }""", [type_id, oc_id])
    t.ck(got['n'] == 1 and got['person'] == person, 'назначение из реестра не заведено: %s' % got)
    t.ck('assigned' in got['ev'], 'назначение не попало в журнал событий: %s' % got)

    resp = """async ([typeId, ocId]) => { const r = (await import('./app/kernel/registry.js')).getType(typeId).records.loadRecord(ocId);
      return (r.resp || {}).insp || ''; }"""
    t.ck(pg.evaluate(resp, [type_id, oc_id]) == person, 'осмотрщик не записан в объект оценки')

    # --- перезагрузка ------------------------------------------------------------------
    pg.evaluate("async () => (await import('./app/kernel/persist.js')).saveNow()")
    pg.reload()
    t.wait_for('.reg-tr')
    n = pg.evaluate("async ([typeId, ocId]) => (await import('./app/kernel/inspections.js')).assignmentsOf(typeId, ocId).filter((x) => !x.demo).length", [type_id, oc_id])
    t.ck(n == 1, 'назначение не пережило перезагрузку: %s' % n)

    # --- назначение на отдельный ОИ видно осмотрщику -------------------------------------
    other = pg.evaluate("""async () => { const reg = await import('./app/kernel/registry.js');
      for (const t of reg.sortedTypes()) { const res = t.records.queryRecords({ filter: {}, offset: 0, limit: 50 });
        for (const s of res.rows) { const r = t.records.loadRecord(s.id); if (r && (r.oi || []).length) return [t.manifest.id, s.id, r.oi[0].id]; } }
      return null; }""")
    if t.ck(other, 'не нашлось записи с ОИ'):
        tasks = pg.evaluate("""async ([typeId, ocId, oiId]) => { const m = await import('./app/kernel/inspections.js');
          m.assign({ typeId, ocId, person: 'Проверочный О.', oiIds: [oiId] });
          const t = await import('./app/pages/inspector/tasks.js'); t.setInspector('Проверочный О.');
          return t.myTasks().map((x) => x.ocId); }""", other)
        t.ck(other[1] in tasks, 'осмотрщик не видит задачу, назначенную на ОИ: %s' % tasks)

    # --- снятие --------------------------------------------------------------------------------
    left = pg.evaluate("""async ([typeId, ocId]) => { const m = await import('./app/kernel/inspections.js');
      m.assignmentsOf(typeId, ocId).filter((a) => !a.demo).forEach((a) => m.unassign(a.id));
      const r = (await import('./app/kernel/registry.js')).getType(typeId).records.loadRecord(ocId);
      const mine = (x) => !x.demo; return { live: m.assignmentsOf(typeId, ocId).filter(mine).length, all: m.assignmentsOf(typeId, ocId, { live: false }).filter(mine).length, insp: (r.resp || {}).insp || '' }; }""",
                       [type_id, oc_id])
    t.ck(left['live'] == 0 and left['all'] >= 1, 'снятое назначение пропало из истории или осталось действующим: %s' % left)
    t.ck(left['insp'] == '', 'после снятия осмотрщик остался в объекте оценки: %s' % left)
