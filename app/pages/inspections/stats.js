// Календарь выездов, статистика (uPlot) и история панели осмотров
// (ТЗ panel-osmotrov-tz, раздел 4 и 3.6).
//
// Слова пользователя 12.10.2026: «График не загрузки человека должен быть, а
// график выездов. Аля календарь. При наведении на дату информация за этот
// день. Ну и общая статистика в виде графиков uplot… чтобы можно было без
// проблем понять, кто и как работает, кому стоит поставить задачи».
//
// Щелчок (Enter) по дню с выездами открывает выезды дня в панели
// подробностей справа (detail.js) — и прошедшего, и будущего.
// Календарь — разметкой: месяц сеткой пн–вс, в ячейке — выезды (объекты) и
// ОИ, окно дня — при наведении и при фокусе с клавиатуры, в <body>, в
// пределах экрана (практики: PatternFly calendar month — состояния «сегодня»,
// наведение, выбор; ограничение строк в ячейке и «+N»). Статистика — uPlot
// (app/vendor/uplot, ленивый import при первом показе): линии по дням, ось
// от нуля, значения точки под курсором — в легенде.
import { esc } from '../../kernel/dom.js';
import { plural } from '../../kernel/fmt.js';
import { activityKind } from '../../kernel/inspections.js';
import {
  tripsMonth, historyRows, EVENT_LABELS, dayOf, todayIso,
} from './model.js';
import {
  PERIOD_UNITS, OI_KINDS, METRICS, statsFor, regionRows, seriesOf, fmtMetric, worseThanMedian, periodText,
} from './statsData.js';

const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const ddmm = (iso) => iso.slice(8, 10) + '.' + iso.slice(5, 7);
const wd = (iso) => WD[new Date(iso + 'T00:00:00').getDay()];
const TRIP_LABEL = { done: 'осмотрено', plan: 'назначено', late: 'просрочено' };


// --- календарь выездов ------------------------------------------------------------

