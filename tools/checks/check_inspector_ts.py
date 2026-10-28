# -*- coding: utf-8 -*-
"""Осмотр ТС у осмотрщика (этап А, запись графа osmotr-ts-na-meste-i-po-snimkam).

Что сторожит сценарий — дефекты, которых нельзя допустить при правке формы,
снимков, выявленного и назначений:

  * форма ТС — только поля «на месте»: появится поле «по снимкам» (состояние,
    КПП, тормоза) — осмотрщик начнёт судить о том, чего не умеет; пропадёт
    раздел модуля — таблички модуля не снимут;
  * рядом с номером — значение из записи ТС и «РАСХОДИТСЯ»; госномер с
    пробелами не должен давать ложного расхождения;
  * отметки «найдено / не найдено» у ТС нет (снята 28.10.2026);
  * адрес на момент осмотра: пустой, свой, подставленный адрес объекта выезда
    (только у ТС внутри недвижимости, у ОЦ «ТС» кнопки нет);
  * место съёмки: есть разрешение — «широта, долгота · ±точность»; нет
    разрешения — снимок без места, без ошибки в консоли;
  * снимки ТС — обычная съёмка осмотрщика (камера, разбор по общим
    категориям), у снимка — место съёмки; обязательных снимков нет,
    «Осмотр завершён» без перечня недостающего и без причины;
  * выявленные ТС: отказ без сведений (ошибка у поля), одно и несколько,
    источник «видел сам» / «со слов» (контакт осмотра или ФИО), снимок и
    документ как единственное сведение, отмена черновика;
  * передача ТС другому осмотрщику: из панели регионала (перечень ОИ) и из
    назначения «объект целиком» (у прежнего — явный перечень остальных ОИ);
    у прежнего ТС из перечня уходит;
  * ТС без адреса в плане дня и списке задач — «Адрес уточняется на месте».
"""
import base64
from urllib.parse import quote

NAME = 'осмотр ТС у осмотрщика'

TOUCHES = (
    'app/pages/inspector/*', 'app/pages/inspections/assignPane.js', 'app/pages/inspections/inspections.js',
    'app/kernel/inspections.js', 'app/kernel/inspectionsDemo.js', 'app/kernel/inspectionResults.js',
    'app/kernel/geoHere.js', 'app/kernel/fieldSchema.js',
    'app/modules/vehicle/inspect.js', 'app/modules/vehicle/card.js', 'app/modules/vehicle/records.js',
    'app/modules/vehicle/data/seed.js', 'app/modules/apartment/data/seed.js', 'app/modules/civil/data/seed.js',
)

PHONE = {'width': 390, 'height': 844}
A = 'Абдылдаев Айсултан Марсович'
B = 'Бабашова Даяна Алтынбековна'
K = 'Карабекова Анара Тариеловна'
M = 'Молчанов Кирилл Витальевич'
# Демо осмотров ТС выдано человеку из сессии (inspectionsDemo.js, me).
ME = 'Осминнов Н.'

PNG = base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAJ0lEQVR4nGP8z8DAwMDAxIAGWBg'
    'YGBgY/jMwMDAw/GdgYGBgYPgPADzWBB0e3n8XAAAAAElFTkSuQmCC')

# Геолокация телефона — подменой: window.__geo = 'ok' | 'deny'.
GEO = """(() => {
  window.__geo = 'ok';
  const geo = {
    getCurrentPosition(ok, bad) {
      const mode = window.__geo;
      setTimeout(() => {
        if (mode === 'ok') ok({ coords: { latitude: 42.8746, longitude: 74.6122, accuracy: 12 }, timestamp: Date.now() });
        else bad({ code: 1, message: 'denied' });
      }, 30);
    },
    watchPosition() { return 0; }, clearWatch() {},
  };
  try { Object.defineProperty(navigator, 'geolocation', { configurable: true, get: () => geo }); } catch (e) {}
})()"""

T = "await import('./app/pages/inspector/tasks.js')"
KI = "await import('./app/kernel/inspections.js')"


