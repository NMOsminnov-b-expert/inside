# -*- coding: utf-8 -*-
"""Справочники: каталоги, привязка к полю, значения, удаление с заменой.

ТЗ: docs/tz/10-spravochniki.md. Проверяются решения пользователя 02.09.2026:
  * один справочник — одно поле (общих перечней на несколько полей нет);
  * каталоги жёсткие: тип ОЦ → тип ОИ, вручную не создаются;
  * перенос в другой каталог перевешивает привязку на одноимённое поле, а если
    такого нет — спрашивает и до ответа ничего не меняет;
  * значение без использования удаляется сразу, используемое — только с заменой;
  * правят администратор и роль «любая»; системные перечни только читаются;
  * значение и справочник добавляются строкой, без модальных окон.
"""
NAME = 'справочники'


def _role(t, key):
    """Переключить роль в реестре — права раздела считаются от неё."""
    t.open('', wait='.reg-thead')
    t.page.locator('[data-role]').first.select_option(key)
    t.page.wait_for_timeout(400)


def _expand_all(t):
    """Раскрыть дерево: по умолчанию оно свёрнуто (требование пользователя).

    Заодно снимаем фильтр поиска: переход на тот же hash страницу не
    перезагружает, и запрос из предыдущего шага остался бы в силе.
    """
    pg = t.page
    q = pg.locator('[data-dc-q]')
    if q.count() and q.input_value():
        q.fill('')
        pg.wait_for_timeout(300)

    for sel in ('.dc-tree-head', '.dc-tree-sub', '.dc-tree-fold'):
        nodes = pg.locator(sel)
        for i in range(nodes.count()):
            node = nodes.nth(i)
            cls = node.evaluate('e => e.parentElement.className')
            if 'open' not in cls:
                node.click()
                pg.wait_for_timeout(60)
    pg.wait_for_timeout(200)


def _find_dict(t, name_part):
    """Найти справочник в дереве по части названия."""
    rows = t.page.locator('.dc-row')
    for i in range(rows.count()):
        if name_part in rows.nth(i).inner_text():
            rows.nth(i).click()
            t.page.wait_for_timeout(500)
            return True
    return False


def _used_dict(t):
    """Открыть справочник с используемыми значениями, который ещё и правится.

    У системных перечней полей ввода нет (только чтение), поэтому проверять
    удаление на них нельзя — ищем непривязанный к системе.
    """
    t.page.locator('[data-dc-q]').fill('')
    t.page.wait_for_timeout(300)
    rows = t.page.locator('.dc-row')
    for i in range(rows.count()):
        if 'sys' in (rows.nth(i).get_attribute('class') or ''):
            continue
        rows.nth(i).click()
        t.page.wait_for_timeout(200)
        if t.page.locator('[data-item-usage]').count() and t.page.locator('[data-item-value]').count():
            return True
    return False


def _open_in_catalog(t, catalog_part, dict_part):
    """Открыть справочник по каталогу и названию: одноимённые лежат в разных
    каталогах (у литеры и у квартиры своё «Отопление»)."""
    ok = t.page.evaluate("""([cat, name]) => {
      const cards = [...document.querySelectorAll('.dc-tree-card')];
      for (const card of cards) {
        const sub = card.querySelector('.dc-tree-sub span');
        if (!sub || !sub.textContent.includes(cat)) continue;
        const row = [...card.querySelectorAll('.dc-row')]
          .find((r) => r.textContent.includes(name));
        if (row) { row.click(); return true; }
      }
      return false;
    }""", [catalog_part, dict_part])
    t.page.wait_for_timeout(500)
    return ok


def _add_value(t, value):
    field = t.page.locator('[data-item-new]')
    field.fill(value)
    field.press('Enter')
    t.page.wait_for_timeout(500)


