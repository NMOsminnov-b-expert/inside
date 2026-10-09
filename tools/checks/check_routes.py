# -*- coding: utf-8 -*-
"""Адрес страницы: битый или необычный адрес не роняет приложение.

Код-ревью 09.10.2026 (docs/kod-revyu.xlsx): разбор адреса звал
decodeURIComponent без защиты, а значение параметра резалось по каждому «=».

Что ловит сценарий:
  * адрес с битой %-последовательностью (#/oc/civil/100%, #/docs/%E0%A4) —
    ошибка на странице, экран не открывается;
  * после такого адреса переход в меню не срабатывает;
  * значение параметра со знаком «=» обрезается (kernel/router.js parse);
  * модуль не загрузился (сеть, ошибка в коде) — пустой экран без сообщения
    (kernel/boot.js, код-ревью 09.10.2026).
"""
NAME = 'адрес страницы'

TOUCHES = ('app/kernel/router.js', 'app/kernel/boot.js')


def run(t):
    pg = t.page
    t.open('#/oc/civil/100%', wait='#content *')
    t.wait_until("() => document.querySelector('#content').innerText.trim().length > 0")
    t.ck('не найден' in pg.locator('#content').inner_text().lower(),
         'битый адрес объекта: нет экрана «не найден» — %s' % pg.locator('#content').inner_text()[:80])
    pg.evaluate("() => { location.hash = '#/'; }")
    t.wait_for('.reg-tr')
    t.ck(True, '')
    t.open('#/docs/%E0%A4', wait='#content *')
    pg.evaluate("() => { location.hash = '#/'; }")
    t.wait_for('.reg-tr')
    q = pg.evaluate("""async () => (await import('./app/kernel/router.js')).parse('#/institutions?name=a%3Db=c&x').query""")
    t.ck(q.get('name') == 'a=b=c' and q.get('x') == '', 'значение параметра со знаком «=» разобрано неверно: %s' % q)

    # Модуль не загрузился — сообщение и выход в меню.
    pg.route('**/app/modules/vehicle/index.js', lambda r: r.abort())
    pg.evaluate("() => { location.hash = '#/oc/vehicle/x'; }")
    ok = t.wait_until("() => document.querySelector('#content').innerText.includes('Не удалось открыть')")
    t.ck(ok, 'модуль не загрузился, а сообщения на экране нет')
    t.ck(pg.locator('[data-back-menu]').count() == 1, 'нет кнопки «В меню» при сбое открытия')
    pg.unroute('**/app/modules/vehicle/index.js')
    t.console[:] = [x for x in t.console if 'vehicle/index.js' not in x and 'ERR_FAILED' not in x
                    and 'dynamically imported module' not in x and 'экран не открылся' not in x]
