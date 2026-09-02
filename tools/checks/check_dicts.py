# -*- coding: utf-8 -*-
"""Справочники: каталоги, привязка к полю, значения, удаление с заменой.

ТЗ: docs/tz/10-spravochniki.md. Проверяются решения пользователя 02.09.2026:
  * одно поле — один справочник, всегда (ссылок на общий перечень нет);
  * справочники одноимённых полей связаны, и правку значения можно применить
    сразу ко всем отмеченным;
  * каталоги жёсткие: тип ОЦ → тип ОИ, вручную не создаются;
  * перенос в другой каталог перевешивает привязку на одноимённое поле, а если
    такого нет — спрашивает и до ответа ничего не меняет;
  * значение без использования удаляется сразу, используемое — только с заменой;
  * правят администратор и роль «любая»; системные перечни только читаются;
  * значение и справочник добавляются строкой, без модальных окон;
  * раскладка — три столбца: тип ОЦ → тип ОИ → значения; клик по значению
    открывает связанный с ним справочник в том же третьем столбце, а связанные
    справочники стоят отдельным столбцом справа;
  * непривязанные справочники ищутся в ветке «Не привязаны» первого столбца и
    прикрепляются кнопкой «Привязать к полю».
"""
NAME = 'справочники'


def _role(t, key):
    """Переключить роль в реестре — права раздела считаются от неё."""
    t.open('', wait='.reg-thead')
    t.page.locator('[data-role]').first.select_option(key)
    t.page.wait_for_timeout(400)


def _view(t, key):
    """Переключить вид навигации: он выбирается в настройках (меню «Вид»)."""
    pg = t.page
    if pg.locator('[data-view="%s"].on' % key).count() and not pg.locator('.dc-views.open').count():
        return
    if not pg.locator('.dc-views.open').count():
        pg.locator('[data-view-toggle]').first.click()
        pg.wait_for_timeout(200)
    pg.locator('[data-view="%s"]' % key).first.click()
    pg.wait_for_timeout(400)


def _expand_all(t):
    """Включить дерево и раскрыть его: по умолчанию вид «шаги», а дерево свёрнуто.

    Заодно снимаем фильтр поиска: переход на тот же hash страницу не
    перезагружает, и запрос из предыдущего шага остался бы в силе.
    """
    pg = t.page
    _view(t, 'tree')
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


def _linked_counts(t):
    """Сколько значений у каждого связанного справочника — по подписи строки."""
    texts = t.page.evaluate("""() => [...document.querySelectorAll('.dc-linked-main span')]
        .map((x) => x.textContent)""")
    out = []
    for text in texts:
        digits = ''.join(ch if ch.isdigit() else ' ' for ch in text).split()
        out.append(int(digits[0]) if digits else 0)
    return out


def _add_value(t, value):
    field = t.page.locator('[data-item-new]')
    field.fill(value)
    field.press('Enter')
    t.page.wait_for_timeout(500)


