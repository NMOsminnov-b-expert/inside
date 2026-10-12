// Графики и история панели осмотров (ТЗ panel-osmotrov-tz, раздел 4 и 3.6;
// ответ пользователя В1 12.10.2026 «Оба графика. статистика + загруженность»).
//
// Столбцы — разметкой, а не картинкой: подписи читаются программами чтения
// экрана, масштаб и тема берутся из стилей. Практики (запись графа
// panel-naznacheniya-ispolniteley): ось от нуля, один цвет столбцов и один
// акцент (сегодня, просрочка), редкие подписи дат — понедельники и края,
// точное значение — в подсказке; сутки местные, выходные не показываются.
import { esc } from '../../kernel/dom.js';
import {
  loadByDay, doneByDay, periodTotals, heatRows, historyRows, EVENT_LABELS, dayOf, todayIso,
} from './model.js';

const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const ddmm = (iso) => iso.slice(8, 10) + '.' + iso.slice(5, 7);
const wd = (iso) => WD[new Date(iso + 'T00:00:00').getDay()];
// Подписи — края и понедельники; понедельник вплотную к краю не
// подписывается, иначе две даты слипаются («11.0914.09»).
const showLabel = (iso, i, n) => i === 0 || i === n - 1 || (wd(iso) === 'пн' && i > 1 && i < n - 2);

function bars(items, { value, hint, accent, click }) {
  const max = Math.max(1, ...items.map(value));
  return `<div class="ipc-bars" style="--n:${items.length}">
    ${items.map((it, i) => {
      const v = value(it);
      return `<button class="ipc-bar ${accent(it) ? 'acc' : ''}" ${click ? `data-ipc-day="${esc(it.day)}"` : 'tabindex="-1"'}
          title="${esc(hint(it))}" aria-label="${esc(hint(it))}">
        <span class="ipc-v">${v || ''}</span>
        <span class="ipc-col" style="height:${Math.round((v / max) * 100)}%"></span>
        <span class="ipc-x">${showLabel(it.day, i, items.length) ? ddmm(it.day) : ''}</span>
      </button>`;
    }).join('')}
  </div>`;
}

// Два графика выбранного осмотрщика и итог за период.
export function personChartsHTML(person) {
  const today = todayIso();
  const load = loadByDay(person, 15);
  const done = doneByDay(person, 22);
  const since = done[0].day;
  const t = periodTotals(person, since);
  const loadSum = load.days.reduce((s, d) => s + d.n, 0);
  return `<div class="ipc">
    <section class="ipc-card" aria-label="Загрузка">
      <header><h3>Загрузка</h3><span>ОИ по плановым датам · 3 недели · всего <b>${loadSum}</b>
        ${load.late ? ` · <span class="ip-late">просрочено <b>${load.late}</b></span>` : ''}</span></header>
      ${bars(load.days, {
        value: (d) => d.n,
        accent: (d) => d.day === today,
        hint: (d) => `${wd(d.day)} ${ddmm(d.day)}: запланировано ОИ — ${d.n}`,
      })}
    </section>
    <section class="ipc-card" aria-label="Сделано">
      <header><h3>Сделано</h3><span>осмотрено ОИ по дням · ${ddmm(since)}–${ddmm(today)} · ОИ <b>${t.oi}</b> · объектов <b>${t.objects}</b> · снимков <b>${t.photos}</b></span></header>
      ${bars(done, {
        value: (d) => d.n,
        accent: (d) => d.day === today,
        hint: (d) => `${wd(d.day)} ${ddmm(d.day)}: осмотрено ОИ — ${d.n}, снимков — ${d.photos}. Щелчок — история дня`,
        click: true,
      })}
      <p class="ipc-foot">заметок <b>${t.notes}</b> · расхождений <b>${t.mismatch}</b> · выявлено <b>${t.found}</b></p>
    </section>
  </div>`;
}

// Карта загрузки всех осмотрщиков на три недели: число ОИ в ячейке и цвет
// ступенями (0, 1, 2, 3, 4+); перегруз — четыре ОИ в день и больше.
export function heatHTML(names) {
  const { days, rows } = heatRows(names, 15);
  if (!rows.length) return '';
  const today = todayIso();
  const lvl = (n) => (n >= 4 ? 4 : n);
  return `<section class="ipc-card ipc-heat" aria-label="Загрузка осмотрщиков">
    <header><h3>Загрузка осмотрщиков</h3><span>ОИ по плановым датам · 3 недели</span>
      <span class="ipc-legend" aria-hidden="true"><i class="h1"></i>1 <i class="h2"></i>2 <i class="h3"></i>3 <i class="h4"></i>4+</span></header>
    <div class="ipc-heat-scroll"><table class="ipc-heat-tbl">
      <thead><tr><th>Осмотрщик</th><th class="num" title="Плановая дата прошла">Проср.</th>
        ${days.map((d) => `<th class="${d === today ? 'today' : ''} ${wd(d) === 'пн' ? 'mon' : ''}" title="${wd(d)} ${ddmm(d)}">${d.slice(8, 10)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr data-ip-person="${esc(r.name)}">
        <th>${esc(r.name)}</th>
        <td class="num ${r.late ? 'ip-late' : ''}">${r.late || ''}</td>
        ${r.cells.map((n, i) => `<td class="h${lvl(n)}" title="${esc(r.name)} · ${wd(days[i])} ${ddmm(days[i])}: ${n} ОИ">${n || ''}</td>`).join('')}
      </tr>`).join('')}</tbody>
    </table></div>
  </section>`;
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
