# -*- coding: utf-8 -*-
"""Находки сравнения поведения с версией до код-ревью (09.10.2026).

Сравнение двух копий макета одинаковыми сценариями (заполнение всех карточек
всех типов ОЦ и ОИ, документы, статусы, контакты, удаление, архив, ТС) нашло:
  * у земельного участка столбец перечня ОИ стал «Назначение по ТП» вместо
    «Целевое назначение» — при переносе исправления ширин (1e67627) описание
    столбцов взято из нежилого здания целиком;
  * прямой адрес вспомогательной постройки (#/oc/civil/<ОЦ>/oi/<постройка>) —
    ошибка на странице и полуотрисованный экран: своей карточки у постройки
    нет, модуль рисовал несуществующую (старая ошибка, была и до ревью).
"""
NAME = 'находки сравнения с прежней версией'

TOUCHES = ('app/modules/land-plot/card/oiTable.view.js', 'app/modules/civil/index.js',
           'app/modules/apartment/index.js', 'app/modules/land-plot/index.js', 'app/modules/residential-house/index.js')


def run(t):
    pg = t.page
    t.open('#/oc/land-plot/oc-lp-1', wait='.card')
    heads = pg.evaluate("() => [...document.querySelectorAll('th')].map((e) => e.textContent.trim())")
    t.ck('Целевое назначение' in heads and 'Назначение по ТП' not in heads,
         'участок: столбец перечня ОИ подписан не «Целевое назначение»: %s' % heads)

    t.open('#/oc/civil/oc-cv-1', wait='[data-add-oi]')
    pg.evaluate("""() => { const b = [...document.querySelectorAll('[data-add-oi]')]
      .find((x) => x.dataset.addOi === 'Вспомогательная постройка'); if (b) b.click(); }""")
    pg.wait_for_timeout(400)
    aux = pg.evaluate("""async () => { const s = await import('./app/modules/civil/data/store.js');
      const o = s.getRecord('oc-cv-1').oi.find((x) => x.card === 'aux'); return o ? o.id : ''; }""")
    if t.ck(bool(aux), 'у oc-cv-1 нет вспомогательной постройки — проверить адрес не на чем'):
        t.open('#/oc/civil/oc-cv-1/oi/' + aux, wait='.card')
        t.wait_until("() => !location.hash.includes('/oi/')")
        t.ck('/oi/' not in pg.evaluate('location.hash'), 'прямой адрес постройки не вернул в карточку ОЦ')
