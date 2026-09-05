# -*- coding: utf-8 -*-
"""Строение описывается одинаково во всех типах объекта оценки.

Одна и та же литера-строение заводится в любом ОЦ, но карточка у каждого модуля
своя, и наборы полей разъезжались. Сверка 04.09.2026 нашла девять расхождений;
решения пользователя по ним:

  * права на строение — заводим везде (были в трёх типах из пяти);
  * износ конструктивных элементов — распространяем, с заметкой о том, что вид
    износа ещё обсуждается;
  * категория ОИ (сгруппированный справочник классов) — распространяем;
  * лоджии, балконы и террасы — нужны всем, включая производственное и участок;
  * «Тип строения» (дом · пристройка · гараж…) — распространяем; название
    освободилось после переименования buildType в «Расположение строения»;
  * внутренние стены и арендные площади по этажам — распространяем (05.09.2026):
    одно и то же гражданское здание описывалось полнее, если заведено в
    гражданском ОЦ, и беднее — если в квартирном или участке.

Намеренно оставлено расхождением: категория ОИ против назначения по техпаспорту
у ключа catClass — состав полей у нежилых типов другой по делу.

Отдельное правило про ЖИЛОЙ ДОМ (решение пользователя 05.09.2026): у него нет
ни «Категории ОИ» с классами капитальности, ни блока «Площади и стоимость
аренды по этажам» — и то и другое описывает нежилые здания. Правило действует во
всех пяти типах ОЦ; у гражданского и производственного строения оба элемента
остаются. Сценарий сторожит обе стороны сразу, иначе очередное «выравнивание»
карточек вернуло бы поля жилому дому.
"""
NAME = 'строение единообразно'

ROUTES = {
    'квартира': '#/oc/apartment/oc-ap-1',
    'жилой дом': '#/oc/residential-house/oc-rh-1',
    'гражданское': '#/oc/civil/oc-cv-1',
    'производственное': '#/oc/production/oc-pr-1',
    'участок': '#/oc/land-plot/oc-lp-1',
}

# Что должно быть в карточке строения в ЛЮБОМ типе ОЦ.
MUST = [
    ('[data-bld-rights]', 'права на строение'),
    ('[data-bld-rights-other]', 'ручной ввод права «Иное»'),
    ('[data-oi-category]', 'категория ОИ'),
    ('[data-wear]', 'износ конструктивных элементов'),
    ('.al', 'лоджии, балконы и террасы'),
    ('[data-struct-field="wallsInt"]', 'внутренние стены'),
    ('[data-rent-add]', 'площади и стоимость аренды по этажам'),
]

# Что должно появляться у строения с производственным назначением — в любом ОЦ.
MUST_PROD = [
    ('#q-prod', 'блок доп. параметров производственного строения'),
    ('[data-prod-height]', 'высота по техпаспорту'),
    ('[data-prod-frame]', 'конструктив'),
    ('[data-prod-floors]', 'полы по несущей способности'),
    ('[data-prod-crane]', 'кран-балка'),
    ('[data-temp-field]', 'температурный режим'),
    ('[data-struct-strength]', 'усиленность конструкции'),
]

LABELS = r"""() => [...document.querySelectorAll('.oi-stack .field > label')]
  .map((e) => e.textContent.replace(/\s+/g, ' ').replace('*', '').trim())"""


def _add(t, kind='Гражданское здание'):
    pg = t.page
    pg.locator('[data-dd-toggle]').first.click()
    t.wait_for('[data-add-oi]')
    item = pg.locator('[data-add-oi="%s"]' % kind)
    if not item.count():
        return False
    item.first.click()
    # Ждём признак карточки ОИ, а не .card-idx: номера блоков есть и у карточки
    # объекта оценки, поэтому по ним ожидание проходит, не дождавшись перехода.
    return t.wait_for('.oi-stack') and t.wait_for('[data-status]')


