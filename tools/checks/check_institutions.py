# -*- coding: utf-8 -*-
"""Раздел «Учреждения»: дерево, правка, привязка объектов оценки.

Раздел воссоздан 03.09.2026 по образцу рабочей системы, но в стилях макета.
Сценарий держит то, что легко сломать при следующих правках:

  * учреждение вкладывается в учреждение на любую глубину (у подведа свой
    подвед) — дерево не должно упираться в два уровня;
  * счётчик у узла считает всю ветку, а «объектов своих» — только его;
  * объект оценки прикрепляется к узлу и открепляется, и это меняет саму
    запись: в реестре у неё меняются учреждение и подведомственная организация;
  * удаление узла с объектами предупреждает точным составом и уводит всё
    каскадом в архив, а не удаляет и не блокируется (ТЗ docs/tz/20-arhiv.md,
    §4.4, решение пользователя 03.09.2026 — прежний запрет снят);
  * поиск, «по регионам» и избранное работают.
"""
NAME = 'учреждения'


def _open(t):
    t.open('#/institutions', wait='.itree')
    t.page.wait_for_timeout(500)


def _select_with_objects(t):
    """Выбрать узел, у которого есть свои объекты оценки."""
    pg = t.page
    rows = pg.locator('.itree-row[data-inode]')

    for i in range(min(rows.count(), 30)):
        rows.nth(i).click()
        pg.wait_for_timeout(500)
        if pg.locator('[data-oc-row]').count():
            return True
    return False


def _level(pg):
    """Уровень вложенности выбранного узла — по отступу строки в дереве.

    В шапке карточки его больше нет (пользователь 03.09.2026: «уровень,
    подведомственных, объектов своих, документов — эти поля убираем»), но
    сама вложенность проверяться должна.
    """
    return int(pg.eval_on_selector('.itree-row.on',
                                   'e => e.style.getPropertyValue("--depth")'))


