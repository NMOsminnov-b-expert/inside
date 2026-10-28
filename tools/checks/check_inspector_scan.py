# -*- coding: utf-8 -*-
"""Сканы у осмотрщика: съёмка документа и пересъёмка возвращённого
(этап В, пункты В1 и В3; pages/inspector/scanEditor.js, kernel/inspectionResults.js).

Что ловит сценарий:
  * возвращённый ЦОД скан не стоит первым или без пометки «Переснять», причины,
    того, кто вернул, и кнопки; в списке «Задачи» и в плане дня нет отметки
    «Переснять: N»;
  * редактор страниц не собирается без файлов или не принимает несколько
    страниц; ручки углов меньше 44 px, уходят за край экрана, не стоят с
    отступом 4% по умолчанию или не тянутся мышью (Pointer Events);
  * поворот, фильтр, перестановка и удаление страниц не меняют результат:
    после «Готово» страницы идут не в том порядке, у повёрнутой не поменялись
    местами ширина и высота, размер не следует за положением углов (выравнивание
    не по четырём углам), чёрно-белый не двухцветный, серый не серый;
  * «Назад» из формы теряет страницы, «Отмена» оставляет скан;
  * «Отправить» не создаёт скан с нужным числом страниц и подписью «с осмотра»;
  * пересъёмка не заменяет страницы возвращённого скана, не снимает retake и
    review, не возвращает его в очередь «Ждёт разбора» (kernel/scanQueue.js) или
    плодит новый скан вместо замены;
  * редактор или блок пересъёмки прокручивается вбок на 360, 390, 760 и 1280;
  * ошибки консоли (считаются провалом автоматически).
"""
import base64
import struct
import zlib
from urllib.parse import quote

NAME = 'съёмка документа и пересъёмка'

TOUCHES = (
    'app/pages/inspector/*', 'app/kernel/inspectionResults.js', 'app/kernel/scanQueue.js',
    'app/kernel/inspectionsDemo.js', 'app/kernel/fileUpload.js',
)

ME = 'Осминнов Н.'
TYPE, OC = 'civil', 'oc-cv-1'
DOCS = '#/insp/civil/oc-cv-1/docs?as=' + quote(ME)
MIN_TAP = 44


def png(w, h):
    """PNG w×h с градиентом и тёмной рамкой — настоящий файл для выбора файла."""
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for x in range(w):
            edge = x < 3 or y < 3 or x >= w - 3 or y >= h - 3
            v = 30 if edge else int(60 + 190 * x / max(1, w - 1))
            raw += bytes((v, (v + y * 2) % 256, 255 - v))

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(bytes(raw))) + chunk(b'IEND', b''))


def files(*sizes):
    return [{'name': 'p%d.png' % i, 'mimeType': 'image/png', 'buffer': png(w, h)} for i, (w, h) in enumerate(sizes)]


def choose(pg, selector, payload):
    with pg.expect_file_chooser() as fc:
        pg.click(selector)
    fc.value.set_files(payload)


# Размеры и «двухцветность» страниц скана — по их blob-ссылкам, в самом браузере.
PAGES = """async ([ty, oc, id]) => {
  const T = await import('./app/pages/inspector/tasks.js');
  const s = T.scansOf(ty, oc).find((x) => x.id === id);
  const out = [];
  for (const p of s.pages) {
    const img = new Image(); img.src = p.dataUrl; await img.decode();
    const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const c = cv.getContext('2d'); c.drawImage(img, 0, 0);
    const d = c.getImageData(0, 0, cv.width, cv.height).data;
    let two = 0, grey = 0, n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] < 40 || d[i] > 215) two++;
      if (Math.abs(d[i] - d[i + 1]) < 8 && Math.abs(d[i + 1] - d[i + 2]) < 8) grey++;
    }
    out.push({ w: img.naturalWidth, h: img.naturalHeight, type: p.type, two: two / n, grey: grey / n });
  }
  return out;
}"""


def no_hscroll(t, where):
    t.ck(t.page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'прокрутка вбок: ' + where)


