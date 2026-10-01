# -*- coding: utf-8 -*-
"""Главная: вкладки «Недвижимое / Движимое» и доработка реестра (01.10.2026).

Что ловит сценарий (обход главной и канва 01.10.2026, задача графа
glavnaya-vkladki-nedvizhimoe-dvizhimoe):

  * ТС и механизмы не фильтровались поиском (их модули искали в
    несуществующем filter.search), не проверяли «мои», признаки и давность —
    попадали во все срезы и завышали счётчики;
  * превью ТС и механизмов падало с ошибкой (rec.oi у них нет);
  * демо-объём 20 000 давал около 13 300 — доля движимого пропадала;
  * «Выбрать все» брал первые 200 строк, а не всю выборку;
  * фильтр «Область» не попадал в адрес;
  * при переносе в новую раскладку не потерялись столбцы: у каждой вкладки
    свой состав, включение столбца в одной не трогает другую;
  * роль и демо-объём — в меню пользователя, а не строкой на главной;
  * на 1280 и 1024 строки заголовка и видов не вылезают за край.
"""
NAME = 'главная: вкладки и реестр'

TOUCHES = (
    'app/pages/ocMenu/*', 'app/kernel/registryRows.js', 'app/kernel/columns.js',
    'app/shell/*', 'app/kernel/boot.js', 'app/kernel/session.js',
    'app/modules/vehicle/records.js', 'app/modules/mechanisms/records.js',
)

HEADS = "() => [...document.querySelectorAll('.reg-th')].map((e) => e.innerText.trim()).filter(Boolean)"


