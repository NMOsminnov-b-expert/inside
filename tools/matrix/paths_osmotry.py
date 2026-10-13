# -*- coding: utf-8 -*-
"""Пути раздела «Осмотры» для матрицы путей (tools/matrix/paths.py).

Путь — шаги человека из сценария роли (записи графа scenarii-roli-*) и
проверки после шагов. Опора — правило APCS «не терять путь пользователя»
(практика matrica-putey-chto-ostalos-posle-deystviya): любой выход
возвращает туда же и с тем же состоянием; набранное не сбрасывается
побочным действием.

Путь: id, title, scenario (сценарий реестра), roles, touches, run(p).
"""
from urllib.parse import quote

from screens import PERSON

OTHER = 'Карабекова Анара Тариеловна'
_T = ('app/pages/inspections/', 'app/kernel/inspections', 'app/kernel/grid.js', 'app/kernel/router.js')
_TI = ('app/pages/inspector/', 'app/kernel/inspections', 'app/kernel/router.js')

# Видимое состояние панели осмотров — то, что человек держал бы в голове.
STATE_JS = """() => {
  const q = (s) => document.querySelector(s);
  const on = (a) => { const e = q(`[${a}][aria-selected="true"]`); return e ? e.getAttribute(a) : ''; };
  const sc = q('.ip-scroll');
  return {
    адрес: location.hash,
    раздел: on('data-ip-section'),
    подраздел: on('data-ip-tab') || on('data-ip-atab') || on('data-ip-ptab'),
    поиск: q('[data-ip-q]') ? q('[data-ip-q]').value : null,
    строк: document.querySelectorAll('[data-ip-row]').length,
    выбрано: q('tr.cur[data-ip-row]') ? q('tr.cur[data-ip-row]').getAttribute('data-ip-row') : '',
    прокрутка: sc ? Math.round(sc.scrollTop) : 0,
    фильтр: [...document.querySelectorAll('.kg thead input')].map((i) => i.value).join('|'),
    строк_таблицы: document.querySelectorAll('.kg tbody td[data-c="0"]').length,
    список_перейти: q('.ip-jump-list') ? !q('.ip-jump-list').hidden : false,
    запрос: q('.ip-people-list .on, .ip-people-list [aria-current="true"], .ip-people-list .cur') ? q('.ip-people-list .on, .ip-people-list [aria-current="true"], .ip-people-list .cur').textContent.trim().slice(0, 40) : '',
    панель_дня: !!q('.ip-detail-pane, .ip-pane .ipc-day-h, [data-ip-act-for]'),
    отборы: [...document.querySelectorAll('.ip-chip')].map((c) => c.firstChild.textContent.trim()).join(' | '),
  };
}"""

PATHS = []


def path(id_, title, scenario, roles=('rm', 'any'), touches=_T):
    def deco(fn):
        PATHS.append({'id': id_, 'title': title, 'scenario': scenario, 'roles': list(roles), 'touches': touches, 'run': fn})
        return fn
    return deco


def pick(d, *keys):
    return {k: d[k] for k in keys}


@path('queue-search-back', '«К назначению»: поиск → другой раздел → «Назад» браузера → поиск и строки те же', 'Р2')
def _(p):
    p.open('#/inspections?s=assign&t=queue', '[data-ip-q]')
    p.fill('[data-ip-q]', 'Бишкек')
    s1 = p.state()
    p.ck('поиск сузил очередь', s1['строк'] > 0, s1['строк'], '> 0')
    p.click('[data-ip-section="people"]')
    p.back()
    p.eq('очередь та же', pick(p.state(), 'раздел', 'подраздел', 'поиск', 'строк'), pick(s1, 'раздел', 'подраздел', 'поиск', 'строк'))


@path('assigned-scroll-back', '«Назначено»: прокрутка → «Осмотрщики» → «Назад» → прокрутка на месте', 'Р3')
def _(p):
    p.open('#/inspections?s=assign&t=assigned', '[data-ip-row]')
    top = p.scroll('.ip-scroll', 400)
    if not top:
        p.ck('список длиннее окна', False, 'не прокручивается', 'прокрутка > 0', soft=True)
        return
    s1 = p.state()
    p.click('[data-ip-section="people"]')
    p.back()
    p.eq('прокрутка и выбор на месте', pick(p.state(), 'подраздел', 'прокрутка', 'выбрано'), pick(s1, 'подраздел', 'прокрутка', 'выбрано'))


