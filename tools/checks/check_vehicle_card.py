# -*- coding: utf-8 -*-
"""Карточка ОИ «Транспортное средство» в гражданском здании.

Карточка перенесена из ветки TS-Daniil (модуль ОЦ «Транспортные средства») и
заведена видом объекта имущества: одно ТС — один ОИ (решение пользователя
17.09.2026). Сценарий держит то, что легко сломать правкой:

  * ТС добавляется из меню «+ Добавить ОИ» и попадает в раздел движимого
    имущества перечня, а не к литерам;
  * движимое предлагают ОБА меню «+ Добавить ОИ» — и в шапке карточки, и в
    шапке перечня: второе строилось без записи, и механизмов с транспортом в
    нём не было даже у имущественного комплекса;
  * у объекта оценки, который не имущественный комплекс, движимого в меню нет
    (правило подтверждено пользователем 17.09.2026);
  * состав зависит от типа ТС и разложен по этапам: блок «Характеристики» —
    то, что переписывают с документов, блок «Осмотр» — то, что определяют на
    месте (состав задан пользователем 18.09.2026 по восьми типам ТС);
  * пока тип не выбран, полей нет и стоит подсказка; при смене типа значения
    общих полей не теряются;
  * дополнительные параметры — строки «наименование — значение»: добавляются и
    убираются, кнопка добавления есть и когда строк нет;
  * VIN приводится к виду стандарта прямо при наборе — верхний регистр, без
    букв I, O и Q, не длиннее 17 знаков, — а недобранная длина показывается
    сообщением, а не молча;
  * госномер набирается в любом регистре, а хранится в верхнем;
  * марка и модель — ОДНО поле (указание пользователя 18.09.2026);
  * подпись ОИ собирается из марки с моделью и госномера по ходу набора: своего
    поля «наименование» у ТС нет;
  * кода ЕНИ у ТС нет — чипа «ЕНИ» в плашке быть не должно;
  * учётных сведений баланса (инвентарный номер, год ввода в эксплуатацию,
    балансовая стоимость) в карточке нет (указание пользователя 17.09.2026);
  * числовые поля — общие для макета: «12*100» в пробеге даёт 1 200;
  * комплектация, особые отметки и комментарий — многострочные: растут под
    текст, а после того как человек потянул поле за уголок, держат его размер
    (указание пользователя 18.09.2026). Комплектация идёт во всю строку.
"""

NAME = 'карточка ТС'

