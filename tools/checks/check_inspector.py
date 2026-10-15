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
  * состав разделов и перечни значений совпадают с рабочей системой
    (inside.html в корне): чек-лист, износ, замеры, конструктивные элементы,
    помещения, комментарии и «Сохранить осмотр» внизу;
  * объект, выявленный на осмотре, помечается признаком и принимает
    наименование с заметкой — по признаку ЦОД видит, что объект пришёл с
    осмотра, а не заведён по документам;
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
TYPE, OC = 'civil', 'oc-cv-1'
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
TAP_SELECTORS = ['.ins-tab', '.ins-back', '.ins-btn', '.ins-seg-b', '.ins-oi-h', '.ins-gmap-t',
                 '.pick-btn', '.ms-control', '.ins-chip', '.ins-rows .ins-row', '.ins-acc-h']

MIN_TAP = 44

# Установка значения в скрытый нативный селект своего списка.

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

    # --- 0. разделы верхнего уровня (14.10.2026): «Сегодня · Задачи · Запросы ·
    # Уведомления»; по умолчанию — «Сегодня»; раздел в адресе.
    t.open('#/insp', wait='.ins-body')
    t.wait(300)
    t.ck(pg.locator('.ins').count() == 1, 'экран осмотрщика не открылся')
    t.ck(pg.locator('.sidebar').first.is_visible() is False,
         'на экране осмотрщика видно боковое меню настольного каркаса')
    tabs = pg.eval_on_selector_all('[data-home-tab]', 'els => els.map((e) => e.dataset.homeTab)')
    t.ck(tabs == ['today', 'tasks', 'cad', 'notes'], 'разделы верхнего уровня не те: %s' % tabs)
    t.ck(pg.get_attribute('[data-home-tab][aria-current="page"]', 'data-home-tab') == 'today', 'первым открылся не раздел «Сегодня»')
    pg.click('[data-home-tab="notes"]')
    t.ck(t.wait_until("() => location.hash.includes('tab=notes')"), 'раздел «Уведомления» не попал в адрес')

    # --- 1. список осмотров («Задачи») ---
    t.open('#/insp?tab=tasks', wait='.ins-list, .ins-empty')
    t.wait(300)

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
    # «Куда ехать» — карта участка и «Ехать» с выбором навигатора (14.10.2026):
    # раскрывается на месте, ссылки — маршрутом в Google, Яндекс, 2ГИС и geo:.
    t.ck(t.wait_for('[data-ins-map] .maplibregl-canvas'), 'в задаче нет карты участка')
    pg.click('[data-go-open="task"]')
    links = pg.evaluate("[...document.querySelectorAll('[data-go-pick=\"task\"]:not([hidden]) a')].map((a) => a.getAttribute('href'))")
    t.ck(len(links) == 4 and links[0].startswith('https://www.google.com/maps/dir/') and links[-1].startswith('geo:'),
         'выбор навигатора не раскрылся или ссылки не маршрутом: %s' % links)
    t.ck(_has(t, 'Участок по Кадастру'), 'в задаче нет блока «Участок по Кадастру»')
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

    # Только для чтения — про данные ЦОД: общие данные записи и перечень ОИ.
    # Раздел выявленных на осмотре объектов — это уже данные осмотрщика, поля
    # ввода там нужны.
    edits = pg.eval_on_selector_all(
        '.ins-oi input, .ins-oi textarea, .ins-oi select',
        'els => els.map((e) => e.tagName.toLowerCase() + "." + (e.className || ""))')
    t.ck(not edits, 'в перечне ОИ есть поля ввода — данные ЦОД только для чтения: %s' % edits)
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

    # --- 5. осмотр объекта имущества: разделы, чипы, списки, расхождения ---
    #
    # Форма переработана 08.09.2026: копия рабочей системы была простынёй из 28
    # полей, где «наружные стены» — 44 чипа. Теперь разделы свёрнуты, длинные
    # перечни идут списком, а расхождение с документами показывается сигналом.
    t.open(ASSET, wait='.ins-acc')
    t.wait(300)

    # Строение нежилого здания — блоки карточки литеры (15.10.2026): общие
    # параметры, площади и этажность, конструктив и износ, состояние, тип и
    # класс капитальности, комментарии.
    n = pg.locator('.ins-acc').count()
    t.ck(n == 6, 'разделов формы строения не шесть: %d' % n)

    # Все разделы открыты по умолчанию: свёрнутое заранее приходится
    # разворачивать, а на осмотре нужно заполнять (замечание пользователя
    # 08.09.2026).
    t.ck(pg.locator('.ins-acc.on').count() == n,
         'не все разделы открыты по умолчанию: %d из %d' % (pg.locator('.ins-acc.on').count(), n))

    # Свернуть можно руками — и развернуть обратно.
    pg.locator('[data-sec="struct"]').click()
    t.wait_until('([n]) => document.querySelectorAll(".ins-acc.on").length === n - 1', [n])
    t.ck(pg.locator('.ins-acc.on').count() == n - 1, 'раздел не свернулся по нажатию')
    pg.locator('[data-sec="struct"]').click()
    t.wait_until('([n]) => document.querySelectorAll(".ins-acc.on").length === n', [n])
    t.ck(pg.locator('.ins-acc.on').count() == n, 'раздел не развернулся обратно')

    # Свёрнутый раздел говорит о себе: сколько заполнено из сколького.
    subs = pg.eval_on_selector_all('.ins-acc-sub', 'e => e.map((x) => x.textContent.trim())')
    t.ck(all(' из ' in x for x in subs), 'у разделов нет прогресса: %s' % subs)
    t.ck(any('по возможности' in x for x in subs),
         'необязательный раздел не помечен: %s' % subs)
    t.ck(pg.locator('.ins-acc-need').count() >= 1,
         'у раздела с незаполненным обязательным нет счётчика')

    t.ck(pg.locator('select[data-fs-sel="condInner"] option', has_text='Удовлетворительное').count() >= 1,
         'в «Внутреннем состоянии» нет шкалы карточки')
    # Обязательные — как в карточке литеры: расположение строения, внутреннее
    # и внешнее состояние.
    t.ck(pg.locator('.ins-fs-req').count() >= 3, 'обязательные поля не помечены')
    # Сохранение — само (пересмотр шапки 14.10.2026): ход — полосой в шапке,
    # разделы — строкой под ней, после правки — «сохранено ЧЧ:ММ».
    t.ck(pg.locator('.ins-head [data-ins-prog]').count() == 1, 'в шапке осмотра нет полосы хода заполнения')
    t.ck(pg.locator('[data-secnav] [data-goto-sec]').count() >= 5, 'нет строки разделов осмотра')

    # Любой выбор — списком (замечание пользователя 14.10.2026: «формат в виде
    # огромного количества кнопок неудобен... лучше селекторы»): один ответ —
    # выпадающий список, «1 или более» — выпадающий мультивыбор, как в карточках.
    t.ck(pg.locator('.ins-fs .ins-chip, .ins-fs .ins-row').count() == 0, 'на экране осмотра остались кнопки-варианты вместо списков')
    sels = pg.locator('.ins select[data-fs-sel]')
    t.ck(sels.count() > 10, 'полей-списков в осмотре подозрительно мало: %d' % sels.count())

    prog = "document.querySelector('[data-ins-prog]').style.width"
    sum_before = pg.evaluate('() => ' + prog)
    # Форма строения — по карточке литеры (решение пользователя 15.10.2026
    # «Эталон - ОЦ+ОИ»): «Расположение строения» — два значения карточки.
    t.ck(pg.locator('select[data-fs-sel="buildType"] option').count() == 3,
         'в списке «Расположение строения» не «Не выбрано» и два значения карточки')
    pg.select_option('select[data-fs-sel="buildType"]', 'Встроенное')
    t.wait_until("(b) => document.querySelector('[data-ins-prog]').style.width !== b", sum_before)
    t.ck(pg.evaluate('() => ' + prog) != sum_before, 'полоса хода заполнения не сдвинулась после выбора')
    t.ck(pg.locator('[data-ins-saved]').inner_text().startswith('✓ сохранено'), 'после правки нет отметки «сохранено»')
    # Снять выбор — «Не выбрано» в том же списке.
    pg.select_option('select[data-fs-sel="buildType"]', '')
    t.wait_until("(b) => document.querySelector('[data-ins-prog]').style.width === b", sum_before)
    t.ck(pg.evaluate('() => ' + prog) == sum_before, 'выбор «Не выбрано» не снял значение')

    # Многозначные: мультивыбор с отметками, несколько ответов сразу, снятие.
    box = '[data-fs-msbox="heating"]'
    t.ck(pg.locator(box).count() == 1, '«Отопление» — не мультивыбор, как в карточке')
    pg.locator(box + ' [data-fs-ms-toggle]').click()
    opts = pg.locator(box + ' .ms-drop:not([hidden]) input[data-fs-ms]')
    t.ck(opts.count() == 11, 'в мультивыборе %d значений вместо одиннадцати' % opts.count())
    pg.locator(box + ' .ms-drop:not([hidden]) .ms-opt').nth(2).click()
    t.wait_until("(b) => document.querySelectorAll(b + ' input[data-fs-ms]:checked').length === 1", box)
    pg.locator(box + ' .ms-drop:not([hidden]) [data-ms-rest] .ms-opt').nth(4).click()
    t.wait_until("(b) => document.querySelectorAll(b + ' input[data-fs-ms]:checked').length === 2", box)
    t.ck(pg.locator(box + ' .ms-count').inner_text() == '2', 'в мультивыборе не отметились два значения')
    t.ck(pg.locator(box + ' .ms-drop:not([hidden])').count() == 1, 'мультивыбор закрылся после отметки')
    pg.locator(box + ' .ms-drop:not([hidden]) .ms-opt:has(input:checked)').first.click()
    t.wait_until("(b) => document.querySelectorAll(b + ' input[data-fs-ms]:checked').length === 1", box)
    t.ck(pg.locator(box + ' .ms-count').inner_text() == '1', 'снятие отметки в мультивыборе не сработало')
    pg.keyboard.press('Escape')
    t.wait_until("(b) => !document.querySelector(b + ' .ms-drop:not([hidden])')", box)

    # Переход к дальнему разделу из строки разделов (замечания пользователя
    # 14.10.2026: «сверху дергается панель», «напоминает желе»): шапка и
    # строка разделов за переход не сдвигаются, подсвечен нажатый раздел.
    geo = "(() => { const h = document.querySelector('.ins-head'), n = document.querySelector('.ins-secnav'); return [h.offsetHeight, Math.round(n.getBoundingClientRect().top)]; })()"
    before = pg.evaluate(geo)
    pg.click('[data-goto-sec="comments"]')
    t.wait_until("() => document.querySelector('[data-secnav] [aria-current=\"true\"]')?.dataset.gotoSec === 'comments'")
    t.wait(900)
    t.ck(pg.evaluate(geo)[0] == before[0], 'высота шапки изменилась при переходе к разделу: %s → %s' % (before, pg.evaluate(geo)))
    t.ck(pg.evaluate("document.querySelector('[data-secnav] [aria-current=\"true\"]')?.dataset.gotoSec") == 'comments',
         'после перехода к «Комментариям» подсвечен другой раздел')
    pg.evaluate("document.querySelector('.ins-body').scrollTop = 0")
    t.wait(200)

    # Форма осмотра — по виду ОИ (аудит 14.10.2026: форма строения открывалась
    # на любом ОИ). Квартира — без чек-листа коммуникаций, участок — сети,
    # механизмы — по единицам; «нерабочее» без снимков — предупреждение; ТС —
    # формы нет (ждёт решения пользователя).
    def secs():
        return pg.eval_on_selector_all('.ins-acc-t b', 'els => els.map((e) => e.textContent.trim())')
    t.open('#/insp/apartment/oc-ap-1/object/oi-ap1-a', wait='.ins-acc-t')
    t.ck('Состояние' in secs() and 'Общие параметры квартиры' in secs() and 'Чек-лист коммуникаций' not in secs(),
         'у квартиры не её форма осмотра: %s' % secs())
    t.open('#/insp/land-plot/oc-lp-1/object/oi-lp1-l1', wait='.ins-acc-t')
    t.ck('Инженерные сети' in secs() and 'Конструктив и износ' not in secs(), 'у участка не его форма осмотра: %s' % secs())
    t.open('#/insp/civil/oc-cv-1/object/oi-cv1-m1', wait='.ins-acc-t')
    t.ck('Котёл газовый водогрейный КВГ-1,25' in secs(), 'у механизмов нет разделов по единицам: %s' % secs())
    pg.locator('select[data-fs-sel$=".state"]').first.select_option('Нерабочее')
    t.ck(t.wait_until("() => /только при снимках/.test(document.body.innerText)"), '«Нерабочее» без снимков не остановлено предупреждением')
    t.open('#/insp/civil/oc-cv-1/object/oi-cv1-v1', wait='.ins-body')
    t.ck(pg.locator('[data-fs-field]').count() == 0 and _has(t, 'ещё не заданы'), 'у ТС показана форма осмотра (ждёт решения)')
    t.open(ASSET, wait='.ins-fs')
    t.wait(300)
    # Строение — блоки карточки литеры; чек-лист коммуникаций — у участка.
    t.ck('Конструктив и износ' in secs() and 'Состояние' in secs() and 'Чек-лист коммуникаций' not in secs(),
         'у строения не блоки его карточки: %s' % secs())

    # Площади и высоты на осмотре не замеряются (указание пользователя
    # 15.10.2026) — из чисел у строения только этажность. Её значение из
    # карточки рядом и СИГНАЛ расхождения по ходу ввода: сигнал, который
    # появляется только после сохранения, на осмотре бесполезен.
    t.ck(not _has(t, 'по внешним замерам') and not _has(t, 'внутреннему обмеру') and not _has(t, 'Общая по факту'),
         'в осмотре остались площади или высоты')
    t.ck(pg.locator('.ins-num').count() == 1, 'чисел в осмотре строения не одно (этажность): %d' % pg.locator('.ins-num').count())
    t.ck(_has(t, 'в карточке'), 'рядом с этажностью не показано значение из карточки')

    pg.locator('.ins-num').first.fill('9')
    t.wait_until('() => /РАСХОДИТСЯ/.test(document.body.innerText)')
    t.ck(pg.locator('.ins-fs-hint.warn').count() >= 1,
         'расхождение этажности с карточкой не поднято сигналом')
    t.ck(pg.locator('.ins-num').first.input_value() == '9', 'этажность не вводится')

    # Длинные перечни — списком, а не чипами: у наружных стен 44 значения, и
    # чипами это четыре экрана прокрутки на одно поле. Материал — мультивыбор,
    # как в карточке («Конструктив и износ»).
    sels = pg.locator('[data-fs-sel]').count()
    t.ck(sels >= 6, 'длинные перечни не стали списками: %d' % sels)
    walls = '[data-fs-msbox="wallsExt"]'
    t.ck(pg.locator(walls).count() == 1, 'у наружных стен нет мультивыбора, как в карточке')
    opts = pg.eval_on_selector_all(walls + ' input[data-fs-ms]', 'e => e.length')
    t.ck(opts > 40, 'в перечне наружных стен потерялись значения: %d' % opts)
    pg.locator(walls + ' [data-fs-ms-toggle]').click()
    pg.locator(walls + ' .ms-drop:not([hidden]) .ms-opt', has_text='Кирпич').first.click()
    t.wait_until("(b) => document.querySelectorAll(b + ' input[data-fs-ms]:checked').length === 1", walls)
    pg.keyboard.press('Escape')
    t.ck('кирпич' in pg.locator(walls + ' [data-fs-ms-sum]').inner_text().lower(),
         'сводка мультивыбора не показала выбранное значение')

    # Списки в модуле — СВОИ (kernel/dropdown.js), как во всём макете: иначе
    # поля выглядят браузерными, а перечень из 44 значений листают прокруткой
    # вместо поиска (замечание пользователя 08.09.2026 про стилизацию).
    t.ck(pg.locator('.pick-btn').count() >= 6,
         'списки не подменены своим компонентом: %d' % pg.locator('.pick-btn').count())

    # Состав полей — как в карточке литеры («Конструктив и износ»).
    for label in ('Фундамент', 'Цоколь/подвал', 'Наружные стены', 'Внутренние стены', 'Двери', 'Отделка', 'Утепление'):
        t.ck(_has(t, label), 'в «Конструктиве и износе» нет поля «%s»' % label)

    t.ck(pg.locator('.ins-ta').count() >= 1, 'в комментариях нет поля «Комментарий осмотрщика»')

    # Помещения: добавляются и убираются. Поэтажные планы там не нужны —
    # экспликации есть в техпаспорте (решение пользователя 08.09.2026).
    t.ck(_has(t, 'Помещения'), 'нет раздела «Помещения»')
    pg.locator('[data-pm-add]').click()
    t.wait_for('[data-pm-name]')
    t.ck(pg.locator('.ins-pm-i').count() == 1, 'помещение не добавилось')
    pg.fill('[data-pm-name]', 'Кабинет 12')
    t.ck(pg.locator('[data-pm-area]').count() == 0, 'у помещения осталась площадь — на осмотре площади не вносятся')
    t.ck(pg.input_value('[data-pm-name]') == 'Кабинет 12', 'наименование помещения не вводится')
    pg.locator('[data-pm-drop]').click()
    t.wait_until('() => document.querySelectorAll(".ins-pm-i").length === 0')
    t.ck(pg.locator('.ins-pm-i').count() == 0, 'помещение не убралось')

    # Значения у каждого ОИ свои: заполненное у литеры не должно появиться у
    # другого объекта имущества.
    t.open(TASK + '/object/oi-cv1-b', wait='.ins-fs-grid')
    t.wait(250)
    t.ck(pg.input_value('.ins-num') == '',
         'значения осмотра общие для разных ОИ — должны быть у каждого свои')

    # --- 5б. здание, выявленное на осмотре ---
    #
    # Решение пользователя 15.10.2026: выявленное здание — неутверждённая
    # литера, для осмотрщика «как обычная литера на участке»: тот же пункт
    # списка с меткой «выявлено», та же форма осмотра по категории, снимки к
    # нему. Удалённое уносит значения, но не снимки («Любые фото с осмотров —
    # важная информация»). Ловит: черновик без формы осмотра, снимки,
    # пропавшие вместе с черновиком, перенос, затирающий значения литеры.
    t.open(TASK + '/object', wait='.ins-oi')
    t.wait(250)
    t.ck(_has(t, 'Выявлено на осмотре'), 'нет раздела для выявленных на осмотре зданий')

    pg.select_option('[data-found-cat]', 'prod')
    pg.fill('[data-found-new-name]', 'Склад у ворот')
    pg.locator('.ins-found-new button[type=submit]').click()
    t.wait_for('.ins-oi-found')
    t.ck(pg.locator('.ins-oi-found').count() == 1, 'выявленное здание не добавилось')
    head = pg.locator('.ins-oi-found .ins-oi-h').inner_text().lower()
    t.ck('выявлено' in head and 'склад у ворот' in head,
         'выявленное здание без метки или названия: %s' % head[:80])
    t.ck(pg.locator('.ins-oi-found [data-found-name]').count() == 1,
         'созданное здание не раскрылось для правки')

    pg.fill('.ins-oi-found [data-found-note]', 'Металлический, примыкает к литере Б')
    found_id = pg.get_attribute('.ins-oi-found [data-found-name]', 'data-found-name')

    # Форма осмотра — по категории: производственно-складское получает
    # производственные параметры и класс капитальности, как литера в карточке.
    pg.locator('.ins-oi-found .ins-oi-go').click()
    t.wait_for('.ins-fs')
    body = pg.locator('.ins-body').inner_text().lower()
    t.ck('капитальност' in body, 'у выявленного здания нет раздела класса капитальности')
    t.ck(pg.locator('[data-fs-field]').count() > 5,
         'у выявленного здания нет формы осмотра')

    # Снимок к выявленному — тем же разделом «Фото».
    opts = pg.evaluate("""async () => { const K = await import('./app/pages/inspector/tasks.js');
      const r = await K.loadTask('%s', '%s'); return K.oiOptions(r, '%s', '%s').map(o => o.id); }""" % (TYPE, OC, TYPE, OC))
    t.ck(found_id in opts, 'выявленное здание не предлагается для привязки снимков')
    pg.evaluate("""async (id) => { const K = await import('./app/pages/inspector/tasks.js');
      const f = new File([new Uint8Array([137,80,78,71])], 'склад.png', { type: 'image/png' });
      K.addPhoto('%s', '%s', f, { oiId: id, cat: 'Фасад' }); }""" % (TYPE, OC), found_id)

    t.open(TASK + '/object', wait='.ins-oi-found')
    if not pg.locator('[data-found-drop]').count():
        pg.locator('.ins-oi-found .ins-oi-h').click()
    t.wait_for('[data-found-drop]')
    pg.locator('[data-found-drop]').click()
    if t.ck(t.wait_for('.modal'), 'удаление выявленного здания не спросило подтверждения'):
        pg.locator('[data-modal-ok]').last.click()
        t.wait_until('() => document.querySelectorAll(".ins-oi-found").length === 0')
        t.ck(pg.locator('.ins-oi-found').count() == 0, 'выявленное здание не удалилось')
        kept = pg.evaluate("""async () => { const K = await import('./app/pages/inspector/tasks.js');
          return K.taskState('%s', '%s').photos.filter(p => p.name === 'склад.png').map(p => p.oiId); }""" % (TYPE, OC))
        t.ck(kept == [''], 'снимок удалённого здания пропал или остался привязан: %s' % kept)
        # Снимок — тестовый: убрать, чтобы раздел «Фото» ниже начинал с чистого.
        pg.evaluate("""async () => { const K = await import('./app/pages/inspector/tasks.js');
          K.taskState('%s', '%s').photos.filter(p => p.name === 'склад.png').forEach(p => K.removePhoto('%s', '%s', p.id)); }""" % (TYPE, OC, TYPE, OC))

    left_native = pg.eval_on_selector_all(
        '.ins select.select:not(.pick-native)', 'els => els.length')
    t.ck(left_native == 0,
         'на экране остались нативные списки: %d — в макете списки свои' % left_native)

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
