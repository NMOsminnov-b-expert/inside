# -*- coding: utf-8 -*-
"""Гражданское здание: вкладка «Сравнительный подход».

Методология «Категории и классы зданий», итоговая расчётная таблица
сравнительного подхода (цель пользователя 25.09.2026 «действуй по
методологии»). Сценарий повторяет числовой пример методологии для аналога 1 и
держит:
  * цена за м²: 1 800 000 $ × курс 87,45 / 1 870 м² = 84 176 сом/м²;
  * цепочка корректировок с промежуточной стоимостью после каждой: условия
    продажи 0,95 → 79 968, …, состояние (авто, объект «отличное», аналог
    «хорошее») 1,15 → 102 491, …, ж/д ветка 1,10 → 87 505 сом/м² = 1 001 $/м²;
  * аналог в состоянии «требует капитального ремонта» — поправка
    недопустима, аналог исключён из среднего;
  * результат — среднее годных аналогов × площадь построек объекта из блока
    «Капитальность и классы»;
  * площади объекта по классам — из сводной; расчёт переживает перезагрузку.
"""

NAME = 'сравнительный подход'

# Вкладка спрятана (решение пользователя 25.09.2026: «элемент под огромным
# вопросом… не лезем внутрь без прямых указаний»). Сценарий не удалён — он
# понадобится, если вкладку вернут; до тех пор не запускается.
DISABLED = 'вкладка «Сравнительный подход» спрятана до прямого указания пользователя'

TOUCHES = (
    'app/modules/civil/card/comparative.*', 'app/modules/civil/card/capSummary.view.js',
    'app/modules/civil/data/conditionScale.js', 'app/modules/civil/card/ocCard.*', 'app/modules/civil/module.css',
)

OC = '#/oc/civil/oc-cv-1'


def run(t):
    pg = t.page
    pg.set_viewport_size({'width': 1600, 'height': 1000})
    t.open(OC, wait='[data-tab="comparative"]')
    pg.click('[data-tab="comparative"]')
    t.wait_for('#q-comparative')
    t.ck(pg.locator('.viewer').count() == 0, 'на вкладке расчёта открыт просмотрщик')

    def fill(sel, v):
        pg.fill(sel, v)
        pg.press(sel, 'Tab')

    fill('[data-cp-rate]', '87,45')
    pg.select_option('[data-cp="obj|condition"]', 'Отличное')
    pg.click('[data-cp-add]')
    t.wait_for('[data-cp-del]')
    pg.click('[data-cp-add]')
    t.wait_until("() => document.querySelectorAll('[data-cp-del]').length === 2")
    a, b = pg.eval_on_selector_all('[data-cp-del]', 'els => els.map((e) => e.dataset.cpDel)')

    fill('[data-cp-class="%s|prod-4"]' % a, '1760')
    fill('[data-cp-class="%s|admin-4"]' % a, '110')
    fill('[data-cp="%s|priceUsd"]' % a, '1800000')
    pg.select_option('[data-cp="%s|condition"]' % a, 'Хорошее')
    for k, v in [('sale', '0,95'), ('location', '0,92'), ('locationSpec', '1,10'), ('landShape', '0,98'),
                 ('capital', '1,12'), ('servitudes', '0,98'), ('landArea', '0,90'), ('size', '0,88'), ('railway', '1,10')]:
        fill('[data-cp-corr="%s|%s"]' % (a, k), v)
    out = lambda key: ' '.join(pg.inner_text('[data-cp-out="%s"]' % key).split())
    t.ck(out('%s|area' % a) == '1 870,00', 'площадь аналога не сумма по классам: %r' % out('%s|area' % a))
    t.ck(out('%s|m2som' % a) == '84 176', 'стоимость 1 м² не 84 176: %r' % out('%s|m2som' % a))
    t.ck(out('%s|v:sale' % a) == '79 968', 'после условий продажи не 79 968: %r' % out('%s|v:sale' % a))
    t.ck(out('%s|k:condition' % a) == '1,15' and out('%s|v:condition' % a) == '102 491',
         'поправка на состояние: %r → %r' % (out('%s|k:condition' % a), out('%s|v:condition' % a)))
    t.ck(out('%s|v:railway' % a) == '87 505', 'после ж/д ветки не 87 505: %r' % out('%s|v:railway' % a))
    t.ck(out('%s|final' % a) == '1 001', 'итог аналога не 1 001 $/м²: %r' % out('%s|final' % a))

    # --- аналог в недопустимом состоянии исключён -----------------------------------
    fill('[data-cp-class="%s|prod-3"]' % b, '3000')
    fill('[data-cp="%s|priceUsd"]' % b, '2000000')
    pg.select_option('[data-cp="%s|condition"]' % b, 'Требует капитального ремонта')
    t.wait_until("(b) => document.querySelector(`[data-cp-out=\"${b}|state\"]`).textContent.includes('исключён')", b)
    t.ck('bad' in pg.get_attribute('[data-cp-out="%s|k:condition"]' % b, 'class'), 'недопустимая поправка не выделена')
    t.ck(out('res|used') == 'по 1 из 2 аналогов', 'исключённый аналог вошёл в среднее: %r' % out('res|used'))
    t.ck(out('res|m2som') == '87 505' and out('res|m2usd') == '1 001', 'результат за м² не по годному аналогу')
    area = out('obj|area')
    t.ck(area not in ('', '—'), 'у объекта нет площади построек из сводной')

    # --- переживает перезагрузку ----------------------------------------------------------
    pg.wait_for_timeout(600)
    pg.reload()
    t.wait_for('#q-comparative')
    t.ck(pg.locator('[data-cp-del]').count() == 2, 'аналоги не пережили перезагрузку')
    t.ck(out('%s|final' % a) == '1 001', 'после перезагрузки итог аналога изменился: %r' % out('%s|final' % a))
