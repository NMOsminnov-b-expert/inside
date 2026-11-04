# -*- coding: utf-8 -*-
"""Страница «Аналитика · Земли по айыл аймакам» (pages/analytics, 04.11.2026).

Дарек — записанным аймаком вокруг демо-ЕНИ (harness.darek_route), Кадастр —
записанными участками (use_cadastre_fixture): сеть не нужна.

Что ловит сценарий:
  * пункт меню «Аналитика» не открывает страницу или она открывается с ошибкой;
  * объекты с точкой не привязываются к аймаку (rec.adm), аймак не появляется
    строкой с контуром и балансом;
  * «Посчитать» не даёт доли между 0 и 100 %, занято + не занято ≠ площади по
    контуру, нет картинки незанятой земли;
  * плитки итогов не совпадают с суммой посчитанных строк и строкой «Итого»;
  * строка не раскрывается (баланс, занятость, ОЦ с ЕНИ) или щелчок не выделяет;
  * отбор «Занято, %» и «Только посчитанные» не сужает таблицу и карту;
  * переключатель слоя не прячет слой карты;
  * числа не по правому краю, страница прокручивается вбок (1600, 1100, 760),
    ошибки консоли.
"""
from harness import use_cadastre_fixture

NAME = 'аналитика: земли по айыл аймакам'

TOUCHES = ('app/pages/analytics/*', 'app/kernel/landStats.js', 'app/kernel/darekAdmin.js', 'app/kernel/mapgl.js',
           'app/kernel/cadastreGeo.js', 'app/kernel/router.js', 'app/kernel/boot.js', 'app/shell/shell.js', 'app.html',
           'tools/checks/harness.py')

def num(s):
    try:
        return float(str(s).replace(' ', '').replace(' ', '').replace(' ', '').replace('%', '').replace(',', '.'))
    except ValueError:
        return None


def _cells(pg, i=0):
    return pg.evaluate("(i) => [...document.querySelectorAll('.an-tbl .an-row')[i].children].map((td) => td.innerText.trim())", i)