def run(t):
    pg = t.page

    # --- 1. каталоги: тип ОЦ → тип ОИ ---
    t.open('#/dicts', wait='.dc')

    # По умолчанию дерево свёрнуто: видимых справочников быть не должно.
    visible = pg.evaluate("""() => [...document.querySelectorAll('.dc-row')]
        .filter((r) => r.offsetParent !== null).length""")
    t.ck(visible == 0, 'дерево открылось раскрытым: видно %d справочников' % visible)

    _expand_all(t)
    types = pg.locator('.dc-tree-type').count()
    cards = pg.locator('.dc-tree-card').count()
    total = pg.locator('.dc-row').count()
    print('   типов %d, каталогов %d, справочников %d' % (types, cards, total))
    t.ck(types >= 5, 'в дереве только %d типов ОЦ' % types)
    t.ck(cards >= 10, 'в дереве только %d каталогов' % cards)
    t.ck(total > 100, 'справочники не разнесены по полям: их всего %d' % total)

    # Папки внутри типа ОИ: конструктивный состав — восемь полей карточки.
    folders = pg.locator('.dc-tree-folder').count()
    t.ck(folders >= 5, 'папок в дереве только %d — конструктивный состав не сгруппирован' % folders)
    fold_names = pg.evaluate("""() => [...document.querySelectorAll('.dc-tree-fold span')]
        .map((x) => x.textContent.trim())""")
    t.ck(any('Конструктивный' in x for x in fold_names),
         'нет папки конструктивного состава: %s' % fold_names[:3])

    parts = pg.evaluate("""() => {
      const f = document.querySelector('.dc-tree-folder');
      return f ? [...f.querySelectorAll('.dc-row-name')].map((x) => x.textContent.trim()) : [];
    }""")
    t.ck(len(parts) == 8, 'в папке состава %d справочников вместо восьми' % len(parts))
    t.ck(any('Фундамент' in x for x in parts), 'в папке состава нет фундамента: %s' % parts)

    # Системные — в конце каталога, а не вперемешку.
    order = pg.evaluate("""() => {
      const card = [...document.querySelectorAll('.dc-tree-card')]
        .find((c) => c.querySelector('.dc-tree-sub span').textContent.includes('Литера'));
      if (!card) return null;
      return [...card.querySelectorAll('.dc-tree-list > .dc-row')]
        .map((r) => r.className.includes('sys'));
    }""")
    if t.ck(bool(order), 'не нашёл каталог литеры'):
        first_sys = order.index(True) if True in order else len(order)
        t.ck(all(order[i] for i in range(first_sys, len(order))),
             'системные перечни идут вперемешку с обычными: %s' % order)

    # Убранные перечни: литеры и сотрудники — не справочники.
    names = pg.evaluate("""() => [...document.querySelectorAll('.dc-row-name')]
        .map((x) => x.textContent.trim())""")
    t.ck(not any(n.startswith('Литера') and 'строение' not in n for n in names),
         'справочник литер остался')
    t.ck(not any('Ответствен' in n or 'Сотрудник' in n for n in names),
         'справочник сотрудников остался')

    # Категории фотографий редактируются.
    photo_sys = pg.evaluate("""() => {
      const row = [...document.querySelectorAll('.dc-row')]
        .find((r) => r.textContent.includes('Категория фотограф'));
      return row ? row.className.includes('sys') : null;
    }""")
    t.ck(photo_sys is False, 'категории фотографий всё ещё системные')

    # каталог второго уровня — это тип ОИ, а не что-то ещё
    labels = pg.evaluate("""() => [...document.querySelectorAll('.dc-tree-sub span')]
        .map((s) => s.textContent.trim())""")
    t.ck(any('Литера' in x for x in labels), 'среди каталогов нет типа ОИ «Литера»: %s' % labels[:5])

    # --- 2. один справочник — одно поле ---
    if not t.ck(_find_dict(t, 'Отопление'), 'справочник отопления не найден'):
        return
    t.ck(pg.locator('.dc-where-step').count() == 3,
         'блок «Где применяется» показывает не три шага цепочки')
    t.ck('Где применяется' in pg.locator('.dc-card').nth(2).inner_text(),
         'блок 03 не переименован')

    steps = pg.evaluate("""() => [...document.querySelectorAll('.dc-where-step b')]
        .map((b) => b.textContent.trim())""")
    print('   цепочка привязки:', steps)
    t.ck(len(steps) == 3 and all(steps), 'цепочка привязки неполная: %s' % steps)

    # технических ключей и пояснительных фраз в интерфейсе быть не должно
    body = pg.locator('.dc-main').inner_text()
    t.ck('heating' not in body and 'improvements' not in body,
         'в интерфейсе остались технические ключи полей')
    t.ck('Оценщик видит' not in body, 'пояснительная фраза под цепочкой не убрана')

    # --- 3. права ---
    _role(t, 'insp')
    t.open('#/dicts', wait='.dc')
    _expand_all(t)
    t.ck(pg.locator('[data-dc-new]').count() == 0, 'кнопка создания видна роли без прав')
    t.ck('изменения недоступны' in t.text(), 'нет пояснения, кто правит справочники')
    _find_dict(t, 'Отопление')
    t.ck(pg.locator('[data-item-del]').count() == 0, 'удаление значения доступно роли без прав')
    t.ck(pg.locator('[data-move-open]').count() == 0, 'перенос доступен роли без прав')
    t.ck(pg.locator('[data-item-new]').count() == 0, 'строка добавления видна роли без прав')

    _role(t, 'any')
    t.open('#/dicts', wait='.dc')
    t.ck(pg.locator('[data-dc-new]').count() == 1,
         'роль «любая» не получила права на правку справочников')

    _role(t, 'admin')
    t.open('#/dicts', wait='.dc')
    _expand_all(t)

    # --- 4. системный перечень только читается ---
    if _find_dict(t, 'Статус ОЦ'):
        t.ck(pg.locator('[data-item-del]').count() == 0, 'системный перечень можно править')
        t.ck(pg.locator('[data-item-new]').count() == 0, 'в системный перечень можно добавить значение')
        t.ck(pg.locator('.dc-badge.sys').count() == 1, 'системный перечень не помечен')
        t.ck(pg.locator('[data-move-open]').count() == 0, 'системный перечень можно перенести')

    # --- 5. тумблер системных ---
    t.ck(pg.locator('.dc-switch-track').count() == 1, 'переключатель нарисован не тумблером')
    sys_rows = pg.locator('.dc-row.sys').count()
    t.ck(sys_rows > 0, 'системные перечни не помечены в дереве')
    pg.locator('.dc-switch').first.click()
    pg.wait_for_timeout(600)
    t.ck(pg.locator('.dc-row.sys').count() == 0, 'системные перечни не скрываются')
    pg.locator('.dc-switch').first.click()
    pg.wait_for_timeout(500)
    t.ck(pg.locator('.dc-row.sys').count() == sys_rows, 'системные перечни не вернулись')

    # --- 6. значения: строка добавления, дубликаты, правка на месте ---
    _find_dict(t, 'Отопление')
    was = pg.locator('[data-item-value]').count()
    first_value = pg.locator('[data-item-value]').first.input_value()

    t.ck(pg.locator('[data-item-new]').count() == 1, 'значение добавляется не строкой в таблице')
    _add_value(t, 'Проверочное значение')
    t.ck(pg.locator('[data-item-value]').count() == was + 1, 'значение не добавилось')

    _add_value(t, first_value)
    t.ck(pg.locator('[data-item-value]').count() == was + 1, 'добавился дубликат значения')

    cell = pg.locator('[data-item-value]').last
    cell.fill('Проверочное значение 2')
    cell.press('Enter')
    pg.wait_for_timeout(400)
    values = pg.evaluate("""() => [...document.querySelectorAll('[data-item-value]')]
        .map((i) => i.value)""")
    t.ck('Проверочное значение 2' in values, 'правка значения на месте не сохранилась')

    # --- 7. удаление неиспользуемого значения — сразу ---
    ids = pg.evaluate("""() => [...document.querySelectorAll('tr[data-item]')]
        .filter((tr) => !tr.querySelector('[data-item-usage]'))
        .map((tr) => tr.dataset.item)""")
    if t.ck(bool(ids), 'не нашлось неиспользуемого значения'):
        before = pg.locator('[data-item-value]').count()
        pg.locator('[data-item-del="%s"]' % ids[-1]).first.click()
        pg.wait_for_timeout(500)
        t.ck(pg.locator('.modal-head').count() > 0, 'удаление прошло без подтверждения')
        pg.locator('.modal-foot .btn-primary, [data-modal-ok]').first.click()
        pg.wait_for_timeout(600)
        t.ck(pg.locator('[data-item-value]').count() == before - 1,
             'неиспользуемое значение не удалилось')

    # --- 8. удаление используемого: переработанный диалог ---
    t.open('#/dicts', wait='.dc')
    _expand_all(t)
    if t.ck(_used_dict(t), 'не нашлось справочника с используемыми значениями'):
        used = pg.evaluate("""() => { const b = document.querySelector('[data-item-usage]');
            return b ? b.dataset.itemUsage : null; }""")
        value = pg.locator('[data-item-value="%s"]' % used).input_value()
        pg.locator('[data-item-del="%s"]' % used).first.click()
        pg.wait_for_timeout(600)

        t.ck(pg.locator('.dc-modal').count() == 1, 'не открылся диалог замены значения')
        t.ck(pg.locator('.dc-warn-n').count() == 1, 'в диалоге нет числа затронутых объектов')
        t.ck(pg.locator('.dc-choice').count() == 2, 'в диалоге нет двух способов замены')
        t.ck(pg.locator('.dc-place.head').count() == 1,
             'таблица затронутых объектов без заголовка столбцов')
        t.ck('Заменить и удалить' in pg.locator('.dc-modal-foot').inner_text(),
             'кнопка подтверждения не называет действие')

        pg.locator('[data-rm-mode="new"]').first.check()
        pg.wait_for_timeout(300)
        t.ck('Переименовать' in pg.locator('[data-rm-ok]').inner_text(),
             'при переименовании кнопка не меняет надпись')
        pg.locator('[data-rm-new]').fill('Проверка замены')
        pg.locator('[data-rm-ok]').first.click()
        pg.wait_for_timeout(900)

        t.ck(pg.locator('.dc-modal').count() == 0, 'диалог замены не закрылся')
        values = pg.evaluate("""() => [...document.querySelectorAll('[data-item-value]')]
            .map((i) => i.value)""")
        t.ck('Проверка замены' in values, 'новое значение не появилось в справочнике')
        t.ck(value not in values, 'старое значение осталось в справочнике')

    # --- 9. перенос между каталогами: автопривязка на одноимённое поле ---
    #
    # Поле «Отопление» есть и у литеры, и у квартиры, но занято своим
    # справочником. Освобождаем его у квартиры и переносим туда справочник
    # литеры — автопривязка должна сработать без вопросов.
    t.open('#/dicts', wait='.dc')
    _expand_all(t)
    if t.ck(_open_in_catalog(t, 'Квартира', 'Отопление'), 'не нашёл отопление у квартиры'):
        pg.locator('[data-unbind]').first.click()
        pg.wait_for_timeout(400)
        pg.locator('.modal-foot .btn-primary, [data-modal-ok]').first.click()
        pg.wait_for_timeout(700)

    if t.ck(_open_in_catalog(t, 'Литера', 'Отопление'), 'не нашёл отопление у литеры'):
        before = pg.evaluate("""() => [...document.querySelectorAll('.dc-where-step b')]
            .map((b) => b.textContent.trim())""")
        pg.locator('[data-move-open]').first.click()
        pg.wait_for_timeout(500)

        target = pg.locator('[data-move-to]').filter(has_text='Квартира').first
        if t.ck(target.count() > 0, 'каталога «Квартира» нет среди целей переноса'):
            target.click()
            pg.wait_for_timeout(800)

            after = pg.evaluate("""() => [...document.querySelectorAll('.dc-where-step b')]
                .map((b) => b.textContent.trim())""")
            print('   до переноса:', before)
            print('   после:      ', after)
            t.ck(pg.locator('.dc-picker.warn').count() == 0,
                 'автопривязка не сработала, хотя одноимённое поле свободно')
            t.ck(after[1] == 'Квартира', 'справочник не переехал в каталог квартиры: %s' % after)
            t.ck(after[2] == before[2], 'автопривязка выбрала не одноимённое поле: %s' % after)

    # перенос туда, где одноимённого поля нет: система спрашивает и не меняет
    if t.ck(_open_in_catalog(t, 'Объект оценки', 'Тип документа'), 'не нашёл тип документа у ОЦ'):
        before = pg.evaluate("""() => [...document.querySelectorAll('.dc-where-step b')]
            .map((b) => b.textContent.trim())""")
        pg.locator('[data-move-open]').first.click()
        pg.wait_for_timeout(500)
        target = pg.locator('[data-move-to]').filter(has_text='Литера').first
        if target.count():
            target.click()
            pg.wait_for_timeout(800)
            after = pg.evaluate("""() => [...document.querySelectorAll('.dc-where-step b')]
                .map((b) => b.textContent.trim())""")
            t.ck(pg.locator('.dc-picker.warn').count() == 1,
                 'одноимённого поля нет, но выбор не предложен')
            t.ck(after == before, 'привязка изменилась до выбора поля')
            pg.locator('[data-move-cancel]').first.click()
            pg.wait_for_timeout(300)

    # --- 10. отвязка и раздел «Не привязаны» ---
    t.open('#/dicts', wait='.dc')
    _expand_all(t)
    if _find_dict(t, 'Кран-балка'):
        unbind = pg.locator('[data-unbind]')
        if t.ck(unbind.count() == 1, 'нет действия «Отвязать»'):
            unbind.first.click()
            pg.wait_for_timeout(500)
            pg.locator('.modal-foot .btn-primary, [data-modal-ok]').first.click()
            pg.wait_for_timeout(700)
            t.ck(pg.locator('.dc-badge.warn').count() == 1,
                 'отвязанный справочник не помечен')
            t.ck(pg.locator('.dc-tree-type.unbound').count() == 1,
                 'в дереве нет раздела «Не привязаны»')

            # и его можно привязать обратно
            pg.locator('[data-move-open]').first.click()
            pg.wait_for_timeout(500)
            pg.locator('[data-move-to]').first.click()
            pg.wait_for_timeout(600)
            slot = pg.locator('[data-bind-slot]')
            if slot.count():
                slot.first.click()
                pg.wait_for_timeout(600)
            t.ck(pg.locator('.dc-where-step').count() == 3, 'справочник не привязался обратно')

    # --- 11. поиск по дереву ---
    t.open('#/dicts', wait='.dc')
    pg.locator('[data-dc-q]').fill('полив')
    pg.wait_for_timeout(600)
    found = pg.locator('.dc-row').count()
    t.ck(0 < found < total, 'поиск по дереву не фильтрует: %d из %d' % (found, total))

    # --- 11а. ссылки на справочник из нескольких полей ---
    #
    # У наружных и внутренних стен перечень материалов один и тот же — ровно
    # тот случай, ради которого ссылки и вернули.
    t.open('#/dicts', wait='.dc')
    _expand_all(t)
    if t.ck(_find_dict(t, 'Наружные стены'), 'не нашёл справочник наружных стен'):
        was = pg.locator('.dc-where').count()
        t.ck(was == 1, 'у справочника сразу больше одной ссылки: %d' % was)

        pg.locator('[data-ref-add]').first.click()
        pg.wait_for_timeout(500)
        slots = pg.locator('[data-ref-slot]')
        t.ck(slots.count() > 50, 'в выборе поля показаны только свободные: %d' % slots.count())
        t.ck(pg.locator('.dc-slot.taken').count() > 0,
             'занятые поля не помечены — непонятно, что выбор отберёт поле')

        # поиск по полям: их больше сотни
        pg.locator('[data-ref-q]').fill('Внутренние')
        pg.wait_for_timeout(500)
        found = pg.locator('[data-ref-slot]')
        t.ck(0 < found.count() < 20, 'поиск по полям не фильтрует: %d' % found.count())

        found.first.click()
        pg.wait_for_timeout(500)
        ok = pg.locator('.modal-foot .btn-primary, [data-modal-ok]')
        t.ck(ok.count() > 0, 'переключение занятого поля прошло без подтверждения')
        if ok.count():
            ok.first.click()
            pg.wait_for_timeout(700)

        t.ck(pg.locator('.dc-where').count() == 2, 'вторая ссылка не появилась')
        t.ck(pg.locator('.dc-badge.multi').count() == 1, 'нет пометки о нескольких ссылках')
        t.ck('читают один перечень' in pg.locator('.dc-card').nth(2).inner_text(),
             'не сказано, что поля читают один перечень')

        # снятие дополнительной ссылки
        pg.locator('[data-ref-del]').first.click()
        pg.wait_for_timeout(600)
        t.ck(pg.locator('.dc-where').count() == 1, 'дополнительная ссылка не снялась')

    # --- 12. создание справочника строкой ---
    pg.locator('[data-dc-q]').fill('')
    pg.wait_for_timeout(400)
    _expand_all(t)
    before = pg.locator('.dc-row').count()
    pg.locator('[data-dc-new]').first.click()
    pg.wait_for_timeout(400)
    field = pg.locator('[data-dc-new-name]')
    t.ck(field.count() == 1, 'создание открывает отдельное окно')
    t.ck(pg.locator('.modal-head').count() == 0, 'при создании появилось модальное окно')
    field.fill('Проверочный справочник')
    field.press('Enter')
    pg.wait_for_timeout(800)
    t.ck(pg.locator('.dc-row').count() == before + 1, 'справочник не создался')
    t.ck(pg.locator('[data-dc-name]').input_value() == 'Проверочный справочник',
         'созданный справочник не открылся')
    t.ck(pg.locator('.dc-badge.warn').count() == 1,
         'новый справочник не помечен как непривязанный')
