# -*- coding: utf-8 -*-
"""Реестр ТС показывает старые записи уже переведёнными.

Код-ревью 09.10.2026 (docs/kod-revyu.xlsx): реестр читал данные машины мимо
перевода старых записей (tsModel.js tsOf), и у записей до 23.09–07.10.2026 в
колонке «Вид», фасетах и поиске стояли прежние категории («Спецтехника»), пока
карточку не открыли. Теперь записи переводятся при загрузке (records.js).

Что ловит сценарий: старая запись (категория «Спецтехника», марка и модель
двумя полями) после сохранения и перезагрузки показана в реестре по-старому.
"""
NAME = 'ТС: старые записи в реестре'
TOUCHES = ('app/modules/vehicle/records.js', 'app/modules/vehicle/tsModel.js')
def run(t):
    pg = t.page
    t.open('', wait='.reg-tr')
    rid = pg.evaluate("""async () => { const r = await import('./app/modules/vehicle/records.js');
      const rec = r.createRecord(); rec.vehicle = { kind: 'base', category: 'Спецтехника', base: '', f: { make: 'МТЗ', model: '82' }, extra: [], modules: [] };
      (await import('./app/kernel/persist.js')).saveNow(); return rec.id; }""")
    pg.reload(); t.wait_for('.reg-tr')
    s = pg.evaluate("""async (id) => { const r = await import('./app/modules/vehicle/records.js');
      const rows = r.queryRecords({ limit: 1000 }).rows; return rows.find((x) => x.id === id); }""", rid)
    t.ck(bool(s), 'старой записи ТС нет в реестре после перезагрузки')
    if s:
        t.ck('Спецтехника' not in str(s['facts']) and s['title'] == 'МТЗ 82',
             'старая запись ТС в реестре не переведена: %s, %s' % (s['title'], s['facts']))
