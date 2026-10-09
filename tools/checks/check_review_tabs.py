# -*- coding: utf-8 -*-
"""Две вкладки: правки синхронизируются, а не затирают друг друга.

Решение пользователя 09.10.2026 по код-ревью: «Изменения синхронизируем».
Прежде каждая вкладка держала свой снимок и при любом действии переписывала
хранилище целиком (kernel/persist.js).

Что ловит сценарий (две страницы одного браузера — общее хранилище):
  * правка во вкладке A не доходит до вкладки B;
  * сохранение во вкладке B (открытой раньше правки A) стирает правку A — и в
    хранилище, и после перезагрузки.
"""
NAME = 'две вкладки'

TOUCHES = ('app/kernel/persist.js',)

SET = """async ([id, name]) => {
  const s = await import('./app/modules/civil/data/store.js');
  s.getRecord(id).name = name;
  (await import('./app/kernel/persist.js')).saveNow();
}"""
GET = """async (id) => (await import('./app/modules/civil/data/store.js')).getRecord(id).name"""


def run(t):
    a = t.page
    t.open('', wait='.reg-tr')
    # Вторая вкладка — окном из первой: у стенда проверок одна страница без
    # своего контекста, а хранилище у окна то же.
    with a.expect_popup() as pop:
        a.evaluate("() => { window.open(location.href, '_blank'); }")
    b = pop.value
    b.wait_for_selector('.reg-tr')

    a.evaluate(SET, ['oc-cv-1', 'Правка из A'])
    ok = False
    for _ in range(30):
        if b.evaluate(GET, 'oc-cv-1') == 'Правка из A':
            ok = True
            break
        b.wait_for_timeout(100)
    t.ck(ok, 'правка вкладки A не дошла до вкладки B')

    b.evaluate(SET, ['oc-cv-2', 'Правка из B'])
    a.wait_for_timeout(300)
    t.ck(a.evaluate(GET, 'oc-cv-2') == 'Правка из B', 'правка вкладки B не дошла до вкладки A')

    a.reload()
    a.wait_for_selector('.reg-tr')
    t.ck(a.evaluate(GET, 'oc-cv-1') == 'Правка из A', 'сохранение вкладки B стёрло правку вкладки A')
    t.ck(a.evaluate(GET, 'oc-cv-2') == 'Правка из B', 'правка вкладки B пропала после перезагрузки')
    b.close()
