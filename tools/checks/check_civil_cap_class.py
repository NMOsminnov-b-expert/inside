# -*- coding: utf-8 -*-
"""Гражданское здание: вид литеры и класс капитальности.

Решения пользователя 23.09.2026 (граф: decision:civil-kategorii-liter-i-ts):
при создании заводится просто «Здание», вид литеры — гражданская,
производственно-складская или прочие — указывают внутри карточки по фото; от
вида зависят признаки класса и доп. параметры; класс ОИ — класс
капитальности, его считает система по методике файла «Классы литер-помещений»
(коэффициенты перемножаются, при нескольких вариантах — среднее, класс по
карманам); высота берётся из «Высоты по внутренним замерам». Сценарий ловит:

  * в меню «+ Добавить ОИ» один пункт «Здание», без «Гражданского здания» и
    «Производственного строения»;
  * у нового здания вид не выбран, класс пишет, чего не хватает;
  * признаки класса — свои у каждого вида; высота не выбирается, а следует за
    числом из замеров, и класс пересчитывается без перерисовки;
  * посчитанный класс совпадает с методикой на примере из файла пользователя
    («Нежилое помещение (Склады)»: 3–5 м, кран-балка не установлена, блочные по
    ж/б каркасу без утепления, простые полы, минимальное оснащение — 0,287 —
    четвёртый класс);
  * прочие постройки — без признаков, класс «Прочие постройки…»;
  * смена вида с заполненными признаками предупреждает, что скроется;
  * литеры прежнего образца (вид в catClass, признаки в доп. параметрах)
    переводятся при загрузке;
  * вид, признаки и класс переживают перезагрузку.
"""

NAME = 'класс капитальности'

TOUCHES = (
    'app/modules/civil/oi/building/*', 'app/modules/civil/data/rules.js', 'app/modules/civil/data/seed.js',
    'app/modules/civil/card/ocCard.ctrl.js', 'app/modules/civil/index.js', 'app/modules/civil/module.css',
    'app/kernel/fieldsPreview.js', 'app/kernel/persist.js',
)

OC = '#/oc/civil/oc-cv-1'

OI = """async (id) => {
  const m = await import('/app/modules/civil/data/store.js');
  const oi = m.getRecord('oc-cv-1').oi.find((o) => o.id === id);
  return oi ? JSON.parse(JSON.stringify({ litKind: oi.litKind, capSigns: oi.capSigns, oiCategory: oi.oiCategory,
    catClass: oi.catClass, purposeFact: oi.purposeFact })) : null;
}"""


def _new_building(t):
    pg = t.page
    t.open(OC, wait='tr[data-open-oi]')
    before = set(pg.eval_on_selector_all('tr[data-open-oi]', 'els => els.map((e) => e.dataset.openOi)'))
    pg.locator('[data-dd-toggle]').first.click()
    t.wait_for('[data-add-oi]')
    items = pg.eval_on_selector_all('.dd-menu [data-add-oi]', 'els => [...new Set(els.map((e) => e.textContent.trim()))]')
    pg.locator('[data-add-oi="Здание"]').first.click()
    t.wait_until("() => document.querySelectorAll('tr[data-open-oi]').length === %d" % (len(before) + 1))
    new = [x for x in pg.eval_on_selector_all('tr[data-open-oi]', 'els => els.map((e) => e.dataset.openOi)')
           if x not in before][0]
    pg.locator('tr[data-open-oi="%s"]' % new).first.click()
    t.wait_for('[data-lit-kind]')
    return items, new


def _pick_ms(t, key, value):
    pg = t.page
    pg.click('[data-cap-ms="%s"] [data-ms-toggle]' % key)
    t.wait_for('[data-cap-ms="%s"] .ms-drop:not([hidden])' % key)
    pg.locator('[data-cap-opt="%s|%s"]' % (key, value)).check()
    pg.click('.card-head h3 >> nth=0')


