# -*- coding: utf-8 -*-
"""Карточка ОИ «Транспортное средство» в гражданском здании.

Карточка перенесена из ветки TS-Daniil (модуль ОЦ «Транспортные средства») и
заведена видом объекта имущества: одно ТС — один ОИ (решение пользователя
17.09.2026). Сценарий держит то, что легко сломать правкой:

  * ТС добавляется из меню «+ Добавить ОИ» и попадает в раздел движимого
    имущества перечня, а не к литерам;
  * характеристики зависят от типа ТС: пока тип не выбран, их нет и стоит
    подсказка; при смене типа значения общих полей не теряются;
  * VIN приводится к виду стандарта прямо при наборе — верхний регистр, без
    букв I, O и Q, не длиннее 17 знаков, — а недобранная длина показывается
    сообщением, а не молча;
  * госномер набирается в любом регистре, а хранится в верхнем;
  * подпись ОИ собирается из марки, модели и госномера по ходу набора: своего
    поля «наименование» у ТС нет;
  * кода ЕНИ у ТС нет — чипа «ЕНИ» в плашке быть не должно;
  * числовые поля — общие для макета: «1200*1000» в стоимости даёт 1 200 000.
"""

NAME = 'карточка ТС'

TOUCHES = (
    'app/modules/civil/oi/vehicle/*', 'app/modules/civil/data/vehicleFields.js',
    'app/modules/civil/parts/fields.js', 'app/modules/civil/oi/registry.js',
    'app/modules/civil/data/rules.js', 'app/modules/civil/card/*',
)

OC = '#/oc/civil/oc-cv-1'


