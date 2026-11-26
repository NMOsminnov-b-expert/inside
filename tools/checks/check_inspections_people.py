# -*- coding: utf-8 -*-
"""«Люди» без вкладок второго уровня и движение экрана регионалов.

ТЗ tz-ekran-regionalov-odna-stroka-menyu-obschiy-srez-planirovanie-den-os, этап 4 (17.11.2026):
у «Всех осмотрщиков» — четыре вида в шапке карточки (Сводка, Таблица, Аналитика, Настройки),
внутри вида — блоки одной прокруткой; карточка осмотрщика — блоки одной прокруткой с
оглавлением. Правило interfeys-kak-v-mobilnom-vide-u-kazhdogo-interaktivnogo-elementa-svoya
и замечание пользователя «"Сетка" открывается и закрывается без анимаций... нарушение».

Что ловит сценарий:
  * над карточкой снова ряд вкладок (островок .ip-subisle или .ip-subtabs);
  * в карточке осмотрщика нет одного из блоков: выезды, план месяца, объекты, отчёты,
    статистика, профиль, авто; оглавление не прокручивает тело карточки или сдвигает страницу;
  * в «Аналитике» выбор периода не один; нет блоков статистики, итогов, отчётов дня;
  * правка «Авто» показала полосу сохранения профиля; «Отменить» у «Авто» сняло черновик профиля;
  * сетка Планирования уходит без анимации ухода и появляется без анимации появления;
  * поля ввода и выбора увеличиваются при наведении (23.11.2026), кнопки — нет;
  * ошибки консоли.
"""
from urllib.parse import quote

NAME = 'люди: карточка блоками и движение'

TOUCHES = ('app/pages/inspections/inspections.js', 'app/pages/inspections/inspections.css', 'app/pages/inspections/stats.js',
           'app/kernel/motion.css', 'app/kernel/motion.js')

WHO = 'Айдай'


