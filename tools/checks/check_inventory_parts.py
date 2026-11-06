# -*- coding: utf-8 -*-
"""Опись: вся у каждого с журналом и расхождениями или деление на части.

Решение пользователя 06.11.2026 на вопрос «Одна опись у нескольких осмотрщиков»: «Нужны оба
варианта» — вся опись у каждого с журналом отметок (кто, когда), разные отметки — расхождение
для ЦОД, у регионала «опись уже у такого-то»; и деление по позициям / приоритетам / отделам
учреждения — чужие позиции только для чтения.

Что ловит сценарий:
  * в форме назначения нет выбора части описи, выбранная часть не доходит до назначения;
  * регионал не видит, у кого опись уже назначена;
  * разные отметки двух осмотрщиков не дают расхождения, нет журнала отметок;
  * в подробностях назначения не видно части и числа расхождений; в отчёте нет столбцов.
"""
NAME = 'опись: части и расхождения'

TOUCHES = ('app/kernel/inventories.js', 'app/kernel/inspections.js', 'app/pages/inspections/assignPane.js',
           'app/pages/inspections/inspections.js', 'app/pages/inspections/detail.js', 'app/pages/osmotr/bridge.js')

K = "await import('./app/kernel/inspections.js')"


def run(t):
    pg = t.page
    t.open('#/inspections?s=assign&t=queue', wait='[data-ip-row]')
    key = pg.evaluate("""async () => { const I = await import('./app/kernel/inventories.js'); const R = await import('./app/kernel/registry.js');
      const T = await import('./app/pages/inspector/tasks.js');
      for (const tr of document.querySelectorAll('tr[data-ip-row][data-cov="none"]')) { const [ty, oc] = tr.dataset.ipRow.split('|');
        const rec = R.getType(ty).records.loadRecord(oc); if (rec && I.inventoriesForRecord(rec).length && T.ownOis(rec).length > 1) return tr.dataset.ipRow; } return null; }""")
    if not t.ck(key, 'в очереди нет объекта с описью учреждения'):
        return
    ty, oc = key.split('|')
    inv = pg.evaluate("""async ([ty, oc]) => { const I = await import('./app/kernel/inventories.js'); const R = await import('./app/kernel/registry.js');
      return I.inventoriesForRecord(R.getType(ty).records.loadRecord(oc))[0].id; }""", [ty, oc])
    # Опись уже у другого осмотрщика — приоритет 2.
    # Бакыт — на один ОИ, чтобы объект остался в очереди со свободными ОИ.
    pg.evaluate("""async ([ty, oc, inv]) => { const R = await import('./app/kernel/registry.js'); const T = await import('./app/pages/inspector/tasks.js');
      const ois = T.ownOis(R.getType(ty).records.loadRecord(oc));
      return (%s).assign({ typeId: ty, ocId: oc, person: 'Бакыт', oiIds: ois.length > 1 ? [ois[0].id] : [], inventories: [inv], invParts: { [inv]: { by: 'priority', values: ['2'] } } }); }""" % K, [ty, oc, inv])
    t.open('#/inspections?s=assign&t=queue', wait='[data-ip-row]')
    pg.locator('tr[data-ip-row="%s"] td:nth-child(3)' % key).click()
    t.wait_for('tr.cur[data-ip-row="%s"]' % key)
    t.wait_for('.ip-pane [data-ip-f-inv="%s"]' % inv)
    pg.evaluate("() => document.querySelectorAll('.ip-pane details.ip-fold').forEach((d) => { d.open = true; })")
    box = '[data-ip-invpart-box="%s"]' % inv
    if not pg.locator('.ip-pane [data-ip-f-inv="%s"]' % inv).is_checked():
        pg.locator('.ip-pane [data-ip-f-inv="%s"]' % inv).check()
    t.ck(pg.locator(box).is_visible(), 'у отмеченной описи нет выбора части')
    t.ck('Бакыт' in pg.inner_text(box) and 'приоритет 2' in pg.inner_text(box), 'не видно, что опись уже у Бакыт (приоритет 2): %r' % pg.inner_text(box))
    pg.select_option('[data-ip-f-invpart="%s"]' % inv, 'priority|1')
    person = pg.eval_on_selector('[data-ip-f-person]', "s => [...s.options].map((o) => o.value).find((v) => v && v !== 'Бакыт')")
    pg.select_option('[data-ip-f-person]', person)
    pg.click('[data-ip-f-ok]')
    got = pg.evaluate("""async ([ty, oc, p, inv]) => { const K = %s; const a = K.assignmentsOf(ty, oc).find((x) => x.person === p);
      return a ? (a.invParts || {})[inv] || null : 'нет назначения'; }""" % K, [ty, oc, person, inv])
    t.ck(got == {'by': 'priority', 'values': ['1']}, 'часть описи не дошла до назначения: %s' % got)

    # Вся опись у каждого: разные отметки двух осмотрщиков — расхождение, журнал.
    st = pg.evaluate("""async ([inv, p]) => { const I = await import('./app/kernel/inventories.js'); const it = I.inventoryById(inv).items[0];
      I.markItem(inv, it.id, { state: 'seen', cond: 'Рабочее' }, { by: 'Бакыт' });
      const m = I.markItem(inv, it.id, { state: 'missing' }, { by: p });
      const pr = I.progressOf(inv);
      const rep = I.inventoryReportSheets(inv)[1] || I.inventoryReportSheets(inv)[0];
      return { conflict: !!m.conflict, log: (m.log || []).length, conflicts: pr.conflicts, head: rep.head }; }""", [inv, person])
    t.ck(st['conflict'] and st['log'] >= 2 and st['conflicts'] >= 1, 'разные отметки не дали расхождения или нет журнала: %s' % st)
    t.ck('Разные отметки' in st['head'] and 'Отдел' in st['head'], 'в отчёте по описи нет столбцов «Отдел» и «Разные отметки»: %s' % st['head'])
    # Подробности назначения: часть и расхождения.
    html = pg.evaluate("""async ([ty, oc, p]) => { const K = %s; const D = await import('./app/pages/inspections/detail.js');
      const a = K.assignmentsOf(ty, oc).find((x) => x.person === p); return D.detailHTML(new Map(), [], K.allAssignments(), [{ kind: 'assign', id: a.id }]); }""" % K, [ty, oc, person])
    t.ck('приоритет 1' in html and 'разные отметки' in html, 'в подробностях назначения нет части описи или расхождений')
