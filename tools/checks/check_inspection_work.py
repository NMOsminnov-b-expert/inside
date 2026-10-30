# -*- coding: utf-8 -*-
"""Ход осмотра по назначению: двое на одном объекте, завершение, переназначение.

Ответы пользователя 30.10.2026 (аудит раздела «Осмотры», ядро цепочки):
«Каждый свою часть», «Предупреждать, разрешать», «Передать новому».

Что ловит сценарий:
  * первый ввод осмотрщика не переводит назначение в «В работе»;
  * «Осмотр завершён» одного осмотрщика блокирует форму или задачу другого
    на том же объекте (отметка снова общая на объект);
  * при незаполненном нет перечня ссылками или завершение запрещено;
  * пометка «неполный осмотр» не доходит до назначения и до регионала;
  * законченное назначение пропадает из задач осмотрщика или снятие отметки
    не возвращает «В работе»;
  * события назначения (назначен, в работе, закончен) не пишутся;
  * после переназначения новый не видит, кто осматривал до него, а очередь —
    что объект частично осмотрен.
"""
from urllib.parse import quote

NAME = 'ход осмотра по назначению'

TOUCHES = (
    'app/pages/inspector/*', 'app/pages/inspections/model.js', 'app/pages/inspections/inspections.js',
    'app/pages/inspections/assignPane.js', 'app/pages/inspections/detail.js',
    'app/kernel/inspections.js', 'app/kernel/inspectionResults.js', 'app/kernel/fieldSchema.js',
    'app/modules/civil/data/seed.js',
)

PHONE = {'width': 390, 'height': 844}
K = 'Карабекова Анара Тариеловна'
D = 'Айдай'
A = 'Абдылдаев Айсултан Марсович'
T = "await import('./app/pages/inspector/tasks.js')"
KI = "await import('./app/kernel/inspections.js')"


def as_(route, who):
    return route + ('&' if '?' in route else '?') + 'as=' + quote(who)


