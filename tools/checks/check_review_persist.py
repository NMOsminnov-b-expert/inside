# -*- coding: utf-8 -*-
"""Сохранение данных: исправления по код-ревью 09.10.2026.

docs/kod-revyu.xlsx, очередь 1 (kernel/persist.js). Что ловит сценарий:
  * правка без щелчка и ввода после неё — документ, прикреплённый через окно
    выбора файла (поле выбора живёт вне документа, его change до persist не
    доходил), — пропадает после перезагрузки;
  * все записи типа удалены — после перезагрузки демо-записи возвращаются
    (restore оставлял засев при пустом списке);
  * испорченный снимок в браузере молча стирается первым щелчком — нет ни
    предупреждения, ни отложенной копии.
"""
from check_civil_viewer_docs import _pdf

NAME = 'сохранение: ревью'

TOUCHES = ('app/kernel/persist.js', 'app/kernel/scope.js', 'app/kernel/boot.js',
           'app/modules/apartment/data/store.js', 'app/modules/civil/data/store.js')

KEY = 'inside:data:v1'


def run(t):
    pg = t.page

    # --- документ через окно выбора файла: без щелчков после — и F5 -------------
    t.open('#/oc/civil/oc-cv-1', wait='.viewer')
    with pg.expect_file_chooser() as fc:
        pg.locator('.vdrop-card [data-vattach]').click()
    fc.value.set_files([{'name': 'Без щелчка.pdf', 'mimeType': 'application/pdf', 'buffer': _pdf(1, 'X')}])
    t.wait_for('[data-att-ok]')
    # Подтверждение — клавишей: щелчок по кнопке сам запустил бы сохранение.
    pg.focus('[data-att-ok]')
    pg.keyboard.press('Enter')
    t.wait_until("() => !!document.querySelector('.vtab.active[title*=\"Без щелчка\"]')", timeout=15000)
    pg.wait_for_timeout(900)
    pg.reload()
    t.wait_for('.viewer')
    names = pg.evaluate("""async () => { const s = await import('./app/modules/civil/data/store.js');
      return (s.getRecord('oc-cv-1').docs || []).map((d) => d.name); }""")
    t.ck(any('Без щелчка' in n for n in names), 'документ, прикреплённый без щелчка после, пропал после F5: %s' % names)

    # --- все записи типа удалены — демо-записи не возвращаются -------------------
    t.open('', wait='.reg-tr')
    pg.evaluate("""async () => {
      const s = await import('./app/modules/apartment/data/store.js');
      s.records.splice(0, s.records.length);
      (await import('./app/kernel/persist.js')).saveNow();
    }""")
    pg.reload()
    t.wait_for('.reg-tr')
    left = pg.evaluate("""async () => (await import('./app/modules/apartment/data/store.js')).records.length""")
    t.ck(left == 0, 'удалённые демо-записи квартир вернулись после F5: %d' % left)

    # --- испорченный снимок — откладывается и предупреждение ------------------------
    # До запуска страницы: при уходе со страницы снимок теперь сохраняется
    # всегда и затёр бы порчу, положенную заранее.
    pg.add_init_script("localStorage.setItem('%s', '{испорчено')" % KEY)
    pg.reload()
    t.wait_for('.reg-tr')
    t.ck(t.wait_until("() => [...document.querySelectorAll('.toast, [class*=toast]')].some((x) => x.textContent.includes('не прочитаны'))"),
         'о нечитаемом снимке не предупредили')
    kept = pg.evaluate("(k) => Object.keys(localStorage).filter((x) => x.startsWith(k + ':broken:')).map((x) => localStorage.getItem(x))", KEY)
    t.ck('{испорчено' in kept, 'нечитаемый снимок не отложен: %s' % kept)
