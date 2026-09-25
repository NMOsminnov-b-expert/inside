# -*- coding: utf-8 -*-
"""Гражданское здание: сводная «Капитальность и классы» в карточке ОЦ.

Методология «Категории и классы зданий», решения пользователя 25.09.2026:
сводная — блок карточки ОЦ под перечнем ОИ; строка — литера или каждая зона
литеры; прочие постройки — тип «Прочие», К = 0,05; состояние — шкала
методологии из 9 градаций с рангом 5…1, у зоны своё.

Сценарий держит:
  * строки: литеры-строения и зоны литеры с площадью по внутреннему обмеру,
    К, классом, площадью × К, состоянием и площадью × состояние × К;
  * итог: площади суммой, К — средневзвешенный по площади строк с классом;
  * площади по классам — как итоговая матрица методологии;
  * у прочей постройки К = 0,05 и группа «Прочие»;
  * перечень состояния — 9 градаций; прежние «Плохое» и «Аварийное»
    переводятся при загрузке в «Требует ремонта» и «Неудовлетворительное».
"""

NAME = 'сводная по капитальности'

TOUCHES = (
    'app/modules/civil/card/capSummary.view.js', 'app/modules/civil/card/ocCard.view.js',
    'app/modules/civil/oi/building/*', 'app/modules/civil/data/dictionaries.js', 'app/modules/civil/module.css',
)

OC = '#/oc/civil/oc-cv-1'

ROWS = """() => [...document.querySelectorAll('#q-capsum tbody tr')].map((tr) =>
  [...tr.querySelectorAll('td')].map((td) => td.textContent.replace(/\\s+/g, ' ').trim()))"""
FOOT = """() => [...document.querySelectorAll('#q-capsum tfoot td')].map((td) => td.textContent.replace(/\\s+/g, ' ').trim())"""
MATRIX = """() => Object.fromEntries([...document.querySelectorAll('#q-capsum .cs-matrix th')].map((th, i) =>
  [th.textContent.trim(), document.querySelectorAll('#q-capsum .cs-matrix tbody td')[i].textContent.trim()]))"""


def num(s):
    return float(s.replace(' ', '').replace(' ', '').replace(',', '.'))


def run(t):
    pg = t.page
    pg.set_viewport_size({'width': 1600, 'height': 1000})
    # прежнее состояние в данных — должно перевестись при загрузке
    t.open(OC, wait='#q-capsum')
    pg.evaluate("""async () => { const m = await import('/app/modules/civil/data/store.js');
      const rec = m.getRecord('oc-cv-1'); const b = rec.oi.find((o) => o.letter === 'Б');
      b.conditionTotal = 'Аварийное'; const a = rec.oi.find((o) => o.letter === 'А'); a.conditionTotal = 'Плохое'; }""")
    pg.goto(pg.url.split('#')[0] + '#/')
    t.open(OC, wait='#q-capsum')
    rows = pg.evaluate(ROWS)
    byLit = {r[0].split(' ')[0]: r for r in rows if r and r[0]}
    t.ck('Требует ремонта · 2' in byLit.get('А', [''] * 9)[7], '«Плохое» не перевелось: %r' % byLit.get('А'))
    t.ck('Неудовлетворительное · 1' in byLit.get('Б', [''] * 9)[7], '«Аварийное» не перевелось: %r' % byLit.get('Б'))

    # --- строки литер: площадь, К, класс, площадь × К -----------------------------
    a = byLit['А']
    t.ck(a[4] not in ('', '—') and 'класс' in a[5], 'у литеры А нет К или класса: %r' % a)
    t.ck(abs(num(a[3]) * num(a[4]) - num(a[6])) < 0.02 * num(a[3]), 'площадь × К у литеры А не сходится: %r' % a)

    # --- итог: площади суммой, К средневзвешенный -----------------------------------
    foot = pg.evaluate(FOOT)
    done = [r for r in rows if r[4] not in ('', '—') and r[3] not in ('', '—')]
    s_area = sum(num(r[3]) for r in rows if r[3] not in ('', '—'))
    s_ak = sum(num(r[6]) for r in done)
    t.ck(abs(num(foot[1]) - s_area) < 0.05, 'итог площади не сумма строк: %s против %s' % (foot[1], s_area))
    t.ck(abs(num(foot[4]) - s_ak) < 0.05, 'итог площади × К не сумма строк: %s против %s' % (foot[4], s_ak))
    w = s_ak / sum(num(r[3]) for r in done)
    t.ck(abs(num(foot[2]) - w) < 0.011, 'итоговый К не средневзвешенный: %s против %.3f' % (foot[2], w))

    # --- площади по классам -----------------------------------------------------------
    mx = pg.evaluate(MATRIX)
    t.ck(sum(num(v) for v in mx.values() if v) > 0, 'площади по классам пусты: %s' % mx)

    # --- прочая постройка: К = 0,05, группа «Прочие» ----------------------------------
    pg.evaluate("""async () => { const m = await import('/app/modules/civil/data/store.js');
      const rec = m.getRecord('oc-cv-1'); const b = rec.oi.find((o) => o.letter === 'Б');
      b.litKind = 'other'; b.areas = { ...(b.areas || {}), build: '50' }; }""")
    pg.goto(pg.url.split('#')[0] + '#/')
    t.open(OC, wait='#q-capsum')
    b = {r[0].split(' ')[0]: r for r in pg.evaluate(ROWS) if r and r[0]}['Б']
    t.ck(b[4] == '0,05' and b[5] == 'Прочие', 'у прочей постройки не К = 0,05 / «Прочие»: %r' % b)
    t.ck(pg.evaluate(MATRIX).get('Прочие') == '50,00', 'площадь прочих не в своей колонке: %s' % pg.evaluate(MATRIX))

    # --- шкала состояния в карточке литеры -----------------------------------------------
    pg.locator('#q-capsum [data-open-oi]').first.click()
    t.wait_for('[data-condition="conditionTotal"]')
    opts = pg.eval_on_selector_all('[data-condition="conditionTotal"] option', 'os => os.map((o) => o.textContent)')
    t.ck(len(opts) == 10 and 'Отличное / хорошее' in opts and 'Требует капитального ремонта' in opts,
         'перечень состояния не шкала методологии: %s' % opts)
