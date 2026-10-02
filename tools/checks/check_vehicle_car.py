# -*- coding: utf-8 -*-
"""Легковой автомобиль: состав полей (указания пользователя 02.10.2026).

Что ловит сценарий:

  * база легкового — тип кузова (справочник mashina.kg), поля от него не
    зависят; «Тип ТС, вид кузова» — под выбором категории и кузова;
  * у легкового нет масс, числа осей, моточасов, КОМ, раздатки, колёсной
    формулы, комплектности и единого «Тех. состояния»; есть вид документа
    (техпаспорт, техталон), руль «Левый (стандартный)», комплектация перед
    страной производства, привод, коробка с вариатором, топливо по
    mashina.kg, пробег по одометру, ёмкость батареи — только у электро и
    гибрида; состояние — таблицей по шести элементам с описанием;
  * подраздел двигателя у легкового — «Двигатель», у грузовика — «Двигатель и
    грузовые характеристики»; VID — среди номеров у любой категории; у
    грузовика колёсная формула и КОМ на месте;
  * прежние записи легкового: база — тип кузова по записи «Тип ТС», 4×4 —
    полный привод, значения списков — на справочник, прежние значения без
    пары — в «Дополнительные параметры».
"""

NAME = 'легковой: состав полей'

TOUCHES = (
    'app/modules/vehicle/tsModel.js', 'app/modules/vehicle/view.js', 'app/modules/vehicle/tsFields.view.js',
    'app/modules/vehicle/module.css', 'app/modules/vehicle/data/tsCatalog.js', 'tools/data/build_ts_catalog.py',
    'tools/docs/build_kategorii_ts.py',
)

SECTION_TITLES = "() => [...document.querySelectorAll('.vehicle-form .vh-sub')].map((e) => e.childNodes[0].textContent.trim())"


