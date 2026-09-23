# -*- coding: utf-8 -*-
"""Карточка ОИ «Транспортное средство» в гражданском здании.

С 23.09.2026 это та же карточка «база + модуль», что у ТС как объекта оценки
(vehicle/card.js), без блока сторон — решение пользователя: «ТС тоже перенеси
внутрь гражданского так же, как и был в ОЦ… блок 01 не требуется». Сценарий
держит то, что легко сломать правкой:

  * ТС добавляется из обоих меню «+ Добавить ОИ» и встаёт в раздел движимого
    имущества перечня; у объекта оценки, который не имущественный комплекс,
    движимого в меню нет (правило пользователя 17.09.2026);
  * карточка начинается с «Вида объекта»: блока сторон и шкалы статусов ТС-ОЦ
    внутри гражданского нет;
  * стили карточки ТС действуют и в гражданском (форма в .ts-host), а на
    механизмы гражданского не влияют — у них тот же класс .mu-table-wrap;
  * каскад категория → база открывает поля машины; госномер хранится в
    верхнем регистре; подпись ОИ в перечне — марка с моделью и госномер;
  * кода ЕНИ у ТС нет — чипа «ЕНИ» в плашке быть не должно;
  * фото «Машина» ложатся в сам объект имущества и видны в просмотрщике;
  * ТС, заведённое прежней карточкой (тип из восьми, марка одним полем,
    параметры по ключам), переводится без потери сведений: марка, госномер,
    VIN — в свои поля, остальное — в дополнительные параметры;
  * заполненное переживает перезагрузку страницы.
"""
import os
import struct
import tempfile
import zlib

NAME = 'карточка ТС'

TOUCHES = (
    'app/modules/civil/oi/vehicle/*', 'app/modules/vehicle/card.js', 'app/modules/vehicle/view.js',
    'app/modules/vehicle/ctrl.js', 'app/modules/vehicle/tsModel.js', 'app/modules/vehicle/module.css',
    'app/modules/civil/oi/registry.js', 'app/modules/civil/data/rules.js', 'app/modules/civil/card/*',
    'app/kernel/boot.js', 'app/kernel/registry.js',
)

OC = '#/oc/civil/oc-cv-1'

def png_file():
    w, h = 4, 4
    raw = b''.join(b'\x00' + b'\x30\x90\xd0' * w for _ in range(h))

    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))
    path = os.path.join(tempfile.gettempdir(), 'check_civil_ts_photo.png')
    open(path, 'wb').write(data)
    return path


REC_OI = """async (name) => {
  const m = await import('/app/modules/civil/data/store.js');
  const rec = m.getRecord('oc-cv-1');
  const oi = rec.oi.find((o) => o.card === 'vehicle' && o.name.startsWith(name));
  return oi ? JSON.parse(JSON.stringify({ name: oi.name, vehicle: oi.vehicle, photos: oi.photos })) : null;
}"""


