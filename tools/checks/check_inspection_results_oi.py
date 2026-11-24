# -*- coding: utf-8 -*-
"""Результаты осмотра недвижимости: что принимает ЦОД, у каждого ОИ, демо — как у осмотрщика.

Аудит этапа 1 (пользователь 23.11.2026): «А где в результатах осмотров посмотреть, собственно а что принимаем? Значения,
фото и т.д... Этого нет... Земельные участки недоработаны»; «на этапе 1 далеко не везде есть результаты осмотра. Не во
всех ОИ»; «демо данные должны соответствовать тому, что РЕАЛЬНО заполняет осмотрщик!»; снимки осмотрщика «должны быть
видны всегда и там и там».

Что ловит сценарий:
  * демо-значения осмотра — не поля схемы осмотрщика (pages/osmotr/params.js) или значения не из её перечней;
  * во вкладке «Результаты осмотра» нет значений, внесённых осмотрщиком по своей схеме (тип участка, сети, санузел…);
  * сверка выбранного ОИ уходит за край экрана; ОИ без осмотра забивают список;
  * в карточке ОИ (участок, литера) нет строки осмотра или «Результаты осмотра» не открывают вкладку на этом ОИ;
  * в фото карточки ОИ нет снимков осмотрщика.
"""
NAME = 'результаты осмотра: значения, у каждого ОИ, демо как у осмотрщика'

TOUCHES = ('app/pages/inspection/results.js', 'app/pages/inspection/results.css', 'app/kernel/inspectionTab.js',
           'app/kernel/inspectionsDemo.js', 'app/kernel/viewer/deps.js', 'app/kernel/viewer/ctrl.js', 'app/pages/osmotr/params.js',
           'app/modules/*/card/ctxPlate.js')

# Все ключи и перечни схемы осмотрщика по виду ОИ; значения демо-результатов — в них.
DEMO = """async () => { const P = await import('./app/pages/osmotr/params.js'); const IR = await import('./app/kernel/inspectionResults.js');
  const R = await import('./app/kernel/registry.js');
  const flat = (o, pre = '') => Object.entries(o || {}).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? flat(v, pre + k + '.') : [[pre + k, v]]));
  const bad = []; let seen = 0;
  for (const r of IR.allResults()) {
    const T = R.getType(r.typeId); const rec = T && T.records.loadRecord(r.ocId); if (!rec) continue;
    for (const [oiId, vals] of Object.entries(r.assets || {})) {
      const oi = (rec.oi || []).find((o) => o.id === oiId) || (rec.id === oiId ? null : null);
      const card = oi ? oi.card : (r.typeId === 'vehicle' ? 'vehicle' : '');
      if (!card || card === 'mech') continue;
      const fields = new Map(P.pwaSections({ card }).flatMap((s) => s.fields).map((f) => [f.key, f]));
      for (const [k, v] of flat(vals)) {
        seen++;
        const f = fields.get(k);
        if (!f) { bad.push(card + ': ' + k); continue; }
        const list = Array.isArray(v) ? v : [v];
        if (f.opts && list.some((x) => !f.opts.includes(x))) bad.push(card + ': ' + k + '=' + v);
      }
    }
  }
  return { seen, bad: [...new Set(bad)].slice(0, 15) }; }"""

SETUP = """async ([ty, want]) => { const R = await import('./app/kernel/registry.js'); const K = await import('./app/kernel/inspections.js');
  const IR = await import('./app/kernel/inspectionResults.js'); const FS = await import('./app/kernel/fieldSchema.js');
  const t = R.getType(ty); const rows = t.records.queryRecords({ filter: {}, offset: 0, limit: 600 }).rows;
  const s = rows.find((x) => { const r = t.records.loadRecord(x.id); return r && (r.oi || []).filter((o) => o.card !== 'mech').length >= 3 && (r.oi || []).some((o) => o.card === want)
    && !K.assignmentsOf(ty, x.id, { live: false }).length && !IR.hasResults(ty, x.id); });
  const rec = t.records.loadRecord(s.id); const oi = rec.oi.find((o) => o.card === want);
  K.assign({ typeId: ty, ocId: s.id, person: 'Айдай', oiIds: [oi.id] });
  const v = IR.valuesOf(ty, s.id, oi.id);
  const vals = want === 'land' ? { landType: 'Сельскохозяйственный', useCategory: 'Богара', irrigation: 'Средняя', soil: 'Серозёмная', form: 'Трапециевидная', note: 'Межа нарушена' }
    : { bathroom: ['Внутри'], sewerage: 'Септик', note: 'Кровля течёт' };
  Object.entries(vals).forEach(([k, x]) => FS.setValue(v, k, x));
  const svg = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="#8ab"/></svg>');
  const r = IR.resultsOf(ty, s.id);
  for (let i = 0; i < 2; i++) r.photos.push({ id: 'chk-' + want + i, name: 'Снимок ' + i, dataUrl: svg, oiId: oi.id, cat: want === 'land' ? 'Земельный участок' : 'Фасад', at: new Date().toISOString(), by: 'Айдай' });
  IR.saveResults(); K.finishWork('Айдай', ty, s.id, true);
  return [s.id, oi.id]; }"""


