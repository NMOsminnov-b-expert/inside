# -*- coding: utf-8 -*-
"""Перенос предметной области из макета в реестр knowledge/.

Источник сведений — работающий макет, а не комментарии в коде: скрипт
открывает экраны и записывает то, что на них видно. У каждой записи указано,
на каком экране и в каком блоке она встречается, — так её можно проверить
своими глазами.

    python tools/knowledge/migrate_from_mockup.py

Переносится два вида записей:

    понятие   типы объекта оценки, виды объекта имущества, роли, этапы,
              статусы, названия блоков карточек
    поле      названия полей со списком мест, где поле встречается

Справочники значений не переносятся — решение пользователя 15.09.2026.

Все записи получают статус «черновик»: их содержание снято машиной и должно
быть подтверждено человеком. Определения не выдумываются и остаются пустыми.
"""
import io
import os
import re
import subprocess
import sys
import time

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
KNOW = os.path.join(ROOT, 'knowledge')
PORT = 5598
TODAY = '2026-09-15'

MODULES = [
    ('apartment', 'ap', 'Жилое здание (квартира)'),
    ('residential-house', 'rh', 'Жилое здание (дом)'),
    ('civil', 'cv', 'Гражданское здание'),
    ('production', 'pr', 'Производственное строение'),
    ('land-plot', 'lp', 'Земельный участок'),
]

OI_KINDS = [
    ('land', 'Земельный участок'),
    ('flat', 'Квартира'),
    ('house', 'Жилой дом'),
    ('civil', 'Гражданское здание'),
    ('prod', 'Производственное строение'),
    ('other', 'Прочее строение'),
    ('mech', 'Механизмы и оборудование'),
    ('office', 'Офисная техника и мебель'),
]

# Имя файла — только латиница: кириллица в путях по-разному отображается в
# терминалах и git status (то же правило, что у файлов лога графа).
TRANSLIT = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '',
    'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
}


def slug(text, limit=60):
    out = []
    for ch in text.lower():
        if ch in TRANSLIT:
            out.append(TRANSLIT[ch])
        elif ch.isalnum() and ord(ch) < 128:
            out.append(ch)
        else:
            out.append('-')
    s = re.sub(r'-+', '-', ''.join(out)).strip('-')
    return s[:limit].strip('-') or 'zapis'


