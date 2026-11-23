# -*- coding: utf-8 -*-
"""Строки таблиц и очереди не увеличиваются при наведении.

Пользователь 23.11.2026 (снимок «Что осмотрено» с полосой прокрутки): «Из-за полосы ниже у нас перестройка
интерфейса». Строка во всю ширину прокручиваемой таблицы, увеличенная под курсором, выходила за край — появлялась
полоса, экран перестраивался. Отклик строки — подсветка и тень (motion.css, inspections.css).

Что ловит сценарий:
  * наведение на строку «Что осмотрено» (карточка, вкладка «Результаты осмотра») меняет прокрутку таблицы или
    страницы — на двух ширинах;
  * строка очереди регионала увеличивается под курсором;
  * ошибки консоли.
"""
NAME = 'строки таблиц без увеличения при наведении'

TOUCHES = ('app/kernel/motion.css', 'app/pages/inspections/inspections.css', 'app/pages/inspection/results.js')

SCROLL = ("() => { const t = document.querySelector('.ir-nav-tbl'); const f = t.closest('.ir-frame') || t.parentElement;"
          " return [f.scrollWidth - f.clientWidth, document.documentElement.scrollWidth - innerWidth]; }")
# Сетка «Осмотрщики по дням» — выдвижная панель поверх очереди; на время замера её убираем.
QROW = ("() => { document.querySelectorAll('.ip-board').forEach((b) => { b.style.display = 'none'; });"
        " document.querySelector('.ip-tbl tbody tr[data-ip-row]').scrollIntoView({ block: 'center' });"
        " for (const r of document.querySelectorAll('.ip-tbl tbody tr[data-ip-row]')) { const b = r.getBoundingClientRect();"
        " const x = b.left + 40, y = b.top + b.height / 2;"
        " if (y > 0 && y < innerHeight && r.contains(document.elementFromPoint(x, y))) return [x, y]; } return null; }")


def run(t):
    pg = t.page
    for w in (1440, 1280):
        pg.set_viewport_size({'width': w, 'height': 900})
        t.open('#/oc/civil/oc-cv-1?tab=inspection', wait='[data-oc-head]')
        if not t.ck(t.wait_until("() => !!document.querySelector('.ir-nav-tbl tbody tr')"), 'нет таблицы «Что осмотрено»'):
            return
        a = pg.evaluate(SCROLL)
        rows = pg.locator('.ir-nav-tbl tbody tr')
        for i in range(min(rows.count(), 4)):
            rows.nth(i).hover()
            t.ck(t.wait_until("([i]) => document.querySelectorAll('.ir-nav-tbl tbody tr')[i].matches(':hover')", [i]), 'строка %d не под курсором' % i)
            pg.wait_for_timeout(350)  # пружина наведения успевает доиграть — иначе сдвиг не виден
            b = pg.evaluate(SCROLL)
            t.ck(b == a, 'наведение на строку %d меняет прокрутку: %s → %s (ширина %d)' % (i, a, b, w))

        t.open('#/inspections?s=queue', wait='.ip-tbl tbody tr[data-ip-row]')
        pt = pg.evaluate(QROW)
        if t.ck(pt, 'нет видимой строки очереди'):
            pg.mouse.move(pt[0], pt[1])
            pg.wait_for_timeout(350)
            sc = pg.evaluate("([x, y]) => { const r = document.elementFromPoint(x, y).closest('tr'); return [r.matches(':hover'), getComputedStyle(r).scale]; }", pt)
            t.ck(sc[0] and sc[1] in ('none', '1'), 'строка очереди увеличивается: %s' % sc)
