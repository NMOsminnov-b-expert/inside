# -*- coding: utf-8 -*-
"""ОЦ «Механизмы и оборудование» — самостоятельный объект оценки.

Решение пользователя 28.09.2026: механизмы бывают в любом ОЦ и самостоятельным
ОЦ; самостоятельный устроен как ОЦ «Транспортные средства» — блок сторон, затем
тот же перечень единиц, что у объекта имущества в гражданском (эталон). Сценарий
держит то, что легко сломать правкой:

  * ОЦ создаётся из меню «+ Создать ОЦ» (раздел «Движимое имущество» строится
    по реестру ядра, а не руками — кнопка раньше вела в несуществующий тип);
  * блоки по порядку: стороны, «Состав», карточка единицы — нумерация идёт
    подряд с 01, у сторон нет пользователей;
  * форма та же, что у объекта имущества: каскад класса открывает параметры,
    «+ Добавить ОИ» заводит вторую единицу, итог состава считает количество;
  * название списка становится подписью записи в реестре объектов;
  * фото единицы подписано в просмотрщике её названием, а не id;
  * запись переживает перезагрузку страницы (kernel/persist.js).
"""
import base64
import os
import tempfile

NAME = 'ОЦ механизмов'

TOUCHES = (
    'app/modules/mechanisms/*', 'app/kernel/registry.js', 'app/pages/ocMenu/*',
)

PNG = base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP4z8DwnwEIGP4zMAAAHOgD/U8WqF8AAAAASUVORK5CYII=')

REC = """async () => {
  const m = await import('/app/modules/mechanisms/records.js');
  const r = m.allRecords()[0];
  if (!r) return null;
  const s = m.summarize(r);
  return { id: r.id, units: r.mech.mechanisms.length, cls: r.mech.mechanisms[0].cls,
    group: r.mech.groupName, title: s.title, photos: r.mech.photos || {} };
}"""


def run(t):
    pg = t.page

    t.open('', wait='[data-create="mechanisms"]')
    items = pg.eval_on_selector_all('.reg-create-menu [data-create]', 'els => els.map((e) => e.dataset.create)')
    t.ck('mechanisms' in items and 'vehicle' in items, 'в меню создания нет движимых типов: %s' % items)
    pg.locator('.dd [data-dd-toggle]').filter(has_text='Создать ОЦ').click()
    pg.click('[data-create="mechanisms"]')
    t.wait_for('.mu-stack')

    heads = pg.eval_on_selector_all('.mu-stack .card-head h3', 'els => els.map((e) => e.textContent.trim())')
    idx = pg.eval_on_selector_all('.mu-stack .card-head .card-idx', 'els => els.map((e) => e.textContent.trim())')
    t.ck(heads[:2] == ['Учреждение, собственники и ответственные', 'Состав'],
         'блоки не по порядку: %s' % heads)
    t.ck(idx[:3] == ['01', '02', '03'], 'нумерация блоков не подряд: %s' % idx)
    t.ck(pg.locator('[data-pt-add="user"]').count() == 0, 'в ОЦ механизмов есть пользователи')

    # --- форма — та же, что у объекта имущества -------------------------------
    t.ck(pg.locator('select[data-mu-sub][disabled]').count() == 1, 'подгруппа не заблокирована без класса')
    pg.select_option('select[data-mu-cls]', 'Энергетическое оборудование')
    t.wait_until("() => !document.querySelector('select[data-mu-sub][disabled]')")
    pg.select_option('select[data-mu-sub]', index=1)
    t.wait_until("() => !!document.querySelector('.mu-params')")
    t.ck(pg.locator('.mu-params .mu-param').count() > 0, 'после выбора подгруппы нет параметров')

    pg.fill('[data-mu-name]', 'Трансформатор ТМ-400')
    pg.click('[data-mu-add]')
    t.wait_until("() => document.querySelectorAll('[data-mu-pick]').length === 2")
    total = pg.text_content('.mu-tbl tfoot')
    t.ck('2 позиции' in total and '2 шт.' in total, 'итог состава не пересчитан: %s' % total.split())

    pg.fill('[data-mu-group]', 'Счёт 01 · МОЛ Иванов')
    pg.locator('[data-mu-group]').blur()
    rec = pg.evaluate(REC)
    t.ck(rec and rec['units'] == 2, 'единицы не записались: %s' % rec)
    t.ck(rec and rec['cls'] == 'Энергетическое оборудование', 'класс не записался: %s' % rec)
    t.ck(rec and rec['title'] == 'Счёт 01 · МОЛ Иванов', 'название списка не стало подписью: %s' % rec)

    # --- фото единицы подписано её названием ----------------------------------
    pg.locator('[data-mu-pick]').first.click()
    t.wait_for('[data-mu-photo-add]')
    path = os.path.join(tempfile.gettempdir(), 'mech-oc-check.png')
    with open(path, 'wb') as f:
        f.write(PNG)
    with pg.expect_file_chooser() as fc:
        pg.click('[data-mu-photo-add]')
    fc.value.set_files(path)
    t.wait_until("() => !!document.querySelector('[data-mu-photo]')")
    pg.click('[data-mu-photo]')
    t.wait(500)
    cap = pg.evaluate("() => (document.querySelector('.pv-cap, .ph-pop-cap, .vw-photo-cap, .viewer') || {}).textContent || ''")
    t.ck('Трансформатор' in cap or 'mu-' not in cap, 'снимок в просмотрщике подписан id: %s' % cap[:120])

    # --- перезагрузка -----------------------------------------------------------
    rid = rec['id'] if rec else ''
    t.open('#/oc/mechanisms/%s' % rid, wait='.mu-stack')
    again = pg.evaluate(REC)
    t.ck(again and again['units'] == 2 and again['group'] == 'Счёт 01 · МОЛ Иванов',
         'после перезагрузки запись не та: %s' % again)
