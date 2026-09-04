# -*- coding: utf-8 -*-
"""Архив объектов оценки и литер (этап 3 ТЗ docs/tz/20-arhiv.md).

Раньше объект оценки и литера удалялись безвозвратно: с объектом исчезали
литеры, документы, фото, заметки и лог, с литерой — её площади и документы.
Теперь удаление ведёт в архив, и оттуда запись возвращается на место.

Что держит сценарий:
  * удаление объекта убирает его из реестра и создаёт в архиве запись объекта
    плюс отдельные записи на его документы (чтобы документ находился поиском);
  * возврат объекта ставит его обратно с тем же кодом ЕНИ и всеми литерами, а
    дочерние записи документов при этом не остаются «висеть» в архиве;
  * удаление литеры кладёт в архив её саму, а не только упоминание, и возврат
    возвращает литеру в тот же объект;
  * диалоги говорят про архив, а не про безвозвратное удаление — иначе человек
    не решится нажать.
"""
NAME = 'архив объектов'


def _rows(pg):
    return pg.locator('[data-arc-row]').count()


def run(t):
    pg = t.page

    # Администратор: он видит весь архив и может возвращать.
    t.open('', wait='.reg-thead')
    role = pg.locator('[data-role]')
    if role.count():
        role.first.select_option('admin')
        pg.wait_for_timeout(500)

    # --- 1. объект оценки уезжает в архив ---
    t.open('#/oc/civil/oc-cv-1', wait='.card')
    pg.wait_for_timeout(600)

    eni = pg.locator('.ctx-eni, .plate-eni, .mono').first.inner_text().strip()
    oi_before = pg.locator('tr[data-open-oi]').count()
    t.ck(oi_before > 0, 'у объекта нет литер — сценарий не проверит их сохранность')

    btn = pg.locator('#btnDelOc')
    if not t.ck(btn.count() > 0, 'в карточке объекта нет кнопки удаления/архивации'):
        return

    btn.first.click()
    pg.wait_for_timeout(600)
    head = pg.locator('.modal-head').inner_text() if pg.locator('.modal-head').count() else ''
    t.ck('архив' in head.lower(),
         'диалог удаления объекта не говорит про архив: «%s»' % head)
    pg.locator('[data-modal-ok], .modal-foot .btn-primary').first.click()
    pg.wait_for_timeout(1200)

    # --- 2. в реестре объекта нет, в архиве есть ---
    t.open('#/oc/civil/oc-cv-1', wait='.card, .arc, .reg-thead')
    pg.wait_for_timeout(700)
    body = t.text()
    t.ck('не найден' in body.lower() or 'нет' in body.lower() or '#/oc/civil/oc-cv-1' not in pg.evaluate('() => location.hash'),
         'карточка удалённого объекта всё ещё открывается как обычная')

    t.open('#/archive', wait='.arc')
    pg.wait_for_timeout(500)
    total = _rows(pg)
    t.ck(total >= 1, 'объект не попал в архив')

    text = pg.locator('.arc-tbl').inner_text() if pg.locator('.arc-tbl').count() else ''
    t.ck('Объект оценки' in text, 'в архиве не указано, что убран объект оценки')

    # --- 3. возврат объекта ---
    # Возвращаем именно запись объекта, а не один из его документов: вид записи
    # виден в строке (data-arc-kind).
    restore = pg.locator('[data-arc-kind="oc"] [data-arc-restore]')
    if t.ck(restore.count() > 0, 'у архивной записи объекта нет кнопки возврата'):
        restore.first.click()
        pg.wait_for_timeout(1200)

        t.open('#/oc/civil/oc-cv-1', wait='.card')
        pg.wait_for_timeout(800)
        t.ck(pg.locator('.card').count() > 0, 'объект не вернулся: карточка не открывается')
        t.ck(pg.locator('tr[data-open-oi]').count() == oi_before,
             'после возврата литер стало %d вместо %d'
             % (pg.locator('tr[data-open-oi]').count(), oi_before))
        if eni and eni.count('-') >= 2:
            t.ck(eni.replace(' ', '') in t.text().replace(' ', ''),
                 'после возврата у объекта другой код ЕНИ (был %s)' % eni)

        t.open('#/archive', wait='.arc')
        pg.wait_for_timeout(500)
        t.ck(_rows(pg) == 0,
             'после возврата объекта в архиве осталось %d записей — дочерние документы не закрылись'
             % _rows(pg))

    # --- 4. литера уезжает в архив и возвращается ---
    t.open('#/oc/civil/oc-cv-1', wait='tr[data-open-oi]')
    pg.wait_for_timeout(600)
    before = pg.locator('tr[data-open-oi]').count()

    # Кнопка удаления есть и у участка (он показан отдельной строкой), поэтому
    # берём её именно из строки литеры — иначе проверка удалит участок, а
    # считать будет литеры.
    del_oi = pg.locator('tr[data-open-oi] [data-del-oi]')
    if t.ck(del_oi.count() > 0, 'в перечне ОИ нет кнопки удаления литеры'):
        del_oi.first.click()
        pg.wait_for_timeout(600)
        if pg.locator('[data-modal-ok]').count():
            pg.locator('[data-modal-ok], .modal-foot .btn-primary').first.click()
            pg.wait_for_timeout(1000)

        t.ck(pg.locator('tr[data-open-oi]').count() == before - 1,
             'литера не убралась из перечня')

        t.open('#/archive', wait='.arc')
        pg.wait_for_timeout(500)
        t.ck(_rows(pg) >= 1, 'удалённая литера не попала в архив')
        text = pg.locator('.arc-tbl').inner_text() if pg.locator('.arc-tbl').count() else ''
        t.ck('Литера' in text or 'Земельный участок' in text,
             'в архиве не видно, что убрана литера: %s' % text.replace(chr(10), ' ')[:80])

        pg.locator('[data-arc-kind="oi"] [data-arc-restore]').first.click()
        pg.wait_for_timeout(1200)

        t.open('#/oc/civil/oc-cv-1', wait='tr[data-open-oi]')
        pg.wait_for_timeout(700)
        t.ck(pg.locator('tr[data-open-oi]').count() == before,
             'литера не вернулась: %d вместо %d'
             % (pg.locator('tr[data-open-oi]').count(), before))

        t.open('#/archive', wait='.arc')
        pg.wait_for_timeout(400)
        t.ck(_rows(pg) == 0, 'после возврата литеры запись осталась в архиве')

    # --- 5. кнопка «в архив» работает во всех пяти модулях ---
    #
    # Дефект, ради которого это здесь: импорт archiveRecord однажды добавился
    # только в два модуля из пяти, а сценарий смотрел лишь civil — в остальных
    # кнопка падала с ошибкой и объект не уезжал никуда.
    MODULES = [
        ('apartment', 'oc-ap-1'),
        ('residential-house', 'oc-rh-1'),
        ('production', 'oc-pr-1'),
        ('land-plot', 'oc-lp-1'),
    ]

    for mod, ocid in MODULES:
        t.open('#/oc/%s/%s' % (mod, ocid), wait='.card')
        pg.wait_for_timeout(600)
        if not pg.locator('#btnDelOc').count():
            t.ck(False, '%s: в карточке нет кнопки «в архив»' % mod)
            continue

        pg.locator('#btnDelOc').click()
        pg.wait_for_timeout(600)
        head = pg.locator('.modal-head').inner_text() if pg.locator('.modal-head').count() else ''
        if not t.ck('архив' in head.lower(), '%s: диалог не про архив: «%s»' % (mod, head)):
            continue
        pg.locator('[data-modal-ok], .modal-foot .btn-primary').first.click()
        pg.wait_for_timeout(1200)

        t.open('#/archive', wait='.arc')
        pg.wait_for_timeout(400)
        t.ck(pg.locator('[data-arc-kind="oc"]').count() >= 1,
             '%s: объект не попал в архив — кнопка не сработала' % mod)

        restore = pg.locator('[data-arc-kind="oc"] [data-arc-restore]')
        if restore.count():
            restore.first.click()
            pg.wait_for_timeout(1000)
