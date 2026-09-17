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
  * снимки единицы подписаны в просмотрщике её названием, а не id;
  * прежний «movable» переносится в перечень единиц без потери данных;
  * меню «+ Добавить ОИ» предлагает один пункт на всё движимое;
  * комментарий единицы с пояснением: растёт по тексту и сохраняется.
"""
import base64
import os
import tempfile

NAME = 'карточка механизмов'

TOUCHES = (
    'app/modules/civil/oi/mech/*', 'app/modules/civil/data/mechClassifier.js',
    'app/modules/civil/oi/registry.js', 'app/modules/civil/card/*',
    'app/modules/civil/parts/photos/*', 'app/modules/civil/parts/viewer/*',
    'app/modules/civil/data/rules.js', 'app/modules/civil/index.js',
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
    marka = pg.locator('[data-mu-param="Марка (модель) и заводской номер"]')
    t.ck(marka.count() == 1 and marka.input_value() == 'КВГ-1,25-95, № КВГ-125-4471',
         'общий параметр потерял значение при смене подгруппы')
    t.ck(pg.locator('[data-mu-param="Рабочее давление (МПа/бар)"]').count() == 0,
         'параметр чужой подгруппы остался на экране')
    pick('sub', 'Котельное оборудование')
    t.ck(pg.locator('[data-mu-param="Рабочее давление (МПа/бар)"]').input_value() == '0,6 МПа',
         'скрытое значение не вернулось при обратной смене подгруппы')

    pick('cls', 'Инвентарь и хозяйственные принадлежности')
    t.ck(sel('sub').count() == 0 and sel('type').count() == 0,
         'у класса без подгрупп показаны подгруппа и тип')
    pick('cls', '')
    t.ck(sel('sub').is_disabled() and sel('type').is_disabled(),
         'без класса подгруппа и тип не заблокированы')
    pick('cls', 'Энергетическое оборудование')
    pick('sub', 'Котельное оборудование')
    pick('type', 'Водогрейные котлы')

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
      const m = await import('./app/modules/civil/oi/mech/model.js');
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
