# -*- coding: utf-8 -*-
"""Перерисовка карточки сверкой дерева, а не заменой.

Решение пользователя 26.10.2026 «Решай проблемы перерисовки» (вопрос графа
pererisovka-ekrana-pri-izmenenii): карточки ОЦ и ОИ перерисовываются через
kernel/morph.js — существующее дерево приводится к новой разметке. Сценарий
ловит:

  * возврат к замене целиком: после «+ Добавить строку» поле, в котором
    стоял курсор, — другой узел, фокус и каретка потеряны (так было до
    26.10.2026: литера пересобирала ~1800 узлов на каждый щелчок);
  * обработчики, накопленные на уцелевших узлах: экраны навешивают их после
    каждой отрисовки, и без снятия перед сверкой один щелчок срабатывал бы
    столько раз, сколько было перерисовок (кнопка добавляла бы несколько
    строк);
  * свои выпадающие списки после сверки: кнопка списка одна, селект под ней
    тот же узел и со своим значением;
  * выключатель localStorage «inside.morph» = «off» возвращает прежнюю замену.
"""

NAME = 'перерисовка сверкой'

TOUCHES = (
    'app/kernel/morph.js', 'app/kernel/scope.js', 'app/kernel/boot.js', 'app/kernel/dropdown.js',
    'app/vendor/idiomorph/*',
)

LITERA = '#/oc/civil/oc-cv-1/oi/oi-cv1-a'

# Поставить курсор в первое видимое текстовое поле, запомнить его и число строк.
ARM = """() => {
  const root = document.querySelector('#content');
  const inp = [...root.querySelectorAll('input.input, input[type=text]')]
    .find((i) => i.offsetParent && !i.disabled && !i.readOnly && i.value.length > 1);
  if (!inp) return null;
  inp.focus();
  inp.setSelectionRange(1, 1);
  window.__redrawInput = inp;
  window.__redrawSelect = root.querySelector('select.pick-native');
  return root.querySelectorAll('tr').length;
}"""

ADD = """() => [...document.querySelectorAll('#content button')]
  .find((b) => b.textContent.trim() === '+ Добавить строку').click()"""

ROWS = "() => document.querySelectorAll('#content tr').length"


def run(t):
    pg = t.page
    t.open(LITERA)
    t.ck(t.wait_until("() => [...document.querySelectorAll('#content button')].some((b) => b.textContent.trim() === '+ Добавить строку')"),
         'в литере нет кнопки «+ Добавить строку»')

    rows0 = pg.evaluate(ARM)
    t.ck(rows0 is not None, 'в литере нет заполненного текстового поля для проверки фокуса')
    if rows0 is None:
        return

    # Один щелчок — на сколько строк выросла таблица (у строки может быть
    # больше одного tr).
    pg.evaluate(ADD)
    t.ck(t.wait_until('(n) => document.querySelectorAll("#content tr").length > n', rows0), 'строка не добавилась')
    t.wait(300)
    step = pg.evaluate(ROWS) - rows0

    state = pg.evaluate("""() => ({
      alive: window.__redrawInput.isConnected,
      focus: document.activeElement === window.__redrawInput,
      caret: window.__redrawInput.selectionStart,
    })""")
    t.ck(state['alive'], 'поле заменено новым узлом — карточка снова перерисовывается целиком')
    t.ck(state['focus'], 'после «+ Добавить строку» поле потеряло фокус')
    t.ck(state['caret'] == 1, 'каретка не на месте: %r' % state['caret'])

    # Ещё три перерисовки — и каждый щелчок добавляет одну строку, не больше:
    # обработчики не копятся на уцелевших узлах (с ними k-й щелчок добавлял бы
    # k строк). Первый щелчок может дать на tr больше — с первой строкой
    # появляется итоговая, поэтому сравниваются щелчки со второго.
    grows = []
    for i in range(3):
        before = pg.evaluate(ROWS)
        pg.evaluate(ADD)
        t.wait_until('(n) => document.querySelectorAll("#content tr").length > n', before)
        t.wait(300)
        grows.append(pg.evaluate(ROWS) - before)
    t.ck(len(set(grows)) == 1 and 1 <= grows[0] <= step,
         'щелчки после перерисовок добавили %r tr (первый — %d): обработчик срабатывает не один раз' % (grows, step))

    # Обработчики на узлах экрана — счётом браузера (CDP, всё поддерево
    # #content). Перерисовка добавляет обработчики новой строки, но не
    # удваивает весь экран: без снятия перед сверкой (kernel/morph.js, freshen)
    # каждая перерисовка прибавляла бы столько, сколько их уже на экране.
    cdp = pg.context.new_cdp_session(pg)

    def listeners():
        obj = cdp.send('Runtime.evaluate', {'expression': "document.querySelector('#content')"})['result']['objectId']
        return len(cdp.send('DOMDebugger.getEventListeners', {'objectId': obj, 'depth': -1})['listeners'])

    base = listeners()
    for _ in range(3):
        before = pg.evaluate(ROWS)
        pg.evaluate(ADD)
        t.wait_until('(n) => document.querySelectorAll("#content tr").length > n', before)
        t.wait(300)
    after = listeners()
    t.ck(after - base < base * 0.3,
         'обработчиков на экране было %d, после трёх перерисовок — %d: копятся на уцелевших узлах' % (base, after))
    cdp.detach()

    sel = pg.evaluate("""() => {
      const s = window.__redrawSelect;
      if (!s) return null;
      const wrap = s.parentNode;
      return { alive: s.isConnected, wrapped: wrap.classList.contains('pick'),
               buttons: wrap.querySelectorAll('[data-pick-btn]').length,
               nested: !!wrap.parentNode.closest('span.pick') };
    }""")
    if sel is not None:
        t.ck(sel['alive'], 'селект своего списка заменён новым узлом')
        t.ck(sel['wrapped'] and sel['buttons'] == 1, 'у своего списка после сверки не одна кнопка: %r' % sel)
        t.ck(not sel['nested'], 'свой список обёрнут дважды')

    # Выключатель — прежняя замена целиком.
    pg.evaluate("() => localStorage.setItem('inside.morph', 'off')")
    try:
        t.open(LITERA)
        t.wait_until("() => [...document.querySelectorAll('#content button')].some((b) => b.textContent.trim() === '+ Добавить строку')")
        rows = pg.evaluate(ARM)
        pg.evaluate(ADD)
        t.wait_until('(n) => document.querySelectorAll("#content tr").length > n', rows)
        t.wait(300)
        t.ck(not pg.evaluate('() => window.__redrawInput.isConnected'),
             'выключатель inside.morph=off не вернул замену целиком')
    finally:
        pg.evaluate("() => localStorage.removeItem('inside.morph')")
