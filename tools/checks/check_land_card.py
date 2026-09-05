# -*- coding: utf-8 -*-
"""Карточка земельного участка после правок (ТЗ docs/tz/30-uchastok-pravki.md).

Карточка участка одна на все пять модулей (документированное исключение из
изоляции модулей), поэтому проверяется и в land-plot, и внутри чужого типа ОЦ:
правка здесь видна всем, и сломать можно сразу везде.

Что держит сценарий:
  * блок 01 — без «Статуса», с тремя площадями плюс застроенной, с сервитутами
    и комментарием к ним, с категорией земель только у несельхоза;
  * блок 02 несельхоза — «Инженерные сети» с электричеством и канализацией, без
    автономного отопления, с постройками;
  * блок 03 — координаты, зона и микрорайон в крупном городе (иначе обычное
    «расположение в районе»), удалённость от райцентра у сельхоза;
  * благоустройство — ранг из четырёх значений и текстовое описание, а прежние
    мультивыборы перенесены в текст, а не потеряны;
  * заметка «i» видна и раскрывается;
  * смена типа ОЦ и вида ОИ предупреждают о том, чего не будет в новой карточке,
    и не стирают значения.
"""
NAME = 'карточка участка'


def _open_land(t, route='#/oc/land-plot/oc-lp-1'):
    """Открыть карточку участка объекта."""
    pg = t.page
    t.open(route, wait='[data-open-oi]')
    t.wait(500)
    pg.locator('[data-open-oi]').first.click()
    pg.wait_for_selector('[data-land-type]', timeout=15000)
    t.wait(500)


