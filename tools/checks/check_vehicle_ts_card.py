# -*- coding: utf-8 -*-
"""Карточка ОЦ «Транспортные средства» по категоризации «база + модуль».

Карточка перестроена 23.09.2026 под справочник docs/kategorii-ts-baza-modul.xlsx
(данные — app/modules/vehicle/data/tsCatalog.js, собираются скриптом
tools/data/build_ts_catalog.py). Сценарий держит то, что легко сломать правкой:

  * пока не выбран вид объекта и база (или вид машины, модуль), полей машины
    нет — дочернее не показывают до родителя; база недоступна до категории;
  * «Прочее» есть в каждой категории (правило 16 справочника);
  * «Тип ТС, вид кузова» стоит в блоке 02 и по первому слову подбирает
    категорию («легковой минивэн» → «Легковое»); выбранную руками не трогает;
  * регистрационный учёт стоит перед блоком машины и без собственника (он в
    блоке сторон), адрес — фактический;
  * блок «Автотранспортное средство» разбит на подразделы (общие сведения,
    номера, тип-двигатель-массы, ходовая и трансмиссия, особое для базы,
    дополнительные параметры), внутри — порядок граф свидетельства; номера —
    таблицей;
  * у электромобиля нет рабочего объёма (от топлива зависят поля двигателя);
  * в регистрации нет ИНН собственника (указание пользователя 23.09.2026);
  * у поля с бланка — метка «ТП», в подсказке к ней — где графа на обоих
    бланках (книжка 2019 г. и «КР №»); у поля осмотра — метка «осмотр»;
  * VIN не обрезается и не запрещается: короткий заводской номер старой
    машины сохраняется как есть, а несоответствие стандарту — предупреждение;
  * нет ни VIN, ни № кузова, ни № шасси — предупреждение у группы номеров;
  * у базы свои особые поля (у трактора — ходовая флажками);
  * модуль удаляется крестиком в строке (виден без наведения) и кнопкой в
    форме; со сведениями — с подтверждением, пустой — сразу;
  * модули: добавляются кнопкой, выбираются каскадом, строка таблицы следует
    за полями формы; у модуля своя таблица дополнительных параметров;
    подсказок «обычно вписывают» нет (указание пользователя 23.09.2026);
  * у самоходной машины и отдельного модуля — свои поля;
  * блок «Фото с осмотра» — две категории, «Машина» и «Модули»; снимок
    открывается в просмотрщике, у которого есть режимы «Фото» и «Сравнение»,
    а в боковой панели — снимки записи (задача пользователя 23.09.2026);
  * введённое переживает перезагрузку страницы (kernel/persist.js): модуль
    пришёл из ветки TS-Daniil без сохранения, и каждая перезагрузка стирала
    заведённые ТС (замечание пользователя 23.09.2026).
"""

import os
import struct
import tempfile
import zlib

NAME = 'карточка ОЦ ТС: база и модули'

TOUCHES = (
    'app/modules/vehicle/*', 'app/modules/vehicle/data/*', 'tools/data/build_ts_catalog.py',
    'tools/docs/build_kategorii_ts.py', 'app/kernel/numField.js', 'app/kernel/persist.js',
    'app/kernel/viewer/*',
)


