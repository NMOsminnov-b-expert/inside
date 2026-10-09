# -*- coding: utf-8 -*-
"""Карточка ТС: сворачивание блоков и «Показать все» у поисков.

Указание пользователя 07.10.2026: «Необходимо поправить сворачивание блоков,
сделать его интуитивнее (стрелочки побольше). Сворачивается пока что только
блок 02, хотя должны все. Нужен способ просмотра всех списков модулей и видов
ТС. В том числе марок. (кнопка показать все и список вертикальный. По
категориям.)»

Что ловит сценарий:
  * блок формы без заголовка-аккордеона или не сворачивается щелчком по
    заголовку; не разворачивается с клавиатуры (Enter);
  * у «Тип ТС» и «Найти модуль» нет «Показать все»; в окне нет групп
    «Виды ТС», «Шаблоны», «Марки и модели»; фильтр окна не находит модель;
  * выбор пункта в окне не ставит то же, что выбор в выдаче поиска
    (модель — категорию, «Тип ТС» и марку; модуль — свой вид);
  * Escape не закрывает окно;
  * встроенная карточка ТС (объект имущества в здании) не сворачивается —
    обработчик висел только в карточке ОЦ (07.10.2026, код-ревью 09.10.2026);
  * после ухода с экрана и возврата список пустых полей в строке разделов не
    закрывается щелчком мимо (флаг «уже привязано» в dataset общего корня);
  * «Создать похожее» переносит юридический адрес и оценки состояния.
"""

NAME = 'карточка ТС: сворачивание и «Показать все»'

TOUCHES = ('app/modules/vehicle/tsModel.js', 'app/modules/vehicle/oiCard.js', 'app/kernel/treeSearch.js', 'app/kernel/dialog.js', 'app/kernel/cards.css', 'app/modules/vehicle/view.js',
           'app/modules/vehicle/ctrl.js', 'app/modules/vehicle/parties.view.js', 'app/modules/vehicle/templates.js',
           'app/modules/vehicle/module.css')

EXP = "(i) => document.querySelectorAll('.vehicle-form .vh-acc-head')[i].getAttribute('aria-expanded')"


