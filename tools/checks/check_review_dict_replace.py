# -*- coding: utf-8 -*-
"""Замена значения справочника доходит до всех вхождений.

Код-ревью 09.10.2026 (docs/kod-revyu.xlsx): kernel/dicts.js replaceValue
заменял только первое вхождение в поле-списке (а если замена в нём уже была —
получался дубль) и не обрабатывал поля-объекты, хотя usageOf их считает:
значение уходило из справочника, а в записях оставалось.

Что ловит сценарий: в поле-списке после замены A→B остаётся A или B дважды;
в поле-объекте (значения по ключам — строки и списки) A не заменено.
"""
NAME = 'справочники: замена значения'

TOUCHES = ('app/kernel/dicts.js',)

JS = """async (shape) => {
  const d = await import('./app/kernel/dicts.js');
  const s = await import('./app/modules/civil/data/store.js');
  const dict = d.dictAt('civil', 'building', 'struct.wallsExt');
  const oi = s.getRecord('oc-cv-1').oi.find((o) => o.card === 'building');
  const [a, b] = dict.items.map((i) => i.value);
  oi.struct = oi.struct || {};
  oi.struct.wallsExt = shape === 'list' ? [a, b, a] : { x: [a, b], y: a };
  d.replaceValue(dict, a, b);
  return { a, b, after: oi.struct.wallsExt };
}"""


def run(t):
    pg = t.page
    t.open('#/oc/civil/oc-cv-1', wait='.card')
    r = pg.evaluate(JS, 'list')
    t.ck(r['after'] == [r['b']], 'поле-список после замены: %s' % r['after'])
    r = pg.evaluate(JS, 'object')
    t.ck(r['after'] == {'x': [r['b']], 'y': r['b']}, 'поле-объект после замены: %s' % r['after'])
