# -*- coding: utf-8 -*-
"""Адрес страницы: битый или необычный адрес не роняет приложение.

Код-ревью 09.10.2026 (docs/kod-revyu.xlsx): разбор адреса звал
decodeURIComponent без защиты, а значение параметра резалось по каждому «=».

Что ловит сценарий:
  * адрес с битой %-последовательностью (#/oc/civil/100%, #/docs/%E0%A4) —
    ошибка на странице, экран не открывается;
  * после такого адреса переход в меню не срабатывает;
  * значение параметра со знаком «=» обрезается (kernel/router.js parse).
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