def run(t):
    pg = t.page
    pg.set_viewport_size({'width': 1440, 'height': 900})
    # Карточка разделами (пользователь 24.11.2026: «не прокручивающимся списком а разделами»): виден один раздел,
    # строка разделов — вкладки; первой — «Личная карточка».
    t.open('#/inspections?s=people&p=%s&t=trips' % quote(WHO), wait='[data-ip-block="trips"]')
    t.ck(pg.locator('.ip-subisle, .ip-subtabs').count() == 0, 'над карточкой снова ряд вкладок второго уровня')
    blocks = lambda: pg.eval_on_selector_all('[data-ip-block]', 'els => els.map((e) => e.dataset.ipBlock)')
    t.ck(blocks() == ['trips'], 'в карточке не один раздел: %s' % blocks())
    tabs = pg.eval_on_selector_all('.ip-jumps [data-ip-ptab]', 'els => els.map((e) => e.dataset.ipPtab)')
    t.ck(tabs == ['profile', 'car', 'trips', 'plan', 'assigns', 'reports', 'stats', 'route'], 'разделы карточки не те: %s' % tabs)
    calm = "() => document.getAnimations().every((a) => a.playState !== 'running')"
    t.wait_until(calm)
    head_y = pg.evaluate("() => document.querySelector('.ip-card-head').getBoundingClientRect().top")
    pg.click('.ip-jumps [data-ip-ptab="reports"]')
    t.ck(t.wait_until("() => document.querySelectorAll('[data-ip-block]').length === 1 && !!document.querySelector('[data-ip-block=\"reports\"]')"),
         'вкладка «Отчёты» не открыла свой раздел')
    t.ck(pg.locator('.ipc-sper').count() == 1, 'в «Отчётах» выбор периода не один: %d' % pg.locator('.ipc-sper').count())
    # Раздел появляется с анимацией — сравнивать, когда она закончилась.
    t.wait_until("(y) => Math.abs(document.querySelector('.ip-card-head').getBoundingClientRect().top - y) < 2", head_y)
    y2 = pg.evaluate("() => document.querySelector('.ip-card-head').getBoundingClientRect().top")
    t.ck(abs(y2 - head_y) < 2, 'переключение раздела сдвинуло страницу: шапка %s → %s' % (head_y, y2))

    # «Авто» и «Личная карточка» — свои черновики; при несохранённой правке раздел не меняется.
    pg.click('.ip-jumps [data-ip-ptab="car"]')
    t.wait_for('[data-ip-block="car"] [data-ip-car="make"]')
    pg.fill('[data-ip-block="car"] [data-ip-car="make"]', 'Проверка 1')
    pg.dispatch_event('[data-ip-block="car"] [data-ip-car="make"]', 'input')
    t.ck(t.wait_until("() => !document.querySelector('[data-ip-block=\"car\"] [data-ip-c-bar]').hidden"), 'правка «Авто» не показала его полосу сохранения')
    pg.click('.ip-jumps [data-ip-ptab="profile"]')
    t.ck(t.wait_until("() => /Сохраните или отмените/.test([...document.querySelectorAll('.toast')].map((x) => x.textContent).join(' '))"),
         'переход из «Авто» с несохранённой правкой не остановлен')
    t.ck(blocks() == ['car'] and pg.input_value('[data-ip-car="make"]') == 'Проверка 1', 'несохранённая правка «Авто» пропала при переходе: %s' % blocks())
    pg.click('[data-ip-block="car"] [data-ip-c-cancel]')
    t.ck(t.wait_until("() => document.querySelector('[data-ip-block=\"car\"] [data-ip-c-bar]').hidden"), '«Отменить» у «Авто» не спрятало его полосу')
    pg.click('.ip-jumps [data-ip-ptab="profile"]')
    t.wait_for('[data-ip-block="profile"] [data-ip-c="phone"]')
    for k in ('homeGps', 'tempGps'):
        t.ck(pg.locator('[data-ip-block="profile"] [data-ip-c="%s"]' % k).count() == 1, 'в «Личной карточке» нет поля %s' % k)
    pg.fill('[data-ip-block="profile"] [data-ip-c="phone"]', '+996 555 123 456')
    pg.dispatch_event('[data-ip-block="profile"] [data-ip-c="phone"]', 'input')
    t.ck(t.wait_until("() => !document.querySelector('[data-ip-block=\"profile\"] [data-ip-c-bar]').hidden"), 'правка «Личной карточки» не показала полосу сохранения')
    pg.click('[data-ip-block="profile"] [data-ip-c-cancel]')

    # «Все осмотрщики»: четыре вида, «Аналитика» — блоки и один выбор периода.
    t.open('#/inspections?s=people&t=summary', wait='.ip-allview')
    views = pg.eval_on_selector_all('.ip-allview [data-ip-atab]', 'els => els.map((e) => e.textContent.trim())')
    t.ck(views == ['Сводка', 'Таблица', 'Аналитика', 'Настройки'], 'виды «Всех осмотрщиков» не те: %s' % views)
    pg.click('.ip-allview [data-ip-atab="stats"]')
    t.wait_for('[data-ip-block="totals"]')
    got = pg.eval_on_selector_all('[data-ip-block]', 'els => els.map((e) => e.dataset.ipBlock)')
    t.ck(got == ['stats', 'totals', 'reports'], 'блоки «Аналитики» не те: %s' % got)
    t.ck(pg.locator('.ipc-sper').count() == 1, 'в «Аналитике» выбор периода не один: %d' % pg.locator('.ipc-sper').count())
    pg.click('.ip-allview [data-ip-atab="norms"]')
    t.wait_for('[data-ip-block="fields"]')
    t.ck(pg.eval_on_selector_all('[data-ip-block]', 'els => els.map((e) => e.dataset.ipBlock)') == ['norms', 'fields', 'reasons'], 'блоки «Настроек» не те')

    # Сетка: уход — анимацией (.anim-out), появление — анимацией (.anim-in).
    t.open('#/inspections?s=assign&t=queue', wait='.ip-board .ip-ld-b')
    if pg.locator('[data-ip-center="grid"][aria-pressed="false"]').count():
        pg.click('[data-ip-center="grid"]')
        t.wait_for('.ip-board')
    pg.evaluate("() => { window.__out = false; new MutationObserver(() => { const b = document.querySelector('.ip-board'); if (b && b.classList.contains('anim-out')) window.__out = true; })"
                ".observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] }); }")
    pg.click('[data-ip-center="map"]')
    t.ck(t.wait_until("() => window.__out === true"), 'сетка ушла без анимации ухода')
    t.ck(t.wait_until("() => !document.querySelector('.ip-board')"), 'сетка не ушла')
    pg.click('[data-ip-center="grid"]')
    t.ck(t.wait_until("() => { const b = document.querySelector('.ip-board'); return !!b && b.classList.contains('anim-in'); }"), 'сетка появилась без анимации появления')

    # Поля ввода и выбора при наведении не увеличиваются, кнопки — увеличиваются (пользователь 23.11.2026:
    # «Поля для ввода при наведении не увеличиваем»).
    t.open('#/inspections?s=assign&t=queue', wait='.ip-slice')
    sc = {}
    for name, sel in [('input', '.ip-topline .ip-jump .isearch input'), ('select', '.ip-slice .select'), ('btn', '.ip-slice [data-ip-mode="all"]')]:
        el = pg.locator(sel).first
        el.hover()
        t.wait_until("([s]) => { const e = document.querySelector(s); return !!e && !e.getAnimations().length; }", [sel])
        sc[name] = el.evaluate("(e) => getComputedStyle(e).scale")
    t.ck(sc['input'] in ('none', '1') and sc['select'] in ('none', '1'), 'поле ввода или выбора увеличивается при наведении: %s' % sc)
    t.ck(sc['btn'] not in ('none', '1'), 'кнопка не увеличивается при наведении: %s' % sc)
