# -*- coding: utf-8 -*-
"""Адрес записи и коды ЕНИ — сборка из частей и свёртка.

По заметкам команды 05.09.2026 адрес перестал быть одной строкой: у объекта
оценки — населённый пункт, район и микрорайон, у каждого объекта имущества —
своя улица и дом, у квартиры ещё номер квартиры, у всех — координаты. Полный
адрес записи собирается из обеих частей и сворачивается: одинаковые улица с
домом называются один раз, номера квартир идут списком (kernel/address.js).

Что сторожит сценарий:
  * поля частей адреса в форме объекта оценки и живая сборка по ходу ввода;
  * поля адреса и координат в карточках всех видов ОИ;
  * пересборку адреса записи после правки адреса ОИ — его показывают шапка,
    реестр, поиск и архив;
  * свёртку квартир одного дома в один адрес;
  * что крупная зона и микрорайон из карточки участка ушли (они общие для
    записи и живут в объекте оценки);
  * коды ЕНИ в данных: длина по маске (13, 15 или 18 цифр) — 12-значные коды,
    которые лежали в макете, поле ввода считало ошибкой;
  * столбцы реестра «Тип земель» и «Коды ЕНИ ОИ».
"""
import re

NAME = 'адрес и ЕНИ'

ROUTES = {
    'квартира': '#/oc/apartment/oc-ap-1',
    'жилой дом': '#/oc/residential-house/oc-rh-1',
    'гражданское': '#/oc/civil/oc-cv-1',
    'производственное': '#/oc/production/oc-pr-1',
    'участок': '#/oc/land-plot/oc-lp-1',
}

# Длины кода ЕНИ выводятся из маски 1-2-2-4-4-2-3 (kernel/fmt.js).
ENI_LENGTHS = (13, 15, 18)


def _add(t, kind):
    pg = t.page
    pg.locator('[data-dd-toggle]').first.click()
    if not t.wait_for('[data-add-oi]'):
        return False
    item = pg.locator('[data-add-oi="%s"]' % kind)
    if not item.count():
        return False
    item.first.click()
    return t.wait_for('.oi-stack')


