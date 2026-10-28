# -*- coding: utf-8 -*-
"""Страница «Сканы с осмотров» (pages/scans, этап В, пункт В3).

Что ловит сценарий:
  * пункт меню не открывает страницу или она открывается с ошибкой;
  * числа на вкладках («Ждёт разбора», «Принято», «Возвращено», «Отклонено»)
    не совпадают с очередью ядра (kernel/scanQueue.js);
  * отбор по источнику и переключатель «Мне / Все» не сужают перечень так, как
    очередь ядра, или не попадают в адрес;
  * вкладка, отборы и выбранный скан не хранятся в адресе: после перезагрузки
    выбор теряется («Назад» не возвращает туда же);
  * «Вернуть» и «Отклонить» работают без причины (кнопка активна при пустом
    поле) или молчат, почему неактивны;
  * «Принять» не кладёт документ к записи (ОЦ или ОИ) со статусом «Загружен»;
  * после действия не открывается следующий ждущий скан (auto-advance), число
    на вкладках не меняется, у возвращённых и отклонённых не видна причина;
  * у принятого скана нет ссылки «Открыть документ у объекта»;
  * пустая вкладка показывает пустые блоки вместо короткой строки;
  * страница прокручивается вбок на широком и узком экране, ошибки консоли.
"""
NAME = 'сканы с осмотров'

TOUCHES = ('app/pages/scans/*', 'app/kernel/scanQueue.js', 'app/kernel/inspectionResults.js',
           'app/kernel/inspections.js', 'app/kernel/router.js', 'app/kernel/boot.js', 'app/shell/shell.js',
           'app.html')

CNT = "async (o) => { const m = await import('./app/kernel/scanQueue.js'); return m.scanCounts(o); }"
QUE = "async (o) => { const m = await import('./app/kernel/scanQueue.js'); return m.scanQueue(o).map((x) => x.key); }"


def _tab_counts(pg):
    return pg.evaluate("""() => Object.fromEntries([...document.querySelectorAll('[data-sc-state]')]
      .map((b) => [b.dataset.scState, Number(b.querySelector('b').textContent)]))""")


def _rows(pg):
    return pg.eval_on_selector_all('[data-sc-row]', 'els => els.map((e) => e.dataset.scRow)')


def _cur(pg):
    loc = pg.locator('tr.cur[data-sc-row]')
    return loc.first.get_attribute('data-sc-row') if loc.count() else ''


