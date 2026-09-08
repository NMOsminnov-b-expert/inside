# -*- coding: utf-8 -*-
"""Экраны осмотрщика: список осмотров, задача, объект, документы, фото.

Интерфейс мобильный и отдельный от настольного (решение пользователя
08.09.2026), поэтому сценарий работает на телефонной ширине — 390 пикселей.
На настольной ширине эти экраны выглядят иначе, и проверять их там бессмысленно.

Что сторожит сценарий:

  * переключатель «Ждут осмотра / Все мои» считает РАЗНОЕ. Первая версия
    считала оба числа из уже отфильтрованного списка, и «Все мои» показывало
    число ждущих — то есть счётчик врал именно там, где по нему принимают
    решение, ехать или нет;
  * нижняя панель: четыре раздела, у открытого выставлен aria-selected, и
    переход по каждому меняет адрес. Раздел живёт В АДРЕСЕ — иначе кнопка
    «назад» на телефоне выбрасывала бы из задачи целиком;
  * карточка ОЦ у осмотрщика ТОЛЬКО ДЛЯ ЧТЕНИЯ: правки вносит ЦОД. Полей ввода
    в разделе «Объект» быть не должно ни одного;
  * размер нажимаемых элементов: не меньше 44 пикселей по меньшей стороне
    (Android 48dp, iOS 44pt). Это ломается первым при любой правке вёрстки, а
    на улице непопадание по кнопке стоит дороже, чем в офисе;
  * ничего не уезжает за правый край: горизонтальная прокрутка на телефоне
    означает, что часть интерфейса недоступна;
  * каркас настольного окна (боковое меню, крошки, ящик заметок) на этих
    экранах скрыт — иначе на 390 пикселях от самого экрана не остаётся места.
"""
NAME = 'экраны осмотрщика'

# Файлы, после правки которых сценарий обязателен (отбор в run.py --changed).
TOUCHES = (
    'app/pages/inspector/*', 'app/kernel/fileUpload.js', 'app/kernel/tokens.css',
)

PHONE = {'width': 390, 'height': 844}

# Разделы задачи и признак, по которому видно, что открылся нужный.
SECTIONS = [
    ('task', 'Куда ехать'),
    ('object', 'Объекты имущества'),
    ('docs', 'Документы'),
    ('photo', 'Категория съёмки'),
]

# Что должно быть нажимаемо пальцем. Селекторы, а не «все кнопки»: у скрытых и
# служебных элементов размер не важен, а ложный провал хуже отсутствия проверки.
TAP_SELECTORS = ['.ins-tab', '.ins-back', '.ins-btn', '.ins-seg-b', '.ins-oi-h', '.ins-select']

MIN_TAP = 44


def _has(t, text):
    """Есть ли текст на экране, независимо от регистра.

    Заголовки блоков подняты в верхний регистр стилями (text-transform), и
    innerText возвращает их уже такими — сравнение «как написано в разметке»
    здесь всегда ложно.
    """
    return text.lower() in t.text().lower()