// ym — { y, m } показываемого месяца.
export function calendarHTML(all, person, ym) {
  const weeks = tripsMonth(all, person, ym.y, ym.m);
  const cell = (d) => {
    const by = { done: [], plan: [], late: [] };
    d.trips.forEach((t) => by[t.kind].push(t));
    const oi = d.trips.reduce((s, t) => s + t.oi, 0);
    const photos = d.trips.reduce((s, t) => s + t.photos, 0);
    const n = d.trips.length;
    const acts = d.acts || [];
    const actText = (a) => [activityKind(a.kind).label, a.region, a.project, a.object, a.time, a.note].filter(Boolean).join(' · ');
    const label = `${wd(d.day)} ${ddmm(d.day)}${d.off ? ` (${d.off})` : ''}: ${n ? `${n} ${plural(n, 'выезд', 'выезда', 'выездов')}, ОИ ${oi}` : 'выездов нет'}${acts.length ? `; ${acts.map(actText).join('; ')}` : ''}`;
    // У осмотрщика открывается любой день месяца: в панели дня отмечается
    // работа вне выездов (раздел 4 ТЗ рабочего дня).
    const open = n || (person && d.inMonth);
    return `<td class="ipc-cal-d ${d.inMonth ? '' : 'out'} ${d.weekend || d.off ? 'we' : ''} ${d.absence ? 'away' : ''} ${d.today ? 'today' : ''} ${n ? 'has' : ''} ${open ? 'open' : ''}"
        ${open ? `tabindex="0" role="button" ${n || acts.length ? `data-ipc-cal="${esc(d.day)}"` : ''} data-ip-dp-open="day:${esc(d.day)}"` : ''} aria-label="${esc(label)}">
      <span class="ipc-cal-n">${d.n}${d.plan && d.plan.region ? `<span class="ipc-plan" title="${esc(['План месяца', d.plan.region, d.plan.district, d.plan.institutions].filter(Boolean).join(' · '))}">${esc(d.plan.region)}</span>` : ''}</span>
      ${d.absence ? `<span class="ipc-chip k-away" title="${esc(d.off)}${d.absence.note ? ' · ' + esc(d.absence.note) : ''}">${esc(d.off)}</span>` : ''}
      ${acts.map((a) => `<span class="ipc-chip k-act" title="${esc(actText(a))}">${esc(activityKind(a.kind).short)}${a.region ? ` ${esc(a.region)}` : ''}</span>`).join('')}
      ${by.done.length ? `<span class="ipc-chip k-done">${by.done.length} · ОИ ${by.done.reduce((s, t) => s + t.oi, 0)}</span>` : ''}
      ${by.plan.length ? `<span class="ipc-chip k-plan" title="Назначено на этот день">назн. ${by.plan.length}</span>` : ''}
      ${by.late.length ? `<span class="ipc-chip k-late">проср. ${by.late.length}</span>` : ''}
      ${n || acts.length ? `<template class="ipc-pop-src"><b>${esc(wd(d.day))}, ${esc(ddmm(d.day))}</b>
        <span class="ipc-pop-sum">${n ? `${n} ${plural(n, 'выезд', 'выезда', 'выездов')} · ОИ ${oi}${photos ? ` · снимков ${photos}` : ''}` : 'выездов нет'}</span>
        <ul>${acts.map((a) => `<li><i class="k-act">${esc(activityKind(a.kind).short)}</i><span>${esc([a.region, a.address, a.project, a.object, a.time, a.note].filter(Boolean).join(' · ') || activityKind(a.kind).label)}</span></li>`).join('')}${d.trips.map((t) => `<li><i class="k-${t.kind}">${TRIP_LABEL[t.kind]}</i><span>${esc(t.title)}</span><em>ОИ ${t.oi}${t.photos ? ` · ${t.photos} сн.` : ''}</em></li>`).join('')}</ul>
      </template>` : ''}
    </td>`;
  };
  return `<section class="ipc-card ipc-cal" aria-label="Календарь выездов">
    <header><h3>Выезды</h3>
      <span class="ipc-cal-nav">
        <button class="btn btn-ghost btn-sm" data-ipc-month="-1" aria-label="Предыдущий месяц">‹</button>
        <b>${MONTHS[ym.m]} ${ym.y}</b>
        <button class="btn btn-ghost btn-sm" data-ipc-month="1" aria-label="Следующий месяц">›</button>
        <button class="btn btn-ghost btn-sm" data-ipc-month="0">Сегодня</button>
      </span>
      <span class="ipc-legend"><i class="k-done"></i>осмотрено <i class="k-plan"></i>назначено <i class="k-late"></i>просрочено${person ? ' <i class="k-act"></i>вне выездов' : ''}</span>
    </header>
    <table class="ipc-cal-tbl">
      <thead><tr>${['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((x, i) => `<th class="${i >= 5 ? 'we' : ''}">${x}</th>`).join('')}</tr></thead>
      <tbody>${weeks.map((w) => `<tr>${w.map(cell).join('')}</tr>`).join('')}</tbody>
    </table>
  </section>`;
}

// Окно дня: одно на страницу, в <body>, в пределах экрана; показывается при
// наведении и при фокусе, прячется при уходе, Escape и прокрутке.
export function bindCalendarPopover(scope) {
  let pop = null;
  const hide = () => { if (pop) { pop.remove(); pop = null; } };
  const show = (cellEl) => {
    const src = cellEl.querySelector('.ipc-pop-src');
    if (!src) return;
    hide();
    pop = document.createElement('div');
    pop.className = 'ipc-pop';
    pop.setAttribute('role', 'tooltip');
    pop.appendChild(src.content.cloneNode(true));
    document.body.appendChild(pop);
    const r = cellEl.getBoundingClientRect();
    const w = pop.offsetWidth; const h = pop.offsetHeight;
    let left = r.left + r.width / 2 - w / 2;
    left = Math.max(8, Math.min(left, innerWidth - w - 8));
    let top = r.bottom + 6;
    if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 6);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  };
  scope.on('mouseover', '[data-ipc-cal]', (e, el) => show(el));
  scope.on('mouseout', '[data-ipc-cal]', (e, el) => { if (!el.contains(e.relatedTarget)) hide(); });
  scope.on('focusin', '[data-ipc-cal]', (e, el) => show(el));
  scope.on('focusout', '[data-ipc-cal]', hide);
  scope.onDocument('keydown', (e) => { if (e.key === 'Escape') hide(); });
  scope.onDocument('scroll', hide, true);
  return hide;
}

