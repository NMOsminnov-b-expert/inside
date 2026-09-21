# -*- coding: utf-8 -*-
"""Карточка ОЦ «Транспортные средства»: блок «Учреждение, собственники и
ответственные».

Блок — копия блока 01 карточки гражданского здания без пользователей (задача
пользователя 21.09.2026). Сценарий держит то, что легко сломать правкой:

  * блок стоит первым и называется так же, как у гражданского здания;
  * пользователей в нём нет — ни раздела, ни кнопки добавления;
  * учреждение и подвед выбираются из дерева учреждений и пишутся в запись;
    после смены учреждения подвед чужой ветки сбрасывается;
  * собственник добавляется на месте, фокус встаёт в новую строку, доля
    дробью считается в сумме («1/2» → 50%);
  * ответственные пишутся в запись, а у новой карточки стоит «Не назначен» —
    иначе список показывал бы первого сотрудника, хотя никто не назначен.
"""

NAME = 'карточка ОЦ ТС: стороны'

TOUCHES = (
    'app/modules/vehicle/*', 'app/modules/vehicle/data/dictionaries.js',
    'app/kernel/pickSearch.js', 'app/kernel/institutions.js',
)

REC = """async () => {
  const m = await import('/app/modules/vehicle/records.js');
  const r = m.allRecords()[0];
  return { inst: r.institution, podved: r.podved, owners: r.owners, resp: r.resp };
}"""


def run(t):
    pg = t.page

    t.open('', wait='[data-create="vehicle"]')
    pg.locator('.dd [data-dd-toggle]').filter(has_text='Создать ОЦ').click()
    pg.click('[data-create="vehicle"]')
    t.wait_for('.vehicle-form')

    heads = pg.eval_on_selector_all('.vehicle-form .card-head h3', 'els => els.map((e) => e.textContent.trim())')
    t.ck(heads and heads[0] == 'Учреждение, собственники и ответственные',
         'блок сторон не первый: %s' % heads)
    t.ck(pg.locator('[data-pt-add="user"], [data-pt-name^="user|"]').count() == 0,
         'в карточке ТС есть пользователи')

    empty = pg.eval_on_selector_all('[data-resp]', 'els => els.map((e) => e.value)')
    t.ck(len(empty) == 4 and not any(empty), 'у новой карточки назначены ответственные: %s' % empty)

    # --- учреждение и подвед ---------------------------------------------------
    pg.click('[data-ps="inst"] [data-ps-toggle]')
    pg.locator('[data-ps="inst"] .ps-opt').nth(0).click()
    t.wait_until("() => !!document.querySelector('[data-ps=\"inst\"] .ms-summary')")
    rec = pg.evaluate(REC)
    t.ck(bool(rec['inst']), 'учреждение не записалось')

    rec_podved = None
    pg.click('[data-ps="podved"] [data-ps-toggle]')
    if pg.locator('[data-ps="podved"] .ps-opt').count():
        pg.locator('[data-ps="podved"] .ps-opt').nth(0).click()
        t.wait_until("() => !!document.querySelector('[data-ps=\"podved\"] .ms-summary')")
        rec_podved = pg.evaluate(REC)['podved']
        t.ck(bool(rec_podved), 'подвед не записался')
    else:
        pg.keyboard.press('Escape')

    # Другое учреждение — подвед прежней ветки уйти обязан.
    if rec_podved and pg.locator('[data-ps="inst"] .ps-opt').count() > 1:
        pg.click('[data-ps="inst"] [data-ps-toggle]')
        opts = pg.locator('[data-ps="inst"] .ps-opt:not(.on)')
        opts.nth(0).click()
        t.wait(200)
        after = pg.evaluate(REC)
        t.ck(after['podved'] != rec_podved,
             'после смены учреждения остался подвед чужой ветки: %s' % after['podved'])

    # --- собственник ------------------------------------------------------------
    pg.click('[data-pt-add="owner"]')
    t.wait_for('[data-pt-name="owner|0"]')
    focused = pg.evaluate('document.activeElement && document.activeElement.dataset.ptName')
    t.ck(focused == 'owner|0', 'фокус не в новой строке собственника: %s' % focused)

    pg.fill('[data-pt-name="owner|0"]', 'ООО Проверка')
    pg.press('[data-pt-name="owner|0"]', 'Tab')
    pg.fill('[data-pt-share="owner|0"]', '1/2')
    pg.press('[data-pt-share="owner|0"]', 'Tab')
    t.wait_until("() => (document.querySelector('.pt-sum') || {}).textContent?.includes('50%')")

    pg.select_option('[data-resp="insp"]', 'Айдай')
    rec = pg.evaluate(REC)
    t.ck(rec['owners'] and rec['owners'][0]['name'] == 'ООО Проверка' and rec['owners'][0]['share'] == '1/2',
         'собственник не записался: %s' % rec['owners'])
    t.ck(rec['resp'].get('insp') == 'Айдай', 'осмотрщик не записался: %s' % rec['resp'])

    pg.click('[data-pt-rm="owner|0"]')
    t.wait_until("() => !document.querySelector('[data-pt-name]')")
    t.ck(not pg.evaluate(REC)['owners'], 'собственник не убрался')
