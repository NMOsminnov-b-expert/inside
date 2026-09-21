# -*- coding: utf-8 -*-
"""Шапка карточки ОЦ: Г-образный блок и шкала статусов — во всех типах ОЦ.

Макет пользователя 21.09.2026 (канва «Шапка ОЦ: Г-образный блок»): сводка
записи, вкладки и шкала статусов — один блок; статусы как в рабочей системе,
переход кликом только на следующий шаг или в ветку. Сценарий держит то, что
легко сломать правкой:

  * вкладки стоят в шапке, отдельной полосы вкладок под ней нет;
  * в шкале девять шагов, текущий помечен aria-current="step" — ровно один;
  * нажать можно только доступный переход, остальные шаги — не кнопки;
  * переход идёт через подтверждение: «Отмена» статус не меняет;
  * из «Готов к оценке» доступна ветка «Не подлежит оценке», из ветки дальше
    идти некуда;
  * свёрнутая шкала — одна строка с текущим статусом и «N из 9», кнопка
    «Развернуть» стоит сразу за ней; выбор «свёрнута» переживает перезагрузку;
  * при прокрутке шапка закреплена, и шкала сжимается в одну строку сама;
  * новый статус виден в реестре;
  * шапка и шкала одинаковы во всех типах ОЦ: они живут в ядре
    (kernel/ocHead.js, kernel/status/*), а не в модуле. Раньше Г-образная
    шапка была только у гражданского, и режиму раскрытия просмотрщика в
    остальных типах нечего было сжимать.
"""

NAME = 'шапка ОЦ: статусы'

TOUCHES = (
    'app/kernel/ocHead.js', 'app/kernel/status/*', 'app/kernel/stickyHead.js',
    'app/kernel/cards.css', 'app/modules/*/card/ocCard.*',
    'app/modules/*/data/dictionaries.js', 'app/modules/civil/module.css',
    'app/modules/*/index.js', 'app/pages/ocMenu/table.js', 'app/pages/ocMenu/query.js',
)

OC = '#/oc/civil/oc-cv-1'

# Остальные типы ОЦ: шапка и шкала те же — проверяем состав, а не переходы
# (переходы меняют демо-запись, и хватает одного типа).
OTHERS = ('#/oc/apartment/oc-ap-1', '#/oc/residential-house/oc-rh-1',
          '#/oc/production/oc-pr-1', '#/oc/land-plot/oc-lp-1')

STATE = """() => {
  const full = document.querySelector('.st-full');
  const cur = [...document.querySelectorAll('.st-full [aria-current="step"]')];
  return {
    steps: document.querySelectorAll('.st-line > .st-item').length,
    cur: cur.map((e) => e.querySelector('.st-lbl').textContent.trim()),
    next: [...document.querySelectorAll('.st-full [data-status-go]')].map((b) => b.dataset.statusGo),
    buttons: document.querySelectorAll('.st-full button.st-step, .st-full button.st-branch').length,
    fullShown: !!full && full.offsetParent !== null,
    miniShown: !!document.querySelector('.st-mini') && document.querySelector('.st-mini').offsetParent !== null,
  };
}"""