// --- статистика (uPlot) ------------------------------------------------------------
//
// Экран «Статистика» у всех и у осмотрщика устроен одинаково (задача графа
// ekran-statistiki-osmotrov-pokazateli-i-vygruzka-xlsx, 14.10.2026). Период и
// выгрузка — одной строкой сверху, фильтр задаёт всё, что ниже (практика
// дашбордов: «filters scope everything below them»). Плитки сводки и ОИ по
// видам (п. 4.1 ТЗ). Показатели: у всех — таблица людей с итогом и медианой
// команды в своих столбцах, у осмотрщика — значение рядом с медианой команды
// (практика сравнительных панелей: число без опорного значения ничего не
// говорит; хуже медианы — подсвечено). Графики — по одному показателю на
// график, одна ось (у осмотрщика прежде ОИ и снимки делили две оси). Области
// — где не хватает людей.
const stile = (label, value, cls = '', hint = '') => `<div class="ip-tile ${cls}" ${hint ? `title="${esc(hint)}"` : ''}><span>${label}</span><b>${value}</b></div>`;

function periodBar(period) {
  return `<div class="ip-repbar ipc-sbar">
    <div class="ipc-sper">
      <div class="ip-seg ipc-seg3" role="group" aria-label="Период">${PERIOD_UNITS.map(([k, l]) => `<button type="button" data-ip-sunit="${k}" aria-pressed="${period.unit === k}">${l}</button>`).join('')}</div>
      <div class="ip-daynav" role="group" aria-label="Период статистики">
        <button class="btn btn-ghost btn-sm" data-ip-sstep="1" aria-label="Предыдущий период">‹</button>
        <span class="ip-repmonth">${esc(period.label)}</span>
        <button class="btn btn-ghost btn-sm" data-ip-sstep="-1" aria-label="Следующий период" ${period.current ? 'disabled title="Выбран текущий период — следующий ещё не начался"' : ''}>›</button>
      </div>
      <span class="ip-hint">${esc(periodText(period))}${period.current ? ' · по сегодня' : ''}</span>
    </div>
    <button class="btn btn-ghost btn-sm" data-ip-sxlsx>Выгрузить xlsx</button>
  </div>`;
}

function tilesHTML(t) {
  const kinds = OI_KINDS.filter(([k]) => t.kinds[k]);
  return `<div class="ip-tiles">${stile('Объектов', t.objects)}${stile('ОИ', t.oi)}${stile('Снимков', t.photos)}
      ${stile('Заметок', t.notes)}${stile('Расхождений', t.mismatch, t.mismatch ? 'warn' : '')}${stile('Выявлено', t.found)}</div>
    <p class="ipc-kinds"><span class="ip-flabel">ОИ по видам</span>${kinds.length ? kinds.map(([k, l]) => `<span class="ipc-kind">${esc(l)} <b>${t.kinds[k]}</b></span>`).join('') : '<span class="ip-muted">осмотренных ОИ нет</span>'}</p>`;
}

const mcell = (m, v, med) => {
  const bad = worseThanMedian(m, v, med);
  return `<td class="num ${bad ? 'ip-late' : ''}" ${bad ? 'title="Хуже медианы команды больше чем на 10%"' : ''}>${fmtMetric(v, m.fmt)}</td>`;
};

function allTableHTML(st) {
  if (!st.rows.length) return '<p class="ip-hint ip-empty">Под фильтр никто не подошёл.</p>';
  return `<section class="ipc-card ipc-sec" aria-label="Показатели осмотрщиков"><header><h3>Показатели осмотрщиков</h3><span>щелчок по строке — статистика осмотрщика</span></header>
    <div class="icols ip-cols"><div class="ip-scroll"><table class="itbl ip-tbl ipc-mtbl">
      <colgroup><col class="c-name">${METRICS.map(() => '<col class="c-k">').join('')}</colgroup>
      <thead><tr><th>Осмотрщик</th>${METRICS.map((m) => `<th class="num" ${m.hint ? `title="${esc(m.hint)}"` : ''}>${esc(m.short || m.label)}</th>`).join('')}</tr></thead>
      <tbody>${st.rows.map((r) => `<tr data-ip-stat-open="${esc(r.name)}" tabindex="0"><td>${esc(r.name)}</td>${METRICS.map((m) => mcell(m, r[m.key], st.median[m.key])).join('')}</tr>`).join('')}</tbody>
      <tfoot>
        <tr><th scope="row">Итого</th>${METRICS.map((m) => `<td class="num">${m.key === 'oi' || m.key === 'objects' ? fmtMetric(st.total[m.key], 'int') : ''}</td>`).join('')}</tr>
        <tr class="ipc-med"><th scope="row" title="Середина ряда: у половины команды больше, у половины меньше">Медиана команды</th>${METRICS.map((m) => `<td class="num">${fmtMetric(st.median[m.key], m.fmt)}</td>`).join('')}</tr>
      </tfoot>
    </table></div></div></section>`;
}