def run(t):
    pg = t.page
    use_cadastre_fixture(pg)
    t.open('', wait='.reg-tr')
    pg.click('[data-nav="analytics"]')
    if not t.ck(t.wait_for('.an-page'), 'пункт «Аналитика» не открыл страницу: %s' % pg.evaluate('location.hash')):
        return
    t.ck(pg.evaluate('location.hash') == '#/analytics', 'адрес страницы не #/analytics')
    t.ck(pg.locator('.modal-back').count() == 0, 'страница открыта модальным окном')
    t.ck(t.wait_until("() => document.querySelector('.an-scene canvas')", timeout=20000), 'карта-сцена не нарисована')

    # --- привязка и аймак в списке ---
    t.ck(t.wait_until("() => !document.querySelector('[data-an-status]').textContent.includes('идёт привязка') && document.querySelector('.an-item')", timeout=20000),
         'привязка к аймакам не закончилась или аймаков нет: %s' % pg.inner_text('[data-an-status]'))
    bound = pg.evaluate("""async () => { const R = await import('./app/kernel/registry.js'); let n = 0, b = 0;
      R.OC_TYPES.forEach((t) => (t.records.allRecords ? t.records.allRecords() : []).forEach((r) => { if (r.adm) { b++; if (r.adm.aimakCode === '1-03-07') n++; } }));
      return [b, n]; }""")
    t.ck(bound[0] > 0 and bound[0] == bound[1], 'объекты не привязаны к аймаку: привязано %d, к записанному %d' % tuple(bound))
    t.ck(pg.locator('.an-item').count() == 1, 'аймаков в списке не один: %d' % pg.locator('.an-item').count())
    it = pg.inner_text('.an-item')
    t.ck('Проверочный а.а.' in it and '1-03-07' in it and 'Свердловский' in it and 'по балансу 15' in it, 'строка аймака: %s' % it)

    # --- расчёт ---
    pg.click('.an-item [data-an-run]')
    t.ck(t.wait_until("() => !document.querySelector('.an-run') && document.querySelector('.an-it-share').innerText.trim()", timeout=30000), 'расчёт не закончился')
    t.ck(pg.evaluate("async () => { const L = await import('./app/kernel/landStats.js'); const a = L.aimakByCode('1-03-07'); return !!(a.occ.free && a.occ.free.url.startsWith('data:image/png')); }"),
         'нет картинки незанятой земли')

    # --- таблица: числа, итоги ---
    pg.click('[data-an-mode="table"]')
    t.ck(t.wait_for('.an-sheet .an-tbl .an-row'), '«Таблица» не открылась')
    c = _cells(pg)
    area, occ, roads, free, share = num(c[3]), num(c[5]), num(c[6]), num(c[7]), num(c[8])
    t.ck(share is not None and 0 < share < 100, 'доля занятого не между 0 и 100: %s' % c[8])
    # Дороги — своя категория (записанных дорог в проверке нет — 0): занято + дороги + не занято = площадь.
    t.ck(area and None not in (occ, roads, free) and abs(occ + roads + free - area) < 0.05, 'занято + дороги + не занято ≠ площади: %s' % c[3:8])
    t.ck(num(c[4]) == 15911 and num(c[10]) == bound[0], 'баланс или число ОЦ: %s' % c)
    kv = pg.evaluate("() => [...document.querySelectorAll('.an-kv b')].map((b) => b.innerText)")
    foot = pg.evaluate("() => [...document.querySelectorAll('.an-tbl tfoot td')].map((td) => td.innerText.trim())")
    t.ck(kv[0] == '1 из 1' and num(kv[2]) == round(occ), 'итоги в островке не совпадают со строкой: %s · %s' % (kv, c))
    t.ck(foot and num(foot[3]) == occ and num(foot[5]) == free, 'строка «Итого» не совпадает: %s' % foot)
    t.ck(pg.evaluate("() => getComputedStyle(document.querySelector('.an-tbl .an-row td:nth-child(6)')).textAlign") == 'right', 'числа не по правому краю')
    for w in (1600, 1100):
        pg.set_viewport_size({'width': w, 'height': 900})
        pg.wait_for_timeout(300)
        t.ck(pg.evaluate("() => [...document.querySelectorAll('.an-tbl th')].every((th) => th.scrollWidth <= th.clientWidth + 1)"), 'подписи шапки таблицы обрезаны на %d' % w)
    pg.set_viewport_size({'width': 1440, 'height': 900})
    # --- единицы: сотки — подпись и число ×100, итоги тоже; назад — гектары ---
    pg.click('.an-sheet [data-an-unit="sot"]')
    t.ck(t.wait_until("() => document.querySelector('.an-tbl thead').innerText.includes('СОТ.')"), 'шапка таблицы не перешла на сотки')
    c2 = _cells(pg)
    t.ck(num(c2[3]) is not None and abs(num(c2[3]) - area * 100) <= 1, 'площадь в сотках не ×100: %s → %s' % (c[3], c2[3]))
    t.ck('сот.' in pg.inner_text('.an-isl-sum').lower(), 'итоги не в сотках')
    pg.click('.an-sheet [data-an-unit="ha"]')
    t.ck(t.wait_until("() => document.querySelector('.an-tbl thead').innerText.includes(', ГА')"), 'не вернулись гектары')
    pg.click('[data-an-mode="map"]')
    t.ck(t.wait_until("() => !document.body.classList.contains('an-table-open')"), 'не вернулся вид «Карта»')

    # --- раскрытие и выбор ---
    pg.click('.an-item .an-it-h b')
    t.ck(t.wait_for('.an-item .an-detail'), 'строка не раскрылась')
    d = pg.inner_text('.an-item .an-detail').lower()
    t.ck('земельный баланс' in d and 'занятость участками с ени' in d and 'оц системы в аймаке' in d, 'в раскрытой строке не всё: %s' % d[:200])
    t.ck(pg.locator('.an-item.sel').count() == 1, 'щелчок не выделил аймак')

    # --- скрытие списка язычком ---
    pg.click('[data-an-edge]')
    t.ck(t.wait_until("() => document.querySelector('.an-page').classList.contains('hide-list') && getComputedStyle(document.querySelector('.an-list')).visibility === 'hidden'", timeout=3000),
         'язычок не скрыл список')
    pg.click('[data-an-edge]')
    t.ck(t.wait_until("() => getComputedStyle(document.querySelector('.an-list')).visibility === 'visible'", timeout=3000), 'язычок не вернул список')

    # --- отбор ---
    pg.click('[data-an-facets]')
    pg.fill('[data-an-f="shareFrom"]', '101')
    t.ck(t.wait_until("() => !document.querySelector('.an-item')"), 'отбор «Занято от 101 %» не скрыл аймак')
    t.ck(pg.evaluate("() => document.activeElement && document.activeElement.dataset.anF === 'shareFrom'"), 'поле отбора теряет фокус при вводе')
    t.ck('1' in pg.inner_text('[data-an-facets]'), 'на кнопке «Отбор» нет числа включённых условий')
    pg.click('[data-an-facets-clear]')
    t.ck(t.wait_until("() => document.querySelector('.an-item')"), 'после «Сбросить» аймак не вернулся')

    # --- ширины ---
    for w in (1600, 1280, 1100, 900, 760):
        pg.set_viewport_size({'width': w, 'height': 900})
        pg.wait_for_timeout(300)
        t.ck(pg.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'страница прокручивается вбок на %d' % w)
    pg.set_viewport_size({'width': 1440, 'height': 900})

    # --- «Участки»: сводка со срезами (04.11.2026) ---
    # Участки — из расчёта аймака (записанный аймак и участки Кадастра).
    pg.click('[data-an-mode="parcels"]')
    if t.ck(t.wait_for('.ap-kpis'), '«Участки» не открылись'):
        kp = pg.evaluate("() => [...document.querySelectorAll('.ap-kpi b')].map((b) => b.innerText)")
        tot = num(kp[0])
        forms = sum(num(x) for x in kp[1:6])
        t.ck(tot and tot > 0, 'участков нет: %s' % kp)
        # Формы собственности в плитках: государственная, муниципальная, частная, другая, без метки
        # (+ «самовольная застройка», если есть — она только в срезе).
        sv = num(pg.evaluate("() => { const b = [...document.querySelectorAll('.ap-card:first-child .ap-bar')].find((x) => x.querySelector('.ap-l').innerText === 'Самовольная застройка'); return b ? b.querySelector('.ap-v').innerText : '0'; }")) or 0
        t.ck(abs(forms + sv - tot) < 0.5, 'плитки собственности не сходятся с итогом: %s + %s ≠ %s' % (forms, sv, tot))
        first = pg.locator('.ap-card:nth-child(2) [data-ap-dim]').first
        val = first.get_attribute('data-ap-v')
        first.click()
        t.ck(t.wait_until("() => document.querySelector('.ap-chips')"), 'щелчок по столбцу не добавил отбор')
        t.ck(val in pg.inner_text('.ap-chips'), 'в отборе нет выбранного значения %s' % val)
        t.ck(num(pg.inner_text('.ap-kpi-main b')) <= tot, 'отбор не сузил итог')
        pg.click('[data-ap-clear]')
        t.ck(t.wait_until("() => !document.querySelector('.ap-chips')"), '«Сбросить отбор» не снял отбор')
        pg.set_viewport_size({'width': 900, 'height': 900})
        pg.wait_for_timeout(300)
        t.ck(pg.evaluate('document.documentElement.scrollWidth <= innerWidth'), '«Участки» прокручиваются вбок на 900')
        pg.set_viewport_size({'width': 1440, 'height': 900})

    # --- досье аймака (04.11.2026): итоги векторного расчёта — записанные, части — файлом (harness.DOSSIER_FREE) ---
    pg.evaluate("""async () => { const L = await import('./app/kernel/landStats.js'); const a = L.aimakByCode('1-03-07');
      a.occ = { ...a.occ, zones: { farm: 2.1, grass: 0.5 }, roadsHa: 1, waterHa: 0.2, reliefHa: 0, bldHa: 0.1, stripsHa: 0.05, smallHa: 0.01, freeHa: 2.6,
        cmp: { waterOsmHa: 0.2, waterWcHa: 0.1, waterBothHa: 0.1, reliefOsmHa: 0, steepHa: 0, buildings: 10, buildingsNoEni: 2, parcelsOnWater: { 'Частная': { n: 1, ha: 0.3 } } },
        strip: 6, minPatch: 200, slope: 12, bldYard: 3, by: 'проверка' };
      a.quality = { note: 'контур из 2 частей' }; }""")
    t.open('#/analytics?a=1-03-07', wait='.ad-kpis')
    t.ck(pg.locator('.ad-kpi').count() >= 8, 'в обзоре досье нет плиток частей аймака')
    t.ck('Проверочный' in pg.inner_text('.ad-title'), 'досье открыло не тот аймак: %s' % pg.inner_text('.ad-title'))
    t.ck('контур из 2 частей' in pg.inner_text('.ad-body'), 'нет пометки о качестве контура')
    pg.click('[data-ad-tab="free"]')
    t.ck(t.wait_until("() => document.querySelector('.ad-res')", timeout=10000), 'вкладка «Свободная земля» не открылась')
    t.ck(t.wait_until("() => document.querySelectorAll('[data-ad-patch]').length === 2"), 'массивов не два: %s' % pg.locator('[data-ad-patch]').count())
    pg.click('[data-ad-preset="1"]')
    t.ck(t.wait_until("() => document.querySelectorAll('[data-ad-patch]').length === 1"), 'отбор «от 1 га» не оставил один массив')
    pg.click('[data-ad-tab="water"]')
    t.ck(t.wait_until("() => document.querySelector('.ad-body').innerText.includes('Частная')"), 'нет участков на воде по формам собственности')
    pg.click('[data-ad-tab="sources"]')
    t.ck(t.wait_until("() => document.querySelector('.ad-body').innerText.includes('Copernicus')"), 'нет вкладки источников')
    with pg.expect_download(timeout=15000) as dl:
        pg.click('[data-ad-xlsx]')
    t.ck(dl.value.suggested_filename.endswith('.xlsx'), 'выгрузка досье не xlsx: %s' % dl.value.suggested_filename)
    pg.click('[data-ad-close]')
    t.ck(t.wait_until("() => !document.querySelector('.ad') && location.hash === '#/analytics'"), '«‹ Все аймаки» не закрыло досье')
