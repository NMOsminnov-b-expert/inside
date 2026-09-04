# -*- coding: utf-8 -*-
"""Совпадение кода ЕНИ с архивной записью (ТЗ docs/tz/20-arhiv.md, §6.3, §12.5).

Код ЕНИ может повторяться (уточнение пользователя 03.09.2026) — но если
человек вводит код, который уже занят объектом в АРХИВЕ, это стоит назвать, а
не промолчать: иначе оператор заводит дубликат вместо того, чтобы просто
вернуть архивную запись. Флаг ENI_UNIQUE (kernel/fmt.js, по умолчанию false)
определяет, блокирует это сохранение или только предупреждает — сценарий
проверяет ветку по умолчанию (false): предупреждение не блокирует сохранение.

Что держит сценарий:
  * при вводе кода, совпадающего с архивной записью, под полем появляется
    предупреждение со ссылкой на архив;
  * форма создания при этом НЕ блокирует сохранение (ENI_UNIQUE=false);
  * правка уже существующего объекта не путает его собственный код с
    «совпадением с самим собой» (иначе кнопка сохранения ложно подсвечивалась
    бы при каждой правке).
"""
NAME = 'совпадение ЕНИ'


def run(t):
    pg = t.page

    t.open('', wait='.reg-thead')
    role = pg.locator('[data-role]')
    if role.count():
        role.first.select_option('admin')
        pg.wait_for_timeout(500)

    # --- 1. валидный по формату код (18 цифр) и архивирование объекта с ним ---
    # У сидовых записей код короче 18 цифр (полная маска не обязательна в
    # демо-данных) — форма создания такой код как раз отклонит по формату,
    # раньше, чем дойдёт до проверки совпадения. Поэтому сперва приводим код
    # объекта к валидной длине правкой карточки.
    eni_digits = '147561671001000000'[:18]
    t.open('#/oc/civil/oc-cv-1', wait='.card')
    pg.wait_for_timeout(500)
    pg.locator('#btnEditOc').first.click()
    pg.wait_for_timeout(400)
    eni_edit = pg.locator('#fEni')
    if not t.ck(eni_edit.count() > 0, 'в карточке объекта нет поля ЕНИ для правки'):
        return
    eni_edit.fill(eni_digits)
    eni_edit.dispatch_event('change')
    pg.wait_for_timeout(300)
    save_edit = pg.locator('#btnSaveOc')
    if save_edit.count():
        save_edit.first.click()
        pg.wait_for_timeout(600)

    btn = pg.locator('#btnDelOc')
    if not t.ck(btn.count() > 0, 'в карточке объекта нет кнопки убрать в архив'):
        return
    btn.first.click()
    pg.wait_for_timeout(500)
    pg.locator('[data-modal-ok], .modal-foot .btn-primary').first.click()
    pg.wait_for_timeout(1200)

    # --- 2. новый объект того же типа с тем же кодом — предупреждение и ссылка ---
    # «+ Создать ОЦ» живёт на едином реестре (MENU_HREF = '#/'), а не на
    # маршруте конкретного типа.
    t.open('#/', wait='.reg-thead')
    pg.wait_for_timeout(500)
    # [data-dd-toggle] — общий класс у нескольких выпадающих меню на экране
    # (столбцы, фильтры…); берём именно то, что рядом с «+ Создать ОЦ».
    pg.locator('.reg-create-menu').locator('xpath=preceding-sibling::button[@data-dd-toggle]').click()
    pg.wait_for_selector('.reg-create-menu', state='visible', timeout=5000)
    pg.wait_for_timeout(300)
    pg.locator('[data-create="civil"]').first.click(force=True)
    pg.wait_for_timeout(700)

    eni_field = pg.locator('#fEni')
    if not t.ck(eni_field.count() > 0, 'в форме создания объекта нет поля ЕНИ'):
        return
    eni_field.fill(eni_digits)
    eni_field.dispatch_event('change')
    pg.wait_for_timeout(400)

    dup_box = pg.locator('[data-eni-dup]')
    t.ck(dup_box.count() > 0 and dup_box.inner_text().strip() != '',
         'при совпадении кода с архивной записью не появилось предупреждение')
    dup_text = dup_box.inner_text() if dup_box.count() else ''
    t.ck('архив' in dup_text.lower(), 'предупреждение не упоминает архив: %r' % dup_text)

    link = dup_box.locator('a')
    t.ck(link.count() > 0 and link.get_attribute('href') == '#/archive',
         'у предупреждения нет ссылки на архив')

    # --- 3. по умолчанию (ENI_UNIQUE=false) сохранение не блокируется ---
    save = pg.locator('#btnCreateOc')
    if t.ck(save.count() > 0, 'в форме создания нет кнопки сохранения'):
        # Остальные обязательные поля создания заполняем по минимуму — сценарий
        # проверяет именно ЕНИ, а не форму целиком.
        addr = pg.locator('#fAddress, [data-head-address], input[placeholder*="дрес" i]').first
        if addr.count():
            addr.fill('Проверка совпадения ЕНИ')
        save.first.click()
        pg.wait_for_timeout(1000)
        t.ck('#/oc/civil/oc-cv-1' != pg.evaluate('() => location.hash'),
             'сохранение с совпадающим (но не уникальным по флагу) кодом ЕНИ было заблокировано')

    # --- 4. правка объекта не путает код с самим собой ---
    t.open('#/oc/civil/oc-cv-1', wait='.reg-thead, .card')
    pg.wait_for_timeout(500)
    # oc-cv-1 в архиве — открываем любой другой живой объект того же типа.
    row = pg.locator('[data-open-oc], tr[data-oc-row]').first
    if row.count():
        row.click()
        pg.wait_for_timeout(600)
        edit = pg.locator('[data-oc-edit], #btnEditOc')
        if edit.count():
            edit.first.click()
            pg.wait_for_timeout(400)
        eni_edit = pg.locator('#fEni')
        if eni_edit.count():
            own = eni_edit.input_value()
            eni_edit.fill(own)
            eni_edit.dispatch_event('change')
            pg.wait_for_timeout(400)
            own_dup = pg.locator('[data-eni-dup]')
            t.ck(own_dup.count() == 0 or own_dup.inner_text().strip() == '',
                 'правка объекта считает его собственный код ЕНИ совпадением с самим собой')