@path('table-filter-jump-back', 'Таблица: фильтр «ФИО» → «Перейти» к осмотрщику → «Назад» → фильтр и строки те же', 'Р10')
def _(p):
    p.open('#/inspections?s=people&t=table', '.kg td[data-r="0"]')
    p.fill('.kg thead input', 'а')
    s1 = p.state()
    p.ck('фильтр применён', s1['строк_таблицы'] > 0, s1['строк_таблицы'], '> 0')
    p.key('Control+KeyK')
    p.type(OTHER.split()[0])
    p.key('Enter')
    p.wait_until("() => location.hash.includes('p=')")
    p.back()
    p.wait_for('.kg td[data-r="0"]')
    p.eq('фильтр и строки', pick(p.state(), 'подраздел', 'фильтр', 'строк_таблицы'), pick(s1, 'подраздел', 'фильтр', 'строк_таблицы'))


@path('profile-draft-tab-back', 'Профиль: начатая правка → другой подраздел → «Назад» → введённое не пропало молча', 'Р9')
def _(p):
    p.open('#/inspections?s=people&p=%s&t=profile' % quote(PERSON), '[data-ip-c]')
    sel = p.first_text_input('[data-ip-c]')
    p.ck('в профиле есть поле ввода', bool(sel), sel, 'input[data-ip-c]')
    if not sel:
        return
    before = p.value(sel)
    p.click(sel)
    p.page.keyboard.press('End')
    p.page.keyboard.type(' 7')
    typed = p.value(sel)
    p.click('[data-ip-ptab="trips"]')
    warned = p.page.locator('.toast, [role=alert], [data-ip-dirty], .ip-dirty').count()
    p.back()
    p.wait_for(sel)
    now = p.value(sel)
    p.ck('введённое на месте или было предупреждение', now == typed or warned > 0, now, '%s (или предупреждение при уходе)' % typed)
    p.ck('исходное значение не испорчено', now in (typed, before), now, before)


@path('cadastre-select-back', 'Кадастр: выбрать запрос № 1 → «Уведомления» → «Назад» → выбран тот же запрос', 'Р5')
def _(p):
    p.open('#/inspections?s=cadastre', '[data-ip-section]')
    p.click_text('.ip-people-list li, .ip-people-list button', '№ 1')
    s1 = p.state()
    p.click('[data-ip-section="notes"]')
    p.back()
    p.eq('тот же запрос', pick(p.state(), 'адрес', 'запрос'), pick(s1, 'адрес', 'запрос'))


@path('jump-escape', '«Перейти»: Ctrl+K → ввод → Esc → список закрыт, поле пустое, вид тот же', 'Р4')
def _(p):
    p.open('#/inspections?s=assign&t=queue', '[data-ip-jump]')
    s1 = p.state()
    p.key('Control+KeyK')
    p.type('табл')
    p.ck('список открылся', p.state()['список_перейти'], False, True)
    p.key('Escape')
    s2 = p.state()
    p.eq('вид тот же, список закрыт', pick(s2, 'адрес', 'подраздел', 'список_перейти'), pick(s1, 'адрес', 'подраздел', 'список_перейти'))
    p.eq('поле пустое', p.value('[data-ip-jump]'), '')


@path('jump-eni-back', '«Перейти» по ЕНИ → объект в «Назначено» → «Назад» → прежний вид', 'Р4')
def _(p):
    p.open('#/inspections?s=people&t=summary', '[data-ip-jump]')
    s1 = p.state()
    eni = p.page.evaluate("async () => { const m = await import('./app/kernel/inspections.js'); const a = m.allAssignments().find((x) => x.state === 'assigned'); return a ? a.ocId : ''; }")
    p.open('#/inspections?s=assign&t=assigned', '[data-ip-row]')
    text = p.page.evaluate("() => { const re = /\\d[\\d-]{6,}\\d/; const r = [...document.querySelectorAll('[data-ip-row]')].find((x) => re.test(x.innerText)); return r ? r.innerText.match(re)[0] : ''; }")
    p.open('#/inspections?s=people&t=summary', '[data-ip-jump]')
    p.ck('есть ЕНИ для поиска', bool(text), text or eni, 'ЕНИ назначенного объекта')
    if not text:
        return
    p.click('[data-ip-jump]')
    p.type(text[:8])
    p.wait_for('.ip-jump-list:not([hidden]) li')
    p.key('Enter')
    p.wait_until("() => location.hash.includes('s=assign')")
    st = p.state()
    p.ck('объект выбран в «Назначено»', bool(st['выбрано']), st['выбрано'], 'выбранная строка')
    p.back()
    p.eq('прежний вид', pick(p.state(), 'адрес', 'подраздел'), pick(s1, 'адрес', 'подраздел'))


