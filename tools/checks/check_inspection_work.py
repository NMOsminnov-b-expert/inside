# -*- coding: utf-8 -*-
"""Ход осмотра по назначению: двое на одном объекте, завершение, переназначение.

Ответы пользователя 30.10.2026 (аудит раздела «Осмотры», ядро цепочки):
«Каждый свою часть», «Предупреждать, разрешать», «Передать новому».

Ввод и «Осмотр закончен» идут из приложения «Осмотр» через мост
(веб-страница осмотрщика pages/osmotr/osmotr.js → kernel/inspections.js startWork / finishWork);
прежний экран осмотрщика #/insp, на котором сценарий жал кнопки, убран
16.11.2026. Сценарий вызывает те же функции ядра, что и мост.

Что ловит сценарий:
  * первый ввод осмотрщика не переводит назначение в «В работе» или трогает
    назначение другого осмотрщика на том же объекте;
  * «Осмотр закончен» одного осмотрщика трогает назначение другого;
  * пометка «неполный осмотр» не доходит до назначения и до регионала;
  * снятие отметки не возвращает «В работе» или оставляет пометку;
  * события назначения (назначен, в работе, закончен) не пишутся;
  * переназначение не даёт нового назначения в состоянии «Назначено».
"""
NAME = 'ход осмотра по назначению'

TOUCHES = (
    'app/pages/osmotr/*', 'app/pages/inspections/model.js', 'app/pages/inspections/inspections.js',
    'app/pages/inspections/assignPane.js', 'app/pages/inspections/detail.js',
    'app/kernel/inspections.js', 'app/kernel/inspectionResults.js',
    'app/modules/civil/data/seed.js',
)

K = 'Карабекова Анара Тариеловна'
D = 'Айдай'
A = 'Абдылдаев Айсултан Марсович'
KI = "await import('./app/kernel/inspections.js')"


def run(t):
    pg = t.page
    t.open('#/inspections', wait='[data-ip-section]')
    day = pg.evaluate("() => new Date().toISOString().slice(0, 10)")
    # Карабекова — Литера А и механизм, Айдай — Литера Б того же объекта.
    ids = pg.evaluate("""async ([k, d, day]) => { const K = %s;
      const a = K.assign({ typeId: 'civil', ocId: 'oc-cv-1', person: k, oiIds: ['oi-cv1-a', 'oi-cv1-m1'], plannedAt: day });
      const b = K.assign({ typeId: 'civil', ocId: 'oc-cv-1', person: d, oiIds: ['oi-cv1-b'], plannedAt: day });
      return [a.id, b.id]; }""" % KI, [K, D, day])
    st = lambda i: pg.evaluate("async (i) => { const a = (%s).assignmentById(i); return { state: a.state, incomplete: !!a.incomplete }; }" % KI, i)
    call = lambda js, arg: pg.evaluate("async (x) => { const K = %s; return %s; }" % (KI, js), arg)

    # --- первый ввод → «В работе», у второго осмотрщика ничего не меняется ------
    call("K.startWork(x, 'civil', 'oc-cv-1')", K)
    t.ck(st(ids[0])['state'] == 'progress', 'первый ввод не перевёл назначение в «В работе»: %s' % st(ids[0]))
    t.ck(st(ids[1])['state'] == 'assigned', 'ввод одного осмотрщика тронул назначение другого: %s' % st(ids[1]))

    # --- «Осмотр закончен» с пометкой «неполный» ------------------------------
    n = call("K.finishWork(x, 'civil', 'oc-cv-1', true, { incomplete: true })", K)
    t.ck(n == 1, 'завершение задело не одно назначение осмотрщика: %s' % n)
    t.ck(st(ids[0]) == {'state': 'done', 'incomplete': True}, 'не завершилось с пометкой «неполный»: %s' % st(ids[0]))
    t.ck(st(ids[1])['state'] == 'assigned', 'завершение одного осмотрщика тронуло назначение другого')
    label = pg.evaluate("async (i) => { const M = await import('./app/pages/inspections/model.js'); return M.stateLabel((%s).assignmentById(i)); }" % KI, ids[0])
    t.ck(label == 'Осмотр закончен · неполный', 'регионал не видит пометку: %s' % label)

    # --- снятие отметки → «В работе», без пометки ---------------------------------
    call("K.finishWork(x, 'civil', 'oc-cv-1', false)", K)
    t.ck(st(ids[0]) == {'state': 'progress', 'incomplete': False}, 'снятие отметки не вернуло «В работе» без пометки: %s' % st(ids[0]))
    kinds = pg.evaluate("async (i) => (%s).eventsOf({ typeId: 'civil', ocId: 'oc-cv-1' }).filter((e) => e.assignId === i).map((e) => e.kind)" % KI, ids[0])
    t.ck(all(k in kinds for k in ('assigned', 'progress', 'done')), 'не все события назначения в журнале: %s' % kinds)

    # --- переназначение: «Передать новому» -----------------------------------------
    call("K.startWork(x, 'civil', 'oc-cv-1')", D)
    new = pg.evaluate("async ([i, a]) => (%s).reassign(i, a).id" % KI, [ids[1], A])
    t.ck(st(new)['state'] == 'assigned', 'новое назначение не «Назначено»: %s' % st(new))