def run(t):
    pg = t.page

    def plain(v):
        return v.replace(' ', ' ').replace(' ', ' ')

    # --- добавление из меню ----------------------------------------------------
    t.open(OC, wait='[data-add-oi]')
    pg.locator('[data-dd-toggle]').first.click()
    t.wait(250)
    items = pg.eval_on_selector_all('[data-add-oi]', 'els => els.map((e) => e.textContent.trim())')
    t.ck('Транспортное средство' in items, 'в меню нет «Транспортное средство»: %s' % items)

    before = pg.locator('tr[data-open-oi]').count()
    pg.locator('[data-add-oi]', has_text='Транспортное средство').click()
    t.wait_until("() => document.querySelectorAll('tr[data-open-oi]').length === %d" % (before + 1))
    t.wait(300)

    # В демо-данных ТС уже есть, поэтому смотрим на прирост, а не на единицу:
    # заведённое сценарием — последняя строка раздела.
    rows = pg.locator('tr[data-open-oi]', has_text='Движимое · Транспорт')
    t.ck(rows.count() >= 2, 'строка нового ТС не появилась в перечне: %d' % rows.count())
    # Новое ТС отличает пустая подпись: марку ещё не заполняли. В демо-данных
    # ТС уже есть, и просто «последняя строка» брала бы его.
    row = rows.filter(has_text='Транспортное средство').first
    t.ck(pg.evaluate("""() => {
      const tr = [...document.querySelectorAll('tr[data-open-oi]')]
        .find((x) => x.innerText.includes('Движимое · Транспорт'));
      const sub = tr && tr.closest('[data-oi-sub]');
      return !!sub && sub.dataset.oiSub === 'movable';
    }"""), 'ТС стоит не в разделе движимого имущества')

    # --- карточка: характеристики по типу ---------------------------------------
    row.click()
    t.wait_for('#q-vehicle')
    t.wait(300)

    plate = ' '.join(pg.locator('.ctx-plate').inner_text().split())
    t.ck('ЕНИ' not in plate, 'в плашке ТС показан чип ЕНИ: %s' % plate)

    t.ck(pg.locator('[data-vh-type]').count() == 1, 'нет поля «Тип ТС»')
    t.ck('Выберите тип ТС' in pg.locator('.mu-empty').first.inner_text(),
         'без типа ТС нет подсказки о характеристиках')

    pg.select_option('[data-vh-type]', 'Легковое')
    t.wait_until("() => !!document.querySelector('[data-vh-f=\"bodyType\"]')")
    t.wait(300)
    keys = pg.eval_on_selector_all('[data-vh-f]', 'els => els.map((e) => e.dataset.vhF)')
    t.ck('bodyType' in keys and 'engineVolume' in keys, 'нет характеристик легкового: %s' % keys)
    t.ck('specialKind' not in keys, 'показаны характеристики чужого типа: %s' % keys)

    vol = pg.locator('[data-vh-f="engineVolume"]')
    vol.fill('2494')
    pg.locator('[data-vh-brand]').click()
    t.wait(200)
    t.ck(plain(vol.input_value()) == '2 494', 'объём двигателя показан не целым: %r' % vol.input_value())

    # --- смена типа: общее значение остаётся -------------------------------------
    pg.select_option('[data-vh-type]', 'Спецтехника')
    t.wait_until("() => !!document.querySelector('[data-vh-f=\"specialKind\"]')")
    t.wait(300)
    keys = pg.eval_on_selector_all('[data-vh-f]', 'els => els.map((e) => e.dataset.vhF)')
    t.ck('engineHours' in keys, 'нет характеристик спецтехники: %s' % keys)
    t.ck(plain(pg.locator('[data-vh-f="engineVolume"]').input_value()) == '2 494',
         'общее поле потеряло значение при смене типа')

    pg.select_option('[data-vh-type]', 'Легковое')
    t.wait_until("() => !!document.querySelector('[data-vh-f=\"bodyType\"]')")
    t.wait(300)

    # --- марка, госномер, VIN -----------------------------------------------------
    pg.fill('[data-vh-brand]', 'Toyota')
    pg.fill('[data-vh-model]', 'Camry')
    pg.locator('[data-vh-plate]').fill('01kg123abc')
    t.wait(200)
    t.ck(pg.input_value('[data-vh-plate]') == '01KG123ABC',
         'госномер не приведён к верхнему регистру: %r' % pg.input_value('[data-vh-plate]'))
    t.ck('Toyota Camry' in pg.locator('#q-vehicle .mu-title').inner_text(),
         'подпись карточки не собралась из марки и модели')

    vin = pg.locator('[data-vh-vin]')
    vin.fill('jtdbe32k1o3300123')
    t.wait(200)
    t.ck(vin.input_value() == 'JTDBE32K13300123',
         'VIN не приведён к виду стандарта: %r' % vin.input_value())
    pg.locator('[data-vh-inv]').click()
    t.wait(250)
    t.ck(vin.evaluate('(e) => e.classList.contains("field-bad")'), 'недобранный VIN не помечен')
    vin.fill('JTDBE32K1A3300123')
    pg.locator('[data-vh-inv]').click()
    t.wait(250)
    t.ck(not vin.evaluate('(e) => e.classList.contains("field-bad")'), 'полный VIN помечен ошибкой')

    # --- числовое поле ---------------------------------------------------------------
    cost = pg.locator('[data-vh-cost]')
    cost.click()
    pg.keyboard.press('Control+a')
    cost.type('1200*1000')
    cost.press('Enter')
    t.wait(200)
    t.ck(plain(cost.input_value()) == '1 200 000,00',
         'стоимость не посчиталась выражением: %r' % cost.input_value())

    # --- подпись ОИ в перечне ---------------------------------------------------------
    t.open(OC, wait='[data-add-oi]')
    t.wait(300)
    rows = pg.eval_on_selector_all('tr[data-open-oi]', 'els => els.map((e) => e.innerText)')
    t.ck(any('Toyota Camry · 01KG123ABC' in r for r in rows),
         'подпись ТС в перечне не собралась из марки, модели и госномера: %s' % rows)