def run(t):
    pg = t.page

    def state():
        return pg.evaluate(STATE)

    def go(to, ok=True):
        pg.click('.st-full [data-status-go="%s"]' % to)
        t.wait_for('[data-modal-ok]')
        pg.click('[data-modal-ok]' if ok else '[data-modal-cancel]')
        t.wait_until("() => !document.querySelector('[data-modal-ok]')")

    t.open(OC, wait='[data-status-flow]')

    # --- Г-образный блок --------------------------------------------------------
    tabs = pg.eval_on_selector_all('[data-oc-head] .oc-head-tabs [data-tab]',
                                   'els => els.map((e) => e.dataset.tab)')
    t.ck('general' in tabs and 'photo' in tabs, 'вкладок нет в шапке: %s' % tabs)
    t.ck(pg.locator('#content .tabs').count() == 0,
         'под шапкой осталась отдельная полоса вкладок')
    t.ck(pg.locator('[data-oc-head] .pill-status').count() == 0,
         'статус снова плашкой среди действий — его несёт шкала')

    # --- шкала ------------------------------------------------------------------
    s = state()
    t.ck(s['steps'] == 9, 'шагов в шкале не девять: %s' % s['steps'])
    t.ck(len(s['cur']) == 1, 'текущих шагов не один: %s' % s['cur'])
    start = s['cur'][0] if s['cur'] else ''
    t.ck(start == 'Удостоверен по документам', 'у записи-образца другой статус: %s' % start)
    t.ck(s['next'] == ['Направлен на осмотр'], 'доступные переходы не те: %s' % s['next'])
    t.ck(s['buttons'] == 1, 'кнопками стали недоступные шаги: %s' % s['buttons'])

    go('Направлен на осмотр', ok=False)
    t.ck(state()['cur'] == [start], 'отмена в подтверждении всё равно сменила статус')

    for to in ('Направлен на осмотр', 'Осмотрен', 'Удостоверен после осмотра', 'Готов к оценке'):
        go(to)
        t.wait_until("() => (document.querySelector('.st-full [aria-current=\"step\"] .st-lbl') || {})"
                     ".textContent === '%s'" % to)
    s = state()
    t.ck(sorted(s['next']) == ['В процессе оценки', 'Не подлежит оценке'],
         'из «Готов к оценке» нет следующего шага и ветки: %s' % s['next'])

    go('Не подлежит оценке')
    t.wait_until("() => !document.querySelector('.st-full [data-status-go]')")
    s = state()
    t.ck(s['cur'] == ['Не подлежит оценке'], 'ветка не стала текущей: %s' % s['cur'])
    t.ck(not s['next'], 'из ветки шкала ведёт дальше: %s' % s['next'])

    # --- свёрнутая шкала --------------------------------------------------------
    pg.click('.st-full [data-status-toggle]')
    t.wait_until("() => document.querySelector('.st-mini').offsetParent !== null")
    mini = pg.eval_on_selector('.st-mini', 'e => e.textContent.replace(/\\s+/g, " ")')
    t.ck('Не подлежит оценке' in mini and '6 из 9' in mini,
         'свёрнутая строка без статуса или счётчика: %s' % mini)
    # Кнопка разворота — сразу за содержимым строки, а не в дальнем углу через
    # пустую полосу (замечание пользователя 21.09.2026).
    gap = pg.evaluate("""() => {
      const btn = document.querySelector('.st-mini [data-status-toggle]');
      const prev = btn.previousElementSibling;
      return Math.round(btn.getBoundingClientRect().left - prev.getBoundingClientRect().right);
    }""")
    t.ck(gap <= 24, 'кнопка «Развернуть» оторвана от строки статуса: %s px' % gap)

    pg.reload()
    t.wait_for('[data-status-flow]')
    s = state()
    t.ck(s['miniShown'] and not s['fullShown'], 'свёрнутая шкала развернулась после перезагрузки')
    pg.click('.st-mini [data-status-toggle]')
    t.wait_until("() => document.querySelector('.st-full').offsetParent !== null")

    # --- прокрутка: шапка закреплена, шкала сжата --------------------------------
    pg.evaluate("document.querySelector('#content').scrollTop = 900")
    t.wait_until("() => document.querySelector('#content').classList.contains('scrolled')")
    s = state()
    t.ck(s['miniShown'] and not s['fullShown'], 'при прокрутке шкала не сжалась в строку')
    top = pg.evaluate("Math.round(document.querySelector('[data-oc-head]').getBoundingClientRect().top"
                      " - document.querySelector('#content').getBoundingClientRect().top)")
    t.ck(abs(top) <= 20, 'шапка не закреплена при прокрутке: %s px от верха' % top)

    # --- реестр -----------------------------------------------------------------
    t.open('', wait='.reg-thead')
    t.wait_until("() => [...document.querySelectorAll('.reg-status')].length > 0")
    shown = pg.eval_on_selector_all('.reg-status', 'els => els.map((e) => e.textContent.trim())')
    t.ck('Не подлежит оценке' in shown, 'в реестре не виден новый статус записи')

    # --- та же шапка в остальных типах ОЦ ---------------------------------------
    for route in OTHERS:
        t.open(route, wait='[data-status-flow]')
        kind = route.split('/')[2]

        head = pg.eval_on_selector_all('[data-oc-head] .oc-head-tabs [data-tab]',
                                       'els => els.map((e) => e.dataset.tab)')
        t.ck('general' in head and 'photo' in head,
             '%s: вкладки не в шапке ОЦ: %s' % (kind, head))
        t.ck(pg.locator('.tabs [data-tab]').count() == 0,
             '%s: под шапкой осталась отдельная полоса вкладок' % kind)

        st = state()
        t.ck(st['steps'] == 9, '%s: шагов в шкале не 9: %d' % (kind, st['steps']))
        t.ck(len(st['cur']) == 1, '%s: текущих шагов не один: %s' % (kind, st['cur']))
        t.ck(st['buttons'] == len(st['next']),
             '%s: кнопками должны быть только доступные переходы: %d при %s'
             % (kind, st['buttons'], st['next']))
        t.ck(pg.locator('.pill-status').count() == 0,
             '%s: статус остался плашкой среди действий' % kind)
