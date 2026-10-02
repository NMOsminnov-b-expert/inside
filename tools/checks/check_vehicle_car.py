# -*- coding: utf-8 -*-
"""Легковой автомобиль: привод, раздатка, подруливающие оси (02.10.2026).

Что ловит сценарий (указания пользователя 02.10.2026: «Колесная формула
теперь будет приводом. Моточасы у легковых убираем. КОМ переименовываем в
раздатку… Управляющие оси в легковых стоит заменить на наличие подруливающих
осей»):

  * у легкового нет колёсной формулы, моточасов, КОМ и числа управляемых осей,
    вместо них — привод, раздаточная коробка и подруливающие оси;
  * у грузовика общие поля прежние — колёсная формула и КОМ на месте;
  * прежние записи легкового: 4×4 становится полным приводом, больше одной
    управляемой оси — подруливанием, а прежние значения не теряются —
    уходят в «Дополнительные параметры».
"""

NAME = 'легковой: привод и раздатка'

TOUCHES = (
    'app/modules/vehicle/tsModel.js', 'app/modules/vehicle/view.js', 'app/modules/vehicle/tsFields.view.js',
    'app/modules/vehicle/data/tsCatalog.js', 'tools/data/build_ts_catalog.py', 'tools/docs/build_kategorii_ts.py',
)


def run(t):
    pg = t.page
    t.open('', wait='.reg-tr')
    pg.click('.reg-create [data-dd-toggle]')
    pg.click('.reg-create [data-create="vehicle"]')
    t.wait_until("() => location.hash.includes('/create')")
    pg.click('[data-ts-kind="base"]')
    t.wait_for('[data-ts-cat]')

    has = lambda key: pg.locator('[data-tsf$="|%s"]' % key).count() > 0

    pg.select_option('[data-ts-cat]', 'Легковое')
    t.wait_for('[data-ts-base]:not([disabled])')
    pg.select_option('[data-ts-base]', 'Легковой автомобиль и внедорожник')
    t.wait_for('[data-tsf="main|make"]')
    for key in ('driveType', 'transferCase', 'rearSteer'):
        t.ck(has(key), 'у легкового нет поля %s' % key)
    for key in ('wheelFormula', 'engineHours', 'pto', 'steerAxles'):
        t.ck(not has(key), 'у легкового осталось поле %s' % key)
    opts = pg.eval_on_selector_all('[data-tsf$="|transferCase"] option', 'els => els.map((e) => e.textContent.trim())')
    t.ck('Есть с понижающей передачей' in opts, 'у раздаточной коробки нет варианта с понижающей: %s' % opts)

    pg.select_option('[data-ts-cat]', 'Грузовое')
    t.wait_for('[data-ts-base]:not([disabled])')
    pg.select_option('[data-ts-base]', 'Тяжёлый грузовик (свыше 12 т)')
    t.wait_for('[data-tsf="main|make"]')
    for key in ('wheelFormula', 'pto', 'steerAxles'):
        t.ck(has(key), 'у грузовика пропало поле %s' % key)
    t.ck(not has('transferCase'), 'у грузовика появилась раздатка')

    got = pg.evaluate("""async () => {
      const m = await import('./app/modules/vehicle/tsModel.js');
      const h = { vehicle: { kind: 'base', category: 'Легковое', base: 'Легковой автомобиль и внедорожник',
        f: { wheelFormula: '4×4', steerAxles: '2', engineHours: '1200', 'engineHours@unit': 'ч', pto: 'Нет' }, extra: [], modules: [] } };
      const v = m.tsOf(h);
      return { f: v.f, extra: v.extra.map((x) => x.label + '=' + x.value) };
    }""")
    t.ck(got['f'].get('driveType') == 'Полный', '4×4 не стал полным приводом: %s' % got)
    t.ck(got['f'].get('rearSteer') == 'Да', 'две управляемые оси не стали подруливанием: %s' % got)
    t.ck(not any(k in got['f'] for k in ('wheelFormula', 'engineHours', 'pto', 'steerAxles')), 'прежние поля остались: %s' % got)
    t.ck('Колёсная формула=4×4' in got['extra'] and 'Моточасы=1200 ч' in got['extra'],
         'прежние значения потерялись: %s' % got['extra'])