def run(t):
    pg = t.page
    pg.set_viewport_size({'width': 1440, 'height': 900})
    t.open('#/', wait='.reg-tr')

    # --- демо — как у осмотрщика (все демо-результаты: открыть вкладку, чтобы собрались богатые демо) ---
    d = pg.evaluate(DEMO)
    t.ck(d['seen'] > 0, 'в демо-результатах нет значений осмотра')
    t.ck(not d['bad'], 'демо-значения не по схеме осмотрщика: %s' % d['bad'])

    for ty, want, label, expect in (('land-plot', 'land', 'Тип земельного участка', 'Сельскохозяйственный'),
                                    ('civil', 'building', 'Санузел', 'Внутри')):
        t.open('#/', wait='.reg-tr')
        oc, oi = pg.evaluate(SETUP, [ty, want])
        # --- вкладка ОЦ: значения по схеме осмотрщика, сверка на экране ---
        t.open('#/oc/%s/%s?tab=inspection' % (ty, oc), wait='.ir')
        if pg.locator('.ir-det[data-oi="%s"]' % oi).count() == 0:
            pg.click('[data-ir-sel="%s"]' % oi)
        t.wait_for('.ir-det[data-oi="%s"]' % oi)
        txt = pg.inner_text('.ir-det[data-oi="%s"]' % oi)
        t.ck(label in txt and expect in txt, '%s: во вкладке нет «%s: %s» (значение осмотрщика): %r' % (ty, label, expect, txt[:300]))
        top = pg.evaluate("(id) => document.querySelector('.ir-det[data-oi=\"' + id + '\"] .ir-cmp').getBoundingClientRect().top", oi)
        t.ck(top < 900 - 120, '%s: сверка выбранного ОИ за краем экрана (top=%d)' % (ty, top))
        rows = pg.locator('.ir-nav-tbl tbody tr').count()
        t.ck(rows < 6 and pg.locator('[data-ir-all]').count() == 1, '%s: в «Что осмотрено» ОИ без осмотра не скрыты (%d строк)' % (ty, rows))

        # --- карточка ОИ: строка осмотра и переход во вкладку на этом ОИ ---
        t.open('#/oc/%s/%s/oi/%s' % (ty, oc, oi), wait='.ctx-oi')
        t.ck(t.wait_until("() => !!document.querySelector('.ctx-oi .ir-oistrip')"), '%s: в карточке ОИ нет строки осмотра' % ty)
        strip = pg.inner_text('.ir-oistrip')
        t.ck('Айдай' in strip and 'ждёт приёмки' in strip and 'снимков' in strip, '%s: в строке осмотра не то: %r' % (ty, strip))
        # Снимки осмотрщика — в фото карточки ОИ, категорией «С осмотра».
        if pg.locator('[data-vmode="photo"]').count():
            pg.click('[data-vmode="photo"]')
        t.ck(t.wait_until("() => [...document.querySelectorAll('.vgroup-h')].some((e) => e.textContent.includes('С осмотра'))"), '%s: в фото карточки ОИ нет снимков осмотрщика' % ty)
        pg.click('.ir-oistrip-go')
        t.ck(t.wait_until("(id) => location.hash.includes('tab=inspection') && !!document.querySelector('.ir-det[data-oi=\"' + id + '\"]')", oi),
             '%s: «Результаты осмотра» из карточки ОИ не открыли вкладку на этом ОИ' % ty)
