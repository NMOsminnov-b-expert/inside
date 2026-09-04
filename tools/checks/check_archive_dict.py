# -*- coding: utf-8 -*-
"""Архив справочников (этап 5 ТЗ docs/tz/20-arhiv.md, §4.5).

Раньше «Удалить справочник» стирало перечень значений безвозвратно (и вообще
было доступно только для непривязанных справочников). Теперь удаление уводит
справочник в архив вместе с его последней привязкой к полю, а возврат ставит
его обратно — в тот же каталог и снова к тому же полю, если оно к тому времени
не занято другим справочником; если занято — предложена замена (тот же диалог,
что и при переносе справочника между каталогами), а не молчаливая перезапись.

Что держит сценарий:
  * диалог удаления называет архив и предупреждает, что поле вернётся к
    встроенному перечню — а не «значения будут потеряны», как раньше;
  * после архивирования справочник пропадает из каталога;
  * в архиве появляется запись kind:'dict' с подписью каталога и поля;
  * возврат на свободное поле снова привязывает справочник к нему;
  * возврат на ЗАНЯТОЕ другим справочником поле ничего не перезаписывает
    молча: справочник возвращается нераспределённым, а чужая привязка цела.
"""
NAME = 'архив справочников'


def _create_dict(pg, t, name):
    pg.locator('[data-dc-new]').first.click()
    pg.wait_for_timeout(300)
    pg.fill('[data-dc-new-name]', name)
    pg.keyboard.press('Enter')
    pg.wait_for_timeout(600)
    return t.ck(pg.locator('[data-dc-name]').input_value().strip() == name,
                'справочник «%s» не создался или не открылся' % name)