def run(t):
    pg = t.page
    pg.set_viewport_size(PHONE)
    t.open('#/insp', wait='.ins')
    day = pg.evaluate("() => new Date().toISOString().slice(0, 10)")
    # Карабекова — Литера А и механизм (у механизма обязательное «На месте»),
    # Айдай — Литера Б того же объекта.
    ids = pg.evaluate("""async ([k, d, day]) => { const K = %s;
      const a = K.assign({ typeId: 'civil', ocId: 'oc-cv-1', person: k, oiIds: ['oi-cv1-a', 'oi-cv1-m1'], plannedAt: day });
      const b = K.assign({ typeId: 'civil', ocId: 'oc-cv-1', person: d, oiIds: ['oi-cv1-b'], plannedAt: day });
      return [a.id, b.id]; }""" % KI, [K, D, day])
    st = lambda i: pg.evaluate("async (i) => { const a = (%s).assignmentById(i); return { state: a.state, incomplete: !!a.incomplete }; }" % KI, i)

    # --- первый ввод → «В работе», у второго осмотрщика ничего не меняется ------
    t.open(as_('#/insp/civil/oc-cv-1/object/oi-cv1-a', K), wait='.ins-acc')
    f = pg.locator('.ins input:not([type=checkbox]):not([type=radio]):not([type=file]), .ins select').first
    if f.evaluate('e => e.tagName') == 'SELECT':
        f.select_option(index=1)
    else:
        f.fill('3')
        f.dispatch_event('input')
    t.ck(t.wait_until("async () => (%s).assignmentById('%s').state === 'progress'" % (KI, ids[0])), 'первый ввод не перевёл назначение в «В работе»: %s' % st(ids[0]))
    t.ck(st(ids[1])['state'] == 'assigned', 'ввод одного осмотрщика тронул назначение другого: %s' % st(ids[1]))

    # --- завершение при незаполненном: перечень ссылками, «с пометкой» ----------
    t.open(as_('#/insp/civil/oc-cv-1', K), wait='[data-toggle-done]')
    pg.click('[data-toggle-done]')
    t.wait_for('.ins-gaps')
    links = pg.eval_on_selector_all('.ins-gaps-list a', 'els => els.map((e) => [e.getAttribute("href"), e.innerText])')
    t.ck(any('oi-cv1-m1' in h and 'не начат' in x for h, x in links), 'в перечне нет нетронутого механизма ссылкой: %s' % links)
    t.ck(st(ids[0])['state'] == 'progress', 'осмотр завершился без подтверждения при незаполненном')
    pg.click('[data-done-anyway]')
    t.ck(t.wait_until("async () => (%s).assignmentById('%s').state === 'done'" % (KI, ids[0])), '«Завершить с пометкой» не завершило: %s' % st(ids[0]))
    t.ck(st(ids[0])['incomplete'], 'нет пометки «неполный осмотр»')
    t.ck(st(ids[1])['state'] == 'assigned', 'завершение одного осмотрщика тронуло назначение другого')

    # --- у второго осмотрщика форма открыта и задача ждёт -----------------------
    t.ck(not pg.evaluate("async ([d]) => { const T = %s; T.setInspector(d); return T.isFoundLocked('civil', 'oc-cv-1'); }" % T, [D]),
         'чужое «Осмотр завершён» заблокировало форму второго осмотрщика')
    task = pg.evaluate("async ([d]) => { const T = %s; T.setInspector(d); const x = T.myTasks().find((y) => y.ocId === 'oc-cv-1'); return x && { pending: x.pending, done: x.done }; }" % T, [D])
    t.ck(task and task['pending'] and not task['done'], 'у второго осмотрщика задача не ждёт осмотра: %s' % task)

    # --- законченное — в задачах; снятие отметки → «В работе» -------------------
    mine = pg.evaluate("async ([k]) => { const T = %s; T.setInspector(k); const x = T.myTasks().find((y) => y.ocId === 'oc-cv-1'); return x && { pending: x.pending, done: x.done }; }" % T, [K])
    t.ck(mine and mine['done'] and not mine['pending'], 'законченное пропало из задач или ждёт осмотра: %s' % mine)
    t.open(as_('#/insp/civil/oc-cv-1', K), wait='[data-toggle-done]')
    t.ck('Снять отметку' in pg.inner_text('[data-toggle-done]'), 'нет «Снять отметку» у законченного')
    pg.click('[data-toggle-done]')
    t.ck(t.wait_until("async () => (%s).assignmentById('%s').state === 'progress'" % (KI, ids[0])), 'снятие отметки не вернуло «В работе»')
    t.ck(not st(ids[0])['incomplete'], 'пометка «неполный» осталась после снятия отметки')
    kinds = pg.evaluate("async (i) => (%s).eventsOf({ typeId: 'civil', ocId: 'oc-cv-1' }).filter((e) => e.assignId === i).map((e) => e.kind)" % KI, ids[0])
    t.ck(all(k in kinds for k in ('assigned', 'progress', 'done')), 'не все события назначения в журнале: %s' % kinds)

    # --- пометка у регионала ------------------------------------------------------
    pg.evaluate("async (i) => (%s).finishWork('%s', 'civil', 'oc-cv-1', true, { incomplete: true })" % (KI, K), ids[0])
    label = pg.evaluate("async (i) => { const M = await import('./app/pages/inspections/model.js'); return M.stateLabel((%s).assignmentById(i)); }" % KI, ids[0])
    t.ck(label == 'Осмотр закончен · неполный', 'регионал не видит пометку: %s' % label)

    # --- переназначение: «Передать новому» -----------------------------------------
    t.open(as_('#/insp/civil/oc-cv-1/object/oi-cv1-b', D), wait='.ins-acc')
    f = pg.locator('.ins input:not([type=checkbox]):not([type=radio]):not([type=file]), .ins select').first
    if f.evaluate('e => e.tagName') == 'SELECT':
        f.select_option(index=1)
    else:
        f.fill('2')
        f.dispatch_event('input')
    t.wait_until("async () => (%s).assignmentById('%s').state === 'progress'" % (KI, ids[1]))
    new = pg.evaluate("async ([i, a]) => (%s).reassign(i, a).id" % KI, [ids[1], A])
    t.open(as_('#/insp/civil/oc-cv-1', A), wait='[data-toggle-done]')
    body = pg.inner_text('.ins')
    t.ck('Осмотр начат до вас' in body and D in body, 'новый осмотрщик не видит, кто осматривал до него')
    t.ck(st(new)['state'] == 'assigned', 'новое назначение не «Назначено»: %s' % st(new))
    t.ck(not pg.evaluate("async ([a]) => { const T = %s; T.setInspector(a); return T.isFoundLocked('civil', 'oc-cv-1'); }" % T, [A]),
         'новому осмотрщику форма заблокирована')
