// Вкладка «Сегодня» экрана осмотрщика — весь план по дням.
//
// Постановка пользователя 14.10.2026: «У нас могут быть и задачи со вчера,
// план мог измениться (нужен просмотр и предыдущих и будущих задач).
// осмотрщик должен четко понимать, когда и что будет делать»; ответы на
// уточнения — запись графа ekran-osmotrschika-pererabotat-ergonomika: «Весь
// план списком»; метки «Перенесено с даты», «Новое», «Снято», «Изменён
// состав»; несделанное осмотрщик берёт на сегодня сам и сразу; сегодняшний
// выезд снимает сам, но «если не совпало с планом — отчет регионалу»; «не
// забывай про оптимизацию отображаемого. С поиском».
//
// Порядок секций — сегодня, не сделано раньше, будущие дни, без даты,
// прошлое. Практики: план секциями по дням с числом выездов у дня и
// отмеченным сегодня; просроченное помечено отдельно; заголовок дня
// прилипает при прокрутке (агенда Dynamics 365 Field Service, ServiceNow
// Events List, FullCalendar list view — запись графа practices). Рисуется
// порция строк, остальное — «Показать ещё»: на телефоне длинный список
// иначе тормозит при каждой перерисовке.
import { esc } from '../../kernel/dom.js';
import { SKIP_REASONS } from '../../kernel/inspections.js';
import { ico, navPickHTML } from './views.js';

export const PLAN_STEP = 30;
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const ddmm = (iso) => (iso ? iso.slice(8, 10) + '.' + iso.slice(5, 7) : '');
const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dayName = (iso, today) => {
  if (iso === today) return 'Сегодня';
  if (iso === addDays(today, 1)) return 'Завтра';
  if (iso === addDays(today, -1)) return 'Вчера';
  return WD[new Date(iso + 'T00:00:00').getDay()];
};

// Метки изменений плана — по журналу назначения (events — события этого
// назначения, старые сначала). seenAt — когда осмотрщик открывал план прошлый
// раз: «Новое» — назначено после этого.
export function planMarks(t, events, seenAt) {
  const out = [];
  const mine = events.filter((e) => e.assignId === t.assignId);
  const assigned = mine.find((e) => e.kind === 'assigned');
  if (assigned && seenAt && assigned.at > seenAt) out.push({ tone: 'new', text: 'Новое' });
  const lastDate = [...mine].reverse().find((e) => e.kind === 'moved' || e.kind === 'taken');
  if (lastDate) {
    const was = lastDate.was !== undefined ? lastDate.was : (String(lastDate.text || '').split(' → ')[0] || '');
    const from = /^\d{4}-\d{2}-\d{2}$/.test(was) ? ddmm(was) : 'без даты';
    out.push(lastDate.kind === 'taken'
      ? { tone: 'own', text: `Взято вами, план был ${from}` }
      : { tone: 'moved', text: `Перенесено с ${from}` });
  }
  if (mine.some((e) => e.kind === 'updated' && (!assigned || e.at > assigned.at))) out.push({ tone: 'moved', text: 'Изменён состав' });
  return out;
}

const marksHTML = (marks) => (marks.length
  ? `<span class="ins-pl-marks">${marks.map((m) => `<span class="ins-pl-mark is-${m.tone}">${esc(m.text)}</span>`).join('')}</span>`
  : '');

const metaOf = (t) => [t.typeLabel, t.institution].filter(Boolean).join(' · ');
const hrefOf = (t) => `#/insp/${encodeURIComponent(t.typeId)}/${encodeURIComponent(t.ocId)}`;

