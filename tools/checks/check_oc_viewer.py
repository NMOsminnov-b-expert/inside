# -*- coding: utf-8 -*-
"""Просмотрщик в карточке ОЦ — такой же, как в карточке литеры.

Что ловит сценарий (найдено и исправлено 05.09.2026):

  * вкладка «Фото» рисовала просмотрщик только в режиме фото, поэтому закладка
    «Документы» слева переключала режим и просмотрщик исчезал — клик выглядел
    как «ничего не происходит»;
  * кнопки режимов (Фото · Документы · Сравнение) показывались только в карточке
    литеры, хотя просмотрщик объекта оценки умеет то же самое;
  * фото из окна перечня открывалось переходом в карточку литеры — человек терял
    место, где работал. Теперь снимок открывается здесь же, а какую литеру
    показывать, просмотрщик берёт из ui.viewerPhotoOi.
"""
NAME = 'просмотрщик ОЦ'

ROUTE = '#/oc/civil/oc-cv-1'


def run(t):
    pg = t.page

    # --- 1. общая вкладка: просмотрщик и все три режима ---
    t.open(ROUTE, wait='.viewer')
    t.wait(400)

    modes = pg.eval_on_selector_all('.vmode-btn', 'els => els.map((e) => e.textContent.trim())')
    t.ck(len(modes) == 3, 'в карточке ОЦ не три режима просмотрщика: %s' % modes)
    t.ck(any('Фото' in m for m in modes), 'нет режима «Фото»: %s' % modes)
    t.ck(any('Сравнение' in m for m in modes), 'нет режима «Сравнение»: %s' % modes)
    t.ck(pg.locator('[data-vsb-toggle]').count() == 1, 'нет кнопки меню просмотрщика')

    # --- 2. меню выбора: документы всей записи ---
    pg.locator('[data-vsb-toggle]').first.click()
    t.wait_for('.vsb')
    t.ck(pg.locator('[data-vsb-doc]').count() > 0, 'в меню просмотрщика нет документов записи')
    pg.locator('[data-vsb-close]').first.click()
    t.wait(300)

    # --- 3. режим фото без выбранной литеры объясняет, что делать ---
    pg.locator('[data-vmode="photo"]').first.click()
    t.wait(500)
    t.ck(pg.locator('.vempty').count() == 1,
         'режим фото без выбранной литеры показывает пустую ленту вместо приглашения')

    # --- 4. фото из меню открывается здесь же, без ухода в карточку литеры ---
    pg.locator('[data-vsb-toggle]').first.click()
    t.wait_for('.vsb')
    if t.ck(pg.locator('[data-vsb-photo]').count() > 0, 'в меню просмотрщика нет фото литер'):
        pg.locator('[data-vsb-photo]').first.click()
        t.wait_for('[data-vthumb]')
        t.ck('/oi/' not in pg.evaluate('() => location.hash'),
             'выбор фото увёл в карточку литеры вместо просмотра на месте')
        t.ck(pg.locator('[data-vthumb]').count() > 0, 'лента фото пуста')

    # --- 5. вкладка «Фото»: закладка «Документы» открывает просмотрщик ---
    t.open(ROUTE + '?tab=photo', wait='.card')
    t.wait(400)
    if pg.locator('[data-vopen]').count():
        pg.locator('[data-vopen]').first.click()
        t.wait_for('.viewer')
    t.ck(pg.locator('.viewer').count() == 1,
         'на вкладке «Фото» просмотрщик не открывается закладкой «Документы»')

    # --- 6. окно фото литеры: категории чипами, три столбца, прокрутка ---
    t.open(ROUTE, wait='[data-open-oi]')
    t.wait(400)
    if t.ck(pg.locator('.ph-cell').count() > 0, 'в перечне нет ячейки с фото литеры'):
        pg.locator('.ph-cell').first.click()
        t.wait_for('.ph-pop')

        chips = pg.eval_on_selector_all('.ph-chip', 'els => els.map((e) => e.textContent.trim())')
        t.ck(len(chips) >= 2, 'в окне фото нет чипов категорий: %s' % chips)
        t.ck(pg.locator('.ph-chip.on').count() == 1, 'не отмечена активная категория')

        cols = pg.evaluate("""() => getComputedStyle(document.querySelector('.ph-pop-grid'))
            .gridTemplateColumns.split(' ').length""")
        t.ck(cols == 3, 'в окне фото не три столбца: %d' % cols)

        box = pg.evaluate("""() => {
          const b = document.querySelector('.ph-pop-body');
          return {view: b.clientHeight, full: b.scrollHeight};
        }""")
        t.ck(box['view'] <= 360,
             'окно фото выше четырёх рядов: %d px' % box['view'])

        all_n = pg.locator('.ph-pop-item').count()
        pg.locator('.ph-chip').nth(1).click()
        t.wait(400)
        one_n = pg.locator('.ph-pop-item').count()
        t.ck(one_n < all_n, 'выбор категории не отфильтровал снимки: было %d, стало %d'
             % (all_n, one_n))
