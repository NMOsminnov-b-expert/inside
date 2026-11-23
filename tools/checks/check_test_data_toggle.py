# -*- coding: utf-8 -*-
"""Тумблер «Тестовые данные» в меню пользователя: сид и объём — видны или скрыты.

Пользователь 23.11.2026: «верни пожалуйста тумблер генерации тестовых данных и их скрытия. Я про сид»; ответ на
вопрос — «Тумблер «Тестовые данные»» (kernel/testData.js).

Что ловит сценарий:
  * тумблера нет в меню пользователя на странице, кроме реестра;
  * выключенный тумблер не скрывает засев или сгенерированный объём; запись, заведённая вручную, тоже пропадает;
  * при выключенном видны демо-назначения у регионала и счётчик «Сканы с осмотров»; выбор демо-объёма остаётся;
  * выключение стирает засев: после включения демо-записи не вернулись или правка в демо-записи пропала.
"""
NAME = 'тумблер «Тестовые данные»'

TOUCHES = ('app/kernel/testData.js', 'app/shell/shell.js', 'app/modules/*/records.js', 'app/modules/*/data/store.js',
           'app/kernel/inspections.js', 'app/kernel/inspectionResults.js', 'app/pages/ocMenu/ocMenu.js')

IDS = "async () => { const R = await import('./app/kernel/registry.js'); return R.sortedTypes().flatMap((t) => t.records.queryRecords({ filter: {}, offset: 0, limit: 100000 }).rows.map((r) => r.id)).filter((id) => !/-b[0-9]+$/.test(id)).sort(); }"
COUNT = "async () => { const Q = await import('./app/pages/ocMenu/query.js'); return ['estate', 'vehicle', 'mech'].map((k) => Q.totalObjects(k)); }"
DEMO_A = "async () => (await import('./app/kernel/inspections.js')).allAssignments().filter((a) => a.demo).length"


def toggle(t, want):
    pg = t.page
    pg.click('[data-user-toggle]')
    t.wait_for('[data-um-test]')
    if pg.is_checked('[data-um-test]') != want:
        with pg.expect_navigation():
            pg.click('[data-um-test]')
    else:
        pg.keyboard.press('Escape')


def run(t):
    pg = t.page
    pg.set_viewport_size({'width': 1440, 'height': 900})
    t.open('#/', wait='.reg-tr')
    t.set_bulk(0)
    before = pg.evaluate(COUNT)
    ids0 = pg.evaluate(IDS)
    t.ck(before[0] > 0 and pg.evaluate(DEMO_A) > 0, 'нет демо-записей или демо-назначений до выключения: %s' % before)
    # Правка в демо-записи и своя запись — до выключения.
    mine = pg.evaluate("""async () => { const T = (await import('./app/kernel/registry.js')).getType('civil');
      T.records.loadRecord('oc-cv-1').purposeTP = 'ТУМБЛЕР-ПРАВКА'; const r = T.records.createRecord(); r.title = 'Своя запись тумблера';
      (await import('./app/kernel/persist.js')).saveNow(); return r.id; }""")

    toggle(t, False)
    t.wait_for('body')
    pg.wait_for_function("() => !!document.querySelector('.reg-h1')")
    after = pg.evaluate(COUNT)
    t.ck(after == [1, 0, 0], 'при выключенных тестовых данных видно не только своё: %s' % after)
    t.ck(t.wait_until("(id) => !!document.querySelector('[data-row-id=\"' + id + '\"], [data-select=\"' + id + '\"]')", mine), 'своя запись пропала при выключенных тестовых данных')
    t.ck(pg.evaluate(DEMO_A) == 0, 'демо-назначения видны при выключенных тестовых данных')
    t.ck(pg.locator('[data-nav-count="scans"]:not([hidden])').count() == 0, 'счётчик «Сканы с осмотров» виден при выключенных тестовых данных')
    pg.click('[data-user-toggle]')
    t.wait_for('[data-um-test]')
    t.ck(not pg.is_checked('[data-um-test]') and pg.locator('[data-um-bulk]').count() == 0, 'тумблер не выключен или выбор демо-объёма остался')
    pg.keyboard.press('Escape')

    toggle(t, True)
    pg.wait_for_function("() => !!document.querySelector('.reg-h1')")
    t.set_bulk(0)
    ids1 = pg.evaluate(IDS)
    t.ck(sorted(ids1) == sorted(ids0 + [mine]) and pg.evaluate(DEMO_A) > 0, 'после включения засев не вернулся: пропали %s, лишние %s' % (sorted(set(ids0) - set(ids1)), sorted(set(ids1) - set(ids0) - {mine})))
    p = pg.evaluate("async () => (await import('./app/kernel/registry.js')).getType('civil').records.loadRecord('oc-cv-1').purposeTP")
    t.ck(p == 'ТУМБЛЕР-ПРАВКА', 'правка в демо-записи пропала после выключения и включения: %r' % p)
    # Тумблер — и не в реестре: на экране регионала (последним: экран регионала собирает часть сгенерированных записей,
    # и счёт выше сбился бы).
    t.open('#/inspections', wait='[data-ip-section]')
    pg.click('[data-user-toggle]')
    t.ck(t.wait_for('[data-um-test]', timeout=4000) and pg.is_checked('[data-um-test]'), 'в меню пользователя вне реестра нет включённого тумблера «Тестовые данные»')
    pg.keyboard.press('Escape')