def as_(route, who):
    return route + ('&' if '?' in route else '?') + 'as=' + quote(who)


def secs(pg):
    return pg.eval_on_selector_all('.ins-acc-t b', 'els => els.map((e) => e.textContent.trim())')


def val(pg, ty, oc, oi, path):
    return pg.evaluate("""async ([ty, oc, oi, path]) => { const V = (%s).assetValues(ty, oc, oi);
      return path.split('.').reduce((o, k) => (o == null ? o : o[k]), V); }""" % T, [ty, oc, oi, path])


def pick(pg, sel, value):
    pg.evaluate("""([s, v]) => { const el = document.querySelector(s); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }""", [sel, value])


def shoot(t, click_sel, name='s.png'):
    with t.page.expect_file_chooser() as fc:
        t.page.click(click_sel)
    fc.value.set_files([{'name': name, 'mimeType': 'image/png', 'buffer': PNG}])


def run(t):
    pg = t.page
    pg.add_init_script(GEO)
    pg.set_viewport_size(PHONE)

    # --- 0. Демо-результаты (для ручной проверки): КамАЗ — частично заполнен, одно
    # расхождение (госномер), адрес и место; прицеп — «Не найдено»; на oc-cv-1 —
    # два выявленных ТС. Потом сбрасываются: ниже сценарии вносят своё с нуля.
    t.open(as_('#/insp/vehicle/oc-vehicle-d2/object/ts', ME), wait='.ins-acc')
    t.ck('РАСХОДИТСЯ' in pg.inner_text('[data-fs-field="f.plate"] .ins-fs-hint'), 'в демо у КамАЗа нет расхождения госномера')
    t.ck('совпадает' in pg.inner_text('[data-fs-field="f.mileage"] .ins-fs-hint'), 'в демо у КамАЗа пробег не совпал')
    t.ck(pg.input_value('[data-fs-input="ts.addr"]') != '' and '42.875100, 74.604900' in pg.inner_text('[data-ts-where]'), 'в демо у КамАЗа нет адреса или места съёмки')
    t.open(as_('#/insp/civil/oc-cv-1/object', ME), wait='.ins-oi')
    found = pg.eval_on_selector_all('.ins-oi-found .ins-oi-h', 'els => els.map((e) => e.innerText)')
    t.ck(len(found) == 2 and 'видел сам' in found[0] and 'со слов' in found[1], 'в демо нет двух выявленных ТС: %s' % found)
    t.clear_demo_results('vehicle|oc-vehicle-d2', 'vehicle|oc-vehicle-d3', 'civil|oc-cv-1')

    # --- 1. ОЦ «ТС» с модулем: только поля «на месте» -----------------------------
    TS2 = '#/insp/vehicle/oc-vehicle-d2/object/ts'
    t.open(as_(TS2, ME), wait='.ins-acc')
    s = secs(pg)
    t.ck(s[:4] == ['Место осмотра', 'Опознание', 'Показания', 'Видно на месте'], 'разделы ТС не те: %s' % s)
    t.ck('Модуль: Кран-манипулятор (КМУ)' in s and 'Комплектность' in s and 'Комментарии' in s, 'нет раздела модуля или комплектности: %s' % s)
    keys = pg.eval_on_selector_all('[data-fs-field]', 'els => els.map((e) => e.dataset.fsField)')
    bad = [k for k in keys if k.split('.')[-1] in ('state', 'gearbox', 'brakeType', 'trim', 'wheelFormula', 'drive', 'engineKind', 'fuel')]
    t.ck(not bad, 'в форме осмотрщика поля «по снимкам»: %s' % bad)
    t.ck({'f.plate', 'f.vin', 'f.chassisNo', 'f.mileage', 'f.engineHours', 'f.axles', 'm.vm-d2-1.serialNo', 'm.vm-d2-1.hours', 'f.kit'} <= set(keys),
         'нет полей «на месте»: %s' % keys)
    t.ck(pg.locator('[data-ts-addr]').count() == 0, 'у ОЦ «ТС» предложен адрес объекта выезда')
    t.ck('Адрес уточняется на месте' in pg.inner_text('.ins-objinfo'), 'у ТС без адреса не сказано «Адрес уточняется на месте»')
    hint = lambda k: pg.inner_text('[data-fs-field="%s"] .ins-fs-hint' % k)
    t.ck(hint('f.plate') == 'по документам: 02KG200DEM', 'у госномера нет значения по документам: %s' % hint('f.plate'))
    t.ck(hint('f.mileage').startswith('в карточке: 214000 км'), 'у пробега нет значения из карточки: %s' % hint('f.mileage'))
    pg.fill('[data-fs-input="f.plate"]', '02 kg 200 dem')
    t.wait_until("() => /совпадает/.test(document.querySelector('[data-fs-field=\"f.plate\"] .ins-fs-hint').textContent)")
    t.ck('совпадает' in hint('f.plate'), 'госномер с пробелами дал расхождение: %s' % hint('f.plate'))
    pg.fill('[data-fs-input="f.plate"]', '02KG999XYZ')
    t.wait_until("() => /РАСХОДИТСЯ/.test(document.querySelector('[data-fs-field=\"f.plate\"] .ins-fs-hint').textContent)")
    t.ck(pg.locator('[data-fs-field="f.plate"] .ins-fs-hint.warn').count() == 1, 'расхождение госномера не поднято')
    pg.fill('[data-fs-input="f.mileage"]', '215000')
    t.wait_until("() => /РАСХОДИТСЯ/.test(document.querySelector('[data-fs-field=\"f.mileage\"] .ins-fs-hint').textContent)")
    t.ck('+1000 км' in hint('f.mileage'), 'разница пробега не целым числом: %s' % hint('f.mileage'))

    # Адрес: пустой → свой.
    t.ck(not val(pg, 'vehicle', 'oc-vehicle-d2', 'ts', 'ts.addr'), 'адрес на момент осмотра не пуст по умолчанию')
    pg.fill('[data-fs-input="ts.addr"]', 'Стоянка у рынка')
    t.wait_until("async () => ((%s).assetValues('vehicle', 'oc-vehicle-d2', 'ts').ts || {}).addr === 'Стоянка у рынка'" % T)

    # Место: есть разрешение / нет разрешения.
    pg.click('[data-ts-locate]')
    t.ck(t.wait_until("() => /42\\.874600, 74\\.612200 · ±12 м/.test(document.querySelector('[data-ts-where]').textContent)"),
         'место не записано: %s' % pg.inner_text('[data-ts-where]'))
    pg.evaluate("window.__geo = 'deny'")
    pg.click('[data-ts-locate]')
    t.ck(t.wait_until("() => /не определено/.test(document.querySelector('[data-ts-where]').textContent)"), 'без разрешения нет сообщения «не определено»')
    t.ck((val(pg, 'vehicle', 'oc-vehicle-d2', 'ts', 'ts.place') or {}).get('lat') == 42.8746, 'отказ в разрешении стёр записанное место')

    # Снимки: обычная съёмка камерой осмотрщика, заданного перечня нет; место у снимка.
    t.ck(pg.locator('[data-ts-shot], .ins-shotlist').count() == 0, 'у ТС есть перечень снимков по видам')
    t.wait_for('[data-cam-shoot]')
    shoot(t, '[data-cam-shoot]', 'front-noplace.png')
    t.wait_for('.ins-cam-sort [data-cam-sel]')
    pg.click('[data-cam-put="Машина"]')
    t.wait_until("() => !document.querySelector('.ins-cam-sort [data-cam-sel]')")
    pg.evaluate("window.__geo = 'ok'")
    shoot(t, '[data-cam-shoot]', 'back.png')
    t.wait_for('.ins-cam-sort [data-cam-sel]')
    t.ck(t.wait_until("async () => (%s).taskState('vehicle', 'oc-vehicle-d2').photos.some((p) => p.name === 'back.png' && p.place && p.place.acc === 12)" % T),
         'у снимка нет места съёмки')
    t.ck(pg.evaluate("async () => !(%s).taskState('vehicle', 'oc-vehicle-d2').photos.find((p) => p.name === 'front-noplace.png').place" % T),
         'снимок без разрешения получил место')
    pg.click('[data-cam-put="Машина"]')
    t.wait_until("() => !document.querySelector('.ins-cam-sort [data-cam-sel]')")
    # Просмотр снимка — с местом; категории — общие, как у прочих ОИ.
    pg.evaluate("async () => { const p = (%s).taskState('vehicle', 'oc-vehicle-d2').photos.find((x) => x.name === 'back.png'); document.querySelector('[data-cam-list]').click(); await new Promise((r) => setTimeout(r, 200)); document.querySelector('[data-shot=\"' + p.id + '\"]').click(); }" % T)
    t.wait_for('[data-lb-place]')
    t.ck('Место съёмки: 42.874600, 74.612200' in pg.inner_text('[data-lb-place]'), 'в просмотре снимка нет места')
    cats = pg.eval_on_selector_all('[data-move] option', 'els => els.map((e) => e.textContent)')
    # Категории ТС — как в блоке «Фото с осмотра» карточки ТС, без категорий
    # здания (замечание пользователя 28.10.2026).
    t.ck(cats[-4:] == ['Машина', 'Модули', 'Документы на месте', 'Прочее'] and 'Фасад' not in cats, 'категории снимка ТС не те: %s' % cats)
    pg.click('[data-lb-close]')

    # Отметки «найдено / не найдено» нет: для этого — статусы осмотра.
    t.ck(pg.locator('[data-fs-field="ts.found"], [data-fs-field="ts.where"], [data-fs-field="ts.whoSaid"]').count() == 0,
         'у ТС снова отметка «найдено / не найдено»')

    # «Осмотр завершён» — как у прочих осмотров: без перечня недостающего и причины.
    t.open(as_('#/insp/vehicle/oc-vehicle-d2', ME), wait='[data-toggle-done]')
    pg.click('[data-toggle-done]')
    t.ck(t.wait_until("async () => (%s).taskState('vehicle', 'oc-vehicle-d2').done" % T) and pg.locator('[data-done-check]').count() == 0,
         '«Осмотр завершён» потребовал перечня или причины')

    # --- 2. ТС без модуля, прицеп ------------------------------------------------
    t.open(as_('#/insp/vehicle/oc-vehicle-d1/object/ts', ME), wait='.ins-acc')
    t.ck(not any(x.startswith('Модуль:') for x in secs(pg)), 'у ТС без модуля есть раздел модуля: %s' % secs(pg))
    t.ck(pg.locator('[data-fs-field="f.wheel"]').count() == 1, 'у легкового нет руля')
    # Категории снимков у ТС без модулей — без «Модули»; у ОИ-здания — свои.
    cats1 = pg.evaluate("async () => { const T = %s; return [T.photoCatsOf({ card: 'vehicle', vehicle: { modules: [] } }), T.photoCatsOf({ card: 'building' })]; }" % T)
    t.ck(cats1[0] == ['Машина', 'Документы на месте', 'Прочее'] and 'Фасад' in cats1[1], 'категории снимков по виду ОИ не те: %s' % cats1)
    t.open(as_('#/insp/vehicle/oc-vehicle-d3/object/ts', ME), wait='.ins-acc')
    t.ck('мм' in pg.inner_text('[data-fs-field="m.vm-d3-1.dlinaPlatformy"]'), 'у длины платформы нет единицы мм')

    # --- 3. План дня и задачи: ТС без адреса ---------------------------------------
    t.open(as_('#/insp', ME), wait='[data-plan-trips]')
    trips = pg.eval_on_selector_all('[data-trip-key]', 'els => els.map((e) => [e.dataset.tripKey, e.innerText])')
    d2 = [x for x in trips if x[0] == 'vehicle|oc-vehicle-d2']
    d1 = [x for x in trips if x[0] == 'vehicle|oc-vehicle-d1']
    t.ck(d2 and 'Адрес уточняется на месте' in d2[0][1] and 'Ехать' not in d2[0][1], 'ТС без адреса в плане дня: %s' % d2)
    t.ck(d1 and 'Ехать' in d1[0][1], 'ТС с координатами без «Ехать»: %s' % d1)
    t.open(as_('#/insp?tab=tasks', ME), wait='.ins-card-a')
    pg.click('[data-only="0"]')   # d2 уже завершён выше — смотрим «Все мои»
    t.wait_until("() => [...document.querySelectorAll('.ins-card-a')].some((a) => a.getAttribute('href').includes('oc-vehicle-d2'))")
    cards = pg.eval_on_selector_all('.ins-card-a', 'els => els.map((e) => [e.getAttribute("href"), e.innerText])')
    c2 = [x for x in cards if 'oc-vehicle-d2' in x[0]]
    t.ck(c2 and 'Адрес уточняется на месте' in c2[0][1], 'в списке задач у ТС без адреса нет строки: %s' % c2)

    # --- 4. ТС внутри недвижимости: свои ОИ, подстановка адреса --------------------
    t.open(as_('#/insp/civil/oc-cv-1/object', ME), wait='.ins-oi')
    heads = pg.eval_on_selector_all('.ins-oi-t b', 'els => els.map((e) => e.textContent.trim())')
    t.ck(any('Toyota Hilux' in h for h in heads) and len([h for h in heads if h.startswith('Литера') or h.startswith('Строение')]) == 1,
         'у осмотрщика не его ОИ (литера и ТС): %s' % heads)
    t.ck('осматривают другие осмотрщики' in t.text(), 'не сказано, что прочие ОИ у других')
    t.open(as_('#/insp/civil/oc-cv-1/object/oi-cv1-v1', ME), wait='[data-ts-addr]')
    pg.evaluate("window.__geo = 'deny'")
    pg.click('[data-ts-addr]')
    t.ck(t.wait_until("async () => ((%s).assetValues('civil', 'oc-cv-1', 'oi-cv1-v1').ts || {}).addr === 'г. Бишкек, ул. Суюмбаева А., д. 33'" % T),
         'адрес объекта выезда не подставился')
    t.ck(pg.input_value('[data-fs-input="ts.addr"]') == 'г. Бишкек, ул. Суюмбаева А., д. 33', 'подставленный адрес не виден в поле')

    # --- 5. Выявленные ТС ------------------------------------------------------------
    t.open(as_('#/insp/civil/oc-cv-1/object', ME), wait='[data-found-cat]')
    pg.evaluate("window.__geo = 'ok'")
    n0 = pg.evaluate("async () => (%s).foundOi('civil', 'oc-cv-1').length" % T)

    def new_ts():
        pick(pg, '[data-found-cat]', 'ts')
        t.wait_until("() => /Добавить ТС/.test(document.querySelector('[data-found-form]').textContent)")
        pg.click('[data-found-form] button[type=submit]')
        t.wait_for('.ins-fts-new [data-fts-save]')

    # Без сведений — ошибка у поля.
    new_ts()
    pg.fill('.ins-fts-new [data-fts="plate"]', '01KG000NEW')
    pg.click('.ins-fts-new [data-fts-save]')
    t.wait_for('.ins-fts-new [data-fts-err]')
    t.ck('хотя бы одно' in pg.inner_text('.ins-fts-new [data-fts-err]'), 'нет ошибки «хотя бы одно сведение»')
    t.ck(pg.evaluate("async () => (%s).foundOi('civil', 'oc-cv-1').length" % T) == n0, 'пустое ТС сохранилось')
    # Описание, «со слов» — ФИО и телефон.
    pick(pg, '.ins-fts-new [data-fts="kind"]', 'Грузовое')
    pg.fill('.ins-fts-new [data-fts="note"]', 'Самосвал во дворе, номер замазан')
    pg.click('.ins-fts-new [data-fts-src="words"]')
    t.wait_for('.ins-fts-new [data-fts="fio"]')
    pg.fill('.ins-fts-new [data-fts="fio"]', 'Сторож Иванов')
    pg.fill('.ins-fts-new [data-fts="phone"]', '+996 555 000 000')
    pg.click('.ins-fts-new [data-fts-save]')
    t.ck(t.wait_until("async () => (%s).foundOi('civil', 'oc-cv-1').length === %d" % (T, n0 + 1)), 'ТС с описанием не сохранилось')
    f1 = pg.evaluate("async () => (%s).foundOi('civil', 'oc-cv-1').slice(-1)[0]" % T)
    t.ck(f1['card'] == 'vehicle' and f1['vehicle']['category'] == 'Грузовое' and f1['vehicle']['f'].get('plate') == '01KG000NEW'
         and f1['source'].get('kind') == 'words' and f1['source'].get('name') == 'Сторож Иванов', 'сведения ТС не те: %s' % f1)
    # Снимок как единственное сведение, «видел сам».
    new_ts()
    shoot(t, '.ins-fts-new [data-fts-shoot]', 'found-ts.png')
    t.wait_until("() => /Снимки · 1/.test(document.querySelector('.ins-fts-new [data-fts-shoot]').textContent)")
    pg.click('.ins-fts-new [data-fts-save]')
    t.ck(t.wait_until("async () => (%s).foundOi('civil', 'oc-cv-1').length === %d" % (T, n0 + 2)), 'ТС со снимком не сохранилось')
    f2 = pg.evaluate("async () => (%s).foundOi('civil', 'oc-cv-1').slice(-1)[0]" % T)
    t.ck(f2['source'].get('kind') == 'self', 'источник по умолчанию не «видел сам»')
    # Документ как единственное сведение; «со слов» — контакт осмотра.
    pg.evaluate("""async () => { const K = %s; K.contactsOf('civil', 'oc-cv-1').push({ id: 'ct-chk-1', name: 'Завхоз Петров', position: '', phone: '+996 700 1', email: '', note: '' }); K.saveResults(); }""" % T)
    t.open(as_('#/insp/civil/oc-cv-1/object', ME), wait='[data-found-cat]')
    new_ts()
    with pg.expect_file_chooser() as fc:
        pg.click('.ins-fts-new [data-fts-doc]')
    fc.value.set_files([{'name': 'tp.png', 'mimeType': 'image/png', 'buffer': PNG}])
    t.wait_until("() => /Документ · 1/.test(document.querySelector('.ins-fts-new [data-fts-doc]').textContent)")
    pg.click('.ins-fts-new [data-fts-src="words"]')
    t.wait_for('.ins-fts-new [data-fts="contactId"]')
    pick(pg, '.ins-fts-new [data-fts="contactId"]', 'ct-chk-1')
    t.wait_until("() => !document.querySelector('.ins-fts-new [data-fts=\"fio\"]')")
    pg.click('.ins-fts-new [data-fts-save]')
    t.ck(t.wait_until("async () => (%s).foundOi('civil', 'oc-cv-1').length === %d" % (T, n0 + 3)), 'ТС с документом не сохранилось')
    f3 = pg.evaluate("async () => (%s).foundOi('civil', 'oc-cv-1').slice(-1)[0]" % T)
    t.ck(f3['source'].get('contactId') == 'ct-chk-1' and f3['source'].get('label') == 'Завхоз Петров', 'контакт не записан источником: %s' % f3['source'])
    t.ck(pg.evaluate("async ([id]) => (%s).scansOf('civil', 'oc-cv-1').some((x) => x.oiId === id)" % T, [f3['id']]), 'документ не привязан к выявленному ТС')
    t.ck(pg.locator('.ins-oi-found').count() >= 3, 'выявленные ТС не видны в блоке «Выявлено»')
    # Отмена черновика: снимок остаётся без привязки.
    new_ts()
    shoot(t, '.ins-fts-new [data-fts-shoot]', 'cancel.png')
    t.wait_until("() => /Снимки · 1/.test(document.querySelector('.ins-fts-new [data-fts-shoot]').textContent)")
    pg.click('.ins-fts-new [data-fts-cancel]')
    t.wait_until("() => !document.querySelector('.ins-fts-new [data-fts-save]')")
    t.ck(pg.evaluate("async () => (%s).taskState('civil', 'oc-cv-1').photos.find((p) => p.name === 'cancel.png').oiId" % T) == '',
         'снимок отменённого черновика не отвязан')
    t.ck(pg.evaluate("async () => (%s).foundOi('civil', 'oc-cv-1').length" % T) == n0 + 3, 'отменённый черновик сохранился')

    # --- 6. Передача ТС другому осмотрщику ----------------------------------------
    pg.set_viewport_size({'width': 1280, 'height': 900})
    aid = pg.evaluate("async ([p]) => (%s).allAssignments().find((a) => a.ocId === 'oc-cv-1' && a.person === p && a.state === 'assigned').id" % KI, [ME])
    t.open('#/inspections?s=assign&t=assigned&ap=*', wait='[data-ip-row]')
    pg.click('[data-ip-row="%s"]' % aid)
    t.wait_for('[data-ip-ts-pass]')
    pg.click('[data-ip-ts-pass="oi-cv1-v1"]')
    t.wait_for('[data-ip-ts-go]')
    pg.click('[data-ip-ts-go]')
    t.wait_for('.ip-ts-form .ip-err')
    t.ck('Выберите' in pg.inner_text('.ip-ts-form .ip-err'), 'передача без осмотрщика без ошибки')
    pg.select_option('[data-ip-ts-person]', K)
    pg.click('[data-ip-ts-go]')
    t.ck(t.wait_until("async ([p]) => (%s).allAssignments().some((a) => a.ocId === 'oc-cv-1' && a.person === p && a.state === 'assigned' && a.oiIds.join() === 'oi-cv1-v1')" % KI, [K]),
         'ТС не передано Карабековой')
    t.ck(pg.evaluate("async ([id]) => (%s).assignmentById(id).oiIds.join()" % KI, [aid]) == 'oi-cv1-b', 'у прежнего не остался только его ОИ')
    # Назначение «объект целиком» → у прежнего явный перечень.
    res = pg.evaluate("""async ([p, q]) => { const K = %s; const a = K.assign({ typeId: 'civil', ocId: 'oc-cv-1', person: p });
      const b = K.transferOi(a.id, 'oi-cv1-v1', q); return [a.oiIds, b && b.oiIds, b && b.person]; }""" % KI, ['Айдай', M])
    t.ck(res[1] == ['oi-cv1-v1'] and res[2] == M and 'oi-cv1-v1' not in res[0] and 'oi-cv1-a' in res[0] and len(res[0]) == 5,
         'передача из «объект целиком»: %s' % res)
    # У прежнего осмотрщика ТС из перечня ушло.
    pg.set_viewport_size(PHONE)
    t.open(as_('#/insp/civil/oc-cv-1/object', ME), wait='.ins-oi')
    heads = pg.eval_on_selector_all('.ins-oi-t b', 'els => els.map((e) => e.textContent.trim())')
    t.ck(not any(h.startswith('Транспортное средство') for h in heads), 'переданное ТС осталось у прежнего: %s' % heads)
    # Демо: ТС при квартире у другого осмотрщика.
    t.open(as_('#/insp/apartment/oc-ap-2/object', A), wait='.ins-oi')
    t.ck('Honda Fit' not in t.text(), 'у прежнего осмотрщика видно переданное ТС квартиры')
    t.open(as_('#/insp/apartment/oc-ap-2/object', ME), wait='.ins-oi')
    heads = pg.eval_on_selector_all('.ins-oi-t b', 'els => els.map((e) => e.textContent.trim())')
    t.ck(len(heads) == 1 and 'Honda Fit' in heads[0], 'у получившего не только ТС: %s' % heads)

    # Горизонтальной прокрутки нет.
    t.ck(pg.evaluate('() => document.documentElement.scrollWidth <= document.documentElement.clientWidth'), 'экран прокручивается вбок')
