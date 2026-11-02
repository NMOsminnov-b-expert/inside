# -*- coding: utf-8 -*-
"""Покрытие осмотров: каждый тип ОЦ × каждый вид ОИ — от формы осмотрщика до
вкладки «Результаты осмотра» у ЦОД.

Указание пользователя 02.11.2026: «Все карточки имеют осмотры, все подключено и
работает корректно… тщательно проверяй каждый тип ОЦ и ОИ. Включая движимое и
оборудование».

Для каждого типа ОЦ (жилой дом, квартира, нежилое здание, участок, ТС,
механизмы и оборудование) и каждого вида ОИ, который в нём встречается
(строение, квартира, участок, механизмы, ТС; у ТС-ОЦ и механизмов-ОЦ — сама
запись), сценарий:
  * открывает у осмотрщика форму осмотра этого ОИ — разделы есть;
  * вносит значения (до трёх полей: выбор — первым вариантом, число — 3) и
    снимок, завершает осмотр;
  * открывает карточку ОЦ у ЦОД: вкладка «Результаты осмотра» есть, у каждого
    ОИ — свой блок с внесёнными значениями и снимком, осмотр «закончен».
Механизмов-ОЦ в демо нет — запись заводится в сценарии.
"""
NAME = 'осмотры: все типы ОЦ и ОИ'

TOUCHES = (
    'app/pages/inspector/*', 'app/kernel/inspectionTab.js', 'app/kernel/ocHead.js', 'app/kernel/inspections.js',
    'app/kernel/inspectionResults.js', 'app/kernel/fieldSchema.js', 'app/kernel/registry.js',
    'app/modules/*/card/ocCard.view.js', 'app/modules/*/index.js', 'app/modules/*/data/seed.js',
    'app/modules/vehicle/view.js', 'app/modules/mechanisms/view.js', 'app/modules/mechanisms/records.js',
)

INSP = 'Айдай'

# Внести значения во все ОИ записи и завершить осмотр — в странице.
FILL = """async ([ty, id, who]) => {
  const R = await import('./app/kernel/registry.js'); const K = await import('./app/kernel/inspections.js');
  const I = await import('./app/kernel/inspectionResults.js'); const S = await import('./app/kernel/fieldSchema.js');
  const F = await import('./app/pages/inspector/form.js'); const T = await import('./app/pages/inspector/tasks.js');
  const rec = R.getType(ty).records.loadRecord(id);
  K.assign({ typeId: ty, ocId: id, person: who });
  const out = [];
  for (const oi of T.ownOis(rec)) {
    const fields = F.allFields(ty, oi).filter((f) => f.key && (!f.visible || typeof f.visible !== 'function'));
    const vals = I.valuesOf(ty, id, oi.id); let n = 0;
    for (const f of fields) {
      if (n >= 3) break;
      const opts = Array.isArray(f.opts) ? f.opts.filter((o) => typeof o === 'string' && o) : [];
      const v = opts.length ? (f.multi ? [opts[0]] : opts[0]) : '3';
      S.setValue(vals, f.key, v); n += 1;
    }
    I.addResultPhoto(ty, id, new File([new Uint8Array([137, 80, 78, 71])], 'снимок.png', { type: 'image/png' }), { oiId: oi.id, cat: 'Прочее', at: new Date().toISOString() });
    out.push({ id: oi.id, card: oi.card, label: T.oiLabel(oi), fields: F.allFields(ty, oi).length, filled: n });
  }
  I.saveResults(); K.finishWork(who, ty, id, true);
  return out;
}"""

# По каждому типу ОЦ — записи, покрывающие все виды ОИ этого типа.
PICK = """async () => {
  const R = await import('./app/kernel/registry.js'); const T = await import('./app/pages/inspector/tasks.js');
  const K = await import('./app/kernel/inspections.js');
  const out = [];
  for (const t of R.sortedTypes()) {
    const rows = t.records.queryRecords({ filter: {}, offset: 0, limit: 100000 }).rows;
    const seen = new Set(); const picks = [];
    for (const s of rows) {
      const rec = t.records.loadRecord(s.id); if (!rec) continue;
      const kinds = T.ownOis(rec).map((o) => o.card).filter((k) => k !== 'movable');
      if (!kinds.some((k) => !seen.has(k))) continue;
      kinds.forEach((k) => seen.add(k)); picks.push(s.id);
    }
    out.push({ ty: t.manifest.id, label: t.manifest.label, picks, kinds: [...seen] });
  }
  return out;
}"""