@path('calendar-day-close', 'Календарь осмотрщика: день → панель дня → Esc и «Закрыть» → панель закрыта, месяц тот же', 'Р8')
def _(p):
    p.open('#/inspections?s=people&p=%s&t=trips' % quote(PERSON), '[data-ip-section]')
    month = p.text('.ipc-cal-nav b')
    for how in ('Escape', 'Закрыть'):
        day = p.page.locator('.ipc-cal [data-ip-dp-open^="day:"]').nth(3)
        if not day.count():
            p.ck('в календаре есть дни', False, 0, '> 0')
            return
        day.click()
        p.wait(300)
        opened = p.page.locator('.ip-detail-pane').count()
        p.ck('панель дня открылась (%s)' % how, opened > 0, opened, '> 0')
        if how == 'Escape':
            p.key('Escape')
        else:
            p.click_text('.ip-detail-pane button', 'Закрыть')
        p.wait(300)
        p.eq('панель закрыта (%s)' % how, p.page.locator('.ip-detail-pane').count(), 0)
        p.eq('месяц тот же (%s)' % how, p.text('.ipc-cal-nav b'), month)


@path('inspector-task-back', 'Осмотрщик: задачи → задача → «Назад» → список на месте', 'О2', roles=('insp',), touches=_TI)
def _(p):
    p.open('#/insp?as=' + quote(PERSON), 'a[href^="#/insp/"]')
    h0 = p.page.evaluate('location.hash')
    n0 = p.page.locator('a[href^="#/insp/"]').count()
    p.page.locator('a[href^="#/insp/"]').first.click()
    p.wait_until("() => /#\\/insp\\/[^?]/.test(location.hash)")
    p.ck('ЕНИ в шапке задачи', p.page.locator('[data-ins-eni]').count() > 0, p.page.locator('[data-ins-eni]').count(), '> 0')
    p.back()
    p.wait_for('a[href^="#/insp/"]')
    p.eq('список тот же', [p.page.evaluate('location.hash'), p.page.locator('a[href^="#/insp/"]').count()], [h0, n0])


@path('queue-filters-back', '«К назначению»: отборы (район, площадь) → другой раздел → «Назад» → отборы и строки те же', 'Р2')
def _(p):
    p.open('#/inspections?s=assign&t=queue', '.ip-facets')
    p.open_filters()
    p.click('[data-ip-ff="district"]')
    p.page.locator('[data-ip-fr="area"][data-ip-fr-i="0"]').fill('50')
    p.page.locator('[data-ip-fr="area"][data-ip-fr-i="0"]').dispatch_event('change')
    p.wait(400)
    s1 = p.state()
    p.ck('отборы применены', s1['отборы'].count('|') >= 1, s1['отборы'], 'район | площадь')
    p.click('[data-ip-section="cadastre"]')
    p.back()
    p.eq('отборы и строки те же', pick(p.state(), 'подраздел', 'отборы', 'строк'), pick(s1, 'подраздел', 'отборы', 'строк'))


@path('queue-filter-set', '«К назначению»: сохранить набор → «Сбросить все» → набор одним щелчком → те же отборы и строки', 'Р2')
def _(p):
    p.open('#/inspections?s=assign&t=queue', '.ip-facets')
    p.open_filters()
    p.click('[data-ip-ff="type"]')
    p.click('[data-ip-ff="due"][data-ip-fv="none"]')
    s1 = p.state()
    p.click('[data-ip-set-new]')
    p.type('Проверка набора')
    p.key('Enter')
    p.ck('набор появился', p.page.locator('[data-ip-set]').count() == 1, p.page.locator('[data-ip-set]').count(), 1)
    p.click('[data-ip-freset]')
    p.ck('отборы сброшены', p.state()['отборы'] == '', p.state()['отборы'], '')
    p.click('[data-ip-set]')
    p.eq('набор вернул отборы и строки', pick(p.state(), 'отборы', 'строк'), pick(s1, 'отборы', 'строк'))