def run(t):
    pg = t.page

    # --- добавление из меню ----------------------------------------------------
    t.open(OC, wait='[data-add-oi]')
    menus = pg.evaluate("""() => [...document.querySelectorAll('.dd-menu')]
      .map((m) => [...m.querySelectorAll('[data-add-oi]')].map((b) => b.textContent.trim()))
      .filter((list) => list.length)""")
    t.ck(len(menus) >= 2, 'меню добавления ОИ должно быть два: в шапке карточки и в перечне')
    for i, one in enumerate(menus, start=1):
        t.ck('Транспортное средство' in one, 'в меню %d нет «Транспортное средство»: %s' % (i, one))

    before = pg.locator('tr[data-open-oi]').count()
    pg.locator('[data-dd-toggle]').first.click()
    pg.locator('[data-add-oi]', has_text='Транспортное средство').first.click()
    t.wait_until("() => document.querySelectorAll('tr[data-open-oi]').length === %d" % (before + 1))
    t.ck(pg.evaluate("""() => {
      const tr = [...document.querySelectorAll('tr[data-open-oi]')]
        .filter((x) => x.innerText.includes('Движимое · Транспорт')).pop();
      const sub = tr && tr.closest('[data-oi-sub]');
      return !!sub && sub.dataset.oiSub === 'movable';
    }"""), 'ТС стоит не в разделе движимого имущества')

    t.open('#/oc/civil/oc-cv-2', wait='[data-add-oi]')
    plain_items = pg.eval_on_selector_all('[data-add-oi]', 'els => els.map((e) => e.textContent.trim())')
    t.ck('Транспортное средство' not in plain_items,
         'движимое предлагают не у имущественного комплекса: %s' % plain_items)

    # --- новая карточка ----------------------------------------------------------
    t.open(OC, wait='tr[data-open-oi]')
    pg.locator('tr[data-open-oi]', has_text='Новое транспортное средство').first.click()
    t.wait_for('.ts-host .vehicle-form')
    heads = pg.eval_on_selector_all('.ts-host .card-head h3', 'els => els.map((e) => e.textContent.trim())')
    t.ck(heads[:1] == ['Вид объекта'], 'карточка ТС в гражданском начинается не с «Вида объекта»: %s' % heads)
    t.ck(pg.locator('.ts-host .pt-owners, .ts-host [data-pt-add]').count() == 0,
         'в ТС внутри гражданского остался блок сторон')
    plate_chips = ' '.join(pg.locator('.ctx-plate').inner_text().split())
    t.ck('ЕНИ' not in plate_chips, 'в плашке ТС показан чип ЕНИ: %s' % plate_chips)

    # Стили карточки ТС подключены и ограничены формой.
    t.ck(pg.evaluate("() => getComputedStyle(document.querySelector('.ts-host .vh-seg')).display") == 'inline-flex',
         'стили карточки ТС не подключены в гражданском')

    pg.click('[data-ts-kind="base"]')
    t.wait_for('[data-ts-cat]')
    pg.select_option('[data-ts-cat]', 'Легковое')
    t.wait_for('[data-ts-base]:not([disabled])')
    pg.select_option('[data-ts-base]', 'Легковой автомобиль и внедорожник')
    t.wait_for('[data-tsf="main|make"]')
    pg.fill('[data-tsf="main|make"]', 'Lada Niva')
    pg.fill('[data-tsf="main|plate"]', '01kg123abc')
    t.ck(pg.input_value('[data-tsf="main|plate"]') == '01KG123ABC', 'госномер не в верхнем регистре')

    # Фото «Машина» — в самом объекте имущества.
    with pg.expect_file_chooser() as fc:
        pg.click('[data-ts-photo-add="Машина"]')
    fc.value.set_files(png_file())
    t.wait_for('[data-ts-photo-open="Машина|0"]')
    saved = pg.evaluate(REC_OI, 'Lada Niva')
    t.ck(saved is not None and saved['name'] == 'Lada Niva · 01KG123ABC',
         'подпись ОИ не собралась из марки и госномера: %s' % (saved and saved['name']))
    t.ck(saved and (saved['photos'] or {}).get('Машина') == 1, 'фото не легло в объект имущества')
    pg.click('[data-ts-photo-open="Машина|0"]')
    t.wait_for('.vmode-btn.active')
    t.ck('Фото' in pg.inner_text('.vmode-btn.active'), 'фото открылось не в режиме «Фото»')

    # --- перевод ТС прежней карточки --------------------------------------------
    old = pg.evaluate(REC_OI, 'Toyota Hilux')
    names = pg.evaluate("""async () => { const m = await import('/app/modules/civil/data/store.js');
      return m.getRecord('oc-cv-1').oi.filter((o) => o.card === 'vehicle').map((o) => o.name); }""")
    t.ck(old and old['vehicle']['f'].get('plate') == '01KG777ABC',
         'у Toyota Hilux нет госномера в новой карточке: %s / %s' % (names, old and old.get('vehicle')))
    pg.evaluate("""async () => {
      const m = await import('/app/modules/civil/data/store.js');
      const rec = m.getRecord('oc-cv-1');
      rec.oi.push({ id: 'oi-old-ts', card: 'vehicle', name: 'Старое ТС', eni: '', origin: 'manual',
        flags: { entered: true }, vtype: 'Легковая', makeModel: 'ВАЗ 2107', plate: '01KG555AAA',
        vin: 'XTA21070012345678', year: '1999', color: 'Белый', country: '',
        params: { bodyType: 'Седан', engineVolume: '1451', stBody: 'Хорошее' },
        extra: [{ id: 'vx-o1', label: 'Сигнализация', value: 'есть' }], marks: 'Тонировка', comment: '',
        docs: [], photos: { 'Кузов': 2 }, notes: [] });
    }""")
    t.open(OC + '/oi/oi-old-ts', wait='.ts-host .vehicle-form')
    moved = pg.evaluate(REC_OI, 'ВАЗ 2107')
    f = (moved or {}).get('vehicle', {}).get('f', {})
    labels = [r['label'] for r in (moved or {}).get('vehicle', {}).get('extra', [])]
    t.ck(f.get('make') == 'ВАЗ 2107' and f.get('plate') == '01KG555AAA' and f.get('engineVolume') == '1451',
         'сведения прежней карточки не легли в свои поля: %s' % f)
    t.ck(moved and moved['vehicle'].get('category') == 'Легковое', 'тип «Легковая» не дал категорию «Легковое»')
    t.ck('Сигнализация' in labels and 'Особые отметки' in labels,
         'прежние доп. параметры и особые отметки потерялись: %s' % labels)
    t.ck(moved and (moved['photos'] or {}).get('Машина') == 2, 'фото прежних категорий не перешли в «Машину»')

    # --- перезагрузка --------------------------------------------------------------
    t.open(OC, wait='tr[data-open-oi]')
    pg.wait_for_timeout(400)
    pg.reload()
    t.wait_for('tr[data-open-oi]')
    after = pg.evaluate(REC_OI, 'Lada Niva')
    t.ck(after and after['vehicle']['base'] == 'Легковой автомобиль и внедорожник',
         'ТС в гражданском не пережило перезагрузку')