def run(t):
    pg = t.page

    # --- 1. каталоги: тип ОЦ → тип ОИ ---
    t.open('#/dicts', wait='.dc')

    # Вид по умолчанию — «шаги»: он понятен без опыта с деревом.
    t.ck(pg.locator('.dc-steps').count() == 1, 'вид по умолчанию не «шаги»')

    # В дереве по умолчанию всё свёрнуто (требование пользователя).
    _view(t, 'tree')
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
    _view(t, 'tree')
    pg.locator('[data-dc-q]').fill('полив')
    pg.wait_for_timeout(600)
    found = pg.locator('.dc-row').count()
    t.ck(0 < found < total, 'поиск по дереву не фильтрует: %d из %d' % (found, total))

    # --- 11а. связанные справочники: синхронизация значений ---
    #
    # Связаны справочники одноимённых полей: «Фундамент» у гражданского,
    # производственного, жилого. Общего перечня нет — каждый свой, но правку
    # можно применить сразу ко всем отмеченным.
    t.open('#/dicts', wait='.dc')
    _expand_all(t)
    if t.ck(_find_dict(t, 'Фундамент'), 'не нашёл справочник фундамента'):
        t.ck(pg.locator('.dc-where').count() == 1,
             'у справочника больше одной привязки — должно быть строго одно поле')

        linked = pg.locator('[data-linked]')
        t.ck(linked.count() >= 3, 'связанных справочников только %d' % linked.count())
        t.ck(pg.locator('.dc-side').count() == 1,
             'связанные справочники не вынесены в столбец справа')

        # по умолчанию отмечены все
        checked = pg.evaluate("""() => [...document.querySelectorAll('[data-linked]')]
            .filter((c) => c.checked).length""")
        t.ck(checked == linked.count(),
             'по умолчанию отмечены не все связанные: %d из %d' % (checked, linked.count()))

        # Столбец связанных виден всегда: аккордеона больше нет — его не
        # замечали, пока правили значения (пользователь 02.09.2026).
        t.ck(pg.locator('.dc-linked-diff').count() == linked.count(),
             'не показано расхождение состава со связанными')

        # добавление значения уходит в связанные
        counts_before = _linked_counts(t)
        field = pg.locator('[data-item-new]')
        field.fill('Проверка синхронизации')
        field.press('Enter')
        pg.wait_for_timeout(900)

        toast = pg.locator('.toast')
        t.ck(toast.count() > 0 and 'ещё в' in toast.first.inner_text(),
             'не сообщено, что значение ушло в связанные справочники')
        counts_after = _linked_counts(t)
        t.ck(counts_after != counts_before,
             'состав связанных справочников не изменился: %s' % counts_after)

        # снятая галочка исключает справочник из правки
        pg.locator('[data-linked]').first.uncheck()
        pg.wait_for_timeout(400)
        off = pg.evaluate("""() => [...document.querySelectorAll('[data-linked]')]
            .filter((c) => !c.checked).length""")
        t.ck(off == 1, 'галочка не снялась')

        counts_before = _linked_counts(t)
        field = pg.locator('[data-item-new]')
        field.fill('Только здесь и в отмеченных')
        field.press('Enter')
        pg.wait_for_timeout(900)
        counts_after = _linked_counts(t)
        t.ck(counts_after[0] == counts_before[0],
             'значение ушло в справочник со снятой галочкой')
        t.ck(counts_after[1] != counts_before[1],
             'значение не ушло в отмеченный справочник')

        # Кнопка одна и меняет смысл: пока отмечены не все — «выбрать все»,
        # когда все — «снять все». Проверяем оба перехода.
        def linked_on():
            return pg.evaluate("""() => [...document.querySelectorAll('[data-linked]')]
                .filter((c) => c.checked).length""")

        mode = pg.locator('[data-linked-all]').first.get_attribute('data-linked-all')
        t.ck(mode == 'on', 'после снятия галочки кнопка не предлагает выбрать все')
        pg.locator('[data-linked-all]').first.click()
        pg.wait_for_timeout(400)
        t.ck(linked_on() == linked.count(), 'кнопка «выбрать все» не отметила все')

        pg.locator('[data-linked-all]').first.click()
        pg.wait_for_timeout(400)
        t.ck(linked_on() == 0, 'кнопка «снять все» не сняла отметки')

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

    # --- 13. раскладка из трёх столбцов ---
    #
    # Плитки, плоская таблица и группировка по полям пробовались и убраны
    # 02.09.2026: осталось два вида — столбцы (по умолчанию) и дерево.
    # Столбцы не должны менять ширину при выборе, поэтому третий столбец
    # переключается между списком значений и открытым справочником, а не
    # раскрывает карточку под собой.
    t.open('#/dicts', wait='.dc')
    pg.reload()
    pg.wait_for_selector('.dc')
    pg.wait_for_timeout(400)

    t.ck(pg.locator('.dc-steps').count() == 1, 'вид по умолчанию не «столбцы»')
    t.ck(pg.locator('.dc-step').count() == 3, 'столбцов не три: %d' % pg.locator('.dc-step').count())

    pg.locator('[data-view-toggle]').first.click()
    pg.wait_for_timeout(300)
    t.ck(pg.locator('[data-view]').count() == 2,
         'видов не два: %d' % pg.locator('[data-view]').count())
    pg.locator('.dc').first.click(position={'x': 6, 'y': 6})
    pg.wait_for_timeout(250)
    t.ck(pg.locator('.dc-views.open').count() == 0, 'меню вида не закрывается кликом мимо')

    # Ширины столбцов не скачут при переходе по шагам — ради этого раскладку и
    # переделывали (пользователь 02.09.2026: «чтобы размеры текущих окон не скакали»).
    def widths():
        return pg.evaluate("""() => [...document.querySelectorAll('.dc-step')]
            .map((e) => Math.round(e.getBoundingClientRect().width))""")

    w0 = widths()
    pg.locator('[data-step-type="civil"]').first.click()
    pg.wait_for_timeout(300)
    t.ck(pg.locator('[data-step-card]').count() > 0, 'типы ОИ не появились после выбора типа ОЦ')
    w1 = widths()

    pg.locator('[data-step-card]').nth(1).click()
    pg.wait_for_timeout(300)
    fields = pg.locator('.dc-step-row.dict').count()
    t.ck(fields > 0, 'значения (поля) не появились после выбора типа ОИ')
    w2 = widths()

    pg.locator('.dc-step-row.dict').first.click()
    pg.wait_for_timeout(500)
    w3 = widths()
    t.ck(w0 == w1 == w2 == w3, 'ширины столбцов скачут: %s → %s → %s → %s' % (w0, w1, w2, w3))

    # Открытый справочник живёт в том же третьем столбце, с возвратом к списку.
    t.ck(pg.locator('[data-dc-name]').count() == 1, 'справочник не открылся в столбце')
    t.ck(pg.locator('.dc-tbl').count() == 1, 'в открытом справочнике нет таблицы значений')
    # В столбце те же блоки, что и в дереве (требование пользователя 02.09.2026).
    for block in ('Общие сведения', 'Значения', 'Где применяется', 'Использование'):
        t.ck(block in t.text(), 'в столбце нет блока «%s»' % block)
    t.ck(pg.locator('[data-dc-back]').count() == 1, 'нет возврата к списку значений')

    # Связанные справочники — отдельный столбец справа, а не аккордеон внизу.
    t.ck(pg.locator('.dc-side').count() == 1, 'связанные справочники не вынесены в столбец')
    t.ck(pg.locator('.dc-side [data-linked]').count() > 0, 'столбец связанных пуст')

    pg.locator('[data-dc-back]').first.click()
    pg.wait_for_timeout(400)
    t.ck(pg.locator('.dc-step-row.dict').count() == fields,
         'возврат не вернул к списку значений')

    # --- 14. непривязанный справочник: найти и прикрепить ---
    pg.locator('[data-dc-new]').first.click()
    pg.wait_for_timeout(300)
    field = pg.locator('[data-dc-new-name]')
    field.fill('Проверочный непривязанный')
    field.press('Enter')
    pg.wait_for_timeout(800)

    types = pg.eval_on_selector_all('[data-step-type]',
                                    'els => els.map((e) => e.textContent.trim())')
    t.ck(any('Не привязаны' in x for x in types),
         'непривязанные не выделены в первом столбце: %s' % types)
    t.ck(pg.locator('[data-move-open]').count() == 1,
         'у непривязанного справочника нет кнопки «Привязать к полю»')

    pg.locator('[data-move-open]').first.click()
    pg.wait_for_timeout(400)
    t.ck(pg.locator('[data-move-to]').count() > 10,
         'при привязке не предложены каталоги')

    pg.locator('[data-move-to]').first.click()
    pg.wait_for_timeout(600)
    # После выбора каталога либо привязка прошла (появилась цепочка в блоке 03),
    # либо система спросила, к какому полю привязывать.
    bound = pg.locator('.dc-where-step').count() + pg.locator('[data-bind-slot]').count()
    t.ck(bound > 0, 'привязка непривязанного справочника не пошла дальше выбора каталога')
