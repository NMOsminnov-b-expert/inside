# -*- coding: utf-8 -*-
"""Карточка ТС: ввод значений — сохранение, номера, серия документа, годы.

Что ловит сценарий:

  * пробег пропадает, если после набора сменить значение в выпадающем меню
    (баг из заметок пользователя 07.10.2026: «Пробег не сохраняется —
    сбрасывается при обновлении выпадающих меню»): число записывалось только
    по уходу из поля, а смена меню перерисовывала карточку раньше;
  * в номерах (регистрационный, VIN, № кузова, шасси, двигателя, серия и номер
    документа) буквы не переходят в заглавные;
  * «КР» и пробел в серии документа не дописывают «№» — где бы в строке «КР»
    ни стояло;
  * год двумя цифрами: больше двух последних цифр текущего года — 19XX, не
    больше — 20XX (там же: «Если человек заведомо год вбил больше текущего,
    ставим 19XX. Если меньше текущего — 20XX»), в поле года и в дате.
"""
import datetime

NAME = 'карточка ТС: ввод значений'

TOUCHES = ('app/modules/vehicle/ctrl.js', 'app/kernel/numField.js', 'app/modules/vehicle/tsFields.view.js')

REC = """async () => { const m = await import('./app/modules/vehicle/records.js');
  const id = location.hash.split('/')[3]; const r = (m.allRecords ? m.allRecords() : []).find((x) => x.id === id);
  return r && r.vehicle ? r.vehicle.f : null; }"""


def run(t):
    pg = t.page
    t.open('', wait='.reg-tr')
    pg.click('.reg-create [data-dd-toggle]')
    pg.click('.reg-create [data-create="vehicle"]')
    t.wait_until("() => location.hash.includes('/create')")
    t.wait_for('[data-ts-cat]')
    pg.select_option('[data-ts-cat]', 'Грузовое')
    t.wait_for('[data-ts-base]:not([disabled])')
    pg.select_option('[data-ts-base]', 'Грузовое ТС')
    t.wait_for('[data-tsf="main|mileage"]')

    # Пробег набран, фокус не уходил — меняем меню: значение не теряется.
    pg.click('[data-tsf="main|mileage"]')
    pg.keyboard.type('123456')
    pg.select_option('[data-tsf="main|generalState"]', index=1)
    t.wait_for('[data-tsf="main|mileage"]')
    t.ck(''.join(ch for ch in pg.input_value('[data-tsf="main|mileage"]') if ch.isdigit()) == '123456',
         'пробег сбросился после смены меню: %r' % pg.input_value('[data-tsf="main|mileage"]'))
    f = pg.evaluate(REC) or {}
    t.ck(str(f.get('mileage', '')).replace(' ', '') in ('123456', '123456.0'), 'пробег не записан в карточку: %r' % f.get('mileage'))

    # Номера — заглавными.
    for key, typed, want in (('plate', '01kg430br', '01KG430BR'), ('bodyNo', 'xta210', 'XTA210'),
                             ('chassisNo', 'abc12', 'ABC12'), ('engineNo', 'zmz406', 'ZMZ406')):
        sel = '[data-tsf="main|%s"]' % key
        if pg.locator(sel).count():
            pg.fill(sel, '')
            pg.click(sel)
            pg.keyboard.type(typed)
            t.ck(pg.input_value(sel) == want, '%s: не заглавными: %r' % (key, pg.input_value(sel)))

    # Серия документа: «КР» и пробел — «КР № » в любом месте строки.
    doc = '[data-tsf="main|docNo"]'
    pg.fill(doc, '')
    pg.click(doc)
    pg.keyboard.type('кр 123')
    t.ck(pg.input_value(doc) == 'КР № 123', 'серия: «КР» и пробел не дали «КР №»: %r' % pg.input_value(doc))
    pg.fill(doc, '')
    pg.click(doc)
    pg.keyboard.type('АА КР 5')
    t.ck(pg.input_value(doc) == 'АА КР № 5', 'серия: «КР» в середине строки без «№»: %r' % pg.input_value(doc))

    # Год двумя цифрами.
    yy = datetime.date.today().year % 100
    after, before = (yy + 1) % 100, max(0, yy - 1)
    year = '[data-tsf="main|year"]'
    for typed, want in (('%02d' % after, '19%02d' % after), ('%02d' % before, '20%02d' % before)):
        pg.fill(year, '')
        pg.click(year)
        pg.keyboard.type(typed)
        pg.keyboard.press('Tab')
        t.ck(pg.input_value(year) == want, 'год «%s» стал %r вместо %s' % (typed, pg.input_value(year), want))
    date = '[data-tsf="main|regDate"]'
    pg.fill(date, '')
    pg.click(date)
    pg.keyboard.type('0102%02d' % after)
    pg.keyboard.press('Tab')
    t.ck(pg.input_value(date) == '01.02.19%02d' % after, 'дата с годом двумя цифрами: %r' % pg.input_value(date))
