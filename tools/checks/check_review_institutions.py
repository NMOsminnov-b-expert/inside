# -*- coding: utf-8 -*-
"""Учреждения: счётчики и список объектов на большом реестре.

Код-ревью 09.10.2026 (docs/kod-revyu.xlsx, очередь 1): объекты узла брались
из реестра с лимитом 200, и фильтр по подведу применялся уже после лимита;
счётчики дерева — полной выборкой на каждый узел при каждой перерисовке.

Что ловит сценарий (реестр нежилых зданий увеличен до 3000 записей):
  * число у узла дерева (ocCount) не совпадает с прямым подсчётом по реестру;
  * у узла больше чем с 200 объектами список не говорит, сколько их всего
    (ocRowsOf total);
  * экран «Учреждения» рисуется дольше 3 с.
"""
import time

NAME = 'учреждения: счётчики'

TOUCHES = ('app/kernel/institutions.js', 'app/pages/institutions/institutions.js')


def run(t):
    pg = t.page
    t.open('', wait='.reg-tr')
    res = pg.evaluate("""async () => {
      (await import('./app/modules/civil/records.js')).setBulkCount(3000);
      const I = await import('./app/kernel/institutions.js');
      const Q = await import('./app/pages/ocMenu/query.js');
      const S = await import('./app/pages/ocMenu/state.js');
      const { rows } = Q.queryAll({ filter: S.emptyFilter(), offset: 0, limit: 1e9 });
      const nodes = I.allNodes().filter((n) => n.parentId);
      const bad = []; let big = null;
      nodes.forEach((n) => {
        const parent = I.getNode(n.parentId);
        const top = I.pathOf(n.id)[1];
        const want = parent && !parent.parentId
          ? rows.filter((r) => r.institution === n.name && (!r.podved || r.podved === n.name)).length
          : rows.filter((r) => r.institution === (top && top.name) && (r.podved || '') === n.name).length;
        if (I.ocCount(n) !== want) bad.push([n.name, I.ocCount(n), want]);
        if (want > 200 && !big) big = { name: n.name, want, list: I.ocRowsOf(n) };
      });
      return { bad: bad.slice(0, 5), nodes: nodes.length,
        big: big && { name: big.name, want: big.want, len: big.list.length, total: big.list.total } };
    }""")
    t.ck(not res['bad'], 'счётчики узлов не совпадают с реестром: %s' % res['bad'])
    big = res['big']
    if t.ck(bool(big), 'нет узла с объектами больше 200 — проверить ограничение списка не на чем'):
        t.ck(big['len'] == 200 and big['total'] == big['want'],
             'список узла «%s»: показано %s, всего %s, а в реестре %s' % (big['name'], big['len'], big['total'], big['want']))
    start = time.time()
    t.open('#/institutions', wait='.itree')
    took = time.time() - start
    t.ck(took < 3, 'экран «Учреждения» на большом реестре рисуется %.1f с' % took)
