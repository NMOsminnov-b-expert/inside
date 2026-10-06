# -*- coding: utf-8 -*-
"""Механизмы и ТС — объекты имущества во всех пяти типах ОЦ, как в гражданском.

Решение пользователя 28.09.2026: «механизмы могут быть в любом ОЦ… аналогично
и ТС… после распространения проверь, чтобы всё совпадало. Эталон — в
гражданском». Сценарий ловит расхождение модулей с эталоном:

  * у имущественного комплекса меню «+ Добавить ОИ» в каждом модуле даёт
    раздел «Движимое имущество» с теми же пунктами, что в гражданском;
  * заведённые механизмы и ТС попадают в раздел «Движимое имущество»
    перечня ОИ, а не к литерам, и не прибавляют площади;
  * форма механизмов и форма ТС в каждом модуле — та же, что в гражданском:
    совпадает «отпечаток» — заголовки блоков и разделов, подписи и поля — и
    до классификации, и после выбора класса (механизмы) или вида и категории
    (ТС);
  * стили формы действуют в каждом модуле (правила ТС были привязаны к
    гражданскому, и в остальных ОЦ форма ТС шла без оформления), а в плашке
    ОИ нет пустого чипа «ЕНИ»;
  * снимок единицы в просмотрщике подписан названием единицы, а не её id
    (catLabel есть не только у гражданского);
  * прежний «movable» производственного (одиночный станок и комплекс-линия)
    переведён в перечень механизмов без потери названия, года, заводского
    номера и узлов.
"""
import base64
import os
import tempfile

NAME = 'механизмы и ТС во всех ОЦ'

TOUCHES = (
    'app/modules/mechanisms/*', 'app/modules/vehicle/oiCard.js', 'app/modules/vehicle/card.js',
    'app/modules/*/oi/registry.js', 'app/modules/*/oi/mech/*', 'app/modules/*/oi/vehicle/*',
    'app/modules/*/card/addOiMenu.js', 'app/modules/*/card/ocCard.ctrl.js',
    'app/modules/*/card/oiTable.view.js', 'app/modules/*/data/rules.js',
    'app/modules/*/parts/photos/*', 'app/modules/*/parts/docs/viewerDeps.js', 'app/kernel/registry.js',
)

MODS = [('civil', 'oc-cv-all'), ('apartment', 'oc-ap-all'), ('residential-house', 'oc-rh-all'),
        ('land-plot', 'oc-lp-all')]

PNG = base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP4z8DwnwEIGP4zMAAAHOgD/U8WqF8AAAAASUVORK5CYII=')

# Отпечаток формы: что видит пользователь — заголовки, разделы, подписи, поля.
PRINT = """() => {
  const root = document.querySelector('.oi-stack');
  if (!root) return null;
  const txt = (e) => (e.firstChild && e.firstChild.nodeType === 3 ? e.firstChild.textContent : e.textContent).trim();
  return {
    heads: [...root.querySelectorAll('.card-head h3')].map((e) => e.textContent.trim()),
    secs: [...root.querySelectorAll('.sec-h')].map(txt),
    labels: [...root.querySelectorAll('label')].map((e) => e.textContent.trim()),
    fields: [...root.querySelectorAll('input, select, textarea, button')].map((e) =>
      [e.tagName, ...[...e.attributes].map((a) => a.name).filter((n) => n.startsWith('data-')).sort()].join(' ')),
    host: [...root.classList].sort().join(' '),
    // Стили — чтобы поймать правила, привязанные к одному модулю (так стили ТС
    // не действовали нигде, кроме гражданского, а отпечаток разметки совпадал).
    styles: ['.vh-seg', '.vehicle-form .grid', '.mu-tbl', '.mu-row', '.mu-grid-class', '.mu-del']
      .map((q) => { const e = root.querySelector(q); if (!e) return q + ': —';
        const c = getComputedStyle(e);
        return [q, c.display, c.gridTemplateColumns, c.height, c.opacity, c.borderTopWidth].join(' | '); }),
    // Кода ЕНИ у механизмов и ТС нет — пустой чип «ЕНИ» в плашке только путал.
    eniChip: !!document.querySelector('.ctx-plate-eni'),
  };
}"""


# Ядро дооформляет выпадающие списки после отрисовки (kernel/dropdown.js,
# data-dd-done): отпечаток снимается, когда оформлены все, — иначе он зависит
# от того, успело ли ядро.
READY = "() => [...document.querySelectorAll('.oi-stack select')].every((e) => e.hasAttribute('data-dd-done'))"


