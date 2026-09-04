# -*- coding: utf-8 -*-
"""Свои выпадающие списки (kernel/dropdown.js).

Что держит сценарий (решение пользователя 03.09.2026 «селекторы пишем свои и
применяем»):
  * нативных <select class="select"> на экранах не остаётся — каждый заменён
    кнопкой со своим списком;
  * выбор мышью и с клавиатуры доходит до настоящего селекта и вызывает change
    (то есть обработчики страниц срабатывают);
  * подпись кнопки обновляется и когда значение поставили мимо списка —
    программно или через select_option в других проверках;
  * список рисуется в <body> и не обрезается прокручиваемой панелью — раньше
    ровно на этом он и пропадал (имя класса .dd было занято меню-кнопками);
  * подсказка от наведения на кнопку не перекрывает первый пункт.
"""
NAME = 'выпадающие списки'

SCREENS = [
    ('#/institutions', '.itree'),
    ('#/docs', '[data-doc-row]'),
    ('#/dicts', '.dc-col'),
    ('#/oc/civil/oc-cv-1', 'tr[data-open-oi]'),
]


def run(t):
    pg = t.page

    # --- 1. нативных списков не остаётся ни на одном экране ---
    for route, wait in SCREENS:
        t.open(route, wait=wait)
        pg.wait_for_timeout(500)
        left = pg.locator('select.select').count()
        t.ck(left == 0, '%s: остались нативные списки: %d' % (route, left))

    # --- 2. карточка ОИ: списки прокачаны, выбор доходит до данных ---
    t.open('#/oc/civil/oc-cv-1', wait='tr[data-open-oi]')
    pg.locator('tr[data-open-oi]').first.click()
    pg.wait_for_selector('.pick-btn', timeout=15000)
    pg.wait_for_timeout(600)

    btns = pg.locator('.pick-btn')
    t.ck(btns.count() > 3, 'в карточке ОИ мало своих списков: %d' % btns.count())
    t.ck(pg.locator('select.pick-native').count() == btns.count(),
         'кнопок и нативных селектов разное количество')

    # --- 3. учреждения: выбор мышью меняет выборку ---
    t.open('#/institutions', wait='.itree')
    pg.wait_for_timeout(600)
    pg.locator('.itree-row[data-inode]').first.click()
    pg.wait_for_timeout(300)
    pg.locator('[data-itab="all"]').click()
    pg.wait_for_timeout(700)

    before = pg.locator('[data-all-row]').count()
    stale = pg.locator('.iall-stale .pick-btn').first
    t.ck(stale.count() == 1, 'поле «без движения» не заменено своим списком')

    stale.click()
    pg.wait_for_timeout(300)
    menu = pg.locator('.pick-menu')
    t.ck(menu.count() == 1, 'список не раскрылся')
    t.ck(menu.locator('.pick-opt').count() >= 4,
         'в списке меньше пунктов, чем в селекте: %d' % menu.locator('.pick-opt').count())
    # Список живёт в <body>, иначе его обрезала бы колонка фильтров.
    t.ck(pg.eval_on_selector('.pick-menu', 'e => e.parentElement.tagName') == 'BODY',
         'список нарисован не в <body> — его обрежет прокрутка панели')
    # Первый пункт должен быть кликабелен: подсказка не должна его накрывать.
    t.ck(menu.locator('.pick-opt').first.is_visible(), 'первый пункт списка не виден')

    # Один ползунок, а не два. Высоту раньше ограничивали и меню, и список
    # внутри него, причём меню было ниже суммы своего содержимого — рядом
    # появлялись две полосы прокрутки (замечание пользователя 04.09.2026,
    # вскрылось при добавлении пункта в справочник серий).
    box = pg.evaluate('''() => {
      const menu = document.querySelector('.pick-menu');
      const st = getComputedStyle(menu);
      const scrollers = [menu, ...menu.querySelectorAll('*')]
        .filter((el) => {
          const s = getComputedStyle(el);
          return (s.overflowY === 'auto' || s.overflowY === 'scroll');
        })
        .map((el) => el.className);
      return { menuOverflow: st.overflowY, scrollers };
    }''')
    t.ck(box['menuOverflow'] not in ('auto', 'scroll'),
         'само меню списка прокручивается — это второй ползунок: overflow-y=%s'
         % box['menuOverflow'])
    t.ck(len(box['scrollers']) <= 1,
         'в списке больше одной полосы прокрутки: %s' % box['scrollers'])

    # Интерактивность пунктов (замечание пользователя 04.09.2026): подсказка
    # только у пункта, чей текст не уместился, и подсветка идёт за мышью.
    # Раньше title стоял у каждого пункта — подсказка всплывала над каждым,
    # повторяя видимое и закрывая соседние строки, а наведение не подсвечивало
    # ничего: пометка двигалась только с клавиатуры.
    hints = pg.evaluate("""() => {
      const els = [...document.querySelectorAll('.pick-opt')];
      return {
        titled: els.filter((e) => e.hasAttribute('title')).length,
        clipped: els.filter((e) => e.scrollWidth > e.clientWidth + 1).length,
      };
    }""")
    t.ck(hints['titled'] == hints['clipped'],
         'подсказки не по обрезке текста: с подсказкой %d, обрезано %d'
         % (hints['titled'], hints['clipped']))

    menu.locator('.pick-opt').nth(2).hover()
    pg.wait_for_timeout(300)
    hover = pg.evaluate("""() => {
      const els = [...document.querySelectorAll('.pick-opt')];
      const h = els.find((e) => e.matches(':hover'));
      return {
        marked: h ? h.classList.contains('cursor') : false,
        total: els.filter((e) => e.classList.contains('cursor')).length,
      };
    }""")
    t.ck(hover['marked'], 'пункт под мышью не подсвечен')
    t.ck(hover['total'] == 1,
         'подсвечено несколько пунктов сразу: %d — непонятно, что выберет Enter'
         % hover['total'])

    menu.locator('.pick-opt').nth(2).click()
    pg.wait_for_timeout(600)
    t.ck(pg.locator('.pick-menu').count() == 0, 'после выбора список не закрылся')
    t.ck(pg.input_value('[data-all-stale-sel]') not in ('', '0'),
         'выбор мышью не дошёл до селекта')
    after = pg.locator('[data-all-row]').count()
    t.ck(after < before, 'выбор в списке не изменил выборку: %d и %d' % (before, after))
    t.ck('дн' in stale.inner_text() or 'год' in stale.inner_text(),
         'подпись кнопки не обновилась: %s' % stale.inner_text())

    # --- 4. клавиатура ---
    prev = pg.input_value('[data-all-stale-sel]')
    stale.click()
    pg.wait_for_timeout(250)
    pg.keyboard.press('ArrowDown')
    pg.keyboard.press('Enter')
    pg.wait_for_timeout(500)
    t.ck(pg.input_value('[data-all-stale-sel]') != prev,
         'стрелка и Enter не меняют значение')

    stale.click()
    pg.wait_for_timeout(250)
    pg.keyboard.press('Escape')
    pg.wait_for_timeout(300)
    t.ck(pg.locator('.pick-menu').count() == 0, 'Escape не закрывает список')

    # --- 5. значение, выставленное мимо списка ---
    pg.locator('.itree-row[data-inode]').nth(1).click()
    pg.wait_for_timeout(400)
    if t.ck(pg.locator('[data-iedit]').count() > 0, 'у узла нет правки'):
        pg.locator('[data-iedit]').first.click()
        pg.wait_for_timeout(500)

        people = pg.eval_on_selector_all('[data-iform-staff="gov"] option',
                                         'els => els.map((e) => e.textContent.trim())')
        if t.ck(len(people) > 1, 'в списке сотрудников нет вариантов'):
            pg.select_option('[data-iform-staff="gov"]', people[1])
            pg.wait_for_timeout(400)
            label = pg.locator('[data-iform-staff="gov"] ~ .pick-btn').first.inner_text().strip()
            t.ck(label == people[1],
                 'подпись кнопки не увидела значение, выставленное мимо списка: %s' % label)
