# -*- coding: utf-8 -*-
"""Карточка квартиры в чужом типе ОЦ: справочники и подписи в логе.

Карточка квартиры живёт в модуле «жилое здание (квартира)», а открывается во
всех пяти типах ОЦ. Из-за этого дважды случалось одно и то же: вместе с
карточкой в чужой модуль приезжали её импорты, и она вела себя как в родном.

Что ловит сценарий (найдено сверкой 04.09.2026, исправлено там же):

  * справочники читались по ЗАШИТОМУ типу ОЦ (`const TYPE_ID = 'apartment'` в
    data/opts.js), поэтому квартира в гражданском здании показывала перечни
    каталога «Жилое здание (квартира)». Слоты квартиры в каталоге гражданского
    при этом были, правились — и ни на что не влияли;
  * подписи полей квартиры для лога правок лежали только в двух модулях,
    поэтому в остальных лог показывал ключи данных: «apartment.series» вместо
    «Серия», «plans» вместо «Планировки» (реестр косяков §2).
"""
NAME = 'карточка квартиры'


def _add_apartment(t):
    """Завести квартиру в открытом объекте оценки; карточка откроется сама."""
    pg = t.page
    pg.locator('[data-dd-toggle]').first.click()
    t.wait_for('[data-add-oi]')
    item = pg.locator('[data-add-oi="Квартира"]')
    if not item.count():
        return False
    item.first.click()
    t.wait_for('[data-apt-series]')
    return pg.locator('[data-apt-series]').count() > 0


def run(t):
    pg = t.page

    # --- 1. справочники берутся по типу ОЦ, в котором открыта карточка ---
    #
    # Перечни серий в каталогах разные, и это нормально (их правят в разделе
    # «Справочники»). Проверяем не значения, а ИСТОЧНИК: карточка должна
    # показывать перечень своего типа ОЦ, а не того модуля, где лежит её код.
    catalogs = {}
    t.open('#/oc/civil/oc-cv-1', wait='[data-open-oi]')
    t.wait(500)
    catalogs = pg.evaluate("""async () => {
      const d = await import('./app/kernel/dicts.js');
      const out = {};
      for (const ty of ['apartment', 'civil']) {
        out[ty] = d.optionsFor(ty, 'apartment', 'series') || [];
      }
      return out;
    }""")
    t.ck(bool(catalogs.get('civil')) and bool(catalogs.get('apartment')),
         'справочник «Серия» есть не во всех каталогах: %s' % list(catalogs))

    if t.ck(_add_apartment(t), 'квартира не заводится в гражданском ОЦ'):
        vals = pg.eval_on_selector_all(
            '[data-apt-series] option',
            'els => els.map((e) => e.textContent.trim()).filter((v) => v !== "Не выбрано")')
        t.ck(vals == catalogs['civil'],
             'карточка квартиры в гражданском ОЦ показывает не его перечень: %s' % vals[:4])
        t.ck(vals != catalogs['apartment'] or catalogs['civil'] == catalogs['apartment'],
             'карточка квартиры читает справочники модуля, где лежит её код')

        # --- 2. подписи полей квартиры в логе, а не ключи данных ---
        pg.select_option('[data-apt-series]', index=2)
        t.wait(500)
        rooms = pg.locator('[data-apt-rooms]')
        if rooms.count():
            rooms.fill('7')
            rooms.dispatch_event('change')
            t.wait(400)
        plan = pg.locator('[data-add-plan]')
        if plan.count():
            plan.first.click()
            t.wait(600)

        save = pg.locator('.ctx-plate .btn-primary')
        if save.count():
            save.first.click()
            t.wait(1200)

        t.open('#/oc/civil/oc-cv-1?tab=audit', wait='.tbl')
        t.wait(700)
        fields = pg.eval_on_selector_all(
            '.tbl tbody tr td:nth-child(3)',
            'els => els.map((e) => e.textContent.trim())')

        t.ck(bool(fields), 'лог правок пуст — проверять нечего')
        # Ключ данных узнаём по латинице и точке: подписи полей только русские.
        bad = [f for f in fields if any('a' <= c.lower() <= 'z' for c in f)]
        t.ck(not bad, 'в логе ключи данных вместо подписей: %s' % bad[:5])
        t.ck('Серия' in fields, 'правка серии не подписана «Серия»: %s' % fields[:6])
        if plan.count():
            t.ck('Планировки' in fields,
                 'правка планировок не подписана «Планировки»: %s' % fields[:6])

    # --- 3. то же в участке: карточка квартиры и там чужая ---
    t.open('#/oc/land-plot/oc-lp-1', wait='[data-open-oi]')
    t.wait(500)
    if _add_apartment(t):
        vals = pg.eval_on_selector_all(
            '[data-apt-series] option',
            'els => els.map((e) => e.textContent.trim()).filter((v) => v !== "Не выбрано")')
        own = pg.evaluate("""async () => {
          const d = await import('./app/kernel/dicts.js');
          return d.optionsFor('land-plot', 'apartment', 'series') || [];
        }""")
        t.ck(vals == own,
             'в участке карточка квартиры показывает не его перечень: %s' % vals[:4])
