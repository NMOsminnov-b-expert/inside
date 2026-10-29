# -*- coding: utf-8 -*-
"""Навигация по разделу «Осмотры»: адрес вида, «Назад», «Перейти» (Ctrl+K).

Разбор UI/UX раздела (запись графа razbor-ui-ux-razdela-osmotry…, пункты
3.1–3.5; просьба пользователя 12.10.2026 «нужна быстрая навигация по всему
разделу (быстрый переход к таблице например). Сейчас оно крайне запутанно»).

Что ловит сценарий:
  * переход по разделам и подразделам не меняет адрес — «Назад» браузера
    уводит из раздела, ссылкой на вид не поделиться;
  * «Назад» и «Вперёд» не возвращают прежний вид;
  * открытие по ссылке (адрес с видом) показывает не тот вид;
  * Ctrl+K не ставит в поле «Перейти»; ввод не находит таблицу, осмотрщика,
    объект по ЕНИ; Enter не переходит; Esc не закрывает список;
  * табличный вид — со списком осмотрщиков сбоку (таблица — не во всю ширину);
  * ряды разделов уезжают лентой вбок на узком экране;
  * в консоли ошибки.
"""

NAME = 'навигация по осмотрам'

TOUCHES = ('app/pages/inspections/*', 'app/kernel/router.js')


def run(t):
    pg = t.page
    t.open('#/inspections', wait='[data-ip-section]')
    pg.click('[data-ip-section="people"]')
    t.ck(t.wait_until("() => location.hash.includes('s=people')"), 'раздел «Осмотрщики» не попал в адрес: %s' % pg.evaluate('location.hash'))

    # Ctrl+K → «табл» → Enter: таблица во всю ширину, вид — в адресе
    pg.keyboard.press('Control+KeyK')
    t.ck(t.wait_until("() => document.activeElement && document.activeElement.matches('[data-ip-jump]')"), 'Ctrl+K не поставил в поле «Перейти»')
    pg.keyboard.type('табл')
    t.wait_for('.ip-jump-list:not([hidden]) li.hi')
    t.ck('Таблица осмотрщиков' in pg.locator('.ip-jump-list li.hi').inner_text(), '«табл» — первой строкой не таблица: %s' % pg.locator('.ip-jump-list li.hi').inner_text())
    pg.keyboard.press('Enter')
    t.ck(t.wait_for('.kg td[data-r="0"]'), '«Перейти» не открыл таблицу')
    t.ck('t=table' in pg.evaluate('location.hash'), 'табличный вид не попал в адрес: %s' % pg.evaluate('location.hash'))
    # Замечание пользователя 12.10.2026 «в таблице косяк»: закреплённая шапка
    # таблицы ложилась поверх списка «Перейти».
    pg.click('[data-ip-jump]')
    t.wait_for('.ip-jump-list:not([hidden]) li')
    hidden = pg.evaluate("""() => { const ul = document.querySelector('.ip-jump-list'); const r = ul.getBoundingClientRect(); let n = 0;
      for (let y = r.top + 4; y < r.bottom - 4; y += 12) for (let x = r.left + 4; x < r.right - 4; x += 30) { if (!ul.contains(document.elementFromPoint(x, y))) n++; } return n; }""")
    t.ck(hidden == 0, 'список «Перейти» перекрыт таблицей: %s точек' % hidden)
    pg.keyboard.press('Escape')
    t.ck(pg.locator('.ip-peoplesec.ip-wide').count() == 1 and pg.locator('aside.ip-people').count() == 0,
         'табличный вид — со списком осмотрщиков сбоку')
    table_hash = pg.evaluate('location.hash')

    # Переход к осмотрщику по фамилии и подразделу
    name = pg.locator('.kg td[data-r="0"][data-c="0"]').inner_text().strip()
    pg.click('[data-ip-jump]')
    pg.keyboard.type(name.split()[0] + ' марш')
    t.wait_for('.ip-jump-list:not([hidden]) li.hi')
    pg.keyboard.press('Enter')
    t.ck(t.wait_until("() => location.hash.includes('t=route') && location.hash.includes('p=')"), 'переход «<фамилия> маршрут» не открыл маршрут осмотрщика: %s' % pg.evaluate('location.hash'))

    # «Назад» — к таблице, «Вперёд» — к маршруту
    pg.go_back()
    t.ck(t.wait_until("(h) => location.hash === h", table_hash), '«Назад» не вернул к таблице: %s' % pg.evaluate('location.hash'))
    t.ck(t.wait_for('.kg td[data-r="0"]'), '«Назад» не показал таблицу')
    pg.go_forward()
    t.ck(t.wait_until("() => location.hash.includes('t=route')"), '«Вперёд» не вернул к маршруту')
    t.ck(t.wait_for('[data-ip-ptab="route"][aria-selected="true"]'), '«Вперёд» — адрес маршрута, а подраздел не тот')

    # Открытие по ссылке
    t.open('#/inspections?s=assign&t=assigned', wait='[data-ip-section]')
    pg.reload()
    t.wait_for('[data-ip-section]')
    t.ck(t.wait_for('[data-ip-section="people"][aria-selected="true"]'), 'по ссылке открыт не раздел «Осмотрщики и назначения»')
    t.ck(t.wait_for('[data-ip-team="assigned"][aria-selected="true"]'), 'по ссылке открыт не подраздел «Назначено»')

    # Объект по ЕНИ — в общем списке «Все назначения»
    pg.click('[data-ip-aperson="*"]')
    t.wait_for('[data-ip-row]')
    eni = pg.evaluate("""() => { const re = /\\d[\\d-]{6,}\\d/; const el = [...document.querySelectorAll('[data-ip-row]')].find((r) => re.test(r.innerText));
      return el ? el.innerText.match(re)[0] : ''; }""")
    if t.ck(bool(eni), 'в «Назначено» не нашлось ЕНИ для поиска'):
        pg.click('[data-ip-jump]')
        pg.keyboard.type(eni[:8])
        t.wait_for('.ip-jump-list:not([hidden]) li')
        t.ck(eni[:8] in pg.locator('.ip-jump-list').inner_text(), '«Перейти» не нашёл объект по ЕНИ %s' % eni)
        pg.keyboard.press('Escape')
        t.ck(t.wait_until("() => document.querySelector('.ip-jump-list').hidden"), 'Esc не закрыл список «Перейти»')

    # Узкий экран: ряды переносятся, страница вбок не прокручивается
    pg.set_viewport_size({'width': 760, 'height': 900})
    t.open('#/inspections?s=people&t=table', wait='.kg')
    over = pg.evaluate("() => [...document.querySelectorAll('.ip-sections, .ip-subtabs')].filter((e) => e.scrollWidth > e.clientWidth + 1).length")
    t.ck(over == 0, 'ряд разделов уезжает вбок на 760 px')
    t.ck(pg.evaluate('() => document.documentElement.scrollWidth <= innerWidth'), 'страница прокручивается вбок на 760 px')
