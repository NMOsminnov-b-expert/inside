# -*- coding: utf-8 -*-
"""Гражданское здание: подгруппы помещений литеры (в коде — zones, «зоны»;
в интерфейсе с 25.09.2026 — «подгруппа помещений», указание пользователя).

Задача пользователя 25.09.2026: литеру нужно уметь бить на зоны — части
одного здания разного типа или класса (общежитие и цех из металлоконструкций),
в том числе по площади. Решения пользователя 25.09.2026: делится площадь по
внутреннему обмеру; площади зон вводят руками, при расхождении — предупреждение;
высота у зоны своя; класс литеры — площади по классам.

Сценарий держит:
  * «Разбить литеру на подгруппы помещений» делает две зоны: первая — то, что было у литеры
    (тип, признаки, площадь по внутреннему обмеру, высота), вторая — пустая;
  * у зоны свой тип, свои признаки, своя высота — и свой класс;
  * сверка «Σ площадь подгрупп … из … м²»: «не хватает» / «сходится» / «лишние»;
  * в блоке 01 — типы зон и площади по классам; литера держит тип и класс
    самой большой зоны (их читают перечень и реестр);
  * у производственной зоны появляются производственные доп. параметры;
  * зоны переживают перезагрузку;
  * зоны — аккордеон: раскрыта одна, в заголовке свёрнутой — сводка;
  * чего не хватает для класса — строкой в зоне и отметкой у пустых признаков;
    «По классам» — плашками, зоны без класса одной плашкой и ссылками;
  * убрать зону до одной — литера снова цельная, с признаками оставшейся.
"""

NAME = 'зоны литеры'

TOUCHES = (
    'app/modules/civil/oi/building/*', 'app/modules/civil/module.css', 'app/modules/civil/audit/fieldLabels.js',
)

OC = '#/oc/civil/oc-cv-1'

OI = """async () => {
  const m = await import('/app/modules/civil/data/store.js');
  const oi = m.getRecord('oc-cv-1').oi.find((o) => o.letter === 'А');
  return JSON.parse(JSON.stringify({ zones: oi.zones || null, litKind: oi.litKind, oiCategory: oi.oiCategory,
    capSigns: oi.capSigns, build: (oi.areas || {}).build }));
}"""


def _zone(pg, i):
    return pg.locator('[data-zone]').nth(i)


def _pick_ms(t, zone, key, value):
    pg = t.page
    zone.locator('[data-cap-ms="%s"] [data-ms-toggle]' % key).click()
    zone.locator('[data-cap-opt="%s|%s"]' % (key, value)).check()
    zone.locator('.zn-grp legend').first.click()      # щелчок вне списка закрывает его


