# -*- coding: utf-8 -*-
"""Карточка ОЦ: подпись поля совпадает с тем, что в нём лежит.

Сценарий ведёт реестр полей карточки ОЦ живым (docs/tz/52-reestr-polej-kartochki-oc.md).
Заведён 08.09.2026, когда пользователь указал на расхождение: «в таблицах под
категорией на самом деле идёт назначение».

Расхождение № 1 подробно: столбец перечня ОИ назывался «Категория», а показывал
`oi.catClass` — то же поле, что в карточке литеры подписано «Назначение по тех
паспорту». Настоящая «Категория ОИ» (`oi.oiCategory`, сгруппированный
справочник) в перечень не выводится вовсе. Подпись исправлена; сценарий следит,
чтобы имя столбца и его содержимое снова не разъехались — сравнивает значение в
столбце со значением поля в карточке той же литеры.

Разбирается гражданское здание: на нём проработка, остальные модули приводятся
следом.
"""
NAME = 'поля карточки ОЦ'

TOUCHES = (
    'app/modules/civil/card/*', 'app/modules/civil/oi/registry.js',
    'app/modules/civil/oi/building/view.js',
)

OC = '#/oc/civil/oc-cv-1'

# Состав шапки: значения только на чтение. Категория ОЦ и назначение по ТП —
# РАЗНЫЕ вещи, и путать их нельзя именно здесь: отсюда они расходятся по
# остальным экранам.
HEAD = ['Тип ОЦ', 'Назначение по ТП', 'Код ЕНИ', 'Адрес']

# Поля формы ОЦ (кнопка «Редактировать»).
FORM = ['Тип ОЦ', 'Категория ОЦ', 'Назначение по ТП', 'Статус ОЦ', 'Код ЕНИ',
        'Головное учреждение', 'Подвед']

# Блок 02 «Местоположение»: адрес записи целиком, включая улицу с домом —
# в объектах имущества этих полей больше нет (решение пользователя 09.09.2026).
LOCATION = ['Область', 'Район', 'Город или село', 'Микрорайон',
            'Улица', 'Дом', 'Квартира', 'GPS-координаты', 'Адрес записи']

RESP = ['Ответственный от гос. учреждения', 'Оператор ЦОД', 'Оценщик', 'Осмотрщик']


def _labels(t, sel='label, .lbl'):
    return t.page.eval_on_selector_all(
        sel, 'els => els.map((e) => e.textContent.replace(/\\s+/g, " ").trim())')


