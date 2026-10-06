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
  * подсказки «Тип ТС, вид кузова» — своей категории: в грузовом не видно
    легковых и наоборот (замечание пользователя 06.10.2026);
  * подраздел двигателя у легкового — «Двигатель», у грузовика — «Двигатель и
    грузовые характеристики»; VID — среди номеров у любой категории; у
    грузовика колёсная формула и КОМ на месте;
  * комплектация легкового — список со «Своя», комментарий только у своей;
    общее состояние у всех ТС (рабочее, условно пригодное, нерабочее, иное),
    описание — только у «Иное» (указания пользователя 06.10.2026);
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
    vt = lambda: pg.evaluate("""() => { const i = document.querySelector('[data-tsf="main|vtype"]');
      return i && i.list ? [...i.list.options].map((o) => o.value) : []; }""")
    t.ck(vt() and all(x.startswith('легковой') for x in vt()), 'в подсказках типа легкового чужие варианты: %s' % vt()[:8])

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
    t.ck(rows == ['Кузов и окраска', 'Салон', 'Двигатель', 'Ходовая часть', 'Электрооборудование', 'Прочие элементы'],
         'таблица состояния не та: %s' % rows)
    # Шкала состояния — семь ступеней методики, у ступени — характеристика в подсказке.
    grades = opt('condBody')[1:]
    t.ck(grades == ['Новое', 'Очень хорошее', 'Хорошее', 'Удовлетворительное', 'Условно пригодное',
                    'Неудовлетворительное', 'Не подлежит ремонту'], 'шкала состояния не та: %s' % grades)
    t.ck(pg.eval_on_selector_all('[data-tsf$="|condBody"] option[title]', 'els => els.filter((e) => e.title).length') == 7,
         'у ступеней шкалы нет подсказок')
    pg.select_option('[data-tsf$="|condBody"]', 'Удовлетворительное')
    t.wait_until("() => document.querySelector('[data-tsf$=\"|condBody\"]').title.includes('текущего ремонта')")
    t.ck('Условно пригодное' in (pg.locator('.vh-cond th[data-col="grade"]').get_attribute('title') or ''),
         'у заголовка «Состояние» нет шкалы')
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

    # Комплектация: «Своя» открывает комментарий, у остальных его нет.
    t.ck('Своя' in opt('trim') and 'Базовая' in opt('trim'), 'комплектация не списком со «Своя»: %s' % opt('trim'))
    t.ck(not has('trimNote'), 'комментарий к комплектации виден без «Своя»')
    pg.select_option('[data-tsf="main|trim"]', 'Своя')
    t.wait_until("() => !!document.querySelector('[data-tsf$=\"|trimNote\"]')")
    pg.select_option('[data-tsf="main|trim"]', 'Люкс')
    t.wait_until("() => !document.querySelector('[data-tsf$=\"|trimNote\"]')")
    # Общее состояние: «Иное» открывает описание.
    t.ck(opt('generalState')[1:] == ['Рабочее', 'Условно пригодное', 'Нерабочее', 'Иное'],
         'шкала общего состояния не та: %s' % opt('generalState'))
    t.ck(not has('generalStateNote'), 'описание общего состояния видно без «Иное»')
    pg.select_option('[data-tsf="main|generalState"]', 'Иное')
    t.wait_until("() => !!document.querySelector('[data-tsf$=\"|generalStateNote\"]')")

    # Батарея — у электро и гибрида.
    t.ck(not has('battery'), 'батарея видна у бензинового')
    pg.select_option('[data-tsf="main|fuel"]', 'Гибрид')
    t.wait_until("() => !!document.querySelector('[data-tsf$=\"|battery\"]')")
    # Два столбца: топливо | мощность, объём | батарея (указание пользователя 02.10.2026).
    top = lambda key: round(pg.locator('[data-ts-key="%s"]' % key).bounding_box()['y'])
    t.ck(top('fuel') == top('power') and top('engineVolume') == top('battery') and top('power') < top('battery'),
         'двигатель гибрида не в два столбца: %s' % [top(k) for k in ('fuel', 'power', 'engineVolume', 'battery')])
    pg.select_option('[data-tsf="main|fuel"]', 'Электро')
    t.wait_until("() => !!document.querySelector('[data-tsf$=\"|battery\"]') && !document.querySelector('[data-tsf$=\"|engineVolume\"]')")

    # Грузовик: прежний состав и свой заголовок.
    pg.select_option('[data-ts-cat]', 'Грузовое')
    t.wait_for('[data-ts-base]:not([disabled])')
    pg.select_option('[data-ts-base]', 'Тяжёлый грузовик (свыше 12 т)')
    t.wait_for('[data-tsf="main|make"]')
    t.ck(any(x.startswith('грузовой') for x in vt()) and not any(x.startswith('легковой') for x in vt()),
         'в подсказках типа грузовика легковые или нет грузовых: %s' % vt()[:8])
    for key in ('wheelFormula', 'pto', 'steerAxles', 'massMax', 'generalState'):
        t.ck(has(key), 'у грузовика пропало поле %s' % key)
    titles = pg.evaluate(SECTION_TITLES)
    t.ck('Двигатель и грузовые характеристики' in titles, 'заголовок двигателя грузовика не тот: %s' % titles)
    t.ck(pg.locator('[data-ts-key="vid"]').locator('xpath=ancestor::table[contains(@class,"vh-ntbl")]').count() == 1,
         'VID у грузовика не среди номеров')

    got = pg.evaluate("""async () => {
      const m = await import('./app/modules/vehicle/tsModel.js');
      const h = { vehicle: { kind: 'base', category: 'Легковое', base: 'Легковой автомобиль и внедорожник',
        f: { vtype: 'легковой, седан', wheel: 'Левый', gearbox: 'Автоматическая', wheelFormula: '4×4', trim: 'Prestige 2.4',
             engineHours: '1200', 'engineHours@unit': 'ч', massMax: '1900', state: 'Хорошее', transferCase: 'Есть' },
        extra: [], modules: [] } };
      const v = m.tsOf(h);
      return { base: v.base, f: v.f, extra: v.extra.map((x) => x.label + '=' + x.value) };
    }""")
    t.ck(got['base'] == 'Седан', 'база не стала типом кузова по записи «Тип ТС»: %s' % got)
    t.ck(got['f'].get('driveType') == 'Полный' and got['f'].get('wheel') == 'Левый (стандартный)'
         and got['f'].get('gearbox') == 'Автомат', 'прежние значения не переведены: %s' % got['f'])
    t.ck(got['f'].get('trim') == 'Своя' and got['f'].get('trimNote') == 'Prestige 2.4',
         'прежняя запись комплектации не стала «Своя» с комментарием: %s' % got['f'])
    for x in ('Колёсная формула=4×4', 'Моточасы=1200 ч', 'Максимальная разрешённая масса=1900',
              'Техническое состояние=Хорошее', 'Раздаточная коробка=Есть'):
        t.ck(x in got['extra'], 'прежнее значение потерялось: %s (%s)' % (x, got['extra']))