def run(t):
    pg = t.page
    pg.set_viewport_size({'width': 1600, 'height': 1000})
    t.open(OC, wait='tr[data-open-oi]')
    pg.locator('tr[data-open-oi]').first.click()
    t.wait_for('#q-capclass')
    before = pg.evaluate(OI)
    t.ck(before['zones'] is None, 'у засеянной литеры уже есть зоны')

    # --- разбить --------------------------------------------------------------
    pg.click('[data-zone-split]')
    t.wait_until("() => document.querySelectorAll('[data-zone]').length === 2")
    st = pg.evaluate(OI)
    z1, z2 = st['zones']
    t.ck(z1['litKind'] == before['litKind'] and z1['capSigns'] == before['capSigns'],
         'первая зона не взяла тип и признаки литеры')
    t.ck(z1['area'] == before['build'], 'первая зона не взяла площадь по внутреннему обмеру: %r' % z1['area'])
    t.ck(not z2['litKind'] and not z2['area'], 'вторая зона не пустая: %r' % z2)
    t.ck('сходится' in pg.inner_text('[data-zones-diff]'), 'до второй зоны сумма не сходится')
    t.ck(pg.locator('#q-gen [data-lit-kind]').count() == 0, 'выбор типа появился в «Общих параметрах»')
    # Аккордеон: раскрыта одна зона — после разбивки вторая, её и заполнять;
    # у свёрнутой в заголовке сводка — тип, площадь, К и класс.
    t.ck(_zone(pg, 1).locator('.zn-body').is_visible() and _zone(pg, 0).locator('.zn-body').is_hidden(),
         'после разбивки раскрыта не вторая зона')
    bar1 = ' '.join(_zone(pg, 0).locator('[data-zone-bar]').inner_text().split())
    t.ck('класс' in bar1 and 'К ' in bar1 and 'м²' in bar1, 'в заголовке первой зоны нет сводки: %r' % bar1)

    # --- вторая зона: производственная, 8,5 м --------------------------------
    z2l = _zone(pg, 1)
    z2l.locator('[data-zone-name]').fill('Цех')
    z2l.locator('[data-zone-area]').fill('300')
    z2l.locator('[data-zone-area]').press('Tab')
    t.wait_until("() => document.querySelector('[data-zones-diff]').textContent.includes('лишние 300')")
    t.ck('warn' in pg.get_attribute('[data-zones-diff]', 'class'), 'перебор площади не выделен')
    z2l.locator('[data-lit-kind="prod"]').click()
    t.wait_until("() => document.querySelectorAll('[data-zone]')[1].querySelector('[data-cap-sign=\"crane\"]')")
    z2l = _zone(pg, 1)
    z2l.locator('[data-zone-height]').fill('8,5')
    z2l.locator('[data-zone-height]').press('Tab')
    t.wait_until("() => document.querySelectorAll('[data-zone]')[1].querySelector('[data-cap-height]').textContent.includes('более 8')")
    # Чего не хватает для класса — видно в самой зоне, у полей; в «По классам»
    # — одна плашка «без класса» и ссылка на зону, не абзац «Зона N: …»
    # (замечание пользователя 25.09.2026).
    miss = _zone(pg, 1).locator('[data-cap-miss]')
    t.ck(miss.is_visible() and 'конструкция' in miss.inner_text().lower(),
         'в зоне не написано, чего не хватает для класса')
    t.ck(_zone(pg, 1).locator('.field.miss').count() >= 3, 'пустые признаки зоны не отмечены')
    t.ck(_zone(pg, 0).locator('[data-cap-miss]').is_hidden(), 'у зоны с классом висит строка «не хватает»')
    dist = pg.inner_text('[data-zones-dist]')
    t.ck('без класса — 1 подгруппа' in dist and 'не хватает' not in dist, '«По классам» не свёрнуто: %r' % dist)
    t.ck(pg.locator('[data-zone-jump]').count() == 1, 'нет ссылки на зону без класса')
    z2l.locator('[data-cap-sign="crane"]').select_option('Да')
    _pick_ms(t, z2l, 'frame', 'Металлокаркасные тёплые')
    _pick_ms(t, z2l, 'floors', 'Простые')
    _pick_ms(t, z2l, 'eng', 'Стандартное')
    t.wait_until("() => document.querySelectorAll('[data-zone]')[1].querySelector('[data-zone-class]').textContent.includes('класс')")
    cls = _zone(pg, 1).locator('[data-zone-class]').inner_text()
    # 1,0 (высота) × 1,0 (кран-балка) × 0,8 × 0,9 × 0,9 = 0,648 → 2 класс
    t.ck(cls == '2 класс', 'класс производственной зоны не тот: %r' % cls)
    t.ck(_zone(pg, 1).locator('[data-cap-miss]').is_hidden() and _zone(pg, 1).locator('.field.miss').count() == 0,
         'после заполнения признаков отметки «не хватает» не ушли')
    t.ck(pg.locator('[data-zone-jump]').count() == 0, 'ссылка на зону осталась, хотя класс есть у всех')
    t.ck(pg.locator('#q-prod').count() == 1, 'у литеры с производственной зоной нет доп. параметров производственного')

    # --- площадь первой зоны уменьшить — сумма сходится ----------------------
    _zone(pg, 0).locator('[data-zone-toggle]').click()
    t.wait_until("() => !document.querySelectorAll('[data-zone] .zn-body')[0].hidden")
    t.ck(_zone(pg, 1).locator('.zn-body').is_hidden(), 'раскрылась первая зона, а вторая не свернулась')
    total = pg.evaluate("() => parseFloat(String(%r).replace(/\\s/g, '').replace(',', '.'))" % before['build'])
    z1l = _zone(pg, 0)
    z1l.locator('[data-zone-area]').fill(('%.2f' % (total - 300)).replace('.', ','))
    z1l.locator('[data-zone-area]').press('Tab')
    t.wait_until("() => document.querySelector('[data-zones-diff]').textContent.includes('сходится')")

    # --- блок 01: типы и площади по классам ----------------------------------
    kinds = pg.inner_text('#q-gen [data-lit-kind-view]')
    t.ck('Гражданская' in kinds and 'Производственно-складская' in kinds and 'подгрупп: 2' in kinds,
         'в блоке 01 не типы зон: %r' % kinds)
    dist = pg.inner_text('#q-gen [data-cap-class]')
    t.ck('Производственно-складская' in dist and '300' in dist, 'в блоке 01 нет площадей по классам: %r' % dist)
    st = pg.evaluate(OI)
    t.ck(st['litKind'] == before['litKind'], 'литера не держит тип самой большой зоны: %r' % st['litKind'])

    # --- перезагрузка ---------------------------------------------------------
    # Класс литеры из подгрупп в записи — от самой большой подгруппы и сразу
    # после загрузки, до открытия литеры: раньше перевод при загрузке считал
    # класс по собственным (пустым) признакам литеры и стирал его, а
    # восстанавливался он только при открытии карточки литеры — перечень и
    # выгрузки до того видели пустой класс (найдено 25.09.2026).
    oi_url = pg.url
    # Собственные признаки литеры — пустые, как у литеры, которую разбили до
    # заполнения признаков: иначе расчёт по ним случайно совпадает с классом
    # большой подгруппы и ошибку не видно.
    pg.evaluate("""async () => { const m = await import('/app/modules/civil/data/store.js');
      const oi = m.getRecord('oc-cv-1').oi.find((o) => o.letter === 'А'); oi.capSigns = {};
      (await import('/app/kernel/persist.js')).saveNow(); }""")
    t.open(OC, wait='tr[data-open-oi]')
    pg.reload()
    t.wait_for('tr[data-open-oi]')
    st = pg.evaluate(OI)
    t.ck(st['oiCategory'] and st['oiCategory'] == before['oiCategory'],
         'после загрузки класс литеры из подгрупп в записи: %r (ожидался %r)' % (st['oiCategory'], before['oiCategory']))
    pg.goto(oi_url)
    t.wait_for('[data-zone]')
    t.ck(pg.locator('[data-zone]').count() == 2, 'зоны не пережили перезагрузку')
    t.ck(_zone(pg, 1).locator('[data-zone-name]').input_value() == 'Цех', 'название зоны не сохранилось')
    t.ck('сходится' in pg.inner_text('[data-zones-diff]'), 'после перезагрузки сумма не сходится')

    # --- убрать зону: литера снова цельная -------------------------------------
    _zone(pg, 1).locator('[data-zone-del]').click()
    t.wait_for('.modal-back [data-modal-ok]')
    pg.click('.modal-back [data-modal-ok]')
    t.wait_until("() => !document.querySelector('[data-zone]')")
    st = pg.evaluate(OI)
    t.ck(st['zones'] is None, 'зоны остались в записи: %r' % st['zones'])
    t.ck(st['litKind'] == before['litKind'] and st['capSigns'] == before['capSigns'],
         'литера не взяла тип и признаки оставшейся зоны')
    t.ck(pg.locator('[data-zone-split]').count() == 1, 'нет кнопки «Разбить литеру на зоны»')