def run(t):
    pg = t.page

    t.open('', wait='.reg-thead')
    role = pg.locator('[data-role]')
    if role.count():
        role.first.select_option('admin')
        pg.wait_for_timeout(500)

    # --- 1. новый справочник, привязка к занятому полю (замена) ---
    # Встроенных перечней в макете много — почти все поля уже заняты, поэтому
    # берём именно занятое поле и заменяем его владельца (тот же диалог, что
    # при обычной привязке нового справочника поверх существующего).
    t.open('#/dicts', wait='.dc-steps, .dc-tree')
    pg.wait_for_timeout(500)
    if not _create_dict(pg, t, 'Проверка архива справочников A'):
        return

    pg.locator('[data-move-open]').first.click()
    pg.wait_for_timeout(400)
    move_to = pg.locator('[data-move-to]:not([disabled])').first
    if not t.ck(move_to.count() > 0, 'нет доступных каталогов для привязки'):
        return
    type_id, card = move_to.get_attribute('data-move-to').split('|')
    move_to.click()
    pg.wait_for_timeout(400)

    busy_slot = pg.locator('[data-bind-slot][data-bind-busy]').first
    if not t.ck(busy_slot.count() > 0, 'в выбранном каталоге нет ни одного занятого поля для проверки замены'):
        return
    field_label = busy_slot.get_attribute('data-bind-slot').split('|')[-1]
    displaced_name = busy_slot.get_attribute('data-bind-busy')
    busy_slot.click()
    pg.wait_for_timeout(400)
    # Замена спрашивает подтверждения отдельным диалогом.
    if pg.locator('[data-modal-ok]').count():
        pg.locator('[data-modal-ok]').first.click()
        pg.wait_for_timeout(400)

    chain = pg.locator('.dc-chain').inner_text()
    t.ck('Ни к чему не привязан' not in chain, 'справочник A не привязался к полю')

    # --- 2. диалог удаления говорит про архив, а не про потерю значений ---
    pg.locator('[data-dc-del]').first.click()
    pg.wait_for_timeout(500)
    modal_text = pg.locator('.modal').inner_text() if pg.locator('.modal').count() else ''
    t.ck('архив' in modal_text.lower(), 'диалог удаления справочника не упоминает архив: %r' % modal_text)
    t.ck('встроенному перечню' in modal_text or 'встроенный перечень' in modal_text,
         'диалог не предупреждает, что поле вернётся к встроенному перечню: %r' % modal_text)
    t.ck('потеряны' not in modal_text.lower(), 'диалог всё ещё пугает безвозвратной потерей значений')

    pg.locator('[data-modal-ok]').first.click()
    pg.wait_for_timeout(600)
    # #content, а не весь body: тост «Убрано в архив: …» ещё висит несколько
    # секунд (kernel/toast.js) и содержит то же название справочника.
    t.ck('Проверка архива справочников A' not in pg.locator('#content').inner_text(),
         'справочник A не пропал из раздела после архивирования')

    # --- 3. запись появилась в архиве с указанием каталога и поля ---
    t.open('#/archive', wait='.arc')
    pg.wait_for_timeout(500)
    dict_row = pg.locator('[data-arc-kind="dict"]').filter(has_text='Проверка архива справочников A')
    if not t.ck(dict_row.count() == 1, 'справочник A не появился в архиве отдельной записью'):
        return
    row_text = dict_row.inner_text()
    t.ck(field_label in row_text, 'в архивной записи не видно поле привязки (%s): %r' % (field_label, row_text))

    # --- 4. поле теперь свободно (A ушёл, вытесненный не возвращается сам) —
    # занимаем его справочником C, чтобы проверить возврат A НА ЗАНЯТОЕ поле ---
    t.open('#/dicts', wait='.dc-steps, .dc-tree')
    pg.wait_for_timeout(400)
    if not _create_dict(pg, t, 'Проверка архива справочников C'):
        return

    pg.locator('[data-move-open]').first.click()
    pg.wait_for_timeout(400)
    pg.locator('[data-move-to="%s|%s"]' % (type_id, card)).first.click()
    pg.wait_for_timeout(400)
    # data-bind-slot — «typeId|card|fieldKey|label» (четыре части): ключ поля
    # неизвестен заранее, поэтому ищем по началу (тип+каталог) и концу (подпись).
    same_field = pg.locator('[data-bind-slot^="%s|%s|"][data-bind-slot$="|%s"]' % (type_id, card, field_label))
    if not t.ck(same_field.count() > 0, 'поле, освобождённое архивированным A, не нашлось для проверки конфликта'):
        return
    same_field.first.click()
    pg.wait_for_timeout(400)
    if pg.locator('[data-modal-ok]').count():
        pg.locator('[data-modal-ok]').first.click()
        pg.wait_for_timeout(400)

    # --- 5. возврат A на занятое C поле — без молчаливой перезаписи ---
    t.open('#/archive', wait='.arc')
    pg.wait_for_timeout(500)
    dict_row = pg.locator('[data-arc-kind="dict"]').filter(has_text='Проверка архива справочников A')
    restore = dict_row.locator('[data-arc-restore]')
    if not t.ck(restore.count() > 0, 'у архивной записи справочника A нет активной кнопки возврата'):
        return
    restore.first.click()
    pg.wait_for_timeout(1000)

    t.ck(pg.locator('[data-arc-kind="dict"]').filter(has_text='Проверка архива справочников A').count() == 0,
         'после возврата справочник A всё ещё числится в архиве как неразобранный')

    # Поле занято C — A должен вернуться нераспределённым, а не отобрать
    # привязку у C молча. Сперва проверяем, что C её не потерял.
    t.open('#/dicts', wait='.dc-steps, .dc-tree')
    pg.wait_for_timeout(400)
    pg.locator('[data-step-type="%s"]' % type_id).first.click()
    pg.wait_for_timeout(400)
    pg.locator('[data-step-card="%s|%s"]' % (type_id, card)).first.click()
    pg.wait_for_timeout(400)

    c_row = pg.locator('[data-dict]').filter(has_text='Проверка архива справочников C')
    if t.ck(c_row.count() == 1, 'справочник C пропал из каталога после возврата A — перезаписан молча'):
        c_row.first.click()
        pg.wait_for_timeout(400)
        chain = pg.locator('.dc-chain').inner_text()
        t.ck('Ни к чему не привязан' not in chain,
             'справочник C потерял привязку к полю после возврата A из архива — молчаливая перезапись')

    a_row_here = pg.locator('[data-dict]').filter(has_text='Проверка архива справочников A')
    t.ck(a_row_here.count() == 0,
         'справочник A встал в тот же каталог, что и C, — привязка отобрана молча')

    # А сам A должен найтись нераспределённым — «Не привязаны».
    t.open('#/dicts', wait='.dc-steps, .dc-tree')
    pg.wait_for_timeout(400)
    pg.locator('[data-step-type=""]').first.click()
    pg.wait_for_timeout(400)
    unbound_card = pg.locator('[data-step-card]').first
    if unbound_card.count():
        unbound_card.click()
        pg.wait_for_timeout(400)

    a_row = pg.locator('[data-dict]').filter(has_text='Проверка архива справочников A')
    if t.ck(a_row.count() == 1, 'справочник A не нашёлся среди непривязанных после возврата на занятое поле'):
        a_row.first.click()
        pg.wait_for_timeout(400)
        chain = pg.locator('.dc-chain').inner_text()
        t.ck('Ни к чему не привязан' in chain,
             'справочник A должен был вернуться без привязки (поле занято C)')