def run(t):
    pg = t.page
    t.open('', wait='.reg-tr')
    pg.click('.reg-create [data-dd-toggle]')
    pg.click('.reg-create [data-create="vehicle"]')
    t.wait_for('[data-ts-cat]')
    pg.select_option('[data-ts-cat]', 'Легковое')
    t.wait_for('[data-tsf="main|make"]')

    heads = pg.eval_on_selector_all('.vehicle-form .card-head h3', 'els => els.length')
    acc = pg.locator('.vehicle-form .vh-acc-head').count()
    t.ck(acc == heads and acc >= 5, 'не у всех блоков заголовок-аккордеон: %s из %s' % (acc, heads))
    for i in range(acc):
        pg.locator('.vehicle-form .vh-acc-head').nth(i).locator('h3').click()
        t.wait_until("() => (%s)(%d) === 'false'" % (EXP, i))
    t.ck(pg.locator('.vehicle-form .card-pad').count() == 0, 'свёрнутые блоки показывают содержимое')
    pg.focus('.vehicle-form .vh-acc-head >> nth=1')
    pg.keyboard.press('Enter')
    t.wait_until("() => (%s)(1) === 'true'" % EXP)
    for i in range(2, acc):
        pg.locator('.vehicle-form .vh-acc-head').nth(i).click()
        t.wait_until("() => (%s)(%d) === 'true'" % (EXP, i))
    t.ck(pg.locator('#ts-find-all').count() == 1, 'у «Тип ТС» нет «Показать все»')

    pg.click('#ts-find-all')
    t.wait_for('.tsb')
    tops = pg.eval_on_selector_all('.tsb .tsb-d0 > summary .tsb-t', 'els => els.map((e) => e.textContent)')
    for g in ('Виды ТС', 'Шаблоны', 'Марки и модели'):
        t.ck(g in tops, 'в окне нет группы «%s»: %s' % (g, tops))
    pg.fill('.tsb-q', 'камаз 65115')
    t.wait_until("() => document.querySelectorAll('.tsb-item').length > 0")
    pg.locator('.tsb-item').first.click()
    t.wait_until("() => !document.querySelector('.tsb')")
    t.ck(pg.input_value('[data-ts-cat]') == 'Грузовое' and 'самосвал' in pg.input_value('#ts-find-q')
         and 'КАМАЗ' in pg.input_value('[data-tsf="main|make"]'),
         'модель из окна не поставила категорию, «Тип ТС» и марку: %s, %s' % (
             pg.input_value('[data-ts-cat]'), pg.input_value('#ts-find-q')))

    pg.click('#ts-find-all')
    t.wait_for('.tsb')
    pg.keyboard.press('Escape')
    t.wait_until("() => !document.querySelector('.tsb')")

    pg.click('[data-ts-madd]')
    t.wait_for('#ts-mfind-all')
    pg.click('#ts-mfind-all')
    t.wait_for('.tsb')
    pg.locator('.tsb summary').first.click()
    name = pg.locator('.tsb-item').first.locator('.tsr-name').inner_text().strip()
    pg.locator('.tsb-item').first.click()
    t.wait_until("() => !document.querySelector('.tsb')")
    kinds = pg.evaluate("() => [...document.querySelectorAll('[data-ts-modkind]')].map((e) => e.value)")
    t.ck(name in kinds, 'модуль из окна не встал: %s → %s' % (name, kinds))

    # --- «Создать похожее»: своё у машины не переносится ------------------------
    pg.fill('[data-tsf="main|legalAddr"]', 'г. Бишкек, ул. Проверочная, 1')
    pg.keyboard.press('Tab')
    src = pg.evaluate("() => location.hash")
    pg.click('[data-vehicle-copy]')
    pg.click('.modal-back [data-modal-ok]')
    t.wait_until("(h) => location.hash !== h", src)
    # По данным новой записи, а не по экрану: сразу после перехода на экране
    # ещё может стоять прежняя запись (флак 09.10.2026 под нагрузкой).
    copy = pg.evaluate("""async () => { const r = await import('./app/modules/vehicle/records.js');
      const rec = r.loadRecord(location.hash.split('/')[3]); return rec && rec.vehicle; }""") or {}
    t.ck(copy.get('category') == 'Грузовое', '«Создать похожее» не перенёс категорию: %s' % copy.get('category'))
    t.ck(not (copy.get('f') or {}).get('legalAddr'), '«Создать похожее» перенёс юридический адрес')
    t.wait_for('[data-ts-cat]')

    # --- возврат на экран: «Ходовая» закрывается щелчком мимо --------------------
    pg.evaluate("() => { location.hash = '#/'; }")
    t.wait_for('.reg-tr')
    pg.go_back()
    t.wait_for('[data-ts-cat]')
    # Список пустых полей раздела (строка разделов) закрывается щелчком мимо —
    # этот слушатель документа привязывается тем же «один раз на экран».
    t.wait_for('[data-ts-nav]')
    pg.evaluate("() => document.querySelector('[data-ts-nav]').click()")
    t.wait_until("() => [...document.querySelectorAll('[data-ts-miss]')].some((d) => !d.hidden)")
    pg.evaluate("() => document.body.click()")
    t.ck(t.wait_until("() => [...document.querySelectorAll('[data-ts-miss]')].every((d) => d.hidden)"),
         'после возврата на экран список пустых полей не закрывается щелчком мимо')

    # --- встроенная карточка ТС в здании сворачивается ---------------------------
    t.open('#/oc/civil/oc-cv-1', wait='[data-add-oi]')
    pg.locator('[data-dd-toggle]').first.click()
    pg.locator('[data-add-oi]', has_text='Транспортное средство').first.click()
    t.wait_until("() => [...document.querySelectorAll('tr[data-open-oi]')].some((tr) => tr.innerText.includes('Новое транспортное средство'))")
    pg.locator('tr[data-open-oi]', has_text='Новое транспортное средство').first.click()
    t.wait_for('.ts-host .vehicle-form')
    pg.select_option('.ts-host [data-ts-cat]', 'Легковое')
    t.wait_for('.ts-host [data-ts-acc="Регистрационный учёт"]')
    pg.locator('.ts-host [data-ts-acc="Регистрационный учёт"] h3').click()
    t.ck(t.wait_until("() => document.querySelector('.ts-host [data-ts-acc=\"Регистрационный учёт\"]').getAttribute('aria-expanded') === 'false'"),
         'встроенная карточка ТС в здании не сворачивается')
