# -*- coding: utf-8 -*-
"""
Веб-страница осмотрщика (pages/osmotr/osmotr.js) — перенос приложения «Осмотр»
в веб, этап 1 (16.11.2026): «Мои объекты» (до 18.11.2026 — «Сегодня»), «Выезды», поиск, меню, входящие, объект
и документы для выезда. Образец вида — мобильный вид стенда E•state.

Что ловит сценарий:
  * отбор по типам объектов (недвижимое, транспорт, оборудование) в «Выездах»
    не сходится с назначенными объектами или не отбирает; на главной он есть
    (его там быть не должно — 16.11.2026);
  * главная «Мои объекты» (18.11.2026): заголовок не «Объекты к осмотру», вкладка
    внизу не «Мои объекты»; в списке «В работе» не только начатые («В работе»
    и «На доосмотр») — туда попал не начатый объект или не попал начатый;
  * «Просрочено» считает не те назначения;
  * статистика осмотрщика (18.11.2026): строки «Статистика» нет в «Моих
    задачах» или она не ведёт на экран; на экране не три группы (объём,
    отчёты дня, дорога), числа расходятся с расчётом экрана статистики
    регионального менеджера (statsData.statsFor), переключатель периода и
    шаг назад не меняют период; «День» — не сегодняшний или шаг назад не
    открывает вчера; «Осмотрено по счетам» (18.11.2026): отметка описи
    «осмотрено» не прибавляет к своему счёту (31123 — отдельно 31123120 и
    31123130, 19.11.2026; остальное — 31122) или мебель прибавляет; есть сравнение с командой (медиана) — его
    осмотрщику не показывают;
  * «К осмотру / Осмотрено / Все» — не те строки;
  * отбор по подведомственным в «Выездах» (18.11.2026: «по подведкам
    делай»): в панели не все пары «учреждение · подведомственная» (или само
    учреждение) назначенных объектов; две отмеченные вместе с типом
    «Недвижимое» показывают не те объекты или не те числа во вкладках и
    типах; смена вкладки теряет отбор; «Сбросить всё» его не снимает;
  * вид фильтров (18.11.2026, «красивее сделай»): учреждения не раскрываются,
    крестик на плашке выбранного не снимает одну подведомственную, «Показать
    N» показывает не число строк списка или не сворачивает панель; отметка
    в панели прокручивает экран наверх («страница прыгает» — 18.11.2026);
  * несколько типов сразу (18.11.2026: «тип имущества тоже должен чекбоксом
    выделяться»): чекбокс «Транспорт» в панели не добавляет ТС к уже
    выбранному «Недвижимому» у тех же подведомственных, кнопка типа не
    снимает свой тип;
  * какой-то из назначенных объектов не открывается (сведения участка по
    Кадастру, ТС, описи — 16.11.2026 падал объект со сведениями участка);
  * в объекте нет ЕНИ, состояния, вкладки документов, документ с файлом не
    открывается во всю страницу;
  * осмотрщику видны данные карточки ЦОД (класс, площадь по документам,
    конструктив, износ) — решение 16.11.2026 «Осмотрщик видит СЛИШКОМ много»;
  * поиск ищет не по своим выездам;
  * пункты меню «Недвижимое / Транспорт / Оборудование» ведут не к спискам
    назначенного к осмотру;
  * «Входящие» не снимают значок новых; во входящих, запросах документов, отчёте дня нет «Назад» на тот экран, откуда пришли (20.11.2026);
  * прежний адрес #/insp не открывает страницу; на 360 и 400 пикселях страница
    прокручивается вбок; на широком экране колонка шире 480.
"""
from urllib.parse import quote

from harness import use_cadastre_fixture

NAME = 'страница осмотрщика (веб)'

TOUCHES = (
    'app/pages/osmotr/*', 'app/pages/inspection/tasks.js', 'app/kernel/inspections.js', 'app/kernel/inspectionResults.js',
    'app/kernel/session.js', 'app/kernel/router.js', 'app/kernel/boot.js', 'app/kernel/mapgl.js',
)

DATA = "await import('./app/pages/osmotr/data.js')"
OBJS = """async () => { const d = %s; const s = (await import('./app/kernel/session.js')).session.state;
  return d.myObjects(s.person).map((o) => ({ id: o.id, entity: o.entity, state: o.state, removed: o.removed, plannedAt: o.plannedAt,
    title: o.title, eni: o.eni, head: o.head, podved: o.podved, docs: o.docs.length, inv: (o.inventories || []).length, returned: (o.returned || []).length })); }""" % DATA


def iso(days=0):
    import datetime
    return (datetime.date.today() + datetime.timedelta(days=days)).isoformat()


