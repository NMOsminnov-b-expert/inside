# -*- coding: utf-8 -*-
"""Экраны осмотрщика: список осмотров, задача, объект, осмотр ОИ, документы, фото.

Интерфейс осмотрщика — свои экраны, но АДАПТИВНЫЕ (задача пользователя
08.09.2026), поэтому сценарий работает на двух ширинах: телефонной (390) и
широкой (1280). Проверять только одну бессмысленно — раскладка на них разная.

Что сторожит сценарий:

  * переключатель «Ждут осмотра / Все мои» считает РАЗНОЕ. Первая версия
    считала оба числа из уже отфильтрованного списка, и «Все мои» показывало
    число ждущих — то есть счётчик врал именно там, где по нему принимают
    решение, ехать или нет;
  * нижняя панель: четыре раздела, у открытого выставлен aria-selected, и
    переход по каждому меняет адрес. Раздел живёт В АДРЕСЕ — иначе кнопка
    «назад» на телефоне выбрасывала бы из задачи целиком;
  * карточка ОЦ у осмотрщика ТОЛЬКО ДЛЯ ЧТЕНИЯ: правки вносит ЦОД, а свои
    значения осмотрщик пишет в осмотре объекта имущества. Полей ввода в
    разделе «Объект» быть не должно ни одного;
  * осмотр ведётся ПО ОБЪЕКТУ ИМУЩЕСТВА (как в рабочей системе): у каждого ОИ
    свой набор значений, и заполненное у одного не подставляется другому;
  * поля осмотра строятся из ОПИСАНИЯ (kernel/fieldSchema.js + form.js) — в
    сценарии проверяются и сами чипы, и то, что повторное нажатие снимает
    выбор (на телефоне это единственный способ исправить ошибочное касание);
  * снимок привязывается к объекту имущества, а не только к категории: фото
    кровли без литеры не отличить от фото кровли соседней литеры;
  * перенос и удаление снимка живут в полноэкранном просмотре — в сетке для
    них нет ширины;
  * размер нажимаемых элементов на телефоне: не меньше 44 пикселей по меньшей
    стороне (Android 48dp, iOS 44pt). Ломается первым при любой правке
    вёрстки, а на улице непопадание по кнопке стоит дороже, чем в офисе;
  * ничего не уезжает за правый край: горизонтальная прокрутка на телефоне
    означает, что часть интерфейса недоступна;
  * на широком экране разделы уходят НАД содержимым, а поля встают в несколько
    колонок — иначе адаптивности нет, есть растянутый телефон.
"""
import base64
import os
import tempfile

NAME = 'экраны осмотрщика'

# Файлы, после правки которых сценарий обязателен (отбор в run.py --changed).
TOUCHES = (
    'app/pages/inspector/*', 'app/kernel/fieldSchema.js',
    'app/kernel/fileUpload.js', 'app/kernel/tokens.css',
)

PHONE = {'width': 390, 'height': 844}
WIDE = {'width': 1280, 'height': 900}

TASK = '#/insp/civil/oc-cv-1'
ASSET = TASK + '/object/oi-cv1-a'

# Разделы задачи и признак, по которому видно, что открылся нужный.
SECTIONS = [
    ('task', 'Куда ехать'),
    ('object', 'Объекты имущества'),
    ('docs', 'Документы'),
    ('photo', 'Категория съёмки'),
]

# Что должно быть нажимаемо пальцем. Селекторы, а не «все кнопки»: у скрытых и
# служебных элементов размер не важен, а ложный провал хуже отсутствия проверки.
TAP_SELECTORS = ['.ins-tab', '.ins-back', '.ins-btn', '.ins-seg-b', '.ins-oi-h',
                 '.ins-select', '.ins-chip']

MIN_TAP = 44

