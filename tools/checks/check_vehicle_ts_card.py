# -*- coding: utf-8 -*-
"""Карточка ОЦ «Транспортные средства» по категоризации «база + модуль».

Карточка перестроена 23.09.2026 под справочник docs/kategorii-ts-baza-modul.xlsx
(данные — app/modules/vehicle/data/tsCatalog.js, собираются скриптом
tools/data/build_ts_catalog.py). Сценарий держит то, что легко сломать правкой:

  * пока не выбран вид объекта и база (или вид машины, модуль), полей машины
    нет — дочернее не показывают до родителя; база недоступна до категории;
  * «Прочее» есть в каждой категории (правило 16 справочника);
  * поля машины идут в порядке граф свидетельства: марка, модель, год, цвет,
    VIN, № кузова, № шасси;
  * у поля с бланка — метка «ТП», в подсказке к ней — где графа на обоих
    бланках (книжка 2019 г. и «КР №»); у поля осмотра — метка «осмотр»;
  * VIN не обрезается и не запрещается: короткий заводской номер старой
    машины сохраняется как есть, а несоответствие стандарту — предупреждение;
  * нет ни VIN, ни № кузова, ни № шасси — предупреждение у группы номеров;
  * у базы свои особые поля (у трактора — ходовая флажками);
  * модули: добавляются кнопкой, выбираются каскадом, строка таблицы следует
    за полями формы; подсказка «обычно вписывают» заводит строку с готовым
    названием и ставит курсор в значение;
  * у самоходной машины и отдельного модуля — свои поля.
"""

NAME = 'карточка ОЦ ТС: база и модули'

TOUCHES = (
    'app/modules/vehicle/*', 'app/modules/vehicle/data/*', 'tools/data/build_ts_catalog.py',
    'tools/docs/build_kategorii_ts.py', 'app/kernel/numField.js',
)

REC = """async () => {
  const m = await import('/app/modules/vehicle/records.js');
  return m.allRecords()[0].vehicle;
}"""


