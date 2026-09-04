# -*- coding: utf-8 -*-
"""Код ЕНИ: маска, проверка длины, запрет сохранения с неверным кодом.

Требование пользователя: «Формат ЕНИ другим быть не может. Если он другой —
это ошибка». Проверка написана в kernel/fmt.js давно, но подключена только
2026-09-02 (kernel/eniField.js) — до этого код любой длины сохранялся молча.

Допустимых длин три: 13, 15 и 18 цифр (уточнение пользователя 04.09.2026 —
раньше принималась только полная, и коды на 13 и 15 цифр подсвечивались как
ошибка, то есть проверка мешала вводить настоящие данные). Ниже проверяются
все три, а заодно длина между ними (14) — она по-прежнему ошибка, потому что
код не обрывается на середине группы маски.
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

    # Все три допустимых длины принимаются, промежуточная — нет.
    eni = pg.locator('#fEni')
    for digits, ok in [('2475616710012', True),      # 13
                       ('24756167100123', False),    # 14 — обрыв середины группы
                       ('247561671001234', True),    # 15
                       ('247561671001234567', True)]:  # 18
        eni.fill(digits)
        eni.dispatch_event('input')
        pg.wait_for_timeout(250)
        bad = pg.locator('#fEni.eni-bad').count() == 1
        t.ck(bad != ok, 'код ЕНИ из %d цифр: %s' % (
            len(digits), 'помечен ошибкой, хотя допустим' if ok else 'принят, хотя недопустим'))

    # Текст ошибки снимаем на заведомо неверной длине: после верного кода
    # сообщение снято, и читать было бы нечего (на этом первая версия проверки
    # и споткнулась).
    eni.fill('24756167100123')
    eni.dispatch_event('input')
    pg.wait_for_timeout(250)
    err_text = pg.locator('[data-eni-err]').first.inner_text()
    t.ck('13' in err_text and '15' in err_text and '18' in err_text,
         'сообщение об ошибке не перечисляет допустимые длины: %r' % err_text)

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
        le.fill('247561690013')          # 12 цифр — короче любой допустимой
        le.dispatch_event('input')
        pg.wait_for_timeout(250)
        t.ck(pg.locator('[data-land-eni].eni-bad').count() == 1,
             'короткий код ЕНИ участка не помечен ошибкой')

        # 13 цифр — тоже верный код, и маска у него на четыре разделителя:
        # первые пять групп 1-2-2-4-4 (kernel/fmt.js, ENI_GROUPS).
        le.fill('2475616900130')
        le.dispatch_event('input')
        pg.wait_for_timeout(200)
        le.dispatch_event('change')
        pg.wait_for_timeout(500)
        short = pg.locator('[data-land-eni]').input_value()
        t.ck(pg.locator('[data-land-eni].eni-bad').count() == 0,
             'код ЕНИ участка из 13 цифр помечен ошибкой')
        t.ck(short.count('-') == 4, 'маска короткого ЕНИ участка неверна: %r' % short)

        le.fill('247561690013000456')    # 18 цифр
        le.dispatch_event('input')
        pg.wait_for_timeout(200)
        le.dispatch_event('change')
        pg.wait_for_timeout(500)
        got = pg.locator('[data-land-eni]').input_value()
        t.ck(got.count('-') == 6, 'маска ЕНИ участка не расставлена: %r' % got)
