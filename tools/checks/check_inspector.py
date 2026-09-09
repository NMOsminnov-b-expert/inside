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
                 '.pick-btn', '.ins-chip', '.ins-row', '.ins-acc-h']

MIN_TAP = 44

# Установка значения в скрытый нативный селект своего списка.
SET_WALLS = ("(el) => { el.value = 'Кирпич';"
             " el.dispatchEvent(new Event('change', { bubbles: true })); }")

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

    t.ck(pg.locator('.ins-acc').count() == 5,
         'разделов формы не пять: %d' % pg.locator('.ins-acc').count())

    # Все разделы открыты по умолчанию: свёрнутое заранее приходится
    # разворачивать, а на осмотре нужно заполнять (замечание пользователя
    # 08.09.2026).
    t.ck(pg.locator('.ins-acc.on').count() == 5,
         'не все разделы открыты по умолчанию: %d из 5' % pg.locator('.ins-acc.on').count())

    # Свернуть можно руками — и развернуть обратно.
    pg.locator('[data-sec="struct"]').click()
    t.wait_until('() => document.querySelectorAll(".ins-acc.on").length === 4')
    t.ck(pg.locator('.ins-acc.on').count() == 4, 'раздел не свернулся по нажатию')
    pg.locator('[data-sec="struct"]').click()
    t.wait_until('() => document.querySelectorAll(".ins-acc.on").length === 5')
    t.ck(pg.locator('.ins-acc.on').count() == 5, 'раздел не развернулся обратно')

    # Свёрнутый раздел говорит о себе: сколько заполнено из сколького.
    subs = pg.eval_on_selector_all('.ins-acc-sub', 'e => e.map((x) => x.textContent.trim())')
    t.ck(all(' из ' in x for x in subs), 'у разделов нет прогресса: %s' % subs)
    t.ck(any('по возможности' in x for x in subs),
         'необязательный раздел не помечен: %s' % subs)
    t.ck(pg.locator('.ins-acc-need').count() >= 1,
         'у раздела с незаполненным обязательным нет счётчика')

    t.ck(_has(t, 'Не удалось установить'),
         'в шкале наличия сетей нет варианта «Не удалось установить» (шкала рабочей системы)')
    t.ck(pg.locator('.ins-fs-req').count() >= 5, 'обязательные поля не помечены')
    t.ck(pg.locator('[data-asset-save]').count() == 1,
         'в закреплённой полосе нет кнопки сохранения')

    chips = pg.locator('.ins-chip')
    t.ck(chips.count() > 10, 'полей-чипов в осмотре подозрительно мало: %d' % chips.count())

    sum_before = pg.locator('.ins-sum').inner_text()
    chips.first.click()
    t.wait_until('() => document.querySelectorAll(".ins-chip.on").length === 1')
    t.ck(pg.locator('.ins-chip.on').count() == 1, 'выбор чипа не отметился')
    t.ck(pg.locator('.ins-sum').inner_text() != sum_before,
         'счётчик заполненного не изменился после выбора')

    # Повторное нажатие снимает выбор — иначе ошибочное касание не исправить.
    pg.locator('.ins-chip.on').first.click()
    t.wait_until('() => document.querySelectorAll(".ins-chip.on").length === 0')
    t.ck(pg.locator('.ins-chip.on').count() == 0, 'повторное нажатие не сняло выбор')

    # Многозначные перечни длиннее пяти значений — СТРОКАМИ с отметкой, а не
    # плитками (замечание пользователя 08.09.2026: «может от плиток перейти к
    # таблицам… при нажатии на строку появляется отметка»). Замер на 390 px
    # показывал, ради чего: одиннадцать плиток «систем отопления» вставали в
    # десять рядов разной ширины.
    rows_box = pg.locator('[data-fs-field="heatSystems"] .ins-rows')
    t.ck(rows_box.count() == 1,
         'многозначный перечень из одиннадцати значений не стал строками')

    rows = pg.locator('[data-fs-field="heatSystems"] .ins-row')
    t.ck(rows.count() == 11, 'в строках выбора %d значений вместо одиннадцати' % rows.count())
    t.ck(pg.locator('[data-fs-field="heatSystems"] .ins-row-m').count() == 11,
         'у строк выбора нет отметки')

    rows.nth(2).click()
    t.wait_until('() => document.querySelectorAll(".ins-row.on").length === 1')
    t.ck(pg.locator('.ins-row.on').count() == 1, 'нажатие на строку не отметилось')

    # Несколько ответов сразу — ради этого поле и многозначное.
    rows.nth(5).click()
    t.wait_until('() => document.querySelectorAll(".ins-row.on").length === 2')
    t.ck(pg.locator('.ins-row.on').count() == 2, 'вторая строка не отметилась')

    rows.nth(2).click()
    t.wait_until('() => document.querySelectorAll(".ins-row.on").length === 1')
    t.ck(pg.locator('.ins-row.on').count() == 1, 'повторное нажатие не сняло отметку строки')

    # Короткие перечни («Да / Нет / Не удалось установить») остаются плитками:
    # там они в две строки и выбираются в одно касание.
    t.ck(pg.locator('[data-fs-field="electric"] .ins-chip').count() >= 3,
         'короткий перечень наличия сетей перестал быть плитками')

    # Замеры: единицы, значение по документам и СИГНАЛ расхождения по ходу
    # ввода — сигнал, который появляется только после сохранения, на осмотре
    # бесполезен.
    t.ck(pg.locator('.ins-num').count() >= 4, 'нет полей замеров')
    t.ck(pg.locator('.ins-num-u').count() >= 4, 'у замеров нет единиц измерения')
    t.ck(_has(t, 'по документам'), 'рядом с замером не показано значение по документам')

    pg.locator('.ins-num').first.fill('1852.00')
    t.wait_until('() => /РАСХОДИТСЯ/.test(document.body.innerText)')
    t.ck(pg.locator('.ins-fs-hint.warn').count() >= 1,
         'расхождение замера с документами не поднято сигналом')
    t.ck(pg.locator('.ins-num').first.input_value() == '1852.00', 'замер не вводится')

    # Длинные перечни — списком, а не чипами: у наружных стен 44 значения, и
    # чипами это четыре экрана прокрутки на одно поле.
    sels = pg.locator('[data-fs-sel]').count()
    t.ck(sels >= 6, 'длинные перечни не стали списками: %d' % sels)
    opts = pg.eval_on_selector_all('[data-fs-sel="wallsExt"] option', 'e => e.length')
    t.ck(opts > 40, 'в перечне наружных стен потерялись значения: %d' % opts)

    t.ck(pg.locator('[data-fs-sel="wallsExt"]').count() == 1,
         'у наружных стен нет списка выбора')

    # Значение ставим в скрытый нативный селект: подпись своей кнопки обязана
    # это подхватить (kernel/dropdown.js, syncButton).
    pg.eval_on_selector('[data-fs-sel="wallsExt"]', SET_WALLS)
    t.wait(300)
    t.ck(pg.locator('[data-fs-sel="wallsExt"]').input_value() == 'Кирпич',
         'выбор из списка не сохранился')

    # Списки в модуле — СВОИ (kernel/dropdown.js), как во всём макете: иначе
    # поля выглядят браузерными, а перечень из 44 значений листают прокруткой
    # вместо поиска (замечание пользователя 08.09.2026 про стилизацию).
    t.ck(pg.locator('.pick-btn').count() >= 6,
         'списки не подменены своим компонентом: %d' % pg.locator('.pick-btn').count())
    t.ck('кирпич' in pg.locator('[data-fs-field="wallsExt"] .pick-btn').inner_text().lower(),
         'подпись своего списка не показала выбранное значение')

    # Состав полей — как в рабочей системе (inside.html в корне проекта).
    for label in ('Фундамент', 'Цоколь', 'Наружные стены', 'Внутренние стены', 'Двери'):
        t.ck(_has(t, label), 'в конструктивных элементах нет поля «%s»' % label)

    t.ck(pg.locator('.ins-ta').count() >= 2,
         'в комментариях меньше двух полей: особенности и комментарий осмотрщика')

    # Помещения: добавляются и убираются. Поэтажные планы там не нужны —
    # экспликации есть в техпаспорте (решение пользователя 08.09.2026).
    t.ck(_has(t, 'Помещения'), 'нет раздела «Помещения»')
    pg.locator('[data-pm-add]').click()
    t.wait_for('[data-pm-name]')
    t.ck(pg.locator('.ins-pm-i').count() == 1, 'помещение не добавилось')
    pg.fill('[data-pm-name]', 'Кабинет 12')
    pg.fill('[data-pm-area]', '18.4')
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

    # --- 5б. объект, выявленный на осмотре ---
    #
    # Решение пользователя 08.09.2026: выявленный объект помечается, и к нему
    # прикрепляется то, что получится. Признак — не украшение: по нему ЦОД
    # видит, что объект пришёл с осмотра, а не заведён по документам.
    t.open(TASK + '/object', wait='.ins-oi')
    t.wait(250)
    t.ck(_has(t, 'Выявлено на осмотре'), 'нет раздела для выявленных на осмотре объектов')

    pg.select_option('[data-found-kind]', 'Навес')
    pg.locator('[data-found-add]').click()
    t.wait_for('.ins-found-i')
    t.ck(pg.locator('.ins-found-i').count() == 1, 'выявленный объект не добавился')
    t.ck('выявлен на осмотре' in pg.locator('.ins-found-i').inner_text().lower(),
         'выявленный объект не помечен: %s' % pg.locator('.ins-found-i').inner_text()[:60])
    t.ck('навес' in pg.locator('.ins-found-kind').inner_text().lower(),
         'у выявленного объекта не тот вид: %s' % pg.locator('.ins-found-kind').inner_text())

    pg.fill('[data-found-name]', 'Навес за котельной')
    pg.fill('[data-found-note]', 'Металлический, примыкает к литере Б')
    t.ck(pg.input_value('[data-found-name]') == 'Навес за котельной',
         'наименование выявленного объекта не вводится')

    pg.locator('[data-found-drop]').click()
    if t.ck(t.wait_for('.modal'), 'удаление выявленного объекта не спросило подтверждения'):
        pg.locator('[data-modal-ok]').last.click()
        t.wait_until('() => document.querySelectorAll(".ins-found-i").length === 0')
        t.ck(pg.locator('.ins-found-i').count() == 0, 'выявленный объект не убрался')

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