// Поиск — по названию (в нём адрес), учреждению, виду и ЕНИ; без учёта
// регистра, ЕНИ — и с дефисами, и без.
export function planMatch(t, q) {
  if (!q) return true;
  const hay = [t.title, t.institution, t.typeLabel, t.eni, String(t.eni || '').replace(/\D/g, '')].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

// Строка плана в секциях кроме сегодняшней — компактная: на телефоне в
// экран входит неделя, а не два дня.
function rowHTML(t, { marks = [], take = false, note = '', struck = false } = {}) {
  return `<li class="ins-pl-row ${struck ? 'is-struck' : ''} ${t.done ? 'is-done' : ''}">
    <a class="ins-pl-a" href="${hrefOf(t)}">
      <b class="ins-pl-t">${esc(t.title)}</b>
      <span class="ins-pl-m">${esc(metaOf(t))}</span>
      ${note ? `<span class="ins-pl-m ${struck ? '' : 'ins-warn'}">${esc(note)}</span>` : ''}
      ${marksHTML(marks)}
    </a>
    ${take ? `<button type="button" class="ins-btn ins-btn-sm ins-pl-take" data-plan-take="${esc(t.assignId)}">На сегодня</button>` : ''}
  </li>`;
}

// Сегодняшний выезд — полный: «Ехать», снятие с дня.
function tripHTML(x, i, { marks, app, skipOpen, skipErr }) {
  const t = x.t;
  const canSkip = t.assignId && !t.done;
  return `<li class="ins-trip ${t.done ? 'is-done' : ''}">
    <span class="ins-trip-n" aria-hidden="true">${t.done ? ico('ok', 14) : i + 1}</span>
    <div class="ins-trip-b">
      <a class="ins-trip-a" href="${hrefOf(t)}">
        <b class="ins-trip-t">${esc(t.title)}</b>
        <span class="ins-trip-m">${esc(metaOf(t))}</span>
        <span class="ins-trip-m mono">${esc(t.eni || '')}</span>
        <span class="ins-trip-m">ОИ: ${t.oiAssigned ? `${t.oiAssigned} из ${t.oiCount}` : t.oiCount}${t.photos ? ` · фото: ${t.photos}` : ''}${t.done ? ' · осмотр завершён' : ''}</span>
        ${marksHTML(marks)}
      </a>
      ${x.ll ? navPickHTML(t.key, x.links, 'Ехать', app) : '<span class="ins-trip-m ins-warn">Координат нет — адрес в задаче</span>'}
      ${canSkip && skipOpen !== t.assignId ? `<button type="button" class="ins-btn ins-btn-sm ins-pl-skip" data-plan-skip="${esc(t.assignId)}" aria-expanded="false">Снять с дня</button>` : ''}
      ${canSkip && skipOpen === t.assignId ? skipFormHTML(t, skipErr) : ''}
    </div>
  </li>`;
}

// Снятие с дня — на месте, без окна поверх. Причина обязательна: снятое —
// «не по плану», регионал получает её в уведомлениях.
function skipFormHTML(t, err) {
  return `<div class="ins-pl-skipf" data-plan-skipf="${esc(t.assignId)}">
    <div class="ins-field">
      <label for="plSkipR">Причина</label>
      <select class="select ins-select" id="plSkipR" data-plan-skip-reason>
        <option value="">— выберите —</option>
        ${SKIP_REASONS.map((r) => `<option>${esc(r)}</option>`).join('')}
      </select>
    </div>
    <div class="ins-field">
      <label for="plSkipN">Комментарий</label>
      <textarea class="ins-ta" id="plSkipN" rows="2" data-plan-skip-note></textarea>
    </div>
    ${err ? `<p class="ins-pl-err" role="alert">${esc(err)}</p>` : ''}
    <p class="ins-hint">Выезд останется за вами без даты; причина уйдёт регионалу.</p>
    <div class="ins-acts">
      <button type="button" class="ins-btn" data-plan-skip-cancel>Не снимать</button>
      <button type="button" class="ins-btn ins-btn-main" data-plan-skip-go="${esc(t.assignId)}">Снять и сообщить</button>
    </div>
  </div>`;
}

function sectionHTML(title, n, body, { cls = '', more = '' } = {}) {
  return `<section class="ins-blk ins-pl-sec ${cls}">
    <h2 class="ins-blk-h ins-pl-h">${title}${n ? ` · ${n}` : ''}</h2>
    ${body}${more}
  </section>`;
}

// Модель плана: задачи (myTasks) раскладываются по секциям. removed —
// снятые регионалом назначения последних двух недель ({ t, at }).
export function planModel({ tasks, removed, today, q }) {
  const m = { today: [], overdue: [], future: new Map(), undated: [], past: [], removed: [] };
  tasks.filter((t) => planMatch(t, q)).forEach((t) => {
    const d = t.plannedAt;
    if (d === today) m.today.push(t);
    else if (!t.done && t.pending && d && d < today) m.overdue.push(t);
    else if (!t.done && t.pending && d > today) {
      if (!m.future.has(d)) m.future.set(d, []);
      m.future.get(d).push(t);
    } else if (!t.done && t.pending && !d) m.undated.push(t);
    // Прошлое — законченные осмотры и прошедшие даты. Объекты, где человек
    // лишь записан осмотрщиком без назначения и осмотра, в план не входят:
    // они в «Задачи → Все мои».
    else if (t.done || d) m.past.push(t);
  });
  m.removed = removed.filter((x) => planMatch(x.t, q));
  m.overdue.sort((a, b) => b.plannedAt.localeCompare(a.plannedAt));
  m.future = new Map([...m.future.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  m.past.sort((a, b) => String(b.plannedAt || b.updatedAt || '').localeCompare(String(a.plannedAt || a.updatedAt || '')));
  return m;
}

// Вся вкладка. stops — сегодняшние выезды в порядке маршрута ({ t, ll,
// links }); skips — снятые сегодня ({ t, reason, note }); limit — сколько
// строк рисовать в длинных секциях.
export function planHTML({ m, today, q, stops, skips, routeLinks, app, marksOf, limit, skipOpen, skipErr, pastOpen, map = '' }) {
  const search = `<div class="ins-pl-q">
    <span class="ins-pl-q-ico" aria-hidden="true">${ico('search', 18)}</span>
    <input class="ins-pl-q-in" type="search" inputmode="search" enterkeyhint="search" autocomplete="off"
      placeholder="Адрес, учреждение, ЕНИ" aria-label="Поиск по плану" value="${esc(q)}" data-plan-q>
  </div>`;
  return `${search}${map}<div class="ins-pl" data-plan-list>${planListHTML({ m, today, q, stops, skips, routeLinks, app, marksOf, limit, skipOpen, skipErr, pastOpen })}</div>`;
}

export function planListHTML({ m, today, q, stops, skips, routeLinks, app, marksOf, limit, skipOpen, skipErr, pastOpen }) {
  const parts = [];
  let left = limit;
  const take = (list) => { const n = Math.max(0, Math.min(list.length, left)); left -= n; return list.slice(0, n); };
  const moreBtn = (rest) => (rest > 0 ? `<button type="button" class="ins-btn ins-btn-wide ins-pl-more" data-plan-more>Показать ещё · ${rest}</button>` : '');

  // Сегодня — всегда целиком: это день, ради которого экран открыт.
  const withGps = stops.filter((x) => x.ll && !x.t.done);
  const todayBody = stops.length || skips.length
    ? `${withGps.length > 1 ? navPickHTML('route', routeLinks, `Весь маршрут · ${withGps.length}`, app, false) : ''}
      <ol class="ins-trips">${stops.map((x, i) => tripHTML(x, i, { marks: marksOf(x.t), app, skipOpen, skipErr })).join('')}</ol>
      ${skips.length ? `<ul class="ins-pl-list">${skips.map((s) => rowHTML(s.t, { struck: true, note: `Снято вами: ${s.reason}${s.note ? ' — ' + s.note : ''}` })).join('')}</ul>` : ''}`
    : `<p class="ins-empty">${q ? 'На сегодня по запросу ничего нет.' : 'На сегодня выездов нет — возьмите задачу из несделанных или будущих.'}</p>`;
  parts.push(sectionHTML(`Сегодня, ${ddmm(today)}`, stops.length, todayBody, { cls: 'ins-today is-today' }));

  if (m.overdue.length) {
    const shown = take(m.overdue);
    parts.push(sectionHTML('Не сделано раньше', m.overdue.length,
      `<ul class="ins-pl-list">${shown.map((t) => rowHTML(t, { take: true, note: `План был ${ddmm(t.plannedAt)}, ${dayName(t.plannedAt, today)}`, marks: marksOf(t) })).join('')}</ul>`,
      { cls: 'is-overdue', more: shown.length < m.overdue.length ? moreBtn(m.overdue.length - shown.length) : '' }));
  }

  const futureRest = () => [...m.future.values()].reduce((s, l) => s + l.length, 0);
  if (m.future.size) {
    const days = [];
    let hidden = 0;
    for (const [d, list] of m.future) {
      const shown = take(list);
      hidden += list.length - shown.length;
      if (!shown.length) continue;
      days.push(`<h3 class="ins-pl-day">${esc(dayName(d, today))}, ${ddmm(d)} · ${list.length}</h3>
        <ul class="ins-pl-list">${shown.map((t) => rowHTML(t, { take: !!t.assignId, marks: marksOf(t) })).join('')}</ul>`);
    }
    parts.push(sectionHTML('Дальше по плану', futureRest(), days.join(''), { more: moreBtn(hidden) }));
  }

  if (m.undated.length) {
    const shown = take(m.undated);
    parts.push(sectionHTML('Без даты', m.undated.length,
      `<ul class="ins-pl-list">${shown.map((t) => rowHTML(t, { take: !!t.assignId, marks: marksOf(t),
        note: t.skip ? `Снято вами ${ddmm(t.skip.date)}: ${t.skip.reason}` : '' })).join('')}</ul>`,
      { more: moreBtn(m.undated.length - shown.length) }));
  }

  // Прошлое и снятое регионалом — свёрнуто: открывают, чтобы свериться.
  const pastN = m.past.length + m.removed.length;
  if (pastN) {
    const open = pastOpen || !!q;
    const body = open
      ? (() => {
        const rem = take(m.removed);
        const past = take(m.past);
        return `<ul class="ins-pl-list">
          ${rem.map((x) => rowHTML(x.t, { struck: true, note: `Снято регионалом ${ddmm(x.at.slice(0, 10))}${x.t.plannedAt ? `, план был ${ddmm(x.t.plannedAt)}` : ''}` })).join('')}
          ${past.map((t) => rowHTML(t, { note: t.done ? `Осмотр завершён${t.plannedAt ? `, план ${ddmm(t.plannedAt)}` : ''}` : (t.plannedAt ? `План ${ddmm(t.plannedAt)}` : '') })).join('')}
        </ul>${moreBtn(pastN - rem.length - past.length)}`;
      })()
      : '';
    parts.push(`<section class="ins-blk ins-pl-sec">
      <button type="button" class="ins-pl-fold" data-plan-past aria-expanded="${open ? 'true' : 'false'}">
        <span class="ins-blk-h ins-pl-h">Сделано и снято раньше · ${pastN}</span><span class="ins-pl-chev">${ico('chev', 18)}</span>
      </button>
      ${body}
    </section>`);
  }

  if (q && !m.today.length && !m.overdue.length && !m.future.size && !m.undated.length && !pastN) {
    parts.push('<p class="ins-empty">По запросу ничего не нашлось. Проверьте написание или ищите по ЕНИ.</p>');
  }
  return parts.join('');
}

// --- план на карте -----------------------------------------------------------
//
// Указание пользователя 14.10.2026: «Хорошо бы еще на карте их показывать
// человеку» — и в «Сегодня», и в «Задачах»; «Карта должна быть крупнее…
// Подстраиваем под удобство мобилки». Сегодняшние выезды — номерами в
// порядке маршрута, несделанное раньше — оранжевым, дальше по плану —
// серым; касание точки — строка объекта под картой. Точки — слоем карты
// (на слабом телефоне сотня отдельных элементов тормозит), номерами —
// только сегодняшние: их немного.
export const PLAN_POINT_KINDS = [
  { key: 'today', label: 'Сегодня', color: '#1d6fd8' },
  { key: 'overdue', label: 'Не сделано раньше', color: '#d97706' },
  { key: 'future', label: 'Дальше по плану', color: '#64748b' },
  { key: 'done', label: 'Осмотр завершён', color: '#0e8172' },
];

// Точки плана: { key, ll, kind, n, title, sub, href }. gpsOf(t) — [широта,
// долгота] или null.
export function planPoints({ m, stops, today, gpsOf }) {
  const out = [];
  const add = (t, kind, n, sub) => {
    const ll = gpsOf(t);
    if (ll) out.push({ key: t.key, ll, kind, n, title: t.title, sub, href: hrefOf(t) });
  };
  stops.forEach((x, i) => add(x.t, x.t.done ? 'done' : 'today', x.t.done ? 0 : i + 1, `Сегодня · ${i + 1}-й по маршруту`));
  m.overdue.forEach((t) => add(t, 'overdue', 0, `Не сделано, план был ${ddmm(t.plannedAt)}`));
  for (const [d, list] of m.future) list.forEach((t) => add(t, 'future', 0, `${dayName(d, today)}, ${ddmm(d)}`));
  return out;
}

// Точки «Задач» — объекты списка по их состоянию.
export function taskPoints(tasks, today, gpsOf) {
  const out = [];
  tasks.forEach((t) => {
    const ll = gpsOf(t);
    if (!ll) return;
    const kind = t.done ? 'done' : t.plannedAt === today ? 'today' : t.plannedAt && t.plannedAt < today && t.pending ? 'overdue' : 'future';
    const sub = t.done ? 'Осмотр завершён' : t.plannedAt ? `План ${ddmm(t.plannedAt)}, ${dayName(t.plannedAt, today)}` : 'Без даты';
    out.push({ key: t.key, ll, kind, n: 0, title: t.title, sub, href: hrefOf(t) });
  });
  return out;
}

export function planMapHTML({ kinds, label }) {
  const used = PLAN_POINT_KINDS.filter((k) => kinds.includes(k.key));
  return `<section class="ins-blk ins-plmap">
    <div class="ins-gmap-w" data-ins-map-w>
      <div class="ins-gmap ins-gmap-plan" data-plan-map role="img" aria-label="${esc(label)}"></div>
      <button type="button" class="ins-gmap-t" data-map-big aria-pressed="false"
        aria-label="Развернуть карту" title="Развернуть карту">${ico('expand', 20)}</button>
    </div>
    <div class="ins-plmap-leg">${used.map((k) => `<span class="ins-plmap-k"><i style="background:${k.color}"></i>${esc(k.label)}</span>`).join('')}</div>
    <div class="ins-plmap-pick" data-plan-pick hidden></div>
  </section>`;
}

export function planPickHTML(p) {
  return `<a class="ins-plmap-a" href="${p.href}">
      <b class="ins-pl-t">${esc(p.title)}</b>
      <span class="ins-pl-m">${esc(p.sub)}</span>
    </a>
    <a class="ins-btn ins-btn-sm ins-plmap-open" href="${p.href}">Открыть</a>`;
}