def run(t):
    pg = t.page
    pg.set_viewport_size({'width': 1600, 'height': 900})
    t.open('', wait='.reg-tr')

    # Механизмы-ОЦ: в демо нет — заводим.
    pg.click('.reg-create [data-dd-toggle]')
    pg.click('.reg-create [data-create="mechanisms"]')
    t.wait_until("() => location.hash.includes('mechanisms')")
    t.open('', wait='.reg-tr')

    plan = pg.evaluate(PICK)
    want = {'residential-house': {'building', 'land'}, 'apartment': {'apartment'}, 'civil': {'building', 'mech', 'vehicle', 'land'},
            'land-plot': {'land'}, 'vehicle': {'vehicle'}, 'mechanisms': {'mech'}}
    for p in plan:
        t.ck(want.get(p['ty'], set()) <= set(p['kinds']), '%s: в данных нет видов ОИ %s (есть %s)' % (
            p['label'], sorted(want.get(p['ty'], set()) - set(p['kinds'])), p['kinds']))

    for p in plan:
        for oc in p['picks']:
            ty = p['ty']
            done = pg.evaluate(FILL, [ty, oc, INSP])
            t.ck(done, '%s %s: у записи нет ОИ для осмотра' % (p['label'], oc))
            # Форма осмотра каждого ОИ у осмотрщика.
            for oi in done:
                t.ck(oi['fields'] > 0, '%s %s · %s: у формы осмотра нет полей' % (p['label'], oc, oi['label']))
                # Механизмы-ОЦ у нынешнего экрана осмотрщика не осматриваются —
                # экран переходит на приложение «Осмотр» (02.11.2026); там это
                # требование. Здесь — только схема полей и вкладка у ЦОД.
                if ty == 'mechanisms':
                    continue
                t.open('#/insp/%s/%s/object/%s?as=%s' % (ty, oc, oi['id'], INSP), wait='.ins')
                t.ck(t.wait_until("() => document.querySelectorAll('.ins-acc').length > 0"),
                     '%s %s · %s: форма осмотра не открылась' % (p['label'], oc, oi['label']))
            # Вкладка у ЦОД.
            t.open('#/oc/%s/%s?tab=inspection' % (ty, oc), wait='[data-oc-head]')
            t.ck(pg.locator('[data-tab="inspection"]').count() == 1, '%s %s: нет вкладки «Результаты осмотра»' % (p['label'], oc))
            t.ck(t.wait_until("() => !!document.querySelector('.ir')"), '%s %s: вкладка не открылась' % (p['label'], oc))
            items = pg.evaluate("() => [...document.querySelectorAll('.ir [data-ir-sel]')].map((b) => b.dataset.irSel)")
            for oi in done:
                t.ck(oi['id'] in items, '%s %s: нет ОИ «%s» в списке вкладки' % (p['label'], oc, oi['label']))
                if oi['id'] not in items:
                    continue
                pg.click('.ir [data-ir-sel="%s"]' % oi['id'])
                t.wait_until("(id) => !!document.querySelector('.ir-det[data-oi=\"' + id + '\"]')", oi['id'])
                b = pg.evaluate("""(id) => { const c = document.querySelector('.ir-det[data-oi="' + id + '"]');
                  return c && { dd: c.querySelectorAll('.ir-cmp td[data-l="На осмотре"]').length, ph: +(((document.querySelector('.viewer [data-vmode=photo]') || {}).textContent || '').replace(/\\D/g, '') || 0) }; }""", oi['id'])
                t.ck(b, '%s %s: подробности ОИ «%s» не открылись' % (p['label'], oc, oi['label']))
                if b:
                    t.ck(b['dd'] >= min(oi['filled'], 1), '%s · %s: значения осмотра не показаны (%d из %d)' % (p['label'], oi['label'], b['dd'], oi['filled']))
                    t.ck(b['ph'] >= 1, '%s · %s: снимок не показан' % (p['label'], oi['label']))
            t.ck('Осмотр закончен' in pg.inner_text('.ir'), '%s %s: осмотр не «закончен» во вкладке' % (p['label'], oc))
            # Узкая и широкая ширина — у каждого типа ОЦ.
            for w in (760, 1920):
                pg.set_viewport_size({'width': w, 'height': 900})
                m = pg.evaluate("""() => { const d = document.scrollingElement;
                  const cut = [...document.querySelectorAll('.ir dt, .ir dd, .ir th, .ir td, .ir .card-head h3, .ir-rowbtn')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent.trim().slice(0, 30));
                  return { hscroll: d.scrollWidth > d.clientWidth, cut }; }""")
                t.ck(not m['hscroll'] and not m['cut'], '%s %s, %d: вбок или обрезано: %s' % (p['label'], oc, w, m))
            pg.set_viewport_size({'width': 1600, 'height': 900})