def run(t):
    pg = t.page
    pg.set_viewport_size(PHONE)

    # --- 1. список осмотров ---
    t.open('#/insp', wait='.ins-list, .ins-empty')
    t.wait(300)

    t.ck(pg.locator('.ins').count() == 1, 'экран осмотрщика не открылся')
    t.ck(pg.locator('.sidebar').first.is_visible() is False,
         'на экране осмотрщика видно боковое меню настольного каркаса')

    segs = pg.eval_on_selector_all(
        '.ins-seg-b', 'els => els.map((e) => e.textContent.trim())')
    t.ck(len(segs) == 2, 'в переключателе списка не два режима: %s' % segs)

    nums = []
    for s in segs:
        digits = ''.join(ch for ch in s if ch.isdigit())
        nums.append(int(digits) if digits else 0)

    t.ck(nums[1] > 0, 'в «Все мои» нет ни одного осмотра: %s' % segs)
    # Ждущих осмотра меньше, чем всех: если числа равны, счётчик снова считает
    # оба из одного отфильтрованного списка.
    t.ck(nums[0] < nums[1],
         'счётчики режимов совпали (%s) — «Все мои» считает отфильтрованный список' % segs)

    cards = pg.locator('.ins-card-a')
    t.ck(cards.count() >= 1, 'в списке нет ни одной задачи')

    # Переключение на «Все мои» показывает больше карточек, чем «Ждут осмотра».
    was = cards.count()
    pg.locator('[data-only="0"]').click()
    t.wait_until('() => document.querySelectorAll(".ins-card-a").length >= %d' % (was + 1))
    t.ck(pg.locator('.ins-card-a').count() > was,
         'режим «Все мои» показал не больше задач, чем «Ждут осмотра»')

    # --- 2. задача: куда ехать ---
    t.open('#/insp/civil/oc-cv-1', wait='.ins-body')
    t.wait(300)

    t.ck(_has(t, 'Куда ехать'), 'в задаче нет блока «Куда ехать»')
    t.ck(pg.locator('.ins-map-gps').count() == 1, 'в задаче не показаны координаты объекта')

    href = pg.get_attribute('[data-open-map]', 'href') or ''
    t.ck(href.startswith('geo:'),
         'ссылка на карты не geo: — на телефоне её не подхватит приложение карт: %s' % href[:40])
    t.ck(pg.locator('[data-copy-gps]').count() == 1, 'нет кнопки «скопировать координаты»')
    t.ck(pg.locator('.ins-strip').count() == 1, 'статус объекта не показан полосой под шапкой')

    # --- 3. переключение разделов ---
    base = '#/insp/civil/oc-cv-1'
    for key, marker in SECTIONS:
        href = base if key == 'task' else base + '/' + key
        pg.locator('.ins-tab[href="%s"]' % href).click()
        t.wait_until('() => location.hash === "%s"' % href)
        t.wait(250)

        t.ck(_has(t, marker), 'раздел «%s» не открылся (нет «%s»)' % (key, marker))

        # Раздел должен быть в адресе: назад на телефоне возвращает по разделам.
        t.ck(pg.evaluate('() => location.hash') == href,
             'раздел «%s» не попал в адрес' % key)

        on = pg.eval_on_selector_all(
            '.ins-tab.on', 'els => els.map((e) => e.textContent.replace(/\\s+/g, " ").trim())')
        t.ck(len(on) == 1, 'в нижней панели отмечен не один раздел: %s' % on)

        sel = pg.eval_on_selector_all(
            '.ins-tab[aria-selected="true"]', 'els => els.length')
        t.ck(sel == 1, 'aria-selected выставлен не одному разделу: %d' % sel)

    # --- 4. карточка ОЦ у осмотрщика — только для чтения ---
    t.open('#/insp/civil/oc-cv-1/object', wait='.ins-oi')
    t.wait(300)

    edits = pg.eval_on_selector_all(
        '.ins input, .ins textarea, .ins select',
        'els => els.map((e) => e.tagName.toLowerCase() + "." + (e.className || ""))')
    t.ck(not edits, 'в разделе «Объект» есть поля ввода — карточка должна быть только для чтения: %s' % edits)
    t.ck(_has(t, 'Только для просмотра'),
         'не сказано, что карточка открыта только для просмотра')

    rows = pg.locator('.ins-oi-i')
    t.ck(rows.count() >= 1, 'в разделе «Объект» нет ни одного ОИ')

    # Литера раскрывается по нажатию и закрывается повторным.
    first = pg.locator('.ins-oi-h').first
    first.click()
    t.wait_for('.ins-oi-b')
    t.ck(pg.locator('.ins-oi-b').count() == 1, 'по нажатию литера не раскрылась')
    t.ck(pg.locator('.ins-oi-i.on').count() == 1, 'раскрытая литера не помечена')

    pg.locator('.ins-oi-h').first.click()
    t.wait_until('() => document.querySelectorAll(".ins-oi-b").length === 0')
    t.ck(pg.locator('.ins-oi-b').count() == 0, 'повторное нажатие не закрыло литеру')

    # Висячий разделитель: у движимого имущества статуса нет, и строка не должна
    # начинаться с точки.
    subs = pg.eval_on_selector_all(
        '.ins-oi-sub', 'els => els.map((e) => e.textContent.trim())')
    bad = [x for x in subs if x.startswith('·') or x.endswith('·')]
    t.ck(not bad, 'у ОИ висячий разделитель в подписи: %s' % bad)

    # --- 5. фото: выбор категории и кнопка съёмки ---
    t.open('#/insp/civil/oc-cv-1/photo', wait='[data-shoot]')
    t.wait(250)
    t.ck(pg.locator('[data-cat] option').count() >= 3, 'мало категорий съёмки')
    t.ck(pg.locator('[data-shoot]').count() == 1, 'нет кнопки съёмки')
    t.ck(_has(t, 'из 250'), 'не показан лимит снимков из ТЗ')

    # --- 6. пальцем попадают: размер нажимаемых элементов ---
    for route in ('#/insp', '#/insp/civil/oc-cv-1', '#/insp/civil/oc-cv-1/object',
                  '#/insp/civil/oc-cv-1/photo'):
        t.open(route, wait='.ins-body')
        t.wait(250)

        small = pg.evaluate("""([sels, min]) => {
          const out = [];
          sels.forEach((sel) => {
            document.querySelectorAll(sel).forEach((el) => {
              const r = el.getBoundingClientRect();
              if (!r.width || !r.height) return;            // скрытое не считаем
              const side = Math.min(r.width, r.height);
              if (side < min) out.push(sel + ' ' + Math.round(side) + 'px');
            });
          });
          return out;
        }""", [TAP_SELECTORS, MIN_TAP])
        t.ck(not small, '%s: мелкие цели нажатия (нужно %d px): %s'
             % (route, MIN_TAP, small[:4]))

        # Горизонтальной прокрутки быть не должно: часть экрана стала бы
        # недоступной, а на телефоне это не заметно до самого осмотра.
        over = pg.evaluate("""() => {
          const d = document.scrollingElement;
          const c = document.querySelector('#content');
          return Math.max(d.scrollWidth - d.clientWidth,
                          c ? c.scrollWidth - c.clientWidth : 0);
        }""")
        t.ck(over <= 1, '%s: содержимое шире экрана на %d px' % (route, over))
