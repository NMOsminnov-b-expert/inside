# -*- coding: utf-8 -*-
"""Каскад учреждения в архив и возврат ветки (этап 4 ТЗ docs/tz/20-arhiv.md, §4.4).

До этого удаление учреждения с закреплёнными объектами было вовсе запрещено
(check_institutions.py, было: «удалить узел с объектами нельзя»). Решение
пользователя 03.09.2026 снимает запрет: одной операцией в архив уезжают сам
узел, всё его поддерево и закреплённые за узлами поддерева объекты оценки
вместе с документами, а возврат поднимает всю ветку целиком.

Что держит сценарий:
  * диалог подтверждения называет точный состав (учреждение, подведомственные,
    объекты, документы) — числа должны сходиться со счётчиками в самой
    карточке, а не быть выдумкой;
  * после каскада узел (и поддерево) пропадают из дерева, а объект — из
    реестра; в архиве появляются записи узла, подведа и объекта одним пакетом;
  * возврат корневой записи поднимает всю ветку: оба узла и объект (с тем же
    кодом ЕНИ) возвращаются, архив по ним пустеет;
  * это то же самое «первое, что нужно проверить» и для одиночного узла без
    подведомственных и без объектов — каскад из одного узла тоже пакет.
"""
NAME = 'архив учреждений'


def _open_institutions(t):
    t.open('#/institutions', wait='.itree')
    t.page.wait_for_timeout(500)


