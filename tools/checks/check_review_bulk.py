# -*- coding: utf-8 -*-
"""Синтетические записи реестра: исправления по код-ревью 09.10.2026.

Реестр на 20 000 записей держит синтетические записи, которые собираются при
открытии (modules/*/data/bulk.js materialize). docs/kod-revyu.xlsx, очередь 1.
Что ловит сценарий:
  * запись собирается по любому id с «-b<число>» на конце (#/oc/civil/foo-b5)
    и уходит в общий файл как своя;
  * синтетическая запись, которую только открыли, — своя правка в снимке
    (общий git-файл засоряется записями без изменений);
  * удалённая (убранная) синтетическая запись остаётся в реестре — и в этой
    сессии, и после перезагрузки.
"""
NAME = 'синтетические записи: ревью'

TOUCHES = ('app/kernel/persist.js', 'app/modules/civil/data/bulk.js', 'app/modules/civil/records.js',
           'app/modules/apartment/data/bulk.js', 'app/modules/apartment/records.js')

REG = """async (id) => {
  const r = await import('./app/modules/civil/records.js');
  r.setBulkCount(20);
  const all = r.queryRecords({ limit: 100000 }).rows || r.queryRecords({ limit: 100000 });
  return (Array.isArray(all) ? all : all.rows).some((s) => s.id === id);
}"""


def run(t):
    pg = t.page

    # --- чужой id не собирает запись ----------------------------------------------
    t.open('', wait='.reg-tr')
    got = pg.evaluate("""async () => { const r = await import('./app/modules/civil/records.js');
      r.setBulkCount(20); return !!r.loadRecord('foo-b5'); }""")
    t.ck(not got, 'запись собрана по чужому id foo-b5')

    # --- открытая без правок — не своя правка ------------------------------------------
    t.ck(pg.evaluate(REG, 'oc-cv-b5'), 'синтетической записи oc-cv-b5 нет в реестре')
    pg.evaluate("""async () => { const r = await import('./app/modules/civil/records.js');
      r.loadRecord('oc-cv-b5'); (await import('./app/kernel/persist.js')).saveNow(); }""")
    mine = pg.evaluate("""() => { const s = JSON.parse(localStorage.getItem('inside:data:v1') || '{}');
      return Object.keys((s.mine || {})['records.civil'] || {}); }""")
    t.ck('oc-cv-b5' not in mine, 'открытая без правок синтетическая запись ушла в свои правки')

    # --- удалённая — не возвращается в реестр -----------------------------------------
    pg.evaluate("""async () => { const s = await import('./app/modules/civil/data/store.js');
      s.removeRecord('oc-cv-b5'); }""")
    t.ck(not pg.evaluate(REG, 'oc-cv-b5'), 'удалённая синтетическая запись осталась в реестре')
    pg.evaluate("async () => (await import('./app/kernel/persist.js')).saveNow()")
    pg.reload()
    t.wait_for('.reg-tr')
    t.ck(not pg.evaluate(REG, 'oc-cv-b5'), 'удалённая синтетическая запись вернулась в реестр после F5')
    t.ck(pg.evaluate(REG, 'oc-cv-b6'), 'соседняя синтетическая запись пропала из реестра')
