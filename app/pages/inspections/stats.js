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
import {
  tripsMonth, weeklySeries, historyRows, EVENT_LABELS, dayOf, todayIso,
} from './model.js';

const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const ddmm = (iso) => iso.slice(8, 10) + '.' + iso.slice(5, 7);
const wd = (iso) => WD[new Date(iso + 'T00:00:00').getDay()];
const TRIP_LABEL = { done: 'осмотрено', plan: 'план', late: 'просрочено' };


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
    const label = `${wd(d.day)} ${ddmm(d.day)}: ${n ? `${n} ${plural(n, 'выезд', 'выезда', 'выездов')}, ОИ ${oi}` : 'выездов нет'}`;
    return `<td class="ipc-cal-d ${d.inMonth ? '' : 'out'} ${d.weekend ? 'we' : ''} ${d.today ? 'today' : ''} ${n ? 'has' : ''}"
        ${n ? `tabindex="0" role="button" data-ipc-cal="${esc(d.day)}" data-ip-dp-open="day:${esc(d.day)}"` : ''} aria-label="${esc(label)}">
      <span class="ipc-cal-n">${d.n}</span>
      ${by.done.length ? `<span class="ipc-chip k-done">${by.done.length} · ОИ ${by.done.reduce((s, t) => s + t.oi, 0)}</span>` : ''}
      ${by.plan.length ? `<span class="ipc-chip k-plan">план ${by.plan.length}</span>` : ''}
      ${by.late.length ? `<span class="ipc-chip k-late">проср. ${by.late.length}</span>` : ''}
      ${n ? `<template class="ipc-pop-src"><b>${esc(wd(d.day))}, ${esc(ddmm(d.day))}</b>
        <span class="ipc-pop-sum">${n} ${plural(n, 'выезд', 'выезда', 'выездов')} · ОИ ${oi}${photos ? ` · снимков ${photos}` : ''}</span>
        <ul>${d.trips.map((t) => `<li><i class="k-${t.kind}">${TRIP_LABEL[t.kind]}</i><span>${esc(t.title)}</span><em>ОИ ${t.oi}${t.photos ? ` · ${t.photos} сн.` : ''}</em></li>`).join('')}</ul>
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
      <span class="ipc-legend"><i class="k-done"></i>осмотрено <i class="k-plan"></i>план <i class="k-late"></i>просрочено</span>
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

// Место под графики; сами графики рисует mountStats после вставки разметки.
export function statsHTML(person) {
  if (person) {
    return `<section class="ipc-card ipc-stat" aria-label="Статистика осмотрщика">
      <header><h3>ОИ и снимки по неделям</h3><span>8 законченных недель</span></header>
      <div class="ipc-plot" data-ipc-plot="person"></div>
    </section>`;
  }
  return `<div class="ipc-stats">
    <section class="ipc-card ipc-stat" aria-label="Осмотрено ОИ по неделям"><header><h3>Осмотрено ОИ</h3><span>по неделям · 8 законченных недель</span></header>
      <div class="ipc-plot" data-ipc-plot="oi"></div></section>
    <section class="ipc-card ipc-stat" aria-label="Снимков по неделям"><header><h3>Снимков</h3><span>по неделям · 8 законченных недель</span></header>
      <div class="ipc-plot" data-ipc-plot="photos"></div></section>
  </div>`;
}

const cssVar = (n, d) => (getComputedStyle(document.documentElement).getPropertyValue(n) || '').trim() || d;
const PALETTE = () => [cssVar('--blue-600', '#1668c9'), cssVar('--teal-600', '#0e8172'), cssVar('--amber-600', '#c07c1e'),
  cssVar('--violet-600', '#7a41b8'), cssVar('--slate-500', '#54718f'), '#c8372d'];

let plots = [];
let ro = null;
export function destroyStats() {
  plots.forEach((p) => p.destroy());
  plots = [];
  if (ro) { ro.disconnect(); ro = null; }
}

function opts(uPlot, el, series, scales, yLabel) {
  const ink = cssVar('--muted', '#526073');
  const grid = cssVar('--line-soft', '#dbe4ee');
  const axis = (extra = {}) => ({ stroke: ink, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid, width: 1 }, font: '11px system-ui, sans-serif', ...extra });
  return {
    width: el.clientWidth || 300,
    height: 170,
    padding: [8, 18, 0, 0],
    cursor: { drag: { x: false, y: false }, points: { size: 6 } },
    legend: { live: true },
    scales: { x: { time: true }, ...scales },
    axes: [
      axis({ values: (u, ticks) => ticks.map((t) => { const d = new Date(t * 1000); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`; }), space: 44,
      // Деления — по неделям данных; на узком графике — через одну-две, чтобы
      // даты не слипались (одна подпись ~48 px).
      splits: (u) => { const xs = u.data[0]; const w = u.bbox.width / (devicePixelRatio || 1); const step = Math.max(1, Math.ceil((xs.length * 48) / Math.max(w, 1))); return xs.filter((_, i) => (xs.length - 1 - i) % step === 0); } }),
      axis({ scale: 'y', size: 36, label: yLabel, labelSize: 14, labelFont: '11px system-ui, sans-serif' }),
      ...(scales.y2 ? [axis({ scale: 'y2', side: 1, size: 40, grid: { show: false }, label: 'снимков', labelSize: 14, labelFont: '11px system-ui, sans-serif' })] : []),
    ],
    series: [{ label: '', value: (u, v) => (v == null ? '' : `неделя с ${new Date(v * 1000).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}`) }, ...series],
  };
}

// Нарисовать графики в местах [data-ipc-plot]. names — осмотрщики для
// общих графиков; person — выбранный (свой график).
export async function mountStats(scope, ensureStyle, { names, person }) {
  destroyStats();
  const spots = scope.$$('[data-ipc-plot]');
  if (!spots.length) return;
  await ensureStyle('./app/vendor/uplot/uPlot.min.css');
  const { default: uPlot } = await import('../../vendor/uplot/uPlot.esm.js');
  if (!spots[0].isConnected) return;   // экран успел перерисоваться
  const zeroMin = { range: (u, min, max) => [0, Math.max(1, Math.ceil(max * 1.15))] };
  const pal = PALETTE();
  const line = (label, color, scale = 'y') => ({
    label, scale, stroke: color, width: 2, points: { show: true, size: 5, fill: color },
    value: (u, v) => (v == null ? '' : `(${v} за неделю)`),
  });
  const sum = (arr) => arr.reduce((x, y) => x + y, 0);
  spots.forEach((el) => {
    const kind = el.dataset.ipcPlot;
    let data; let o;
    if (kind === 'person') {
      const s = weeklySeries([person], 8);
      data = [s.xs, s.oi[0], s.photos[0]];
      o = opts(uPlot, el, [line(`ОИ · ${sum(s.oi[0])}`, pal[0]), { ...line(`Снимков · ${sum(s.photos[0])}`, pal[1], 'y2'), dash: [4, 3], width: 1.5 }],
        { y: zeroMin, y2: zeroMin }, 'ОИ');
    } else {
      const s = weeklySeries(names, 8);
      const rows = kind === 'oi' ? s.oi : s.photos;
      data = [s.xs, ...rows];
      // В легенде у человека — итог за 8 недель: виден без наведения.
      o = opts(uPlot, el, names.map((n, i) => line(`${n.split(' ').slice(0, 2).join(' ')} · ${sum(rows[i])}`, pal[i % pal.length])), { y: zeroMin },
        kind === 'oi' ? 'ОИ' : 'снимков');
    }
    plots.push(new uPlot(o, data, el));
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