def run(t):
    pg = t.page

    # --- 1. шапка ----------------------------------------------------------
    t.open(OC, wait='[data-oc-head]')
    t.wait(300)

    # textContent, а не innerText: подписи в шапке CSS поднимает в верхний
    # регистр, и innerText возвращает их уже такими. Сравниваем без учёта
    # регистра — на этих граблях сценарии стояли уже дважды.
    head = pg.eval_on_selector_all(
        '[data-oc-head]',
        'els => els.map((e) => e.textContent).join(" ").replace(/\\s+/g, " ")')
    low = head.lower()
    for name in HEAD:
        t.ck(name.lower() in low, 'в шапке ОЦ нет «%s»: %s' % (name, head[:140]))

    # --- 2. перечень ОИ: подпись столбца против содержимого ----------------
    cols = pg.eval_on_selector_all(
        '.oi-tree-tbl.oi-cols-row thead th',
        'els => els.map((e) => e.textContent.replace(/\\s+/g, " ").trim()).filter(Boolean)')
    t.ck('Назначение по ТП' in cols,
         'в перечне ОИ нет столбца «Назначение по ТП»: %s' % cols)
    t.ck('Категория' not in cols,
         'столбец снова назван «Категория», хотя показывает назначение: %s' % cols)

    # Значение в столбце — то же, что в поле карточки литеры. Это и есть
    # утверждение «подпись совпадает с содержимым»: столбец берёт catClass.
    idx = cols.index('Назначение по ТП')
    cell = pg.evaluate("""(i) => {
      const tbl = [...document.querySelectorAll('.oi-tree-tbl')]
        .find((t) => t.querySelector('tbody tr [data-open-oi], tbody tr'));
      const row = document.querySelector('.oi-tree-tbl tbody tr[data-open-oi]')
        || document.querySelector('.oi-tree-tbl tbody tr');
      return row && row.children[i] ? row.children[i].textContent.trim() : '';
    }""", idx)
    t.ck(cell, 'в столбце назначения пусто — нечего сверять с карточкой')

    # --- 3. та же литера: поле подписано так же ----------------------------
    pg.locator('tr[data-open-oi]').first.click()
    t.wait_for('[data-catclass]')

    label = pg.evaluate("""() => {
      const el = document.querySelector('[data-catclass]');
      const f = el.closest('.field');
      return f && f.querySelector('label') ? f.querySelector('label').textContent.trim() : '';
    }""")
    t.ck('азначение' in label,
         'в карточке литеры поле catClass подписано «%s» — разошлось с перечнем ОИ' % label)

    value = pg.input_value('[data-catclass]')
    t.ck(value == cell,
         'столбец перечня показывает «%s», а поле карточки — «%s»' % (cell, value))

    # «Категория ОИ» — ДРУГОЕ поле, и оно существует: иначе переименование
    # столбца было бы просто подгонкой слов.
    t.ck(pg.locator('[data-oi-category]').count() == 1,
         'в карточке литеры нет отдельного поля «Категория ОИ» — тогда и расхождения нет')

    # --- 3b. сводка участка против его карточки ----------------------------
    #
    # Расхождение № 2: карточка участка одна на проект и читает
    # oi.areas.{pravo,fact,build} и oi.landType, а в civil участок засевался
    # плоским oi.area и без типа ЗУ. Снаружи: в сводке площадь есть, в карточке
    # все четыре поля площадей пустые, тип ЗУ не выбран — а от него зависит
    # половина карточки (сельхоз и несельхоз показывают разные блоки).
    t.open(OC, wait='.oi-land-tbl')
    t.wait(250)

    land = pg.eval_on_selector_all(
        '.oi-land-tbl tbody td', 'e => e.map((x) => x.textContent.trim())')
    t.ck(len(land) >= 4, 'в сводке участка меньше четырёх колонок: %s' % land)
    t.ck(land[1] not in ('', '—'), 'в сводке участка нет площади: %s' % land)
    t.ck(land[3] not in ('', '—'),
         'в сводке участка не показан тип ЗУ: %s — данные в форме, которую '
         'карточка участка не читает' % land)

    pg.locator('.oi-land-open').first.click()
    t.wait_for('[data-land-area]')

    area = pg.input_value('[data-land-area="pravo"]')
    t.ck(area, 'в карточке участка пусто «По правоустанавливающим документам», '
                'хотя в сводке площадь показана')
    t.ck(pg.input_value('[data-land-type]'),
         'в карточке участка не выбран тип ЗУ')

    # Сводка и карточка — об одном участке: числа обязаны совпасть. Сравниваем
    # числами, а не строками: в сводке значение отформатировано («3 200,00 м²»),
    # в поле лежит сырое («3200.00»).
    def _num(s):
        # isascii обязателен: в «м²» надстрочная двойка — тоже цифра с точки
        # зрения Python, и она попадала в число, ломая разбор.
        digits = ''.join(c for c in s.replace(',', '.')
                         if (c.isdigit() and c.isascii()) or c == '.')
        try:
            return round(float(digits), 2)
        except ValueError:
            return None

    t.ck(_num(area) == _num(land[1]),
         'площадь в сводке (%s) не сходится с карточкой (%s)' % (land[1], area))

    # --- 4. форма ОЦ: состав полей -----------------------------------------
    t.open(OC, wait='[data-oc-head]')
    t.wait(250)
    pg.locator('#btnEditOc').click()
    t.wait_for('#fCat')

    labels = _labels(t)
    for name in FORM + LOCATION:
        t.ck(any(name == x for x in labels),
             'в форме ОЦ нет поля «%s»' % name)

    t.ck(any('Местоположение' in x for x in
             pg.eval_on_selector_all('.card-head h3', 'e => e.map((x) => x.textContent.trim())')),
         'в форме ОЦ нет блока «Местоположение»')

    # Категория ОЦ и назначение по ТП — два разных поля формы, не одно.
    t.ck(pg.locator('#fCat').count() == 1 and pg.locator('#fPurpose').count() == 1,
         'категория ОЦ и назначение по ТП перестали быть разными полями')

    for name in RESP:
        t.ck(any(name == x for x in labels), 'в форме ОЦ нет ответственного «%s»' % name)