def run(t):
    pg = t.page
    use_cadastre_fixture(pg)
    pg.set_viewport_size({'width': 400, 'height': 860})
    t.open('#/osmotr', wait='.om-app[data-v="today"]')

    # --- данные: просроченный выезд (вчерашняя дата у открытого назначения) и начатый осмотр
    # у другого объекта; третий открытый объект остаётся не начатым ---
    made = pg.evaluate("""async (day) => {
      const k = await import('./app/kernel/inspections.js');
      const s = (await import('./app/kernel/session.js')).session.state;
      const open = k.assignmentsOfPerson(s.person).filter((x) => x.state !== 'done');
      const keys = [...new Set(open.map((x) => x.typeId + '|' + x.ocId))];
      if (keys.length < 2) return null;
      const a = open.find((x) => x.typeId + '|' + x.ocId === keys[0]);
      k.takeForDay(a.id, day);
      const [typeId, ocId] = keys[1].split('|');
      k.startWork(s.person, typeId, ocId); k.changed();
      return { late: keys[0], started: keys[1] };
    }""", iso(-1))
    t.ck(made, 'у осмотрщика меньше двух открытых объектов — сценарию не на чем проверять')
    late, started = made['late'], made['started']
    t.ck(t.wait_until("(k) => [...document.querySelectorAll('.om-list .om-obj')].some((e) => decodeURIComponent(e.getAttribute('href')).includes(k))", started),
         'начатый объект %s не появился в «В работе»' % started)
    objs = pg.evaluate(OBJS)
    t.ck(len(objs) > 0, 'назначенных объектов нет')

    # --- главная «Мои объекты»: без отбора по типам (16.11.2026: «На экране сегодня их по идее не будет») ---
    t.ck(pg.locator('.om-segs').count() == 0, 'на главной есть отбор по типам — он только там, где видны объекты')
    t.ck(pg.locator('.om-h1', has_text='Объекты к осмотру').count() == 1, 'заголовок главной — не «Объекты к осмотру»')
    t.ck(pg.locator('.om-btab.on', has_text='Мои объекты').count() == 1, 'вкладка внизу — не «Мои объекты»')
    work = [o for o in objs if not o['removed'] and o['state'] != 'done' and (o['state'] == 'progress' or o['returned'])]
    shown = pg.eval_on_selector_all('.om-list .om-obj', 'els => els.map((e) => decodeURIComponent(e.getAttribute("href")))')
    t.ck(len(shown) == len(work), '«В работе»: %d строк, начатых объектов %d' % (len(shown), len(work)))
    t.ck(any(started in h for h in shown), 'начатый объект %s не в списке «В работе»' % started)
    idle = [o['id'] for o in objs if o['state'] == 'assigned' and not o['returned'] and not o['removed']]
    t.ck(not any(i in h for i in idle for h in shown), 'в «В работе» попал не начатый объект')
    t.ck(pg.locator('.om-row', has_text='Просрочено').count() == 1, 'на главной нет «Просрочено» при просроченном выезде')
    # «Все мои объекты» на главной нет — это вкладка «Выезды» → «Все» (пользователь 20.11.2026).
    t.ck(pg.locator('.om-row', has_text='Все мои объекты').count() == 0, 'на главной осталась строка «Все мои объекты» — дубль «Выездов»')

    # --- статистика: строка в «Моих задачах» → экран; те же числа, что у регионального менеджера ---
    STATS = """async ([u, o]) => { const d = await import('./app/pages/inspections/statsData.js');
      const s = (await import('./app/kernel/session.js')).session.state;
      const day = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
      const p = u === 'day' ? { from: day(o), to: day(o), upto: day(o), label: '' } : d.periodOf(u, o); const r = d.statsFor(new Map(), [s.person], p).rows[0];
      return { label: p.label, v: [r.objects, r.oi, r.workdays, r.oiPerDay, r.repOnTime, r.repLate, r.repMissed, r.repShare, r.km, r.litres, r.kmPerObj, r.lPerObj]
        .map((x, i) => d.fmtMetric(x, [3, 7].includes(i) ? (i === 7 ? 'pct' : 'dec') : [8, 9, 10, 11].includes(i) ? 'dec' : 'int')) }; }"""
    row = pg.locator('.om-row', has_text='Статистика')
    t.ck(row.count() == 1, 'в «Моих задачах» нет строки «Статистика»')
    month = pg.evaluate(STATS, ['month', 0])
    t.ck(('объектов %s' % month['v'][0]) in row.inner_text(), 'строка «Статистика»: %r, объектов за месяц %s' % (row.inner_text(), month['v'][0]))
    row.click()
    t.ck(t.wait_until("() => document.querySelector('.om-app')?.dataset.v === 'stats'"), '«Статистика» не открыла экран')
    def stat_screen():
        return pg.evaluate("""() => ({ label: document.querySelector('.om-daynav b')?.textContent,
          groups: [...document.querySelectorAll('.om-sec')].map((h) => h.textContent),
          v: [...document.querySelectorAll('.om-stat:not(.om-acc) .om-n')].map((e) => e.textContent) })""")
    scr = stat_screen()
    t.ck(scr['groups'] == ['Осмотрено по счетам, ед.', 'Объём', 'Отчёты дня', 'Дорога'], 'группы статистики: %s' % scr['groups'])
    t.ck(scr['label'] == month['label'] and scr['v'] == month['v'], 'месяц на экране %s %s, расчёт %s %s' % (scr['label'], scr['v'], month['label'], month['v']))
    t.ck(pg.locator('.om-bnav').count() == 0, 'на экране статистики — нижняя панель разделов (это вложенный экран)')
    t.ck('медиан' not in pg.locator('.om-scr').inner_text().lower(), 'осмотрщику показано сравнение с командой')
    pg.locator('.om-segs .om-seg', has_text='Неделя').click()
    week = pg.evaluate(STATS, ['week', 0])
    t.ck(t.wait_until("(l) => document.querySelector('.om-daynav b')?.textContent === l", week['label']), '«Неделя» не переключила период')
    t.ck(stat_screen()['v'] == week['v'], 'неделя: на экране %s, расчёт %s' % (stat_screen()['v'], week['v']))
    pg.locator('.om-daynav a[aria-label="Предыдущий период"]').click()
    prev = pg.evaluate(STATS, ['week', 1])
    t.ck(t.wait_until("(l) => document.querySelector('.om-daynav b')?.textContent === l", prev['label']), 'шаг назад не открыл прошлую неделю')
    t.ck(stat_screen()['v'] == prev['v'], 'прошлая неделя: на экране %s, расчёт %s' % (stat_screen()['v'], prev['v']))
    # День: сегодня и шаг назад — вчера (18.11.2026: «за сегодня тоже сделай»).
    pg.locator('.om-segs .om-seg', has_text='День').click()
    t.ck(t.wait_until("() => (document.querySelector('.om-daynav b')?.textContent || '').startsWith('Сегодня')"), '«День» открыл не сегодня')
    # за день рабочих дней и ОИ на рабочий день нет (третий и четвёртый показатели)
    today_v = [x for i, x in enumerate(pg.evaluate(STATS, ['day', 0])['v']) if i not in (2, 3)]
    t.ck(stat_screen()['v'] == today_v, 'сегодня: на экране %s, расчёт %s' % (stat_screen()['v'], today_v))
    pg.locator('.om-daynav a[aria-label="Предыдущий период"]').click()
    t.ck(t.wait_until("() => /[?&]u=day&o=1/.test(location.hash) && !(document.querySelector('.om-daynav b')?.textContent || '').startsWith('Сегодня')"), 'шаг назад от сегодня не открыл вчера')
    yest_v = [x for i, x in enumerate(pg.evaluate(STATS, ['day', 1])['v']) if i not in (2, 3)]
    t.ck(stat_screen()['v'] == yest_v, 'вчера: на экране %s, расчёт %s' % (stat_screen()['v'], yest_v))

    # По счетам (18.11.2026): отметки описи «осмотрено» сегодня — компьютер в 31123130, МФУ в 31123120, котёл в 31122 по
    # количеству в позиции, мебель не учитывается; числа на экране — те же, что у расчёта accountsFor.
    def acc_screen():
        return pg.evaluate("() => Object.fromEntries([...document.querySelectorAll('.om-acc')].map((e) => [e.querySelector('small').textContent, +e.querySelector('.om-n').textContent]))")
    t.open('#/osmotr?v=stats&u=day', wait='.om-app[data-v="stats"]')
    acc0 = acc_screen()
    t.ck(sorted(acc0) == ['31111', '31112', '31121', '31122', '31123120', '31123130'], 'счета на экране: %s' % sorted(acc0))
    made_inv = pg.evaluate("""async () => {
      const iv = await import('./app/kernel/inventories.js');
      const s = (await import('./app/kernel/session.js')).session.state;
      const pick = (f) => { for (const inv of iv.allInventories()) { const it = inv.items.find((x) => f(x) && !iv.markOf(inv.id, x.id)); if (it) return [inv.id, it]; } return null; };
      const comp = pick((x) => x.acc === '31123130'); const office = pick((x) => x.acc === '31123120');
      const boil = pick((x) => x.acc === '31122100' && x.kind !== 'Мебель'); const furn = pick((x) => x.kind === 'Мебель');
      if (!comp || !office || !boil || !furn) return null;
      [comp, office, boil, furn].forEach(([id, it]) => iv.markItem(id, it.id, { state: 'seen' }, { by: s.person }));
      (await import('./app/kernel/inspections.js')).changed();
      return { comp: comp[1].qty || 1, office: office[1].qty || 1, boil: boil[1].qty || 1 };
    }""")
    t.ck(made_inv, 'в описях нет компьютера, оргтехники, оборудования и мебели без отметки — не на чем проверять счета')
    # Тот же адрес не перерисовывает экран — сначала на главную.
    t.open('#/osmotr', wait='.om-app[data-v="today"]')
    t.open('#/osmotr?v=stats&u=day', wait='.om-app[data-v="stats"]')
    acc1 = acc_screen()
    t.ck(acc1['31123130'] - acc0['31123130'] == made_inv['comp'], '31123130: было %d, стало %d, отмечен компьютер ×%d' % (acc0['31123130'], acc1['31123130'], made_inv['comp']))
    t.ck(acc1['31123120'] - acc0['31123120'] == made_inv['office'], '31123120: было %d, стало %d, отмечена оргтехника ×%d' % (acc0['31123120'], acc1['31123120'], made_inv['office']))
    t.ck(acc1['31122'] - acc0['31122'] == made_inv['boil'], '31122: было %d, стало %d, отмечено оборудование ×%d (мебель не считается)' % (acc0['31122'], acc1['31122'], made_inv['boil']))
    calc = pg.evaluate("async () => { const d = await import('./app/pages/inspections/statsData.js'); const s = (await import('./app/kernel/session.js')).session.state; const t = new Date(); const day = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; return d.accountsFor(s.person, { from: day, to: day }); }")
    t.ck(acc1 == calc, 'по счетам: на экране %s, расчёт %s' % (acc1, calc))
    t.open('#/osmotr', wait='.om-app[data-v="today"]')

    # --- выезды: отбор по типам ---
    t.open('#/osmotr?v=trips&s=all', wait='.om-app[data-v="trips"]')
    def chip_n(label):
        txt = pg.locator('.om-segs .om-seg', has_text=label).first.inner_text()
        return int(''.join(ch for ch in txt.split()[-1] if ch.isdigit()) or 0)
    t.ck(chip_n('Все') == len(objs), '«Все» в отборе: %s, назначено объектов %d' % (chip_n('Все'), len(objs)))
    real = [o for o in objs if o['entity'] == 'real']
    veh = [o for o in objs if o['entity'] == 'vehicle']
    inv = [o for o in objs if o['entity'] == 'inventory' or o['inv']]
    t.ck(chip_n('Недвижимое') == len(real), '«Недвижимое»: %d, ожидалось %d' % (chip_n('Недвижимое'), len(real)))
    t.ck(chip_n('Транспорт') == len(veh), '«Транспорт»: %d, ожидалось %d' % (chip_n('Транспорт'), len(veh)))
    t.ck(chip_n('Оборудование') == len(inv), '«Оборудование» (описи и механизмы): %d, ожидалось %d' % (chip_n('Оборудование'), len(inv)))
    pg.locator('.om-segs .om-seg', has_text='Транспорт').click()
    t.ck(t.wait_until("() => /[?&]f=vehicle/.test(location.hash) && document.querySelector('.om-seg.on')?.textContent.includes('Транспорт')"),
         'отбор «Транспорт» не включился')
    open_veh = [o for o in veh if o['state'] != 'done' and not o['removed']]
    t.ck(pg.locator('.om-obj').count() == len(open_veh), '«Транспорт» к осмотру: %d строк, ожидалось %d' % (pg.locator('.om-obj').count(), len(open_veh)))

    # --- выезды: подведомственные (несколько, чекбоксами) вместе с типом ---
    t.open('#/osmotr?v=trips', wait='.om-app[data-v="trips"]')
    pg.locator('[data-trip-filters]').click()
    t.ck(t.wait_until("() => !!document.getElementById('om-trip-filters')"), 'кнопка фильтра не открыла панель подведомственных')
    org_of = lambda o: ((o['head'] or 'Без учреждения') + (' · ' + o['podved'] if o['podved'] else ''))
    orgs = sorted({org_of(o) for o in objs})
    # Учреждения свёрнуты (18.11.2026, «красивее сделай») — раскрыть все; каждое раскрытие перерисовывает панель.
    for _ in range(60):
        closed = pg.locator('[data-head-toggle][aria-expanded="false"]')
        if not closed.count():
            break
        n_closed = closed.count()
        closed.first.click()
        t.wait_until("() => document.querySelectorAll('[data-head-toggle][aria-expanded=\"false\"]').length === %d" % (n_closed - 1))
    t.ck(pg.locator('[data-head-toggle][aria-expanded="false"]').count() == 0, 'учреждения в панели не раскрываются')
    shown_orgs = sorted(pg.eval_on_selector_all('[data-org]', 'els => els.map((e) => e.value)'))
    t.ck(shown_orgs == orgs, 'подведомственные в панели %s, у объектов %s' % (shown_orgs, orgs))
    real_orgs = sorted({org_of(o) for o in objs if o['entity'] == 'real'}, key=lambda h: -sum(1 for o in objs if o['entity'] == 'real' and org_of(o) == h))
    # Вторая — с транспортом, если такая есть: на ней проверяется выбор двух типов сразу.
    veh_orgs = [h for h in sorted({org_of(o) for o in objs if o['entity'] == 'vehicle'}) if h != real_orgs[0]]
    pick = [real_orgs[0], veh_orgs[0] if veh_orgs else real_orgs[1]]
    t.ck(len(set(pick)) == 2, 'меньше двух подведомственных — нечего отбирать вместе')
    for i, h in enumerate(pick):
        box = pg.locator('[data-org][value="%s"]' % h.replace('"', '\\"'))
        # Прокрутка — скриптом: панель перерисовывается по событиям данных, ссылка на узел устаревает.
        y0 = pg.evaluate("(v) => { const el = [...document.querySelectorAll('[data-org]')].find((x) => x.value === v); el.scrollIntoView({ block: 'center' }); return document.querySelector('.om-scr').scrollTop; }", h)
        box.check()
        t.wait_until("() => decodeURIComponent(location.hash).split('i=')[1]?.split('|').length === %d" % (i + 1))
        y1 = pg.evaluate("() => document.querySelector('.om-scr').scrollTop")
        t.ck(abs(y1 - y0) < 2, 'отметка в фильтре сбросила прокрутку: было %d, стало %d' % (y0, y1))
    pg.locator('.om-segs .om-seg', has_text='Недвижимое').click()
    t.ck(t.wait_until("() => /f=real/.test(location.hash) && /[?&]i=/.test(location.hash) && document.querySelector('.om-seg.on')?.textContent.includes('Недвижимое')"),
         'тип «Недвижимое» сбросил отбор по подведомственным')
    sel = [o for o in objs if org_of(o) in pick]
    want = [o for o in sel if o['entity'] == 'real' and o['state'] != 'done' and not o['removed']]
    t.ck(pg.locator('.om-obj').count() == len(want), 'подведомственные + недвижимое, к осмотру: %d строк, ожидалось %d' % (pg.locator('.om-obj').count(), len(want)))
    t.ck(chip_n('Все') == len(sel), 'тип «Все» при отборе подведомственных: %d, ожидалось %d' % (chip_n('Все'), len(sel)))
    # Два типа сразу: чекбокс «Транспорт» в панели добавляет ТС к недвижимому у тех же подведомственных.
    pg.locator('[data-kind][value="vehicle"]').check()
    t.ck(t.wait_until("() => /f=real%7Cvehicle|f=real\\|vehicle/.test(location.hash) && /[?&]i=/.test(location.hash) && document.querySelectorAll('.om-seg.on').length === 2"),
         'чекбокс «Транспорт» не добавил тип к «Недвижимому»')
    want2 = [o for o in sel if o['entity'] in ('real', 'vehicle') and o['state'] != 'done' and not o['removed']]
    t.ck(pg.locator('.om-obj').count() == len(want2), 'недвижимое + транспорт у подведомственных, к осмотру: %d строк, ожидалось %d' % (pg.locator('.om-obj').count(), len(want2)))
    t.ck(pg.locator('.om-h1', has_text='Мне осмотреть').count() == 1, 'при двух типах заголовок — не «Мне осмотреть»')
    pg.locator('.om-segs .om-seg', has_text='Транспорт').click()
    t.ck(t.wait_until("() => /f=real(&|$)/.test(location.hash) && !document.querySelector('[data-kind][value=vehicle]:checked')"), 'кнопка «Транспорт» не сняла свой тип')
    pg.locator('.om-tab3', has_text='Все').click()
    t.ck(t.wait_until("() => /s=all/.test(location.hash) && /[?&]i=/.test(location.hash) && document.querySelector('.om-tab3.on')?.textContent.startsWith('Все')"),
         'вкладка «Все» потеряла отбор по подведомственным')
    n_all = len([o for o in sel if o['entity'] == 'real'])
    t.ck(pg.locator('.om-obj').count() == n_all, 'подведомственные + недвижимое, все: %d строк, ожидалось %d' % (pg.locator('.om-obj').count(), n_all))
    # Выбранное — плашками: крестик снимает одну подведомственную, остальные остаются.
    t.ck(pg.locator('.om-fchip').count() == 2, 'плашек выбранных подведомственных: %d, отмечено 2' % pg.locator('.om-fchip').count())
    pg.locator('.om-fchip').first.click()
    t.ck(t.wait_until("() => decodeURIComponent(location.hash).split('i=')[1]?.split('&')[0].split('|').length === 1 && document.querySelectorAll('.om-fchip').length === 1"),
         'крестик на плашке не снял подведомственную')
    # Плашки — в порядке панели (по учреждениям), не в порядке отметок: оставшаяся — из адреса.
    left = pg.evaluate("() => decodeURIComponent(location.hash).split('i=')[1].split('&')[0]")
    t.ck(left in pick, 'после снятия плашки в отборе %r — не из отмеченных' % left)
    rest = [o for o in objs if org_of(o) == left and o['entity'] == 'real']
    t.ck(t.wait_until("() => document.querySelectorAll('.om-obj').length === %d" % len(rest)), 'после снятия плашки: %d строк, ожидалось %d' % (pg.locator('.om-obj').count(), len(rest)))
    # «Показать N» — число строк списка, кнопка сворачивает панель.
    btn = pg.locator('.om-ffoot [data-trip-filters]')
    t.ck(btn.inner_text().strip() == 'Показать %d' % len(rest), '«%s», строк в списке %d' % (btn.inner_text().strip(), len(rest)))
    btn.click()
    t.ck(t.wait_until("() => !document.getElementById('om-trip-filters')"), '«Показать» не свернул панель')
    pg.locator('.om-fclear').click()
    t.ck(t.wait_until("() => !/[?&]i=/.test(location.hash) && !/[?&]f=/.test(location.hash) && !document.querySelector('.om-fchip')"), '«Сбросить всё» не снял отбор')

    # --- «Просрочено» → выезды с отбором ---
    t.open('#/osmotr', wait='.om-app[data-v="today"]')
    pg.locator('.om-row', has_text='Просрочено').click()
    t.ck(t.wait_until("() => /s=late/.test(location.hash) && document.querySelectorAll('.om-obj').length > 0"), '«Просрочено» не открыло выезды с отбором')
    hrefs = pg.eval_on_selector_all('.om-obj', 'els => els.map((e) => decodeURIComponent(e.getAttribute("href")))')
    t.ck(any(late in h for h in hrefs), 'просроченный объект %s не в списке «Просрочено»' % late)

    # --- выезды: К осмотру / Осмотрено / Все ---
    t.open('#/osmotr?v=trips', wait='.om-app[data-v="trips"]')
    n_open = pg.locator('.om-obj').count()
    t.ck(n_open == len([o for o in objs if o['state'] != 'done' and not o['removed']]), '«К осмотру»: %d строк' % n_open)
    pg.locator('.om-tab3', has_text='Осмотрено').click()
    t.wait_until("() => document.querySelector('.om-tab3.on')?.textContent.startsWith('Осмотрено')")
    chips = pg.eval_on_selector_all('.om-obj .om-chip', 'els => els.map((e) => e.textContent)')
    t.ck(all(c == 'Закончен' for c in chips), '«Осмотрено»: не только законченные: %s' % sorted(set(chips)))
    pg.locator('.om-tab3', has_text='Все').click()
    t.wait_until("() => document.querySelector('.om-tab3.on')?.textContent.startsWith('Все')")
    t.ck(pg.locator('.om-obj').count() == len(objs), '«Все»: %d строк из %d' % (pg.locator('.om-obj').count(), len(objs)))

    # --- объект: шапка, ЕНИ, без данных карточки ЦОД; документы ---
    with_docs = next((o for o in objs if o['docs'] and o['state'] != 'done'), None) or next((o for o in objs if o['docs']), None)
    t.ck(with_docs, 'нет объекта с документами для выезда')
    if with_docs:
        pg.evaluate("(id) => { location.hash = '#/osmotr?v=obj&id=' + encodeURIComponent(id); }", with_docs['id'])
        t.wait_for('.om-app[data-v="obj"] .om-title')
        t.ck(pg.locator('.om-title').inner_text().strip() == with_docs['title'], 'заголовок объекта не адрес/название')
        if with_docs['eni']:
            t.ck(pg.locator('.om-eni').count() == 1, 'в объекте нет ЕНИ')
        t.ck(pg.locator('.om-idrow .om-chip').count() == 1, 'в объекте нет состояния')
        body = pg.locator('.om-scr').inner_text()
        for word in ('Класс', 'По техпаспорту', 'По ПУД', 'Конструктив', 'Износ'):
            t.ck(word not in body, 'осмотрщику видно «%s» — данные карточки ЦОД (решение 16.11.2026)' % word)
        t.ck(pg.locator('.om-objtabs .om-btab').count() == 2, 'у объекта нет вкладок «Задача» и «Документы»')
        # Документы — только вкладкой внизу, без карточки-дубля на «Задаче» (пользователь 20.11.2026).
        t.ck(pg.locator('.om-doclink').count() == 0 and 'Документы для выезда' not in pg.locator('.om-scr').inner_text(),
             'на вкладке «Задача» осталась карточка «Документы для выезда» — дубль вкладки «Документы»')
        pg.locator('.om-objtabs .om-btab', has_text='Документы').click()
        t.wait_until("() => document.querySelector('.om-objtabs .om-btab.on')?.textContent.includes('Документы')")
        t.ck(pg.locator('.om-scr .om-group .om-row').count() == with_docs['docs'], 'документов в списке не %d' % with_docs['docs'])
        # Документ с файлом — открывается во всю страницу. Демо-документам файл придаём сами.
        pg.evaluate("""async (id) => {
          const [typeId, ocId] = id.split('|');
          const rec = (await import('./app/pages/inspection/tasks.js')).loadTask(typeId, ocId);
          const d = (rec.docs || [])[0] || (rec.oi || []).flatMap((o) => o.docs || [])[0];
          d.file = { name: 'план.png', mime: 'image/png', dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' };
          (await import('./app/kernel/inspections.js')).changed();
        }""", with_docs['id'])
        t.wait_until("() => !!document.querySelector('.om-scr a.om-row[href*=\"v=doc\"]')")
        pg.locator('.om-scr a.om-row[href*="v=doc"]').first.click()
        t.ck(t.wait_until("() => /v=doc/.test(location.hash) && !!document.querySelector('.om-docimg, .om-docview')"), 'документ с файлом не открылся')
        t.ck(pg.locator('.om-bnav').count() == 0, 'у документа осталась нижняя панель разделов')
        pg.locator('.om-back').click()
        t.ck(t.wait_until("() => /v=obj/.test(location.hash) && /tab=docs/.test(location.hash)"), '«Назад» из документа — не к документам объекта')

    # --- каждый назначенный объект открывается (все виды: с участком по Кадастру и без, ТС, описи) ---
    bad = []
    for o in objs:
        pg.evaluate("(id) => { location.hash = '#/osmotr?v=obj&id=' + encodeURIComponent(id); }", o['id'])
        if not t.wait_until("(id) => document.querySelector('.om-app[data-v=obj] .om-title') && decodeURIComponent(location.hash).includes(id)", o['id'], timeout=4000):
            bad.append(o['id'])
    t.ck(not bad, 'не открылись объекты: %s' % bad[:5])

    # --- транспорт: «марка модель · госномер» на верхнем уровне (17.11.2026) ---
    ts = pg.evaluate("""async () => { const d = await import('./app/pages/osmotr/data.js'); const s = (await import('./app/kernel/session.js')).session.state;
      const o = d.myObjects(s.person).find((x) => x.ts && x.ts.includes(' · ') && x.title !== x.ts); return o ? { id: o.id, ts: o.ts, plate: o.ts.split(' · ').pop() } : null; }""")
    if t.ck(ts, 'нет ТС с адресом и госномером — верхний уровень не проверен'):
        t.open('#/osmotr?v=trips&f=vehicle&s=all', wait='.om-obj')
        t.ck(pg.locator('.om-obj .om-obj-ts', has_text=ts['ts']).count() == 1, 'в списке выездов у ТС нет «марка модель · госномер»')
        pg.evaluate("(id) => { location.hash = '#/osmotr?v=obj&id=' + encodeURIComponent(id); }", ts['id'])
        t.wait_for('.om-app[data-v="obj"] .om-title')
        t.ck(pg.locator('.om-obj-ts-lg').inner_text().strip() == ts['ts'], 'в шапке ТС нет «марка модель · госномер»')
        t.ck('Госномер' not in pg.locator('.om-facts').inner_text(), 'госномер задвоен в сведениях')
        t.ck(ts['plate'] in pg.locator('.om-comp .om-oi').first.inner_text(), 'в составе у ТС нет госномера')

    # --- строка выезда без адреса: «Адрес не указан» и учреждение (пользователь 20.11.2026) ---
    noaddr = pg.evaluate("""async () => { const d = await import('./app/pages/osmotr/data.js'); const s = (await import('./app/kernel/session.js')).session.state;
      const o = d.myObjects(s.person).find((x) => !x.address && x.institution); return o ? { id: o.id, inst: o.institution } : null; }""")
    if t.ck(noaddr, 'нет выезда без адреса с учреждением — строку не проверить'):
        t.open('#/osmotr?v=trips&s=all', wait='.om-app[data-v="trips"] .om-obj')
        txt = pg.evaluate("(id) => ([...document.querySelectorAll('a.om-obj')].find((a) => decodeURIComponent(a.getAttribute('href')).endsWith('id=' + id)) || {}).innerText || ''", noaddr['id'])
        t.ck('Адрес не указан' in txt and noaddr['inst'] in txt, 'в строке выезда без адреса нет «Адрес не указан» или учреждения: %r' % txt)

    # --- поиск — строкой в «Выездах», отдельной вкладки нет (пользователь 20.11.2026) ---
    t.open('#/osmotr?v=trips', wait='.om-app[data-v="trips"] [data-search] input')
    t.ck(pg.locator('.om-bnav .om-btab', has_text='Поиск').count() == 0 and pg.locator('.om-bnav .om-btab').count() == 3,
         'в нижней панели осталась вкладка «Поиск»')
    eni_obj = next((o for o in objs if o['eni']), None)
    if eni_obj:
        pg.fill('[data-search] input', eni_obj['eni'][:9])
        t.ck(t.wait_until("() => /v=trips/.test(location.hash) && /q=/.test(location.hash)"), 'запрос поиска не попал в адрес «Выездов»')
        pg.locator('.om-tab3', has_text='Все').click()
        t.wait_until("() => /s=all/.test(location.hash) && /q=/.test(location.hash)")
        t.ck(t.wait_until("(id) => [...document.querySelectorAll('.om-obj')].some((a) => decodeURIComponent(a.getAttribute('href')).includes(id))", eni_obj['id']),
             'поиск по ЕНИ не нашёл свой объект (вкладка «Все»)')
        t.ck(pg.locator('[data-search] input').input_value() == eni_obj['eni'][:9], 'при смене вкладки состояния поиск сбросился')
        pg.locator('[data-search] input').click()
        pg.keyboard.type('0')
        t.ck(t.wait_until("() => /q=/.test(location.hash) && document.activeElement && document.activeElement.matches('[data-search] input')"), 'поле поиска теряет фокус при вводе')
    # Несколько слов — все сразу; госномер ТС ищется.
    if ts:
        t.open('#/osmotr?v=trips&s=all&q=' + quote(ts['plate'], safe=''), wait='.om-app[data-v="trips"] .om-list')
        t.ck(t.wait_until("(id) => [...document.querySelectorAll('.om-obj')].some((a) => decodeURIComponent(a.getAttribute('href')).includes(id))", ts['id']),
             'поиск по госномеру не нашёл ТС')
    pg.fill('[data-search] input', 'нетакогоадреса')
    t.ck(t.wait_until("() => document.querySelectorAll('.om-obj').length === 0 && /Ничего не найдено/.test(document.querySelector('.om-list').textContent)"),
         'поиск нашёл несуществующее или нет «Ничего не найдено»')
    # Дата в поиске — все объекты с выездом на этот день, и к осмотру, и осмотренные (пользователь 20.11.2026).
    days = pg.evaluate("""async () => { const d = await import('./app/pages/osmotr/data.js'); const s = (await import('./app/kernel/session.js')).session.state;
      const by = {}; d.myObjects(s.person).forEach((o) => { if (o.plannedAt) (by[o.plannedAt] = by[o.plannedAt] || []).push(o.id); });
      return { today: d.isoDay(), by }; }""")
    IDS = "() => [...new Set([...document.querySelectorAll('a.om-obj')].map((a) => decodeURIComponent(a.getAttribute('href')).match(/id=([^&]+)/)[1]))].sort()"
    day = max(days['by'], key=lambda k: len(days['by'][k]))
    want = sorted(days['by'][day])
    y, m, d = day.split('-')
    for qtext in ('%s.%s.%s' % (d, m, y), '%s.%s' % (d, m), day):
        t.open('#/osmotr?v=trips&q=' + quote(qtext, safe=''), wait='.om-app[data-v="trips"] .om-list')
        got = pg.evaluate(IDS)
        if len(qtext) == 5:  # без года — этот день любого года
            want_any = sorted({i for k, v in days['by'].items() if k[5:] == day[5:] for i in v})
            t.ck(got == want_any, 'поиск по дате «%s» (без года): %d объектов, ожидалось %d' % (qtext, len(got), len(want_any)))
        else:
            t.ck(got == want, 'поиск по дате «%s»: %d объектов, ожидалось %d' % (qtext, len(got), len(want)))
        t.ck(pg.locator('.om-tab3.on', has_text='Все').count() == 1, 'по дате открыта не вкладка «Все»')
    t.ck('Выезд на %s.%s.%s' % (d, m, y) in pg.locator('.om-found-q').inner_text(), 'не видно, на какую дату найдено')
    if days['today'] in days['by']:
        t.open('#/osmotr?v=trips&q=' + quote('сегодня', safe=''), wait='.om-app[data-v="trips"] .om-list')
        t.ck(pg.evaluate(IDS) == sorted(days['by'][days['today']]), '«сегодня» нашло не выезды сегодняшнего дня')
    # Дата и слово вместе; невозможная дата — обычное слово.
    t.open('#/osmotr?v=trips&q=' + quote('%s.%s нетакогоадреса' % (d, m), safe=''), wait='.om-app[data-v="trips"] .om-list')
    t.ck(pg.evaluate(IDS) == [], 'дата со словом не сузила поиск')
    t.open('#/osmotr?v=trips&q=' + quote('32.13', safe=''), wait='.om-app[data-v="trips"] .om-list')
    t.ck(pg.evaluate(IDS) == [] and pg.locator('.om-found-q').count() == 0, '«32.13» принято за дату')

    # Прежний адрес поиска ведёт в «Выезды» с тем же запросом.
    t.open('#/osmotr?v=search&q=' + quote('нетакогоадреса', safe=''), wait='.om-app[data-v="trips"] [data-search] input')
    t.ck(pg.locator('[data-search] input').input_value() == 'нетакогоадреса', 'прежний адрес поиска не открыл «Выезды» с запросом')

    # --- меню: списки назначенного к осмотру по типам ---
    t.open('#/osmotr?v=menu', wait='.om-app[data-v="menu"]')
    pg.locator('.om-row', has_text='Недвижимое').click()
    t.ck(t.wait_until("() => /v=trips/.test(location.hash) && /f=real/.test(location.hash)"), '«Недвижимое» в меню ведёт не к списку назначенного')
    t.ck(t.wait_until("() => document.querySelector('.om-h1')?.textContent.trim() === 'Недвижимое'"), 'заголовок списка не «Недвижимое»')

    # --- входящие снимают значок новых ---
    t.open('#/osmotr', wait='.om-app[data-v="today"]')
    had = pg.locator('.om-top .om-badge').count()
    t.open('#/osmotr?v=notes', wait='.om-app[data-v="notes"]')
    t.open('#/osmotr', wait='.om-app[data-v="today"]')
    if had:
        t.ck(pg.locator('.om-top .om-badge').count() == 0, 'после «Входящих» значок новых не снят')

    # --- «Назад» из входящих — туда, откуда пришли, с тем же отбором (пользователь 20.11.2026) ---
    pg.evaluate("() => { location.hash = '#/osmotr?v=trips&s=all&q=' + encodeURIComponent('бишкек'); }")
    t.wait_for('.om-app[data-v="trips"] .om-top a.om-icon[href*="v=notes"]')
    pg.locator('.om-top a.om-icon[href*="v=notes"]').click()
    t.wait_for('.om-app[data-v="notes"] .om-back')
    t.ck('Выезды' in pg.locator('.om-back').inner_text(), 'во входящих из «Выездов» «Назад» не к «Выездам»: %r' % pg.locator('.om-back').inner_text())
    pg.locator('.om-back').click()
    t.ck(t.wait_until("() => /v=trips/.test(location.hash) && /s=all/.test(location.hash) && document.querySelector('[data-search] input')?.value === 'бишкек'"),
         '«Назад» из входящих потерял отбор «Выездов»')
    t.open('#/osmotr?v=notes', wait='.om-app[data-v="notes"]')
    t.ck(pg.locator('.om-back').count() == 1, 'во входящих нет «Назад»')

    # --- разделы, открытые с главной или из меню, возвращают туда же (пользователь 20.11.2026) ---
    for start, label in (('today', 'Мои объекты'), ('menu', 'Меню')):
        for sect, text in (('cad', 'Запросы документов'), ('report', 'Отчёт дня')):
            t.open('#/osmotr?v=' + start, wait='.om-app[data-v="%s"]' % start)
            link = pg.locator('a.om-row[href$="v=%s"]' % sect)
            if not link.count():
                t.ck(sect == 'cad' and start == 'today', 'на «%s» нет строки «%s»' % (label, text))
                continue
            link.first.click()
            t.wait_for('.om-app[data-v="%s"] .om-back' % sect)
            t.ck(label in pg.locator('.om-back').inner_text(), '«%s», открытые с «%s», возвращают не туда: %r' % (text, label, pg.locator('.om-back').inner_text()))
            pg.locator('.om-back').click()
            t.ck(t.wait_until("(v) => !!document.querySelector('.om-app[data-v=\"' + v + '\"]')", start), '«Назад» из «%s» не на «%s»' % (text, label))

    # --- прежний адрес и ширины ---
    pg.evaluate("() => { location.hash = '#/insp'; }")
    t.ck(t.wait_until("() => !!document.querySelector('.om-app[data-v=\"today\"]')"), '#/insp не открыл страницу осмотрщика')
    for w in (360, 400):
        pg.set_viewport_size({'width': w, 'height': 800})
        for route in ('#/osmotr', '#/osmotr?v=trips&s=all', '#/osmotr?v=menu'):
            t.open(route, wait='.om-app')
            over = pg.evaluate("() => { const s = document.querySelector('.om-scr'); return s.scrollWidth - s.clientWidth; }")
            t.ck(over <= 0, '%s на %d px прокручивается вбок на %d px' % (route, w, over))
    pg.set_viewport_size({'width': 1600, 'height': 900})
    t.open('#/osmotr', wait='.om-app')
    t.ck(pg.evaluate("() => document.querySelector('.om-app').getBoundingClientRect().width") <= 480, 'на широком экране колонка шире 480')