def run(t):
    pg = t.page

    # --- 1. форма объекта оценки: части адреса и живая сборка ---
    t.open('#/oc/civil/oc-cv-1/form', wait='[data-addr-sum]')
    for sel, name in (('#fCity', 'город'), ('#fDistrict', 'район'), ('#fMicro', 'микрорайон')):
        t.ck(pg.locator(sel).count() == 1, 'в форме ОЦ нет поля «%s»' % name)
    t.ck(pg.locator('#fAddr').count() == 0,
         'в форме ОЦ осталось поле адреса строкой — адрес собирается из частей')

    before = pg.locator('[data-addr-sum]').inner_text()
    t.ck('Киевская' in before and 'Бишкек' in before,
         'собранный адрес не показывает части записи и адреса ОИ: %s' % before)

    pg.fill('#fMicro', 'мкр. Проверочный')
    t.wait_until("""() => document.querySelector('[data-addr-sum]')
        .textContent.includes('Проверочный')""")
    t.ck('Проверочный' in pg.locator('[data-addr-sum]').inner_text(),
         'собранный адрес не обновляется по ходу ввода')

    # --- 2. адрес и координаты в карточках ОИ ---
    for kind, sel in (('Гражданское здание', '[data-oi-street]'),
                      ('Квартира', '[data-oi-flat]'),
                      ('Земельный участок', '[data-oi-house]')):
        t.open('#/oc/civil/oc-cv-1', wait='[data-open-oi]')
        t.wait(300)
        if not t.ck(_add(t, kind), 'не заводится «%s»' % kind):
            continue
        t.wait(200)
        t.ck(pg.locator('[data-oi-street]').count() == 1, 'у «%s» нет улицы' % kind)
        t.ck(pg.locator('[data-oi-house]').count() == 1, 'у «%s» нет дома' % kind)
        t.ck(pg.locator(sel).count() == 1, 'у «%s» нет поля %s' % (kind, sel))
        t.ck(pg.locator('[data-oi-gps], [data-land-gps]').count() >= 1,
             'у «%s» нет координат' % kind)

    # --- 3. правка адреса ОИ пересобирает адрес записи ---
    t.open('#/oc/civil/oc-cv-1/oi/oi-cv1-a', wait='[data-oi-street]')
    pg.fill('[data-oi-street]', 'Проверочная')
    pg.dispatch_event('[data-oi-street]', 'change')
    t.wait_until("""() => document.querySelector('.ctx-plate-addr')
        .textContent.includes('Проверочная')""")
    t.ck('Проверочная' in pg.locator('.ctx-plate-addr').inner_text(),
         'шапка не показала новый адрес литеры')

    # --- 4. свёртка квартир одного дома ---
    t.open('#/oc/apartment/oc-ap-1', wait='[data-open-oi]')
    t.wait(300)
    if _add(t, 'Квартира'):
        t.wait(200)
        pg.fill('[data-oi-street]', 'Байтик Баатыра')
        pg.dispatch_event('[data-oi-street]', 'change')
        pg.fill('[data-oi-house]', '42')
        pg.dispatch_event('[data-oi-house]', 'change')
        pg.fill('[data-oi-flat]', '5')
        pg.dispatch_event('[data-oi-flat]', 'change')
        t.wait(300)

        t.open('#/oc/apartment/oc-ap-1', wait='.hm b')
        t.wait(300)
        addr = pg.evaluate("""() => [...document.querySelectorAll('.hm')]
            .filter((h) => h.textContent.includes('Адрес'))
            .map((h) => h.querySelector('b').textContent.trim())[0] || ''""")
        t.ck(addr.count('Байтик Баатыра') == 1,
             'квартиры одного дома не свёрнуты в один адрес: %s' % addr)
        t.ck('кв. 78, 5' in addr or 'кв. 5, 78' in addr,
             'номера квартир не перечислены списком: %s' % addr)

    # --- 5. в карточке участка нет крупной зоны и микрорайона ---
    t.open('#/oc/land-plot/oc-lp-1', wait='[data-open-oi]')
    t.wait(300)
    pg.locator('[data-open-oi]').first.click()
    t.wait_for('.oi-stack')
    t.wait(300)
    t.ck(pg.locator('[data-land-zone]').count() == 0
         and pg.locator('[data-land-microdistrict]').count() == 0,
         'в карточке участка остались крупная зона и микрорайон')

    # --- 6. коды ЕНИ проходят ту же проверку, что и поле ввода ---
    for oc, route in ROUTES.items():
        t.open(route, wait='.hm b')
        t.wait(300)
        codes = pg.evaluate("""() => [...document.querySelectorAll('.hm b, .ctx-plate-eni b')]
            .map((e) => e.textContent.trim())
            .filter((x) => /^\\d[\\d-]*$/.test(x))""")
        t.ck(codes, 'в %s не нашёлся код ЕНИ' % oc)
        for c in codes:
            n = len(re.sub(r'\D', '', c))
            t.ck(n in ENI_LENGTHS,
                 'в %s код ЕНИ «%s» из %d цифр, допустимо %s'
                 % (oc, c, n, ', '.join(map(str, ENI_LENGTHS))))

    # --- 7. столбцы реестра: тип земель и свёрнутые коды ---
    t.open('#/', wait='.reg-thead')
    t.wait(400)
    # Тип земель по умолчанию скрыт — включаем его через меню столбцов.
    # Отдельного столбца кодов ОИ больше нет: коды показываются в столбце «Код
    # ЕНИ» одной строкой (решение пользователя 05.09.2026).
    pg.locator('[data-cols-dd] [data-dd-toggle]').first.click()
    t.wait_for('[data-column="landKind"]')
    box = pg.locator('[data-column="landKind"]')
    t.ck(box.count() == 1, 'в меню столбцов нет «Тип земель»')
    if box.count():
        box.first.check()
        t.wait(300)
    pg.mouse.click(900, 60)
    t.wait(300)

    head = pg.locator('.reg-thead').inner_text().upper()
    t.ck('ТИП ЗЕМЕЛЬ' in head, 'в реестре нет столбца типа земель')

    kinds = pg.evaluate("""() => [...document.querySelectorAll('.reg-tr .tag-mini')]
        .map((e) => e.textContent.trim())""")
    t.ck(any(k in ('Сельхоз', 'Несельхоз', 'Смешанный') for k in kinds),
         'столбец типа земель пуст у всех записей: %s' % kinds[:5])

    # --- 8. столбец «Код ЕНИ»: коды записи и её ОИ одной строкой ---
    #
    # Решение пользователя 05.09.2026: отдельного столбца под коды объектов
    # имущества нет — всё показывается в столбце «Код ЕНИ» одной строкой,
    # свёрнутой по общему началу. Что не влезло, сокращается многоточием, полное
    # значение — в подсказке.
    t.open('#/', wait='.reg-thead')
    t.wait(500)
    t.ck('КОДЫ ЕНИ ОИ' not in pg.locator('.reg-thead').inner_text().upper(),
         'вернулся отдельный столбец кодов ОИ — коды показываются в столбце ЕНИ')

    cells = pg.evaluate("""() => [...document.querySelectorAll('.reg-tr')].slice(0, 8).map((tr) => {
      // Класс mono стоит и на самой ячейке (описание столбца), и на теге со
      // значением — берём именно внутренний, у него подсказка и многоточие.
      const td = tr.querySelector('.reg-td.mono, td.mono') || tr.querySelector('.mono');
      const span = td && (td.querySelector('span') || td);
      if (!span) return null;
      return {
        text: span.textContent.trim(),
        title: span.title,
        cut: span.scrollWidth > span.clientWidth + 1,
        ellipsis: getComputedStyle(span).textOverflow === 'ellipsis',
        fits: td.scrollWidth <= td.clientWidth + 1,
      };
    }).filter(Boolean)""")

    t.ck(cells, 'в реестре не нашлось ячеек с кодом ЕНИ')
    t.ck(any('(' in c['text'] for c in cells),
         'ни одна запись не показала свёрнутые коды в столбце ЕНИ: %s'
         % [c['text'] for c in cells[:4]])

    for c in cells:
        t.ck(c['fits'], 'ячейка кода шире столбца — значение обрезается краем: %s' % c['text'])
        t.ck(c['ellipsis'], 'у кода нет многоточия при нехватке места: %s' % c['text'])
        t.ck(c['title'], 'у кода нет подсказки с полным значением: %s' % c['text'])
        if c['cut']:
            t.ck(len(c['title']) >= len(c['text']),
                 'подсказка короче видимого текста: %s' % c['text'])

    # Формат свёртки: общее начало один раз, хвосты по возрастанию.
    for c in cells:
        if '(' not in c['text'] and '(' not in c['title']:
            continue
        value = c['title'] or c['text']
        m = re.match(r'^([\d-]+)-\(([\d, -]+)\)$', value)
        if not t.ck(m, 'свёрнутый код записан не по правилу: %s' % value):
            continue
        tails = [x.strip() for x in m.group(2).split(',')]
        t.ck(len(tails) > 1, 'в скобках один хвост — свёртка не нужна: %s' % value)
        t.ck(tails == sorted(tails), 'хвосты не по возрастанию: %s' % value)
        t.ck(len(set(tails)) == len(tails), 'хвост повторяется: %s' % value)

    # --- 9. длинные значения: многоточие и подсказка, а не обрыв краем ---
    #
    # Правило пользователя 05.09.2026 на весь макет. Смотрим и реестр, и перечень
    # ОИ в карточке: раньше там обрывались площадь, статус и код.
    CUT = r"""() => [...document.querySelectorAll('td, .reg-td, span')]
      .filter((e) => !e.children.length && e.scrollWidth > e.clientWidth + 1)
      .map((e) => ({
        text: e.textContent.trim().slice(0, 40),
        ellipsis: getComputedStyle(e).textOverflow === 'ellipsis',
        title: !!(e.title || (e.closest('[title]') && e.closest('[title]').title)),
      }))"""

    for where, route, wait in (('реестр', '#/', '.reg-thead'),
                               ('перечень ОИ', '#/oc/civil/oc-cv-1', '[data-open-oi]')):
        t.open(route, wait=wait)
        t.wait(500)
        for row in pg.evaluate(CUT):
            t.ck(row['ellipsis'] and row['title'],
                 '%s: «%s» обрезано без %s'
                 % (where, row['text'],
                    'многоточия' if not row['ellipsis'] else 'подсказки'))
