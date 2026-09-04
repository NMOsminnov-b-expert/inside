# -*- coding: utf-8 -*-
"""Номера блоков карточек идут подряд, без пропусков.

Номера расставлялись руками при вызове блока, и после каждого переноса блоков
разъезжались: у строения в квартирном ОЦ шли 01·02·03·04·06, у гражданского
01…05·07, у участка 01·02·03·05. Последний номер считался от индекса блока
документов, которого в карточке давно нет.

Пропущенный номер человек читает как пропавший блок — именно так дефект и был
замечен (пользователь 04.09.2026: «отсутствие блока 05 в производственном
строении внутри квартиры»). Теперь номер выдаёт счётчик по порядку отрисовки
(kernel/blockIndex.js), и разойтись с составом он не может — но состав зависит
от вида ОИ и типа ОЦ, поэтому проверяем все сочетания.
"""
NAME = 'нумерация блоков'

ROUTES = {
    'квартира': '#/oc/apartment/oc-ap-1',
    'жилой дом': '#/oc/residential-house/oc-rh-1',
    'гражданское': '#/oc/civil/oc-cv-1',
    'производственное': '#/oc/production/oc-pr-1',
    'участок': '#/oc/land-plot/oc-lp-1',
}

KINDS = ['Жилой дом', 'Производственное строение', 'Гражданское здание',
         'Квартира', 'Земельный участок']

NUMS = """() => [...document.querySelectorAll('.oi-stack .card .card-idx')]
  .map((e) => e.textContent.trim())"""


def _add(t, kind):
    pg = t.page
    pg.locator('[data-dd-toggle]').first.click()
    t.wait_for('[data-add-oi]')
    item = pg.locator('[data-add-oi="%s"]' % kind)
    if not item.count():
        return False
    item.first.click()
    return t.wait_for('.oi-stack') and t.wait_for('.card-idx')


def _check_row(t, oc, kind, note=''):
    nums = t.page.evaluate(NUMS)
    want = ['%02d' % (i + 1) for i in range(len(nums))]
    t.ck(bool(nums), 'в %s у «%s» нет ни одного номера блока' % (oc, kind))
    t.ck(nums == want,
         'в %s у «%s»%s номера с пропуском: %s' % (oc, kind, note, ' '.join(nums)))


def run(t):
    pg = t.page

    for oc, route in ROUTES.items():
        for kind in KINDS:
            t.open(route, wait='[data-open-oi]')
            t.wait(300)
            if not _add(t, kind):
                continue

            _check_row(t, oc, kind)

            # У участка состав блоков зависит от типа: сельхоз-характеристики
            # против инженерных сетей. Номера должны идти подряд в обоих.
            if kind == 'Земельный участок' and pg.locator('[data-land-type]').count():
                for land_type in ('Сельскохозяйственный', 'Несельскохозяйственный'):
                    pg.select_option('[data-land-type]', land_type)
                    t.wait(700)
                    _check_row(t, oc, kind, ' (%s)' % land_type.lower())
