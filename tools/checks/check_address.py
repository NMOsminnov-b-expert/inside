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

# Файлы, после правки которых сценарий обязателен (отбор в run.py --changed).
TOUCHES = (
    'app/kernel/address.js', 'app/kernel/eniFold.js', 'app/kernel/fmt.js',
    'app/modules/*/card/*', 'app/modules/*/oi/*', 'app/modules/*/records.js',
    'app/modules/*/data/*', 'app/pages/ocMenu/*',
)

ROUTES = {
    'квартира': '#/oc/apartment/oc-ap-1',
    'жилой дом': '#/oc/residential-house/oc-rh-1',
    'гражданское': '#/oc/civil/oc-cv-1',
    'производственное': '#/oc/production/oc-pr-1',
    'участок': '#/oc/land-plot/oc-lp-1',
}

# Длины кода ЕНИ выводятся из маски 1-2-2-4-4-2-3 (kernel/fmt.js).
ENI_LENGTHS = (13, 15, 18)


def unfold(value):
    """Развернуть свёрнутое значение обратно в отдельные коды.

    «1-47-56-1671-(0010, 0020)» → два кода целиком. Нужно, чтобы проверка длины
    смотрела на настоящие коды: свёрнутая строка сама по себе под маску не
    подходит, и без разворота неверный код прятался бы в скобках.
    """
    m = re.match(r'^([\d-]+?)-?\(([\d,\s-]+)\)$', value.strip())
    if not m:
        return [value.strip()]
    head, tails = m.group(1), m.group(2)
    return ['%s-%s' % (head, x.strip()) for x in tails.split(',') if x.strip()]


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

    # Блок «Местоположение»: адрес записи целиком здесь, включая улицу с домом
    # (решение пользователя 09.09.2026 — «в ОИ их не будет»).
    for sel, name in (('#fRegion', 'область'), ('#fDistrict', 'район'),
                      ('#fCity', 'город или село'), ('#fMicro', 'микрорайон'),
                      ('#fStreet', 'улица'), ('#fHouse', 'дом'), ('#fFlat', 'квартира'),
                      ('#fGps', 'координаты')):
        t.ck(pg.locator(sel).count() == 1, 'в форме ОЦ нет поля «%s»' % name)

    before = pg.input_value('[data-addr-sum]')
    t.ck('Киевская' in before and 'Бишкек' in before,
         'собранный адрес не показывает части записи: %s' % before)

    pg.fill('#fMicro', 'мкр. Проверочный')
    t.wait_until("""() => document.querySelector('[data-addr-sum]')
        .value.includes('Проверочный')""")
    t.ck('Проверочный' in pg.input_value('[data-addr-sum]'),
         'собранный адрес не обновляется по ходу ввода')

    # Вставленный адрес разбирается по полям — то, ради чего поле сделали
    # редактируемым.
    pg.fill('[data-addr-sum]', 'Ошская область, Ошский р-н, г. Ош, ул. Масалиева, д. 5, кв. 12')
    pg.dispatch_event('[data-addr-sum]', 'change')
    t.wait_until("""() => document.querySelector('#fStreet').value.includes('Масалиева')""")
    for sel, want in (('#fRegion', 'Ошская'), ('#fDistrict', 'Ошский'), ('#fCity', 'Ош'),
                      ('#fStreet', 'Масалиева'), ('#fHouse', '5'), ('#fFlat', '12')):
        t.ck(want in pg.input_value(sel),
             'вставленный адрес не разложился: в %s «%s» вместо «%s»'
             % (sel, pg.input_value(sel), want))

    # Маркер не удваивается: сборщик сам приписывает «ул.» и «д.».
    t.ck('ул. ул.' not in pg.input_value('[data-addr-sum]'),
         'в собранном адресе удвоился маркер улицы: %s' % pg.input_value('[data-addr-sum]'))

    # --- 2. координаты в карточках ОИ ---
    #
    # У литеры гражданского здания адресных полей больше нет — адрес общий на
    # запись. Свои координаты остались: они у каждого строения свои. Квартира и
    # участок правки не касались, их карточки общие на все типы ОЦ.
    t.open('#/oc/civil/oc-cv-1', wait='[data-open-oi]')
    t.wait(300)
    if t.ck(_add(t, 'Гражданское здание'), 'не заводится «Гражданское здание»'):
        t.wait(200)
        t.ck(pg.locator('[data-oi-street]').count() == 0,
             'у литеры снова появилась улица — адрес живёт в объекте оценки')
        t.ck(pg.locator('[data-oi-house]').count() == 0,
             'у литеры снова появился дом — адрес живёт в объекте оценки')
        t.ck(pg.locator('[data-oi-gps]').count() == 1, 'у литеры нет своих координат')

    for kind, sel in (('Квартира', '[data-oi-flat]'),
                      ('Земельный участок', '[data-oi-house]')):
        t.open('#/oc/civil/oc-cv-1', wait='[data-open-oi]')
        t.wait(300)
        if not t.ck(_add(t, kind), 'не заводится «%s»' % kind):
            continue
        t.wait(200)
        t.ck(pg.locator(sel).count() == 1, 'у «%s» нет поля %s' % (kind, sel))
        t.ck(pg.locator('[data-oi-gps], [data-land-gps]').count() >= 1,
             'у «%s» нет координат' % kind)

    # --- 3. правка адреса записи пересобирает шапку ---
    t.open('#/oc/civil/oc-cv-1/form', wait='#fStreet')
    pg.fill('#fStreet', 'Проверочная')
    pg.dispatch_event('#fStreet', 'change')
    pg.locator('#btnSaveOc').click()
    t.wait_until("""() => document.body.innerText.includes('Проверочная')""")
    t.ck('Проверочная' in pg.inner_text('[data-oc-head]'),
         'шапка не показала новый адрес записи')

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
    #
    # В шапке ОЦ с 08.09.2026 стоит не один код записи, а свёрнутые коды
    # целиком — её собственный и коды её литер. Поэтому значение сначала
    # разворачивается обратно в отдельные коды: длина каждого должна остаться
    # допустимой, иначе свёртка прятала бы неверный код.
    for oc, route in ROUTES.items():
        t.open(route, wait='.hm b')
        t.wait(300)
        shown = pg.evaluate("""() => [...document.querySelectorAll('.hm b, .ctx-plate-eni b')]
            .map((e) => e.textContent.trim())
            .filter((x) => /^\\d[\\d-]*(\\s*\\([\\d,\\s-]+\\))?$/.test(x))""")
        t.ck(shown, 'в %s не нашёлся код ЕНИ' % oc)
        for value in shown:
            for c in unfold(value):
                n = len(re.sub(r'\D', '', c))
                t.ck(n in ENI_LENGTHS,
                     'в %s код ЕНИ «%s» (из «%s») из %d цифр, допустимо %s'
                     % (oc, c, value, n, ', '.join(map(str, ENI_LENGTHS))))

    # --- 6б. шапка ОЦ и реестр показывают ОДНО значение ---
    #
    # Решение пользователя 08.09.2026: «свёрнутые коды в шапке ОЦ показываем».
    # Считает их ядро (kernel/eniFold.js, eniAllOf), и сторожим мы именно то,
    # что оба места читают один источник: разойдясь, они дали бы человеку два
    # разных «кода записи» на одну запись.
    t.open('#/', wait='.reg-thead')
    t.wait(400)
    # Строка реестра помечена data-row="<тип ОЦ>|<id записи>" — из этого же
    # складывается маршрут карточки, поэтому сверять есть с чем.
    in_reg = pg.evaluate("""() => {
      const out = {};
      document.querySelectorAll('.reg-tr').forEach((tr) => {
        const cell = tr.querySelector('.reg-td .mono');
        if (cell) out[tr.dataset.row] = (cell.getAttribute('title')
          || cell.textContent).trim();
      });
      return out;
    }""")

    for oc, route in ROUTES.items():
        t.open(route, wait='.hm b')
        t.wait(300)
        # Искать поле по подписи целиком, а не по вхождению «ЕНИ»: оно есть и в
        # слове «назначЕНИе по ТП», и первая версия проверки читала именно его.
        head_eni = pg.evaluate("""() => {
          const box = [...document.querySelectorAll('[data-oc-head] .hm')]
            .find((h) => {
              const lbl = h.querySelector('.lbl, label');
              return lbl && lbl.textContent.trim() === 'Код ЕНИ';
            });
          if (!box) return null;
          const b = box.querySelector('b');
          return { text: b.textContent.trim(), title: (b.title || '').trim() };
        }""")
        if not t.ck(head_eni, 'в %s в шапке нет поля кода ЕНИ' % oc):
            continue

        t.ck(head_eni['title'] == head_eni['text'],
             'в %s у кода ЕНИ в шапке нет подсказки с полным значением: «%s» / «%s»'
             % (oc, head_eni['text'], head_eni['title']))

        # '#/oc/civil/oc-cv-1' → 'civil|oc-cv-1'
        parts = route.strip('#/').split('/')
        want = in_reg.get('%s|%s' % (parts[1], parts[2])) if len(parts) > 2 else None
        if t.ck(want, 'в реестре не нашлась строка записи %s' % route):
            t.ck(want == head_eni['title'],
                 'в %s шапка и реестр показывают разные коды: «%s» и «%s»'
                 % (oc, head_eni['title'], want))

    # --- 7. столбцы реестра: тип земель и свёрнутые коды ---
    t.open('#/', wait='.reg-thead')
    t.wait(400)
    # --- 7. тип земель припиской к типу ОЦ ---
    #
    # Уточнение пользователя 05.09.2026: отдельного столбца нет, тип земель
    # дописывается к типу объекта оценки — «Земельный участок · с/х». Считается
    # по участкам записи: у записи без участков приписки нет.
    head = pg.locator('.reg-thead').inner_text().upper()
    t.ck('ТИП ЗЕМЕЛЬ' not in head,
         'вернулся отдельный столбец типа земель — приписка идёт в типе ОЦ')

    rows = pg.evaluate("""() => [...document.querySelectorAll('.reg-tr')].map((tr) => {
      const cell = tr.querySelector('.reg-type');
      if (!cell) return null;
      const sub = cell.querySelector('.reg-sub');
      return {
        type: (cell.querySelector('.ell') || cell).textContent.trim(),
        sub: sub ? sub.textContent.trim() : '',
        full: cell.getAttribute('title') || '',
      };
    }).filter(Boolean)""")

    withSub = [r for r in rows if r['sub']]
    t.ck(withSub, 'ни у одной записи нет приписки типа земель')

    for row in withSub:
        t.ck(row['sub'] in ('с/х', 'не с/х', 'смеш.'),
             'приписка типа земель записана иначе: %s' % row['sub'])
        t.ck('·' in row['full'], 'приписка не отделена от типа ОЦ: %s' % row['full'])
        # Приписка только у типа ОЦ «Земельный участок»: у здания участок под ним
        # — часть объекта, а не то, чем объект является (уточнение пользователя
        # 05.09.2026).
        t.ck('емельный участок' in row['type'],
             'приписка типа земель у типа «%s», а должна быть только у участка'
             % row['type'])

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
