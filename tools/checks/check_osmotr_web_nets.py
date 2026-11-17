# -*- coding: utf-8 -*-
"""
Веб-страница осмотрщика (17.11.2026): инженерные сети участка — и в литеру, если литера на участке одна (пользователь:
«Если у нас на участке всего 1 литера, то инженерку из земельного участка копируем и в литеру»).

Что ловит сценарий:
  * при одной литере значение сетей участка не доходит до литеры;
  * значение, поменянное в литере вручную, перезаписывается участком;
  * при двух литерах значение участка копируется в литеры;
  * у участка с одной литерой нет подсказки о переносе, у участка с двумя — есть.
"""
from urllib.parse import quote

from harness import use_cadastre_fixture

NAME = 'сети участка в литеру (веб)'

TOUCHES = ('app/pages/osmotr/*',)

# Объекты осмотрщика: участок назначен, литер (здания и вспомогательные) в записи — сколько.
FIND = """async () => { const d = await import('./app/pages/osmotr/data.js'); const T = await import('./app/pages/inspection/tasks.js');
  const s = (await import('./app/kernel/session.js')).session.state;
  return d.myObjects(s.person).filter((o) => o.state !== 'done').map((o) => { const rec = T.loadTask(o.typeId, o.ocId); if (!rec) return null;
    const land = (o.ois || []).find((x) => x.kind === 'land'); const lit = T.ownOis(rec).filter((x) => x.card === 'building' || x.card === 'aux');
    return land ? { id: o.id, typeId: o.typeId, ocId: o.ocId, land: land.id, liters: lit.map((x) => x.id) } : null; }).filter(Boolean); }"""
VAL = """async ([t, c, oi, k]) => (((await import('./app/kernel/inspectionResults.js')).resultsOf(t, c).assets || {})[oi] || {})[k]"""


def oi_url(o, oi):
    return '#/osmotr?v=oi&id=%s&oi=%s&s=nets' % (quote(o['id'], safe=''), quote(oi, safe=''))


def nonagri(pg, o):
    # Тип участка — несельскохозяйственный: у сельхозучастка вместо сетей — «Инженерное оснащение».
    pg.evaluate("""async ([t, c, oi]) => { const R = await import('./app/kernel/inspectionResults.js'); const f = await import('./app/kernel/fieldSchema.js');
      f.setValue(R.valuesOf(t, c, oi), 'landType', 'Несельскохозяйственный'); R.saveResults(); }""", [o['typeId'], o['ocId'], o['land']])


def run(t):
    pg = t.page
    use_cadastre_fixture(pg)
    pg.set_viewport_size({'width': 400, 'height': 860})
    t.open('#/osmotr', wait='.om-app[data-v="today"]')
    objs = pg.evaluate(FIND)
    one = next((o for o in objs if len(o['liters']) == 1), None)
    two = next((o for o in objs if len(o['liters']) >= 2), None)

    if t.ck(one, 'нет объекта с участком и одной литерой — перенос не проверен (объекты: %s)' % [(o['id'], len(o['liters'])) for o in objs]):
        lit = one['liters'][0]
        nonagri(pg, one)
        t.open(oi_url(one, one['land']), wait='details[data-sec="nets"][open]')
        t.ck(t.wait_until("() => /переносятся и в неё/.test(document.querySelector('details[data-sec=nets]')?.textContent || '')"), 'у участка с одной литерой нет подсказки о переносе')
        pg.locator('select[data-f="electricity"]').select_option(index=1)
        v = pg.eval_on_selector('select[data-f="electricity"]', 'e => e.value')
        t.ck(t.wait_until("async (a) => (await (%s)(a)) === a[4]" % VAL, [one['typeId'], one['ocId'], lit, 'electricity', v]), 'значение сетей участка не дошло до литеры')
        # Ручное значение литеры не перезаписывается.
        opts = pg.eval_on_selector_all('select[data-f="centralWater"] option', 'l => l.map((o) => o.value).filter(Boolean)')
        pg.evaluate("""async ([t, c, oi, v]) => { const R = await import('./app/kernel/inspectionResults.js'); const f = await import('./app/kernel/fieldSchema.js');
          f.setValue(R.valuesOf(t, c, oi), 'centralWater', v); R.saveResults(); }""", [one['typeId'], one['ocId'], lit, opts[-1]])
        pg.locator('select[data-f="centralWater"]').select_option(opts[0])
        t.ck(pg.evaluate(VAL, [one['typeId'], one['ocId'], lit, 'centralWater']) == opts[-1], 'ручное значение литеры перезаписано участком')

    if t.ck(two, 'нет объекта с участком и двумя литерами — отсутствие переноса не проверено'):
        nonagri(pg, two)
        t.open(oi_url(two, two['land']), wait='details[data-sec="nets"][open]')
        t.ck('переносятся' not in pg.locator('details[data-sec="nets"]').inner_text(), 'у участка с двумя литерами есть подсказка о переносе')
        pg.locator('select[data-f="gasification"]').select_option(index=1)
        got = [pg.evaluate(VAL, [two['typeId'], two['ocId'], x, 'gasification']) for x in two['liters']]
        t.ck(not any(got), 'при двух литерах значение участка скопировано: %s' % got)