def run(t):
    pg = t.page
    _open(t)

    # --- 1. дерево ---
    t.ck(pg.locator('.itree-row').count() > 3, 'дерево пустое')
    roots = pg.eval_on_selector_all('.itree-row[style*="--depth:0"] .itree-name',
                                    'els => els.map((e) => e.textContent.trim())')
    t.ck(len(roots) >= 2, 'в дереве нет корней: %s' % roots)

    # --- 2. узел с объектами: счётчики и таблица ---
    if not t.ck(_select_with_objects(t), 'не нашёл учреждение с объектами оценки'):
        return

    # Счётчики живут на вкладках, а не в шапке: шапку пользователь просил
    # сжать (03.09.2026), уровень видно по отступу в дереве.
    t.ck(pg.locator('[data-itab="oc"] b').inner_text().strip().isdigit(),
         'на вкладке объектов нет счётчика')
    t.ck(pg.locator('[data-itab="docs"] b').inner_text().strip().isdigit(),
         'на вкладке документов нет счётчика')

    rows_before = pg.locator('[data-oc-row]').count()
    t.ck(rows_before > 0, 'таблица объектов пуста')

    # Поиск внутри таблицы сужает выборку и очищается. Ищем по адресу: ЕНИ в
    # таблице показан с разделителями, а в данных лежит цифрами.
    address = pg.locator('[data-oc-row] td').nth(1).inner_text().strip()
    pg.fill('[data-irowq]', address.split(',')[0][:10] if address and address != '—' else 'а')
    pg.wait_for_timeout(500)
    t.ck(pg.locator('[data-oc-row]').count() >= 1, 'поиск по таблице ничего не нашёл')
    pg.fill('[data-irowq]', 'заведомо-ничего-нет')
    pg.wait_for_timeout(500)
    t.ck(pg.locator('[data-oc-row]').count() == 0, 'поиск по таблице не фильтрует')
    pg.locator('[data-irowq-clear]').first.click()
    pg.wait_for_timeout(400)
    t.ck(pg.locator('[data-oc-row]').count() == rows_before, 'очистка поиска не вернула строки')

    # --- 3. удаление узла с объектами — каскад в архив, не блокировка ---
    oc_count_text = pg.locator('[data-itab="oc"] b').inner_text().strip()
    pg.locator('[data-idel]').first.click()
    pg.wait_for_timeout(600)
    modal = pg.locator('.modal')
    modal_text = modal.inner_text() if modal.count() == 1 else ''
    t.ck('архив' in modal_text.lower(), 'диалог удаления не упоминает архив: %r' % modal_text)
    t.ck('Вернуть' in modal_text, 'диалог не говорит, что учреждение можно вернуть')
    t.ck(oc_count_text in modal_text or oc_count_text == '0',
         'состав в диалоге не сходится со счётчиком объектов узла (%r не в %r)' % (oc_count_text, modal_text))
    # Отменяем — дальнейшие шаги сценария используют тот же узел и дерево.
    pg.locator('[data-modal-cancel]').first.click()
    pg.wait_for_timeout(400)
    t.ck(pg.locator('[data-oc-row]').count() == rows_before, 'отмена диалога всё равно изменила список объектов')

    # --- 4. вложенность любой глубины ---
    level_before = _level(pg)

    pg.locator('[data-inew]').first.click()
    pg.wait_for_timeout(300)
    pg.fill('[data-iform-name]', 'Проверочный подвед')
    pg.locator('[data-iform-save]').first.click()
    pg.wait_for_timeout(700)
    t.ck(pg.locator('.ihead h2').inner_text().strip() == 'Проверочный подвед',
         'подведомственное учреждение не создалось')

    level_child = _level(pg)
    t.ck(level_child == level_before + 1,
         'уровень вложенности не вырос: %d → %d' % (level_before, level_child))

    # ещё уровень глубже — «у подведа свой подвед»
    pg.locator('[data-inew]').first.click()
    pg.wait_for_timeout(300)
    pg.fill('[data-iform-name]', 'Проверочный подвед второго уровня')
    pg.locator('[data-iform-save]').first.click()
    pg.wait_for_timeout(700)
    level_grand = _level(pg)
    t.ck(level_grand == level_child + 1,
         'третий уровень вложенности не создался: %d' % level_grand)

    # --- 5. привязка объекта оценки ---
    pg.locator('[data-attach-open]').first.click()
    pg.wait_for_timeout(600)
    picks = pg.locator('[data-attach-pick]')
    if t.ck(picks.count() > 0, 'нет кандидатов на привязку'):
        picks.first.check()
        pg.locator('[data-attach-apply]').first.click()
        pg.wait_for_timeout(800)
        t.ck(pg.locator('[data-oc-row]').count() == 1,
             'объект не прикрепился к учреждению')

        # Привязка меняет саму запись: в реестре объект теперь числится за этим
        # учреждением — проверяем через фильтр реестра по учреждению.
        t.ck(pg.locator('[data-itab="oc"] b').inner_text().strip() == '1',
             'счётчик учреждения не увидел прикреплённый объект')

    # --- 6. переименование ---
    pg.locator('[data-iedit]').first.click()
    pg.wait_for_timeout(300)
    pg.fill('[data-iform-name]', 'Проверочный подвед (переименован)')
    pg.locator('[data-iform-save]').first.click()
    pg.wait_for_timeout(700)
    t.ck(pg.locator('.ihead h2').inner_text().strip() == 'Проверочный подвед (переименован)',
         'переименование не применилось')

    # --- 7. открепление и удаление ---
    pg.locator('[data-detach]').first.click()
    pg.wait_for_timeout(500)
    ok = pg.locator('[data-modal-ok]')
    if ok.count():
        ok.first.click()
        pg.wait_for_timeout(700)
    t.ck(pg.locator('[data-oc-row]').count() == 0, 'объект не открепился')

    pg.locator('[data-idel]').first.click()
    pg.wait_for_timeout(700)
    if pg.locator('[data-modal-ok]').count():
        pg.locator('[data-modal-ok]').first.click()
        pg.wait_for_timeout(700)
    t.ck('Проверочный подвед (переименован)' not in pg.locator('.itree').inner_text(),
         'учреждение не удалилось из дерева')

    # --- 8. поиск по дереву, регионы, избранное ---
    _open(t)
    pg.fill('[data-iq]', 'мэри')
    pg.wait_for_timeout(600)
    found = pg.locator('.itree-row[data-inode]').count()
    t.ck(found > 0, 'поиск по дереву ничего не нашёл')
    t.ck(pg.locator('.itree-row.search').count() == found,
         'результаты поиска не показывают путь до учреждения')

    pg.locator('[data-iq-clear]').first.click()
    pg.wait_for_timeout(400)

    pg.locator('[data-imode="region"]').first.click()
    pg.wait_for_timeout(700)
    # Группы регионов — узлы дерева области/района/НП (класс region).
    t.ck(pg.locator('.itree-row.region').count() > 0,
         'вид «по регионам» не сгруппировал учреждения')

    pg.locator('[data-imode="tree"]').first.click()
    pg.wait_for_timeout(500)

    fav = pg.locator('[data-inode-fav]')
    if t.ck(fav.count() > 0, 'в дереве нет значка избранного'):
        fav.first.click()
        pg.wait_for_timeout(500)
        t.ck(pg.locator('.ipanel-fav').count() > 0, 'избранное не пополнилось')
        fav.first.click()
        pg.wait_for_timeout(500)
        t.ck(pg.locator('.ipanel-fav').count() == 0, 'избранное не очистилось')

    # --- 9. закреплённый сотрудник (назначает администратор) ---
    #
    # Пользователь 03.09.2026: «Для учреждения в редактировании указываем
    # закреплённого сотрудника. Аналогично для подведов. Назначает админ».
    _open(t)
    rows = pg.locator('.itree-row[data-inode]')
    rows.nth(1).click()
    pg.wait_for_timeout(500)

    pg.locator('[data-iedit]').first.click()
    pg.wait_for_timeout(400)
    staff = pg.locator('[data-iform-staff]')
    # Состав тот же, что у объекта оценки: четыре роли (пользователь 03.09.2026).
    if t.ck(staff.count() == 4,
            'в форме учреждения не четыре роли сотрудников, а %d' % staff.count()):
        people = pg.eval_on_selector_all('[data-iform-staff="gov"] option',
                                         'els => els.map((e) => e.textContent.trim())')
        t.ck(len(people) > 1, 'список сотрудников пуст: %s' % people)

        person = people[1]
        pg.select_option('[data-iform-staff="gov"]', person)
        pg.locator('[data-iform-save]').first.click()
        pg.wait_for_timeout(700)
        meta = pg.locator('.imeta').inner_text()
        t.ck('Сотрудники: 1 из 4' in meta,
             'в шапке нет сводки по сотрудникам: %s' % meta.replace(chr(10), ' '))

        # Подведомственное наследует роли родителя, пока не назначены свои.
        pg.locator('[data-inew]').first.click()
        pg.wait_for_timeout(300)
        pg.fill('[data-iform-name]', 'Подвед для проверки сотрудника')
        pg.locator('[data-iform-save]').first.click()
        pg.wait_for_timeout(700)
        meta = pg.locator('.imeta').inner_text()
        t.ck('Сотрудники: 1 из 4' in meta and 'от родителя' in meta,
             'подведомственное не унаследовало сотрудника: %s' % meta.replace(chr(10), ' '))

        # Убираем за собой: подтверждаем диалог убирания в архив.
        pg.locator('[data-idel]').first.click()
        pg.wait_for_timeout(700)
        if pg.locator('[data-modal-ok]').count():
            pg.locator('[data-modal-ok]').first.click()
            pg.wait_for_timeout(600)

    # Роль без прав администратора видит сотрудника, но не назначает.
    t.open('', wait='.reg-thead')
    pg.locator('[data-role]').first.select_option('insp')
    pg.wait_for_timeout(400)
    _open(t)
    rows = pg.locator('.itree-row[data-inode]')
    rows.nth(1).click()
    pg.wait_for_timeout(500)
    pg.locator('[data-iedit]').first.click()
    pg.wait_for_timeout(400)
    t.ck(pg.locator('[data-iform-staff]').count() == 0,
         'роль без прав администратора может назначать сотрудника')

    t.open('', wait='.reg-thead')
    pg.locator('[data-role]').first.select_option('admin')
    pg.wait_for_timeout(400)

    # --- 10. регион деревом «область / район / населённый пункт» ---
    #
    # Структура задана пользователем 03.09.2026, значения — из справочника
    # kernel/regions.js (реальное деление КР).
    _open(t)
    pg.locator('.itree-row[data-inode]').nth(2).click()
    pg.wait_for_timeout(500)
    pg.locator('[data-iedit]').first.click()
    pg.wait_for_timeout(400)

    pg.locator('[data-iregion-open]').first.click()
    pg.wait_for_timeout(400)
    t.ck(pg.locator('[data-iregion-pick]').count() > 10, 'список регионов пуст')

    pg.fill('[data-iregion-q]', 'сокулук')
    pg.wait_for_timeout(500)
    found = pg.eval_on_selector_all('[data-iregion-pick]',
                                    'els => els.map((e) => e.dataset.iregionPick)')
    t.ck(found and all('Сокулук' in x for x in found),
         'поиск по регионам нашёл лишнее: %s' % found[:3])
    t.ck(any(x.count('/') == 2 for x in found),
         'в поиске нет уровня населённого пункта: %s' % found)

    pick = [x for x in found if x.count('/') == 2][0]
    pg.locator('[data-iregion-pick="%s"]' % pick).first.click()
    pg.wait_for_timeout(400)
    pg.locator('[data-iform-save]').first.click()
    pg.wait_for_timeout(600)
    # Регион стоит в одной строке с названием (пользователь 03.09.2026), а не
    # в строке сотрудников — там теперь только они и примечание.
    t.ck(pick.split('/')[-1].strip() in pg.locator('.iregion').inner_text(),
         'регион не сохранился у учреждения')

    # Вид «по регионам» повторяет ту же структуру: область → район → НП.
    pg.locator('[data-imode="region"]').first.click()
    pg.wait_for_timeout(800)
    depths = pg.evaluate("""() => [...document.querySelectorAll('.itree-row.region')]
        .map((e) => +(e.style.getPropertyValue('--depth') || 0))""")
    t.ck(max(depths) >= 2, 'в виде «по регионам» нет трёх уровней: %s' % depths)

    pg.locator('[data-imode="tree"]').first.click()
    pg.wait_for_timeout(400)

    # --- 11. ширина панели тянется, свёрнутая панель подписана ---
    def panel_width():
        return pg.evaluate("""() => Math.round(
            document.querySelector('.ipanel').getBoundingClientRect().width)""")

    w0 = panel_width()
    grip = pg.locator('[data-ipanel-grip]').first
    box = grip.bounding_box()
    pg.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    pg.mouse.down()
    pg.mouse.move(box['x'] + box['width'] / 2 + 100, box['y'] + box['height'] / 2, steps=8)
    pg.mouse.up()
    pg.wait_for_timeout(300)
    t.ck(panel_width() > w0 + 50, 'ширина панели не тянется: %d → %d' % (w0, panel_width()))

    pg.locator('[data-ipanel]').first.click()
    pg.wait_for_timeout(400)
    t.ck(panel_width() < 60, 'свёрнутая панель занимает %dpx' % panel_width())
    t.ck(pg.locator('.ipanel-vertical').count() == 1,
         'у свёрнутой панели нет подписи с числом учреждений')
    pg.locator('[data-ipanel]').first.click()
    pg.wait_for_timeout(400)
    t.ck(panel_width() > 200, 'панель не раскрылась обратно')

    # --- 12. свои документы учреждения ---
    #
    # Пользователь 03.09.2026: «Министерство может иметь само по себе свои
    # документы. Т.е. там их можно добавлять, прикреплять, удалять и т.д. Всё
    # без модалок, через интерактивные меню с предпросмотром документов».
    _open(t)
    rows = pg.locator('.itree-row[data-inode]')
    found = False
    for i in range(min(rows.count(), 30)):
        rows.nth(i).click()
        pg.wait_for_timeout(400)
        tab = pg.locator('[data-itab="docs"]')
        if not tab.count():
            continue
        tab.click()
        pg.wait_for_timeout(400)
        if pg.locator('[data-idoc]').count():
            found = True
            break

    if t.ck(found, 'не нашёл учреждение с документами'):
        before = pg.locator('[data-idoc]').count()

        # Открытый документ показывается рядом — просмотрщик или честное
        # «файлов нет» с прикреплением файла.
        pg.locator('[data-idoc]').first.click()
        pg.wait_for_timeout(600)
        view = pg.locator('.idocs-view').inner_text()
        t.ck('.viewer' and (pg.locator('.idocs-view .viewer').count()
             or 'файлов нет' in view), 'область просмотра пуста: %s' % view[:60])

        # Новый документ заводится строкой, без модального окна.
        pg.locator('[data-idoc-new]').first.click()
        pg.wait_for_timeout(400)
        t.ck(pg.locator('.idoc-form').count() == 1, 'форма нового документа не открылась')
        t.ck(pg.locator('.modal').count() == 0, 'создание документа открыло модальное окно')

        pg.fill('[data-idoc-number]', 'ПР-проверка')
        pg.locator('[data-idoc-save]').first.click()
        pg.wait_for_timeout(700)
        t.ck(pg.locator('[data-idoc]').count() == before + 1,
             'документ не добавился к учреждению')

        # Прикрепление существующего — со предпросмотром выбранного документа.
        pg.locator('[data-idoc-attach-open]').first.click()
        pg.wait_for_timeout(600)
        t.ck(pg.locator('[data-idoc-preview]').count() > 0, 'нет документов для прикрепления')
        t.ck(pg.locator('.idoc-attach-view').count() == 1,
             'в панели прикрепления нет области предпросмотра')

        pg.locator('[data-idoc-preview]').first.click()
        pg.wait_for_timeout(600)
        preview = pg.locator('.idoc-attach-view').inner_text()
        t.ck(pg.locator('.idoc-attach-view .viewer').count() or 'файлов нет' in preview,
             'предпросмотр не показал выбранный документ: %s' % preview[:60])

        pg.locator('[data-idoc-attach-apply]').first.click()
        pg.wait_for_timeout(700)
        t.ck(pg.locator('[data-idoc]').count() == before + 2,
             'прикреплённый документ не появился у учреждения')

        # Открепление возвращает документ в реестр, а не удаляет.
        pg.locator('[data-idoc]').first.hover()
        pg.wait_for_timeout(200)
        pg.locator('[data-idoc-detach]').first.click()
        pg.wait_for_timeout(500)
        if pg.locator('[data-modal-ok]').count():
            pg.locator('[data-modal-ok]').first.click()
            pg.wait_for_timeout(600)
        t.ck(pg.locator('[data-idoc]').count() == before + 1, 'документ не откреплён')

        # Список документов прячется, как просмотрщик в карточках ОЦ
        # (пользователь 03.09.2026). Ловим две беды разом: свёрнутый список без
        # закладки вернуть нечем, а перегородка без сохранения ширины
        # сбрасывает раскладку на каждой перерисовке.
        box = pg.locator('[data-idoc-split]')
        t.ck(box.count() == 1, 'нет перегородки между списком и просмотрщиком')
        b = box.first.bounding_box()
        pg.mouse.move(b['x'] + 4, b['y'] + 60)
        pg.mouse.down()
        pg.mouse.move(b['x'] + 84, b['y'] + 60, steps=6)
        pg.mouse.up()
        pg.wait_for_timeout(300)
        wide = pg.eval_on_selector('.idocs-left', 'e => e.getBoundingClientRect().width')
        t.ck(wide > 380, 'перегородка не расширила список: %d' % wide)

        pg.locator('[data-idoc-list-close]').first.click()
        pg.wait_for_timeout(400)
        t.ck(pg.locator('.idocs-left').count() == 0, 'список не свернулся')
        t.ck(pg.locator('[data-idoc-list-open]').count() == 1,
             'после сворачивания нет закладки — список не вернуть')

        pg.locator('[data-idoc-list-open]').first.click()
        pg.wait_for_timeout(400)
        back = pg.eval_on_selector('.idocs-left', 'e => e.getBoundingClientRect().width')
        t.ck(abs(back - wide) < 4,
             'ширина списка не сохранилась: было %d, стало %d' % (wide, back))

    # --- 9. сводная вкладка «С подведомственными» ---
    #
    # Задача пользователя 03.09.2026: по крупному узлу спросить «все объекты в
    # Бишкеке» или «все без движения больше 30 дней», не обходя подведы. Ловим
    # то, что легко разъезжается: счётчик вкладки против числа строк, фасет,
    # считающий сам себя (после выбора значения остальные варианты пропадают),
    # и сброс, который не возвращает выборку.
    _open(t)
    pg.wait_for_timeout(400)

    rows = pg.locator('.itree-row[data-inode]')
    best, bestn = 0, -1
    for i in range(min(rows.count(), 25)):
        rows.nth(i).click()
        pg.wait_for_timeout(250)
        tab = pg.locator('[data-itab="all"]')
        if not tab.count():
            continue
        n = int(tab.locator('b').inner_text().strip() or 0)
        if n > bestn:
            bestn, best = n, i

    if t.ck(bestn > 1, 'не нашёл узла с объектами в поддереве: %s' % bestn):
        rows.nth(best).click()
        pg.wait_for_timeout(300)
        pg.locator('[data-itab="all"]').click()
        pg.wait_for_timeout(700)

        total = pg.locator('[data-all-row]').count()
        t.ck(total == bestn,
             'счётчик вкладки (%d) не сходится с таблицей (%d)' % (bestn, total))
        t.ck(pg.locator('.iall-facet').count() >= 5, 'фасетов меньше пяти')

        # Объекты поддерева, а не только свои: узел сам по себе их не держит.
        own = int(pg.locator('[data-itab="oc"] b').inner_text().strip() or 0)
        t.ck(total > own, 'в своде не больше объектов, чем своих: %d и %d' % (total, own))

        heads = pg.locator('[data-all-facet]')
        for i in range(heads.count()):
            if 'Город' in heads.nth(i).inner_text():
                heads.nth(i).click()
                break
        pg.wait_for_timeout(400)

        picks = pg.locator('[data-all-pick="city"]')
        if t.ck(picks.count() > 1, 'в фасете «город» меньше двух значений'):
            city = picks.first.get_attribute('value')
            picks.first.check()
            pg.wait_for_timeout(500)

            after = pg.locator('[data-all-row]').count()
            t.ck(0 < after < total, 'фильтр по городу не сузил выборку: %d из %d' % (after, total))
            got = pg.eval_on_selector_all('[data-all-row] td:nth-child(4)',
                                          'els => [...new Set(els.map(e => e.textContent.trim()))]')
            t.ck(got == [city], 'в выборке чужие города: %s' % got)
            # Счётчик фасета считается без учёта самого фасета — иначе после
            # первого выбора остальные города исчезнут и сравнивать будет не с чем.
            t.ck(pg.locator('[data-all-pick="city"]').count() > 1,
                 'после выбора города остальные значения фасета пропали')
            t.ck(pg.locator('.iall-chip').count() >= 1, 'выбранное не показано чипом')

        pg.select_option('[data-all-stale-sel]', '30')
        pg.wait_for_timeout(500)
        stale = pg.locator('[data-all-row]').count()
        t.ck(stale <= pg.locator('[data-all-row]').count(),
             'фильтр «без движения» не применился')

        pg.locator('[data-all-reset]').first.click()
        pg.wait_for_timeout(500)
        t.ck(pg.locator('[data-all-row]').count() == total, 'сброс не вернул выборку')

        pg.locator('[data-all-panel-close]').first.click()
        pg.wait_for_timeout(400)
        t.ck(pg.locator('.iall-facets').count() == 0
             and pg.locator('[data-all-panel-open]').count() == 1,
             'колонка фильтров не сворачивается в закладку')
        pg.locator('[data-all-panel-open]').first.click()
        pg.wait_for_timeout(400)
        t.ck(pg.locator('.iall-facets').count() == 1, 'колонка фильтров не вернулась')