function personTableHTML(st, name) {
  const me = st.rows.find((r) => r.name === name);
  if (!me) return '';
  return `<section class="ipc-card ipc-sec" aria-label="Показатели и медиана команды"><header><h3>Показатели</h3><span>рядом — медиана команды за тот же период</span></header>
    <div class="icols ip-cols"><div class="ip-scroll"><table class="itbl ip-tbl ipc-ptbl">
      <colgroup><col><col class="c-k"><col class="c-k"></colgroup>
      <thead><tr><th>Показатель</th><th class="num">Значение</th><th class="num" title="Середина ряда: у половины команды больше, у половины меньше">Медиана команды</th></tr></thead>
      <tbody>${METRICS.map((m) => `<tr><td ${m.hint ? `title="${esc(m.hint)}"` : ''}>${esc(m.label)}</td>${mcell(m, me[m.key], st.median[m.key])}<td class="num ip-muted">${fmtMetric(st.median[m.key], m.fmt)}</td></tr>`).join('')}
        <tr><td>Рабочих дней в периоде</td><td class="num">${me.workdays}</td><td class="num"></td></tr>
        <tr><td>Пробег, км · бензин, л</td><td class="num">${fmtMetric(me.km, 'dec')} · ${fmtMetric(me.litres, 'dec')}</td><td class="num"></td></tr>
        <tr><td>Отчёты дня: вовремя · поздно · не сдано</td><td class="num">${me.repOnTime} · ${me.repLate} · ${me.repMissed}</td><td class="num"></td></tr>
      </tbody>
    </table></div></div></section>`;
}

