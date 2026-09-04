# -*- coding: utf-8 -*-
"""Перенос литеры между участками и открепление.

Пользователь 2026-09-02: «Сейчас всё переносится в узкую полоску снизу участка.
Надо откреплять при переносе в любое место вне карточки ЗУ. Хоть в просмотрщик,
хоть куда». До правки целью считался ближайший узел сверху, и откреплением была
полоса под последним узлом — замер показывал её высоту в 12 пикселей.
"""
NAME = 'перенос литер'

# Перетаскивание эмулируется событиями: настоящий HTML5 drag&drop через мышь
# Playwright не воспроизводит.
DRAG = """([oiId, sel, dy]) => {
  const row = document.querySelector('[data-drag-oi="' + oiId + '"]');
  const target = document.querySelector(sel);
  if (!row || !target) return {err: 'нет элемента: ' + sel};

  const dt = new DataTransfer();
  const box = target.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = dy === null ? box.top + box.height / 2 : box.top + dy;

  const fire = (el, type) => {
    const ev = new DragEvent(type, {bubbles: true, cancelable: true, dataTransfer: dt,
      clientX: x, clientY: y});
    el.dispatchEvent(ev);
    return ev;
  };

  fire(row, 'dragstart');
  fire(target, 'dragover');
  const hint = document.querySelector('[data-oi-drag-hint]');
  const hintText = hint && hint.classList.contains('on') ? hint.textContent : null;
  fire(target, 'drop');
  return {hintText: hintText};
}"""


def _land_of(pg, oi_id):
    return pg.evaluate("""(id) => {
      const row = document.querySelector('[data-drag-oi="' + id + '"]');
      const node = row ? row.closest('[data-oi-drop]') : null;
      return node ? (node.dataset.oiDrop || '') : null;
    }""", oi_id)


def _confirm(pg, wait=None):
    """Подтвердить модалку переноса, если она появилась."""
    dlg = pg.locator('.modal-head')
    if not dlg.count():
        return None
    title = dlg.first.inner_text().strip()
    pg.locator('.modal-foot .btn-primary, [data-modal-ok]').first.click()
    # Паузу передаёт вызывающий: масштабирование пауз живёт в t.wait, а сюда
    # приходит только страница.
    (wait or (lambda ms: pg.wait_for_timeout(ms)))(700)
    return title


def run(t):
    pg = t.page
    t.open('#/oc/civil/oc-cv-1')

    letter = 'oi-cv1-a'
    land_node = pg.evaluate("""() => {
      const n = [...document.querySelectorAll('[data-oi-drop]')].find((x) => x.dataset.oiDrop);
      return n ? n.dataset.oiDrop : null;
    }""")
    if not t.ck(bool(land_node), 'в перечне нет ни одного участка'):
        return

    # --- 1. привязка: бросок на узел участка ---
    res = pg.evaluate(DRAG, [letter, '[data-oi-drop] .acc-head', None])
    t.wait(400)
    t.ck(res.get('hintText') and 'привяжется' in res['hintText'],
         'подсказка при наведении на участок неверна: %r' % res.get('hintText'))
    title = _confirm(pg, t.wait)
    t.ck(title == 'Перенос литеры', 'перенос на участок не спросил подтверждения: %r' % title)
    t.ck(_land_of(pg, letter) == land_node, 'литера не привязалась к участку')

    # --- 2. открепление: бросок в просмотрщик ---
    res = pg.evaluate(DRAG, [letter, '.viewer', 80])
    t.wait(400)
    t.ck(res.get('hintText') and 'открепится' in res['hintText'],
         'подсказка при броске в просмотрщик неверна: %r' % res.get('hintText'))
    title = _confirm(pg, t.wait)
    t.ck(title == 'Открепить литеру', 'бросок в просмотрщик не открепил литеру: %r' % title)
    t.ck(_land_of(pg, letter) == '', 'литера осталась привязанной после броска в просмотрщик')

    # --- 3. открепление броском в другие места вне перечня ---
    for name, sel in (('шапка объекта', '.head-meta'),
                      ('карточка «Учреждение…»', '.card.t-slate'),
                      ('боковое меню', '.sidebar')):
        pg.evaluate(DRAG, [letter, '[data-oi-drop] .acc-head', None])
        t.wait(300)
        _confirm(pg, t.wait)
        t.ck(_land_of(pg, letter) == land_node, '%s: подготовка — литера не привязалась' % name)

        pg.evaluate(DRAG, [letter, sel, None])
        t.wait(300)
        title = _confirm(pg, t.wait)
        t.ck(title == 'Открепить литеру', '%s: бросок не предложил открепление (%r)' % (name, title))
        t.ck(_land_of(pg, letter) == '', '%s: литера осталась привязанной' % name)

    # --- 4. промежуток внутри перечня, но мимо участка — тоже открепление ---
    pg.evaluate(DRAG, [letter, '[data-oi-drop] .acc-head', None])
    t.wait(300)
    _confirm(pg, t.wait)

    gap = pg.evaluate("""() => {
      const nodes = [...document.querySelectorAll('[data-oi-drop]')];
      if (nodes.length < 2) return null;
      const a = nodes[0].getBoundingClientRect();
      const b = nodes[1].getBoundingClientRect();
      return b.top - a.bottom;
    }""")
    if gap and gap > 4:
        res = pg.evaluate("""([oiId]) => {
          const row = document.querySelector('[data-drag-oi="' + oiId + '"]');
          const nodes = [...document.querySelectorAll('[data-oi-drop]')];
          const a = nodes[0].getBoundingClientRect();
          const b = nodes[1].getBoundingClientRect();
          const box = document.querySelector('[data-oi-cols-box]');
          const dt = new DataTransfer();
          const y = (a.bottom + b.top) / 2;
          const x = a.left + a.width / 2;
          const fire = (el, type) => {
            const ev = new DragEvent(type, {bubbles: true, cancelable: true, dataTransfer: dt,
              clientX: x, clientY: y});
            el.dispatchEvent(ev);
          };
          fire(row, 'dragstart');
          fire(box, 'dragover');
          const hint = document.querySelector('[data-oi-drag-hint]');
          const hintText = hint && hint.classList.contains('on') ? hint.textContent : null;
          fire(box, 'drop');
          return {hintText};
        }""", [letter])
        t.wait(300)
        title = _confirm(pg, t.wait)
        t.ck(title == 'Открепить литеру',
             'промежуток между участками по-прежнему привязывает к соседу сверху (%r)' % title)
        t.ck(_land_of(pg, letter) == '', 'литера осталась привязанной после броска в промежуток')

    # --- 5. подсказка исчезает после броска ---
    visible = pg.evaluate("""() => {
      const el = document.querySelector('[data-oi-drag-hint]');
      return el ? el.classList.contains('on') : false;
    }""")
    t.ck(not visible, 'подсказка перетаскивания осталась на экране после броска')