def run(t):
    pg = t.page
    t.open('', wait='.reg-tr')
    pg.click('[data-nav="scans"]')
    if not t.ck(t.wait_for('.sc-main'), 'пункт «Сканы с осмотров» не открыл страницу: %s' % pg.evaluate('location.hash')):
        return
    t.ck(pg.evaluate('location.hash').startswith('#/scans'), 'адрес страницы не #/scans')
    t.ck(pg.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'страница сканов прокручивается вбок')
    t.ck(pg.locator('.modal-back').count() == 0, 'страница сканов открыта модальным окном')

    # --- вкладки и счётчики ----------------------------------------------------
    t.wait_for('[data-sc-row]')
    core = pg.evaluate(CNT, {'role': 'all'})
    tabs = _tab_counts(pg)
    t.ck(all(tabs.get(k) == core[k] for k in ('wait', 'accepted', 'returned', 'rejected')),
         'числа на вкладках %s не совпадают с очередью %s' % (tabs, core))
    t.ck(pg.locator('[data-sc-state="wait"].on').count() == 1, 'по умолчанию открыта не «Ждёт разбора»')
    t.ck(len(_rows(pg)) == core['wait'], 'строк в «Ждёт разбора» %d, в очереди %d' % (len(_rows(pg)), core['wait']))
    t.ck(core['wait'] >= 4 and core['accepted'] >= 1 and core['returned'] >= 1 and core['rejected'] >= 1,
         'демо-данных мало для проверки: %s' % core)
    t.ck(bool(_cur(pg)), 'при открытии не выбрана первая строка')
    t.ck(pg.locator('.sc-pane').count() == 1 and pg.locator('[data-sc-accept]').count() == 1, 'панель выбранного скана пуста')

    # --- отбор по источнику ------------------------------------------------------
    pg.click('[data-sc-src="кадастр"]')
    t.wait_until("() => location.hash.includes('src=')")
    want = pg.evaluate(QUE, {'state': 'wait', 'source': 'кадастр', 'role': 'all'})
    t.ck(_rows(pg) == want and len(want) > 0, 'отбор «Кадастр»: строки %s, ждали %s' % (_rows(pg), want))
    t.ck(pg.locator('.sc-tbl .sc-src-insp').count() == 0, 'при отборе «Кадастр» в перечне есть сканы осмотра')
    c2 = pg.evaluate(CNT, {'role': 'all', 'source': 'кадастр'})
    t.ck(_tab_counts(pg).get('wait') == c2['wait'], 'число на вкладке не учитывает отбор по источнику')
    pg.click('[data-sc-src="осмотр"]')
    t.wait_until("() => location.hash.includes('src=%D0%BE')")
    t.ck(pg.locator('.sc-tbl [data-sc-row]').count() > 0, 'отбор «Осмотр» не оставил сканы осмотра')
    t.ck(pg.locator('.sc-tbl .sc-src-cad').count() == 0, 'при отборе «Осмотр» в перечне есть ответы кадастра')
    pg.click('[data-sc-src=""]')
    t.wait_until("() => !location.hash.includes('src=')")

    # --- «Мне / Все» ----------------------------------------------------------------
    person = pg.evaluate("async () => (await import('./app/kernel/session.js')).session.state.person")
    pg.click('[data-sc-who="me"]')
    t.wait_until("() => location.hash.includes('who=me')")
    mine = pg.evaluate(QUE, {'state': 'wait', 'role': 'cod', 'person': person})
    t.ck(_rows(pg) == mine, '«Мне»: строки %s, ждали %s' % (_rows(pg), mine))
    cm = pg.evaluate(CNT, {'role': 'cod', 'person': person})
    t.ck(_tab_counts(pg).get('wait') == cm['wait'], '«Мне»: число на вкладке %s, ждали %s' % (_tab_counts(pg), cm))
    pg.click('[data-sc-who="all"]')
    t.wait_until("() => !location.hash.includes('who=')")
    t.ck(len(_rows(pg)) == core['wait'], '«Все» не вернуло весь перечень')

    # --- адрес хранит вкладку и выбор ---------------------------------------------------
    rows = _rows(pg)
    pick = rows[1]
    pg.locator('[data-sc-row="%s"]' % pick).click()
    t.wait_until("() => location.hash.includes('key=')")
    t.ck(_cur(pg) == pick, 'щелчок по строке не выбрал её')
    pg.keyboard.press('ArrowDown')
    t.wait_until("(k) => !!document.querySelector('tr.cur') && document.querySelector('tr.cur').dataset.scRow !== k", pick)
    t.ck(_cur(pg) == rows[2], 'стрелка вниз не выбрала следующую строку')
    pg.keyboard.press('ArrowUp')
    t.wait_until("(k) => !!document.querySelector('tr.cur') && document.querySelector('tr.cur').dataset.scRow === k", pick)
    pg.click('[data-sc-state="returned"]')
    t.wait_until("() => location.hash.includes('state=returned')")
    t.ck(pg.locator('.sc-tbl .sc-why').count() >= 1 and 'Возвращено' in pg.inner_text('.sc-tbl .sc-why'),
         'у возвращённых в перечне не видна причина')
    ret_key = _cur(pg)
    pg.reload()
    t.wait_for('[data-sc-row]')
    t.ck('state=returned' in pg.evaluate('location.hash') and _cur(pg) == ret_key
         and pg.locator('[data-sc-state="returned"].on').count() == 1,
         'после перезагрузки потерялась вкладка или выбор: %s' % pg.evaluate('location.hash'))
    t.ck('Причина' in pg.inner_text('.sc-dl') and pg.locator('[data-sc-accept]').count() == 0,
         'у возвращённого в панели нет причины или остались действия разбора')
    pg.click('[data-sc-state="wait"]')
    t.wait_until("() => !location.hash.includes('state=')")

    # --- «Вернуть» и «Отклонить» без причины нельзя -------------------------------------------
    t.wait_for('[data-sc-return]')
    t.ck(pg.locator('[data-sc-return]').is_disabled() and pg.locator('[data-sc-reject]').is_disabled(),
         'без причины кнопки «Вернуть» и «Отклонить» активны')
    t.ck(pg.locator('[data-sc-need]').is_visible(), 'без причины не сказано, почему кнопки неактивны')
    pg.fill('[data-sc-f-reason]', '   ')
    t.ck(pg.locator('[data-sc-return]').is_disabled(), 'пробелы вместо причины включили кнопку')
    pg.fill('[data-sc-f-reason]', 'страница смазана')
    t.ck(not pg.locator('[data-sc-return]').is_disabled() and not pg.locator('[data-sc-reject]').is_disabled(),
         'с причиной кнопки остались неактивны')
    t.ck(not pg.locator('[data-sc-need]').is_visible(), 'при заполненной причине подсказка «укажите причину» осталась')
    pg.fill('[data-sc-f-reason]', '')
    t.ck(pg.locator('[data-sc-return]').is_disabled(), 'после очистки причины кнопка осталась активной')

    # --- вернуть: auto-advance, числа ------------------------------------------------------------
    before = _tab_counts(pg)
    rows = _rows(pg)
    first = _cur(pg)
    pg.fill('[data-sc-f-reason]', 'не видна печать')
    pg.click('[data-sc-return]')
    t.wait_until("(n) => document.querySelectorAll('[data-sc-row]').length === n", len(rows) - 1)
    after = _tab_counts(pg)
    t.ck(after['wait'] == before['wait'] - 1 and after['returned'] == before['returned'] + 1,
         'после возврата числа вкладок %s -> %s' % (before, after))
    t.ck(first not in _rows(pg) and _cur(pg) == rows[1], 'после возврата не открылся следующий скан: %s' % _cur(pg))
    t.ck(first in pg.evaluate(QUE, {'state': 'returned', 'role': 'all'}), 'возвращённый скан не в состоянии «Возвращено»')
    t.ck(pg.evaluate("document.querySelector('[data-sc-f-reason]').value") == '', 'причина прошлого скана осталась в поле')

    # --- отклонить ---------------------------------------------------------------------------------
    rows = _rows(pg)
    rej = _cur(pg)
    pg.fill('[data-sc-f-reason]', 'чужой документ')
    pg.click('[data-sc-reject]')
    t.wait_until("(n) => document.querySelectorAll('[data-sc-row]').length === n", len(rows) - 1)
    t.ck(rej in pg.evaluate(QUE, {'state': 'rejected', 'role': 'all'}), 'отклонённый скан не в состоянии «Отклонено»')
    t.ck(_tab_counts(pg)['rejected'] == before['rejected'] + 1, 'число на «Отклонено» не выросло')

    # --- принять: документ у записи ------------------------------------------------------------------
    pg.click('[data-sc-src="осмотр"]')
    t.wait_until("() => location.hash.includes('src=')")
    t.wait_for('[data-sc-row]')
    key = _cur(pg)
    info = pg.evaluate("""async (k) => {
      const m = await import('./app/kernel/scanQueue.js');
      const it = m.scanQueue({ state: 'wait', role: 'all' }).find((x) => x.key === k);
      return { typeId: it.typeId, ocId: it.ocId, oiId: it.oiId, title: it.title };
    }""", key)
    pg.fill('[data-sc-f-title]', 'Акт обмера (принят в проверке)')
    pg.click('[data-sc-accept]')
    t.wait_until("(k) => !document.querySelector('[data-sc-row=\"' + k + '\"]')", key)
    err = pg.locator('[data-sc-err]:not([hidden])')
    t.ck(err.count() == 0, 'принятие закончилось ошибкой: %s' % (err.first.inner_text() if err.count() else ''))
    done = pg.evaluate("""async (a) => {
      const m = await import('./app/kernel/scanQueue.js');
      const r = await import('./app/kernel/registry.js');
      const it = m.scanQueue({ state: 'accepted', role: 'all' }).find((x) => x.key === a.key);
      if (!it) return { ok: false, why: 'нет в «Принято»' };
      const rec = r.getType(a.typeId).records.loadRecord(a.ocId);
      const holder = a.oiId ? (rec.oi || []).find((o) => o.id === a.oiId) : rec;
      const d = (holder.docs || []).find((x) => x.id === it.docId);
      return { ok: !!d, status: d && d.status, name: d && d.name, source: d && d.source, docId: it.docId };
    }""", {'key': key, **info})
    t.ck(done.get('ok') and done.get('status') == 'Загружен' and done.get('source') == 'осмотр'
         and done.get('name') == 'Акт обмера (принят в проверке)',
         'после «Принять» документа нет у записи или он не такой: %s' % done)
    t.ck(_tab_counts(pg)['accepted'] == before['accepted'] + 1, 'число на «Принято» не выросло')
    pg.click('[data-sc-state="accepted"]')
    t.wait_until("() => location.hash.includes('state=accepted')")
    pg.locator('[data-sc-row="%s"]' % key).click()
    t.wait_for('[data-sc-open-doc]')
    t.ck(pg.locator('[data-sc-open-doc]').count() == 1 and pg.locator('[data-sc-accept]').count() == 0,
         'у принятого нет ссылки «Открыть документ у объекта» или остались действия')

    # --- пустая вкладка ---------------------------------------------------------------------------------
    pg.click('[data-sc-state="wait"]')
    pg.click('[data-sc-src=""]')
    t.wait_until("() => !location.hash.includes('state=') && !location.hash.includes('src=')")
    for _ in range(10):
        n = pg.locator('[data-sc-row]').count()
        if not n:
            break
        pg.click('[data-sc-accept]')
        t.wait_until("(n) => document.querySelectorAll('[data-sc-row]').length < n", n)
    t.ck(pg.locator('.sc-empty').count() == 1 and pg.inner_text('.sc-empty').strip() == 'Сканов, ждущих разбора, нет',
         'пустая вкладка: нет строки «Сканов, ждущих разбора, нет»: %s' % pg.inner_text('.sc-main')[:80])
    t.ck(pg.locator('.sc-pane').count() == 0, 'при пустой вкладке осталась пустая панель')
    t.ck(pg.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'страница сканов прокручивается вбок после разбора')

    # --- узкий экран: перечень или панель ---------------------------------------------------------------------
    pg.set_viewport_size({'width': 760, 'height': 900})
    pg.click('[data-sc-state="returned"]')
    t.wait_until("() => location.hash.includes('state=returned')")
    pg.evaluate("() => { const h = location.hash.replace(/[?&]key=[^&]*/, ''); history.replaceState(null, '', h); window.dispatchEvent(new HashChangeEvent('hashchange')); }")
    t.wait_for('[data-sc-row]')
    t.ck(not pg.locator('.sc-pane').is_visible(), 'на узком экране панель видна рядом с перечнем')
    pg.locator('[data-sc-row]').first.click()
    t.wait_until("() => !!document.querySelector('.sc-pane') && document.querySelector('.sc-pane').offsetParent !== null")
    t.ck(pg.locator('[data-sc-back]').is_visible() and not pg.locator('.sc-list').is_visible(),
         'на узком экране панель не открылась вместо перечня с кнопкой «К перечню»')
    pg.click('[data-sc-back]')
    t.wait_until("() => !!document.querySelector('.sc-list') && document.querySelector('.sc-list').offsetParent !== null")
    t.ck(pg.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'страница сканов прокручивается вбок на 760 px')
    pg.set_viewport_size({'width': 1440, 'height': 900})
