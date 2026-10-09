# -*- coding: utf-8 -*-
"""Находки сравнения поведения с версией до код-ревью (09.10.2026).

Сравнение двух копий макета одинаковыми сценариями (заполнение всех карточек
всех типов ОЦ и ОИ, документы, статусы, контакты, удаление, архив, ТС) нашло:
  * у земельного участка столбец перечня ОИ стал «Назначение по ТП» вместо
    «Целевое назначение» — при переносе исправления ширин (1e67627) описание
    столбцов взято из нежилого здания целиком;
  * прямой адрес вспомогательной постройки (#/oc/civil/<ОЦ>/oi/<постройка>) —
    ошибка на странице и полуотрисованный экран: своей карточки у постройки
    нет, модуль рисовал несуществующую (старая ошибка, была и до ревью);
  * быстрый уход из карточки ОИ, пока её код ещё грузится, — запоздавшая
    отрисовка рисовала старую карточку поверх нового экрана (корень у всех
    экранов один); найдено на проверках 09.10.2026 (kernel/scope.js destroy,
    kernel/boot.js makeHost);
  * то же внутри модуля: литера одной записи грузится, а человек уже перешёл к
    другой записи — запоздавшая карточка литеры ложилась поверх (номер
    отрисовки в modules/*/index.js);
  * правка литеры, начатая в одном ОИ, открыта и в другом (флаг на модуль, а
    не на ОИ — код-ревью 09.10.2026).
"""
import time
NAME = 'находки сравнения с прежней версией'

TOUCHES = ('app/kernel/scope.js', 'app/kernel/boot.js', 'app/modules/land-plot/card/oiTable.view.js', 'app/modules/civil/index.js',
           'app/modules/apartment/index.js', 'app/modules/civil/oi/building/index.js', 'app/modules/land-plot/index.js', 'app/modules/residential-house/index.js')


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

    # --- уход из карточки ОИ, пока её код грузится --------------------------------------
    def slow(route):
        time.sleep(1.5)
        route.continue_()
    t.open('#/oc/civil/oc-cv-1', wait='tr[data-open-oi]')
    oi = pg.evaluate("""async () => (await import('./app/modules/civil/data/store.js')).getRecord('oc-cv-1')
      .oi.find((o) => o.card === 'building').id""")
    pg.goto(t.base)   # чистая загрузка: модуль карточки ещё не в кэше страницы
    t.wait_for('.reg-tr')
    pg.route('**/app/modules/civil/oi/building/index.js', slow)
    pg.evaluate("(h) => { location.hash = h; }", '#/oc/civil/oc-cv-1/oi/' + oi)
    pg.wait_for_timeout(300)
    pg.evaluate("() => { location.hash = '#/institutions'; }")
    pg.wait_for_timeout(2500)
    pg.unroute('**/app/modules/civil/oi/building/index.js')
    t.ck(pg.evaluate('location.hash') == '#/institutions', 'после ухода адрес не «Учреждения»: %s' % pg.evaluate('location.hash'))
    t.ck(pg.locator('.itree-row').count() > 0 and pg.locator('#content .ctx-plate, #content [data-bld-rights]').count() == 0,
         'запоздавшая карточка ОИ нарисовалась поверх «Учреждений»')

    # --- то же внутри модуля: к другой записи, пока грузится литера ----------------------
    pg.goto(t.base)
    t.wait_for('.reg-tr')
    pg.route('**/app/modules/civil/oi/building/index.js', slow)
    pg.evaluate("(h) => { location.hash = h; }", '#/oc/civil/oc-cv-1/oi/' + oi)
    pg.wait_for_timeout(300)
    pg.evaluate("() => { location.hash = '#/oc/civil/oc-cv-2'; }")
    pg.wait_for_timeout(2500)
    pg.unroute('**/app/modules/civil/oi/building/index.js')
    t.ck(pg.evaluate('location.hash') == '#/oc/civil/oc-cv-2', 'после перехода адрес не oc-cv-2: %s' % pg.evaluate('location.hash'))
    t.ck(pg.locator('#content [data-bld-rights]').count() == 0 and pg.locator('tr[data-open-oi]').count() > 0,
         'запоздавшая карточка литеры прежней записи легла поверх другой записи')

    # --- правка литеры — только у своего ОИ --------------------------------------------
    ids = pg.evaluate("""async () => (await import('./app/modules/civil/data/store.js')).getRecord('oc-cv-1')
      .oi.filter((o) => o.card === 'building').map((o) => o.id)""")
    if t.ck(len(ids) >= 2, 'в oc-cv-1 меньше двух литер — проверить правку литеры не на чем'):
        t.open('#/oc/civil/oc-cv-1/oi/' + ids[0], wait='[data-edit-letter]')
        pg.click('[data-edit-letter]')
        t.ck(t.wait_for('[data-letter-input]'), 'правка литеры не открылась')
        t.open('#/oc/civil/oc-cv-1/oi/' + ids[1], wait='.card')
        t.ck(pg.locator('[data-letter-input]').count() == 0, 'правка литеры перешла на другую литеру')