PROBE = r"""() => {
  const txt = (el) => {
    if (!el) return '';
    const copy = el.cloneNode(true);
    copy.querySelectorAll('.dev-note, .chev, .pill-mini, .fl-grip').forEach((n) => n.remove());
    return copy.textContent.replace(/\s+/g, ' ').trim();
  };

  const SKIP = /^data-(dd|ps|pick|ms|acc|card|field-err|open|to|add-photo|photo-pop|vsb|struct-opt|heat-opt|cat-all|floor-grip)/;

  const attrOf = (el) => {
    if (el.id) return '#' + el.id;
    const named = [...el.attributes]
      .filter((a) => a.name.startsWith('data-') && !SKIP.test(a.name));
    return named.length ? named[0].name : '';
  };

  const labelOf = (el) => {
    const field = el.closest('.field');
    if (field) {
      const lb = field.querySelector('label, .lbl');
      if (lb) return txt(lb);
    }
    const own = el.closest('label');
    if (own && txt(own)) return txt(own);
    const cell = el.closest('td');
    if (cell) {
      const table = cell.closest('table');
      const ths = table ? [...table.querySelectorAll('thead th')] : [];
      const head = ths[cell.cellIndex];
      if (head && txt(head)) return txt(head);
    }
    const headField = el.closest('.head-eni');
    if (headField) return txt(headField.querySelector('label'));
    const mode = el.closest('.aux-mode');
    if (mode) return txt(mode.querySelector('label'));
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    return '';
  };

  const kindOf = (el) => {
    if (el.tagName === 'TEXTAREA') return 'текст многострочный';
    if (el.tagName === 'SELECT') return 'выбор из списка';
    const t = (el.getAttribute('type') || 'text').toLowerCase();
    if (t === 'checkbox') return 'отметка';
    if (el.getAttribute('inputmode') === 'decimal') return 'число';
    if (el.getAttribute('inputmode') === 'numeric') return 'целое';
    if (el.hasAttribute('readonly')) return 'только чтение';
    return 'текст';
  };

  const unitOf = (label) => {
    const m = /,\s*(м²|м|%)\s*$/.exec(label || '');
    return m ? m[1] : '';
  };

  const blocks = [];
  document.querySelectorAll('.card').forEach((card) => {
    const head = txt(card.querySelector('h3'));
    if (!head) return;
    const fields = [];
    const seen = new Set();

    card.querySelectorAll('input, select, textarea').forEach((el) => {
      if (el.closest('thead')) return;
      const attr = attrOf(el);
      if (!attr) return;
      let label = labelOf(el);
      if (!label) return;
      const mark = attr + '|' + label;
      if (seen.has(mark)) return;
      seen.add(mark);
      const kind = kindOf(el);
      if (kind === 'отметка' && ['Авто', 'Считать площадь автоматически'].includes(label)) return;
      // Звёздочкой в конце подписи макет помечает обязательное поле. В
      // название она не входит: иначе «Наружные стены» и «Наружные стены*»
      // выглядят разными полями, хотя это одно и то же в разных карточках.
      const required = /\*\s*$/.test(label);
      label = label.replace(/\s*\*\s*$/, '');

      fields.push({
        подпись: label,
        обязательное: required,
        вид: kind,
        единица: unitOf(label),
        значений: el.tagName === 'SELECT'
          ? [...el.options].map((o) => o.textContent.trim()).filter((v) => v && v !== '—').length
          : 0,
        в_таблице: !!el.closest('tbody tr'),
      });
    });

    card.querySelectorAll('[data-struct-field]').forEach((el) => {
      const row = el.closest('tr');
      const raw = txt(row ? row.querySelector('td') : null);
      if (!raw || seen.has('struct|' + raw)) return;
      seen.add('struct|' + raw);
      // Звёздочка обязательности снимается и здесь: у материалов конструктива
      // подпись берётся из первой ячейки строки, и «Наружные стены*» иначе
      // выглядит отдельным полем.
      const label = raw.replace(/\s*\*\s*$/, '');
      fields.push({
        подпись: label,
        обязательное: /\*\s*$/.test(raw),
        вид: 'выбор из списка (несколько значений)',
        единица: '',
        значений: el.querySelectorAll('.ms-opt').length,
        в_таблице: true,
      });
    });

    blocks.push({ номер: txt(card.querySelector('.card-idx')), заголовок: head, поля: fields });
  });
  return blocks;
}"""

MENU_PROBE = r"""() => ({
  виды: [...new Set([...document.querySelectorAll('[data-add-oi]')].map((b) => b.dataset.addOi))],
  вкладки: [...document.querySelectorAll('.tabs .tab')]
    .map((t) => t.textContent.replace(/\s+/g, ' ').trim()),
  роли: [...new Set([...document.querySelectorAll('#role option, [data-role] option')]
    .map((o) => o.textContent.trim()).filter(Boolean))],
})"""


def collect():
    from playwright.sync_api import sync_playwright

    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd=ROOT,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)
    data = {'ОЦ': {}, 'ОИ': {}, 'меню': {}, 'роли': []}
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page(viewport={'width': 1600, 'height': 1200})
            base = 'http://127.0.0.1:%d/app.html' % PORT

            # роли — со страницы реестра, где их выбирают
            pg.goto(base + '#/oc/civil')
            pg.wait_for_timeout(1200)
            data['роли'] = pg.evaluate(
                """() => [...document.querySelectorAll('select')]
                     .flatMap((s) => [...s.options].map((o) => o.textContent.trim()))
                     .filter((t) => /осмотрщик|оценщик|ЦОД|учреждени|админ|роль/i.test(t))""")

            for mod, tag, title in MODULES:
                route = '#/oc/%s/oc-%s-all' % (mod, tag)
                pg.goto(base + route)
                pg.wait_for_selector('.card', timeout=20000)
                pg.wait_for_timeout(600)
                pg.evaluate("""() => document.querySelectorAll('.card.closed')
                    .forEach(c => c.classList.remove('closed'))""")
                data['ОЦ'][title] = {'маршрут': route, 'блоки': pg.evaluate(PROBE)}

                tog = pg.locator('[data-dd-toggle]')
                if tog.count():
                    tog.first.click()
                    pg.wait_for_timeout(300)
                data['меню'][title] = pg.evaluate(MENU_PROBE)

                pg.goto(base + route + '/form')
                pg.wait_for_selector('.card', timeout=20000)
                pg.wait_for_timeout(500)
                data['ОЦ'][title]['форма'] = pg.evaluate(PROBE)

                for suffix, kind in OI_KINDS:
                    r = '%s/oi/oi-%s-all-%s' % (route, tag, suffix)
                    pg.goto(base + r)
                    try:
                        pg.wait_for_selector('.oi-stack .card', timeout=6000)
                    except Exception:
                        continue
                    pg.wait_for_timeout(500)
                    pg.evaluate("""() => document.querySelectorAll('.card.closed')
                        .forEach(c => c.classList.remove('closed'))""")
                    data['ОИ'].setdefault(kind, {})[title] = {
                        'маршрут': r, 'блоки': pg.evaluate(PROBE)}
                print('  снято: %s' % title)
            b.close()
    finally:
        srv.terminate()
    return data