def run(t):
    pg = t.page

    t.open('', wait='[data-create="vehicle"]')
    pg.locator('.dd [data-dd-toggle]').filter(has_text='Создать ОЦ').click()
    pg.click('[data-create="vehicle"]')
    t.wait_for('.vehicle-form')

    heads = pg.eval_on_selector_all('.vehicle-form .card-head h3', 'els => els.map((e) => e.textContent.trim())')
    t.ck(heads == ['Учреждение, собственники и ответственные', 'Вид объекта'],
         'до выбора вида объекта в карточке лишние блоки: %s' % heads)
    t.ck(pg.locator('[data-tsf]').count() == 0, 'поля машины показаны до выбора вида объекта')

    # --- ТС: категория → база ------------------------------------------------------
    pg.click('[data-ts-kind="base"]')
    t.wait_for('[data-ts-cat]')
    t.ck(pg.locator('[data-ts-base][disabled]').count() == 1, 'база доступна до выбора категории')
    pg.select_option('[data-ts-cat]', 'Грузовое')
    t.wait_for('[data-ts-base]:not([disabled])')
    bases = pg.eval_on_selector_all('[data-ts-base] option', 'els => els.map((e) => e.textContent.trim())')
    t.ck('Прочее' in bases, 'в категории нет базы «Прочее»: %s' % bases)
    t.ck(pg.locator('[data-tsf]').count() == 0, 'поля машины показаны до выбора базы')

    pg.select_option('[data-ts-base]', 'Тяжёлый грузовик (свыше 12 т)')
    t.wait_for('[data-tsf="main|make"]')
    heads = pg.eval_on_selector_all('.vehicle-form .card-head h3', 'els => els.map((e) => e.textContent.trim())')
    t.ck(heads[2:] == ['Машина', 'Регистрация', 'Наработка и состояние', 'Модули', 'Дополнительные параметры'],
         'блоки карточки ТС не те: %s' % heads)

    order = pg.eval_on_selector_all('[data-ts-key]', 'els => els.map((e) => e.dataset.tsKey)')
    t.ck(order[:7] == ['make', 'model', 'year', 'color', 'vin', 'bodyNo', 'chassisNo'],
         'поля машины не в порядке граф свидетельства: %s' % order[:7])

    tip = pg.get_attribute('[data-ts-key="vin"] .vh-src', 'title') or ''
    t.ck(pg.inner_text('[data-ts-key="vin"] .vh-src').strip() == 'ТП', 'у VIN нет метки «ТП»')
    t.ck('2019' in tip and 'КР №' in tip, 'в подсказке к VIN нет места графы на бланках: %r' % tip)
    t.ck(pg.inner_text('[data-ts-key="mileage"] .vh-src').strip().lower() == 'осмотр', 'у пробега нет метки «осмотр»')

    # --- VIN и номера --------------------------------------------------------------
    pg.fill('[data-tsf="main|vin"]', '036932')
    pg.locator('[data-tsf="main|color"]').click()
    t.wait_until("() => !document.querySelector('[data-ts-warn=\"main|vin\"]').hidden")
    t.ck(pg.input_value('[data-tsf="main|vin"]') == '036932', 'короткий заводской номер в VIN изменён')
    t.ck(pg.evaluate(REC)['f'].get('vin') == '036932', 'короткий VIN не записался')

    pg.fill('[data-tsf="main|vin"]', '')
    pg.locator('[data-tsf="main|color"]').click()
    t.wait_until("() => !document.querySelector('[data-ts-idwarn]').hidden")
    pg.fill('[data-tsf="main|bodyNo"]', 'JNBAZ08W44W312414')
    pg.locator('[data-tsf="main|color"]').click()
    t.wait_until("() => document.querySelector('[data-ts-idwarn]').hidden")

    # --- особые поля базы ----------------------------------------------------------
    pg.select_option('[data-ts-cat]', 'Спецтехника')
    t.wait_for('[data-ts-base]:not([disabled])')
    pg.select_option('[data-ts-base]', 'Трактор')
    t.wait_for('[data-tsf-check="main|run"]')
    t.ck(pg.locator('[data-tsf-check="main|run"]').count() == 7, 'у трактора ходовая не флажками')
    pg.locator('[data-tsf-check="main|run"][value="Колёсная"]').check()
    pg.locator('[data-tsf-check="main|run"][value="Гусеничная"]').check()
    t.ck(pg.evaluate(REC)['f'].get('run') == ['Колёсная', 'Гусеничная'], 'ходовая не записалась списком')
    t.ck(pg.evaluate(REC)['f'].get('bodyNo') == 'JNBAZ08W44W312414', 'при смене базы пропал № кузова')

    # --- модули --------------------------------------------------------------------
    pg.click('[data-ts-madd]')
    t.wait_for('[data-ts-modgroup]')
    mid = pg.get_attribute('[data-ts-modgroup]', 'data-ts-modgroup')
    t.ck(pg.locator('[data-ts-modkind="%s"][disabled]' % mid).count() == 1, 'модуль доступен до выбора группы')
    pg.select_option('[data-ts-modgroup="%s"]' % mid, 'Строительные и дорожные')
    pg.select_option('[data-ts-modkind="%s"]' % mid, 'Экскаваторное оборудование')
    t.wait_for('[data-tsf="%s|model"]' % mid)
    pg.fill('[data-tsf="%s|model"]' % mid, 'ЭО-2621')
    t.wait_until("() => document.querySelector('[data-ts-mpick=\"%s\"]').innerText.includes('ЭО-2621')" % mid)

    chip = pg.locator('[data-tsx-suggest^="%s|"]' % mid).first
    label = chip.get_attribute('data-tsx-suggest').split('|', 1)[1]
    chip.click()
    t.wait_until("() => document.activeElement && (document.activeElement.dataset.tsxValue || '').startsWith('%s|')" % mid)
    mods = pg.evaluate(REC)['modules']
    t.ck(mods and mods[0]['extra'] and mods[0]['extra'][0]['label'] == label,
         'подсказка не завела строку с названием: %s' % mods)
    t.ck(pg.locator('[data-tsx-suggest="%s|%s"]' % (mid, label)).count() == 0,
         'подсказка осталась после того, как строка заведена')

    # --- самоходная машина и отдельный модуль ---------------------------------------
    pg.click('[data-ts-kind="self"]')
    pg.select_option('[data-ts-sgroup]', 'Землеройные')
    pg.select_option('[data-ts-skind]', 'Экскаватор')
    t.wait_for('[data-tsf="main|serialNo"]')
    t.ck(pg.locator('[data-tsf-check="main|run"]').count() == 7, 'у самоходной машины нет ходовой флажками')
    t.ck(pg.locator('[data-tsx-suggest^="main|"]').count() > 0, 'у самоходной машины нет подсказок параметров')

    pg.click('[data-ts-kind="module"]')
    pg.select_option('[data-ts-mgroup]', 'Ковши')
    pg.select_option('[data-ts-mkind]', 'Ковш скальный')
    t.wait_for('[data-tsf="main|serialNo"]')
    heads = pg.eval_on_selector_all('.vehicle-form .card-head h3', 'els => els.map((e) => e.textContent.trim())')
    t.ck(heads[2:] == ['Модуль', 'Наработка и состояние', 'Дополнительные параметры'],
         'у отдельного модуля не те блоки: %s' % heads)