def run(t):
    pg = t.page
    pg.set_viewport_size({'width': 390, 'height': 844})

    # --- 1. «Переснять» у возвращённого, отметки в задачах и плане ----------------
    t.open(DOCS, wait='[data-scan-add]')
    first = pg.locator('.ins-scans .ins-scan').first
    txt = first.inner_text()
    t.ck(first.get_attribute('class').find('is-retake') >= 0, 'возвращённый скан стоит не первым: %s' % txt)
    t.ck('Договор аренды' in txt and 'Снимок смазан, переснять страницу 2' in txt, 'нет названия или причины возврата: %s' % txt)
    t.ck('Вернул' in txt and 'Оператор ЦОД' in txt, 'не видно, кто вернул: %s' % txt)
    t.ck(first.locator('.ins-pill-bad').inner_text().strip().lower() == 'переснять', 'нет пометки «Переснять»')
    t.ck(first.locator('[data-scan-retake]').count() == 1, 'у возвращённого нет кнопки «Переснять»')
    t.ck(pg.locator('.ins-scans .is-retake').count() == 1, 'пометка «Переснять» стоит не у одного скана')
    no_hscroll(t, 'блок сканов с возвратом, 390')

    pg.evaluate("location.hash = %r" % ('#/insp?tab=tasks&as=' + quote(ME)))
    t.wait_for('.ins-card-a')
    pg.click('[data-only="0"]')
    t.wait_until("() => [...document.querySelectorAll('.ins-card-a')].some((a) => a.getAttribute('href').includes('oc-cv-1'))")
    card = pg.eval_on_selector_all('.ins-card-a', 'els => els.filter((e) => e.getAttribute("href").includes("oc-cv-1")).map((e) => e.innerText)')
    t.ck(card and 'Переснять: 1' in card[0], 'в списке задач нет «Переснять: 1»: %s' % card)
    pg.evaluate("location.hash = %r" % ('#/insp?as=' + quote(ME)))
    t.wait_for('[data-plan-trips], .ins-pl-row')
    t.wait_until("() => document.body.innerText.includes('Переснять: 1')")
    t.ck('Переснять: 1' in pg.inner_text('.ins-body'), 'в плане дня нет «Переснять: 1»')

    # --- 2. Съёмка: две страницы, углы, поворот, фильтры, порядок -----------------------
    pg.evaluate("location.hash = %r" % ('#/insp/civil/oc-cv-1/docs?as=' + quote(ME)))
    t.wait_for('[data-scan-add]')
    pg.click('[data-scan-add]')
    t.wait_for('[data-sced-files]')
    t.ck(pg.locator('[data-sced-cam]').count() == 1 and pg.locator('[data-sced-done]').is_disabled(),
         'пустой редактор: нет «Снять» или «Готово» не заблокировано')
    # «Снять» открывает выбор с подсказкой камеры.
    with pg.expect_file_chooser() as fc:
        pg.click('[data-sced-cam]')
    fc.value.set_files(files((120, 80)))
    t.wait_for('[data-sced-h="0"]')
    t.ck(pg.locator('[data-sced-th]').count() == 1, 'снимок с камеры не стал страницей')
    choose(pg, '[data-sced-files]', files((60, 90)))
    t.wait_until("() => document.querySelectorAll('[data-sced-th]').length === 2")
    t.ck(pg.locator('.sced-th.on').count() == 1 and pg.locator('[data-sced-th]').count() == 2, 'после второй страницы в ленте не две миниатюры')

    # Ручки: 44 px, внутри экрана, по умолчанию отступ 4%.
    vw = pg.evaluate('innerWidth')
    for i in range(4):
        b = pg.locator('[data-sced-h="%d"]' % i).bounding_box()
        t.ck(b['width'] >= MIN_TAP and b['height'] >= MIN_TAP, 'ручка угла %d меньше 44 px: %s' % (i, b))
        t.ck(b['x'] >= 0 and b['x'] + b['width'] <= vw, 'ручка угла %d вне экрана: %s' % (i, b))
    pos = pg.evaluate("() => [...document.querySelectorAll('[data-sced-h]')].map((h) => [h.style.left, h.style.top])")
    t.ck(pos == [['4%', '4%'], ['96%', '4%'], ['96%', '96%'], ['4%', '96%']], 'углы по умолчанию не с отступом 4%%: %s' % pos)
    for sel in ('.sced .ins-btn', '.sced-fb'):
        small = pg.evaluate("(s) => [...document.querySelectorAll(s)].filter((e) => e.getBoundingClientRect().height < 44).length", sel)
        t.ck(small == 0, 'кнопок ниже 44 px (%s): %d' % (sel, small))
    no_hscroll(t, 'редактор, 390')

    # Страница 2 (60×90) — текущая: двигаем верхний и нижний левые углы вправо.
    st = pg.locator('[data-sced-stage]').bounding_box()
    for i in (0, 3):
        b = pg.locator('[data-sced-h="%d"]' % i).bounding_box()
        cx, cy = b['x'] + b['width'] / 2, b['y'] + b['height'] / 2
        pg.mouse.move(cx, cy)
        pg.mouse.down()
        pg.mouse.move(cx + st['width'] * 0.15, cy, steps=4)
        pg.mouse.move(cx + st['width'] * 0.3, cy, steps=4)
        pg.mouse.up()
    pos = pg.evaluate("() => [...document.querySelectorAll('[data-sced-h]')].map((h) => [parseFloat(h.style.left), parseFloat(h.style.top)])")
    t.ck(abs(pos[0][0] - 34) < 3 and abs(pos[3][0] - 34) < 3 and abs(pos[0][1] - 4) < 1, 'углы не потянулись мышью: %s' % pos)
    t.ck(pos[1] == [96, 4] and pos[2] == [96, 96], 'потянулись чужие углы: %s' % pos)
    # Тянуть за край можно: угол не выходит за снимок.
    b = pg.locator('[data-sced-h="1"]').bounding_box()
    cx, cy = b['x'] + b['width'] / 2, b['y'] + b['height'] / 2
    pg.mouse.move(cx, cy)
    pg.mouse.down()
    pg.mouse.move(cx + 300, cy - 300, steps=3)
    pg.mouse.up()
    p1 = pg.evaluate("() => { const h = document.querySelector('[data-sced-h=\"1\"]'); return [parseFloat(h.style.left), parseFloat(h.style.top)]; }")
    t.ck(p1 == [100, 0], 'угол уходит за край снимка: %s' % p1)
    # Клавиатура: стрелка сдвигает угол на 1% — замена перетаскиванию.
    pg.focus('[data-sced-h="1"]')
    for _ in range(4):
        pg.keyboard.press('ArrowLeft')
        pg.keyboard.press('ArrowDown')
    t.wait_until("() => parseFloat(document.querySelector('[data-sced-h=\"1\"]').style.top) > 3.5")
    pos = pg.evaluate("() => [...document.querySelectorAll('[data-sced-h]')].map((h) => [parseFloat(h.style.left), parseFloat(h.style.top)])")
    t.ck(abs(pos[1][0] - 96) < 0.6 and abs(pos[1][1] - 4) < 0.6, 'стрелки не двигают угол на 1%%: %s' % pos[1])

    # Фильтр «Серый» страницы 2.
    pg.click('[data-sced-flt="gray"]')
    t.ck(pg.get_attribute('[data-sced-flt="gray"]', 'aria-pressed') == 'true' and 'f-gray' in pg.get_attribute('[data-sced-img]', 'class'),
         'фильтр «Серый» не включился')
    # Страница 1 (120×80): повернуть, «Ч/б», вправо.
    pg.click('[data-sced-pick="0"]')
    t.wait_until("() => document.querySelector('.sced-th.on [data-sced-th]').dataset.scedTh === '0'")
    t.ck(pg.get_attribute('[data-sced-flt="color"]', 'aria-pressed') == 'true', 'у страницы 1 фильтр не «Цвет» по умолчанию')
    st0 = pg.locator('[data-sced-stage]').bounding_box()
    pg.click('[data-sced-rot]')
    t.wait_until("(w) => Math.abs(document.querySelector('[data-sced-stage]').getBoundingClientRect().width - w) > 4", st0['width'])
    st1 = pg.locator('[data-sced-stage]').bounding_box()
    t.ck(st1['height'] > st1['width'] and st0['width'] > st0['height'], 'после поворота сцена не стала «портретной»: %s -> %s' % (st0, st1))
    pos = pg.evaluate("() => [...document.querySelectorAll('[data-sced-h]')].map((h) => [h.style.left, h.style.top])")
    t.ck(sorted(pos) == sorted([['4%', '4%'], ['96%', '4%'], ['96%', '96%'], ['4%', '96%']]), 'при повороте углы разъехались: %s' % pos)
    pg.click('[data-sced-flt="bw"]')
    pg.click('[data-sced-move="1"]')
    t.wait_until("() => document.querySelector('.sced-th.on [data-sced-th]').dataset.scedTh === '1'")
    t.ck(pg.locator('[data-sced-move="1"]').is_disabled() and not pg.locator('[data-sced-move="-1"]').is_disabled(),
         'кнопки порядка не учитывают край ленты')
    no_hscroll(t, 'редактор с двумя страницами, 390')

    # Удаление: третья страница, лишняя, уходит.
    choose(pg, '[data-sced-files]', files((40, 40)))
    t.wait_until("() => document.querySelectorAll('[data-sced-th]').length === 3")
    pg.click('[data-sced-del]')
    t.wait_until("() => document.querySelectorAll('[data-sced-th]').length === 2")
    t.ck(pg.get_attribute('[data-sced-done]', 'disabled') is None and 'Готово · 2 стр.' in pg.inner_text('[data-sced-done]'),
         'после удаления «Готово» не показывает 2 стр.')

    # «Готово» → форма; «К страницам» возвращает с теми же страницами и поворотом.
    pg.click('[data-sced-done]')
    t.wait_for('[data-scan-title]')
    t.ck(pg.locator('.ins-scan-new .ins-shot').count() == 2, 'в форме не две страницы')
    pg.click('[data-scan-back]')
    t.wait_for('[data-sced-h="0"]')
    t.ck(pg.locator('[data-sced-th]').count() == 2, '«К страницам» потеряла страницы')
    t.ck(pg.evaluate("document.querySelector('.sced-th.on [data-sced-th]').dataset.scedTh") == '1', 'после «К страницам» выбрана не та страница')
    t.ck(pg.get_attribute('[data-sced-flt="bw"]', 'aria-pressed') == 'true', 'после «К страницам» потерялся фильтр страницы')
    pg.click('[data-sced-done]')
    t.wait_for('[data-scan-title]')
    pg.fill('[data-scan-title]', 'Съёмка проверка')
    pg.select_option('[data-scan-oi]', 'oi-cv1-b')
    pg.click('[data-scan-save]')
    t.wait_until("() => /Съёмка проверка/.test(document.querySelector('.ins-scans')?.innerText || '')")
    sc = pg.evaluate("""async ([ty, oc]) => (await import('./app/pages/inspector/tasks.js')).scansOf(ty, oc)
      .filter((s) => s.title === 'Съёмка проверка').map((s) => [s.id, s.oiId, s.pages.length, s.source, s.status])""", [TYPE, OC])
    if not t.ck(len(sc) == 1 and sc[0][1:] == ['oi-cv1-b', 2, 'осмотр', 'ждёт ЦОД'], 'скан сохранился не так: %s' % sc):
        return
    t.ck('с осмотра' in pg.inner_text('.ins-scans'), 'новый скан не помечен «с осмотра»')
    t.ck(pg.locator('.ins-scans .ins-scan').first.get_attribute('class').find('is-retake') >= 0, 'возвращённый перестал быть первым')
    pgs = pg.evaluate(PAGES, [TYPE, OC, sc[0][0]])
    # Порядок: страница 1 (повёрнутая 120×80, Ч/б) ушла вправо, первой стала страница 2 (60×90, серая).
    a, b = pgs[0], pgs[1]
    t.ck(a['type'] == 'image/jpeg' and b['type'] == 'image/jpeg', 'страницы не JPEG: %s' % pgs)
    # 60×90, рамка по ширине от 34% до 96%: (0.96-0.34)*60 ≈ 37; по высоте 0.92*90 ≈ 83
    t.ck(abs(a['w'] - 37) <= 3 and abs(a['h'] - 83) <= 3, 'размер первой страницы не по углам: %s (ждали ~37×83)' % a)
    # 120×80 повёрнута: 0.92*80 ≈ 74 по ширине, 0.92*120 ≈ 110 по высоте — стороны поменялись местами.
    t.ck(abs(b['w'] - 74) <= 2 and abs(b['h'] - 110) <= 2, 'у повёрнутой страницы стороны не поменялись местами: %s (ждали ~74×110)' % b)
    t.ck(b['two'] > 0.9, 'чёрно-белая страница не двухцветная: %s' % b)
    t.ck(a['grey'] > 0.9, 'серая страница не серая: %s' % a)
    no_hscroll(t, 'после отправки, 390')

    # --- 3. Отмена не плодит сканов ------------------------------------------------------
    n_before = pg.evaluate("async ([ty, oc]) => (await import('./app/pages/inspector/tasks.js')).scansOf(ty, oc).length", [TYPE, OC])
    pg.click('[data-scan-add]')
    t.wait_for('[data-sced-files]')
    choose(pg, '[data-sced-files]', files((50, 50)))
    t.wait_for('[data-sced-h="0"]')
    pg.click('[data-scan-cancel]')
    t.wait_for('[data-scan-add]')
    n_after = pg.evaluate("async ([ty, oc]) => (await import('./app/pages/inspector/tasks.js')).scansOf(ty, oc).length", [TYPE, OC])
    t.ck(n_after == n_before and pg.locator('[data-sced]').count() == 0, '«Отмена» оставила скан или редактор')

    # --- 4. Пересъёмка возвращённого ----------------------------------------------------------
    old = pg.evaluate("""async ([ty, oc]) => { const s = (await import('./app/pages/inspector/tasks.js')).scansOf(ty, oc).find((x) => x.retake);
      return { id: s.id, title: s.title, pages: s.pages.map((p) => p.id), n: (await import('./app/pages/inspector/tasks.js')).scansOf(ty, oc).length }; }""", [TYPE, OC])
    t.ck(old['title'] == 'Договор аренды', 'возвращённый скан не «Договор аренды»: %s' % old)
    pg.click('[data-scan-retake="%s"]' % old['id'])
    t.wait_for('[data-sced-files]')
    t.ck('Пересъёмка' in pg.inner_text('.ins-scans') and pg.locator('[data-scan-add]').count() == 0, 'в пересъёмке нет подписи или остался «Отсканировать»')
    choose(pg, '[data-sced-files]', files((100, 100), (100, 100), (100, 100)))
    t.wait_until("() => document.querySelectorAll('[data-sced-th]').length === 3")
    pg.click('[data-sced-done]')
    t.wait_for('[data-scan-save]')
    t.ck(pg.locator('[data-scan-title]').count() == 0, 'в пересъёмке спрашивают название заново')
    pg.click('[data-scan-save]')
    t.wait_until("() => !document.querySelector('.ins-scans .is-retake')")
    now = pg.evaluate("""async ([ty, oc, id]) => { const T = await import('./app/pages/inspector/tasks.js');
      const s = T.scansOf(ty, oc).find((x) => x.id === id);
      return { n: T.scansOf(ty, oc).length, retake: !!s.retake, review: !!s.review, pages: s.pages.length, ids: s.pages.map((p) => p.id), status: s.status, retakes: T.retakesOf(ty, oc).length }; }""", [TYPE, OC, old['id']])
    t.ck(now['n'] == old['n'], 'пересъёмка плодит скан: было %d, стало %d' % (old['n'], now['n']))
    t.ck(not now['retake'] and not now['review'] and now['retakes'] == 0, 'после пересъёмки остались retake/review: %s' % now)
    t.ck(now['pages'] == 3 and not set(now['ids']) & set(old['pages']), 'страницы не заменены новыми: %s' % now)
    q = pg.evaluate("""async ([k]) => { const Q = await import('./app/kernel/scanQueue.js');
      return { wait: Q.scanQueue({ state: 'wait' }).some((x) => x.key === k), ret: Q.scanQueue({ state: 'returned' }).some((x) => x.key === k) }; }""",
                    ['scan|%s|%s|%s' % (TYPE, OC, old['id'])])
    t.ck(q['wait'] and not q['ret'], 'переснятый скан не вернулся в «Ждёт разбора»: %s' % q)
    t.ck('Переснять' not in pg.inner_text('.ins-scans').replace('Пересъёмка', ''), 'после пересъёмки пометка «Переснять» осталась')
    pg.evaluate("location.hash = %r" % ('#/insp?tab=tasks&as=' + quote(ME)))
    t.wait_for('.ins-card-a')
    pg.click('[data-only="0"]')
    t.wait_until("() => [...document.querySelectorAll('.ins-card-a')].some((a) => a.getAttribute('href').includes('oc-cv-1'))")
    t.ck('Переснять' not in pg.inner_text('.ins-body'), 'после пересъёмки в списке задач осталась отметка «Переснять»')

    # --- 5. Ширины: редактор и блок возврата без прокрутки вбок -----------------------------
    pg.evaluate("""async ([ty, oc, id]) => { const R = await import('./app/kernel/scanQueue.js'); R.returnScan('scan|' + ty + '|' + oc + '|' + id, 'Снова смазано'); }""", [TYPE, OC, old['id']])
    for w in (360, 760, 1280):
        pg.set_viewport_size({'width': w, 'height': 900})
        pg.evaluate("location.hash = %r" % ('#/insp/civil/oc-cv-1?as=' + quote(ME)))
        pg.evaluate("location.hash = %r" % ('#/insp/civil/oc-cv-1/docs?as=' + quote(ME)))
        t.wait_for('[data-scan-retake]')
        no_hscroll(t, 'блок возврата, %d' % w)
        pg.click('[data-scan-retake]')
        t.wait_for('[data-sced-files]')
        choose(pg, '[data-sced-files]', files((120, 80), (60, 90)))
        t.wait_until("() => document.querySelectorAll('[data-sced-th]').length === 2")
        no_hscroll(t, 'редактор, %d' % w)
        vw = pg.evaluate('innerWidth')
        bad = [i for i in range(4) if not (lambda b: b['x'] >= 0 and b['x'] + b['width'] <= vw)(pg.locator('[data-sced-h="%d"]' % i).bounding_box())]
        t.ck(not bad, 'ручки углов за краем экрана на %d: %s' % (w, bad))
        pg.click('[data-scan-cancel]')
        t.wait_for('[data-scan-retake]')
