# -*- coding: utf-8 -*-
"""Числовое поле: выражение, десятичный разделитель, разряды.

Поле принимает то, что человек набирает по-своему, и приводит к одному виду
(требование пользователя 17.09.2026: «7*6 -> 42, 2/3 -> 0,66, .4 -> 0,4,
,4 -> 0,4, 12000 -> 12 000»). Сценарий держит это поведение:

  * выражение считается по уходу фокуса и по Enter, а не по ходу набора —
    иначе поле правит человека посреди набора;
  * пока набирают выражение, маска разрядов не вмешивается: «7*600» не должно
    превращаться в кашу, а ошибка количества не должна загораться на «3*»;
  * «.4» и «,4» дают ноль целых, как бы ни набрали разделитель;
  * разряды стоят и по ходу набора, и после ухода фокуса;
  * целая величина (количество штук) остаётся без дробной части;
  * посчитанное уходит в данные, а не только на экран;
  * делить на ноль нечем: выражение остаётся в поле человеку на правку.
"""

NAME = 'числовое поле'

TOUCHES = (
    'app/kernel/numField.js', 'app/kernel/fmt.js',
    'app/modules/civil/oi/mech/*', 'app/modules/civil/oi/building/*',
)

MECH = '#/oc/civil/oc-cv-1/oi/oi-cv1-m1'


def run(t):
    pg = t.page

    def plain(v):
        """Текст поля без привязки к виду пробела-разделителя разрядов."""
        return v.replace(' ', ' ').replace(' ', ' ').replace(' ', ' ')

    def typed(sel, text):
        """Набрать в поле и уйти из него. Возвращает (в поле при наборе, после)."""
        el = pg.locator(sel)
        el.click()
        pg.keyboard.press('Control+a')
        el.type(text)
        live = el.input_value()
        pg.locator('[data-mu-name]').click()
        t.wait(200)
        return plain(live), plain(el.input_value())

    t.open(MECH, wait='#q-mech-unit')
    t.wait_for('#q-mech-unit')

    # --- выражение -------------------------------------------------------------
    live, after = typed('[data-mu-f="heatOutput"]', '7*6')
    t.ck(live == '7*6', 'выражение правится по ходу набора: %r' % live)
    t.ck(after == '42,00', '«7*6» не посчиталось по уходу фокуса: %r' % after)

    live, after = typed('[data-mu-f="heatOutput"]', '2/3')
    t.ck(after == '0,67', '«2/3» посчиталось неверно: %r' % after)

    live, after = typed('[data-mu-f="heatOutput"]', '(2+3)*4')
    t.ck(after == '20,00', 'скобки и приоритет операций не учтены: %r' % after)

    live, after = typed('[data-mu-f="heatOutput"]', '10/0')
    t.ck(after == '10/0', 'деление на ноль дало число вместо набранного: %r' % after)

    # --- разделитель и разряды --------------------------------------------------
    live, after = typed('[data-mu-f="pressure"]', '.4')
    t.ck(live == '0,4', 'точка в начале не дала ноль целых по ходу набора: %r' % live)
    t.ck(after == '0,40', '«.4» не привелось к виду с сотыми: %r' % after)

    live, after = typed('[data-mu-f="pressure"]', ',4')
    t.ck(after == '0,40', '«,4» не привелось к виду с сотыми: %r' % after)

    live, after = typed('[data-mu-cost]', '12000')
    t.ck(live == '12 000', 'разряды не расставлены по ходу набора: %r' % live)
    t.ck(after == '12 000,00', 'разряды или сотые потеряны после ухода: %r' % after)

    live, after = typed('[data-mu-cost]', '1200*10,5')
    t.ck(after == '12 600,00', 'выражение с дробным множителем: %r' % after)

    # --- Enter — посчитать не сходя с поля ---------------------------------------
    cell = pg.locator('[data-mu-f="efficiency"]')
    cell.click()
    pg.keyboard.press('Control+a')
    cell.type('88+4')
    cell.press('Enter')
    t.wait(200)
    t.ck(plain(cell.input_value()) == '92,00', 'Enter не посчитал выражение: %r' % cell.input_value())

    # --- целая величина ----------------------------------------------------------
    live, after = typed('[data-mu-qty]', '3*4')
    t.ck(after == '12', 'количество стало дробным или не посчиталось: %r' % after)
    t.ck(not pg.locator('[data-mu-qty]').evaluate('(e) => e.classList.contains("field-bad")'),
         'посчитанное количество помечено ошибкой')

    q = pg.locator('[data-mu-qty]')
    q.click()
    pg.keyboard.press('Control+a')
    q.type('3*')
    t.wait(200)
    t.ck(not q.evaluate('(e) => e.classList.contains("field-bad")'),
         'недонабранное выражение помечено ошибкой ещё до конца набора')
    q.fill('2')
    pg.locator('[data-mu-name]').click()
    t.wait(200)

    # --- посчитанное уходит в данные ---------------------------------------------
    typed('[data-mu-f="heatOutput"]', '3*5')
    pg.locator('.mu-row').nth(1).click()
    t.wait_for('#q-mech-unit')
    t.wait(300)
    pg.locator('.mu-row').first.click()
    t.wait_for('[data-mu-f="heatOutput"]')
    t.wait(300)
    t.ck(plain(pg.locator('[data-mu-f="heatOutput"]').input_value()) == '15,00',
         'посчитанное значение не сохранилось: %r' % pg.locator('[data-mu-f="heatOutput"]').input_value())

    # --- то же поле в карточке литеры --------------------------------------------
    t.open('#/oc/civil/oc-cv-1/oi/oi-cv1-a', wait='.card')
    t.wait_for('[data-area]')
    area = pg.locator('[data-area]').first
    area.click()
    pg.keyboard.press('Control+a')
    area.type('7*6')
    area.press('Enter')
    t.wait(250)
    t.ck(plain(area.input_value()) == '42,00',
         'в площади литеры выражение не считается: %r' % area.input_value())
