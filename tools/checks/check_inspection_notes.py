# -*- coding: utf-8 -*-
"""Уведомления о пропусках: лента регионала и уведомления осмотрщика о себе.

ТЗ рабочего дня осмотрщика, раздел 8 (запись графа tz-rabota-osmotrschika).

Что ловит сценарий:
  * счётчик на вкладке не равен числу непрочитанных;
  * назначение на будущий день числится «зависшим» (шум: «не начат 6 дн.»
    у выезда на следующую неделю);
  * щелчок по уведомлению не ведёт к причине (отчёты дня, назначение) или
    не помечает его прочитанным;
  * «Отметить все прочитанными» не убирает счётчик; прочитанное не
    переживает перезагрузку;
  * у осмотрщика нет уведомления о новом назначении;
  * в консоли ошибки.
"""
NAME = 'уведомления'

TOUCHES = ('app/pages/inspections/*', 'app/pages/inspector/*', 'app/kernel/inspections.js')

K = "import('./app/kernel/inspections.js')"


def run(t):
    pg = t.page
    t.open('#/inspections', wait='[data-ip-section]')
    pg.click('[data-ip-section="notes"]')
    t.wait_for('.ip-notes, .ip-empty')
    unread = pg.locator('.ip-note.unread').count()
    badge = pg.locator('[data-ip-section="notes"] .ip-unread')
    t.ck(unread > 0 and badge.count() == 1 and badge.inner_text() == str(unread),
         'счётчик на вкладке не равен непрочитанным: %s / %s' % (badge.all_inner_texts(), unread))

    stalled_future = pg.evaluate("""async () => { const k = await %s; const d = new Date(); const t = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      return k.allAssignments().filter((a) => a.plannedAt > t && k.stallOf(a)).length; }""" % K)
    t.ck(stalled_future == 0, 'назначения на будущие дни числятся зависшими: %s' % stalled_future)

    # поздний выезд — к отчётам дня в правой панели
    pg.click('[data-ip-notes-kind="late"]')
    first = pg.locator('.ip-note').first
    nid = first.get_attribute('data-ip-note')
    first.click()
    t.ck(t.wait_for('.ip-detail-pane') and pg.locator('[data-ip-ptab="reports"].on').count() == 1,
         'уведомление о позднем выезде не открыло отчёты дня')
    pg.click('[data-ip-section="notes"]')
    t.wait_for('.ip-note')
    t.ck(pg.locator('.ip-note.unread[data-ip-note="%s"]' % nid).count() == 0, 'открытое уведомление осталось непрочитанным')

    # пропущенный выезд — к назначению
    pg.click('[data-ip-notes-kind="missed"]')
    m = pg.locator('.ip-note').first
    aid = m.get_attribute('data-ip-note').split('|')[3]
    m.click()
    t.ck(t.wait_for('tr.cur[data-ip-row="%s"]' % aid), 'уведомление о пропущенном выезде не открыло это назначение')

    # все прочитаны — счётчика нет и после перезагрузки
    pg.click('[data-ip-section="notes"]')
    pg.click('[data-ip-notes-kind=""]')
    pg.click('[data-ip-notes-readall]')
    t.ck(t.wait_until("() => !document.querySelector('[data-ip-section=\"notes\"] .ip-unread')"), '«Отметить все прочитанными» не убрало счётчик')
    pg.evaluate("async () => (await import('./app/kernel/persist.js')).saveNow()")
    pg.reload()
    t.wait_for('[data-ip-section]')
    t.ck(pg.locator('[data-ip-section="notes"] .ip-unread').count() == 0, 'прочитанное не пережило перезагрузку')

    # осмотрщик — новое назначение
    who = pg.evaluate("async () => (await %s).profileNames()[0]" % K)
    t.open('#/insp?as=' + who, wait='.ins-body')
    t.ck(t.wait_until("() => /Новое назначение/.test(document.querySelector('.ins-ntfs')?.innerText || '')"),
         'у осмотрщика нет уведомления о новом назначении')