TOUCHES = (
    'app/modules/civil/oi/vehicle/*', 'app/modules/vehicle/data/vehicleFields.js',
    'app/modules/vehicle/data/dictionaries.js', 'app/kernel/fieldSpec.js',
    'app/modules/civil/oi/registry.js', 'app/modules/civil/data/rules.js',
    'app/modules/civil/card/*',
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

    menus = pg.evaluate("""() => [...document.querySelectorAll('.dd-menu')]
      .map((m) => [...m.querySelectorAll('[data-add-oi]')].map((b) => b.textContent.trim()))
      .filter((list) => list.length)""")
    t.ck(len(menus) >= 2, 'меню добавления ОИ должно быть два: в шапке карточки и в перечне')
    for i, one in enumerate(menus, start=1):
        t.ck('Механизмы и оборудование' in one and 'Транспортное средство' in one,
             'в меню %d нет движимого имущества: %s' % (i, one))

    before = pg.locator('tr[data-open-oi]').count()
    # Меню два, пункты в них одинаковые — заводим из первого.
    pg.locator('[data-add-oi]', has_text='Транспортное средство').first.click()
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

    # У объекта оценки, который не имущественный комплекс, движимого не бывает.
    t.open('#/oc/civil/oc-cv-2', wait='[data-add-oi]')
    t.wait(300)
    plain_items = pg.eval_on_selector_all('[data-add-oi]', 'els => els.map((e) => e.textContent.trim())')
    t.ck('Транспортное средство' not in plain_items and 'Механизмы и оборудование' not in plain_items,
         'движимое предлагают не у имущественного комплекса: %s' % plain_items)

    t.open(OC, wait='[data-add-oi]')
    t.wait(300)

    # --- карточка: характеристики по типу ---------------------------------------
    row.click()
    t.wait_for('#q-vehicle')
    t.wait(300)

    plate = ' '.join(pg.locator('.ctx-plate').inner_text().split())
    t.ck('ЕНИ' not in plate, 'в плашке ТС показан чип ЕНИ: %s' % plate)

    t.ck(pg.locator('[data-vh-type]').count() == 1, 'нет поля «Тип ТС»')
    t.ck('Выберите тип ТС' in pg.locator('.mu-empty').first.inner_text(),
         'без типа ТС нет подсказки о полях')

    pg.select_option('[data-vh-type]', 'Легковая')
    t.wait_until("() => !!document.querySelector('[data-vh-f=\"bodyType\"]')")
    t.wait(300)
    keys = pg.eval_on_selector_all('[data-vh-f]', 'els => els.map((e) => e.dataset.vhF)')
    t.ck('bodyType' in keys and 'engineVolume' in keys and 'bodyNo' in keys,
         'нет паспортных полей легковой: %s' % keys)
    t.ck('superstructure' not in keys, 'показаны поля чужого типа: %s' % keys)

    # Осмотр — свой блок, а не вперемешку с паспортными полями.
    inspect = pg.eval_on_selector_all(
        '[data-vh-sec="inspect"] [data-vh-f]', 'els => els.map((e) => e.dataset.vhF)')
    t.ck('stBody' in inspect and 'stEngine' in inspect and 'kit' in inspect,
         'в блоке осмотра нет состояний узлов: %s' % inspect)
    t.ck('engineVolume' not in inspect, 'паспортное поле попало в блок осмотра: %s' % inspect)

    vol = pg.locator('[data-vh-f="engineVolume"]')
    vol.fill('2494')
    pg.locator('[data-vh-make]').click()
    t.wait(200)
    t.ck(plain(vol.input_value()) == '2 494', 'объём двигателя показан не целым: %r' % vol.input_value())

    # Учётные сведения баланса в карточке ТС не спрашиваются.
    t.ck(pg.locator('[data-vh-cost]').count() == 0, 'в карточке ТС спрашивают балансовую стоимость')
    t.ck(pg.locator('[data-vh-inv]').count() == 0, 'в карточке ТС спрашивают инвентарный номер')

    # --- дополнительные параметры ------------------------------------------------
    t.ck(pg.locator('[data-vh-xadd]').count() == 1,
         'нет кнопки добавления дополнительного параметра')
    pg.locator('[data-vh-xadd]').click()
    t.wait_until("() => !!document.querySelector('[data-vh-xlabel]')")
    t.wait(300)
    row = pg.locator('[data-vh-xlabel]').first
    t.ck(pg.evaluate("() => !!document.activeElement.hasAttribute('data-vh-xlabel')"),
         'после добавления параметра курсор не в поле наименования')
    row.fill('Газобаллонное оборудование')
    pg.locator('[data-vh-xvalue]').first.fill('Метан, 2 баллона')
    t.wait(200)

    pg.locator('[data-vh-xdel]').first.click()
    t.wait(300)
    t.ck(pg.locator('[data-vh-xlabel]').count() == 0, 'строка параметра не убралась')
    t.ck(pg.locator('[data-vh-xadd]').count() == 1,
         'кнопка добавления пропала вместе с последней строкой')

    # --- многострочные поля ------------------------------------------------------
    kit = pg.locator('[data-vh-f="kit"]')
    t.ck(kit.evaluate('(e) => e.tagName') == 'TEXTAREA', 'комплектация — однострочное поле')
    t.ck(kit.evaluate("(e) => getComputedStyle(e.closest('.field')).gridColumn") == '1 / -1',
         'комплектация занимает не всю строку')

    before = kit.evaluate('(e) => Math.round(e.getBoundingClientRect().height)')
    kit.click()
    # Переводы строк, а не длинная строка: при широком поле длинный текст
    # умещается в те же две строки, и проверка ничего не проверяет.
    kit.fill('\n'.join(['Запасное колесо, домкрат, набор ключей', 'Компрессор, трос, аптечка',
                        'Огнетушитель, знак аварийной остановки', 'Коврики, чехлы сидений']))
    t.wait(250)
    grown = kit.evaluate('(e) => Math.round(e.getBoundingClientRect().height)')
    t.ck(grown > before, 'поле не выросло под текст: было %d, стало %d' % (before, grown))

    # Человек потянул поле за уголок — дальше оно держит заданный размер.
    kit.evaluate("(e) => { e.style.height = '150px'; }")
    t.wait(250)
    kit.click()
    kit.type(' , и ещё пункт, и ещё один пункт комплектации')
    t.wait(250)
    t.ck(kit.evaluate('(e) => Math.round(e.getBoundingClientRect().height)') == 150,
         'после ручной растяжки поле снова подстроилось под текст')

    # --- смена типа: общее значение остаётся -------------------------------------
    pg.select_option('[data-vh-type]', 'Грузовой (свыше 3,5 т)')
    t.wait_until("() => !!document.querySelector('[data-vh-f=\"superstructure\"]')")
    t.wait(300)
    keys = pg.eval_on_selector_all('[data-vh-f]', 'els => els.map((e) => e.dataset.vhF)')
    t.ck('superstructure' in keys and 'engineHours' in keys and 'wheelFormula' in keys,
         'нет паспортных полей грузового: %s' % keys)
    t.ck(pg.locator('[data-vh-f="kit"]').evaluate(
        '(e) => Math.round(e.getBoundingClientRect().height)') == 150,
        'заданный человеком размер поля не пережил смену типа ТС')
    t.ck(plain(pg.locator('[data-vh-f="engineVolume"]').input_value()) == '2 494',
         'общее поле потеряло значение при смене типа')

    pg.select_option('[data-vh-type]', 'Легковая')
    t.wait_until("() => !!document.querySelector('[data-vh-f=\"bodyType\"]')")
    t.wait(300)

    # --- марка, госномер, VIN -----------------------------------------------------
    pg.fill('[data-vh-make]', 'Toyota Camry')
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
    pg.locator('[data-vh-make]').click()
    t.wait(250)
    t.ck(vin.evaluate('(e) => e.classList.contains("field-bad")'), 'недобранный VIN не помечен')
    vin.fill('JTDBE32K1A3300123')
    pg.locator('[data-vh-make]').click()
    t.wait(250)
    t.ck(not vin.evaluate('(e) => e.classList.contains("field-bad")'), 'полный VIN помечен ошибкой')

    # --- числовое поле ---------------------------------------------------------------
    run = pg.locator('[data-vh-f="mileage"]')
    run.click()
    pg.keyboard.press('Control+a')
    run.type('12*100')
    run.press('Enter')
    t.wait(200)
    t.ck(plain(run.input_value()) == '1 200', 'пробег не посчитался выражением: %r' % run.input_value())

    # --- особые отметки и комментарий ---------------------------------------------------
    t.ck(pg.locator('[data-vh-marks]').count() == 1, 'нет поля «Особые отметки»')
    cm = pg.locator('[data-vh-comment]')
    t.ck(cm.count() == 1, 'нет поля комментария')
    cm.fill('Сверить пробег с путевыми листами.')
    t.wait(200)

    # --- подпись ОИ в перечне ---------------------------------------------------------
    t.open(OC, wait='[data-add-oi]')
    t.wait(300)
    rows = pg.eval_on_selector_all('tr[data-open-oi]', 'els => els.map((e) => e.innerText)')
    t.ck(any('Toyota Camry · 01KG123ABC' in r for r in rows),
         'подпись ТС в перечне не собралась из марки, модели и госномера: %s' % rows)
