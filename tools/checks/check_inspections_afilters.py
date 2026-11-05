# -*- coding: utf-8 -*-
"""Отборы «Назначено»: состояние, учреждение, состав, срок.

Решение пользователя 05.11.2026 на вопрос «Какие отборы нужны регионалу в «Назначено»»:
состояние (назначено / в работе / просрочено / возвращено), учреждение, «с ТС / с
оборудованием», срок.

Что ловит сценарий:
  * отбора нет в панели отборов «Назначено»;
  * отбор не сужает строки или оставляет не те.
"""
NAME = 'отборы «Назначено»'

TOUCHES = ('app/pages/inspections/model.js', 'app/pages/inspections/inspections.js')

ROWS = """async (want) => { const m = await import('./app/kernel/inspections.js'); const Mo = await import('./app/pages/inspections/model.js');
  const ids = [...document.querySelectorAll('tr[data-ip-row]')].map((r) => r.dataset.ipRow);
  return ids.map((id) => { const a = m.assignmentById(id); const f = Mo.ASSIGNED_FACETS.find((x) => x.key === want[0]);
    return a ? [].concat(f.val({ a, s: { institution: '' } })) : []; }); }"""


def run(t):
    pg = t.page
    t.open('#/inspections?s=people', wait='.ip-person-main')
    pg.click('[data-ip-team="assigned"]')
    pg.click('[data-ip-aperson="*"]')
    t.wait_for('tr[data-ip-row]')
    if not pg.locator('.ip-facets.open').count():
        pg.locator('[data-ip-ftoggle]:visible').first.click()
    for key in ('state', 'inst', 'kit', 'due'):
        t.ck(t.wait_for('.ip-facets [data-ip-ff="%s"]' % key, timeout=5000), 'в отборах «Назначено» нет «%s»' % key)
    total = pg.locator('tr[data-ip-row]').count()
    # Состояние «В работе» — у всех строк назначение в работе.
    pg.click('.ip-facets [data-ip-ff="state"][data-ip-fv="progress"]')
    t.wait_until("(n) => document.querySelectorAll('tr[data-ip-row]').length < n", total)
    vals = pg.evaluate(ROWS, ['state'])
    t.ck(vals and all('progress' in v for v in vals), 'отбор «В работе» оставил не те строки: %s' % vals[:5])
    pg.click('.ip-facets [data-ip-ff="state"][data-ip-fv="progress"]')
    # Состав «С ТС» — у всех строк среди назначенного есть ТС.
    if pg.locator('.ip-facets [data-ip-ff="kit"][data-ip-fv="vehicle"]:not(.zero)').count():
        pg.click('.ip-facets [data-ip-ff="kit"][data-ip-fv="vehicle"]')
        t.wait_until("(n) => document.querySelectorAll('tr[data-ip-row]').length < n", total)
        vals = pg.evaluate(ROWS, ['kit'])
        t.ck(vals and all('vehicle' in v for v in vals), 'отбор «С ТС» оставил не те строки: %s' % vals[:5])
        pg.click('.ip-facets [data-ip-ff="kit"][data-ip-fv="vehicle"]')
    else:
        t.ck(False, 'в демо нет назначений с ТС — отбор «С ТС» нечем проверить')
    # Учреждение — первое значение отбора: все строки этого учреждения.
    inst = pg.locator('.ip-facets [data-ip-ff="inst"]:not(.zero)').first.get_attribute('data-ip-fv')
    pg.click('.ip-facets [data-ip-ff="inst"][data-ip-fv="%s"]' % inst)
    t.ck(t.wait_until("(i) => [...document.querySelectorAll('tr[data-ip-row]')].length > 0 && [...document.querySelectorAll('tr[data-ip-row] .ip-obj-s')].every((x) => x.innerText.includes(i))", inst),
         'отбор по учреждению оставил строки других учреждений')