def run(t):
    pg = t.page
    pg.set_viewport_size({'width': 1440, 'height': 900})

    # --- заводим по одной записи ТС и механизмов ----------------------------------
    for kind in ('vehicle', 'mechanisms'):
        t.open('', wait='.reg-tr')
        pg.click('.reg-create [data-dd-toggle]')
        pg.click('.reg-create [data-create="%s"]' % kind)
        t.wait_until("() => location.hash.includes('/create')")
        if kind == 'vehicle':
            pg.click('[data-ts-kind="base"]')
            pg.select_option('[data-ts-cat]', 'Грузовое')
            t.wait_for('[data-ts-base]:not([disabled])')
            pg.select_option('[data-ts-base]', 'Седельный тягач')

    # --- вкладки ---------------------------------------------------------------------
    t.open('', wait='.reg-tr')
    tabs = pg.eval_on_selector_all('.reg-tab', "els => els.map((e) => e.innerText.replace(/\\s+/g, ' ').trim())")
    t.ck(tabs == ['Недвижимое 16', 'Движимое 2'], 'вкладки не те: %s' % tabs)
    estate_heads = pg.evaluate(HEADS)
    t.ck('КОД ЕНИ' in estate_heads and 'ОБЪЕКТ' in estate_heads, 'у недвижимого нет ЕНИ и объекта: %s' % estate_heads)
    t.ck(pg.locator('.reg-tr .reg-obj-s').count() > 0, 'у объекта нет второй строки (тип · учреждение)')

    pg.click('[data-tab="movable"]')
    t.wait_until("() => location.hash.includes('tab=movable')")
    t.ck(pg.locator('.reg-tr').count() == 2, 'на вкладке «Движимое» не две записи')
    mov_heads = pg.evaluate(HEADS)
    t.ck('КОД ЕНИ' not in mov_heads and 'ПОЗИЦИЙ' in mov_heads and 'РЕГ. / ИНВ. №' in mov_heads,
         'столбцы движимого не те: %s' % mov_heads)
    views = pg.eval_on_selector_all('[data-slice]', 'els => els.map((e) => e.dataset.slice)')
    t.ck('defects' not in views and 'ml' not in views, 'у движимого остались срезы ТП и ML: %s' % views)

    # Поиск фильтрует движимое (раньше ТС и механизмы были видны при любом запросе).
    pg.fill('[data-locator]', 'тягач')
    t.wait_until("() => document.querySelectorAll('.reg-tr').length === 1")
    pg.fill('[data-locator]', 'нет-такого-объекта')
    t.wait_until("() => !document.querySelector('.reg-tr') && !!document.querySelector('.reg-empty')")
    t.ck('ничего не найдено' in pg.locator('.reg-empty').inner_text(), 'пустой отбор без пояснения')
    pg.locator('[data-chip-remove^="q|"]').first.click()
    t.wait_until("() => document.querySelectorAll('.reg-tr').length === 2")

    # Превью движимого открывается без ошибки, состав — от модуля.
    before = len(t.console)
    pg.locator('.reg-tr').first.click(modifiers=['Control'])
    t.wait_for('.reg-peek')
    t.ck(len(t.console) == before, 'превью движимого дало ошибку в консоли')
    secs = pg.locator('.reg-peek-sec').all_inner_texts()
    t.ck(not any('Состав ОИ' in x for x in secs), 'в превью движимого «Состав ОИ»: %s' % secs)
    pg.keyboard.press('Escape')

    # Столбцы у вкладок свои: включили «Учреждение» у движимого — у недвижимого
    # состав прежний.
    pg.click('.reg-more [data-dd-toggle]')
    t.wait_for('.reg-more.open')
    pg.locator('[data-column="institution"]').check()
    t.wait_until("() => [...document.querySelectorAll('.reg-th')].some((e) => e.innerText.trim() === 'УЧРЕЖДЕНИЕ')")
    t.ck(pg.locator('.reg-more.open').count() == 1, 'меню «⋯» закрылось после включения столбца')
    pg.locator('.reg-h1').click()
    pg.click('[data-tab="estate"]')
    t.wait_until("() => !location.hash.includes('tab=movable')")
    t.ck(pg.evaluate(HEADS) == estate_heads, 'включение столбца у движимого изменило столбцы недвижимого')

    # --- срезы, фильтры, чипы ---------------------------------------------------------------
    n_notes = int(pg.locator('[data-slice="notes"] b').inner_text().replace('\xa0', ''))
    pg.click('[data-slice="notes"]')
    t.wait_until("() => !!document.querySelector('.reg-chip-f')")
    t.ck(pg.locator('.reg-tr').count() == n_notes, 'срез «Заметки» показал не столько, сколько обещал счётчик')
    t.ck(pg.locator('.reg-chip-f').count() == 1, 'нет чипа среза')
    pg.click('.reg-chips-reset')
    t.wait_until("() => !document.querySelector('.reg-chip-f')")

    pg.click('[data-facets-toggle]')
    t.wait_until("() => !document.querySelector('[data-facets-wrap]').classList.contains('closed')")
    pg.click('[data-facet-toggle="region"]')
    pg.locator('[data-facet="region"]').first.check()
    t.wait_until("() => location.hash.includes('region=')")
    t.ck(pg.locator('.reg-chip-f').count() == 1 and 'Область' in pg.locator('.reg-chip-f').inner_text(), 'нет чипа области')
    t.ck(pg.locator('[data-facets-toggle] b').inner_text().strip() == '1', 'на кнопке «Фильтры» нет числа фильтров')
    pg.click('[data-facets-close]')
    pg.click('.reg-chips-reset')
    t.wait_until("() => !location.hash.includes('region=')")

    # --- плотность и «выбрать все» ---------------------------------------------------------
    pg.click('.reg-more [data-dd-toggle]')
    pg.click('[data-dense="1"]')
    t.wait_until("() => Math.round(document.querySelector('.reg-tr').getBoundingClientRect().height) === 36")
    pg.click('[data-dense="0"]')
    t.wait_until("() => Math.round(document.querySelector('.reg-tr').getBoundingClientRect().height) === 48")
    pg.locator('.reg-h1').click()

    pg.locator('[data-select]').nth(1).check()
    t.wait_for('.reg-bulkbar')
    pg.click('[data-select-all]')
    t.wait_until("() => document.querySelector('.reg-bulkbar b').textContent.includes('16')")
    t.ck(pg.locator('[data-select-page]').is_checked(), 'флажок шапки не отмечен при выбранной выборке')
    pg.click('[data-bulk="clear"]')
    t.wait_until("() => !document.querySelector('.reg-bulkbar')")

    # --- меню пользователя: роль и демо-объём ------------------------------------------------
    t.ck(pg.locator('[data-role], [data-bulk-count], .reg-foot').count() == 0, 'роль или демо-объём остались на главной')
    t.set_role('insp')
    t.wait_until("() => !document.querySelector('[data-slice=\"my-appr\"]')")
    t.ck(pg.locator('[data-user-role]').inner_text().strip() == '· осмотрщик', 'роль не видна в шапке')
    t.set_role('any')
    t.set_bulk(20000)
    est = pg.locator('[data-tab="estate"] span').inner_text().replace('\xa0', '').replace(' ', '')
    t.ck(est == '20016', 'демо-объём 20 000 дал не 20 016 недвижимых: %s' % est)
    t.set_bulk(0)

    # --- узкие ширины -------------------------------------------------------------------------
    for w, h in ((1280, 800), (1024, 768)):
        pg.set_viewport_size({'width': w, 'height': h})
        t.wait(300)
        over = pg.evaluate("""() => [document.documentElement.scrollWidth > innerWidth,
          ...[...document.querySelectorAll('.reg-head, .reg-bar')].map((e) => e.scrollWidth > e.clientWidth + 1)]""")
        t.ck(not any(over), 'на ширине %d что-то вылезает за край: %s' % (w, over))
    pg.set_viewport_size({'width': 1440, 'height': 900})
