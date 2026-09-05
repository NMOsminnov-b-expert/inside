# -*- coding: utf-8 -*-
"""Пустое значение в списках выбора — одно и не задваивается.

Аудит справочников 05.09.2026 нашёл два способа сказать «пусто» в одном списке:

  * в перечнях материалов (конструктивный состав) первым значением стояло
    «Не указано», хотя поле — мультивыбор и пустой выбор он показывает сам
    («не выбрано»). Хуже: у нового строения «Не указано» было проставлено и
    считалось выбранным материалом — счётчик показывал 1;
  * в карточке участка к перечням с ответом «Нет»/«Отсутствует» (сервитуты,
    каменистость, доступность полива) разметка добавляла пункт «Не выбрано», и
    два пункта читались как дубль.

Решения пользователя: «Не указано» из перечней материалов убрать; пустой пункт
называется «Не выбрано» везде, а рядом с ответом «Нет»/«Отсутствует» —
«Не заполнено» (kernel/emptyOption.js считает подпись по значениям перечня).

Сценарий смотрит на то, что видно в списках на экране, а не на исходники:
перечни правятся из раздела «Справочники», и подпись пустого пункта считается
на лету.
"""
import re

NAME = 'пустые значения'

ROUTES = {
    'квартира': '#/oc/apartment/oc-ap-1',
    'жилой дом': '#/oc/residential-house/oc-rh-1',
    'гражданское': '#/oc/civil/oc-cv-1',
    'производственное': '#/oc/production/oc-pr-1',
    'участок': '#/oc/land-plot/oc-lp-1',
}

# Слова, которыми список говорит «значения нет».
EMPTY = ['не выбрано', 'не выбран', 'не выбрана', 'не указано', 'не указан',
         'не заполнено', 'не задано', 'нет данных', 'неизвестно', '—']
# Содержательные ответы «нет»: они значение, а не пустота.
ANSWER_NO = ['нет', 'отсутствует', 'отсутствуют']

COLLECT = r"""() => [...document.querySelectorAll('select')].map((s) => ({
  label: (s.closest('.field') && s.closest('.field').querySelector('label'))
    ? s.closest('.field').querySelector('label').textContent.replace(/\s+/g, ' ').trim()
    : (Object.keys(s.dataset)[0] || ''),
  opts: [...s.options].map((o) => o.textContent.trim()),
}))"""

MS_OPTS = r"""() => [...document.querySelectorAll('[data-struct-field]')].map((f) => ({
  key: f.dataset.structField,
  summary: f.querySelector('.ms-control').textContent.replace(/\s+/g, ' ').trim(),
  opts: [...f.querySelectorAll('[data-struct-opt]')]
    .map((c) => c.dataset.structOpt.split('|')[1]),
}))"""


def _norm(s):
    return re.sub(r'\s+', ' ', s.strip().lower().replace('ё', 'е'))


def _add(t, kind):
    pg = t.page
    pg.locator('[data-dd-toggle]').first.click()
    if not t.wait_for('[data-add-oi]'):
        return False
    item = pg.locator('[data-add-oi="%s"]' % kind)
    if not item.count():
        return False
    item.first.click()
    # Признак открытой карточки — сама стопка блоков. Ждать [data-status]
    # нельзя: у карточки участка статуса нет, и ожидание висело до таймаута,
    # хотя карточка была на экране.
    if not t.wait_for('.oi-stack'):
        return False
    t.wait(200)
    return True


def _check_selects(t, where):
    for s in t.page.evaluate(COLLECT):
        empties = [o for o in s['opts'] if _norm(o) in EMPTY]
        if len(empties) < 2:
            continue
        t.ck(False, '%s · «%s»: два пустых пункта в списке — %s'
             % (where, s['label'][:40], ' + '.join(empties)))

    # Подпись пустого пункта: рядом с ответом «Нет» она другая — иначе пункты
    # читаются как дубль.
    for s in t.page.evaluate(COLLECT):
        has_no = any(_norm(o) in ANSWER_NO for o in s['opts'])
        empties = [o for o in s['opts'] if _norm(o) in EMPTY]
        if not empties:
            continue
        want = 'не заполнено' if has_no else 'не выбрано'
        t.ck(_norm(empties[0]) == want,
             '%s · «%s»: пустой пункт назван «%s», ожидалось «%s»'
             % (where, s['label'][:40], empties[0], want))


def run(t):
    pg = t.page

    for oc, route in ROUTES.items():
        t.open(route, wait='[data-open-oi]')
        t.wait(300)
        if not t.ck(_add(t, 'Гражданское здание'), 'в %s не заводится строение' % oc):
            continue

        _check_selects(t, oc)

        # Перечни материалов: «Не указано» там больше не значение, а новое
        # строение не должно приходить с выбранным материалом.
        for f in pg.evaluate(MS_OPTS):
            bad = [o for o in f['opts'] if _norm(o) in EMPTY]
            t.ck(not bad, '%s · материалы «%s»: в перечне пустое значение %s'
                 % (oc, f['key'], bad))
            t.ck('не выбрано' in _norm(f['summary']),
                 '%s · материалы «%s»: у нового строения уже что-то выбрано (%s)'
                 % (oc, f['key'], f['summary']))

        # Износ: пустой пункт называется как везде.
        wear = pg.eval_on_selector_all(
            '[data-wear] option', 'els => els.map((e) => e.textContent.trim())')
        t.ck(wear and _norm(wear[0]) == 'не выбрано',
             '%s · износ: первый пункт «%s», ожидалось «Не выбрано»'
             % (oc, wear[0] if wear else '—'))

    # Карточка участка — там и нашлись пары «пустой пункт + ответ Нет».
    # Участок в записи может уже быть (тогда меню его не заводит) — открываем
    # существующий: сценарию нужна сама карточка, а не способ её создания.
    for oc, route in ROUTES.items():
        t.open(route, wait='[data-open-oi]')
        t.wait(300)

        opened = _add(t, 'Земельный участок')
        if not opened:
            row = pg.locator('[data-open-oi]:has-text("Земельный участок")')
            if row.count():
                row.first.click()
                opened = t.wait_for('.oi-stack')

        if not t.ck(opened, 'в %s не открывается карточка участка' % oc):
            continue
        _check_selects(t, oc + ' · участок')
