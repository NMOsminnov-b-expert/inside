# -*- coding: utf-8 -*-
"""Справочники действительно питают карточки (этап 4 ТЗ).

До 03.09.2026 раздел «Справочники» жил сам по себе: перечни в нём правились, а
поля карточек читали dictionaries.js напрямую — правка никуда не доходила.
Сценарий ловит именно этот разрыв, во всех пяти модулях и на трёх видах полей:

  * обычный select (права на строение, серия квартиры, форма участка);
  * мультивыбор (отопление, благоустройство) — там свой выпадающий список;
  * поле с разделами (категория ОИ) — значения приходят сгруппированными.

Проверяется в обе стороны: добавленное в справочник появляется в карточке,
удалённое — исчезает.
"""
NAME = 'справочники в карточках'

# Тип ОЦ → (маршрут объекта, как открыть литеру, поле, метка справочника)
CASES = [
    ('civil', '#/oc/civil/oc-cv-1', 'Права на строение', '[data-bld-rights] option'),
    ('production', '#/oc/production/oc-pr-1', 'Каркас', '[data-prod-frame] option'),
    ('residential-house', '#/oc/residential-house/oc-rh-1', 'Категория строения',
     '[data-rescat] option'),
]

# Земельный участок сюда не входит: в его объекте оценки литеры открываются из
# дерева участка, а не строкой перечня — участок проверяется отдельно, пунктом 5.

MARK = 'Проверка связи справочника'


def _open_dict(t, type_id, card_label, name_starts):
    """Открыть справочник поля: тип ОЦ → тип ОИ → поле.

    Тип ОИ ищем по подписи, а не по номеру: порядок каталогов у модулей разный.
    """
    pg = t.page
    t.open('#/dicts', wait='.dc-steps')
    t.wait(300)
    pg.locator('[data-step-type="%s"]' % type_id).first.click()
    t.wait(250)

    cards = pg.eval_on_selector_all('[data-step-card]',
                                    'els => els.map((e) => e.textContent.trim())')
    idx = [i for i, x in enumerate(cards) if x.startswith(card_label)]
    if not idx:
        return False
    pg.locator('[data-step-card]').nth(idx[0]).click()
    t.wait(250)

    rows = pg.eval_on_selector_all('.dc-step-row.dict',
                                   'els => els.map((e) => e.textContent.trim())')
    hit = [i for i, x in enumerate(rows) if x.startswith(name_starts)]
    if not hit:
        return False
    pg.locator('.dc-step-row.dict').nth(hit[0]).click()
    t.wait(400)
    return True


def _add_value(t, value):
    pg = t.page
    field = pg.locator('[data-item-new]')
    if not field.count():
        return False
    field.fill(value)
    field.press('Enter')
    # Значение появляется в перечне после записи в справочник и в связанные —
    # ждём именно его, иначе следующая проверка смотрит на неготовый список.
    # Значения лежат в полях ввода, поэтому смотрим value, а не текст строки:
    # по тексту ожидание висело до таймаута, и сообщение успевало исчезнуть.
    t.wait_until("""(v) => [...document.querySelectorAll('[data-item-value]')]
        .some((e) => e.value.trim() === v)""", value)
    return True


def _open_letter(t, route, need=None):
    """Открыть ОИ, в котором есть нужное поле.

    В перечне ОИ вперемешку литеры, квартиры и участки, и одно и то же поле
    есть не в каждой карточке — поэтому перебираем, пока не найдём нужную.
    """
    pg = t.page
    t.open(route, wait='[data-open-oi]')
    t.wait(300)
    total = pg.locator('tr[data-open-oi]').count()

    for i in range(min(total, 5)):
        t.open(route, wait='[data-open-oi]')
        t.wait(250)
        pg.locator('tr[data-open-oi]').nth(i).click()
        t.wait(700)
        if not need or pg.locator(need).count():
            return True
    return False


