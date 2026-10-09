# -*- coding: utf-8 -*-
"""ОЦ «Механизмы и оборудование»: старые записи переводятся при загрузке.

Код-ревью 09.10.2026 (docs/kod-revyu.xlsx): перевод старых записей
(migrateMechUnits) обходил только объекты имущества в чужих ОЦ (rec.oi), а
перечень самостоятельного ОЦ «Механизмы» лежит в rec.mech — переименования
классификатора от 02.10.2026 и перенос «производителя» в страну к нему не
применялись, старый тип не находился в списке.

Что ловит сценарий: запись ОЦ «Механизмы» со старым подклассом, старым типом
и полем maker после сохранения и перезагрузки остаётся в старом виде.
"""
NAME = 'механизмы: перевод старых записей'

TOUCHES = ('app/modules/mechanisms/records.js', 'app/modules/mechanisms/form/model.js')


def run(t):
    pg = t.page
    t.open('', wait='.reg-tr')
    rid = pg.evaluate("""async () => {
      const r = await import('./app/modules/mechanisms/records.js');
      const rec = r.createRecord();
      rec.mech = { id: rec.id + '-mech', card: 'mech', mechanisms: [{ id: 'u-old', name: 'Насос',
        sub: 'Насосное, компрессорное, вентиляционное оборудование производственного назначения',
        type: 'Насосы', maker: 'китай', params: {}, extra: [] }] };
      (await import('./app/kernel/persist.js')).saveNow();
      return rec.id;
    }""")
    pg.reload()
    t.wait_for('.reg-tr')
    u = pg.evaluate("""async (id) => {
      const r = await import('./app/modules/mechanisms/records.js');
      const rec = r.loadRecord(id);
      return rec && rec.mech && rec.mech.mechanisms[0];
    }""", rid)
    t.ck(bool(u), 'запись ОЦ «Механизмы» не пережила перезагрузку')
    if u:
        t.ck(u.get('sub') == 'Насосное, компрессорное, вентиляционное оборудование', 'подкласс не переведён: %s' % u.get('sub'))
        t.ck(str(u.get('type', '')).startswith('Насосы ('), 'тип не переведён: %s' % u.get('type'))
        t.ck(u.get('country') == 'Китай' and 'maker' not in u, 'производитель не перенесён в страну: %s' % u)