function regionsHTML(rows) {
  if (!rows.length) return '';
  const sum = (k) => rows.reduce((n, r) => n + r[k], 0);
  return `<section class="ipc-card ipc-sec" aria-label="По областям"><header><h3>По областям</h3><span>осмотрено — за период; ждёт назначения и просрочено — на сегодня</span></header>
    <div class="icols ip-cols"><div class="ip-scroll"><table class="itbl ip-tbl ipc-rtbl">
      <colgroup><col class="c-name"><col class="c-k"><col class="c-k"><col class="c-k"><col class="c-k"><col class="c-k"></colgroup>
      <thead><tr><th>Область</th><th class="num">Осмотрено объектов</th><th class="num">Осмотрено ОИ</th><th class="num">Ждёт назначения</th><th class="num">Просрочено</th><th class="num">Осмотрщиков</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${esc(r.region)}</td><td class="num">${r.objects || '—'}</td><td class="num">${r.oi || '—'}</td>
        <td class="num">${r.waiting || '—'}</td><td class="num ${r.overdue ? 'ip-late' : ''}">${r.overdue || '—'}</td>${!r.people && (r.waiting || r.overdue) ? '<td class="num ip-late" title="Работа в области есть, осмотрщиков нет">0</td>' : `<td class="num">${r.people || '—'}</td>`}</tr>`).join('')}</tbody>
      <tfoot><tr><th scope="row">Итого</th><td class="num">${sum('objects')}</td><td class="num">${sum('oi')}</td><td class="num">${sum('waiting')}</td><td class="num">${sum('overdue')}</td><td class="num"></td></tr></tfoot>
    </table></div></div></section>`;
}

function plotsHTML(person, period) {
  const by = period.unit === 'week' ? 'по рабочим дням' : 'по неделям';
  const sub = person ? `${by} · пунктир — медиана команды` : by;
  return `<div class="ipc-stats">
    <section class="ipc-card ipc-stat" aria-label="Осмотрено ОИ"><header><h3>Осмотрено ОИ</h3><span>${sub}</span></header>
      <div class="ipc-plot" data-ipc-plot="oi"></div></section>
    <section class="ipc-card ipc-stat" aria-label="Снимков"><header><h3>Снимков</h3><span>${sub}</span></header>
      <div class="ipc-plot" data-ipc-plot="photos"></div></section>
  </div>`;
}

// Экран статистики: person пуст — все осмотрщики (people — список экрана).
export function statsHTML({ all, people, person, period }) {
  const names = people.filter((p) => !p.fired).map((p) => p.name);
  if (person && !names.includes(person)) names.push(person);
  const st = statsFor(all, names, period);
  const t = person ? st.rows.find((r) => r.name === person) : st.total;
  // У осмотрщика таблица короткая — графики рядом с ней, а не под пустой
  // полосой справа; на узком окне — друг под другом.
  return `${periodBar(period)}${tilesHTML(t)}
    ${person ? `<div class="ipc-pgrid">${personTableHTML(st, person)}${plotsHTML(person, period)}</div>` : `${allTableHTML(st)}${plotsHTML(person, period)}`}
    ${person ? '' : regionsHTML(regionRows(all, people, period))}`;
}

const cssVar = (n, d) => (getComputedStyle(document.documentElement).getPropertyValue(n) || '').trim() || d;
// Порядок цветов постоянный: человек сохраняет цвет при смене периода.
// Палитра проверена сценарием скилла dataviz 14.10.2026 (светлость,
// насыщенность, различимость соседних при дальтонизме — на светлой и тёмной
// теме); красного нет — он у тревожных значений.
const PALETTE = () => [cssVar('--blue-600', '#1668c9'), '#008a6e', cssVar('--amber-600', '#c07c1e'),
  cssVar('--violet-600', '#7a41b8'), '#c2367f', '#5b7f12'];

let plots = [];
let ro = null;
// Высота места графика после прошлой отрисовки: графики рисуются после
// разметки (uPlot грузится лениво), и без запаса блоки ниже сдвигались
// дважды — матрица взаимодействий 14.10.2026, флаг «ПРЫГАЛ».
const lastH = {};
export function destroyStats() {
  plots.forEach((p) => p.destroy());
  plots = [];
  if (ro) { ro.disconnect(); ro = null; }
}

function opts(el, series, yLabel, step) {
  const ink = cssVar('--muted', '#526073');
  const grid = cssVar('--line-soft', '#dbe4ee');
  const axis = (extra = {}) => ({ stroke: ink, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid, width: 1 }, font: '11px system-ui, sans-serif', ...extra });
  const dd = (v) => new Date(v * 1000).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  return {
    width: el.clientWidth || 300,
    height: 170,
    padding: [8, 18, 0, 0],
    cursor: { drag: { x: false, y: false }, points: { size: 6 } },
    legend: { live: true },
    scales: { x: { time: true }, y: { range: (u, min, max) => [0, Math.max(1, Math.ceil(max * 1.15))] } },
    axes: [
      axis({ values: (u, ticks) => ticks.map(dd), space: 44,
      // Деления — по шагам данных; на узком графике — через один-два, чтобы
      // даты не слипались (одна подпись ~48 px).
      splits: (u) => { const xs = u.data[0]; const w = u.bbox.width / (devicePixelRatio || 1); const k = Math.max(1, Math.ceil((xs.length * 48) / Math.max(w, 1))); return xs.filter((_, i) => (xs.length - 1 - i) % k === 0); } }),
      axis({ scale: 'y', size: 36, label: yLabel, labelSize: 14, labelFont: '11px system-ui, sans-serif' }),
    ],
    series: [{ label: '', value: (u, v) => (v == null ? '' : step === 'week' ? `неделя с ${dd(v)}` : dd(v)) }, ...series],
  };
}

const medianOf = (vals) => { const v = [...vals].sort((a, b) => a - b); const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };

// Нарисовать графики в местах [data-ipc-plot]. names — осмотрщики экрана;
// person — выбранный: его линия и пунктиром медиана команды.
export async function mountStats(scope, ensureStyle, { names, person, period }) {
  destroyStats();
  const spots = scope.$$('[data-ipc-plot]');
  if (!spots.length) return;
  const hKey = (el) => `${person ? 'p' : 'a'}:${el.dataset.ipcPlot}`;
  spots.forEach((el) => { if (lastH[hKey(el)]) el.style.minHeight = lastH[hKey(el)] + 'px'; });
  await ensureStyle('./app/vendor/uplot/uPlot.min.css');
  const { default: uPlot } = await import('../../vendor/uplot/uPlot.esm.js');
  if (!spots[0].isConnected) return;   // экран успел перерисоваться
  const pal = PALETTE();
  const per = period.unit === 'week' ? 'за день' : 'за неделю';
  const line = (label, color, extra = {}) => ({
    label, stroke: color, width: 2, points: { show: true, size: 5, fill: color },
    value: (u, v) => (v == null ? '' : `(${Math.round(v * 10) / 10} ${per})`), ...extra,
  });
  const sum = (arr) => arr.reduce((x, y) => x + y, 0);
  const team = !person || names.includes(person) ? names : [...names, person];
  const s = seriesOf(team, period);
  spots.forEach((el) => {
    const rows = el.dataset.ipcPlot === 'oi' ? s.oi : s.photos;
    const y = el.dataset.ipcPlot === 'oi' ? 'ОИ' : 'снимков';
    let data;
    let series;
    if (person) {
      const i = team.indexOf(person);
      data = [s.xs, rows[i], s.xs.map((_, k) => medianOf(rows.map((r) => r[k])))];
      series = [line(`${person.split(' ').slice(0, 2).join(' ')} · ${sum(rows[i])}`, pal[0]),
        line('Медиана команды', cssVar('--muted', '#526073'), { width: 1.5, dash: [4, 3], points: { show: false } })];
    } else {
      data = [s.xs, ...rows];
      // В легенде у человека — итог за период: виден без наведения.
      series = team.map((n, i) => line(`${n.split(' ').slice(0, 2).join(' ')} · ${sum(rows[i])}`, pal[i % pal.length]));
    }
    plots.push(new uPlot(opts(el, series, y, s.step), data, el));
    lastH[hKey(el)] = el.offsetHeight;
  });
  // Ширина — по месту: при изменении окна или колонки графики подстраиваются.
  ro = new ResizeObserver(() => plots.forEach((p) => { const w = p.root.parentElement.clientWidth; if (w && Math.abs(w - p.width) > 2) p.setSize({ width: w, height: 170 }); }));
  spots.forEach((el) => ro.observe(el));
}

const fmtTime = (iso) => new Date(iso).toTimeString().slice(0, 5);
function dayTitle(day) {
  const today = todayIso();
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yIso = dayOf(y.toISOString());
  if (day === today) return 'Сегодня';
  if (day === yIso) return 'Вчера';
  return `${wd(day)}, ${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;
}