# Снимок для проверки загрузки: 8×8 пикселей, генерируется на месте. Бинарь в
# репозиторий тащить незачем, а настоящий файл нужен — Playwright отдаёт его
# полю выбора файла ровно так же, как это делает телефон.
PNG_8x8 = base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAJ0lEQVR4nGP8z8DAwMDAxIAGWBg'
    'YGBgY/jMwMDAw/GdgYGBgYPgPADzWBB0e3n8XAAAAAElFTkSuQmCC')


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

    was = cards.count()
    pg.locator('[data-only="0"]').click()
    t.wait_until('() => document.querySelectorAll(".ins-card-a").length >= %d' % (was + 1))
    t.ck(pg.locator('.ins-card-a').count() > was,
         'режим «Все мои» показал не больше задач, чем «Ждут осмотра»')

    # --- 2. задача: куда ехать ---
    t.open(TASK, wait='.ins-body')
    t.wait(300)

    t.ck(_has(t, 'Куда ехать'), 'в задаче нет блока «Куда ехать»')
    t.ck(pg.locator('.ins-map-gps').count() == 1, 'в задаче не показаны координаты объекта')

    href = pg.get_attribute('[data-open-map]', 'href') or ''
    t.ck(href.startswith('geo:'),
         'ссылка на карты не geo: — на телефоне её не подхватит приложение карт: %s' % href[:40])
    t.ck(pg.locator('[data-copy-gps]').count() == 1, 'нет кнопки «скопировать координаты»')
    t.ck(pg.locator('.ins-strip').count() == 1, 'статус объекта не показан полосой под шапкой')

    # --- 3. переключение разделов ---
    for key, marker in SECTIONS:
        href = TASK if key == 'task' else TASK + '/' + key
        pg.locator('.ins-tab[href="%s"]' % href).click()
        t.wait_until('() => location.hash === "%s"' % href)
        t.wait(250)

        t.ck(_has(t, marker), 'раздел «%s» не открылся (нет «%s»)' % (key, marker))
        t.ck(pg.evaluate('() => location.hash') == href,
             'раздел «%s» не попал в адрес' % key)

        on = pg.eval_on_selector_all('.ins-tab.on', 'els => els.length')
        t.ck(on == 1, 'в панели разделов отмечен не один раздел: %d' % on)

        sel = pg.eval_on_selector_all('.ins-tab[aria-selected="true"]', 'els => els.length')
        t.ck(sel == 1, 'aria-selected выставлен не одному разделу: %d' % sel)

    # --- 4. карточка ОЦ у осмотрщика — только для чтения ---
    t.open(TASK + '/object', wait='.ins-oi')
    t.wait(300)

    edits = pg.eval_on_selector_all(
        '.ins input, .ins textarea, .ins select',
        'els => els.map((e) => e.tagName.toLowerCase() + "." + (e.className || ""))')
    t.ck(not edits, 'в разделе «Объект» есть поля ввода — данные ЦОД только для чтения: %s' % edits)
    t.ck(_has(t, 'только для просмотра'),
         'не сказано, что данные ЦОД открыты только для просмотра')

    t.ck(pg.locator('.ins-oi-i').count() >= 1, 'в разделе «Объект» нет ни одного ОИ')

    first = pg.locator('.ins-oi-h').first
    first.click()
    t.wait_for('.ins-oi-b')
    t.ck(pg.locator('.ins-oi-b').count() == 1, 'по нажатию ОИ не раскрылся')
    t.ck(pg.locator('.ins-oi-i.on').count() == 1, 'раскрытый ОИ не помечен')
    t.ck(pg.locator('.ins-oi-go').count() == 1, 'из раскрытого ОИ нельзя перейти в его осмотр')

    pg.locator('.ins-oi-h').first.click()
    t.wait_until('() => document.querySelectorAll(".ins-oi-b").length === 0')
    t.ck(pg.locator('.ins-oi-b').count() == 0, 'повторное нажатие не закрыло ОИ')

    # Висячий разделитель: у движимого имущества статуса нет, и строка не должна
    # начинаться с точки. Подпись ОИ должна называть вид — литера, механизм,
    # участок (требование пользователя 08.09.2026).
    subs = pg.eval_on_selector_all('.ins-oi-sub', 'els => els.map((e) => e.textContent.trim())')
    bad = [x for x in subs if x.startswith('·') or x.endswith('·')]
    t.ck(not bad, 'у ОИ висячий разделитель в подписи: %s' % bad)

    heads = pg.eval_on_selector_all('.ins-oi-t b', 'els => els.map((e) => e.textContent.trim())')
    t.ck(any('Литера' in x for x in heads), 'ни один ОИ не назван литерой: %s' % heads[:4])
    t.ck(any(('Механизм' in x) or ('Офисная техника' in x) or ('Транспортное' in x) for x in heads),
         'движимое имущество не названо своим видом: %s' % heads[:6])

    # --- 5. осмотр объекта имущества: поля из описания ---
    t.open(ASSET, wait='.ins-fs-grid')
    t.wait(300)

    chips = pg.locator('.ins-chip')
    t.ck(chips.count() > 10, 'полей-чипов в осмотре подозрительно мало: %d' % chips.count())
    t.ck(_has(t, 'Чек-лист коммуникаций'), 'нет чек-листа коммуникаций')
    t.ck(_has(t, 'Не удалось установить'),
         'в шкале наличия сетей нет варианта «Не удалось установить» (шкала рабочей системы)')
    t.ck(pg.locator('.ins-fs-req').count() >= 5, 'обязательные поля не помечены')

    left_before = pg.locator('.ins-sum').inner_text()
    chips.first.click()
    t.wait_until('() => document.querySelectorAll(".ins-chip.on").length === 1')
    t.ck(pg.locator('.ins-chip.on').count() == 1, 'выбор чипа не отметился')
    t.ck(pg.locator('.ins-sum').inner_text() != left_before,
         'счётчик обязательных полей не изменился после заполнения')

    # Повторное нажатие снимает выбор — иначе ошибочное касание не исправить.
    pg.locator('.ins-chip.on').first.click()
    t.wait_until('() => document.querySelectorAll(".ins-chip.on").length === 0')
    t.ck(pg.locator('.ins-chip.on').count() == 0, 'повторное нажатие не сняло выбор')

    # Замеры: поле с единицей и подсказка «по документам» — расхождение должно
    # быть видно на месте (решение пользователя 08.09.2026).
    t.ck(pg.locator('.ins-num').count() >= 4, 'нет полей замеров')
    t.ck(pg.locator('.ins-num-u').count() >= 4, 'у замеров нет единиц измерения')
    t.ck(_has(t, 'по документам'),
         'рядом с замером не показано значение по документам')

    pg.fill('.ins-num', '1234.5')
    t.wait(200)
    t.ck(pg.input_value('.ins-num') == '1234.5', 'замер не вводится')

    # Значения у каждого ОИ свои: заполненное у литеры не должно появиться у
    # другого объекта имущества.
    t.open(TASK + '/object/oi-cv1-b', wait='.ins-fs-grid')
    t.wait(250)
    t.ck(pg.input_value('.ins-num') == '',
         'значения осмотра общие для разных ОИ — должны быть у каждого свои')

    # --- 6. фото: привязка к объекту имущества, перенос, удаление ---
    t.open(TASK + '/photo', wait='[data-shoot]')
    t.wait(250)
    t.ck(pg.locator('[data-oi-pick] option').count() >= 2,
         'нет выбора объекта имущества для снимка')
    t.ck(pg.locator('[data-cat] option').count() >= 3, 'мало категорий съёмки')
    t.ck(_has(t, 'из 250'), 'не показан лимит снимков из ТЗ')

    shot = os.path.join(tempfile.gettempdir(), 'inside-check-shot.png')
    with open(shot, 'wb') as f:
        f.write(PNG_8x8)

    oi_label = pg.eval_on_selector('[data-oi-pick] option', 'e => e.textContent.trim()')
    pg.select_option('[data-cat]', 'Кровля')
    with pg.expect_file_chooser() as fc:
        pg.locator('[data-shoot]').click()
    fc.value.set_files(shot)

    if t.ck(t.wait_for('.ins-shot'), 'снимок не появился в сетке'):
        t.ck(pg.locator('.ins-shot').count() == 1,
             'снимков в сетке не один: %d' % pg.locator('.ins-shot').count())

        # Группа — по объекту имущества, внутри подпись категории. Первый блок
        # экрана (выбор объекта и категории) заголовка не имеет, поэтому
        # заголовок группы — самый первый .ins-blk-h.
        group = pg.locator('.ins-blk-h').first.inner_text()
        t.ck(oi_label.split('·')[0].strip().lower() in group.lower(),
             'снимок не сгруппирован по объекту имущества: «%s» вместо «%s»' % (group, oi_label))
        t.ck('кровля' in pg.locator('.ins-shots-h').first.inner_text().lower(),
             'снимок попал не в выбранную категорию: %s'
             % pg.locator('.ins-shots-h').first.inner_text())

        badge = pg.locator('.ins-tab[href$="photo"] .ins-tab-n')
        t.ck(badge.count() == 1 and badge.inner_text().strip() == '1',
             'счётчик снимков на вкладке не обновился')

        # Просмотр на весь экран: там же перенос и удаление.
        pg.locator('[data-shot]').first.click()
        if t.ck(t.wait_for('.ins-lb img'), 'снимок не открылся на весь экран'):
            t.ck(pg.locator('[data-move-oi]').count() == 1,
                 'из просмотра нельзя привязать снимок к другому объекту')
            t.ck(pg.locator('[data-move]').count() == 1,
                 'из просмотра нельзя перенести снимок в другую категорию')

            pg.select_option('[data-move]', 'Фасад')
            t.wait_until('() => /фасад/i.test(document.body.innerText)')
            t.ck('фасад' in pg.locator('.ins-shots-h').first.inner_text().lower(),
                 'снимок не переехал в другую категорию')

            # Удаление — через подтверждение: снимок пропадает безвозвратно.
            pg.locator('[data-shot]').first.click()
            t.wait_for('.ins-lb img')
            pg.locator('[data-drop]').first.click()
            if t.ck(t.wait_for('.modal'), 'удаление снимка не спросило подтверждения'):
                pg.locator('[data-modal-ok]').last.click()
                t.wait_until('() => document.querySelectorAll(".ins-shot").length === 0')
                t.ck(pg.locator('.ins-shot').count() == 0, 'снимок не удалился')

    # --- 7. пальцем попадают: размер нажимаемых элементов ---
    for route in ('#/insp', TASK, TASK + '/object', ASSET, TASK + '/photo'):
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

        over = pg.evaluate("""() => {
          const d = document.scrollingElement;
          const c = document.querySelector('#content');
          return Math.max(d.scrollWidth - d.clientWidth,
                          c ? c.scrollWidth - c.clientWidth : 0);
        }""")
        t.ck(over <= 1, '%s: содержимое шире экрана на %d px' % (route, over))

    # --- 8. адаптивность: широкий экран раскладывается иначе ---
    pg.set_viewport_size(WIDE)
    t.open(ASSET, wait='.ins-fs-grid')
    t.wait(300)

    pos = pg.evaluate("""() => {
      const t = document.querySelector('.ins-tabs').getBoundingClientRect();
      const b = document.querySelector('.ins-body').getBoundingClientRect();
      const cols = getComputedStyle(document.querySelector('.ins-fs-grid'))
        .gridTemplateColumns.split(' ').length;
      return { tabsY: Math.round(t.y), bodyY: Math.round(b.y), cols };
    }""")
    t.ck(pos['tabsY'] < pos['bodyY'],
         'на широком экране разделы остались под содержимым (%d против %d)'
         % (pos['tabsY'], pos['bodyY']))
    t.ck(pos['cols'] >= 2,
         'на широком экране поля идут одной колонкой — адаптивности нет: %d' % pos['cols'])

    over = pg.evaluate("""() => {
      const c = document.querySelector('#content');
      return c ? c.scrollWidth - c.clientWidth : 0;
    }""")
    t.ck(over <= 1, 'на широком экране содержимое шире окна на %d px' % over)
