# -*- coding: utf-8 -*-
"""Увольнение осмотрщика: незаконченные назначения возвращаются в «К назначению».

Решение пользователя 05.11.2026 на вопрос «Назначения уволенного осмотрщика»: «Вернуть
в «К назначению»» — при увольнении незаконченные назначения снимаются, объекты идут в
очередь, сделанное остаётся.

Что ловит сценарий:
  * статус «Уволен» в профиле оставляет назначения за человеком (он пропадает из
    «Назначено», а объекты не попадают в очередь);
  * снятие не пишет в историю, почему снято;
  * законченные назначения уволенного тоже снимаются.
"""
NAME = 'увольнение осмотрщика'

TOUCHES = ('app/kernel/inspections.js', 'app/pages/inspections/inspections.js')

K = "await import('./app/kernel/inspections.js')"


def run(t):
    pg = t.page
    t.open('#/inspections?s=people', wait='.ip-person-main')
    # Осмотрщик с действующими назначениями и хотя бы одним законченным — не вошедший человек.
    who = pg.evaluate("""async () => { const m = %s; const S = await import('./app/kernel/session.js'); const me = S.session.state.person;
      const by = new Map(); m.allAssignments().forEach((a) => { const v = by.get(a.person) || { live: 0, done: 0 }; if (m.isLive(a)) v.live++; if (a.state === 'done') v.done++; by.set(a.person, v); });
      const hit = [...by.entries()].filter(([p, v]) => p !== me && v.live > 0).sort((x, y) => y[1].done - x[1].done)[0];
      return hit ? hit[0] : ''; }""" % K)
    if not t.ck(who, 'нет осмотрщика с действующими назначениями — нечем проверить увольнение'):
        return
    before = pg.evaluate("""async (w) => { const m = %s; const all = m.allAssignments().filter((a) => a.person === w);
      return { live: all.filter(m.isLive).map((a) => a.id), done: all.filter((a) => a.state === 'done').map((a) => a.id),
        keys: all.filter(m.isLive).map((a) => a.typeId + '|' + a.ocId) }; }""" % K, who)
    # Хотя бы один объект уволенного — «Направлен на осмотр» и с одним этим назначением: ему место в очереди.
    pg.evaluate("""async (keys) => { const m = %s; const Mo = await import('./app/pages/inspections/model.js'); const R = await import('./app/kernel/registry.js');
      const k = keys.find((x) => { const [ty, oc] = x.split('|'); return m.assignmentsOf(ty, oc).filter(m.isLive).length === 1; });
      if (k) { const [ty, oc] = k.split('|'); R.getType(ty).records.loadRecord(oc).status = Mo.READY_STATUS; } }""" % K, before['keys'])
    pg.locator('.ip-person-main[data-ip-person="%s"]' % who).click()
    pg.click('[data-ip-ptab="profile"]')
    t.wait_for('[data-ip-c-radio="fired"]')
    pg.locator('label:has([data-ip-c-radio="fired"][value="1"])').click()
    pg.click('[data-ip-c-save]')
    after = pg.evaluate("""async ([w, ids, done]) => { const m = %s;
      return { live: ids.filter((id) => m.isLive(m.assignmentById(id))).length,
        why: ids.every((id) => m.eventsOf({}).some((e) => e.assignId === id && e.kind === 'removed' && /уволен/.test(e.text || ''))),
        done: done.filter((id) => (m.assignmentById(id) || {}).state === 'done').length }; }""" % K, [who, before['live'], before['done']])
    t.ck(after['live'] == 0, 'у уволенного остались действующие назначения: %d из %d' % (after['live'], len(before['live'])))
    t.ck(after['why'], 'в истории снятия нет причины «осмотрщик уволен»')
    t.ck(after['done'] == len(before['done']), 'законченные назначения уволенного тронуты')
    # Объекты — снова в «К назначению», если других действующих назначений у них нет.
    pg.click('[data-ip-team="queue"]')
    t.wait_for('tr[data-ip-row], .ip-empty')
    # Ждать в очереди — по её правилам (pages/inspections/model.js queueBase): статус «Направлен на осмотр»,
    # осмотрен не полностью, других действующих назначений нет.
    back = pg.evaluate("""async (keys) => { const m = %s; const Mo = await import('./app/pages/inspections/model.js'); const R = await import('./app/kernel/registry.js');
      return keys.filter((k) => { const [ty, oc] = k.split('|'); const s = R.getType(ty).records.getSummary(oc);
        return s && s.status === Mo.READY_STATUS && Mo.coverageOf(ty, oc).state !== 'full' && !m.assignmentsOf(ty, oc).some(m.isLive); }); }""" % K, before['keys'])
    if t.ck(back, 'нет объекта уволенного, которому место в очереди — данные проверки не созданы'):
        # Строка в очереди — по сводке очереди, а не по видимости: очередь показывает первые 200 и группирует по месту.
        t.ck(t.wait_until("async (k) => { const Mo = await import('./app/pages/inspections/model.js'); const R = await import('./app/kernel/registry.js'); const [ty, oc] = k.split('|'); return Mo.queueBase([R.getType(ty).records.getSummary(oc)]).length === 1; }", back[0]),
             'объект уволенного не вернулся в «К назначению»: %s' % back[0])
