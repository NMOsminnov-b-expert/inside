# -*- coding: utf-8 -*-
"""Карточка «Механизмы и оборудование» гражданского здания.

Карточка собрана по классификатору движимого имущества (лист «Классификатор»
таблицы «Группы движкимого имущества (параметры).xlsx») и по решениям ветки
mech. Сценарий ловит то, что уже ломалось при сборке или легко сломать правкой:

  * каскад Класс → Подгруппа → Тип: зависимый список заблокирован без
    родителя, смена родителя сбрасывает дочерний выбор, у класса без подгрупп
    подгруппы и типа нет вовсе;
  * набор параметров — по подгруппе, и значения не теряются молча: общий
    параметр переживает смену подгруппы, скрытое значение возвращается;
  * правка по ходу набора: строка состава и заголовок обновляются, курсор
    остаётся в поле (полная отрисовка заменяла поле вместе с курсором);
  * фокус после «+ Добавить ОИ» в составе и «+ Поле» — отрисовка асинхронная, и фокус,
    поставленный до неё, пропадал;
  * у ОИ этого вида нет чипа «ЕНИ» в плашке;
  * заметки пользователя 30.09.2026: высота подъёма — интервал, группа режима
    работы крана — флажки (массив), тип и страна рубильника вместо типа
    коммутационных аппаратов, у промышленных печей нет давления, страна с
    заглавной, контакты на весь перечень; прежние значения убранных полей
    уходят в «свои поля» под понятной подписью;
  * снимки единицы подписаны в просмотрщике её названием, а не id;
  * состав полей категории: инвентарный номер рядом с наименованием, основные
    параметры в том же разделе, год выпуска и год ввода в эксплуатацию,
    балансовая стоимость, страна у любой категории (решение 30.09.2026;
    прежде — только у значимых), списки вместо строк, выбор единицы
    измерения — и единица хранится отдельно от числа, не склеиваясь с ним;
  * прежний «movable» и единицы прежней разметки переносятся без потери данных;
  * меню «+ Добавить ОИ» предлагает один пункт на всё движимое;
  * комментарий единицы с пояснением: растёт по тексту и сохраняется;
  * пролёт и грузоподъёмность крана — число или интервал «5-10»: минус не
    вычитается, запись приводится к виду «5,5 – 10», «10-5» — ошибка;
  * поиск категории по дереву: конечная категория с путём и подсветкой,
    выбор подставляет класс, подгруппу и тип или «Вид» класса «Прочее».
"""
import base64
import os
import tempfile

NAME = 'карточка механизмов'

TOUCHES = (
    'app/modules/civil/oi/mech/*', 'app/modules/mechanisms/*',
    'app/modules/civil/data/seed.js',
    'app/modules/civil/oi/registry.js', 'app/modules/civil/card/*',
    'app/modules/civil/parts/photos/*', 'app/modules/civil/parts/viewer/*',
    'app/modules/civil/data/rules.js', 'app/modules/civil/index.js',
    'app/kernel/rangeField.js', 'app/kernel/treeSearch.js',
)

ROUTE = '#/oc/civil/oc-cv-1/oi/oi-cv1-m1'

# Однопиксельный PNG — для загрузки фото без файла на диске проекта.
PNG = base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP4z8DwnwEIGP4zMAAAHOgD/U8WqF8AAAAASUVORK5CYII=')


def _active_has(pg, attr):
    return pg.evaluate("(a) => !!document.activeElement && document.activeElement.hasAttribute(a)", attr)


