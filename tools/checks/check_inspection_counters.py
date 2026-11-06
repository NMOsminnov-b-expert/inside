# -*- coding: utf-8 -*-
"""Счётчики ТС при сверке осмотра: рост — норма, уменьшение — расхождение; оценка после осмотра.

Решения пользователя 06.11.2026: «Рост — норма, уменьшение — расхождение» (пробег и моточасы
к данным карточки) и по оценке после осмотра — очередь «осмотрено — к оценке», «Вернуть на
доосмотр» с причиной (объект снова «Направлен на осмотр»).

Что ловит сценарий:
  * рост пробега помечен «расходится»; уменьшение не помечено;
  * срез «Мне оценить» не видит объект с принятым осмотром в «Готов к оценке»;
  * возврат на доосмотр с этапа оценки не возвращает «Направлен на осмотр».
"""
NAME = 'счётчики ТС и оценка после осмотра'

TOUCHES = ('app/pages/inspector/results.js', 'app/pages/ocMenu/slices.js', 'app/kernel/inspections.js')

K = "await import('./app/kernel/inspections.js')"
SET = """async ([m, h]) => { const IR = await import('./app/kernel/inspectionResults.js'); const F = await import('./app/kernel/fieldSchema.js');
  const v = IR.valuesOf('vehicle', 'oc-vehicle-d2', 'ts'); F.setValue(v, 'f.mileage', m); F.setValue(v, 'f.engineHours', h); IR.saveResults(); }"""
ROW = """(l) => { const tr = [...document.querySelectorAll('.ir-cmp tbody tr')].find((r) => r.innerText.includes(l)); return tr ? [tr.className, tr.innerText] : null; }"""


def run(t):
    pg = t.page
    t.open('#/oc/vehicle/oc-vehicle-d2', wait='[data-oc-head]')
    pg.evaluate("async () => { const K = %s; if (!K.assignmentsOf('vehicle', 'oc-vehicle-d2').length) K.assign({ typeId: 'vehicle', ocId: 'oc-vehicle-d2', person: 'Айдай' }); }" % K)
    # Карточка: пробег 214000, моточасы 6100. Пробег вырос, моточасы уменьшились.
    pg.evaluate(SET, ['215500', '6000'])
    t.open('#/oc/vehicle/oc-vehicle-d2?tab=inspection', wait='.ir-cmp')
    up = pg.evaluate(ROW, 'Пробег')
    down = pg.evaluate(ROW, 'Моточас')
    t.ck(up and 'diff' not in up[0] and '+1 500 с данных карточки' in up[1].replace(' ', ' '), 'рост пробега помечен расхождением или без «+N»: %s' % up)
    t.ck(down and 'diff' in down[0] and 'меньше' in down[1], 'уменьшение моточасов не помечено: %s' % down)

    # Оценка: объект «Готов к оценке» у оценщика — в «Мне оценить»; возврат на доосмотр — «Направлен на осмотр».
    st = pg.evaluate("""async () => { const R = await import('./app/kernel/registry.js'); const K = %s; const Q = await import('./app/pages/ocMenu/query.js');
      const S = await import('./app/pages/ocMenu/slices.js'); const t = R.getType('civil');
      const s = t.records.queryRecords({ filter: { status: ['Удостоверен по документам'] }, offset: 0, limit: 300 }).rows.find((x) => !K.assignmentsOf('civil', x.id, { live: false }).length);
      const rec = t.records.loadRecord(s.id); rec.resp = { ...rec.resp, appr: 'Оценщик Проверка' };
      K.assign({ typeId: 'civil', ocId: s.id, person: 'Айдай' }); K.finishWork('Айдай', 'civil', s.id, true);
      t.records.setStatus(s.id, 'Готов к оценке');
      const f = S.filterForSlice(S.sliceDefs('estate').find((d) => d.key === 'my-appr'), 'Оценщик Проверка');
      const inSlice = t.records.queryRecords({ filter: f, offset: 0, limit: 1000 }).rows.some((x) => x.id === s.id);
      const oi = (await import('./app/pages/inspector/tasks.js')).ownOis(rec)[0];
      K.returnOis('civil', s.id, [oi.id], 'Нет снимков кровли');
      return { inSlice, status: t.records.loadRecord(s.id).status }; }""" % K)
    t.ck(st['inSlice'], 'объект «Готов к оценке» с принятым осмотром не в «Мне оценить»')
    t.ck(st['status'] == 'Направлен на осмотр', 'возврат на доосмотр с этапа оценки не вернул «Направлен на осмотр»: %s' % st)