# Занятые идентификаторы: два разных термина не должны молча перезаписать друг
# друга — иначе запись пропадает, а по числу файлов это заметно не сразу.
TAKEN = {}


def write(folder, name, record):
    key = folder + '/' + name
    prev = TAKEN.get(key)
    if prev and prev != record['термин']:
        raise SystemExit(
            'Идентификатор «%s» уже занят термином «%s», а его просит «%s». '
            'Нужно развести их по разным идентификаторам.' % (key, prev, record['термин']))
    TAKEN[key] = record['термин']

    os.makedirs(os.path.join(KNOW, folder), exist_ok=True)
    path = os.path.join(KNOW, folder, name + '.yaml')
    io.open(path, 'w', encoding='utf-8', newline='\n').write(
        yaml.safe_dump(record, allow_unicode=True, sort_keys=False, width=100))
    return path


def migrate(data):
    made = {'понятие': 0, 'поле': 0}

    # --- понятия ------------------------------------------------------------
    concepts = []

    concepts.append({
        'термин': 'Объект оценки',
        'синонимы': ['ОЦ', 'запись'],
        'вид_понятия': 'основное понятие',
        'встречается': [{'экран': 'реестр объектов оценки', 'маршрут': '#/oc/civil'}],
    })
    concepts.append({
        'термин': 'Объект имущества',
        'синонимы': ['ОИ', 'литера'],
        'вид_понятия': 'основное понятие',
        'встречается': [{'экран': 'карточка объекта оценки, перечень ОИ',
                         'маршрут': data['ОЦ']['Гражданское здание']['маршрут']}],
    })

    for _, _, title in MODULES:
        concepts.append({
            'термин': title,
            'синонимы': [],
            'вид_понятия': 'тип объекта оценки',
            'встречается': [{'экран': 'карточка объекта оценки',
                             'маршрут': data['ОЦ'][title]['маршрут']}],
        })

    for kind, per_oc in data['ОИ'].items():
        where = [{'экран': 'карточка объекта имущества в «%s»' % t, 'маршрут': v['маршрут']}
                 for t, v in per_oc.items()]
        concepts.append({
            'термин': kind,
            'синонимы': [],
            'вид_понятия': 'вид объекта имущества',
            'встречается': where[:2],
        })

    blocks = {}
    for t, info in data['ОЦ'].items():
        for b in info['блоки'] + info.get('форма', []):
            blocks.setdefault(b['заголовок'], {})['Объект оценки'] = info['маршрут']
    for kind, per_oc in data['ОИ'].items():
        for t, v in per_oc.items():
            for b in v['блоки']:
                blocks.setdefault(b['заголовок'], {}).setdefault(kind, v['маршрут'])

    for name, where in blocks.items():
        concepts.append({
            'термин': name,
            'синонимы': [],
            'вид_понятия': 'блок карточки',
            'встречается': [{'экран': 'карточка «%s»' % obj, 'маршрут': route}
                            for obj, route in where.items()],
        })

    PREFIX = {
        'основное понятие': '',
        'тип объекта оценки': 'tip-oc-',
        'вид объекта имущества': 'vid-oi-',
        'блок карточки': 'blok-',
    }

    for c in concepts:
        rec = {
            'id': PREFIX.get(c['вид_понятия'], '') + slug(c['термин']),
            'вид': 'понятие',
            'термин': c['термин'],
            'синонимы': c['синонимы'],
            'вид_понятия': c['вид_понятия'],
            'определение': '',
            'статус': 'черновик',
            'источник': 'макет',
            'снято': TODAY,
            'встречается': c['встречается'],
        }
        write('concepts', rec['id'], rec)
        made['понятие'] += 1

    # --- поля ---------------------------------------------------------------
    fields = {}

    def add(label, meta, where):
        f = fields.setdefault(label, {
            'виды_значения': set(), 'единицы': set(), 'списки': set(),
            'в_таблице': False, 'места': {}, 'обязательно_в': [],
        })
        f['виды_значения'].add(meta['вид'])
        if meta['единица']:
            f['единицы'].add(meta['единица'])
        if meta['значений']:
            f['списки'].add(meta['значений'])
        f['в_таблице'] = f['в_таблице'] or meta['в_таблице']

        # Карточка объекта имущества одна и та же, из какой бы записи её ни
        # открыли: место определяется объектом и блоком, а тип записи — лишь
        # перечисляется. Иначе одно поле даёт двадцать пять одинаковых строк.
        key = (where['объект'], where['блок'], where['часть'])
        place = f['места'].setdefault(key, {
            'объект': where['объект'],
            'часть': where['часть'],
            'блок': where['блок'],
            'пример_экрана': where['маршрут'],
            'в_типах_записи': [],
        })
        if where['тип_записи'] not in place['в_типах_записи']:
            place['в_типах_записи'].append(where['тип_записи'])

        if meta.get('обязательное'):
            mark = '%s, блок «%s»' % (where['объект'], where['блок'])
            if mark not in f['обязательно_в']:
                f['обязательно_в'].append(mark)

    for t, info in data['ОЦ'].items():
        for src, part in (('блоки', 'карточка'), ('форма', 'форма записи')):
            # Форма записи — отдельный экран: её поля не видны в карточке, и
            # ссылка на карточку не даёт их проверить.
            route = info['маршрут'] + ('/form' if src == 'форма' else '')
            for b in info.get(src, []):
                for fl in b['поля']:
                    add(fl['подпись'], fl, {
                        'объект': 'Объект оценки',
                        'часть': part,
                        'блок': ('%s %s' % (b['номер'], b['заголовок'])).strip(),
                        'маршрут': route,
                        'тип_записи': t,
                    })

    for kind, per_oc in data['ОИ'].items():
        for t, v in per_oc.items():
            for b in v['блоки']:
                for fl in b['поля']:
                    add(fl['подпись'], fl, {
                        'объект': kind,
                        'часть': 'карточка объекта имущества',
                        'блок': ('%s %s' % (b['номер'], b['заголовок'])).strip(),
                        'маршрут': v['маршрут'],
                        'тип_записи': t,
                    })

    for label, f in fields.items():
        rec = {
            'id': 'pole-' + slug(label),
            'вид': 'поле',
            'термин': label,
            'синонимы': [],
            'определение': '',
            'статус': 'черновик',
            'источник': 'макет',
            'снято': TODAY,
            'тип_значения': sorted(f['виды_значения']),
            'единица': sorted(f['единицы'])[0] if f['единицы'] else '',
            'значений_в_списке': sorted(f['списки'])[-1] if f['списки'] else 0,
            'строка_таблицы': f['в_таблице'],
            'обязательное_в': f['обязательно_в'],
            'этап_заполнения': '',
            'встречается': list(f['места'].values()),
        }
        write('fields', rec['id'], rec)
        made['поле'] += 1

    return made


def main():
    print('Снимаю состав с экранов макета…')
    data = collect()
    print('\nПишу записи реестра…')
    made = migrate(data)
    for kind, n in made.items():
        print('  %s: %d' % (kind, n))
    print('\nреестр: %s' % os.path.relpath(KNOW, ROOT))


if __name__ == '__main__':
    main()
