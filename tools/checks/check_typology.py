# -*- coding: utf-8 -*-
"""Тип нежилого здания по внутренней площади.

Решение пользователя 28.09.2026 (граф: tipizaciya-oc-po-vnutrenney-ploschadi):
три типа литер — гражданская, производственно-складская, прочие; тип
учитывается, если его доля во внутренней площади не меньше 28⅓ % (треть минус
допуск 5 %); один учтённый — ОЦ этого типа, два — пара, три — «Смешанное».
Рассчитанный тип заменяет выбор типа ОЦ: в шапке, в реестре объектов и в
фильтре «Тип ОЦ». Сценарий держит:

  * правило порогов на примерах пользователя (70/20/10, 45/45/10, 34/33/33) и
    на краях: ровно 28⅓ %, одна литера, ни одной с типом;
  * литеры и подгруппы без типа в расчёт не входят, но считаются;
  * шапка ОЦ показывает рассчитанный тип, сводная — полосу долей;
  * смена типа литеры меняет тип ОЦ;
  * фасет «Тип ОЦ» реестра делит нежилые здания по рассчитанному типу, и
    фильтр по нему отбирает только их.
"""

NAME = 'тип нежилого здания'

TOUCHES = (
    'app/modules/civil/card/typology.js', 'app/modules/civil/card/capSummary.view.js',
    'app/modules/civil/card/ocCard.view.js', 'app/modules/civil/records.js',
    'app/modules/civil/data/query.js', 'app/pages/ocMenu/*', 'app/kernel/ocHead.js',
)

CASES = [
    # (гражданская, производственная, прочие, без типа) → тип
    ((70, 20, 10, 0), 'Гражданское'),
    ((45, 45, 10, 0), 'Гражданское, производственное'),
    ((34, 33, 33, 0), 'Смешанное'),
    ((60, 30, 10, 0), 'Гражданское, производственное'),
    ((10, 20, 70, 0), 'Прочие'),
    ((0, 60, 40, 0), 'Производственное, прочие'),
    ((100, 0, 0, 2), 'Гражданское'),
    ((0, 0, 0, 3), ''),
]


def run(t):
    pg = t.page
    t.open('#/oc/civil/oc-cv-all', wait='[data-typology]')

    got = pg.evaluate("""async (cases) => {
      const m = await import('/app/modules/civil/card/typology.js');
      const rows = ([c, p, o, none]) => [
        ...[['civil', c], ['prod', p], ['other', o]].filter(([, a]) => a).map(([kind, area]) => ({ kind, area })),
        ...Array.from({ length: none }, () => ({ kind: '', area: 50 })),
      ];
      const out = cases.map(([areas]) => { const t = m.typologyOf(rows(areas)); return [t.label, t.untyped]; });
      // Край: доля ровно 28⅓ % учитывается.
      const edge = m.typologyOf([{ kind: 'civil', area: 100 - m.THRESHOLD }, { kind: 'prod', area: m.THRESHOLD }]);
      return { out, edge: edge.label };
    }""", [list(c) for c in CASES])
    for (areas, want), (label, untyped) in zip(CASES, got['out']):
        t.ck(label == want, '%s → «%s», ждали «%s»' % (areas, label, want))
        t.ck(untyped == areas[3], '%s: без типа %s, ждали %s' % (areas, untyped, areas[3]))
    t.ck(got['edge'] == 'Гражданское, производственное', 'ровно 28⅓ %% не учтено: %s' % got['edge'])

    # --- карточка: шапка и сводная -----------------------------------------------
    head = pg.locator('.head-meta .hm').first.inner_text()
    t.ck('Производственное' in head, 'в шапке не рассчитанный тип: %s' % head)
    t.ck(pg.locator('[data-typology] .ty-seg').count() >= 2, 'нет полосы долей')

    # Смена типа литеры «Гражданское здание» на производственный: прочих 48 м²
    # мало, гражданских не остаётся — «Производственное» остаётся, а при смене
    # производственной на гражданскую тип становится гражданским.
    pg.evaluate("""async () => {
      const m = await import('/app/modules/civil/records.js');
      const rec = m.loadRecord('oc-cv-all');
      rec.oi.filter((o) => o.card === 'building' && o.litKind === 'prod').forEach((o) => { o.litKind = 'civil'; });
    }""")
    # Переход по хэшу, а не перезагрузка: правка выше живёт в памяти вкладки.
    pg.evaluate("location.hash = '#/oc/civil/oc-cv-1'")
    t.wait_until("() => location.hash.endsWith('oc-cv-1') && !!document.querySelector('[data-typology]')")
    pg.evaluate("location.hash = '#/oc/civil/oc-cv-all'")
    t.wait_until("() => location.hash.endsWith('oc-cv-all') && !!document.querySelector('[data-typology]')")
    t.wait(300)
    head = pg.locator('.head-meta .hm').first.inner_text()
    t.ck('Гражданское' in head, 'после смены типа литеры тип ОЦ не пересчитан: %s' % head)

    # --- реестр: фасет и фильтр ---------------------------------------------------
    pg.evaluate("location.hash = '#/'")
    t.wait_for('.reg-thead')
    res = pg.evaluate("""async () => {
      const q = await import('/app/pages/ocMenu/query.js');
      const f = q.facetsAll({});
      const keys = Object.keys(f.typeId).filter((k) => k.startsWith('civil'));
      const rows = q.queryAll({ filter: { typeId: ['civil:Гражданское'] }, limit: 500 }).rows;
      return { keys, ids: rows.map((r) => r.id), types: [...new Set(rows.map((r) => r.typeLabel))] };
    }""")
    t.ck(res['keys'] and all(k.startswith('civil:') for k in res['keys']),
         'фасет «Тип ОЦ» не делит нежилые здания по типу: %s' % res['keys'])
    t.ck(res['types'] == ['Гражданское'], 'фильтр по типу отобрал чужие: %s' % res['types'])
    t.ck('oc-cv-all' in res['ids'], 'пересчитанный ОЦ не попал под фильтр своего типа')
