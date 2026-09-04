# -*- coding: utf-8 -*-
"""Любой недвижимый ОИ в любом типе ОЦ.

Решение пользователя 02.09.2026: «В любой ОЦ можно добавлять любой недвижимый
ОИ. Это касается и карточек и справочников». Проверяется обе половины:

  * меню «+ Добавить ОИ» в каждом из пяти модулей предлагает все шесть видов
    недвижимости, а движимое — по-прежнему только у имущественного комплекса
    гражданского и производственного;
  * квартира создаётся и открывается в модуле, где раньше её карточки не было
    вовсе (гражданское, производственное, участок);
  * каталог каждого типа ОЦ в справочниках содержит все четыре карточки —
    объект оценки, участок, литеру и квартиру.
"""
NAME = 'виды ОИ'

ROUTES = {
    'Жилое здание (дом)': '#/oc/residential-house/oc-rh-1',
    'Жилое здание (квартира)': '#/oc/apartment/oc-ap-1',
    'Гражданское здание': '#/oc/civil/oc-cv-1',
    'Производственное строение': '#/oc/production/oc-pr-1',
    'Земельный участок': '#/oc/land-plot/oc-lp-1',
}

REALTY = [
    'Земельный участок', 'Квартира', 'Жилой дом',
    'Гражданское здание', 'Производственное строение', 'Прочее строение',
]


def _menu(t):
    """Раскрыть «+ Добавить ОИ» и прочитать список видов."""
    pg = t.page
    pg.locator('[data-dd-toggle]').first.click()
    pg.wait_for_timeout(250)
    return pg.eval_on_selector_all('[data-add-oi]', 'els => els.map((e) => e.textContent.trim())')


def run(t):
    pg = t.page

    for label, route in ROUTES.items():
        t.open(route, wait='[data-add-oi]')
        pg.wait_for_timeout(300)
        items = _menu(t)

        missing = [x for x in REALTY if x not in items]
        t.ck(not missing, '%s: в меню нет видов %s' % (label, missing))

        # Квартира открывается настоящей карточкой квартиры, а не литерой.
        pg.locator('[data-add-oi="Квартира"]').first.click()
        pg.wait_for_timeout(900)
        body = t.text()
        t.ck('Общие параметры квартиры' in body,
             '%s: карточка квартиры не открылась' % label)
        t.ck('Площади квартиры' in body,
             '%s: в карточке квартиры нет блока площадей' % label)

        # Поэтажная развёртка строится сразу: без неё карточка пустая.
        rows = pg.locator('[data-floor-name]').count()
        t.ck(rows > 0, '%s: в квартире не построена поэтажная развёртка' % label)

    # --- справочники: в каталоге каждого типа ОЦ все четыре карточки ---
    t.open('#/dicts', wait='.dc')
    pg.wait_for_timeout(300)

    cards = pg.evaluate("""() => {
      const out = {};
      document.querySelectorAll('[data-step-type]').forEach((b) => {
        out[b.textContent.trim().replace(/\\s*\\d+$/, '')] = b.dataset.stepType;
      });
      return out;
    }""")
    t.ck(len(cards) >= 5, 'в справочниках не все типы ОЦ: %d' % len(cards))

    for i in range(len(cards)):
        pg.locator('[data-step-type]').nth(i).click()
        pg.wait_for_timeout(300)
        name = pg.locator('[data-step-type]').nth(i).inner_text().strip()
        got = pg.eval_on_selector_all(
            '[data-step-card]', 'els => els.map((e) => e.textContent.replace(/\\s+/g, " ").trim())')
        got = ' | '.join(got)
        for need in ('Объект оценки', 'Литера (строение)', 'Квартира', 'Земельный участок'):
            t.ck(need in got, 'каталог «%s»: нет карточки «%s» (есть: %s)'
                 % (name.splitlines()[0], need, got))