def run(t):
    pg = t.page

    items, oid = _new_building(t)
    t.ck('Здание' in items and 'Гражданское здание' not in items and 'Производственное строение' not in items,
         'в меню не один пункт «Здание»: %s' % items)
    t.ck(pg.locator('[data-lit-kind].on').count() == 0, 'у нового здания вид литеры выбран сам')
    t.ck('тип объекта имущества' in pg.inner_text('[data-cap-class]'),
         'класс нового здания не говорит, чего не хватает: %r' % pg.inner_text('[data-cap-class]'))
    # Выбор типа — в блоке «Тип и класс капитальности» (решение пользователя
    # 25.09.2026), в «Общих параметрах» — только показ пары «тип | класс».
    t.ck(pg.locator('#q-gen [data-lit-kind]').count() == 0, 'выбор типа остался в «Общих параметрах»')
    t.ck(pg.locator('#q-capclass [data-lit-kind]').count() == 3, 'в блоке класса нет выбора типа')
    t.ck('Не выбран' in pg.inner_text('#q-gen [data-lit-kind-view]'), 'в «Общих параметрах» не показан невыбранный тип')
    t.ck(pg.locator('#q-capclass [data-cap-sign], #q-capclass [data-cap-ms]').count() == 0, 'признаки класса показаны до выбора типа')

    # --- производственно-складская: пример из файла пользователя ------------
    pg.click('[data-lit-kind="prod"]')
    t.wait_for('#q-capclass')
    t.ck(pg.locator('#q-prod').count() == 1, 'у производственной литеры нет доп. параметров')
    keys = pg.eval_on_selector_all('#q-capclass [data-cap-sign], #q-capclass [data-cap-ms]',
                                   'els => els.map((e) => e.dataset.capSign || e.dataset.capMs)')
    t.ck(keys == ['crane', 'frame', 'floors', 'eng'], 'признаки производственной литеры: %s' % keys)
    t.ck('Нет высоты' in pg.inner_text('[data-cap-height]'), 'высота показана без замеров')

    hint = pg.locator('[data-height="int"]')
    hint.fill('4')
    pg.locator('[data-height="ext"]').click()
    t.wait_until("() => document.querySelector('[data-cap-height]').textContent.includes('3–5')")
    _pick_ms(t, 'frame', 'Блочные по железобетонному каркасу, без утепления')
    _pick_ms(t, 'floors', 'Простые')
    _pick_ms(t, 'eng', 'Отсутствует или минимальное')
    # Кран-балка не выбрана — «Не установлено» по умолчанию (методика).
    t.wait_until("() => document.querySelector('[data-cap-class]').textContent.includes('Четвертого')")
    saved = pg.evaluate(OI, oid)
    t.ck(saved and saved['oiCategory'] == 'prod-4', 'класс по методике не prod-4: %s' % (saved and saved['oiCategory']))
    # Расчёт виден: коэффициент у каждого признака и формула — это первое
    # здание объекта оценки 1 из примера методологии (К 0,29, произв класс 4).
    kc = ' '.join(pg.inner_text('#q-capclass [data-kc] .kc-formula').split())
    t.ck(kc == 'К = 0,60 × 0,95 × 0,70 × 0,90 × 0,80 = 0,287 → 4 класс', 'формула К не та: %r' % kc)
    coef = ' '.join(pg.inner_text('#q-capclass [data-sign="frame"] [data-sign-k]').split())
    t.ck(coef == '× 0,70', 'у конструкции не тот коэффициент: %r' % coef)
    t.ck(pg.locator('#q-capclass .kc-band.on').inner_text().startswith('4 класс'), 'на шкале выделен не 4 класс')
    # Два варианта конструкции — среднее: (0,7 + 1) / 2 даёт 0,35 → третий класс.
    _pick_ms(t, 'frame', 'Блочные по железобетонному каркасу, утеплённые')
    t.wait_until("() => document.querySelector('[data-cap-class]').textContent.includes('Третьего')")

    # --- смена вида с заполненными признаками — предупреждение --------------
    pg.click('[data-lit-kind="civil"]')
    t.wait_for('.modal-head')
    t.ck(pg.locator('.modal-head').count() == 1, 'смена вида прошла без предупреждения')
    pg.locator('[data-modal-ok]').first.click()
    t.wait_for('[data-lit-kind="civil"].on')
    keys = pg.eval_on_selector_all('#q-capclass [data-cap-sign], #q-capclass [data-cap-ms]',
                                   'els => els.map((e) => e.dataset.capSign || e.dataset.capMs)')
    t.ck(keys == ['arch', 'constr', 'plan', 'finish', 'eng'], 'признаки гражданской литеры: %s' % keys)
    t.ck(pg.locator('#q-prod').count() == 0, 'у гражданской литеры остались доп. параметры производственной')
    t.ck('2,6–3,2' not in pg.inner_text('[data-cap-height]') and '3,2–4' in pg.inner_text('[data-cap-height]'),
         'у гражданской литеры высота 4 м не в диапазоне 3,2–4: %r' % pg.inner_text('[data-cap-height]'))
    saved = pg.evaluate(OI, oid)
    t.ck(saved and saved['capSigns'].get('frame'), 'признаки прежнего вида стёрлись при смене')

    # --- прочие ---------------------------------------------------------------
    pg.click('[data-lit-kind="other"]')
    if pg.locator('.modal-head').count():
        pg.locator('[data-modal-ok]').first.click()
    t.wait_for('[data-lit-kind="other"].on')
    t.ck('Прочие постройки' in pg.inner_text('[data-cap-class]'), 'у прочих не класс «Прочие постройки»')
    t.ck(pg.locator('#q-capclass [data-cap-sign], #q-capclass [data-cap-ms]').count() == 0,
         'у прочих показаны признаки класса')
    pg.select_option('[data-purpose-fact]', 'Навес')

    # --- засеянные литеры и перевод прежних ------------------------------------
    adm = pg.evaluate(OI, 'oi-cv1-a')
    t.ck(adm and adm['litKind'] == 'civil' and adm['oiCategory'] == 'admin-3',
         'у административного здания не гражданская литера третьего класса: %s' % adm)
    pg.evaluate("""async () => {
      const m = await import('/app/modules/civil/data/store.js');
      const rec = m.getRecord('oc-cv-1');
      const a = rec.oi.find((o) => o.id === 'oi-cv1-a');
      rec.oi.push({ ...JSON.parse(JSON.stringify(a)), id: 'oi-old-prod', name: 'Старый склад', litKind: undefined,
        capSigns: undefined, catClass: 'Производственно-складское', prodFrame: 'Металлокаркасные тёплые',
        prodFloors: 'Не усиленные', craneBeam: 'Есть' });
      delete rec.oi[rec.oi.length - 1].litKind;
      delete rec.oi[rec.oi.length - 1].capSigns;
    }""")
    t.open(OC, wait='tr[data-open-oi]')
    pg.reload()
    t.wait_for('tr[data-open-oi]')
    old = pg.evaluate(OI, 'oi-old-prod')
    t.ck(old and old['litKind'] == 'prod' and old['catClass'] == '',
         'литера прежнего образца не стала производственной: %s' % old)
    t.ck(old and old['capSigns'] == {'frame': ['Металлокаркасные тёплые'], 'floors': ['Простые'], 'crane': 'Да'},
         'признаки прежних доп. параметров не перешли: %s' % (old and old['capSigns']))

    after = pg.evaluate(OI, oid)
    t.ck(after and after['litKind'] == 'other' and after['oiCategory'] == 'other' and after['purposeFact'] == 'Навес',
         'вид, класс и назначение по факту не пережили перезагрузку: %s' % after)
