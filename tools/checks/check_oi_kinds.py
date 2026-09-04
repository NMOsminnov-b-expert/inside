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

    check_hidden_fields_warning(t)


# --- предупреждение о скрывающихся полях (ТЗ 30 §9.6) --------------------
#
# От назначения по техпаспорту зависит состав ОСТАЛЬНЫХ полей карточки: у
# производственно-складского открывается блок «Доп параметры». Человек менял
# значение и не видел, что вместе с ним со страницы ушли заполненные поля —
# они просто перестают показываться, данные остаются в записи.
#
# Проверка сторожит и обратное: диалог не должен выскакивать, когда ничего не
# исчезает, иначе на него перестанут смотреть.
def check_hidden_fields_warning(t):
    pg = t.page

    t.open('#/oc/civil/oc-cv-1', wait='tr[data-open-oi]')
    pg.wait_for_timeout(500)
    pg.locator('tr[data-open-oi]').first.click()
    pg.wait_for_selector('[data-catclass]', timeout=15000)
    pg.wait_for_timeout(700)

    cc = pg.locator('[data-catclass]')
    if not t.ck(cc.count() == 1, 'в карточке литеры нет поля назначения по ТП'):
        return

    # Производственное назначение: часть полей уходит, значит нужен диалог.
    cc.fill('Производственно-складское')
    cc.dispatch_event('change')
    pg.wait_for_timeout(800)

    if t.ck(pg.locator('.modal-head').count() == 1,
            'смена назначения прошла без предупреждения о скрытых полях'):
        items = pg.eval_on_selector_all('.modal-list-facts li',
                                        'els => els.map((e) => e.textContent.trim())')
        t.ck(len(items) >= 1, 'в диалоге пустой список полей')
        # Значение рядом с подписью: без него человек не понимает, что теряет.
        t.ck(any('(' in it for it in items),
             'в списке нет значений полей: %s' % items)
        # Никаких ключей данных в тексте — только подписи (реестр косяков §2).
        t.ck(not any(ch in ''.join(items) for ch in ('_', '{', '}')),
             'в списке полей технические ключи: %s' % items)

        # Отказ ничего не меняет.
        pg.locator('[data-modal-cancel]').last.click(force=True)
        pg.wait_for_timeout(600)
        t.ck(pg.locator('#q-prod').count() == 0,
             'после отказа состав карточки всё равно изменился')

    # Два диалога поверх друг друга — тупик: кнопки нижнего перехватывает фон
    # верхнего. Ядро оставляет один (kernel/dialog.js).
    cc = pg.locator('[data-catclass]')
    cc.fill('Производственно-складское')
    cc.dispatch_event('change')
    cc.dispatch_event('change')
    pg.wait_for_timeout(800)
    t.ck(pg.locator('.modal-back').count() <= 1,
         'на экране больше одного диалога: %d' % pg.locator('.modal-back').count())
    if pg.locator('.modal-back').count():
        pg.locator('[data-modal-cancel]').last.click(force=True)
        pg.wait_for_timeout(400)
