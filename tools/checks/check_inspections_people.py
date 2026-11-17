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
    t.open('#/inspections?s=people&p=%s&t=trips' % quote(WHO), wait='[data-ip-block="profile"]')
    t.ck(pg.locator('.ip-subisle, .ip-subtabs').count() == 0, 'над карточкой снова ряд вкладок')
    blocks = pg.eval_on_selector_all('[data-ip-block]', 'els => els.map((e) => e.dataset.ipBlock)')
    t.ck(blocks == ['trips', 'plan', 'assigns', 'reports', 'stats', 'profile', 'car'], 'блоки карточки не те: %s' % blocks)
    t.ck(pg.locator('.ipc-sper').count() == 1, 'в карточке выбор периода не один: %d' % pg.locator('.ipc-sper').count())

    # Оглавление — прокрутка тела карточки, страница на месте.
    head_y = pg.evaluate("() => document.querySelector('.ip-card-head').getBoundingClientRect().top")
    pg.click('.ip-jumps [data-ip-ptab="profile"]')
    t.ck(t.wait_until("() => { const b = document.querySelector('[data-ip-block=\"profile\"]'); const c = b.closest('.ip-card-body');"
                      " return Math.abs(b.getBoundingClientRect().top - c.getBoundingClientRect().top) < 40; }"), 'оглавление не прокрутило к «Профилю»')
    t.ck(abs(pg.evaluate("() => document.querySelector('.ip-card-head').getBoundingClientRect().top") - head_y) < 2, 'оглавление сдвинуло страницу: шапка карточки уехала')

    # Профиль и «Авто» — свои черновики.
    pg.fill('[data-ip-block="car"] [data-ip-car="make"]', 'Проверка 1')
    pg.dispatch_event('[data-ip-block="car"] [data-ip-car="make"]', 'input')
    t.ck(t.wait_until("() => !document.querySelector('[data-ip-block=\"car\"] [data-ip-c-bar]').hidden"), 'правка «Авто» не показала его полосу сохранения')
    t.ck(pg.locator('[data-ip-block="profile"] [data-ip-c-bar]').is_hidden(), 'правка «Авто» показала полосу сохранения профиля')
    pg.fill('[data-ip-block="profile"] [data-ip-c="phone"]', '+996 555 123 456')
    pg.dispatch_event('[data-ip-block="profile"] [data-ip-c="phone"]', 'input')
    pg.click('[data-ip-block="car"] [data-ip-c-cancel]')
    t.ck(t.wait_until("() => document.querySelector('[data-ip-block=\"car\"] [data-ip-c-bar]').hidden"), '«Отменить» у «Авто» не спрятало его полосу')
    t.ck(t.wait_until("() => { const b = document.querySelector('[data-ip-block=\"profile\"] [data-ip-c-bar]'); const i = document.querySelector('[data-ip-c=\"phone\"]');"
                      " return !b.hidden && i.value === '+996 555 123 456'; }"), '«Отменить» у «Авто» сняло черновик профиля')
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
    t.ck(pg.eval_on_selector_all('[data-ip-block]', 'els => els.map((e) => e.dataset.ipBlock)') == ['norms', 'fields'], 'блоки «Настроек» не те')

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