def run(t):
    pg = t.page

    for oc, route in ROUTES.items():
        t.open(route, wait='[data-open-oi]')
        t.wait(300)
        if not t.ck(_add(t), 'в %s не заводится строение' % oc):
            continue

        for sel, what in MUST:
            t.ck(pg.locator(sel).count() > 0, 'в %s у строения нет: %s' % (oc, what))

        labels = pg.evaluate(LABELS)

        # Подписи одного и того же поля должны совпадать во всех типах ОЦ.
        t.ck('Расположение строения' in labels,
             'в %s поле расположения подписано иначе: %s' % (oc, labels[:6]))
        t.ck('Общая по правоустанавливающим документам, м²' in labels,
             'в %s площадь по ПУД подписана сокращением' % oc)

        # «Тип строения» — только у вспомогательной литеры, зато во всех ОЦ.
        t.ck('Тип строения' not in labels,
             'в %s «Тип строения» показан у основного строения' % oc)
        pg.select_option('[data-status]', 'Вспомогательное')
        t.wait_for('[data-structure-kind]')
        t.ck(pg.locator('[data-structure-kind]').count() == 1,
             'в %s у вспомогательного строения нет «Типа строения»' % oc)

        kinds = pg.eval_on_selector_all(
            '[data-structure-kind] option', 'els => els.map((e) => e.textContent.trim())')
        t.ck(len(kinds) >= 10, 'в %s перечень типов строения короткий: %s' % (oc, kinds))

    # --- производственное назначение открывает свой блок в любом ОЦ ---
    #
    # Производственное строение заводится в любом объекте оценки, а описать его
    # было нечем в трёх типах из пяти: блок доп. параметров жил только в
    # гражданском и производственном, а температурный режим с усиленностью —
    # вообще только в производственном (правка 05.09.2026, эталон — он же).
    for oc, route in ROUTES.items():
        t.open(route, wait='[data-open-oi]')
        t.wait(300)
        if not t.ck(_add(t, 'Производственное строение'),
                    'в %s не заводится производственное строение' % oc):
            continue
        for sel, what in MUST_PROD:
            t.ck(pg.locator(sel).count() > 0,
                 'в %s у производственного строения нет: %s' % (oc, what))

    # --- жилой дом: без класса капитальности и без аренды по этажам ---
    for oc, route in ROUTES.items():
        t.open(route, wait='[data-open-oi]')
        t.wait(300)
        if not t.ck(_add(t, 'Жилой дом'), 'в %s не заводится жилой дом' % oc):
            continue

        t.ck(pg.locator('[data-oi-category]').count() == 0,
             'в %s у жилого дома показан класс капитальности' % oc)
        t.ck('аренды по этажам' not in pg.locator('.oi-stack').inner_text(),
             'в %s у жилого дома показан блок аренды по этажам' % oc)
        t.ck(pg.locator('[data-rescat]').count() == 1,
             'в %s у жилого дома пропала категория жилого строения' % oc)

        # Убранный блок не должен оставлять дырку в нумерации: номер занимает
        # тот блок, который отрисовался (kernel/blockIndex.js).
        idxs = pg.eval_on_selector_all('.oi-stack .card-idx',
                                       'els => els.map((e) => e.textContent.trim())')
        t.ck(idxs == ['%02d' % (i + 1) for i in range(len(idxs))],
             'в %s номера блоков жилого дома идут с пропуском: %s' % (oc, idxs))

    # --- раскладка блока материалов и износа одинакова везде ---
    #
    # Замечание пользователя 05.09.2026 «износ съехал»: в квартире и жилом
    # здании раздел износа вместе с «Особенностями» был завёрнут в лишний
    # `.grid g-2`, и девять полей сжимались в половину ширины карточки, тогда
    # как в остальных модулях шли на всю. Сторожим числом: сетка износа должна
    # занимать почти всю ширину блока, и колонок в ней должно быть столько же,
    # сколько у соседей.
    WEAR_LAYOUT = r"""() => {
      const h = [...document.querySelectorAll('.oi-stack .sec-h')]
        .find((e) => e.textContent.includes('Износ'));
      if (!h) return null;
      const grid = h.parentElement.querySelector('.grid');
      const pad = grid.closest('.card-pad');
      return {
        cols: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        share: grid.getBoundingClientRect().width / pad.getBoundingClientRect().width,
        note: !!h.querySelector('.dev-note'),
      };
    }"""

    layouts = {}
    for oc, route in ROUTES.items():
        t.open(route, wait='[data-open-oi]')
        t.wait(300)
        if not _add(t):
            continue
        got = pg.evaluate(WEAR_LAYOUT)
        if not t.ck(got, 'в %s нет раздела износа' % oc):
            continue
        layouts[oc] = got

        t.ck(got['share'] > 0.95,
             'в %s сетка износа занимает %d%% ширины блока вместо всей'
             % (oc, round(got['share'] * 100)))
        t.ck(got['note'],
             'в %s у раздела износа нет заметки о том, что вид ещё обсуждается' % oc)

    cols = {oc: l['cols'] for oc, l in layouts.items()}
    t.ck(len(set(cols.values())) <= 1,
         'колонок в износе по-разному: %s' % cols)


    check_block_styles(t)

# --- оформление блоков одинаково во всех модулях -------------------------
#
# Стили карточек живут в module.css КАЖДОГО модуля — styles/app.css в app.html
# не подключён вовсе. Поэтому правка оформления, сделанная в одном месте, до
# остальных не доходит: так и получилось со скруглением шапки блока (заливка
# цветной разметки была прямоугольной и срезала скруглённый угол).
def check_block_styles(t):
    pg = t.page

    STYLES = """() => {
      const out = [];
      document.querySelectorAll('.oi-stack .card').forEach((c) => {
        const cs = getComputedStyle(c);
        const h = c.querySelector('.card-head');
        const idx = c.querySelector('.card-idx');
        out.push({
          block: cs.borderRadius,
          stripe: cs.borderLeftWidth,
          head: h ? getComputedStyle(h).borderRadius : null,
          idx: idx ? getComputedStyle(idx).borderRadius : null,
        });
      });
      return out;
    }"""

    seen = {}
    for oc, route in ROUTES.items():
        t.open(route, wait='[data-open-oi]')
        t.wait(300)
        if not _add(t):
            continue

        rows = pg.evaluate(STYLES)
        t.ck(bool(rows), 'в %s не нашёл блоков карточки' % oc)

        for r in rows:
            t.ck(r['head'] and r['head'] != '0px',
                 'в %s заливка шапки блока не скруглена: %s' % (oc, r['head']))
            t.ck(r['stripe'] == '4px',
                 'в %s цветная полоса блока другой толщины: %s' % (oc, r['stripe']))
            t.ck(r['idx'] == '5px',
                 'в %s метка номера блока другого скругления: %s' % (oc, r['idx']))

        # Между модулями оформление должно совпадать до пикселя.
        key = (rows[0]['block'], rows[0]['head'], rows[0]['stripe'], rows[0]['idx'])
        seen.setdefault(key, []).append(oc)

    t.ck(len(seen) == 1,
         'оформление блоков различается между типами ОЦ: %s'
         % {str(k): v for k, v in seen.items()})