def run(t):
    pg = t.page

    def snap():
        t.wait_until(READY)
        return pg.evaluate(PRINT)
    ref = {}
    path = os.path.join(tempfile.gettempdir(), 'movable-spread.png')
    with open(path, 'wb') as f:
        f.write(PNG)

    for mod, oc in MODS:
        t.open('#/oc/%s/%s' % (mod, oc), wait='[data-dd-toggle]')
        pg.locator('[data-dd-toggle]').first.click()
        t.wait_for('[data-add-oi]')
        items = pg.eval_on_selector_all('[data-add-oi]', 'els => els.map((e) => e.dataset.addOi)')
        t.ck('Механизмы и оборудование' in items and 'Транспортное средство' in items,
             '%s: в меню нет движимого: %s' % (mod, items))
        pg.keyboard.press('Escape')

        area0 = pg.evaluate("""async ([m, id]) => { const r = await import('/app/modules/' + m + '/records.js');
          const s = r.getSummary(id); return s ? s.metrics.area : null; }""", [mod, oc])

        # --- механизмы -------------------------------------------------------------
        if not t.add_oi('Механизмы и оборудование', wait='.mu-stack'):
            t.ck(False, '%s: механизмы не завелись' % mod)
            continue
        fp = {'mech0': snap()}
        pg.select_option('select[data-mu-cls]', 'Энергетическое оборудование')
        t.wait_until("() => !document.querySelector('select[data-mu-sub][disabled]')")
        pg.select_option('select[data-mu-sub]', index=1)
        t.wait_until("() => !!document.querySelector('.mu-params')")
        pg.fill('[data-mu-name]', 'Дизель-генератор проверки')
        fp['mech1'] = snap()

        with pg.expect_file_chooser() as fc:
            pg.locator('[data-mu-photo-add]').click()
        fc.value.set_files(path)
        t.wait_for('.mu-ph')
        pg.locator('.mu-ph').first.click()
        t.wait_until("() => [...document.querySelectorAll('.vtitle')].some((e) => e.textContent.includes('Фото'))")
        titles = pg.locator('.vtitle').all_inner_texts()
        t.ck(any('Дизель-генератор проверки' in x for x in titles),
             '%s: снимок единицы в просмотрщике подписан не названием: %s' % (mod, titles))

        # --- ТС ----------------------------------------------------------------------
        t.open('#/oc/%s/%s' % (mod, oc), wait='[data-dd-toggle]')
        if not t.add_oi('Транспортное средство', wait='.ts-host'):
            t.ck(False, '%s: ТС не завелось' % mod)
            continue
        fp['ts0'] = snap()
        t.wait_for('[data-ts-cat]')
        pg.select_option('[data-ts-cat]', index=1)
        t.wait_until("() => document.querySelectorAll('.ts-host .card-head').length > 2")
        fp['ts1'] = snap()

        # --- перечень ОЦ: раздел «Движимое имущество», площадь не растёт ----------
        t.open('#/oc/%s/%s' % (mod, oc), wait='[data-oi-sub]')
        mov = pg.eval_on_selector_all('[data-oi-sub="movable"] [data-open-oi]',
                                      'els => els.map((e) => e.textContent.replace(/\\s+/g, " ").trim())')
        t.ck(any('Дизель-генератор' in x for x in mov) and any('ТС' in x or 'Движимое · Транспорт' in x for x in mov),
             '%s: механизмы и ТС не в разделе «Движимое имущество»: %s' % (mod, mov[:4]))
        area1 = pg.evaluate("""async ([m, id]) => { const r = await import('/app/modules/' + m + '/records.js');
          const s = r.getSummary(id); return s ? s.metrics.area : null; }""", [mod, oc])
        t.ck(area0 == area1, '%s: движимое изменило площадь записи: %s → %s' % (mod, area0, area1))

        t.ck(not any(fp[k]['eniChip'] for k in fp), '%s: в плашке механизмов или ТС чип «ЕНИ»' % mod)
        if mod == 'civil':
            ref = fp
            continue
        for k in ('mech0', 'mech1', 'ts0', 'ts1'):
            a, b = ref.get(k), fp.get(k)
            # Пустой отпечаток — форма не нарисовалась; совпадение пустых не в счёт.
            full = bool(a and b and a['fields'])
            diff = {f: (a[f], b[f]) for f in a if a[f] != b[f]} if a and b else (a, b)
            t.ck(full and a == b, '%s: форма «%s» не как в гражданском: %s' % (mod, k, str(diff)[:600]))

    # --- прежний «movable» производственного --------------------------------------
    t.open('#/oc/civil/oc-pr-1', wait='[data-oi-sub]')
    got = pg.evaluate("""async () => {
      const r = await import('/app/modules/civil/records.js');
      const rec = r.loadRecord('oc-pr-1');
      const pick = (id) => rec.oi.find((o) => o.id === id);
      const a = pick('oi-pr1-m1'), b = pick('oi-pr1-m2');
      return {
        cards: [a.card, b.card],
        aName: a.mechanisms[0].name, aYear: a.mechanisms[0].year,
        aExtra: a.mechanisms[0].extra.map((f) => f.label + '=' + f.value),
        bGroup: b.groupName, bUnits: b.mechanisms.map((u) => u.name),
      };
    }""")
    t.ck(got['cards'] == ['mech', 'mech'], 'прежний movable не переведён: %s' % got['cards'])
    t.ck(got['aName'] == 'Станок токарный 16К20' and got['aYear'] == '1989',
         'одиночный станок потерял название или год: %s' % got)
    t.ck('Заводской номер=16К20-77412' in got['aExtra'], 'пропал заводской номер: %s' % got['aExtra'])
    t.ck(got['bGroup'] == 'Механизм-комплекс (линия розлива)' and len(got['bUnits']) == 3,
         'комплекс-линия потеряла название или узлы: %s' % got)
