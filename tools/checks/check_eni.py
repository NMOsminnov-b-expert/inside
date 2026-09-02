# -*- coding: utf-8 -*-
"""Код ЕНИ: маска, проверка длины, запрет сохранения с неверным кодом.

Требование пользователя: «Формат ЕНИ другим быть не может. Если он другой —
это ошибка». Проверка написана в kernel/fmt.js давно, но подключена только
2026-09-02 (kernel/eniField.js) — до этого код любой длины сохранялся молча.
"""
NAME = 'ЕНИ'


def run(t):
    pg = t.page

    # --- форма редактирования ОЦ ---
    t.open('#/oc/civil/oc-cv-1')
    pg.locator('#btnEditOc').click()
    pg.wait_for_timeout(600)

    eni = pg.locator('#fEni')
    eni.fill('123')
    eni.dispatch_event('input')
    pg.wait_for_timeout(250)

    err = pg.locator('[data-eni-err]').first
    t.ck(err.count() > 0 and err.inner_text().strip() != '',
         'короткий код ЕНИ не помечен сообщением')
    t.ck('цифры' in err.inner_text() or 'цифр' in err.inner_text(),
         'сообщение об ошибке ЕНИ не называет, сколько цифр нужно: %r' % err.inner_text())
    t.ck(pg.locator('#fEni.eni-bad').count() == 1, 'поле с неверным ЕНИ не подсвечено')

    pg.locator('#btnSaveOc').click()
    pg.wait_for_timeout(600)
    t.ck(pg.locator('#fEni').count() > 0, 'форма закрылась, сохранив неверный код ЕНИ')

    # 18 цифр — ошибки нет, маска расставляется
    eni = pg.locator('#fEni')
    eni.fill('247561671001234567')
    eni.dispatch_event('input')
    pg.wait_for_timeout(250)
    t.ck(pg.locator('#fEni.eni-bad').count() == 0, 'верный код ЕНИ помечен как ошибочный')

    eni.dispatch_event('change')
    pg.wait_for_timeout(300)
    masked = pg.locator('#fEni').input_value()
    # 18 цифр разбиты на семь групп (kernel/fmt.js, ENI_GROUPS) — шесть разделителей.
    t.ck(masked.count('-') == 6, 'маска ЕНИ не расставлена: %r' % masked)

    pg.locator('#btnSaveOc').click()
    pg.wait_for_timeout(700)
    t.ck(pg.locator('#fEni').count() == 0, 'форма не сохранилась с верным кодом ЕНИ')

    # --- карточка литеры ---
    t.open('#/oc/civil/oc-cv-1')
    pg.locator('tr[data-open-oi]').first.click()
    pg.wait_for_timeout(700)

    he = pg.locator('[data-head-eni]')
    if t.ck(he.count() > 0, 'в карточке литеры нет поля кода ЕНИ'):
        before = pg.locator('.ctx-plate').first.inner_text()
        he.fill('77')
        he.dispatch_event('input')
        pg.wait_for_timeout(250)
        t.ck(pg.locator('[data-head-eni].eni-bad').count() == 1,
             'неверный код ЕНИ в карточке литеры не подсвечен')

        he.dispatch_event('change')
        pg.wait_for_timeout(400)
        after = pg.locator('.ctx-plate').first.inner_text()
        t.ck(before == after, 'неверный код ЕНИ попал в плашку карточки')

    # --- карточка земельного участка: поле своё, правило то же ---
    t.open('#/oc/land-plot/oc-lp-1')
    pg.locator('.oi-land-open').first.click()
    pg.wait_for_timeout(700)

    le = pg.locator('[data-land-eni]')
    if t.ck(le.count() > 0, 'в карточке участка нет поля кода ЕНИ'):
        le.fill('247561690013')          # 12 цифр — короче нужных 18
        le.dispatch_event('input')
        pg.wait_for_timeout(250)
        t.ck(pg.locator('[data-land-eni].eni-bad').count() == 1,
             'короткий код ЕНИ участка не помечен ошибкой')

        le.fill('247561690013000456')    # 18 цифр
        le.dispatch_event('input')
        pg.wait_for_timeout(200)
        le.dispatch_event('change')
        pg.wait_for_timeout(500)
        got = pg.locator('[data-land-eni]').input_value()
        t.ck(got.count('-') == 6, 'маска ЕНИ участка не расставлена: %r' % got)