function eventText(e) {
  const base = EVENT_LABELS[e.kind] || e.kind;
  if (e.kind === 'photos') return `${base}: ${e.count}`;
  if (e.kind === 'note' || e.kind === 'found') return `${base}: ${e.text || ''}`;
  if (e.kind === 'mismatch') return `${base}: ${e.field || ''}`;
  return base;
}

// История — по дням, новые сверху; строка выбирает назначение в панели.
export function historyHTML(all, f, current, limit) {
  const rows = historyRows(all, f);
  if (!rows.length) {
    return { html: `<p class="ip-hint ip-empty">${f.q || f.kind || f.day ? 'Под условия событий нет — смягчите поиск или фильтр.' : 'Событий пока нет.'}</p>`, total: 0, keys: [] };
  }
  const shown = rows.slice(0, limit);
  const groups = new Map();
  shown.forEach((r) => { const d = dayOf(r.e.at); if (!groups.has(d)) groups.set(d, []); groups.get(d).push(r); });
  const html = `<div class="icols ip-cols"><div class="ip-scroll ipc-hist">
    ${[...groups.entries()].map(([day, list]) => `<section class="ipc-day">
      <h3 class="ipc-day-h">${esc(dayTitle(day))} <span>${list.length}</span></h3>
      <ul>${list.map(({ e, s }) => `<li class="ipc-ev ${current === e.assignId ? 'cur' : ''}" data-ip-row="${esc(e.assignId)}">
        <time datetime="${esc(e.at)}" title="${esc(new Date(e.at).toLocaleString('ru-RU'))}">${fmtTime(e.at)}</time>
        <span class="ipc-ev-who">${esc(e.person)}</span>
        <span class="ipc-ev-what k-${esc(e.kind)}">${esc(eventText(e))}</span>
        <span class="ipc-ev-obj">${esc(s.title)}</span>
      </li>`).join('')}</ul>
    </section>`).join('')}
  </div></div>`;
  return { html, total: rows.length, shownN: shown.length, keys: shown.map((r) => r.e.assignId) };
}
