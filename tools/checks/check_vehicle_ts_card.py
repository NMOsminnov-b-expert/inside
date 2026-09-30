# -*- coding: utf-8 -*-
"""Карточка ОЦ «Транспортные средства» по категоризации «база + модуль».

Карточка перестроена 23.09.2026 под справочник docs/kategorii-ts-baza-modul.xlsx
(данные — app/modules/vehicle/data/tsCatalog.js, собираются скриптом
tools/data/build_ts_catalog.py). Сценарий держит то, что легко сломать правкой:

  * пока не выбран вид объекта и база (или вид машины, модуль), полей машины
    нет — дочернее не показывают до родителя; база недоступна до категории;
  * «Прочее» есть в каждой категории (правило 16 справочника);
  * «Тип ТС, вид кузова» стоит в блоке 02 первым и только предлагает
    категории кнопками — сама категория не ставится (30.09.2026); поиск по
    справочнику находит по всем веткам с путём; «Готово» сворачивает блок;
  * регистрационный учёт стоит перед блоком машины и без собственника (он в
    блоке сторон), адрес — фактический;
  * блок «Автотранспортное средство» разбит на подразделы (общие сведения,
    номера, тип-двигатель-массы, ходовая и трансмиссия, особое для базы,
    дополнительные параметры), внутри — порядок граф свидетельства; номера —
    таблицей;
  * у электромобиля нет рабочего объёма (от топлива зависят поля двигателя);
  * в регистрации нет ИНН собственника (указание пользователя 23.09.2026);
  * «по техпаспорту» — в заголовке блока; у поля с бланка метки нет, где его
    графа (книжка 2019 г. и «КР №») — в подсказке подписи; метка у поля —
    только «осмотр», а у подраздела целиком с осмотра — в его заголовке;
  * дата — «ДД.ММ.ГГГГ» своим полем, в данных ГГГГ-ММ-ДД;
  * VIN не обрезается и не запрещается: короткий заводской номер старой
    машины сохраняется как есть, а несоответствие стандарту — предупреждение;
  * нет ни VIN, ни № кузова, ни № шасси — предупреждение у группы номеров;
  * у базы свои особые поля (у трактора — ходовая флажками);
  * модуль удаляется крестиком в строке (виден без наведения) и кнопкой в
    форме; со сведениями — с подтверждением, пустой — сразу;
  * модули — список с раскрытием: строка — сводка и крестик удаления (одно
    удаление на модуль), щелчок раскрывает и сворачивает; каскад группа →
    модуль, строка следует за полями; привод установки: тип двигателя только
    у своего, объём только у топливного; у модуля своя таблица параметров;
    подсказок «обычно вписывают» нет (указание пользователя 23.09.2026);
  * у самоходной машины и отдельного модуля — свои поля;
  * блок «Фото с осмотра» — две категории, «Машина» и «Модули»; снимок
    открывается в просмотрщике, у которого есть режимы «Фото» и «Сравнение»,
    а в боковой панели — снимки записи (задача пользователя 23.09.2026);
  * наработка и состояние машины — подразделом её блока, пробег у базы;
    у модуля — двигатель установки, объём только у топливного (заметки
    пользователя 30.09.2026);
  * строка разделов: заполненность следует за вводом, список пустых полей
    ведёт к полю; «Для осмотра» прячет регистрацию и поля техпаспорта;
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
    'tools/docs/build_kategorii_ts.py', 'app/kernel/numField.js', 'app/kernel/persist.js', 'app/kernel/treeSearch.js',
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
    # «Тип ТС, вид кузова» — в блоке 02 первым; категорию выбирает человек, запись
    # только предлагает варианты кнопками (указание пользователя 30.09.2026:
    # «откуда ты знаешь, что это грузовик, а не пожарка?»).
    pg.fill('[data-tsf="main|vtype"]', 'специальный, пожарный')
    pg.locator('[data-tsf="main|vtype"]').press('Tab')
    t.wait_for('[data-ts-sug-cat]')
    sug = pg.eval_on_selector_all('[data-ts-sug-cat]', 'els => els.map((e) => e.textContent.trim())')
    t.ck(sug == ['Грузовое', 'Тракторы и специальные шасси'], 'предложения категории не те: %s' % sug)
    t.ck(pg.input_value('[data-ts-cat]') == '', 'категория поставилась сама по записи «Тип ТС»')
    pg.click('[data-ts-sug-cat="Грузовое"]')
    t.wait_for('[data-ts-base]:not([disabled])')
    t.ck(pg.input_value('[data-ts-cat]') == 'Грузовое', 'предложение не поставило категорию')
    pg.fill('[data-tsf="main|vtype"]', 'легковой седан')
    pg.locator('[data-tsf="main|vtype"]').press('Tab')
    t.wait_for('[data-ts-sug-cat="Легковое"]')
    t.ck(pg.input_value('[data-ts-cat]') == 'Грузовое', 'запись «Тип ТС» перебила выбранную категорию')

    # Поиск — помощник над каскадом: находит по всем веткам, у каждого — путь.
    pg.fill('#ts-find-q', 'кран')
    t.wait_for('#ts-find-list [role="option"]')
    paths = pg.eval_on_selector_all('#ts-find-list .tsr-opt', 'els => els.map((e) => e.innerText)')
    joined = ' '.join(paths)
    t.ck('Спецтехника › Подъёмные' in joined and 'Грузозахватные' in joined and 'Специальное многоосное шасси' in joined,
         'поиск нашёл не по всем веткам: %s' % paths)
    pg.locator('#ts-find-q').press('Escape')
    t.ck(pg.locator('#ts-find-list').is_hidden(), 'Escape не закрыл выдачу поиска')
    t.ck(pg.locator('.vehicle-form [data-ts-kind][title]').count() == 0, 'у вариантов вида объекта остались всплывающие подсказки')
    bases = pg.eval_on_selector_all('[data-ts-base] option', 'els => els.map((e) => e.textContent.trim())')
    t.ck('Прочее' in bases, 'в категории нет базы «Прочее»: %s' % bases)
    t.ck(pg.locator('[data-tsf]:not([data-tsf="main|vtype"])').count() == 0, 'поля машины показаны до выбора базы')

    pg.select_option('[data-ts-base]', 'Тяжёлый грузовик (свыше 12 т)')
    t.wait_for('[data-tsf="main|make"]')
    # Выбор сделан — «Готово» сворачивает блок в строку, «Изменить» разворачивает.
    t.ck(pg.locator('[data-ts-about]').count() == 1, 'нет описания выбранной базы под каскадом')
    pg.click('[data-ts-kind-done]')
    t.wait_for('[data-ts-kind-sum]')
    t.ck('Тяжёлый грузовик' in pg.inner_text('[data-ts-kind-sum]'), 'в свёрнутой строке нет выбранной базы')
    pg.click('[data-ts-kind-edit]')
    t.wait_for('[data-ts-cat]')
    heads = pg.eval_on_selector_all('.vehicle-form .card-head h3', 'els => els.map((e) => e.textContent.trim())')
    t.ck(heads[2:] == ['Регистрационный учёт', 'Автотранспортное средство', 'Модули', 'Фото с осмотра'],
         'блоки карточки ТС не те: %s' % heads)

    subs = pg.eval_on_selector_all('.vehicle-form .card:nth-of-type(4) .vh-sub',
                                   'els => els.map((e) => e.firstChild.textContent.trim())')
    t.ck(subs[:4] == ['Общие сведения', 'Номера', 'Двигатель и массы', 'Ходовая и трансмиссия']
         and subs[-2:] == ['Наработка и состояние', 'Дополнительные параметры'], 'подразделы «Машины» не те: %s' % subs)
    # Пробег — в блоке машины (заметка пользователя 30.09.2026 «Пробег к базе»).
    t.ck(pg.locator('.vehicle-form .card:nth-of-type(4) [data-tsf="main|mileage"]').count() == 1,
         'пробег не в блоке машины')

    order = pg.eval_on_selector_all('.vehicle-form .card:nth-of-type(4) .vh-grid [data-ts-key]',
                                    'els => els.map((e) => e.dataset.tsKey)')
    t.ck(order[:3] == ['make', 'year', 'color'] and 'model' not in order,
         'общие сведения не в порядке граф свидетельства: %s' % order[:4])
    nums = pg.eval_on_selector_all('.vh-ntbl [data-ts-key]', 'els => els.map((e) => e.dataset.tsKey)')
    t.ck(nums == ['vin', 'bodyNo', 'chassisNo', 'engineNo'], 'номера не таблицей или не в том порядке: %s' % nums)
    t.ck(pg.locator('[data-tsf="main|ownerInn"], [data-tsf="main|owner"]').count() == 0,
         'в регистрации остался собственник или ИНН — они в блоке сторон')
    # «Где стоит (фактический адрес)» — сведение осмотра: в «Наработке и
    # состоянии», а не в регистрации (развёртка 30.09.2026).
    t.ck(pg.locator('.vh-use [data-tsf="main|factAddr"]').count() == 1, 'фактический адрес не в «Наработке и состоянии»')
    # Дата — «ДД.ММ.ГГГГ» своим полем: точки по ходу набора, лишние цифры не
    # принимаются, в данные — ГГГГ-ММ-ДД; неверная дата — сообщение у поля.
    t.ck(pg.get_attribute('[data-tsf="main|regDate"]', 'placeholder') == 'ДД.ММ.ГГГГ', 'подсказка ввода даты не «ДД.ММ.ГГГГ»')
    pg.focus('[data-tsf="main|regDate"]')
    pg.keyboard.type('01022019777')
    t.ck(pg.input_value('[data-tsf="main|regDate"]') == '01.02.2019', 'дата набралась не так: %s' % pg.input_value('[data-tsf="main|regDate"]'))
    pg.locator('[data-tsf="main|regDate"]').press('Tab')
    t.ck(pg.evaluate(REC)['f'].get('regDate') == '2019-02-01', 'дата не записалась как ГГГГ-ММ-ДД')
    pg.fill('[data-tsf="main|regDate"]', '31.02.2019')
    pg.locator('[data-tsf="main|regDate"]').press('Tab')
    t.ck(pg.locator('[data-tsf="main|regDate"].field-bad').count() == 1, 'несуществующая дата не подсвечена')
    pg.fill('[data-tsf="main|regDate"]', '01.02.2019')
    pg.locator('[data-tsf="main|regDate"]').press('Tab')
    t.ck(pg.locator('[data-tsx-suggest]').count() == 0, 'в карточке остались подсказки «обычно вписывают»')

    # --- строка разделов, пустые поля, режим осмотра (развёртка 30.09.2026) ---------
    def nav_text(key):
        return ' '.join(pg.inner_text('[data-ts-nav="%s"]' % key).split())
    before = nav_text('machine')
    pg.fill('[data-tsf="main|color"]', 'Белый')
    t.wait_until("() => document.querySelector('[data-ts-nav=\"machine\"]').innerText.replace(/\s+/g, ' ') !== %r" % before)
    pg.click('[data-ts-nav="machine"]')
    t.wait_for('[data-ts-miss="machine"]:not([hidden])')
    t.ck(pg.locator('[data-ts-miss="machine"] [data-ts-jump="main|color"]').count() == 0, 'заполненное поле в списке пустых')
    pg.click('[data-ts-miss="machine"] [data-ts-jump="main|vin"]')
    t.wait_until("() => document.activeElement && document.activeElement.dataset.tsf === 'main|vin'")
    t.ck(pg.locator('[data-ts-miss]:not([hidden])').count() == 0, 'список пустых полей не закрылся после перехода')
    pg.click('[data-ts-mode="inspect"]')
    t.wait_for('.vehicle-form.vh-inspect')
    t.ck(pg.locator('[data-ts-block="reg"]').count() == 0 and pg.locator('[data-tsf="main|vin"]').count() == 0,
         'в режиме осмотра видны регистрация или номера')
    t.ck(pg.locator('[data-tsf="main|mileage"]').count() == 1 and pg.locator('[data-tsf="main|wheelFormula"]').count() == 1,
         'в режиме осмотра нет полей осмотра')
    pg.click('[data-ts-mode="all"]')
    t.wait_for('[data-ts-block="reg"]')

    # --- топливо: у электромобиля нет рабочего объёма --------------------------------
    t.ck(pg.locator('[data-tsf="main|engineVolume"]').count() == 1, 'нет рабочего объёма у двигателя')
    pg.select_option('[data-tsf="main|fuel"]', 'Электро')
    t.wait_until("() => !document.querySelector('[data-tsf=\"main|engineVolume\"]')")
    t.ck(pg.locator('[data-tsf="main|power"]').count() == 1, 'у электромобиля нет мощности')
    pg.select_option('[data-tsf="main|fuel"]', 'Бензин')
    t.wait_for('[data-tsf="main|engineVolume"]')

    # Источник: «по техпаспорту» — в заголовке блока; у полей с бланка метки нет,
    # место графы — в подсказке подписи; метка у поля — только «осмотр».
    tip = pg.get_attribute('[data-ts-key="vin"] label', 'title') or ''
    t.ck(pg.locator('[data-ts-key="vin"] .vh-src').count() == 0, 'у VIN осталась метка источника')
    t.ck('2019' in tip and 'КР №' in tip, 'в подсказке к VIN нет места графы на бланках: %r' % tip)
    t.ck(pg.locator('.vehicle-form .vh-src', has_text='ТП').count() == 0, 'в карточке остались метки «ТП»')
    t.ck(pg.locator('[data-ts-key="wheel"] .vh-src', has_text='осмотр').count() == 1, 'у руля нет метки «осмотр»')
    subs_h = pg.eval_on_selector_all('.vehicle-form .vh-sub', 'els => els.map((e) => e.textContent.trim())')
    t.ck(any(x.startswith('Ходовая и трансмиссия') and x.endswith('осмотр') for x in subs_h),
         'у ходовой нет пометки «осмотр» в заголовке подраздела: %s' % subs_h)
    # В «Наработке и состоянии» источник назван в заголовке подраздела — у полей меток нет.
    t.ck(pg.locator('.vh-use .vh-src').count() == 0, 'в «Наработке и состоянии» метки источника у каждого поля')

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
    # Привод установки: тип двигателя — только у своего, объём — только у
    # топливного (развёртка 30.09.2026).
    t.ck(pg.locator('[data-tsf="%s|engineKind"]' % mid).count() == 0, 'тип двигателя установки до выбора привода')
    pg.select_option('[data-tsf="%s|drive"]' % mid, 'Свой двигатель')
    t.wait_for('[data-tsf="%s|engineKind"]' % mid)
    t.ck(pg.locator('[data-tsf="%s|engineVolume"]' % mid).count() == 0, 'объём двигателя до выбора типа')
    pg.select_option('[data-tsf="%s|engineKind"]' % mid, 'Дизель')
    t.wait_for('[data-tsf="%s|engineVolume"]' % mid)
    pg.select_option('[data-tsf="%s|engineKind"]' % mid, 'Электро')
    t.wait_until("() => !document.querySelector('[data-tsf=\"%s|engineVolume\"]')" % mid)
    pg.select_option('[data-tsf="%s|drive"]' % mid, 'От двигателя базы (КОМ)')
    t.wait_until("() => !document.querySelector('[data-tsf=\"%s|engineKind\"]')" % mid)
    t.ck(pg.locator('[data-ts-mform="%s"] .vh-src' % mid).count() == 0, 'у полей модуля остались метки «осмотр»')
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
    cross = pg.locator('[data-ts-mitem="%s"] [data-ts-mdel]' % mid)
    t.ck(float(cross.evaluate('(e) => getComputedStyle(e).opacity')) == 1, 'крестик удаления модуля невидим')
    t.ck(pg.locator('[data-ts-mform="%s"] [data-ts-mdel]' % mid).count() == 0, 'удаление модуля — не только в строке')
    # Щелчок по строке сворачивает раскрытый модуль и раскрывает снова.
    pg.click('[data-ts-mpick="%s"]' % mid)
    t.wait_until("() => !document.querySelector('[data-ts-mform]')")
    pg.click('[data-ts-mpick="%s"]' % mid)
    t.wait_for('[data-ts-mform="%s"]' % mid)
    cross = pg.locator('[data-ts-mitem="%s"] [data-ts-mdel]' % mid)
    cross.click()
    t.wait_for('[data-modal-ok]')
    pg.click('[data-modal-ok]')
    t.wait_until("() => !document.querySelector('[data-ts-mitem]')")
    t.ck(pg.evaluate(REC)['modules'] == [], 'модуль не удалился из записи')
    pg.click('[data-ts-madd]')
    t.wait_for('[data-ts-mdel]')
    # Поиск модуля — помощник над списками: выбор ставит группу и модуль разом.
    t.wait_until("() => document.activeElement && document.activeElement.id === 'ts-mfind-q'")
    pg.keyboard.type('автокран')
    t.wait_for('#ts-mfind-list [role="option"]')
    pg.keyboard.press('Enter')
    t.wait_until("() => { const g = document.querySelector('[data-ts-modgroup]'); return g && g.value === 'Подъёмные'; }")
    t.ck(pg.locator('[data-ts-modkind]').input_value() == 'Автокран', 'поиск модуля не поставил модуль')
    pg.locator('[data-ts-mitem] [data-ts-mdel]').first.click()
    t.wait_for('[data-modal-ok]')
    pg.click('[data-modal-ok]')
    t.wait_until("() => !document.querySelector('[data-ts-mitem]')")
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
    t.ck(heads[2:] == ['Ковш скальный', 'Фото с осмотра'],
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
