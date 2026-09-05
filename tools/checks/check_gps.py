# -*- coding: utf-8 -*-
"""Формат координат проверяется во всех карточках с полем GPS, не только в участке.

Раньше разбор «широта, долгота» (kernel/gps.js) был подключён только к карточке
земельного участка. У строения, квартиры и самого объекта оценки поле координат
принимало что угодно: перепутанные широта и долгота или оборванное значение
выглядят как обычное заполненное поле, а ошибка всплывает уже на карте, когда
непонятно, кто и когда её внёс (решение пользователя 05.09.2026 — «везде нужна
проверка»).

Сценарий сторожит, что:
  * поле координат в карточке ОИ (строение, квартира) подсвечивает неверный
    формат и снимает подсветку с верного;
  * поле «GPS-координаты» в форме объекта оценки (и редактирование, и создание)
    делает то же самое;
  * форма объекта оценки не сохраняется с перепутанными координатами.
"""

NAME = 'координаты везде'

# value, ждём ли ошибку, что сломано если не так
FORMAT_CASES = [
    ('42.874722, 74.612222', False, 'верные координаты помечены ошибкой'),
    ('42.874722 74.612222', True, 'координаты без запятой приняты'),
    ('42,874722, 74,612222', True, 'запятая как десятичный разделитель принята'),
    ('74.612222, 42.874722', True, 'перепутанные широта и долгота приняты'),
    ('42.874722', True, 'одна широта без долготы принята'),
    ('', False, 'пустое поле координат помечено ошибкой'),
]


def _check_field(t, sel):
    pg = t.page
    for value, expect_err, what in FORMAT_CASES:
        fld = pg.locator(sel)
        fld.fill(value)
        fld.dispatch_event('input')
        t.wait(200)
        bad = pg.locator('%s.field-bad' % sel).count() == 1
        t.ck(bad == expect_err, '%s: %s' % (sel, what))

    fld = pg.locator(sel)
    fld.fill('74.612222, 42.874722')
    fld.dispatch_event('input')
    t.wait(220)
    msg = (pg.locator('[data-field-err]').first.inner_text()
           if pg.locator('[data-field-err]').count() else '')
    t.ck('перепутан' in msg.lower(),
         '%s: сообщение не объясняет перестановку широты и долготы: %r' % (sel, msg))


def _open_oi(t, route, sel):
    t.open(route, wait='.oi-stack')
    if not t.wait_for(sel):
        t.ck(False, 'не открылось поле %s по маршруту %s' % (sel, route))
        return False
    t.wait(200)
    return True


def run(t):
    pg = t.page

    # --- 1. карточка ОИ: строение ---
    if _open_oi(t, '#/oc/civil/oc-cv-1/oi/oi-cv1-a', '[data-oi-gps]'):
        _check_field(t, '[data-oi-gps]')

    # --- 2. карточка ОИ: квартира ---
    if _open_oi(t, '#/oc/residential-house/oc-rh-1/oi/oi-b', '[data-oi-gps]'):
        _check_field(t, '[data-oi-gps]')

    # --- 3. форма объекта оценки: редактирование ---
    t.open('#/oc/apartment/oc-ap-1/form', wait='#fGps')
    if t.wait_for('#fGps'):
        _check_field(t, '#fGps')

    # --- 4. форма объекта оценки: создание ---
    t.open('#/oc/apartment/oc-ap-1/create', wait='#fGps')
    if t.wait_for('#fGps'):
        _check_field(t, '#fGps')

    # --- 5. форма не сохраняется с перепутанными координатами ---
    t.open('#/oc/apartment/oc-ap-1/form', wait='#fGps')
    pg.locator('#fGps').fill('74.612222, 42.874722')
    pg.locator('#fGps').dispatch_event('input')
    pg.locator('#btnSaveOc').click()
    t.wait(300)
    t.ck(pg.locator('#fGps').count() == 1,
         'форма ОЦ сохранилась с перепутанными координатами — ушла с экрана')
    t.ck(pg.locator('#fGps.field-bad').count() == 1,
         'при блокировке сохранения поле координат не подсвечено')

    # --- 6. подсказка поля не наезжает на сообщение об ошибке ---
    #
    # У поля «GPS-координаты» есть подпись «заполняется автоматически»; она и
    # сообщение об ошибке стоят в одном месте (top:100%). При ошибке подсказка
    # должна прятаться, иначе текст ложится на текст.
    hint_shown = pg.evaluate(
        """() => {
          const f = document.querySelector('#fGps').closest('.field');
          const h = f && f.querySelector('.field-hint');
          if (!h) return false;
          return getComputedStyle(h).display !== 'none';
        }""")
    t.ck(not hint_shown, 'подсказка поля координат видна поверх сообщения об ошибке')
