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

# От каких файлов зависит: по этому списку `run.py --changed` решает, нужен ли
# сценарий после правки (см. tools/checks/select_changed.py).
TOUCHES = (
    'app/modules/*/oi/*', 'app/modules/*/card/*', 'app/modules/*/data/*',
    'app/kernel/ocType.js', 'app/kernel/typeChange.js', 'app/kernel/dialog.js',
    'app/pages/dicts/*',
)

ROUTES = {
    'Жилое здание (дом)': '#/oc/residential-house/oc-rh-1',
    'Жилое здание (квартира)': '#/oc/apartment/oc-ap-1',
    'Гражданское здание': '#/oc/civil/oc-cv-1',
    'Производственное строение': '#/oc/production/oc-pr-1',
    'Земельный участок': '#/oc/land-plot/oc-lp-1',
}

# Части прогона. Сценарий обходит все пять типов ОЦ и целым файлом был самой
# долгой проверкой прогона (51 с из 339 с, замер 07.09.2026) — один файл держал
# хвост всего прогона. Части независимы: каждая открывает свой тип ОЦ, а
# «справочники» проверяют общий каталог и предупреждение о скрытых полях.
PARTS = tuple(ROUTES) + ('справочники',)

REALTY = [
    'Земельный участок', 'Квартира', 'Жилой дом',
    'Гражданское здание', 'Производственное строение', 'Прочее строение',
]


def _menu(t):
    """Раскрыть «+ Добавить ОИ» и прочитать список видов."""
    pg = t.page
    pg.locator('[data-dd-toggle]').first.click()
    t.wait(250)
    return pg.eval_on_selector_all('[data-add-oi]', 'els => els.map((e) => e.textContent.trim())')


def run(t, part=None):
    pg = t.page

    for label, route in ({part: ROUTES[part]} if part in ROUTES else
                         {} if part else ROUTES).items():
        t.open(route, wait='[data-add-oi]')
        t.wait(300)
        items = _menu(t)

        missing = [x for x in REALTY if x not in items]
        t.ck(not missing, '%s: в меню нет видов %s' % (label, missing))

        # Квартира открывается настоящей карточкой квартиры, а не литерой.
        # С 11.09.2026 создание не переходит в карточку (решение пользователя:
        # объекты заводят пачкой), поэтому после создания открываем строку сами.
        pg.locator('[data-add-oi="Квартира"]').first.click()
        # Ждём именно строку квартиры: последняя строка перечня — не обязательно
        # она (там же движимое и строения), а сортировка своя.
        t.wait_for('tr[data-open-oi]:has-text("Квартира")')
        pg.locator('tr[data-open-oi]:has-text("Квартира")').last.click()
        # Ждём карточку ПО ФАКТУ: в чужом типе ОЦ она приезжает лениво
        # (import) и грузится впервые. Отсчёт времени тут не годится — пока
        # сценарий обходил все пять модулей одной страницей, модуль карточки
        # оставался в кэше браузера от предыдущего типа ОЦ и успевал за любое
        # ожидание. С разбивкой на части (PARTS) страница у каждой части своя,
        # и «900 мс» перестало хватать: проверка падала на гражданском и
        # участке, хотя карточка исправна (07.09.2026).
        t.wait_for('.oi-stack')
        t.wait_until("""() => document.body.innerText
            .includes('Общие параметры квартиры')""")
        body = t.text()
        t.ck('Общие параметры квартиры' in body,
             '%s: карточка квартиры не открылась' % label)
        t.ck('Площади квартиры' in body,
             '%s: в карточке квартиры нет блока площадей' % label)

        # Поэтажная развёртка строится сразу: без неё карточка пустая.
        t.wait_for('[data-floor-name]')
        rows = pg.locator('[data-floor-name]').count()
        t.ck(rows > 0, '%s: в квартире не построена поэтажная развёртка' % label)

    if part in ROUTES:
        return                      # часть про свой тип ОЦ на этом закончена

    # --- справочники: в каталоге каждого типа ОЦ все четыре карточки ---
    t.open('#/dicts', wait='.dc')
    t.wait(300)

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
        t.wait(300)
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
    t.wait(500)
    pg.locator('tr[data-open-oi]').first.click()
    pg.wait_for_selector('[data-catclass]', timeout=15000)
    t.wait(700)

    cc = pg.locator('[data-catclass]')
    if not t.ck(cc.count() == 1, 'в карточке литеры нет поля назначения по ТП'):
        return

    # Производственное назначение: часть полей уходит, значит нужен диалог.
    cc.fill('Производственно-складское')
    cc.dispatch_event('change')
    t.wait(800)

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
        t.wait(600)
        t.ck(pg.locator('#q-prod').count() == 0,
             'после отказа состав карточки всё равно изменился')

    # Два диалога поверх друг друга — тупик: кнопки нижнего перехватывает фон
    # верхнего. Ядро оставляет один (kernel/dialog.js).
    cc = pg.locator('[data-catclass]')
    cc.fill('Производственно-складское')
    cc.dispatch_event('change')
    cc.dispatch_event('change')
    t.wait(800)
    t.ck(pg.locator('.modal-back').count() <= 1,
         'на экране больше одного диалога: %d' % pg.locator('.modal-back').count())
    if pg.locator('.modal-back').count():
        pg.locator('[data-modal-cancel]').last.click(force=True)
        t.wait(400)
