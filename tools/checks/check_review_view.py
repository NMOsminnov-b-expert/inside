# -*- coding: utf-8 -*-
"""Вид экрана: как закрыли — так и открылось.

Решение пользователя 09.10.2026 по код-ревью: «Вот в каком виде мы страницу
закрываем, в таком же она потом должна открываться. Относится ко всей
динамике по всему макету» (kernel/viewState.js).

Что ловит сценарий:
  * квартира: просмотрщик, закрытый крестиком, после перезагрузки снова открыт
    (у квартиры, дома и участка не сохранялся и открывался на каждой записи);
  * ТС: свёрнутый блок после перезагрузки развёрнут (состояние жило внутри
    монтирования модуля);
  * учреждения: выбранный узел после перезагрузки не выбран;
  * документы: набранный поиск после перезагрузки пуст;
  * блок карточки ОЦ, свёрнутый по заголовку, разворачивается обратно при
    любой перерисовке и после перезагрузки (класс в разметке, нигде не
    запомненный); в ОЦ «Механизмы» стрелки блоков не работали вовсе
    (kernel/cardToggle.js);
  * раздел карточки документа («Метаданные») после перезагрузки снова развёрнут.
"""
NAME = 'вид экрана после перезагрузки'

TOUCHES = ('app/kernel/viewState.js', 'app/kernel/cardToggle.js', 'app/modules/civil/index.js', 'app/modules/apartment/data/store.js', 'app/modules/vehicle/index.js',
           'app/modules/mechanisms/index.js', 'app/pages/institutions/institutions.js', 'app/pages/docs/docs.js',
           'app/pages/dicts/dicts.js', 'app/pages/archive/archive.js', 'app/pages/docs/detail.js')


def reload(t, wait):
    t.page.evaluate("async () => (await import('./app/kernel/persist.js')).saveNow()")
    t.page.reload()
    t.wait_for(wait)


def run(t):
    pg = t.page

    # --- квартира: закрытый просмотрщик ---------------------------------------------
    t.open('#/oc/apartment/oc-ap-1', wait='[data-vclose]')
    pg.click('[data-vclose]')
    t.wait_until("() => !document.querySelector('[data-vclose]')")
    reload(t, '.card')
    t.ck(pg.locator('[data-vclose]').count() == 0, 'квартира: закрытый просмотрщик после перезагрузки снова открыт')

    # --- ТС: свёрнутый блок -------------------------------------------------------------
    t.open('', wait='.reg-tr')
    pg.click('.reg-create [data-dd-toggle]')
    pg.click('.reg-create [data-create="vehicle"]')
    t.wait_for('[data-ts-cat]')
    pg.select_option('[data-ts-cat]', 'Легковое')
    t.wait_for('[data-ts-acc="Регистрационный учёт"]')
    pg.locator('[data-ts-acc="Регистрационный учёт"] h3').click()
    t.wait_until("() => document.querySelector('[data-ts-acc=\"Регистрационный учёт\"]').getAttribute('aria-expanded') === 'false'")
    reload(t, '[data-ts-acc="Регистрационный учёт"]')
    t.ck(pg.get_attribute('[data-ts-acc="Регистрационный учёт"]', 'aria-expanded') == 'false',
         'ТС: свёрнутый блок после перезагрузки развёрнут')

    # --- учреждения: выбранный узел --------------------------------------------------
    t.open('#/institutions', wait='.itree-row[data-inode]')
    row = pg.locator('.itree-row[data-inode]').nth(2)
    nid = row.get_attribute('data-inode')
    row.locator('.itree-name').click()
    t.wait_until("(id) => !!document.querySelector('.itree-row.on[data-inode=\"' + id + '\"]')", nid)
    pg.evaluate("() => { location.hash = '#/'; }")
    t.wait_for('.reg-tr')
    reload(t, '.reg-tr')
    t.open('#/institutions', wait='.itree-row[data-inode]')
    t.ck(pg.locator('.itree-row.on[data-inode="%s"]' % nid).count() == 1, 'учреждения: выбранный узел не восстановлен')

    # --- документы: поиск -----------------------------------------------------------------
    t.open('#/docs', wait='[data-docs-q]')
    pg.fill('[data-docs-q]', 'техпаспорт')
    pg.wait_for_timeout(400)
    reload(t, '[data-docs-q]')
    t.ck(pg.input_value('[data-docs-q]') == 'техпаспорт', 'документы: поиск после перезагрузки пуст')

    # --- свёрнутый блок карточки ОЦ: перерисовка и перезагрузка -------------------
    closed = "() => document.querySelector('[data-card-toggle]').closest('.card').classList.contains('collapsed')"
    t.open('#/oc/civil/oc-cv-1', wait='[data-card-toggle]')
    pg.locator('[data-card-toggle] h3').first.click()
    t.ck(t.wait_until(closed), 'нежилое здание: блок не свернулся по заголовку')
    pg.evaluate("() => window.dispatchEvent(new Event('inside:redraw'))")
    pg.wait_for_timeout(600)
    t.ck(pg.evaluate(closed), 'нежилое здание: свёрнутый блок развернулся при перерисовке')
    reload(t, '[data-card-toggle]')
    t.ck(pg.evaluate(closed), 'нежилое здание: свёрнутый блок развернулся после перезагрузки')

    # --- ОЦ «Механизмы»: стрелки блоков работают -----------------------------------
    t.open('', wait='.reg-tr')
    pg.click('.reg-create [data-dd-toggle]')
    pg.click('.reg-create [data-create="mechanisms"]')
    t.wait_for('[data-card-toggle]')
    pg.locator('[data-card-toggle] h3').first.click()
    t.ck(t.wait_until(closed), 'ОЦ «Механизмы»: блок не сворачивается по заголовку')

    # --- карточка документа: свёрнутый раздел ---------------------------------------
    t.open('#/docs', wait='[data-doc-row]')
    pg.locator('[data-doc-row]').first.click()
    t.wait_for('[data-dd-sec="Метаданные"]')
    pg.click('[data-dd-sec="Метаданные"] [data-dd-toggle]')
    sec = "() => document.querySelector('[data-dd-sec=\"Метаданные\"]').classList.contains('collapsed')"
    t.ck(t.wait_until(sec), 'документ: раздел «Метаданные» не свернулся')
    reload(t, '[data-dd-sec="Метаданные"]')
    t.ck(pg.evaluate(sec), 'документ: свёрнутый раздел после перезагрузки развёрнут')