def run(t):
    pg = t.page

    # --- 1. блок 01 ---
    _open_land(t)

    t.ck(pg.locator('[data-status]').count() == 0,
         'в карточке участка остался «Статус» — он ведётся у объекта оценки')

    areas = pg.eval_on_selector_all('[data-land-area]',
                                    'els => els.map((e) => e.getAttribute("data-land-area"))')
    t.ck(sorted(areas) == ['build', 'fact', 'pravo', 'pravoUd'],
         'площади не те: %s (ждём правоустанавливающие, правоудостоверяющие, факт, застроенная)' % areas)

    # Каждая площадь хранит своё значение — иначе перенос полей склеил бы их.
    pg.fill('[data-land-area="pravoUd"]', '777')
    pg.dispatch_event('[data-land-area="pravoUd"]', 'change')
    pg.fill('[data-land-area="build"]', '55')
    pg.dispatch_event('[data-land-area="build"]', 'change')
    t.wait(400)
    t.ck(pg.input_value('[data-land-area="pravoUd"]') == '777'
         and pg.input_value('[data-land-area="build"]') == '55',
         'значения площадей перепутались между полями')

    # Подписи читаем по самим полям: innerText карточки включает ещё и опции
    # нативных селектов, спрятанных под своим компонентом списка.
    labels = pg.eval_on_selector_all('.card label', 'els => els.map((e) => e.textContent.trim())')
    joined = ' | '.join(labels)
    t.ck(any('правоудостоверяющ' in l.lower() for l in labels),
         'нет подписи «по правоудостоверяющим документам»: %s' % joined[:160])
    t.ck(any('Назначение по правоудостоверяющему документу' in l for l in labels),
         'назначение не переименовано: %s' % joined[:160])

    # Сервитуты переехали в блок 01 к правам, комментарий появляется при «Есть».
    t.ck(pg.locator('[data-land-encumbrance]').count() == 1, 'сервитутов нет в блоке 01')
    t.ck(pg.locator('[data-land-encumbrance-note]').count() == 0,
         'комментарий к сервитуту показан, когда обременений нет')
    pg.select_option('[data-land-encumbrance]', 'Есть')
    t.wait(700)
    t.ck(pg.locator('[data-land-encumbrance-note]').count() == 1,
         'при «Есть» не появился комментарий к сервитуту')
    pg.select_option('[data-land-encumbrance]', 'Нет')
    t.wait(600)

    # --- 2. сельхоз: категории земель нет, разрешённое использование осталось ---
    t.ck(pg.locator('[data-land-category]').count() == 0,
         'категория земель показана у сельхозучастка')
    t.ck(pg.locator('[data-land-use]').count() == 1,
         'у сельхоза пропало «Категория и разрешённое использование»')
    uses = pg.eval_on_selector_all('[data-land-use] option', 'els => els.map((e) => e.textContent.trim())')
    t.ck('Сельскохозяйственное производство' in uses, 'нет значения «Сельскохозяйственное производство»')
    t.ck('Птицефабрика' not in uses, 'осталась «Птицефабрика»')

    # Удалённость от райцентра — у сельхоза.
    t.ck(pg.locator('[data-land-distance]').count() == 1,
         'у сельхозучастка нет удалённости от райцентра')

    # --- 3. несельхоз: инженерные сети ---
    pg.select_option('[data-land-type]', 'Несельскохозяйственный')
    t.wait(900)

    heads = pg.eval_on_selector_all('.card-head h3', 'els => els.map((e) => e.textContent.trim())')
    t.ck('Инженерные сети' in heads, 'блок 02 не назван «Инженерные сети»: %s' % heads)
    t.ck(pg.locator('[data-land-electricity]').count() == 1, 'нет наличия электроснабжения')
    t.ck(pg.locator('[data-land-sewerage]').count() == 1, 'нет наличия канализации')
    t.ck(pg.locator('[data-land-autonomous-heating]').count() == 0,
         'осталось наличие автономного отопления')
    # Поля «наличие / тип / площадь построек» убраны 04.09.2026: их заменил
    # список вспомогательных построек — там состав и площадь каждой.
    t.ck(pg.locator('[data-land-buildings]').count() == 0, 'осталось поле «Наличие построек»')
    t.ck(pg.locator('[data-land-building-type]').count() == 0, 'осталось поле «Тип построек»')
    t.ck(pg.locator('[data-land-building-area]').count() == 0, 'осталось поле «Площадь построек»')
    t.ck(pg.locator('[data-land-category]').count() == 1, 'у несельхоза нет категории земель')

    cats = pg.eval_on_selector_all('[data-land-category] option', 'els => els.map((e) => e.textContent.trim())')
    t.ck(len([c for c in cats if c and c != 'Не выбрано']) == 6,
         'категорий земель не шесть: %s' % cats)
    t.ck(not any('сельскохозяйствен' in c.lower() for c in cats),
         'в категориях земель есть сельхоз — он отдельный тип участка: %s' % cats)

    # --- 4. вспомогательные постройки ---
    t.ck(pg.locator('[data-aux-add]').count() == 1, 'нет списка вспомогательных построек')
    pg.locator('[data-aux-add]').click()
    t.wait(700)
    t.ck(pg.locator('[data-aux-kind]').count() == 1, 'постройка не добавилась')

    # Состав полей строки задан пользователем 04.09.2026: постройка, площадь,
    # состояние, класс. «Материала» больше нет.
    t.ck(pg.locator('[data-aux-condition]').count() == 1, 'нет состояния постройки')
    t.ck(pg.locator('[data-aux-class]').count() == 1, 'нет класса постройки')
    t.ck(pg.locator('[data-aux-material]').count() == 0, 'остался «Материал»')

    # Перечень построек зависит от типа участка: у несельхоза свои.
    kinds = pg.eval_on_selector_all('[data-aux-kind] option',
                                    'els => els.map((e) => e.textContent.trim())')
    t.ck('Баня' in kinds and 'Беседка' in kinds,
         'у несельхоза не тот перечень построек: %s' % kinds)
    t.ck('Кошара' not in kinds and 'Амбар' not in kinds,
         'несельхозу предлагаются сельхозные постройки: %s' % kinds)

    classes = pg.eval_on_selector_all('[data-aux-class] option',
                                      'els => els.map((e) => e.textContent.trim())')
    t.ck('Капитальный' in classes and 'Некапитальный' in classes,
         'класс постройки не капитальный/некапитальный: %s' % classes)

    conds = pg.eval_on_selector_all('[data-aux-condition] option',
                                    'els => els.map((e) => e.textContent.trim())')
    t.ck(len([c for c in conds if c and c != 'Не выбрано']) == 5,
         'состояний постройки не пять: %s' % conds)

    pg.locator('[data-aux-area]').first.fill('18')
    t.wait(400)
    t.ck('18' in pg.locator('.al-sum').first.inner_text(),
         'сумма площадей построек не пересчиталась: %s' % pg.locator('.al-sum').first.inner_text())
    pg.locator('[data-aux-del]').first.click()
    t.wait(700)
    t.ck(pg.locator('[data-aux-kind]').count() == 0, 'постройка не удалилась')

    # --- 4б. поля-справочники вместо свободного текста ---
    #
    # Согласовано с пользователем 04.09.2026: права, назначение по
    # правоудостоверяющему документу, тип почвы и каменистость — справочники, а
    # не свободный ввод. По тексту не собрать выборку («Чернозем» и «чернозём» —
    # два разных значения), поэтому проверка сторожит именно тип контрола.
    _open_land(t)

    # Тип участка возвращаем в сельхоз: блок 02 «Сельскохозяйственные
    # характеристики» есть только у него, а проверка выше переводила участок в
    # несельхоз. Открытие карточки состояние не сбрасывает — маршрут меняется
    # хэшем, без перезагрузки страницы.
    pg.select_option('[data-land-type]', 'Сельскохозяйственный')
    t.wait(600)

    for attr, title in [('[data-land-rights]', 'права на участок'),
                        ('[data-land-purpose]', 'назначение по правоудостоверяющему документу'),
                        ('[data-land-soil]', 'тип почвы'),
                        ('[data-land-stoniness]', 'каменистость')]:
        tag = pg.eval_on_selector(attr, 'e => e.tagName') if pg.locator(attr).count() else ''
        t.ck(tag == 'SELECT', '%s — не справочник, а %s' % (title, tag or 'поля нет'))

    # Значение из данных должно быть в справочнике: иначе селект молча встанет
    # на «Не выбрано», и заполненное поле окажется пустым.
    for attr, title in [('[data-land-rights]', 'права'),
                        ('[data-land-purpose]', 'назначение'),
                        ('[data-land-soil]', 'тип почвы')]:
        if pg.locator(attr).count():
            val = pg.eval_on_selector(attr, 'e => e.value')
            t.ck(val != '', '%s: значение из данных не нашлось в справочнике' % title)

    # «Иное» открывает поле ручного ввода — и закрывает его обратно.
    pg.select_option('[data-land-purpose]', label='Иное')
    t.wait(600)
    t.ck(pg.locator('[data-land-purpose-other]').is_visible(),
         'вариант «Иное» не открыл поле ручного ввода назначения')

    # --- 5. благоустройство: ранг и описание ---
    t.ck(pg.locator('[data-land-improve-rank]').count() == 1, 'нет ранга благоустройства')
    ranks = pg.eval_on_selector_all('[data-land-improve-rank] option',
                                    'els => els.map((e) => e.textContent.trim())')
    real = [r for r in ranks if r and r != 'Не выбрано']
    t.ck(len(real) == 4, 'рангов благоустройства не четыре: %s' % real)
    t.ck(pg.locator('[data-land-improve-note]').count() == 1, 'нет описания благоустройства')
    t.ck(pg.locator('[data-imp-field]').count() == 0,
         'остались старые мультивыборы благоустройства')

    # --- 6. координаты и зоны крупного города ---
    t.ck(pg.locator('[data-land-gps]').count() == 1, 'нет поля координат')
    t.ck(pg.locator('[data-land-zone]').count() == 0,
         'зона показана для села — деление на зоны только у крупных городов')

    # Объект в Бишкеке: зона и микрорайон вместо «расположения в районе».
    _open_land(t, '#/oc/civil/oc-cv-1')
    t.ck(pg.locator('[data-land-zone]').count() == 1
         and pg.locator('[data-land-microdistrict]').count() == 1,
         'в Бишкеке нет полей крупной зоны и микрорайона')
    t.ck(pg.locator('[data-land-location]').count() == 0,
         'в крупном городе осталось прежнее «расположение в районе»')

    # --- 6б. проверка формата координат (ТЗ §5.1) ---
    #
    # Перепутанные или оборванные координаты сами себя не проявляют: точка
    # окажется не там, и заметят это на карте, много позже. Проверка сторожит,
    # что сообщение появляется и снимается.
    _open_land(t)
    for value, expect_err, what in [
        ('42.874722, 74.612222', False, 'верные координаты помечены ошибкой'),
        ('42.874722 74.612222', True, 'координаты без запятой приняты'),
        ('42,874722, 74,612222', True, 'запятая как десятичный разделитель принята'),
        ('74.612222, 42.874722', True, 'перепутанные широта и долгота приняты'),
        ('42.874722', True, 'одна широта без долготы принята'),
        ('', False, 'пустое поле координат помечено ошибкой'),
    ]:
        gps = pg.locator('[data-land-gps]')
        gps.fill(value)
        gps.dispatch_event('input')
        t.wait(220)
        bad = pg.locator('[data-land-gps].field-bad').count() == 1
        t.ck(bad == expect_err, what)

    msg = (pg.locator('[data-field-err]').first.inner_text()
           if pg.locator('[data-field-err]').count() else '')
    pg.locator('[data-land-gps]').fill('74.612222, 42.874722')
    pg.locator('[data-land-gps]').dispatch_event('input')
    t.wait(250)
    msg = (pg.locator('[data-field-err]').first.inner_text()
           if pg.locator('[data-field-err]').count() else '')
    t.ck('перепутан' in msg.lower(),
         'сообщение не объясняет, что широта и долгота перепутаны: %r' % msg)

    # --- 7. заметка для разработчиков ---
    notes = pg.locator('.dev-note')
    t.ck(notes.count() >= 2, 'заметок «i» меньше двух: %d' % notes.count())
    notes.first.scroll_into_view_if_needed()
    notes.first.hover()
    t.wait(400)
    t.ck(pg.locator('.dev-note-pop').first.is_visible(), 'заметка «i» не раскрывается')

    # Заметка не должна уезжать за границы окна: раньше у полей правой колонки
    # текст раскрывался вправо и половина оказывалась за краем экрана
    # (пользователь 04.09.2026, docs/reestr-kosyakov.md).
    for i in range(notes.count()):
        n = notes.nth(i)
        n.scroll_into_view_if_needed()
        n.hover()
        t.wait(250)
        box = pg.evaluate('''(i) => {
          const p = document.querySelectorAll('.dev-note')[i].querySelector('.dev-note-pop');
          const r = p.getBoundingClientRect();
          return {l: r.left, r: r.right, t: r.top, b: r.bottom,
                  w: window.innerWidth, h: window.innerHeight};
        }''', i)
        t.ck(box['l'] >= -1 and box['r'] <= box['w'] + 1,
             'заметка №%d уехала за края окна по горизонтали: %.0f..%.0f при ширине %.0f'
             % (i + 1, box['l'], box['r'], box['w']))
        t.ck(box['t'] >= -1 and box['b'] <= box['h'] + 1,
             'заметка №%d уехала за края окна по вертикали: %.0f..%.0f при высоте %.0f'
             % (i + 1, box['t'], box['b'], box['h']))

    # --- 8. смена вида ОИ отменена ---
    #
    # Кнопка «Вид ОИ» была артефактом разбора заметок (пользователь 04.09.2026:
    # «Смену ОИ отменяем. Это был артефакт»). Проверка сторожит, чтобы она не
    # вернулась вместе с копипастой плашки ОИ в другой модуль.
    t.ck(pg.locator('[data-change-oi-kind]').count() == 0,
         'кнопка смены вида ОИ вернулась в плашку — она отменена')

    # --- 9. смена типа ОЦ (на странице редактирования объекта) ---
    #
    # Место важно: пользователь 04.09.2026 — «смена типа объекта оценки
    # происходит на странице редактирования ОЦ». Поле «Тип ОЦ» там было
    # заблокировано, теперь оно рабочее.
    t.open('#/oc/civil/oc-cv-1', wait='tr[data-open-oi]')
    t.wait(500)
    oi_before = pg.locator('tr[data-open-oi]').count()

    t.open('#/oc/civil/oc-cv-1/form', wait='#fType')
    t.wait(600)
    t.ck(not pg.eval_on_selector('#fType', 'e => e.disabled'),
         'поле «Тип ОЦ» в форме редактирования заблокировано')

    types = pg.eval_on_selector_all('#fType option', 'els => els.map((e) => e.textContent.trim())')
    t.ck(len(types) == 5, 'в поле «Тип ОЦ» не пять типов: %s' % types)

    pg.select_option('#fType', label='Производственное строение')
    t.wait_for('.modal-head')
    t.ck(pg.locator('.modal-head').count() == 1, 'смена типа прошла без подтверждения')
    t.ck('Объектов имущества переедет' in (pg.locator('.modal-note').inner_text()
                                          if pg.locator('.modal-note').count() else ''),
         'в диалоге нет сводки о том, что переедет')

    # Отказ возвращает прежний тип в поле — иначе форма показывала бы неправду.
    pg.locator('[data-modal-cancel]').click()
    t.wait(500)
    t.ck(pg.eval_on_selector('#fType', 'e => e.options[e.selectedIndex].textContent.trim()')
         == 'Гражданское здание',
         'после отказа в поле остался чужой тип')

    pg.select_option('#fType', label='Производственное строение')
    t.wait_for('.modal-head')
    pg.locator('[data-modal-ok]').click()
    # Переезд записи между модулями идёт через динамический import(),
    # поэтому ждём появления карточки нового типа, а не времени.
    t.wait_for('.card')
    t.wait(600)

    t.ck('/oc/production/' in pg.evaluate('() => location.hash'),
         'после смены типа маршрут не сменился: %s' % pg.evaluate('() => location.hash'))
    t.ck(pg.locator('tr[data-open-oi]').count() == oi_before,
         'после смены типа литер стало %d вместо %d'
         % (pg.locator('tr[data-open-oi]').count(), oi_before))

    # Обратная смена возвращает запись и её содержимое.
    t.open('#/oc/production/oc-cv-1/form', wait='#fType')
    t.wait(600)
    pg.select_option('#fType', label='Гражданское здание')
    t.wait_for('.modal-head')
    pg.locator('[data-modal-ok]').click()
    # Переезд записи между модулями идёт через динамический import(),
    # поэтому ждём появления карточки нового типа, а не времени.
    t.wait_for('.card')
    t.wait(600)
    t.ck('/oc/civil/' in pg.evaluate('() => location.hash'),
         'обратная смена типа не вернула запись в исходный тип')
    t.ck(pg.locator('tr[data-open-oi]').count() == oi_before,
         'после обратной смены литер стало %d вместо %d'
         % (pg.locator('tr[data-open-oi]').count(), oi_before))


    # --- 10. предупреждение о потерях говорит правду ---
    #
    # Три дефекта, на которых оно врало по очереди: считало потери по полям
    # записи ОЦ (а они одинаковы у всех типов — список выходил пустым); брало
    # образец из одной живой записи (незаполненное поле объявлялось потерянным);
    # спрашивало подписи без вида карточки и показывало ключи латиницей.
    t.open('#/oc/residential-house/oc-rh-1/form', wait='#fType')
    t.wait(600)
    pg.select_option('#fType', label='Гражданское здание')
    t.wait_for('.modal-head')

    warn = pg.locator('.modal-body').inner_text() if pg.locator('.modal-body').count() else ''
    t.ck(pg.locator('.modal-list-facts li').count() >= 1,
         'потери показаны сплошным текстом, а не списком')
    t.ck('Тип строения' in warn,
         'предупреждение не называет поля жилого дома, которых нет у гражданского: %s'
         % warn.replace(chr(10), ' ')[:160])

    # Карточка участка у всех модулей одна и та же — её поля терять неоткуда.
    for word in ['Тип земельного участка', 'Форма участка', 'Расположение в районе']:
        t.ck(word not in warn,
             'предупреждение считает потерянными поля участка, хотя карточка общая: «%s»' % word)

    # И ни одного технического ключа в тексте.
    import re as _re
    keys = _re.findall(r'[a-z]{2,}[A-Z][a-zA-Z]+', warn)
    t.ck(not keys, 'в предупреждении технические ключи полей: %s' % keys[:5])

    pg.locator('[data-modal-cancel]').first.click()
    t.wait(300)

    # Движимого нет у жилого дома — об этом говорится отдельно.
    t.open('#/oc/civil/oc-cv-1/form', wait='#fType')
    t.wait(600)
    pg.select_option('#fType', label='Жилое здание (дом)')
    t.wait_for('.modal-head')
    warn2 = pg.locator('.modal-body').inner_text() if pg.locator('.modal-body').count() else ''
    t.ck('нет карточки' in warn2,
         'не сказано, что для движимого объекта в новом типе нет карточки: %s'
         % warn2.replace(chr(10), ' ')[:160])
    pg.locator('[data-modal-cancel]').first.click()
    t.wait(300)