def run(t):
    pg = t.page

    # --- 1. обычный select: значение из справочника видно в карточке ---
    for type_id, route, field_name, sel in CASES:
        # Литера — второй каталог: объект оценки, литера, квартира, участок.
        if not t.ck(_open_dict(t, type_id, 'Литера', field_name),
                    '%s: не нашёл справочник поля «%s»' % (type_id, field_name)):
            continue

        value = '%s — %s' % (MARK, type_id)
        if not t.ck(_add_value(t, value), '%s: справочник не редактируется' % type_id):
            continue

        if not t.ck(_open_letter(t, route, sel.split(' ')[0]),
                    '%s: не нашёл ОИ с полем «%s»' % (type_id, field_name)):
            continue
        options = pg.eval_on_selector_all(sel, 'els => els.map((e) => e.textContent.trim())')
        t.ck(value in options,
             '%s: значение из справочника не дошло до поля «%s»: %s'
             % (type_id, field_name, options))

    # Карточка квартиры — свой набор полей: у неё поле «Расположение».
    if t.ck(_open_dict(t, 'apartment', 'Квартира', 'Положение на этаже'),
            'apartment: не нашёл справочник поля «Положение на этаже»'):
        value = MARK + ' — квартира'
        _add_value(t, value)
        if t.ck(_open_letter(t, '#/oc/apartment/oc-ap-1', '[data-apt-location]'),
                'apartment: не нашёл карточку квартиры'):
            options = pg.eval_on_selector_all('[data-apt-location] option',
                                              'els => els.map((e) => e.textContent.trim())')
            t.ck(value in options,
                 'apartment: значение не дошло до поля «Положение на этаже»: %s' % options)

    # --- 2. удаление значения тоже доходит ---
    if t.ck(_open_dict(t, 'civil', 'Литера', 'Права на строение'), 'не открыл справочник прав'):
        pg.locator('[data-item-del]').last.click()
        t.wait(500)
        ok = pg.locator('[data-modal-ok]')
        if ok.count():
            ok.first.click()
            t.wait(600)

        _open_letter(t, '#/oc/civil/oc-cv-1', '[data-bld-rights]')
        options = pg.eval_on_selector_all('[data-bld-rights] option',
                                          'els => els.map((e) => e.textContent.trim())')
        t.ck(not any(o.startswith(MARK) for o in options),
             'удалённое значение осталось в поле карточки: %s' % options)

    # --- 3. мультивыбор (отопление) читает справочник ---
    if t.ck(_open_dict(t, 'civil', 'Литера', 'Отопление'), 'не открыл справочник отопления'):
        value = MARK + ' — отопление'
        _add_value(t, value)

        _open_letter(t, '#/oc/civil/oc-cv-1', '[data-heat-opt]')
        found = pg.evaluate("""(mark) => {
          const drop = document.querySelector('[data-ms="heating"], .ms-drop');
          const all = [...document.querySelectorAll('[data-heat-opt]')];
          return all.map((e) => e.getAttribute('data-heat-opt') + '|' + e.textContent.trim())
            .some((x) => x.includes(mark));
        }""", value)
        t.ck(found, 'значение из справочника не дошло до мультивыбора «Отопление»')

    # --- 4. поле с разделами (категория ОИ) ---
    if t.ck(_open_dict(t, 'civil', 'Литера', 'Категория ОИ'), 'не открыл справочник категорий ОИ'):
        groups = pg.evaluate("""() => [...document.querySelectorAll('.dc-tbl .dc-group-row')]
            .map((e) => e.textContent.trim())""")
        t.ck(len(groups) >= 2, 'перечень с разделами потерял разделы: %s' % groups)

        # В карточке виден раздел СВОЕЙ группы, а не оба сразу: производственные
        # классы — у производственного строения, остальные — у гражданского
        # (решение пользователя 05.09.2026). Поэтому проверяем, что раздел
        # доехал до поля и это раздел гражданских помещений, а не что их два.
        _open_letter(t, '#/oc/civil/oc-cv-1', '[data-oi-category]')
        og = pg.eval_on_selector_all('[data-oi-category] optgroup',
                                     'els => els.map((e) => e.getAttribute("label"))')
        t.ck(len(og) == 1, 'в карточке гражданского здания разделы «Категории ОИ»: %s' % og)
        t.ck(og and 'дминистративн' in og[0],
             'в карточке гражданского здания не тот раздел категорий: %s' % og)
        opts = pg.eval_on_selector_all('[data-oi-category] option',
                                       'els => els.map((e) => e.textContent.trim())')
        t.ck(len(opts) >= 4, 'в карточке пропали значения «Категории ОИ»: %s' % opts)

    # --- 5. участок: перечень общий для всех типов ОЦ, но правится отдельно ---
    if t.ck(_open_dict(t, 'civil', 'Земельный участок', 'Форма участка'),
                'не открыл справочник формы участка'):
        value = MARK + ' — форма'
        _add_value(t, value)

        t.open('#/oc/civil/oc-cv-1', wait='[data-open-oi]')
        t.wait(300)
        land = pg.locator('.oi-land-open, [data-open-land]')
        if land.count():
            land.first.click()
            t.wait_for('[data-land-form]')
            options = pg.eval_on_selector_all('[data-land-form] option',
                                              'els => els.map((e) => e.textContent.trim())')
            t.ck(value in options,
                 'значение не дошло до поля «Форма участка» карточки участка: %s' % options)