def run(t):
    pg = t.page

    def pick(attr, value):
        pg.select_option('select[data-mu-%s]' % attr, value)
        t.wait_until("() => !!document.querySelector('#q-mech-unit')")
        t.wait(300)

    def sel(attr):
        return pg.locator('select[data-mu-%s]' % attr)

    # --- меню добавления ------------------------------------------------------
    t.open('#/oc/civil/oc-cv-1', wait='[data-add-oi]')
    pg.locator('[data-dd-toggle]').first.click()
    t.wait(250)
    items = pg.eval_on_selector_all('[data-add-oi]', 'els => els.map((e) => e.textContent.trim())')
    t.ck('Механизмы и оборудование' in items, 'в меню нет «Механизмы и оборудование»: %s' % items)
    t.ck(not any('Офисная техника' in x or 'производственное оборудование' in x for x in items),
         'в меню остались прежние пункты движимого: %s' % items)
    pg.keyboard.press('Escape')

    # --- карточка из данных ---------------------------------------------------
    t.open(ROUTE, wait='#q-mech-unit')
    t.wait_for('#q-mech-unit')
    plate = ' '.join(pg.locator('.ctx-plate').inner_text().split())
    t.ck('ЕНИ' not in plate, 'в плашке механизмов показан чип ЕНИ: %s' % plate)
    t.ck(pg.locator('.mu-row').count() == 2, 'в составе не две единицы')
    t.ck(sel('cls').input_value() == 'Энергетическое оборудование', 'класс не прочитан из данных')

    # --- каскад и сохранение значений ------------------------------------------
    pick('sub', 'Генераторы')
    t.ck(sel('type').input_value() == '', 'смена подгруппы не сбросила тип')
    marka = pg.locator('[data-mu-f="model"]')
    t.ck(marka.count() == 1 and marka.input_value() == 'КВГ-1,25-95',
         'общий параметр потерял значение при смене подгруппы')
    t.ck(pg.locator('[data-mu-f="pressure"]').count() == 0,
         'параметр чужой подгруппы остался на экране')
    pick('sub', 'Котельное оборудование')
    # «0,60», а не «0,6»: числовое поле макета показывает величину с сотыми
    # (kernel/numField.js).
    t.ck(pg.locator('[data-mu-f="pressure"]').input_value() == '0,60',
         'скрытое значение не вернулось при обратной смене подгруппы')
    t.ck(pg.locator('[data-mu-unit="pressure"]').input_value() == 'МПа',
         'единица измерения не вернулась вместе со значением')

    # Подсказка «выберите подгруппу» не прилипает к полю над собой: без отступа
    # плашка читалась как часть поля (замечание пользователя 21.09.2026).
    pick('sub', '')
    gap = pg.evaluate("""() => {
      const empty = document.querySelector('#q-mech-unit .mu-empty');
      const prev = empty && empty.previousElementSibling;
      if (!empty || !prev || !prev.classList.contains('grid')) return null;
      return Math.round(empty.getBoundingClientRect().top - prev.getBoundingClientRect().bottom);
    }""")
    t.ck(gap is not None and gap >= 8,
         'подсказка под полями прилипла к ним вплотную: зазор %s' % gap)
    pick('sub', 'Котельное оборудование')

    # Классов без подгрупп в таблице больше нет: «Инвентарь» убран до готовой
    # классификации, «Нематериальные компоненты» получили подгруппы.
    t.ck(pg.evaluate("""() => ![...document.querySelectorAll('[data-mu-cls] option')]
      .some((o) => o.textContent.trim() === 'Инвентарь и хозяйственные принадлежности')"""),
         'класс «Инвентарь и хозяйственные принадлежности» остался в выборе')
    # «Прочее» — класс без подгрупп: подгруппу и тип не спрашивает.
    pick('cls', 'Прочее')
    t.ck(sel('sub').count() == 0 and sel('type').count() == 0,
         'у класса «Прочее» показаны подгруппа и тип')
    t.ck(pg.locator('[data-mu-f="baseMachine"]').count() == 1,
         'у класса «Прочее» нет поля «Базовая машина (агрегат)»')
    pick('cls', 'Нематериальные компоненты движимого имущества')
    t.ck(sel('sub').count() == 1 and not sel('sub').is_disabled(),
         'у нематериальных компонентов не появилась подгруппа')
    pick('cls', '')
    t.ck(sel('sub').is_disabled() and sel('type').is_disabled(),
         'без класса подгруппа и тип не заблокированы')
    pick('cls', 'Энергетическое оборудование')
    pick('sub', 'Котельное оборудование')
    pick('type', 'Водогрейные котлы')

    # --- состав полей категории -------------------------------------------------
    t.ck(pg.locator('.mu-grid-name [data-mu-inv]').count() == 1,
         'инвентарный номер не стоит рядом с наименованием')
    t.ck(pg.evaluate("""() => {
      const f = document.querySelector('[data-mu-f="model"]');
      const sec = f && f.closest('.mu-sec');
      return !!sec && !!sec.querySelector('[data-mu-name]');
    }"""), 'основные параметры оторваны от наименования')
    # Подписи полей набраны заглавными через CSS, поэтому сверяем текст в разметке
    # (text_content), а не отрисованный (inner_text отдал бы «ГОД ВВОДА…»).
    t.ck('Год ввода в эксплуатацию' in pg.locator('label[for="mu-year"]').text_content(),
         'год не назван годом ввода в эксплуатацию')
    t.ck('Год выпуска' in pg.locator('label[for="mu-made"]').text_content(),
         'нет года выпуска рядом с годом ввода в эксплуатацию')
    t.ck('Балансовая стоимость' in pg.locator('label[for="mu-cost"]').text_content(),
         'стоимость не названа балансовой')
    t.ck(pg.locator('[data-mu-country]').count() == 1,
         'у котельного оборудования не спрашивается страна происхождения')
    t.ck(pg.eval_on_selector('[data-mu-f="fuel"]', '(e) => e.tagName') == 'SELECT',
         'вид топлива задаётся не списком')
    t.ck('КПД, %' in pg.locator('label[for="mu-f-efficiency"]').text_content(),
         'единственная единица измерения не попала в подпись поля')
    units = pg.eval_on_selector_all('[data-mu-unit="heatOutput"] option', '(els) => els.map((e) => e.value)')
    t.ck('МВт' in units and 'Гкал/ч' in units, 'нет выбора единиц тепловой мощности: %s' % units)

    # Единица измерения — отдельное сведение и сохраняется отдельно от числа.
    pg.select_option('[data-mu-unit="pressure"]', 'бар')
    t.wait(200)
    pg.locator('.mu-row').nth(1).click()
    t.wait_for('#q-mech-unit')
    t.wait(300)
    pg.locator('.mu-row').first.click()
    t.wait_for('[data-mu-unit="pressure"]')
    t.wait(300)
    t.ck(pg.locator('[data-mu-unit="pressure"]').input_value() == 'бар',
         'выбранная единица измерения не сохранилась')
    t.ck(pg.locator('[data-mu-f="pressure"]').input_value() == '0,60',
         'смена единицы измерения затёрла число')

    # --- число или интервал -----------------------------------------------------
    # Пролёт крана «5-10» — интервал, а не выражение (решение 30.09.2026): общее
    # числовое поле посчитало бы его как −5.
    pick('cls', 'Подъёмно-транспортное оборудование')
    pick('sub', 'Краны')
    span = pg.locator('[data-mu-f="span"]')
    span.fill('5.5-10')
    span.press('Tab')
    t.ck(span.input_value() == '5,5 – 10', 'интервал пролёта не приведён к виду: %r' % span.input_value())
    t.ck(not span.evaluate('(e) => e.classList.contains("field-bad")'), 'верный интервал подсвечен ошибкой')
    cap = pg.locator('[data-mu-f="capacity"]')
    cap.fill('10-5')
    cap.press('Tab')
    t.ck(cap.evaluate('(e) => e.classList.contains("field-bad")'), 'интервал «10-5» не подсвечен ошибкой')
    t.ck(cap.input_value() == '10-5', 'неверная запись стёрта или изменена: %r' % cap.input_value())
    cap.fill('3,2')
    cap.press('Tab')
    t.ck(not cap.evaluate('(e) => e.classList.contains("field-bad")'), 'исправленная запись осталась с ошибкой')
    pg.locator('.mu-row').nth(1).click()
    t.wait_for('#q-mech-unit')
    t.wait(300)
    pg.locator('.mu-row').first.click()
    t.wait_for('[data-mu-f="span"]')
    t.ck(pg.locator('[data-mu-f="span"]').input_value() == '5,5 – 10', 'интервал не сохранился')
    t.ck(pg.locator('[data-mu-f="capacity"]').input_value() == '3,20' or
         pg.locator('[data-mu-f="capacity"]').input_value() == '3,2', 'грузоподъёмность не сохранилась')

    # --- поиск категории ---------------------------------------------------------
    # Поиск по всему дереву: в выдаче конечная категория с путём, выбор
    # подставляет класс, подгруппу, тип — или «Вид» у класса без подгрупп
    # (задача пользователя 30.09.2026, пример — «Навес»).
    csq = pg.locator('#mu-cs-q')
    csq.fill('навес')
    t.wait_for('#mu-cs-list [role="option"]')
    first = pg.locator('#mu-cs-list [role="option"]').first
    t.ck('Навесное оборудование' in first.inner_text(), 'по «навес» первым не предложено навесное: %r' % first.inner_text())
    t.ck(first.locator('mark').count() >= 1, 'совпадение в выдаче не подсвечено')
    t.ck('Прочее' in first.locator('.tsr-path').inner_text(), 'у найденной категории нет пути')
    csq.press('Enter')
    t.wait_until("() => document.querySelector('[data-mu-cls]') && document.querySelector('[data-mu-cls]').value === 'Прочее'")
    t.ck(pg.locator('[data-mu-f="otherKind"]').input_value() == 'Навесное оборудование',
         'вид «Навесное оборудование» не подставлен')
    csq = pg.locator('#mu-cs-q')
    csq.fill('ибп')
    t.wait_for('#mu-cs-list [role="option"]')
    pg.locator('#mu-cs-list [role="option"]').first.dispatch_event('mousedown')
    t.wait_until("() => (document.querySelector('[data-mu-type]') || {}).value === 'Источники бесперебойного питания и стабилизаторы напряжения'")
    t.ck(sel('sub').input_value() == 'Компьютерная и оргтехника', 'подгруппа ИБП не подставлена')
    t.ck(pg.locator('[data-mu-f="upsPower"]').count() == 1, 'у ИБП нет своих полей')
    csq = pg.locator('#mu-cs-q')
    csq.fill('кран мост')
    t.wait_for('#mu-cs-list [role="option"]')
    names = pg.eval_on_selector_all('#mu-cs-list .tsr-name', 'els => els.map((e) => e.textContent)')
    t.ck(any('остов' in n for n in names), 'слова запроса не ищутся по всему пути: %s' % names)
    csq.press('Escape')
    t.ck(pg.locator('#mu-cs-list').is_hidden(), 'Escape не закрыл выдачу')

    # --- правка по ходу набора ------------------------------------------------
    name = pg.locator('[data-mu-name]')
    name.click()
    name.press('End')
    name.type(' Б')
    t.ck(pg.locator('.mu-row.on .mu-name').inner_text().endswith(' Б'), 'строка состава не обновилась на лету')
    t.ck(_active_has(pg, 'data-mu-name'), 'курсор ушёл из поля наименования во время набора')

    q = pg.locator('[data-mu-qty]')
    q.fill('0')
    q.blur()
    t.wait(200)
    t.ck(q.evaluate('(e) => e.classList.contains("field-bad")'), 'количество 0 не подсвечено')
    q.fill('3')
    q.blur()
    t.wait(250)
    t.ck('4 шт.' in pg.locator('.mu-tbl tfoot').inner_text(), 'итог по количеству не пересчитан')

    # --- название списка -------------------------------------------------------
    t.ck(pg.locator('[data-mu-group]').count() == 1, 'нет поля «Название списка»')
    t.ck('материально ответственное лицо' in pg.locator('#mu-group-hint').inner_text(),
         'нет пояснения к названию списка')
    pg.locator('[data-mu-group]').fill('Счёт 108, МОЛ Иванов')
    t.wait(200)
    t.ck('Счёт 108, МОЛ Иванов' in pg.locator('.ctx-plate').inner_text(),
         'название списка не стало подписью ОИ в плашке')
    pg.locator('[data-mu-group]').fill('')
    t.wait(200)

    # --- комментарий -----------------------------------------------------------
    cm = pg.locator('[data-mu-comment]')
    t.ck(cm.count() == 1, 'нет поля комментария')
    t.ck('Не нашли подходящего поля' in pg.locator('#mu-comment-hint').inner_text(),
         'нет пояснения к комментарию')
    h0 = cm.evaluate('(e) => e.offsetHeight')
    cm.fill('\n'.join(['Шильдик затёрт, мощность со слов завхоза.', 'Проверить по паспорту.',
                       'Третья строка.', 'Четвёртая.']))
    t.wait(200)
    t.ck(cm.evaluate('(e) => e.offsetHeight') > h0, 'поле комментария не растёт по тексту')
    pg.locator('.mu-row').nth(1).click()
    t.wait_for('#q-mech-unit')
    t.wait(300)
    pg.locator('.mu-row').first.click()
    t.wait_for('[data-mu-comment]')
    t.wait(300)
    t.ck(pg.locator('[data-mu-comment]').input_value().startswith('Шильдик затёрт'),
         'комментарий не сохранился при переключении единиц')

    # --- добавление и фокус ----------------------------------------------------
    pg.locator('[data-mu-add]').click()
    t.wait_until("() => document.querySelectorAll('.mu-row').length === 3")
    t.wait(300)
    t.ck(pg.evaluate("""() => {
      const a = document.activeElement;
      return !!a && a.hasAttribute('data-pick-btn') && !!a.parentElement.querySelector('[data-mu-cls]');
    }"""), 'после «+ Добавить ОИ» в составе фокус не на видимом списке класса новой единицы')

    pg.locator('[data-mu-xadd]').click()
    t.wait_until("() => !!document.querySelector('[data-mu-xlabel]')")
    t.wait(300)
    t.ck(_active_has(pg, 'data-mu-xlabel'), 'после «+ Поле» фокус не в названии поля')

    # --- фото -------------------------------------------------------------------
    path = os.path.join(tempfile.gettempdir(), 'mech-card-probe.png')
    with open(path, 'wb') as f:
        f.write(PNG)
    pg.locator('.mu-row').nth(1).click()
    t.wait_for('[data-mu-photo-add]')
    t.wait(300)
    # Страна — у любой категории (решение пользователя 30.09.2026): она
    # сильно влияет на стоимость оборудования.
    t.ck(pg.locator('[data-mu-country]').count() == 1,
         'у единицы этой категории не спрашивается страна происхождения')
    with pg.expect_file_chooser() as fc:
        pg.locator('[data-mu-photo-add]').click()
    fc.value.set_files(path)
    t.wait_for('.mu-ph')
    t.wait(300)
    pg.locator('.mu-ph').first.click()
    t.wait_until("() => [...document.querySelectorAll('.vtitle')].some((e) => e.textContent.includes('Фото'))")
    titles = pg.locator('.vtitle').all_inner_texts()
    t.ck(any('Щит управления' in x for x in titles),
         'просмотрщик подписывает фото не названием единицы: %s' % titles)

    # --- перенос прежнего «movable» -------------------------------------------
    migrated = pg.evaluate("""async () => {
      const m = await import('./app/modules/mechanisms/form/model.js');
      const rec = { oi: [
        { id: 'x1', card: 'movable', kind: 'МЕХ', name: 'Станок', year: '1989', serial: 'С-1', eni: '14700' },
        { id: 'x2', card: 'movable', kind: 'ОФИС', name: 'Комплекс', complexItems: [
          { name: 'Стойка', type: 'Узел', eni: '14701' }, { name: 'ИБП', type: 'Агрегат', eni: '' }] },
      ] };
      m.migrateMovable(rec);
      const [a, b] = rec.oi;
      return {
        cards: rec.oi.map((o) => o.card),
        aUnit: a.mechanisms[0].name, aYear: a.mechanisms[0].year,
        aExtra: a.mechanisms[0].extra.map((f) => f.label + '=' + f.value),
        bUnits: b.mechanisms.map((u) => u.name), bClass: b.mechanisms[0].cls,
        bGroup: b.groupName, bName: b.name,
      };
    }""")
    t.ck(migrated['cards'] == ['mech', 'mech'], 'прежний movable не переведён: %s' % migrated['cards'])
    t.ck(migrated['aUnit'] == 'Станок' and migrated['aYear'] == '1989', 'одиночный механизм потерял данные')
    t.ck('Заводской номер=С-1' in migrated['aExtra'] and 'Код ЕНИ=14700' in migrated['aExtra'],
         'заводской номер или код ЕНИ не перенесены: %s' % migrated['aExtra'])
    t.ck(migrated['bUnits'] == ['Стойка', 'ИБП'], 'узлы комплекса не стали единицами: %s' % migrated['bUnits'])
    t.ck(migrated['bClass'] == 'Офисное оборудование и мебель', 'офисная техника не получила класс')
    t.ck(migrated['bGroup'] == 'Комплекс' and migrated['bName'] == 'Комплекс',
         'название комплекса потеряно: %s / %s' % (migrated['bGroup'], migrated['bName']))

    # --- перенос единиц на справочник полей ------------------------------------
    moved = pg.evaluate("""async () => {
      const m = await import('./app/modules/mechanisms/form/model.js');
      const rec = { oi: [{ id: 'y1', card: 'mech', mechanisms: [{
        id: 'u1', name: 'Котёл', maker: 'Бийский завод',
        cls: 'Энергетическое оборудование', sub: 'Котельное оборудование',
        params: { 'Марка (модель) и заводской номер': 'КВГ-1,25', 'Рабочее давление (МПа/бар)': '0,6 МПа' },
        extra: [{ id: 'f1', label: 'Инвентарный номер', value: 'ИН-7' }],
      }] }] };
      m.migrateMechUnits(rec);
      const u = rec.oi[0].mechanisms[0];
      return {
        country: u.country, maker: u.maker, inv: u.inv,
        labels: u.extra.map((f) => f.label),
        params: Object.keys(u.params),
      };
    }""")
    t.ck(moved['country'] == 'Бийский завод' and not moved['maker'],
         'производитель не перенесён в страну происхождения: %s' % moved)
    t.ck(moved['inv'] == 'ИН-7' and 'Инвентарный номер' not in moved['labels'],
         'инвентарный номер не поднялся из своих полей: %s' % moved)
    t.ck('Марка (модель) и заводской номер' in moved['labels'],
         'параметр прежней разметки потерян, а не сохранён своим полем: %s' % moved)
    t.ck(moved['params'] == [], 'в параметрах остались ключи прежней разметки: %s' % moved['params'])

    # --- заметки 30.09.2026 -----------------------------------------------------
    pg.locator('.mu-row').first.click()
    t.wait_for('#q-mech-unit')
    t.wait(300)
    pick('cls', 'Подъёмно-транспортное оборудование')
    pick('sub', 'Краны')
    t.ck(pg.locator('[data-mu-f="liftHeight"][data-range]').count() == 1, 'высота подъёма крана — не интервал')
    duty = pg.locator('[data-mu-check="dutyGroup"]')
    t.ck(duty.count() == 4, 'группа режима работы — не четыре флажка: %d' % duty.count())
    duty.nth(0).check()
    duty.nth(2).check()
    country = pg.locator('[data-mu-country]')
    country.fill('')
    country.type('россия')
    t.ck(country.input_value() == 'Россия', 'страна не с заглавной: %r' % country.input_value())

    pg.locator('[data-mu-cadd]').click()
    t.wait_until("() => !!document.querySelector('[data-mu-cname]')")
    t.wait(300)
    t.ck(_active_has(pg, 'data-mu-cname'), 'после «+ Контакт» фокус не в имени')
    pg.locator('[data-mu-cname]').first.fill('Иванов И.')
    t.ck(pg.locator('[data-mu-cphone]').first.get_attribute('type') == 'tel', 'телефон контакта не type=tel')
    pg.locator('[data-mu-cphone]').first.fill('+996 555 000 000')
    pg.locator('[data-mu-cnote]').first.fill('Главный механик')

    pg.locator('.mu-row').nth(1).click()
    t.wait_for('#q-mech-unit')
    t.wait(300)
    pg.locator('.mu-row').first.click()
    t.wait_for('[data-mu-check="dutyGroup"]')
    on = pg.eval_on_selector_all('[data-mu-check="dutyGroup"]', 'els => els.filter((e) => e.checked).map((e) => e.value)')
    t.ck(on == ['А1–А3 (лёгкий)', 'А6 (тяжёлый)'], 'отмеченные группы не сохранились: %s' % on)
    t.ck(pg.locator('[data-mu-country]').input_value() == 'Россия', 'страна не сохранилась')
    t.ck(pg.locator('[data-mu-cphone]').first.input_value() == '+996 555 000 000' and
         pg.locator('[data-mu-cnote]').first.input_value() == 'Главный механик', 'контакт не сохранился')

    pick('cls', 'Энергетическое оборудование')
    pick('sub', 'Распределительные устройства')
    t.ck(pg.locator('[data-mu-f="switchgear"]').count() == 0, 'осталось поле «Тип коммутационных аппаратов»')
    t.ck(pg.locator('select[data-mu-f="breakerType"]').count() == 1, 'нет выбора «Тип рубильника»')
    bc = pg.locator('[data-mu-f="breakerCountry"]')
    bc.type('китай')
    t.ck(bc.input_value() == 'Китай', 'страна рубильника не с заглавной: %r' % bc.input_value())

    pick('cls', 'Технологическое (производственное) оборудование')
    pick('sub', 'Печи, сушильные камеры, реакторы, ёмкости технологического назначения')
    pick('type', 'Промышленные печи')
    t.ck(pg.locator('[data-mu-f="pressure"]').count() == 0, 'у промышленных печей осталось давление')
    pick('type', 'Реакторы')
    t.ck(pg.locator('[data-mu-f="pressure"]').count() == 1, 'у реакторов пропало давление')

    old = pg.evaluate("""async () => {
      const m = await import('./app/modules/mechanisms/form/model.js');
      const rec = { oi: [{ id: 'y2', card: 'mech', mechanisms: [
        { id: 'a', name: 'РУ', country: 'германия', cls: 'Энергетическое оборудование', sub: 'Распределительные устройства',
          params: { switchgear: 'ВВ/TEL' }, extra: [] },
        { id: 'b', name: 'Печь', cls: 'Технологическое (производственное) оборудование',
          sub: 'Печи, сушильные камеры, реакторы, ёмкости технологического назначения', type: 'Промышленные печи',
          params: { pressure: '0,2', 'pressure@unit': 'МПа' }, extra: [] },
      ] }] };
      m.migrateMechUnits(rec);
      const [a, b] = rec.oi[0].mechanisms;
      return { country: a.country, a: a.extra.map((f) => f.label + '=' + f.value), b: b.extra.map((f) => f.label + '=' + f.value) };
    }""")
    t.ck(old['country'] == 'Германия', 'страна в прежних данных не с заглавной: %s' % old)
    t.ck(old['a'] == ['Тип коммутационных аппаратов=ВВ/TEL'], 'прежний тип коммутационных аппаратов потерян: %s' % old)
    t.ck(old['b'] == ['Рабочее давление=0,2 МПа'], 'прежнее давление печи потеряно: %s' % old)

    # --- заметки 01.10.2026: общие поля в основных параметрах, состояние --------
    # Страна, масса, годы, состояние — в разделе «Наименование и основные
    # параметры» у любой единицы; масса не задваивается полем категории
    # (у трансформаторов она была своей).
    pick('cls', 'Энергетическое оборудование')
    pick('sub', 'Трансформаторы')
    first = pg.locator('#q-mech-unit .mu-sec').nth(1)
    t.ck('основные параметры' in first.locator('.sec-h').inner_text().lower(), 'второй раздел — не основные параметры')
    for sel_ in ('[data-mu-country]', '[data-mu-made]', '[data-mu-year]', '[data-mu-state]', '[data-mu-f="mass"]'):
        t.ck(first.locator(sel_).count() == 1, 'в основных параметрах нет %s' % sel_)
    t.ck(pg.locator('[data-mu-f="mass"]').count() == 1, 'масса задвоилась')
    opts = pg.eval_on_selector_all('[data-mu-state] option', 'els => els.map((e) => e.textContent.trim())')
    t.ck(opts == ['Не выбрано', 'Рабочее', 'Условно пригодное', 'Нерабочее'], 'варианты состояния не те: %s' % opts)
    pg.select_option('[data-mu-state]', 'Условно пригодное')
    t.wait_until("() => [...document.querySelectorAll('.mu-row.on .mu-state')].some((e) => e.title === 'Условно пригодное')")
    t.ck(pg.locator('.mu-row.on .mu-state').get_attribute('title') == 'Условно пригодное' and pg.locator('.mu-row.on .mu-state').inner_text().strip() == 'Усл. пригодное', 'состояние не попало в таблицу состава')

    # --- модули линии (заметка 01.10.2026) -----------------------------------------
    # Только у производственных и упаковочных линий; модуль — название,
    # комментарий, свои поля; карточки модулей разделены зазором.
    pick('cls', 'Технологическое (производственное) оборудование')
    pick('sub', 'Технологические линии и их составные агрегаты')
    pick('type', 'Составные агрегаты линий')
    t.ck(pg.locator('[data-mu-madd]').count() == 0, 'у составных агрегатов есть модули')
    pick('type', 'Производственные линии')
    t.ck(pg.locator('[data-mu-madd]').count() == 1, 'у производственной линии нет «+ Модуль»')
    for name in ('Экструдер', 'Охлаждающая ванна', 'Намотчик'):
        pg.click('[data-mu-madd]')
        t.wait_until("() => document.activeElement && document.activeElement.hasAttribute('data-mu-mname') && !document.activeElement.value")
        pg.keyboard.type(name)
    t.ck(pg.locator('.mu-mod').count() == 3, 'модулей не три')
    gaps = pg.evaluate("""() => { const r = [...document.querySelectorAll('.mu-mod')].map((e) => e.getBoundingClientRect());
      return r.slice(1).map((x, i) => Math.round(x.top - r[i].bottom)); }""")
    t.ck(all(g >= 8 for g in gaps), 'карточки модулей сливаются: зазоры %s' % gaps)
    first = pg.locator('.mu-mod').first
    first.locator('[data-mu-mmodel]').fill('uniEX 1-90')
    first.locator('[data-mu-mqty]').fill('2')
    first.locator('[data-mu-mqty]').press('Tab')
    first.locator('[data-mu-mnote]').fill('Одношнековый, 90 мм')
    first.locator('[data-mu-mxadd]').click()
    t.wait_until("() => document.activeElement && document.activeElement.hasAttribute('data-mu-mxlabel')")
    pg.keyboard.type('Диаметр шнека')
    pg.locator('.mu-mod').first.locator('[data-mu-mxvalue]').fill('90 мм')
    # Переход на другую единицу и обратно — модули сохранились.
    pg.locator('.mu-row').nth(1).click(); t.wait_for('#q-mech-unit'); t.wait(300)
    pg.locator('.mu-row').first.click(); t.wait_for('.mu-mod')
    names = pg.eval_on_selector_all('[data-mu-mname]', 'els => els.map((e) => e.value)')
    t.ck(names == ['Экструдер', 'Охлаждающая ванна', 'Намотчик'], 'названия модулей не сохранились: %s' % names)
    t.ck(pg.locator('.mu-mod').first.locator('[data-mu-mnote]').input_value() == 'Одношнековый, 90 мм', 'комментарий модуля не сохранился')
    t.ck(pg.locator('.mu-mod').first.locator('[data-mu-mmodel]').input_value() == 'uniEX 1-90', 'модель модуля не сохранилась')
    t.ck(pg.locator('[data-mu-mmake]').count() == 0, 'у модуля осталось поле «Марка»')
    t.ck(pg.locator('.mu-mod').first.locator('[data-mu-mqty]').input_value() == '2', 'количество агрегатов модуля не сохранилось')
    t.ck('Назначение модуля' in pg.locator('.mu-mod').first.locator('.mu-hint').inner_text(), 'у комментария модуля нет пояснения о назначении')
    t.ck(pg.locator('.mu-mod').first.locator('[data-mu-mxvalue]').input_value() == '90 мм', 'своё поле модуля не сохранилось')
    # Заполненный модуль убирается с вопросом.
    pg.locator('.mu-mod').first.locator('[data-mu-mdel]').click()
    t.wait_for('[data-modal-ok]'); pg.click('[data-modal-ok]')
    t.wait_until("() => document.querySelectorAll('.mu-mod').length === 2")
    # Сменили тип, а модули есть — они видны с пояснением, не пропадают молча.
    pick('type', 'Составные агрегаты линий')
    t.ck(pg.locator('.mu-mod').count() == 2 and pg.locator('[data-mu-madd]').count() == 0,
         'при смене типа модули пропали или осталась кнопка добавления')