def run(t):
    pg = t.page

    # Администратор — видит весь архив и вправе возвращать.
    t.open('', wait='.reg-thead')
    role = pg.locator('[data-role]')
    if role.count():
        role.first.select_option('admin')
        pg.wait_for_timeout(500)

    # --- 1. подготовка: узел с подведом и закреплённым объектом ---
    _open_institutions(t)
    # «+ Подведомственное» создаёт узел ПОД выбранным — сперва нужно выбрать
    # хоть какой-то узел (создаём прямо под первым корнем дерева).
    pg.locator('.itree-row[data-inode]').first.click()
    pg.wait_for_timeout(400)
    pg.locator('[data-inew]').first.click()
    pg.wait_for_timeout(300)
    pg.fill('[data-iform-name]', 'Проверка каскада архива')
    pg.locator('[data-iform-save]').first.click()
    pg.wait_for_timeout(700)
    if not t.ck(pg.locator('.ihead h2').inner_text().strip() == 'Проверка каскада архива',
                'узел для проверки каскада не создался'):
        return

    pg.locator('[data-inew]').first.click()
    pg.wait_for_timeout(300)
    pg.fill('[data-iform-name]', 'Подведомственная для проверки каскада')
    pg.locator('[data-iform-save]').first.click()
    pg.wait_for_timeout(700)
    t.ck(pg.locator('.ihead h2').inner_text().strip() == 'Подведомственная для проверки каскада',
         'подведомственный узел не создался')

    # Возвращаемся к родителю и закрепляем за ним объект — каскад должен
    # забрать объект узла, а не только его подведа.
    pg.locator('.itree-row').filter(has_text='Проверка каскада архива').first.click()
    pg.wait_for_timeout(500)

    pg.locator('[data-attach-open]').first.click()
    pg.wait_for_timeout(600)
    picks = pg.locator('[data-attach-pick]')
    if not t.ck(picks.count() > 0, 'нет кандидатов на привязку — каскад некому проверить'):
        return
    picks.first.check()
    pg.locator('[data-attach-apply]').first.click()
    pg.wait_for_timeout(800)

    eni = ''
    if pg.locator('[data-oc-row]').count():
        row_text = pg.locator('[data-oc-row]').first.inner_text()
        eni = ''.join(ch for ch in row_text if ch.isdigit())[:12]

    oc_count = pg.locator('[data-itab="oc"] b').inner_text().strip()
    doc_count = pg.locator('[data-itab="docs"] b').inner_text().strip()
    t.ck(oc_count == '1', 'у узла для проверки каскада должен быть ровно 1 свой объект, а не %s' % oc_count)

    # --- 2. диалог называет точный состав ---
    pg.locator('[data-idel]').first.click()
    pg.wait_for_timeout(600)
    modal_text = pg.locator('.modal').inner_text() if pg.locator('.modal').count() else ''
    t.ck('архив' in modal_text.lower(), 'диалог каскада не упоминает архив: %r' % modal_text)
    t.ck('1 подведомственная' in modal_text or '1 подведомственных' in modal_text,
         'диалог не назвал 1 подведомственную: %r' % modal_text)
    if oc_count != '0':
        t.ck(('%s объект' % oc_count) in modal_text,
             'состав объектов в диалоге разошёлся со счётчиком узла (%s): %r' % (oc_count, modal_text))

    # --- 3. подтверждаем — узел и объект уезжают в архив ---
    pg.locator('[data-modal-ok]').first.click()
    pg.wait_for_timeout(700)
    t.ck('Проверка каскада архива' not in pg.locator('.itree').inner_text(),
         'узел не пропал из дерева после каскада')

    t.open('#/archive', wait='.arc')
    pg.wait_for_timeout(500)

    inst_rows = pg.locator('[data-arc-kind="institution"]')
    t.ck(inst_rows.count() == 2, 'в архиве должно быть 2 записи учреждений (узел + подвед), а не %d' % inst_rows.count())

    oc_rows = pg.locator('[data-arc-kind="oc"]')
    t.ck(oc_rows.count() == (1 if oc_count == '1' else 0),
         'в архиве не появилась запись объекта из каскада')

    root_row = pg.locator('[data-arc-kind="institution"]:not(:has(.arc-sub))')
    t.ck(root_row.count() == 1, 'не нахожу корневую запись каскада учреждения (без подписи «Подведомственная · …»)')

    # --- 4. возврат корня поднимает всю ветку ---
    restore = root_row.locator('[data-arc-restore]')
    if t.ck(restore.count() > 0, 'у корневой записи каскада нет активной кнопки возврата'):
        restore.first.click()
        pg.wait_for_timeout(1200)

        _open_institutions(t)
        tree_text = pg.locator('.itree').inner_text()
        t.ck('Проверка каскада архива' in tree_text, 'учреждение не вернулось в дерево')
        t.ck('Подведомственная для проверки каскада' in tree_text, 'подведомственная не вернулась вместе с веткой')

        pg.locator('.itree-row').filter(has_text='Проверка каскада архива').first.click()
        pg.wait_for_timeout(500)
        t.ck(pg.locator('[data-itab="oc"] b').inner_text().strip() == oc_count,
             'после возврата ветки объект не вернулся к учреждению')
        if eni and pg.locator('[data-oc-row]').count():
            back_text = pg.locator('[data-oc-row]').first.inner_text()
            back_digits = ''.join(ch for ch in back_text if ch.isdigit())[:12]
            t.ck(back_digits == eni, 'после возврата у объекта другой код ЕНИ: было %s, стало %s' % (eni, back_digits))

        t.open('#/archive', wait='.arc')
        pg.wait_for_timeout(500)
        t.ck(pg.locator('[data-arc-kind="institution"]').count() == 0,
             'после возврата ветки в архиве остались записи учреждений')
        t.ck(pg.locator('[data-arc-kind="oc"]').count() == 0,
             'после возврата ветки в архиве остался объект')

    # --- 5. одиночный узел без подведов и объектов — тоже каскад (пакет из 1) ---
    _open_institutions(t)
    pg.locator('.itree-row[data-inode]').first.click()
    pg.wait_for_timeout(400)
    pg.locator('[data-inew]').first.click()
    pg.wait_for_timeout(300)
    pg.fill('[data-iform-name]', 'Одиночный узел для архива')
    pg.locator('[data-iform-save]').first.click()
    pg.wait_for_timeout(700)

    pg.locator('[data-idel]').first.click()
    pg.wait_for_timeout(500)
    modal_text = pg.locator('.modal').inner_text() if pg.locator('.modal').count() else ''
    t.ck('архив' in modal_text.lower(), 'диалог для одиночного узла не упоминает архив')
    pg.locator('[data-modal-ok]').first.click()
    pg.wait_for_timeout(700)
    t.ck('Одиночный узел для архива' not in pg.locator('.itree').inner_text(),
         'одиночный узел не убрался из дерева')

    t.open('#/archive', wait='.arc')
    pg.wait_for_timeout(500)
    solo = pg.locator('[data-arc-kind="institution"]').filter(has_text='Одиночный узел для архива')
    if t.ck(solo.count() == 1, 'одиночный узел не появился в архиве отдельной записью'):
        solo.locator('[data-arc-restore]').first.click()
        pg.wait_for_timeout(1000)
        _open_institutions(t)
        t.ck('Одиночный узел для архива' in pg.locator('.itree').inner_text(),
             'одиночный узел не вернулся из архива')

    # --- 6. возврат ОБЪЕКТА раньше учреждения поднимает ветку следом --------
    # Решение пользователя 04.09.2026: объект не должен становиться
    # нераспределённым, если вернули его раньше самого учреждения — ветка
    # учреждения поднимается вместе с ним. Заодно ловит регресс «фасета
    # без значения»: computeFacets() подставляет '—' для записей без
    # учреждения (только для показа в фильтре реестра), и до фикса
    # institutions.js: syncFromData() принимала эту заглушку за настоящее имя
    # и заводила в дереве призрачный узел «—».
    _open_institutions(t)
    pg.locator('.itree-row[data-inode]').first.click()
    pg.wait_for_timeout(400)
    pg.locator('[data-inew]').first.click()
    pg.wait_for_timeout(300)
    pg.fill('[data-iform-name]', 'Узел для проверки возврата объекта')
    pg.locator('[data-iform-save]').first.click()
    pg.wait_for_timeout(700)

    pg.locator('[data-attach-open]').first.click()
    pg.wait_for_timeout(600)
    picks2 = pg.locator('[data-attach-pick]')
    if t.ck(picks2.count() > 0, 'нет кандидатов на привязку — шаг 6 некому проверить'):
        picks2.first.check()
        pg.locator('[data-attach-apply]').first.click()
        pg.wait_for_timeout(800)

        pg.locator('[data-idel]').first.click()
        pg.wait_for_timeout(500)
        pg.locator('[data-modal-ok]').first.click()
        pg.wait_for_timeout(700)

        t.open('#/archive', wait='.arc')
        pg.wait_for_timeout(500)
        oc_row = pg.locator('[data-arc-kind="oc"]').filter(has_text='Узел для проверки возврата объекта')
        if t.ck(oc_row.count() >= 1, 'объект узла из шага 6 не нашёлся в архиве'):
            oc_row.first.locator('[data-arc-restore]').first.click()
            pg.wait_for_timeout(1200)

            _open_institutions(t)
            tree_text = pg.locator('.itree').inner_text()
            t.ck('Узел для проверки возврата объекта' in tree_text,
                 'учреждение не поднялось вместе с возвращённым объектом')
            t.ck('—' not in [r.strip() for r in tree_text.split('\n')],
                 'в дереве появился призрачный узел «—» (заглушка фасета вместо имени учреждения)')

            pg.locator('.itree-row').filter(has_text='Узел для проверки возврата объекта').first.click()
            pg.wait_for_timeout(500)
            t.ck(pg.locator('[data-itab="oc"] b').inner_text().strip() != '0',
                 'после возврата объект не оказался закреплён за поднятым учреждением')

    # --- 7. возврат ОДНОГО объекта каскада не должен «съедать» остальные ----
    # Баг, найденный пользователем 04.09.2026: у объекта, убранного каскадом
    # учреждения, batchId ОДИН на всю ветку (узлы + все объекты поддерева +
    # их документы — archiveNodeCascade кладёт всё одним addEntries). Прежний
    # restoreRecordEntry в kernel/archive.js помечал restoredAt ВСЕМ соседям
    # по batchId без разбора belonging — соседние объекты и узлы пропадали из
    # архива (список их больше не показывает), хотя их данные никуда не
    # восстанавливались: запись «уже вернули», а по факту потеряна.
    _open_institutions(t)
    pg.locator('.itree-row[data-inode]').first.click()
    pg.wait_for_timeout(400)
    pg.locator('[data-inew]').first.click()
    pg.wait_for_timeout(300)
    pg.fill('[data-iform-name]', 'Узел с двумя объектами для проверки батча')
    pg.locator('[data-iform-save]').first.click()
    pg.wait_for_timeout(700)

    pg.locator('[data-attach-open]').first.click()
    pg.wait_for_timeout(600)
    picks3 = pg.locator('[data-attach-pick]')
    n_picks = picks3.count()
    if t.ck(n_picks >= 2, 'нужно хотя бы 2 объекта-кандидата для проверки шага 7, найдено %d' % n_picks):
        picks3.nth(0).check()
        picks3.nth(1).check()
        pg.locator('[data-attach-apply]').first.click()
        pg.wait_for_timeout(800)
        oc_before = pg.locator('[data-itab="oc"] b').inner_text().strip()
        t.ck(oc_before == '2', 'к узлу шага 7 не привязались оба объекта: %s' % oc_before)

        pg.locator('[data-idel]').first.click()
        pg.wait_for_timeout(500)
        pg.locator('[data-modal-ok]').first.click()
        pg.wait_for_timeout(900)

        t.open('#/archive', wait='.arc')
        pg.wait_for_timeout(500)
        oc_rows7 = pg.locator('[data-arc-kind="oc"]').filter(has_text='Узел с двумя объектами')
        if t.ck(oc_rows7.count() == 2, 'после каскада в архиве не 2 объекта узла шага 7, а %d' % oc_rows7.count()):
            oc_rows7.first.locator('[data-arc-restore]').first.click()
            pg.wait_for_timeout(1200)

            t.open('#/archive', wait='.arc')
            pg.wait_for_timeout(500)
            show_restored7 = pg.locator('[data-arc-show-restored]')
            if show_restored7.count():
                show_restored7.first.check()
                pg.wait_for_timeout(500)

            after7 = pg.locator('[data-arc-kind="oc"]').filter(has_text='Узел с двумя объектами')
            t.ck(after7.count() == 2,
                 'после возврата одного объекта второй пропал из архива вместо того, чтобы остаться в нём: %d вместо 2'
                 % after7.count())

            still_archived = 0
            for i in range(after7.count()):
                cls = after7.nth(i).get_attribute('class') or ''
                if 'arc-restored' not in cls:
                    still_archived += 1
            t.ck(still_archived == 1,
                 'второй объект узла шага 7 должен остаться НЕвозвращённым в архиве, а таких %d' % still_archived)