def run(t):
    pg = t.page
    t.open('', wait='.reg-tr')
    pg.click('.reg-create [data-dd-toggle]')
    pg.click('.reg-create [data-create="vehicle"]')
    t.wait_until("() => location.hash.includes('/create')")
    pg.click('[data-ts-kind="base"]')
    t.wait_for('[data-ts-cat]')

    has = lambda key: pg.locator('[data-tsf$="|%s"]' % key).count() > 0

    pg.select_option('[data-ts-cat]', 'Легковое')
    t.wait_for('[data-ts-base]:not([disabled])')
    bodies = pg.eval_on_selector_all('[data-ts-base] option', 'els => els.map((e) => e.textContent.trim())')
    t.ck('Седан' in bodies and 'Внедорожник 5 дв.' in bodies and 'Хэтчбек 5 дв.' in bodies,
         'база легкового — не типы кузова: %s' % bodies)
    pg.select_option('[data-ts-base]', 'Седан')
    t.wait_for('[data-tsf="main|make"]')
    # «Тип ТС, вид кузова» — после выбора категории и кузова.
    order = pg.evaluate("""() => [...document.querySelectorAll('[data-ts-cat], [data-ts-base], [data-tsf="main|vtype"]')]
      .map((e) => e.dataset.tsCat !== undefined ? 'cat' : e.dataset.tsBase !== undefined ? 'base' : 'vtype')""")
    t.ck(order == ['cat', 'base', 'vtype'], '«Тип ТС, вид кузова» не под выбором: %s' % order)

    for key in ('docKind', 'trim', 'country', 'driveType', 'gearbox', 'fuel', 'mileage', 'vid', 'condBody', 'condOtherNote'):
        t.ck(has(key), 'у легкового нет поля %s' % key)
    for key in ('massEmpty', 'massMax', 'axles', 'engineHours', 'pto', 'transferCase', 'wheelFormula', 'kit', 'state'):
        t.ck(not has(key), 'у легкового осталось поле %s' % key)
    opt = lambda key: pg.eval_on_selector_all('[data-tsf$="|%s"] option' % key, 'els => els.map((e) => e.textContent.trim())')
    t.ck('Вариатор' in opt('gearbox'), 'в коробке нет вариатора: %s' % opt('gearbox'))
    t.ck('Левый (стандартный)' in opt('wheel'), 'руль не «Левый (стандартный)»: %s' % opt('wheel'))
    t.ck(opt('docKind')[1:] == ['Техпаспорт', 'Техталон'], 'вид документа не тот: %s' % opt('docKind'))
    # Подписи выводятся заглавными — сверяем по тексту разметки, без регистра.
    lab = lambda key: pg.locator('[data-ts-key="%s"] label' % key).text_content().lower()
    t.ck('пробег по одометру' in lab('mileage'), 'подпись пробега не «по одометру»: %s' % lab('mileage'))
    t.ck('страна производства' in lab('country'), 'не «Страна производства»: %s' % lab('country'))
    keys = pg.eval_on_selector_all('[data-ts-key]', 'els => els.map((e) => e.dataset.tsKey)')
    t.ck(keys.index('trim') < keys.index('country'), 'комплектация не перед страной: %s' % keys)
    t.ck(pg.locator('[data-ts-key="vid"]').locator('xpath=ancestor::table[contains(@class,"vh-ntbl")]').count() == 1,
         'VID не среди номеров')
    titles = pg.evaluate(SECTION_TITLES)
    t.ck('Двигатель' in titles and not any('массы' in x for x in titles), 'заголовок двигателя легкового не тот: %s' % titles)

    # Таблица состояния: шесть элементов, оценка и описание.
    rows = pg.eval_on_selector_all('.vh-cond tbody .vh-cond-el', 'els => els.map((e) => e.textContent.trim())')
    t.ck(len(rows) == 6 and rows[0].startswith('Кузова'), 'таблица состояния не та: %s' % rows)
    # Оформление как у «Дополнительных параметров» и перегородки ширины.
    t.ck(pg.locator('.vh-cond.mu-xtbl').count() == 1, 'таблица состояния не в оформлении доп. параметров')
    grip = pg.locator('.vh-cond [data-col-grip="el"]')
    t.ck(grip.count() == 1, 'у таблицы состояния нет перегородки ширины')
    th = pg.locator('.vh-cond th[data-col="el"]')
    th.scroll_into_view_if_needed()
    w0 = th.bounding_box()['width']
    b = grip.bounding_box()
    pg.mouse.move(b['x'] + b['width'] / 2, b['y'] + b['height'] / 2)
    pg.mouse.down()
    pg.mouse.move(b['x'] + 60, b['y'] + b['height'] / 2, steps=5)
    pg.mouse.up()
    w1 = th.bounding_box()['width']
    t.ck(w1 > w0 + 30, 'столбец не растянулся перегородкой: %s → %s' % (w0, w1))
    over = pg.evaluate("() => document.documentElement.scrollWidth > innerWidth")
    t.ck(not over, 'таблица состояния растянула страницу')

    # Батарея — у электро и гибрида.
    t.ck(not has('battery'), 'батарея видна у бензинового')
    pg.select_option('[data-tsf="main|fuel"]', 'Гибрид')
    t.wait_until("() => !!document.querySelector('[data-tsf$=\"|battery\"]')")
    pg.select_option('[data-tsf="main|fuel"]', 'Электро')
    t.wait_until("() => !!document.querySelector('[data-tsf$=\"|battery\"]') && !document.querySelector('[data-tsf$=\"|engineVolume\"]')")

    # Грузовик: прежний состав и свой заголовок.
    pg.select_option('[data-ts-cat]', 'Грузовое')
    t.wait_for('[data-ts-base]:not([disabled])')
    pg.select_option('[data-ts-base]', 'Тяжёлый грузовик (свыше 12 т)')
    t.wait_for('[data-tsf="main|make"]')
    for key in ('wheelFormula', 'pto', 'steerAxles', 'massMax'):
        t.ck(has(key), 'у грузовика пропало поле %s' % key)
    titles = pg.evaluate(SECTION_TITLES)
    t.ck('Двигатель и грузовые характеристики' in titles, 'заголовок двигателя грузовика не тот: %s' % titles)
    t.ck(pg.locator('[data-ts-key="vid"]').locator('xpath=ancestor::table[contains(@class,"vh-ntbl")]').count() == 1,
         'VID у грузовика не среди номеров')

    got = pg.evaluate("""async () => {
      const m = await import('./app/modules/vehicle/tsModel.js');
      const h = { vehicle: { kind: 'base', category: 'Легковое', base: 'Легковой автомобиль и внедорожник',
        f: { vtype: 'легковой, седан', wheel: 'Левый', gearbox: 'Автоматическая', wheelFormula: '4×4',
             engineHours: '1200', 'engineHours@unit': 'ч', massMax: '1900', state: 'Хорошее', transferCase: 'Есть' },
        extra: [], modules: [] } };
      const v = m.tsOf(h);
      return { base: v.base, f: v.f, extra: v.extra.map((x) => x.label + '=' + x.value) };
    }""")
    t.ck(got['base'] == 'Седан', 'база не стала типом кузова по записи «Тип ТС»: %s' % got)
    t.ck(got['f'].get('driveType') == 'Полный' and got['f'].get('wheel') == 'Левый (стандартный)'
         and got['f'].get('gearbox') == 'Автомат', 'прежние значения не переведены: %s' % got['f'])
    for x in ('Колёсная формула=4×4', 'Моточасы=1200 ч', 'Максимальная разрешённая масса=1900',
              'Техническое состояние=Хорошее', 'Раздаточная коробка=Есть'):
        t.ck(x in got['extra'], 'прежнее значение потерялось: %s (%s)' % (x, got['extra']))
