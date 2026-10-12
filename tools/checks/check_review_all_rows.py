# -*- coding: utf-8 -*-
"""Учреждения, вкладка «С подведомственными» на 20 000 записей.

Код-ревью 09.10.2026: таблица рисовала всю выборку поддерева — у корня 13
тысяч строк, 7,8 МБ разметки и полторы секунды на вставку (замер 12.10.2026).
Теперь рисуется порция (allObjects.js ALL_STEP), дальше — «Показать ещё».

Что ловит сценарий:
  * у корня в таблице больше одной порции строк (рисуется вся выборка);
  * «Показать ещё» не добавляет следующую порцию или сбрасывает прокрутку
    таблицы к началу;
  * число показанных строк не переживает перезагрузку (вид экрана — как закрыли,
    так и открылось).
"""
NAME = 'учреждения: сводная таблица порциями'

TOUCHES = ('app/pages/institutions/allObjects.js', 'app/pages/institutions/institutions.js')

ROWS = "() => document.querySelectorAll('[data-all-row]').length"


def run(t):
    pg = t.page
    t.open('', wait='.reg-tr')
    pg.click('[data-user-toggle]')
    pg.click('[data-um-bulk="20000"]')
    t.wait_until("() => parseInt(document.querySelector('[data-spacer]').style.height) > 500000")

    t.open('#/institutions', wait='.itree-row[data-inode]')
    pg.locator('.itree-row[data-inode] .itree-name').first.click()
    t.wait_for('[data-itab="all"]')
    pg.click('[data-itab="all"]')
    if not t.ck(t.wait_for('.iall-count'), 'вкладка «С подведомственными» не открылась'):
        return
    total = int(pg.inner_text('.iall-count').split()[0])
    if not t.ck(total > 600, 'у корня мало объектов для проверки: %d' % total):
        return
    t.ck(pg.evaluate(ROWS) == 300, 'нарисована не первая порция: %d строк из %d' % (pg.evaluate(ROWS), total))

    if not t.ck(pg.locator('[data-all-more]').count() == 1, 'нет кнопки «Показать ещё»'):
        return
    pg.evaluate("() => { const b = document.querySelector('[data-all-cols-box]'); b.scrollTop = b.scrollHeight; }")
    top = pg.evaluate("() => document.querySelector('[data-all-cols-box]').scrollTop")
    pg.click('[data-all-more]')
    t.ck(t.wait_until("() => document.querySelectorAll('[data-all-row]').length === 600"),
         '«Показать ещё» не добавило порцию: %d' % pg.evaluate(ROWS))
    after = pg.evaluate("() => document.querySelector('[data-all-cols-box]').scrollTop")
    t.ck(top > 0 and abs(after - top) < 2, 'прокрутка таблицы сбросилась: %s → %s' % (top, after))

    pg.evaluate("async () => (await import('./app/kernel/persist.js')).saveNow()")
    # Набор на 20 000 записей после перезагрузки не держится — включаем снова.
    pg.reload()
    t.open('', wait='.reg-tr')
    pg.click('[data-user-toggle]')
    pg.click('[data-um-bulk="20000"]')
    t.wait_until("() => parseInt(document.querySelector('[data-spacer]').style.height) > 500000")
    t.open('#/institutions', wait='[data-all-row]')
    t.ck(pg.evaluate(ROWS) == 600, 'после перезагрузки показано %d строк вместо 600' % pg.evaluate(ROWS))