def _png():
    """Маленький настоящий PNG — снимок «с осмотра» для загрузки."""
    w, h = 40, 30
    raw = b''.join(b'\x00' + b'\x28\x78\xc8' * w for _ in range(h))

    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))
    path = os.path.join(tempfile.gettempdir(), 'check_vehicle_photo.png')
    open(path, 'wb').write(data)
    return path

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
    # «Тип ТС, вид кузова» — в блоке 02, категория и единственная база
    # подбираются по записи; выбранное руками подбор больше не трогает.
    pg.fill('[data-tsf="main|vtype"]', 'легковой минивэн')
    pg.locator('[data-ts-cat]').focus()
    t.wait_until("() => document.querySelector('[data-ts-cat]').value === 'Легковое'")
    t.ck(pg.input_value('[data-ts-base]') == 'Легковой автомобиль и внедорожник', 'база не подобралась по категории')
    pg.select_option('[data-ts-cat]', 'Грузовое')
    t.wait_for('[data-ts-base]:not([disabled])')
    pg.fill('[data-tsf="main|vtype"]', 'легковой седан')
    pg.locator('[data-ts-cat]').focus()
    t.wait(200)
    t.ck(pg.input_value('[data-ts-cat]') == 'Грузовое', 'подбор по «Типу ТС» перебил выбранную руками категорию')
    t.wait_until("() => [...document.querySelectorAll('.toast')].some((e) => e.textContent.includes('не совпадает'))")
    bases = pg.eval_on_selector_all('[data-ts-base] option', 'els => els.map((e) => e.textContent.trim())')
    t.ck('Прочее' in bases, 'в категории нет базы «Прочее»: %s' % bases)
    t.ck(pg.locator('[data-tsf]:not([data-tsf="main|vtype"])').count() == 0, 'поля машины показаны до выбора базы')

    pg.select_option('[data-ts-base]', 'Тяжёлый грузовик (свыше 12 т)')
    t.wait_for('[data-tsf="main|make"]')
    heads = pg.eval_on_selector_all('.vehicle-form .card-head h3', 'els => els.map((e) => e.textContent.trim())')
    t.ck(heads[2:] == ['Регистрационный учёт', 'Автотранспортное средство', 'Наработка и состояние', 'Модули',
                       'Фото с осмотра'],
         'блоки карточки ТС не те: %s' % heads)

    subs = pg.eval_on_selector_all('.vehicle-form .card:nth-of-type(4) .vh-sub',
                                   'els => els.map((e) => e.firstChild.textContent.trim())')
    t.ck(subs[:4] == ['Общие сведения', 'Номера', 'Тип, двигатель, массы', 'Ходовая и трансмиссия']
         and subs[-1] == 'Дополнительные параметры', 'подразделы «Машины» не те: %s' % subs)

    order = pg.eval_on_selector_all('.vehicle-form .card:nth-of-type(4) .vh-grid [data-ts-key]',
                                    'els => els.map((e) => e.dataset.tsKey)')
    t.ck(order[:3] == ['make', 'year', 'color'] and 'model' not in order,
         'общие сведения не в порядке граф свидетельства: %s' % order[:4])
    nums = pg.eval_on_selector_all('.vh-ntbl [data-ts-key]', 'els => els.map((e) => e.dataset.tsKey)')
    t.ck(nums == ['vin', 'bodyNo', 'chassisNo', 'engineNo'], 'номера не таблицей или не в том порядке: %s' % nums)
    t.ck(pg.locator('[data-tsf="main|ownerInn"], [data-tsf="main|owner"]').count() == 0,
         'в регистрации остался собственник или ИНН — они в блоке сторон')
    t.ck(pg.locator('[data-tsf="main|factAddr"]').count() == 1, 'в регистрации нет фактического адреса')
    # Год в дате регистрации — четыре цифры: лишние цифры поле года не принимает.
    pg.focus('[data-tsf="main|regDate"]')
    pg.keyboard.type('01022019777')
    t.ck(len(pg.input_value('[data-tsf="main|regDate"]').split('-')[0]) == 4,
         'в году даты регистрации больше четырёх цифр: %s' % pg.input_value('[data-tsf="main|regDate"]'))
    t.ck(pg.locator('[data-tsx-suggest]').count() == 0, 'в карточке остались подсказки «обычно вписывают»')

    # --- топливо: у электромобиля нет рабочего объёма --------------------------------
    t.ck(pg.locator('[data-tsf="main|engineVolume"]').count() == 1, 'нет рабочего объёма у двигателя')
    pg.select_option('[data-tsf="main|fuel"]', 'Электро')
    t.wait_until("() => !document.querySelector('[data-tsf=\"main|engineVolume\"]')")
    t.ck(pg.locator('[data-tsf="main|power"]').count() == 1, 'у электромобиля нет мощности')
    pg.select_option('[data-tsf="main|fuel"]', 'Бензин')
    t.wait_for('[data-tsf="main|engineVolume"]')

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
    pg.select_option('[data-ts-cat]', 'Тракторы и специальные шасси')
    t.wait_for('[data-ts-base]:not([disabled])')
    pg.select_option('[data-ts-base]', 'Трактор')
    # Ходовая — выпадающий мультивыбор, как у материалов конструктива, а не
    # столбик флажков во всю ширину (замечание пользователя 23.09.2026).
    t.wait_for('[data-tsf-ms="main|run"] [data-ms-toggle]')
    t.ck(pg.locator('.vh-check, fieldset.vh-checks').count() == 0, 'ходовая снова столбиком флажков')
    pg.click('[data-tsf-ms="main|run"] [data-ms-toggle]')
    t.wait_for('[data-tsf-ms="main|run"] .ms-drop:not([hidden])')
    t.ck(pg.locator('[data-tsf-opt^="main|run|"]').count() == 7, 'в списке ходовой не семь вариантов')
    pg.locator('[data-tsf-opt="main|run|Гусеничная"]').check()
    pg.locator('[data-tsf-opt="main|run|Колёсная"]').check()
    t.ck(pg.locator('[data-tsf-ms="main|run"] .ms-drop:not([hidden])').count() == 1, 'список закрылся после выбора')
    t.ck(pg.locator('[data-tsf-ms="main|run"] .ms-count').inner_text().strip() == '2', 'счётчик выбранного не 2')
    pg.click('.vehicle-form .card-head h3 >> nth=0')
    t.wait_until("() => document.querySelector('[data-tsf-ms=\"main|run\"] .ms-drop').hidden")
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

    pg.click('[data-tsx-add="%s"]' % mid)
    t.wait_until("() => document.activeElement && (document.activeElement.dataset.tsxLabel || '').startsWith('%s|')" % mid)
    pg.keyboard.type('Глубина копания, м')
    mods = pg.evaluate(REC)['modules']
    t.ck(mods and mods[0]['extra'] and mods[0]['extra'][0]['label'] == 'Глубина копания, м',
         'строка параметра модуля не записалась в модуль: %s' % mods)
    t.ck(not pg.evaluate(REC)['extra'], 'параметр модуля попал в параметры машины')

    # Удаление: крестик в строке виден без наведения; модуль со сведениями —
    # с подтверждением, пустой — сразу (замечание пользователя 23.09.2026).
    cross = pg.locator('[data-ts-mpick="%s"] [data-ts-mdel]' % mid)
    t.ck(float(cross.evaluate('(e) => getComputedStyle(e).opacity')) == 1, 'крестик удаления модуля невидим')
    t.ck(pg.locator('[data-ts-mform="%s"] [data-ts-mdel]' % mid).count() == 1, 'в форме модуля нет кнопки удаления')
    cross.click()
    t.wait_for('[data-modal-ok]')
    pg.click('[data-modal-ok]')
    t.wait_until("() => !document.querySelector('[data-ts-mpick]')")
    t.ck(pg.evaluate(REC)['modules'] == [], 'модуль не удалился из записи')
    pg.click('[data-ts-madd]')
    t.wait_for('[data-ts-mdel]')
    pg.locator('[data-ts-mpick] [data-ts-mdel]').first.click()
    t.wait_until("() => !document.querySelector('[data-ts-mpick]')")
    t.ck(pg.locator('[data-modal-ok]').count() == 0, 'пустой модуль удаляется с вопросом')

    # --- фото с осмотра ---------------------------------------------------------------
    cats = pg.eval_on_selector_all('[data-ts-photo-add]', 'els => els.map((e) => e.dataset.tsPhotoAdd)')
    t.ck(cats == ['Машина', 'Модули'], 'категории фото с осмотра не те: %s' % cats)
    with pg.expect_file_chooser() as fc:
        pg.click('[data-ts-photo-add="Машина"]')
    fc.value.set_files([_png(), _png()])
    t.wait_for('[data-ts-photo-open="Машина|1"]')
    modes = pg.eval_on_selector_all('[data-vmode]', 'els => els.map((e) => e.dataset.vmode)')
    t.ck(modes == ['photo', 'doc', 'compare'], 'в просмотрщике ТС нет режимов фото и сравнения: %s' % modes)
    pg.click('[data-ts-photo-open="Машина|1"]')
    t.wait_until("() => !!document.querySelector('.viewer [data-vmode=\"photo\"].active')")
    t.ck(pg.locator('.viewer .vimg').count() == 2, 'в просмотрщике не два снимка машины')
    pg.click('[data-vsb-toggle]')
    t.wait_for('[data-vsb-photo]')
    t.ck(pg.locator('[data-vsb-photo]').count() == 2, 'в боковой панели нет снимков записи')
    pg.click('[data-vsb-close]')
    pg.click('[data-vmode="compare"]')
    t.wait_for('[data-cmp-side="photo"] .vimg')
    pg.click('[data-vmode="doc"]')

    # --- самоходная машина и отдельный модуль ---------------------------------------
    pg.click('[data-ts-kind="self"]')
    pg.select_option('[data-ts-sgroup]', 'Землеройные')
    pg.select_option('[data-ts-skind]', 'Экскаватор')
    t.wait_for('[data-tsf="main|serialNo"]')
    t.ck(pg.locator('[data-tsf-ms="main|run"]').count() == 1, 'у самоходной машины нет ходовой')
    nums = pg.eval_on_selector_all('.vh-ntbl [data-ts-key]', 'els => els.map((e) => e.dataset.tsKey)')
    t.ck(nums == ['serialNo', 'engineNo'], 'номера самоходной машины не те: %s' % nums)

    pg.click('[data-ts-kind="module"]')
    pg.select_option('[data-ts-mgroup]', 'Ковши')
    pg.select_option('[data-ts-mkind]', 'Ковш скальный')
    t.wait_for('[data-tsf="main|serialNo"]')
    heads = pg.eval_on_selector_all('.vehicle-form .card-head h3', 'els => els.map((e) => e.textContent.trim())')
    t.ck(heads[2:] == ['Оборудование', 'Наработка и состояние', 'Фото с осмотра'],
         'у оборудования без машины не те блоки: %s' % heads)
    t.ck(pg.locator('[data-tsx-add="main"]').count() == 1, 'у отдельного модуля нет дополнительных параметров')

    # --- сохранение: всё введённое переживает перезагрузку ---------------------------
    pg.fill('[data-tsf="main|serialNo"]', 'КС-001')
    before = pg.evaluate(REC)
    pg.evaluate("""async () => { (await import('/app/kernel/persist.js')).saveNow(); }""")
    pg.reload()
    t.wait_for('.vehicle-form [data-tsf="main|serialNo"]')
    after = pg.evaluate(REC)
    t.ck(pg.input_value('[data-tsf="main|serialNo"]') == 'КС-001', 'после перезагрузки поле пустое')
    t.ck(after.get('kind') == 'module' and after.get('modKind') == 'Ковш скальный',
         'после перезагрузки потерян вид объекта: %s / %s' % (after.get('kind'), after.get('modKind')))
    t.ck(after.get('modules') == before.get('modules') and after.get('f', {}).get('run') == ['Колёсная', 'Гусеничная'],
         'после перезагрузки потеряны модули или поля машины')
    t.ck((after.get('photoSet') or {}).get('photos', {}).get('Машина') == 2,
         'после перезагрузки пропал счёт фото с осмотра')
