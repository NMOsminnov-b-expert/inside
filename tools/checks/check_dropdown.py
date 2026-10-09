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

# Файлы, после правки которых сценарий обязателен (отбор в run.py --changed).
TOUCHES = (
    'app/kernel/dropdown.js', 'app/kernel/overflowTip.js',
    'app/kernel/multiSelect.js', 'app/pages/*', 'app/modules/*/oi/*',
    'app/modules/*/card/*',
)

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
        t.wait(500)
        left = pg.locator('select.select').count()
        t.ck(left == 0, '%s: остались нативные списки: %d' % (route, left))

    # --- 2. карточка ОИ: списки прокачаны, выбор доходит до данных ---
    t.open('#/oc/civil/oc-cv-1', wait='tr[data-open-oi]')
    pg.locator('tr[data-open-oi]').first.click()
    pg.wait_for_selector('.pick-btn', timeout=15000)
    t.wait(600)

    btns = pg.locator('.pick-btn')
    t.ck(btns.count() > 3, 'в карточке ОИ мало своих списков: %d' % btns.count())
    t.ck(pg.locator('select.pick-native').count() == btns.count(),
         'кнопок и нативных селектов разное количество')

    # --- 3. учреждения: выбор мышью меняет выборку ---
    # Ждём по факту — строку дерева, выбор узла, вкладку: фиксированные 0,6 и
    # 0,3 с под нагрузкой полного прогона не хватало (флак 09.10.2026).
    t.open('#/institutions', wait='.itree-row[data-inode]')
    if not t.ck(pg.locator('.itree-row[data-inode] .itree-name').count() > 0, 'учреждения: дерево не нарисовалось: %s | %s'
                % (pg.evaluate('location.hash'), pg.evaluate("() => document.querySelector('#content').innerText.slice(0, 300)"))):
        return
    # Экран в покое сам себя не перерисовывает: щелчок по дереву под нагрузкой
    # полного прогона падал с «element was detached from the DOM» (флак
    # 09.10.2026). Если это повторится — увидим, перерисовка ли тому виной.
    probe = pg.evaluate("""() => new Promise((res) => { let n = 0, r = 0, saved = 0; const who = [];
      const c = document.querySelector('#content');
      const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
      Object.defineProperty(c, 'innerHTML', { configurable: true, get() { return desc.get.call(this); },
        set(v) { who.push((new Error().stack || '').split(String.fromCharCode(10)).slice(2, 7).map((x) => x.trim()).join(' < ')); desc.set.call(this, v); } });
      const mo = new MutationObserver(() => { n++; }); mo.observe(c, { childList: true });
      const f = () => { r++; }; window.addEventListener('inside:redraw', f);
      const g = () => { saved++; }; document.addEventListener('inside:saved', g);
      setTimeout(() => { mo.disconnect(); window.removeEventListener('inside:redraw', f); document.removeEventListener('inside:saved', g);
        delete c.innerHTML; res({ rerender: n, redraw: r, saved, who }); }, 2000); })""")
    t.ck(probe['rerender'] == 0, 'учреждения: экран перерисовывается сам: %s' % probe)
    # По названию узла, а не в середину строки: там бывают кнопка «избранное» и
    # счётчик, и щелчок мимо названия узел не выбирал.
    pg.locator('.itree-row[data-inode] .itree-name').first.click()
    if not t.ck(t.wait_until("() => !!document.querySelector('.itree-row.on[data-inode]')"),
                'учреждения: узел не выбрался по щелчку'):
        return
    if not t.ck(t.wait_for('[data-itab="all"]'), 'учреждения: нет вкладки «С подведомственными»: %s'
                % pg.evaluate("() => document.querySelector('#content').innerText.slice(0, 200)")):
        return
    pg.locator('[data-itab="all"]').click()
    # Вкладка «все объекты» собирает выборку и подменяет её поля своими
    # списками уже после отрисовки, поэтому ждём поле ПО ФАКТУ. Отсчёт времени
    # тут держался на скорости машины: 07.09.2026 при загруженной машине поле
    # не успевало, проверка падала, а следующий клик по отсутствующему полю
    # висел до 30-секундного предела Playwright — один этот флак съедал 40 с
    # прогона.
    t.wait_for('.iall-stale .pick-btn')

    before = pg.locator('[data-all-row]').count()
    stale = pg.locator('.iall-stale .pick-btn').first
    t.ck(stale.count() == 1, 'поле «без движения» не заменено своим списком')

    stale.click()
    t.wait(300)
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
    t.wait(300)
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
    t.wait(600)
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
    t.wait(250)
    pg.keyboard.press('ArrowDown')
    pg.keyboard.press('Enter')
    t.wait(500)
    t.ck(pg.input_value('[data-all-stale-sel]') != prev,
         'стрелка и Enter не меняют значение')

    stale.click()
    t.wait(250)
    pg.keyboard.press('Escape')
    t.wait(300)
    t.ck(pg.locator('.pick-menu').count() == 0, 'Escape не закрывает список')

    # --- 5. значение, выставленное мимо списка ---
    pg.locator('.itree-row[data-inode] .itree-name').nth(1).click()
    t.wait(400)
    if t.ck(pg.locator('[data-iedit]').count() > 0, 'у узла нет правки'):
        pg.locator('[data-iedit]').first.click()
        t.wait(500)

        people = pg.eval_on_selector_all('[data-iform-staff="gov"] option',
                                         'els => els.map((e) => e.textContent.trim())')
        if t.ck(len(people) > 1, 'в списке сотрудников нет вариантов'):
            pg.select_option('[data-iform-staff="gov"]', people[1])
            t.wait(400)
            label = pg.locator('[data-iform-staff="gov"] ~ .pick-btn').first.inner_text().strip()
            t.ck(label == people[1],
                 'подпись кнопки не увидела значение, выставленное мимо списка: %s' % label)
