# -*- coding: utf-8 -*-
"""Статус объекта имущества и метка проверки после импорта (kernel/oiStage.js).

Задача пользователя 30.09.2026: «Нужны статусы литер и отдельные метки,
проверено/не проверено после импорта»; статусы — как на стенде: Создано,
Заполнено, Осмотрено, затем Оценено или Не подлежит оценке. Сценарий держит
то, что легко сломать правкой:

  * статус — шкала, как у ОЦ и как на стенде («делаем как в стенде»):
    четыре шага и ветка «Не подлежит оценке» от «Осмотрено»; шаг — щелчком
    по следующему, с подтверждением; шкала у ОЦ при этом остаётся девятишаговой;
  * метка импорта — отдельный чип плашки, а не часть одной надписи, где
    смешаны происхождение и проверка (так было до 30.09.2026);
  * у литеры, заведённой вручную, метки импорта нет вовсе;
  * метка переключается щелчком и пишет прежний flags.matched — по нему же
    горит значок ML записи;
  * статус виден в перечне ОИ, в столбце «Статус»;
  * у строения прежний список «Основное / Вспомогательное» подписан так, а не
    «Статус» — иначе в карточке два разных «статуса».
"""

NAME = 'статус ОИ и проверка импорта'

TOUCHES = (
    'app/kernel/oiStage.js', 'app/kernel/cards.css', 'app/kernel/status/*',
    'app/modules/*/oi/registry.js', 'app/modules/*/card/ctxPlate.js', 'app/modules/*/card/oiTable.view.js',
    'app/modules/civil/oi/building/view.js',
)

OC = '#/oc/civil/oc-cv-1'


def run(t):
    pg = t.page

    # --- импортированная литера ------------------------------------------------
    t.open(OC + '/oi/oi-cv1-a', wait='[data-oistage-flow]')
    cur = lambda: pg.locator('[data-oistage-flow] .st-full [aria-current="step"] .st-lbl').inner_text().strip()
    t.ck(cur() == 'Заполнено', 'заполненная литера без статуса — не «Заполнено»: %r' % cur())
    steps = pg.eval_on_selector_all('[data-oistage-flow] .st-full .st-step .st-lbl', 'els => els.map((e) => e.textContent.trim())')
    t.ck(steps == ['Создано', 'Заполнено', 'Осмотрено', 'Оценено'], 'шаги шкалы не те: %s' % steps)
    br = pg.eval_on_selector_all('[data-oistage-flow] .st-full .st-branch .st-lbl', 'els => els.map((e) => e.textContent.trim())')
    t.ck(br == ['Не подлежит оценке'], 'ветки шкалы не те: %s' % br)
    imp = pg.locator('[data-oi-import]')
    t.ck(imp.count() == 1 and 'Импорт проверен' in imp.inner_text(), 'у сверенной импортированной литеры нет метки «Импорт проверен»')
    t.ck(pg.locator('.ctx-plate', has_text='импортировано по ML').count() == 0, 'в плашке осталась прежняя сводная надпись')

    imp.click()
    t.wait_for('[data-oi-import].is-raw')
    t.ck('Импорт не проверен' in pg.locator('[data-oi-import]').inner_text(), 'метка импорта не переключилась')
    t.ck(pg.evaluate("""async () => {
      const m = await import('/app/modules/civil/records.js');
      const rec = m.allRecords().find((r) => r.id === 'oc-cv-1');
      return rec.oi.find((o) => o.id === 'oi-cv1-a').flags.matched === false;
    }"""), 'снятая метка не записана в flags.matched')

    pg.locator('[data-oistage-flow] .st-full [data-oistage-go="Осмотрено"]').click()
    t.wait_for('[data-modal-ok]')
    pg.click('[data-modal-ok]')
    t.wait_until("() => !!document.querySelector('[data-oistage-flow] .st-full [data-oistage-go=\"Не подлежит оценке\"]')")
    t.ck(cur() == 'Осмотрено', 'шаг «Осмотрено» не стал текущим: %r' % cur())
    t.ck(pg.locator('[data-oistage-flow] .st-full [data-oistage-go="Оценено"]').count() == 1,
         'из «Осмотрено» нельзя перейти в «Оценено»')

    t.ck(pg.locator('label', has_text='Основное / вспомогательное').count() >= 1,
         'список «Основное / Вспомогательное» подписан не так')

    # --- перечень ОИ -------------------------------------------------------------
    t.open(OC, wait='tr[data-open-oi="oi-cv1-a"]')
    steps_oc = pg.eval_on_selector_all('[data-status-flow] .st-full .st-step', 'els => els.length')
    t.ck(steps_oc == 9, 'у шкалы ОЦ не девять шагов: %s' % steps_oc)
    row = pg.locator('tr[data-open-oi="oi-cv1-a"] .oi-stage-cell')
    t.ck(row.count() == 1, 'в перечне ОИ нет ячейки статуса')
    txt = row.inner_text()
    t.ck('Осмотрено' in txt and 'не проверен' in txt, 'в перечне не виден статус и метка импорта: %r' % txt)

    # --- литера, заведённая вручную ---------------------------------------------
    t.open(OC + '/oi/oi-cv1-b', wait='[data-oistage-flow]')
    t.ck(pg.locator('[data-oi-import]').count() == 0, 'у литеры, заведённой вручную, есть метка импорта')
