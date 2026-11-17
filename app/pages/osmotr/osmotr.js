// Страница осмотрщиков — веб-страница осмотрщика (перенос приложения «Осмотр»
// в веб, решение пользователя 16.11.2026: «перенести из PWA все в веб. За
// референс возьмем веб версию базы… возьмешь стили, разметку. будем
// адаптировать тот интерфейс под логику»). Образец вида — мобильный вид
// стенда E•state (снимки docs/источники/система/estate-мобильный-вид/), логика
// и поля — приложения «Осмотр» (osmotr/). Граф: решение
// osmotrschik-vidit-tolko-nuzhnoe-dlya-vyezda-…
//
// Что видит осмотрщик (16.11.2026: «Осмотрщик видит СЛИШКОМ много… как
// доехать, где опознать + поэтажка с генпланом»): адрес, участок на карте и
// маршрут, контакт на месте, ЕНИ, документы для выезда, состав объекта.
// Данные карточки ЦОД (класс, площади по документам, конструктив, износ,
// состояние) осмотрщику не показываются и не правятся. Отдельных разделов
// «как доехать» и «где опознать» нет — сведения встроены в экраны.
//
// Экраны — адресом #/osmotr?v=…: today (главная «Сегодня»), trips («Выезды»,
// &f — отбор по типам: real, vehicle, inv; &s — open, done, all, back, late), search, menu, notes, obj (&id —
// «typeId|ocId», &tab — task, docs), doc (&id, &doc — документ), oi (&id, &oi — объект имущества: разделы
// осмотра раскрываемыми блоками), sec (&id, &oi, &s — тот же экран ОИ с раскрытым разделом), app —
// приложение «Осмотр» в рамке (пока перенос не закончен).
//
// Прежний экран осмотрщика (#/insp, pages/inspector) убран 16.11.2026; его
// адреса открывают эту страницу. Общее для осмотров — в pages/inspection.
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: назначения, документы, участок — API сервера
// (сейчас — data.js поверх данных браузера).

import { setCrumbs, setActiveNav } from '../../shell/shell.js';
import { esc } from '../../kernel/dom.js';
import { foldSearch, fmtEni } from '../../kernel/fmt.js';
import { session, roleLabel } from '../../kernel/session.js';
import { loadMapLibre, createMap, ownParcelsGL } from '../../kernel/mapgl.js';
import { resultsOf, valuesOf, saveResults, addResultPhoto } from '../../kernel/inspectionResults.js';
import { takeForDay, planOf, absenceOn, absenceLabel, startWork, myAssignsOn, finishWork, requestMove, skipReasons, logEvent, eventsOf, changed, isLive, assignmentsOfPerson, reportOf, saveReport, lateWorkdays, LATE_REPORT_WORKDAYS, workdayOf, allCadRequests, cadBranch, cadKindLabel, cadResultLabel, answerCadRow, detachCadFile, cadFileAccepted } from '../../kernel/inspections.js';
import { osrmKm, dayPoints } from '../inspections/route.js';
import { markItem, markOf, addItemPhoto, removeItemPhoto, extrasOf, addExtra } from '../../kernel/inventories.js';
import { getValue, setValue, isFilled } from '../../kernel/fieldSchema.js';
import { loadTask, ownOis, photoCatsOf, addPhoto, removePhoto, movePhoto, foundOi, addFoundOi, removeFoundOi, foundCat, FOUND_CATS } from '../inspection/tasks.js';
import { myObjects, docsOf, findObject, fillGeo, onGeoDone, isoDay, inventoryOf, titleOf } from './data.js';
import { notesOf, markRead } from './feed.js';
import { pwaSections, pwaDefaults } from './params.js';
import { instrIndex, instrDoc, instrUrl, sectionsOf, searchInstr, allDocs, instrForItem, instrForPlace } from './instructions.js';

const HREF = '#/osmotr';

// Типы объектов к осмотру — отбор в «Выездах» и пункты меню (16.11.2026: «у нас
// еще и описи есть»; «Фильтры должны быть только там, где видны сами обьекты.
// На экране сегодня их по идее не будет»). Оборудование — описи и механизмы, в том числе внутри недвижимости.
const KINDS = [
  { key: 'real', label: 'Недвижимое', test: (o) => o.entity === 'real' },
  { key: 'vehicle', label: 'Транспорт', test: (o) => o.entity === 'vehicle' },
  { key: 'inv', label: 'Оборудование', test: (o) => o.entity === 'inventory' || (o.inventories || []).length > 0 },
];
const byKind = (list, f) => { const k = KINDS.find((x) => x.key === f); return k ? list.filter(k.test) : list; };

// Состояние словом — как в приложении (EstateUi.kt, estateState).
function stateOf(o) {
  if (o.removed) return { word: 'Снято регионалом', tone: 'slate' };
  if (o.state === 'done') return { word: 'Закончен', tone: 'green' };
  if ((o.returned || []).length) return { word: 'На доосмотр', tone: 'amber' };
  if (o.state === 'progress') return { word: 'В работе', tone: 'blue' };
  return { word: 'Назначено', tone: 'violet' };
}
const shortDate = (iso) => (iso && iso.length >= 10 ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : iso || '');
const WEEKDAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const href = (q) => HREF + '?' + Object.entries(q).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
// Маршрут — одной кнопкой, выбор навигатора — системе телефона (пользователь 17.11.2026: «эту ссылку в идеале
// передавать системе, что бы там человек сам из выпадающего списка системы выбирал приложение»). Практика
// (OSM wiki «Geo URI scheme»; Oracle Field Service, действие Navigate): Android — geo:-ссылка, система
// предлагает установленные навигаторы (2ГИС, Google, Яндекс…); iPhone — своего выбора нет, maps:// открывает
// Apple Карты; компьютер — Google Карты в браузере. По точке, без неё — по адресу.
export function routeHref(p, ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  const pt = p.lat != null && p.lon != null;
  const a = encodeURIComponent(p.address || '');
  if (!pt && !a) return '';
  const at = pt ? `${p.lat},${p.lon}` : '';
  if (/Android/i.test(ua)) return pt ? `geo:${at}?q=${at}(${encodeURIComponent(p.name || p.title || '')})` : `geo:0,0?q=${a}`;
  if (/iPhone|iPad|iPod/i.test(ua)) return `maps://?daddr=${pt ? at : a}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${pt ? at : a}`;
}
const routeBtn = (p, primary = false) => {
  const u = routeHref(p);
  return u ? `<a class="om-btn om-route${primary ? ' om-btn-primary' : ''}" href="${esc(u)}"${u.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>${ico('route', 18)}Маршрут</a>` : '';
};

// --- значки (контур 24×24, как у стенда) --------------------------------------------------------
const I = {
  today: '<path d="M8 3v3M16 3v3M4 8h16M5 5h14v15H5zM9 13h2v2H9z"/>',
  trips: '<path d="m3 11 9-7 9 7M6 9.5V20h12V9.5M10 20v-5h4v5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  menu: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  task: '<path d="M14 3H6v18h12V7zM14 3v4h4M9 12h6M9 16h4"/>',
  docs: '<path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  real: '<path d="M4 20V9l8-5 8 5v11M9 20v-6h6v6"/>',
  vehicle: '<path d="M3 16V8h11v8M14 11h4l3 3v2h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>',
  inv: '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  mail: '<path d="M3 6h18v12H3zM3 7l9 6 9-6"/>',
  book: '<path d="M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6M20 4v14h-6"/>',
  clip: '<path d="M21 11.5 12.5 20a5 5 0 0 1-7-7L14 4.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4L15.5 7.6"/>',
  route: '<path d="M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 15V9a4 4 0 0 1 4-4h4M18 9v6a4 4 0 0 1-4 4h-4"/>',
  copy: '<path d="M9 9h11v11H9zM5 15H4V4h11v1"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5zM3 13l9 5 9-5"/>',
  alert: '<path d="M12 4 2 20h20zM12 10v4M12 17h.01"/>',
  app: '<path d="M7 2h10v20H7zM11 18h2"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3v13H4z"/><circle cx="12" cy="13" r="4"/>',
  photo: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
};
const ico = (k, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[k] || ''}</svg>`;
// Значок — по типу ОЦ, как в приложении (EstateUi.kt, typeIcon): участок — слои карты.
const kindIco = (o) => ico(o.entity === 'vehicle' ? 'vehicle' : o.entity === 'inventory' ? 'inv' : o.typeId === 'land-plot' ? 'layers' : 'real', 18);

// --- части экранов ------------------------------------------------------------------------------
const chip = (o) => { const s = stateOf(o); return `<span class="om-chip om-t-${s.tone}">${esc(s.word)}</span>`; };
const top = (title, right = '') => `<header class="om-top"><h1 class="om-h1">${esc(title)}</h1><div class="om-top-r">${right}</div></header>`;
const back = (to, label) => `<a class="om-back" href="${esc(to)}">${ico('back', 18)}<span>${esc(label)}</span></a>`;
const bell = (n) => `<a class="om-icon" href="${href({ v: 'notes' })}" aria-label="Входящие${n ? ': новых ' + n : ''}" title="Входящие">${ico('bell')}${n ? `<b class="om-badge">${n > 99 ? '99+' : n}</b>` : ''}</a>`;

function kindChips(list, f, v) {
  const all = `<a class="om-seg${!f ? ' on' : ''}" href="${href({ v })}" aria-current="${!f}">Все <b>${list.length}</b></a>`;
  return `<nav class="om-segs" aria-label="Тип объектов">${all}${KINDS.map((k) => {
    const n = byKind(list, k.key).length;
    return `<a class="om-seg${f === k.key ? ' on' : ''}${n ? '' : ' none'}" href="${href({ v, f: k.key })}" aria-current="${f === k.key}">${esc(k.label)} <b>${n}</b></a>`;
  }).join('')}</nav>`;
}

function objRow(o) {
  const meta = [o.eni ? esc(fmtEni(o.eni) || o.eni) : '', o.docs.length ? `${ico('docs', 14)} Документы · ${o.docs.length}` : '',
    o.plannedAt && o.state !== 'done' ? `на ${esc(shortDate(o.plannedAt))}` : '', o.deadline && o.state !== 'done' ? `срок ${esc(shortDate(o.deadline))}` : '']
    .filter(Boolean).map((x) => `<span>${x}</span>`).join('');
  return `<a class="om-card om-obj om-t-${stateOf(o).tone}" href="${href({ v: 'obj', id: o.id })}">
    <span class="om-obj-head"><span class="om-obj-kind">${kindIco(o)}${esc(o.typeLabel)}</span>${chip(o)}</span>
    <b class="om-obj-title">${esc(o.title)}</b>
    ${o.ts && o.ts !== o.title ? `<span class="om-obj-ts">${esc(o.ts)}</span>` : ''}
    ${o.institution && o.address ? `<span class="om-obj-inst">${esc(o.institution)}</span>` : ''}
    ${meta ? `<span class="om-obj-meta">${meta}</span>` : ''}
  </a>`;
}

// --- экраны -------------------------------------------------------------------------------------
// --- планы: 28 дней вперёд (как в приложении «Осмотр», EstateDay.kt, PlansScreen) ------------------------------
// Не сделано раньше; по дням — область из плана месяца, отсутствие, выезды; нерабочий день — бледно. Внизу — задачи
// без даты с «Взять на день»: на любой из ближайших 28 дней, не только на сегодня (автор приложения, 06.11.2026).
const PLAN_DAYS = 28;
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoDay(d); };
function dayHead(iso, today) {
  const d = new Date(iso + 'T00:00:00');
  const rel = iso === today ? 'Сегодня' : iso === addDays(today, 1) ? 'Завтра' : WEEKDAYS[d.getDay()];
  return `${rel}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
const chipDay = (iso) => { const d = new Date(iso + 'T00:00:00'); return `${['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][d.getDay()]} ${shortDate(iso)}`; };
function planRow(o, sub = '', take = null) {
  const subs = [sub, o.moveReq ? 'запрошен перенос на ' + shortDate(o.moveReq.date) : ''].filter(Boolean).join(' · ');
  const open = take && take.open === o.id;
  return `<div class="om-planrow${open ? ' open' : ''}">
    <a class="om-row" href="${href({ v: 'obj', id: o.id })}"><span class="om-row-tx"><b>${esc(o.title)}</b>${subs ? `<small>${esc(subs)}</small>` : ''}</span>${take ? '' : ico('chev', 18)}</a>
    ${take ? `<button type="button" class="om-btn om-take-btn" data-take="${esc(o.id)}" aria-expanded="${open}">Взять на день</button>` : ''}
    ${open ? `<form class="om-take" data-take-form="${esc(o.id)}">
      <div class="om-segs om-segs-line" role="radiogroup" aria-label="День">${Array.from({ length: PLAN_DAYS }, (_, i) => addDays(take.today, i)).map((d) => `<label class="om-seg om-opt-r${d === take.day ? ' on' : ''}"><input type="radio" name="day" value="${d}"${d === take.day ? ' checked' : ''} hidden>${chipDay(d)}</label>`).join('')}</div>
      <p class="om-muted">${esc(dayHead(take.day, take.today))}</p>
      <button class="om-btn om-btn-primary" type="submit">Взять</button>
    </form>` : ''}
  </div>`;
}
function viewPlans(all, ui) {
  const person = session.state.person;
  const today = isoDay();
  const live = all.filter((o) => o.state !== 'done' && !o.removed);
  const overdue = live.filter((o) => o.plannedAt && o.plannedAt < today);
  const noDate = live.filter((o) => !o.plannedAt);
  const take = { open: ui.take, day: ui.takeDay || today, today };
  const days = Array.from({ length: PLAN_DAYS }, (_, i) => addDays(today, i)).map((d) => {
    const plan = planOf(person, d);
    const ab = absenceOn(person, d);
    const wd = new Date(d + 'T00:00:00').getDay();
    return { d, items: live.filter((o) => o.plannedAt === d), region: plan ? [plan.region, plan.district, plan.institutions].filter(Boolean).join(' · ') : '',
      absence: ab ? [absenceLabel(ab.kind), ab.note].filter(Boolean).join(' — ') : '', off: wd === 0 || wd === 6 };
  });
  return `${back(href({ v: 'menu' }), 'Меню')}
    <h1 class="om-title om-title-sm">Планы</h1>
    ${overdue.length ? `<h2 class="om-cap om-sec">Не сделано раньше · ${overdue.length}</h2><div class="om-group">${overdue.map((o) => planRow(o, 'с ' + shortDate(o.plannedAt))).join('')}</div>` : ''}
    <div class="om-days">${days.map((x) => `<section class="om-card om-day${x.off && !x.items.length ? ' off' : ''}" data-day="${x.d}">
      <div class="om-day-h"><b>${esc(dayHead(x.d, today))}</b>${x.off ? '<span class="om-muted">Нерабочий</span>' : ''}</div>
      ${x.region ? `<p class="om-muted">${esc(x.region)}</p>` : ''}
      ${x.absence ? `<span class="om-chip om-t-amber">${esc(x.absence)}</span>` : ''}
      ${x.items.map((o) => planRow(o)).join('')}
    </section>`).join('')}</div>
    ${noDate.length ? `<h2 class="om-cap om-sec" id="om-nodate">Без даты · ${noDate.length}</h2><div class="om-group">${noDate.map((o) => planRow(o, o.deadline ? 'срок ' + shortDate(o.deadline) : '', take)).join('')}</div>` : ''}`;
}

// --- инструкции по осмотрам (как в приложении «Осмотр»: InstructionsScreen.kt) --------------------------------
// Список по группам и поиск по тексту всех инструкций; документ — полоса разделов, текст с жирным и курсивом,
// фото (касание — во всю вкладку), страницы бланка, файл для организации. Данные — pages/osmotr/instructions.js.
const runsHTML = (runs) => (runs || []).map(([t, st]) => { let h = esc(t); if (st & 2) h = `<i>${h}</i>`; if (st & 1) h = `<b>${h}</b>`; return h; }).join('');
function imgHTML(id, im) {
  return `<figure class="om-ifig"><a href="${esc(instrUrl(id, im.f))}" target="_blank" rel="noopener"><img src="${esc(instrUrl(id, im.f))}" width="${im.w}" height="${im.h}" alt="${esc((im.cap || []).map((r) => r[0]).join('') || 'Фото к инструкции')}" loading="lazy"></a>${(im.cap || []).length ? `<figcaption>${runsHTML(im.cap)}</figcaption>` : ''}</figure>`;
}
function blockHTML(id, b, i) {
  const at = `id="om-ib-${i}"`;
  if (b.k === 'h') return b.lvl === 1 ? '' : `<h2 class="om-ih" ${at}>${runsHTML(b.runs)}</h2>`;
  if (b.k === 'li') return `<p class="om-ili" ${at} style="--lvl:${Math.max(0, (b.lvl || 1) - 1)}"><span class="om-ili-m">${esc(b.m || '•')}</span><span>${runsHTML(b.runs)}</span></p>`;
  if (b.k === 'img') return `<div class="om-iimgs" ${at}>${(b.items || []).map((im) => imgHTML(id, im)).join('')}${(b.cap || []).length ? `<p class="om-muted">${runsHTML(b.cap)}</p>` : ''}</div>`;
  return `<p class="om-ip" ${at}>${runsHTML(b.runs)}</p>`;
}
const instrRow = (e, sub = '', to = null) => `<a class="om-row" href="${to || href({ v: 'instr', id: e.id })}"><span class="om-row-ico om-t-teal">${ico('book')}</span><span class="om-row-tx"><span>${esc(e.title)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${ico('chev', 18)}</a>`;
function viewInstr(q, rerender) {
  const list = instrIndex(rerender);
  const head = (title, to = href({ v: 'menu' }), label = 'Меню') => `${back(to, label)}<h1 class="om-title om-title-sm">${esc(title)}</h1>`;
  if (list === null) return `${head('Инструкции')}<div class="om-card om-empty">Загрузка…</div>`;
  if (list === false) return `${head('Инструкции')}<div class="om-card om-empty">Инструкций на этом устройстве нет<span class="om-dev" title="Инструкции — документы компании, в git не кладутся. Положить: python tools/osmotr/instructions.py">i</span></div>`;
  if (q.id) {
    const e = list.find((x) => x.id === q.id);
    const d = e ? instrDoc(e.id, rerender) : false;
    const to = href({ v: 'instr', q: q.q || '' });
    if (d === null) return `${head(e.title, to, 'Инструкции')}<div class="om-card om-empty">Загрузка…</div>`;
    if (!d) return `${head('Инструкция', to, 'Инструкции')}<div class="om-card om-empty">Инструкции нет</div>`;
    const secs = sectionsOf(d);
    return `${back(to, 'Инструкции')}
      <p class="om-kicker">${esc(e.group)}</p>
      <h1 class="om-title om-title-sm">${esc(d.title)}</h1>
      ${secs.length ? `<nav class="om-segs om-segs-line om-itoc" aria-label="Разделы инструкции">${secs.map((x) => `<button type="button" class="om-seg" data-instr-go="${x.block}">${esc(x.title)}</button>`).join('')}</nav>` : ''}
      <article class="om-card om-instr">
        ${d.memo ? `<div class="om-iimgs">${imgHTML(e.id, d.memo)}</div>` : ''}
        ${(d.pages || []).map((pg) => `<div class="om-iimgs">${imgHTML(e.id, pg)}</div>`).join('')}
        ${d.pdf ? `<a class="om-btn" href="${esc(instrUrl(e.id, d.pdf))}" target="_blank" rel="noopener" download>${ico('docs', 18)}Файл для организации · ${esc(d.pdf)}</a>` : ''}
        ${(d.blocks || []).map((b, i) => blockHTML(e.id, b, i)).join('')}
      </article>`;
  }
  const needle = (q.q || '').trim();
  let body;
  if (needle) {
    const all = allDocs(rerender);
    if (all === null) body = '<div class="om-card om-empty">Поиск…</div>';
    else {
      const hits = searchInstr(all, needle);
      body = hits.length ? `<p class="om-muted om-found-n">Найдено: ${hits.length}</p><div class="om-group">${hits.slice(0, 60).map((h) => instrRow(h.doc, [h.section, h.snippet].filter(Boolean).join(' · '), href({ v: 'instr', id: h.doc.id, q: needle, b: h.block >= 0 ? h.block : '' }))).join('')}</div>`
        : '<div class="om-card om-empty">Ничего не найдено</div>';
    }
  } else {
    const groups = [...new Set(list.map((x) => x.group))];
    body = groups.map((g) => `<h2 class="om-cap om-sec">${esc(g)}</h2><div class="om-group">${list.filter((x) => x.group === g).map((x) => instrRow(x)).join('')}</div>`).join('');
  }
  return `${head('Инструкции')}
    <label class="om-search">${ico('search', 18)}<input id="om-instr-q" data-invq type="search" value="${esc(needle)}" placeholder="Поиск по инструкциям" aria-label="Поиск по тексту всех инструкций"></label>
    ${body}`;
}
// Ссылка на инструкцию к месту (ОИ, позиция описи): ids — подходящие, первая — главная.
function instrHint(ids) {
  const list = instrIndex();
  if (!list || !ids.length) return '';
  const found = ids.map((id) => list.find((x) => x.id === id)).filter(Boolean);
  if (!found.length) return '';
  return `<p class="om-instr-hint">${ico('book', 16)}Инструкция: ${found.map((x) => `<a href="${href({ v: 'instr', id: x.id })}">${esc(x.title)}</a>`).join(', ')}</p>`;
}

// Строка «Отчёт дня»: что сдано за сегодня.
function dayRow() {
  const person = session.state.person;
  const m = reportOf(person, isoDay(), 'morning');
  const e = reportOf(person, isoDay(), 'evening');
  const st = e ? 'сдан' : m ? 'день начат — вечерний не сдан' : 'день не начат';
  return `<a class="om-row" href="${href({ v: 'report' })}"><span class="om-row-ico${e ? ' om-t-green' : ''}">${ico('task')}</span><span class="om-row-tx"><span>Отчёт дня</span><small>${st}</small></span>${ico('chev', 18)}</a>`;
}

function viewToday(all, q, unread) {
  // Отбор по типам — только там, где видны сами объекты (16.11.2026), на «Сегодня» его нет.
  const list = all;
  const today = isoDay();
  const open = list.filter((o) => o.state !== 'done' && !o.removed);
  const todays = open.filter((o) => o.plannedAt === today);
  const next = todays[0] || open[0];
  const back2 = open.filter((o) => (o.returned || []).length);
  const late = open.filter((o) => o.plannedAt && o.plannedAt < today);
  const noDateN = open.filter((o) => !o.plannedAt).length;
  const d = new Date();
  // Имя — если оно есть полностью («Осминнов Никита»); одни инициалы в приветствие не ставятся.
  const name = (String(session.state.person || '').split(/\s+/).slice(1).find((w) => w.length > 2 && !w.endsWith('.'))) || '';
  const urgent = [
    back2.length ? `<a class="om-row" href="${href({ v: 'trips', s: 'back' })}"><span class="om-row-ico om-t-amber">${ico('alert')}</span><span class="om-row-tx">На доосмотр</span><b class="om-n om-t-amber">${back2.length}</b>${ico('chev', 18)}</a>` : '',
    late.length ? `<a class="om-row" href="${href({ v: 'trips', s: 'late' })}"><span class="om-row-ico om-t-rose">${ico('alert')}</span><span class="om-row-tx">Просрочено</span><b class="om-n om-t-rose">${late.length}</b>${ico('chev', 18)}</a>` : '',
  ].join('');
  return `${top('Сегодня', bell(unread))}
    <p class="om-hello">${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}${name ? ` · добрый день, ${esc(name)}` : ''}</p>
    <section class="om-hero">
      <a class="om-tile" href="${href({ v: 'trips' })}"><b>${todays.length}</b><span>осмотреть сегодня</span></a>
      ${next ? `<div class="om-next">
        <span class="om-cap">Следующий</span>
        <a class="om-next-title" href="${href({ v: 'obj', id: next.id })}">${esc(next.title)}</a>
        ${next.eni ? `<span class="om-mono">${esc(fmtEni(next.eni) || next.eni)}</span>` : ''}
        <span class="om-next-act">
          ${routeBtn(next)}
          <a class="om-btn om-btn-primary" href="${href({ v: 'obj', id: next.id })}">Открыть</a>
        </span></div>`
        : '<div class="om-next om-next-none"><span class="om-cap">Следующий</span><span>Назначенных объектов нет</span></div>'}
    </section>
    ${urgent ? `<h2 class="om-cap om-sec">Срочно</h2><div class="om-group">${urgent}</div>` : ''}
    <h2 class="om-cap om-sec">Мои задачи</h2>
    <div class="om-group">
      ${dayRow()}
      ${waitingCad(session.state.person) ? `<a class="om-row" href="${href({ v: 'cad' })}"><span class="om-row-ico om-t-violet">${ico('docs')}</span><span class="om-row-tx">Запросы документов</span><b class="om-n om-t-violet">${waitingCad(session.state.person)}</b>${ico('chev', 18)}</a>` : ''}
      ${noDateN ? `<a class="om-row" href="${href({ v: 'plans', at: 'nodate' })}"><span class="om-row-ico">${ico('today')}</span><span class="om-row-tx"><span>Без даты</span><small>взять на день</small></span><b class="om-n">${noDateN}</b>${ico('chev', 18)}</a>` : ''}
      <a class="om-row" href="${href({ v: 'trips', s: 'all' })}"><span class="om-row-ico">${ico('layers')}</span><span class="om-row-tx">Все мои объекты</span><b class="om-n">${list.length}</b>${ico('chev', 18)}</a>
    </div>`;
}

const TRIP_TABS = [
  { key: 'open', label: 'К осмотру', test: (o) => o.state !== 'done' && !o.removed },
  { key: 'done', label: 'Осмотрено', test: (o) => o.state === 'done' },
  { key: 'all', label: 'Все', test: () => true },
];
const EXTRA = { back: { label: 'На доосмотр', test: (o) => (o.returned || []).length && o.state !== 'done' },
  late: { label: 'Просрочено', test: (o) => o.plannedAt && o.plannedAt < isoDay() && o.state !== 'done' && !o.removed } };

function viewTrips(all, q, unread) {
  const list = byKind(all, q.f);
  const s = q.s || 'open';
  const extra = EXTRA[s];
  const shown = list.filter(extra ? extra.test : (TRIP_TABS.find((t) => t.key === s) || TRIP_TABS[0]).test);
  const kind = KINDS.find((k) => k.key === q.f);
  return `${top(kind ? kind.label : 'Мне осмотреть', bell(unread))}
    ${kindChips(all, q.f, 'trips')}
    <nav class="om-tabs3" aria-label="Состояние">${TRIP_TABS.map((t) => `<a class="om-tab3${s === t.key ? ' on' : ''}" href="${href({ v: 'trips', f: q.f, s: t.key })}" aria-current="${s === t.key}">${esc(t.label)} <b>${list.filter(t.test).length}</b></a>`).join('')}</nav>
    ${extra ? `<p class="om-filter">${esc(extra.label)} · ${shown.length} <a href="${href({ v: 'trips', f: q.f })}">Показать все к осмотру</a></p>` : ''}
    <div class="om-list">${shown.length ? shown.map(objRow).join('') : '<div class="om-card om-empty">Здесь пусто</div>'}</div>`;
}

function viewSearch(all, q) {
  const words = foldSearch(q.q || '').split(/\s+/).filter(Boolean);
  const hay = (o) => foldSearch([o.title, o.address, o.eni, fmtEni(o.eni), o.institution, o.typeLabel, ...(o.ois || []).map((x) => x.label)].join(' '));
  const hits = words.length ? all.filter((o) => words.every((w) => hay(o).includes(w))) : [];
  return `${top('Поиск')}
    <form class="om-search" data-search role="search">
      ${ico('search', 18)}<input type="search" name="q" value="${esc(q.q || '')}" placeholder="Адрес, ЕНИ или учреждение" aria-label="Поиск по своим выездам" autocomplete="off">
    </form>
    <p class="om-filter">${words.length ? `Найдено: ${hits.length}` : 'Поиск по своим выездам'}</p>
    <div class="om-list">${hits.map(objRow).join('')}</div>`;
}

function viewMenu(all, unread) {
  const p = session.state.person || '';
  const ini = p.split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
  const row = (to, icon, text, n = '', tone = '') => `<a class="om-row" href="${to}"><span class="om-row-ico${tone ? ' om-t-' + tone : ''}">${ico(icon)}</span><span class="om-row-tx">${esc(text)}</span>${n !== '' ? `<b class="om-n">${n}</b>` : ''}${ico('chev', 18)}</a>`;
  return `${top('Меню')}
    <div class="om-group">
      <div class="om-row om-me"><span class="om-ava">${esc(ini)}</span><span class="om-row-tx"><b>${esc(p)}</b><small>${esc(roleLabel(session.state.role) || '')}</small></span></div>
      ${row(href({ v: 'notes' }), 'bell', 'Входящие', unread || '')}
      ${row(href({ v: 'report' }), 'task', 'Отчёт дня')}
      ${row(href({ v: 'plans' }), 'today', 'Планы')}
      ${row(href({ v: 'cad' }), 'docs', 'Запросы документов', waitingCad(p) || '')}
    </div>
    <h2 class="om-cap om-sec">К осмотру</h2>
    <div class="om-group">${KINDS.map((k) => row(href({ v: 'trips', f: k.key }), k.key, k.label, byKind(all, k.key).filter((o) => o.state !== 'done' && !o.removed).length, { real: 'blue', vehicle: 'violet', inv: 'amber' }[k.key])).join('')}</div>
    <h2 class="om-cap om-sec">Справка</h2>
    <div class="om-group">${row(href({ v: 'instr' }), 'book', 'Инструкции')}</div>`;
}

function viewNotes(items) {
  return `${top('Входящие')}
    <div class="om-list">${items.length ? items.map((n) => `<a class="om-card om-note${n.unread ? ' new' : ''}" href="${n.objectId ? href({ v: 'obj', id: n.objectId }) : href({ v: 'notes' })}">
      <span class="om-note-head"><b>${esc(n.label)}</b><time>${esc(shortDate(String(n.at).slice(0, 10)))}</time></span>
      <span>${esc(n.text)}</span></a>`).join('') : '<div class="om-card om-empty">Уведомлений за две недели нет</div>'}</div>`;
}

// Объект: шапка, назначение, место (карта, маршрут, контакт), документы для выезда, состав.
function viewObj(o, q, ui) {
  if (!o) return `${back(href({ v: 'trips' }), 'Выезды')}<div class="om-card om-empty">Объект не назначен или снят</div>`;
  const tab = q.tab === 'docs' ? 'docs' : 'task';
  const rec = loadTask(o.typeId, o.ocId) || {};
  const head = `${back(href({ v: 'trips', f: q.f }), 'Выезды')}
    <p class="om-kicker">${esc(o.typeLabel)}</p>
    <h1 class="om-title">${esc(o.title)}</h1>
    ${o.ts && o.ts !== o.title ? `<p class="om-obj-ts om-obj-ts-lg">${esc(o.ts)}</p>` : ''}
    <div class="om-idrow">${o.eni ? `<button type="button" class="om-eni" data-copy="${esc(o.eni)}" title="Скопировать ЕНИ">${esc(fmtEni(o.eni) || o.eni)} ${ico('copy', 14)}</button>` : ''}${chip(o)}</div>`;
  const body = tab === 'docs' ? docsBlock(o) : taskBlock(o, rec, ui);
  const tabs = [['task', 'task', 'Задача'], ['docs', 'docs', 'Документы']];
  return `${head}${body}
    <nav class="om-bnav om-objtabs" aria-label="Разделы объекта">${tabs.map(([k, icon, label]) => `<a class="om-btab${tab === k ? ' on' : ''}" href="${href({ v: 'obj', id: o.id, tab: k === 'task' ? '' : k, f: q.f })}" aria-current="${tab === k}">${ico(icon, 22)}<span>${label}${k === 'docs' && o.docs.length ? ` <b>${o.docs.length}</b>` : ''}</span></a>`).join('')}</nav>`;
}

function taskBlock(o, rec, ui = {}) {
  const facts = [
    o.address && o.institution ? ['Учреждение', o.institution] : null,
    ...(o.facts || []).map((f) => [f.label, f.value]),
    o.plannedAt ? ['Выезд', shortDate(o.plannedAt)] : null,
    o.deadline ? ['Срок', shortDate(o.deadline)] : null,
    o.by ? ['Назначил', o.by] : null,
  ].filter(Boolean);
  const returned = (o.returned || []).map((r) => `<p class="om-warn"><b>На доосмотр</b>${r.reason ? ' — ' + esc(r.reason) : ''}</p>`).join('');
  const facade = facadeOf(o);
  return `${returned}
    ${facts.length || o.note ? `<section class="om-card om-facts">${facts.map(([l, v]) => `<div><small>${esc(l)}</small><b>${esc(v)}</b></div>`).join('')}
      ${o.note ? `<div><small>Задание</small><b class="om-pre">${esc(o.note)}</b></div>` : ''}</section>` : ''}
    <section class="om-card om-place">
      ${o.address && o.address !== o.title ? `<p class="om-place-addr">${esc(o.address)}</p>` : ''}
      ${(rec.geo && rec.geo.extent) || o.lat != null || o.eni
    // Есть ЕНИ — место под карту сразу: участок подтягивается по ЕНИ позже, экран не сдвигается.
    ? `<div class="om-map" data-map>${(rec.geo && rec.geo.extent) || o.lat != null ? '' : '<span class="om-map-wait">Участок подтягивается по ЕНИ…</span>'}</div>`
    : '<p class="om-muted">Места на карте нет: у объекта нет ЕНИ участка и координат.</p>'}
      ${parcelBlock(o)}
      <div class="om-place-act">${routeBtn(o, true)}</div>
      ${contactsBlock(o, ui)}
    </section>
    ${o.docs.length ? `<a class="om-card om-row om-doclink" href="${href({ v: 'obj', id: o.id, tab: 'docs' })}"><span class="om-row-ico om-t-blue">${ico('docs')}</span><span class="om-row-tx"><b>Документы для выезда</b><small>${esc(o.docs.slice(0, 3).map((d) => d.type || d.name).join(', '))}${o.docs.length > 3 ? '…' : ''}</small></span><b class="om-n">${o.docs.length}</b>${ico('chev', 18)}</a>` : ''}
    ${(o.ois || []).length ? `<section class="om-card om-comp"><h2 class="om-card-h">Состав объекта</h2>${o.ois.map((x) => oiRow(o, x, facade[x.id])).join('')}</section>` : ''}
    ${foundBlock(o)}
    ${(o.inventories || []).length ? `<section class="om-card om-comp"><h2 class="om-card-h">Описи</h2>${o.inventories.map((x) => invRow(o, x)).join('')}</section>` : ''}
    ${finishBlock(o, ui)}`;
}

// Контакты на месте: из учреждения и объекта (заранее) и добавленные осмотрщиком на месте (как в приложении
// «Осмотр», ContactsScreen.kt: ФИО, должность, телефон, почта, заметка; человек — из телефонной книги, если
// браузер это умеет). Касание телефона — звонок.
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: добавленные лежат в «Результатах осмотра» объекта (resultsOf().contacts) с автором и
// временем; в контакты учреждения или объекта их переносит тот, кто разбирает осмотр.
const telOf = (ph) => String(ph || '').replace(/[^\d+]/g, '');
function contactLine(c, del = '') {
  return `<div class="om-contact"><span class="om-row-tx"><b>${esc(c.name || 'Контакт')}</b>${c.role || c.from ? `<small>${esc([c.role, c.from].filter(Boolean).join(' · '))}</small>` : ''}${c.note ? `<small>${esc(c.note)}</small>` : ''}</span>
    ${c.email ? `<a class="om-icon om-icon-sm" href="mailto:${esc(c.email)}" aria-label="Письмо: ${esc(c.email)}" title="${esc(c.email)}">${ico('mail', 18)}</a>` : ''}
    ${c.phone ? `<a class="om-icon om-icon-sm" href="tel:${esc(telOf(c.phone))}" aria-label="Позвонить: ${esc(c.phone)}" title="${esc(c.phone)}">${ico('phone', 18)}</a>` : ''}
    ${del ? `<button type="button" class="om-icon om-icon-sm" data-ct-del="${esc(del)}" aria-label="Убрать контакт ${esc(c.name || c.phone)}" title="Убрать">${ico('trash', 18)}</button>` : ''}</div>`;
}
const myContacts = (o) => (resultsOf(o.typeId, o.ocId).contacts || []).filter((c) => !c.deleted);
function contactsBlock(o, ui = {}) {
  const pre = o.contacts || [];
  const mine = myContacts(o);
  const ro = o.state === 'done' && !(o.returned || []).length;
  const pick = typeof navigator !== 'undefined' && navigator.contacts && navigator.contacts.select;
  return `<div class="om-contacts"><span class="om-cap">Контакты</span>
    ${pre.slice(0, 4).map((c) => contactLine(c)).join('')}
    ${pre.length > 4 ? `<details class="om-ct-more"><summary>Ещё ${pre.length - 4}</summary>${pre.slice(4).map((c) => contactLine(c)).join('')}</details>` : ''}
    ${mine.length ? `<span class="om-cap om-cap-sub">Добавлены на месте</span>${mine.map((c) => contactLine(c, ro ? '' : c.id)).join('')}` : ''}
    ${!pre.length && !mine.length ? '<p class="om-muted">Контактов нет</p>' : ''}
    ${ro ? '' : `<details class="om-ct-add"${ui.contactOpen ? ' open' : ''}><summary>Добавить контакт</summary>
      <form class="om-ct-form" data-ct-add novalidate>
        ${pick ? '<button type="button" class="om-btn" data-ct-pick>Из телефонной книги</button>' : ''}
        <label class="om-flabel" for="om-ct-name">ФИО</label><input class="om-input" id="om-ct-name" name="name" autocomplete="off" maxlength="120">
        <label class="om-flabel" for="om-ct-role">Должность</label><input class="om-input" id="om-ct-role" name="role" autocomplete="off" maxlength="120">
        <label class="om-flabel" for="om-ct-phone">Телефон</label><input class="om-input" id="om-ct-phone" name="phone" type="tel" inputmode="tel" autocomplete="off" maxlength="40">
        <label class="om-flabel" for="om-ct-email">Почта</label><input class="om-input" id="om-ct-email" name="email" type="email" autocomplete="off" maxlength="120">
        <label class="om-flabel" for="om-ct-note">Заметка</label><input class="om-input" id="om-ct-note" name="note" autocomplete="off" maxlength="200">
        <p class="om-hint om-hint-diff" data-ct-err hidden></p>
        <button class="om-btn om-btn-primary" type="submit">Сохранить контакт</button>
      </form></details>`}
  </div>`;
}

// Сведения участка по Кадастру — свёрнутым блоком: строка на месте сразу, сведения
// приходят позже (подтягиваются по ЕНИ) и раскрываются внутри, не сдвигая экран.
function parcelBlock(o) {
  // Строки — { label, value } (kernel/cadastreTip.js, parcelRows), пустые уже отброшены.
  const rows = (o.parcel || []).filter((r) => r && r.value);
  if (!rows.length && !o.eni) return '';
  return `<details class="om-parcel"><summary>Участок по Кадастру${rows.length ? '' : ' <small>сведений пока нет</small>'}</summary>
    ${rows.length ? `<dl class="om-dl">${rows.map((r) => `<dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd>`).join('')}</dl>` : ''}</details>`;
}

// Подпись ОИ без повтора («Квартира · Квартира» — вид и наименование совпали);
// буква литеры — в квадрате (как на стенде), у участка и прочих — значок.
const oiName = (x0) => [...new Set(String(x0.label || '').split(' · '))].join(' · ');
function oiHead(x0, size = '') {
  const label = oiName(x0);
  const m = /^Литера\s+(\S+)/.exec(label);
  return {
    sq: m ? `<span class="om-sq om-t-blue ${size}">${esc(m[1])}</span>` : `<span class="om-sq om-t-teal ${size}">${ico(x0.kind === 'land' ? 'layers' : x0.kind === 'vehicle' ? 'vehicle' : 'real', 18)}</span>`,
    name: m ? (label.replace(/^Литера\s+\S+\s*·?\s*/, '') || label) : label,
    letter: m ? m[1] : '',
    sub: [x0.oiType && !label.startsWith(x0.oiType) ? x0.oiType : '', x0.eni ? fmtEni(x0.eni) || x0.eni : ''].filter(Boolean).join(' · '),
  };
}

// Строка состава — вход в осмотр ОИ: сколько полей заполнено, сколько обязательных осталось.
function oiRow(o, x, photo) {
  const h = oiHead(x);
  const ctx = oiCtx(o, x.id);
  const p = ctx ? progressOf(ctx) : null;
  const sub = [h.sub, x.review === 'returned' ? 'на доосмотр' + (x.reason ? ': ' + x.reason : '') : ''].filter(Boolean).join(' · ');
  const prog = p && p.total ? `<small class="om-prog${p.requiredLeft ? ' om-prog-req' : ''}">${progressText(p)}</small>` : '';
  return `<a class="om-oi om-oi-link" href="${href({ v: 'oi', id: o.id, oi: x.id })}">${h.sq}<span class="om-row-tx"><b>${esc(h.name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}${prog}</span>
    ${photo ? `<img class="om-facade" src="${esc(photo.dataUrl)}" alt="Фасад с прошлого осмотра" title="Фасад с прошлого осмотра${photo.at ? ', ' + esc(String(photo.at).slice(0, 10)) : ''}" loading="lazy">` : ''}${ico('chev', 18)}</a>`;
}

// --- осмотр ОИ: разделы и поля -------------------------------------------------------------------------
// Поля — приложения «Осмотр» (params.js, перенос Params.kt; пользователь 16.11.2026: «Сверь поля с файлом Поля
// осмотров PWA»), не схема прежнего экрана осмотрщика. Значения — в «Результаты осмотра»
// (kernel/inspectionResults.js, valuesOf) — туда же, куда их кладёт приложение «Осмотр» через мост.
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: каждое поле сохраняется сразу, без кнопки; на сервере — запись осмотра ОИ с автором и
// временем правки поля (и разбор, если правят двое: осмотрщик на месте и ЦОД).
// Выявленное на месте строение — строкой состава (решение 15.10.2026: здание, которого нет в составе, —
// черновик ОИ «Выявлено на месте» со своей формой осмотра; разбирает ЦОД).
const foundRow = (f) => ({ id: f.id, kind: f.card === 'vehicle' ? 'vehicle' : 'building', label: f.name || (f.card === 'vehicle' ? 'Транспортное средство' : foundCat(f.cat).label), oiType: 'выявлено на месте', found: true, review: '' });
function oiCtx(o, oiId) {
  const rec = loadTask(o.typeId, o.ocId);
  const f = rec && foundOi(o.typeId, o.ocId).find((x) => x.id === oiId);
  const oi = f || (rec && ownOis(rec).find((x) => x.id === oiId));
  const row = f ? foundRow(f) : (o.ois || []).find((x) => x.id === oiId);
  if (!oi || !row) return null;
  // Значения ОИ читаются без создания (assets[oiId]) — пустой набор создаёт первая правка (saveField).
  // На экране — со значениями по умолчанию (тип ОИ, госномер), в счёт заполненного — только введённое.
  const r = resultsOf(o.typeId, o.ocId);
  const own = (r.assets || {})[oiId] || {};
  const def = pwaDefaults(oi);
  const values = { ...def, ...own, ...(def.f || own.f ? { f: { ...(def.f || {}), ...(own.f || {}) } } : {}) };
  const photos = (r.photos || []).filter((p) => p.oiId === oiId && !p.deleted).length;
  // Закончен — только просмотр; ОИ, возвращённый на доосмотр, снова правится.
  const ro = o.state === 'done' && row.review !== 'returned';
  return { rec, oi, row, values, own, photos, ro, secs: pwaSections(oi) };
}
const visibleFields = (s, values) => s.fields.filter((f) => !f.visible || f.visible(values));
// Инженерные сети участка — и в литеру, если литера на участке одна (пользователь 17.11.2026: «Если у нас на участке
// всего 1 литера, то инженерку из земельного участка копируем и в литеру»). Поля сетей у участка и литеры одни и те же
// (params.js, раздел nets). Литеры — здания и вспомогательные постройки записи и выявленные на месте строения.
// В литере значение не перезаписывается, если его там поменяли вручную (оно не пусто и не равно прежнему значению участка).
const NET_KEYS = ['electricity', 'centralWater', 'sewerage', 'gasification', 'centralHeating'];
function soleLiter(o, rec) {
  const own = ownOis(rec).filter((x) => x.card === 'building' || x.card === 'aux');
  const found = foundOi(o.typeId, o.ocId).filter((x) => x.card !== 'vehicle');
  const all = [...own.map((x) => x.id), ...found.map((x) => x.id)];
  return all.length === 1 ? all[0] : '';
}
// «Заполнено N из M» — как в приложении: видимые поля, кроме комментария; обязательное закрыто любым значением.
function secProgress(s, ctx) {
  const fields = visibleFields(s, ctx.values).filter((f) => f.counted !== false);
  return {
    total: fields.length,
    filled: fields.filter((f) => isFilled(getValue(ctx.own, f.key))).length,
    requiredLeft: fields.filter((f) => f.req && f.req(ctx.values) && !isFilled(getValue(ctx.values, f.key))).length,
  };
}
function progressOf(ctx) {
  return ctx.secs.map((s) => secProgress(s, ctx))
    .reduce((a, p) => ({ total: a.total + p.total, filled: a.filled + p.filled, requiredLeft: a.requiredLeft + p.requiredLeft }), { total: 0, filled: 0, requiredLeft: 0 });
}
const progressText = (p) => `заполнено ${p.filled} из ${p.total}${p.requiredLeft ? ` · обязательных осталось ${p.requiredLeft}` : ''}`;
const shown = (v) => (Array.isArray(v) ? v.filter(Boolean).join(', ') : String(v == null ? '' : v).trim());

// Разделы — раскрываемыми блоками прямо на экране ОИ, без перехода внутрь (пользователь 16.11.2026: «эти
// категории лучше раскрываемыми делать. Иначе выходит слишком много усложнений»). У ТС полей мало — без
// разделов, одним списком («В ТС ты зря закинул в категории пункты. Там их мало»). Комментарий — полем под
// разделами («В комментарии не обязательно проваливаться»). Все разделы — одинаковыми нумерованными строками,
// и из одного поля тоже (пользователь 16.11.2026 о полях вперемешку со строками: «В литерах каша. Надо бы это
// причесать»); значение раздела — подписью строки. Подпись поля — над полем: длинные значения не обрезаются.
function viewOi(o, q, opened, savedAt) {
  const ctx = o && oiCtx(o, q.oi);
  if (!ctx) return `${back(o ? href({ v: 'obj', id: o.id }) : href({ v: 'trips' }), o ? o.title : 'Выезды')}<div class="om-card om-empty">Объект имущества не назначен</div>`;
  const h = oiHead(ctx.row, 'om-sq-lg');
  const p = progressOf(ctx);
  const returned = (o.returned || []).filter((r) => r.oiIds.includes(ctx.row.id))
    .map((r) => `<p class="om-warn"><b>На доосмотр</b>${r.reason ? ' — ' + esc(r.reason) : ''}</p>`).join('');
  const note = ctx.secs.find((s) => s.key === 'comments');
  const secs = ctx.secs.filter((s) => s !== note && visibleFields(s, ctx.values).length);
  const flat = ctx.oi.card === 'vehicle';
  let n = 0;
  const form = flat
    ? (secs.length ? `<div class="om-form">${secs.flatMap((s) => visibleFields(s, ctx.values)).map((f) => fieldHTML(f, ctx)).join('')}</div>` : '')
    : secs.map((s) => {
      const i = n++;
      const sp = secProgress(s, ctx);
      const vals = visibleFields(s, ctx.values).map((f) => shown(getValue(ctx.values, f.path || f.key))).filter(Boolean);
      // Номер — два состояния: раздел заполнен (зелёный) или нет (синий); нехватка обязательных — текстом.
      const tone = sp.total && sp.filled === sp.total && !sp.requiredLeft ? 'om-t-green' : 'om-t-blue';
      return `<details class="om-acc" data-sec="${esc(s.key)}"${opened.has(ctx.row.id + '|' + s.key) ? ' open' : ''}>
        <summary class="om-row om-secrow"><span class="om-sq om-sq-sm ${tone}">${String(i + 1).padStart(2, '0')}</span>
          <span class="om-row-tx"><b>${esc(s.title)}</b><small>${esc(vals.length ? vals.join(', ') : 'не заполнено')}</small>${sp.requiredLeft ? `<small class="om-prog-req">обязательных осталось ${sp.requiredLeft}</small>` : ''}</span>${ico('chev', 18)}</summary>
        <div class="om-form">${s.key === 'nets' && ctx.oi.card === 'land' && soleLiter(o, ctx.rec) ? '<p class="om-hint">Литера на участке одна — значения переносятся и в неё</p>' : ''}${visibleFields(s, ctx.values).map((f) => fieldHTML(f, ctx)).join('')}</div></details>`;
    }).join('');
  const chipTone = p.requiredLeft ? 'om-t-amber' : p.filled === p.total ? 'om-t-green' : 'om-t-blue';
  return `${back(href({ v: 'obj', id: o.id }), o.title)}
    <div class="om-oihead">${h.sq}<div class="om-row-tx"><h1 class="om-title om-title-oi">${esc(h.name)}</h1>${h.sub ? `<small>${esc(h.sub)}</small>` : ''}</div></div>
    <div class="om-idrow">${p.total ? `<span class="om-chip ${chipTone}" title="${esc(progressText(p))}">заполнено ${p.filled} из ${p.total}</span>` : ''}${ctx.ro ? '<span class="om-muted">Осмотр закончен — только просмотр</span>' : ''}<span class="om-saved" role="status" aria-live="polite">${savedAt ? 'Сохранено ' + esc(savedAt) : ''}</span></div>
    ${returned}
    ${instrHint(instrForPlace(ctx.oi.card === 'land' || ctx.oi.card === 'vehicle' ? ctx.oi.card : 'building', { objKind: getValue(ctx.values, 'objKind'), buildType: getValue(ctx.values, 'buildType') }, (o.ois || []).some((x) => x.id !== ctx.row.id && /жил/i.test(x.oiType || ''))))}
    ${q.tab === 'photo' ? photosBlock(o, ctx, q) : `${form ? `<div class="om-group om-accs">${form}</div>` : '<div class="om-card om-empty">Полей осмотра у этого объекта нет — только снимки</div>'}
      ${note ? `<div class="om-group om-form om-note-card">${note.fields.map((f) => fieldHTML(f, ctx)).join('')}</div>` : ''}`}
    ${ctx.row.found && !ctx.ro && q.tab !== 'photo' ? `<button type="button" class="om-btn om-btn-danger om-found-del" data-found-del="${esc(ctx.row.id)}">${ico('trash', 18)}Убрать выявленное строение</button>` : ''}
    ${oiTabs(o, ctx, q)}`;
}

// «Выявлено на месте»: строения, которых нет в составе, — списком и строкой добавления (вид и название).
function foundBlock(o) {
  if (o.entity !== 'real') return '';
  const list = foundOi(o.typeId, o.ocId);
  const ro = o.state === 'done';
  return `<section class="om-card om-comp om-found"><h2 class="om-card-h">Выявлено на месте</h2>
    ${list.map((f) => oiRow(o, foundRow(f), null)).join('')}
    ${ro ? (list.length ? '' : '<p class="om-muted om-found-none">Не выявлено</p>') : `<form class="om-found-add" data-found>
      <label class="om-flabel" for="om-found-cat">Строение, которого нет в составе</label>
      <span class="om-select"><select class="om-input" id="om-found-cat" name="cat">${FOUND_CATS.map((c) => `<option value="${c.key}">${esc(c.label)}</option>`).join('')}</select></span>
      <input class="om-input" name="name" maxlength="80" placeholder="Например, склад" aria-label="Название выявленного строения">
      <button class="om-btn" type="submit">Добавить строение</button></form>`}</section>`;
}

// --- описи: как в приложении «Осмотр» (Inventory.kt, InventoryScreen.kt, BrowserScreen.kt) ---------------------
// Пользователь 16.11.2026: «Осмотрщик на месте заполняет только если нерабочее. найдено/не найдено смотрится на
// основе описи… Система рекомендаций оттуда нужна, нужно так же иметь возможность самому несколько инвентарников
// в 1 категорию собирать и потом к ним всем фото прикреплять. В таком случае эти инвентарники попадают в 1
// карточку». Осмотрено — есть снимки позиции (своей карточки) или отметка «осмотрено ранее»; «Нерабочее» — только
// после снимков. Карточка — несколько позиций с общими снимками и комментарием; рекомендация «Такие же в описи» —
// то же наименование (слова в любом порядке) и цена за штуку в пределах 1 % (Inventory.isLike). Для опознания —
// инв. номер, модель, тип имущества, место, МОЛ, отдел (16.11.2026: «МОЛ, Модель средства, Тип имущества»).
// У описи учреждения — отметки описи (kernel/inventories.js, markItem: state 'seen', cond, group, earlier); у
// механизмов-ОИ — значения единиц в «Результатах осмотра» (u.<единица>.found / state / group / earlier).
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: опись в тысячи позиций — постраничная выдача с поиском на сервере; здесь — первые 200.
const INV_LIMIT = 200;
const BROKEN = 'Нерабочее';
const OUT_OF_SCOPE = /^вне\s*тз$/i;
function rawMark(o, inv, it) {
  if (inv.kind === 'mech') {
    const u = ((((resultsOf(o.typeId, o.ocId).assets || {})[inv.oiId] || {}).u) || {})[it.id] || {};
    return { state: u.found === 'Найдено' ? 'seen' : '', cond: u.state === BROKEN ? BROKEN : '', group: u.group || '', earlier: !!u.earlier, comment: u.comment || '' };
  }
  const m = markOf(inv.id, it.id) || {};
  return { state: m.state || '', cond: m.cond || '', group: m.group || '', earlier: !!m.earlier, comment: m.comment || '', photos: m.photos || [] };
}
// Позиции карточки: общая группа или одна позиция.
function cardOf(o, inv, it) {
  const g = rawMark(o, inv, it).group;
  return g ? inv.items.filter((x) => rawMark(o, inv, x).group === g) : [it];
}
function photosOfCard(o, inv, members) {
  if (inv.kind === 'mech') {
    const ids = new Set(members.map((x) => x.id));
    const names = new Set(members.map((x) => x.name));
    return (resultsOf(o.typeId, o.ocId).photos || []).filter((p) => p.oiId === inv.oiId && !p.deleted && p.dataUrl
      && ((p.units || []).some((id) => ids.has(id)) || (!p.units && names.has(p.cat))));
  }
  return members.flatMap((x) => ((markOf(inv.id, x.id) || {}).photos || []).map((p) => ({ ...p, itemId: x.id }))).filter((p) => p.dataUrl && !p.deleted);
}
// Состояние позиции, как в приложении: снято / осмотрено ранее / не осмотрено; нерабочее — отдельно.
function statusOf(o, inv, it) {
  const m = rawMark(o, inv, it);
  const members = m.group ? cardOf(o, inv, it) : [it];
  const shot = photosOfCard(o, inv, members).length > 0;
  return { shot, earlier: !shot && (m.earlier || m.state === 'seen'), inspected: shot || m.earlier || m.state === 'seen', broken: shot && m.cond === BROKEN, group: m.group, size: members.length, comment: m.comment };
}
function markSet(o, inv, it, patch) {
  const person = session.state.person;
  startWork(person, o.typeId, o.ocId);
  if (inv.kind === 'mech') {
    const v = valuesOf(o.typeId, o.ocId, inv.oiId);
    if ('state' in patch) setValue(v, `u.${it.id}.found`, patch.state === 'seen' ? 'Найдено' : '');
    if ('cond' in patch) setValue(v, `u.${it.id}.state`, patch.cond);
    ['group', 'earlier', 'comment'].forEach((k) => { if (k in patch) setValue(v, `u.${it.id}.${k}`, patch[k]); });
    saveResults();
    return;
  }
  const a = myAssignsOn(person, o.typeId, o.ocId)[0];
  markItem(inv.id, it.id, patch, { by: person, assignId: a ? a.id : '' });
}
const nameKey = (it) => foldSearch(String(it.name || '')).split(/[^0-9a-zа-яё]+/i).filter(Boolean).sort().join(' ');
const unitPrice = (it) => { const c = Number(it.cost) || 0; const q = Number(it.qty) || 1; return c ? c / q : null; };
const pricesClose = (a, b) => (a == null || b == null ? a == null && b == null : Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * 0.01 + 0.005);
// «Такие же в описи» — ещё не осмотренные, не в этой карточке, свои.
function similarOf(o, inv, members) {
  const ids = new Set(members.map((x) => x.id));
  return inv.items.filter((x) => !ids.has(x.id) && x.own !== false && !OUT_OF_SCOPE.test(x.list || '') && !statusOf(o, inv, x).inspected
    && members.some((h) => nameKey(h) === nameKey(x) && pricesClose(unitPrice(h), unitPrice(x))));
}
function addToCard(o, inv, lead, items) {
  const g = rawMark(o, inv, lead).group || 'g-' + lead.id;
  [lead, ...items].forEach((x) => markSet(o, inv, x, { group: g }));
}
const statusChip = (s) => (s.broken ? `<span class="om-chip om-t-rose">${BROKEN}</span>` : s.shot ? '<span class="om-chip om-t-green">Снято</span>'
  : s.earlier ? '<span class="om-chip om-t-teal">Осмотрено ранее</span>' : '');

function invRow(o, x) {
  const inv = inventoryOf(session.state.person, o.id, x.id);
  const own = inv ? inv.items.filter((it) => it.own !== false && !OUT_OF_SCOPE.test(it.list || '')) : [];
  const done = own.filter((it) => statusOf(o, inv, it).inspected).length;
  return `<a class="om-oi om-oi-link" href="${href({ v: 'inv', id: o.id, inv: x.id })}"><span class="om-sq om-t-amber">${ico('inv', 18)}</span>
    <span class="om-row-tx"><b>${esc(x.title)}</b><small>${inv && inv.part ? esc(inv.part) + ' · ' : ''}позиций: ${x.count}</small><small class="om-prog">осмотрено ${done} из ${own.length}</small></span>${ico('chev', 18)}</a>`;
}

const INV_FILTERS = [['', 'Все'], ['none', 'Не осмотрено'], ['done', 'Осмотрено'], ['broken', 'Нерабочие']];
// Опись: поиск, отбор, выбор нескольких позиций «в одну карточку» (sel — выбранные; to — добавление в карточку).
function viewInv(o, q, sel, filtersOpen) {
  const inv = o && inventoryOf(session.state.person, o.id, q.inv);
  if (!inv) return `${back(o ? href({ v: 'obj', id: o.id }) : href({ v: 'trips' }), o ? o.title : 'Выезды')}<div class="om-card om-empty">Опись не назначена</div>`;
  // Разбивка описи по спискам — осмотрщик видит все, кроме «Вне ТЗ» (пользователь 16.11.2026: «осмотрщик видит
  // из нее все кроме "Вне ТЗ"»). Места (кабинета) в описях нет — не показывается («Не выдумывай»).
  const rows = inv.items.filter((it) => !OUT_OF_SCOPE.test(it.list || '')).map((it) => ({ it, s: statusOf(o, inv, it) }));
  const own = rows.filter((x) => x.it.own !== false);
  const lists = [...new Set(rows.map((x) => x.it.list).filter(Boolean))];
  const cnt = { '': rows.length, none: own.filter((x) => !x.s.inspected).length, done: own.filter((x) => x.s.inspected).length, broken: own.filter((x) => x.s.broken).length };
  const needle = foldSearch(q.q || '');
  // Приоритет и цена — обязательные отборы (пользователь 16.11.2026: «Нам нужна фильтрация по приоритетам.
  // Обязательно. Как и по цене»); порядок — как в приложении: по №, по приоритету, по стоимости.
  const min = Number(q.min) || 0;
  const max = Number(q.max) || 0;
  const cost = (it) => Number(it.cost) || 0;
  const list = rows.filter((x) => (!q.f || (q.f === 'none' ? x.it.own !== false && !x.s.inspected : q.f === 'done' ? x.s.inspected : x.s.broken))
    && (!q.p || String(x.it.priority) === q.p) && (!q.l || x.it.list === q.l)
    && (!min || cost(x.it) >= min) && (!max || cost(x.it) <= max)
    && (!needle || foldSearch([x.it.inv, x.it.name, x.it.model, x.it.mol, x.it.no].join(' ')).includes(needle)));
  if (q.sort === 'priority') list.sort((a, b) => (Number(a.it.priority) || 9) - (Number(b.it.priority) || 9) || a.it.no - b.it.no);
  if (q.sort === 'cost') list.sort((a, b) => cost(b.it) - cost(a.it));
  const prios = [...new Set(rows.map((x) => String(x.it.priority || '')).filter(Boolean))].sort();
  const pOf = (p) => own.filter((x) => String(x.it.priority) === p);
  // Включённые фильтры — строкой под поиском; панель фильтров свёрнута (пользователь 16.11.2026 о шапке
  // описи: «надо причесать по-нормальному. занимает кучу места»).
  const fmtSom = (n) => Number(n).toLocaleString('ru-RU');
  const onList = [q.l, q.p ? 'П' + q.p : '', min ? 'от ' + fmtSom(min) : '', max ? 'до ' + fmtSom(max) : '',
    q.sort === 'cost' ? 'по стоимости' : q.sort === 'priority' ? 'по приоритету' : ''].filter(Boolean);
  const nOn = onList.length;
  const ro = o.state === 'done';
  const target = q.to ? inv.items.find((x) => x.id === q.to) : null;
  const picking = !ro && (target || sel.size);
  const bar = target ? `<div class="om-selbar"><span>В карточку «${esc(target.name)}»: отмечено ${sel.size}</span>
      <button type="button" class="om-btn om-btn-primary" data-sel-add${sel.size ? '' : ' disabled'}>Добавить</button><a class="om-btn" href="${href({ v: 'item', id: o.id, inv: inv.id, it: target.id })}">Отмена</a></div>`
    : sel.size ? `<div class="om-selbar"><span>Отмечено: ${sel.size}</span><button type="button" class="om-btn om-btn-primary" data-sel-group${sel.size > 1 ? '' : ' disabled'}>В одну карточку (${sel.size})</button>
      <button type="button" class="om-btn" data-sel-clear>Снять выбор</button></div>` : '';
  return `${back(target ? href({ v: 'item', id: o.id, inv: inv.id, it: target.id }) : href({ v: 'obj', id: o.id }), target ? 'Карточка' : o.title)}
    <p class="om-kicker">Опись${inv.part ? ' · ' + esc(inv.part) : ''} · <span class="${cnt.none ? '' : 'om-ok'}">осмотрено ${cnt.done} из ${own.length}</span>${ro ? ' · только просмотр' : ''}</p>
    <h1 class="om-title om-title-inv">${esc(inv.title)}</h1>
    <div class="om-invtools">
      <label class="om-search">${ico('search', 18)}<input id="om-inv-q" data-invq type="search" value="${esc(q.q || '')}" placeholder="Инв. номер или модель" aria-label="Поиск по описи: инв. номер, наименование, модель, МОЛ"></label>
      <button type="button" class="om-icon om-filter-btn${filtersOpen ? ' on' : ''}" data-filters aria-expanded="${filtersOpen}" aria-controls="om-inv-filters" aria-label="Фильтры${nOn ? ': включено ' + nOn : ''}" title="Фильтры">${ico('filter', 20)}${nOn ? `<b class="om-badge">${nOn}</b>` : ''}</button>
    </div>
    <div class="om-segs om-segs-line" role="group" aria-label="Осмотр позиций">${INV_FILTERS.map(([k, label]) => `<a class="om-seg${(q.f || '') === k ? ' on' : ''}" href="${href({ ...q, f: k })}" aria-current="${(q.f || '') === k}">${label}<b>${cnt[k]}</b></a>`).join('')}</div>
    ${filtersOpen ? `<div class="om-card om-filters" id="om-inv-filters">
      ${lists.length > 1 ? `<div class="om-fgroup"><span class="om-flabel">Список</span><div class="om-segs om-segs-line" role="group" aria-label="Список">${lists.map((l) => `<a class="om-seg${q.l === l ? ' on' : ''}" href="${href({ ...q, l: q.l === l ? '' : l })}" aria-current="${q.l === l}">${esc(l)}<b>${own.filter((x) => x.it.list === l).length}</b></a>`).join('')}</div></div>` : ''}
      ${prios.length ? `<div class="om-fgroup"><span class="om-flabel">Приоритет · осмотрено/всего</span><div class="om-segs om-segs-line" role="group" aria-label="Приоритет">${prios.map((p) => `<a class="om-seg${q.p === p ? ' on' : ''}" href="${href({ ...q, p: q.p === p ? '' : p })}" aria-current="${q.p === p}">П${p}<b>${pOf(p).filter((x) => x.s.inspected).length}/${pOf(p).length}</b></a>`).join('')}</div></div>` : ''}
      <div class="om-fgroup"><span class="om-flabel" title="Первоначальная стоимость позиции по описи">Стоимость, сом</span><div class="om-price">
        <input class="om-input" id="om-inv-min" data-invnum="min" inputmode="numeric" value="${esc(q.min || '')}" placeholder="от" aria-label="Стоимость от, сом">
        <span aria-hidden="true">—</span>
        <input class="om-input" id="om-inv-max" data-invnum="max" inputmode="numeric" value="${esc(q.max || '')}" placeholder="до" aria-label="Стоимость до, сом"></div></div>
      <div class="om-fgroup"><span class="om-flabel">Порядок</span><span class="om-select"><select class="om-input" data-invsort aria-label="Порядок">${[['', 'по №'], ['priority', 'по приоритету'], ['cost', 'по стоимости']].map(([k, l]) => `<option value="${k}"${(q.sort || '') === k ? ' selected' : ''}>${l}</option>`).join('')}</select></span></div>
    </div>` : ''}
    ${nOn ? `<p class="om-muted om-found-n">${esc(onList.join(' · '))} · показано ${list.length} из ${rows.length} · <a href="${href({ ...q, p: '', l: '', min: '', max: '', sort: '' })}">сбросить</a></p>` : ''}
    ${list.length ? `<div class="om-group">${list.slice(0, INV_LIMIT).map(({ it, s }) => {
    const can = !ro && it.own !== false && !(target && cardOf(o, inv, target).some((x) => x.id === it.id));
    return `<div class="om-row om-invrow${it.own === false ? ' om-off' : ''}${sel.has(it.id) ? ' om-picked' : ''}">
      ${can ? `<button type="button" class="om-check" data-sel="${esc(it.id)}" aria-pressed="${sel.has(it.id)}" aria-label="Отметить: ${esc(it.name)}"></button>` : `<span class="om-invno">${esc(String(it.no))}</span>`}
      <a class="om-row-tx" href="${picking ? '#' : href({ v: 'item', id: o.id, inv: inv.id, it: it.id })}"${picking ? ` data-sel="${esc(it.id)}"` : ''}><b>${esc(it.name)}</b>
        <small>${esc([it.inv, it.model, it.list].filter(Boolean).join(' · ') || 'без инв. номера')}${s.size > 1 ? ` · в карточке ${s.size} шт` : ''}${it.own === false ? ' · осматривает ' + esc(it.who) : ''}</small></a>
      ${statusChip(s)}</div>`;
  }).join('')}</div>${list.length > INV_LIMIT ? `<p class="om-muted om-more">Показаны первые ${INV_LIMIT} из ${list.length} — уточните поиск</p>` : ''}`
    : '<div class="om-card om-empty">Позиций не найдено</div>'}
    ${inv.kind === 'inv' && !target ? extrasBlock(o, inv, ro) : ''}
    ${bar}`;
}

// «Нет в описи» — предмет на месте есть, в описи нет: название и комментарий (Б4).
function extrasBlock(o, inv, ro) {
  const list = extrasOf(inv.id);
  return `<section class="om-card om-comp om-found om-extras"><h2 class="om-card-h">Нет в описи</h2>
    ${list.map((x) => `<div class="om-oi"><span class="om-row-tx"><b>${esc(x.name)}</b>${x.comment ? `<small>${esc(x.comment)}</small>` : ''}</span></div>`).join('')}
    ${ro ? (list.length ? '' : '<p class="om-muted om-found-none">Нет</p>') : `<form class="om-found-add" data-extra>
      <label class="om-flabel" for="om-extra-name">Предмет, которого нет в описи</label>
      <input class="om-input" id="om-extra-name" name="name" maxlength="120" required placeholder="Наименование">
      <input class="om-input" name="comment" maxlength="300" placeholder="Комментарий: где стоит, номер с бирки" aria-label="Комментарий">
      <button class="om-btn" type="submit">Добавить</button></form>`}</section>`;
}

// Карточка: позиции (одна или собранные вместе), общие снимки и комментарий, рекомендация «Такие же в описи».
function viewItem(o, q) {
  const inv = o && inventoryOf(session.state.person, o.id, q.inv);
  const it = inv && inv.items.find((x) => x.id === q.it && !OUT_OF_SCOPE.test(x.list || ''));
  if (!it) return `${back(o ? href({ v: 'obj', id: o.id }) : href({ v: 'trips' }), o ? o.title : 'Выезды')}<div class="om-card om-empty">Позиции нет</div>`;
  const members = cardOf(o, inv, it);
  const photos = photosOfCard(o, inv, members);
  const ro = o.state === 'done' || it.own === false;
  const dis = ro ? ' disabled' : '';
  const lead = members[0];
  const comment = rawMark(o, inv, lead).comment;
  const similar = ro ? [] : similarOf(o, inv, members);
  const facts = (x) => [['Инв. номер', x.inv], ['Модель', x.model], ['Тип имущества', x.kind], ['МОЛ', x.mol], ['Подразделение', x.dept], ['Список', x.list], ['Кол-во', x.qty > 1 ? x.qty : '']].filter(([, v]) => v);
  const memberHTML = (x) => {
    const s = statusOf(o, inv, x);
    const m = rawMark(o, inv, x);
    return `<div class="om-member"><div class="om-member-head"><b>${esc(x.name)}</b>${members.length > 1 && !ro ? `<button type="button" class="om-x" data-card-remove="${esc(x.id)}" aria-label="Убрать из карточки" title="Убрать из карточки">×</button>` : ''}</div>
      <dl class="om-dl">${facts(x).map(([l, v]) => `<dt>${esc(l)}</dt><dd>${esc(String(v))}</dd>`).join('')}</dl>
      ${ro ? statusChip(s) : `<div class="om-ms">
        <button type="button" class="om-opt om-opt-broken" data-mk-broken="${esc(x.id)}" aria-pressed="${s.broken}"${photos.length ? '' : ' disabled'}>${s.broken ? 'Нерабочее, на списание' : photos.length ? 'Отметить: нерабочее' : 'Нерабочее — сначала снимки'}</button>
        ${photos.length ? '' : `<button type="button" class="om-opt" data-mk-earlier="${esc(x.id)}" aria-pressed="${m.earlier || m.state === 'seen'}">${m.earlier || m.state === 'seen' ? 'Осмотрено — снять отметку' : 'Отметить осмотренным'}</button>`}</div>`}</div>`;
  };
  return `${back(href({ v: 'inv', id: o.id, inv: inv.id }), inv.title)}
    <p class="om-kicker">${members.length > 1 ? `Карточка · ${members.length} позиции` : `Позиция № ${esc(String(it.no))}`}</p>
    <h1 class="om-title om-title-oi">${esc(lead.name)}${members.length > 1 ? ` <small class="om-muted">(${members.length} шт)</small>` : ''}</h1>
    <div class="om-idrow"><span class="om-saved" role="status" aria-live="polite"></span>${it.own === false ? `<span class="om-muted">Осматривает ${esc(it.who)} — только просмотр</span>` : o.state === 'done' ? '<span class="om-muted">Осмотр закончен — только просмотр</span>' : ''}</div>
    ${instrHint([instrForItem(lead.name), instrForItem(lead.kind || '')].filter(Boolean).slice(0, 1))}
    <div class="om-group om-members">${members.map(memberHTML).join('')}</div>
    ${similar.length ? `<button type="button" class="om-btn om-btn-wide om-similar" data-card-similar>+ Такие же в описи: ${similar.length} — добавить сюда</button>` : ''}
    ${ro ? '' : `<a class="om-btn om-btn-wide" href="${href({ v: 'inv', id: o.id, inv: inv.id, to: lead.id })}">Добавить из описи</a>`}
    <div class="om-group om-form om-item">
      <div class="om-field"><span class="om-flabel">Снимки${members.length > 1 ? ' карточки' : ''}${photos.length ? ' · ' + photos.length : ''}</span>
        ${photos.length ? `<div class="om-thumbs">${photos.map((p) => `<a class="om-thumb" href="${href({ v: 'file', src: 'inv', id: o.id, inv: inv.id, it: it.id, ph: p.id })}" aria-label="Открыть снимок"><img src="${esc(p.dataUrl)}" alt="Снимок позиции" loading="lazy"></a>`).join('')}</div>` : ''}
        ${ro ? '' : `<div class="om-shoot-act"><label class="om-btn om-btn-primary">${ico('camera', 18)}Снять<input type="file" accept="image/*" capture="environment" multiple hidden data-mk-shoot></label>
          <label class="om-btn">${ico('photo', 18)}Из галереи<input type="file" accept="image/*" multiple hidden data-mk-shoot></label></div>`}</div>
      <div class="om-field"><label class="om-flabel" for="om-mk-comment">Комментарий</label>
        <textarea class="om-input" id="om-mk-comment" rows="2" maxlength="300" data-mk-comment${dis}>${esc(comment)}</textarea></div>
    </div>`;
}

// Осмотр не состоялся: событие регионалу (без повтора того же исхода в тот же день) и последний исход в
// «Результатах осмотра» — как прежний мост приложения (outcome). o — объект или выезд (typeId, ocId).
function outcomeOf(o, reason, note) {
  const person = session.state.person;
  const text = [reason, note].filter(Boolean).join(' — ');
  const today = isoDay();
  const same = (a) => eventsOf({ typeId: o.typeId, ocId: o.ocId }).some((x) => x.kind === 'outcome' && x.assignId === a.id && x.text === text && String(x.at).slice(0, 10) === today);
  myAssignsOn(person, o.typeId, o.ocId).filter((a) => !same(a)).forEach((a) => logEvent('outcome', a, { text }));
  resultsOf(o.typeId, o.ocId).outcome = { reason, note, by: person, at: new Date().toISOString() };
  saveResults();
  changed();
}

// --- исход выезда: закончен, перенос, не состоялся (как в приложении «Осмотр», экран объекта) ---------------
// «Осмотр закончен» при незаполненном обязательном — предупреждение и «неполный» (решение 03.11.2026:
// «Предупредить, «неполный»»); исходы «не состоялся» — перечень приложения (Estate.OUTCOMES; 03.11.2026 «Нужны»);
// перенос — запрос регионалу с датой и причиной из справочника (06.11.2026). Без окон поверх: панели на месте.
const OUTCOMES = ['Не на месте', 'Нет доступа', 'Объект закрыт', 'Другое ТС', 'Другое'];
function missingOf(o) {
  const rows = [...(o.ois || []), ...(o.entity === 'real' ? foundOi(o.typeId, o.ocId).map(foundRow) : [])];
  return rows.map((x) => { const c = oiCtx(o, x.id); const p = c && progressOf(c); return p && p.requiredLeft ? `${oiHead(x).name} — не заполнено: ${p.requiredLeft}` : ''; }).filter(Boolean);
}
function finishBlock(o, ui) {
  if (o.removed) return '<p class="om-muted om-finish-note">Назначение снято или передано другому осмотрщику.</p>';
  const r = resultsOf(o.typeId, o.ocId).outcome;
  const last = r && r.reason ? `<p class="om-warn">Осмотр не состоялся: ${esc(r.reason)}${r.note ? ' — ' + esc(r.note) : ''} · ${esc(shortDate(String(r.at).slice(0, 10)))}</p>` : '';
  if (o.state === 'done') return `<section class="om-finish">${last}<p class="om-muted">Осмотр закончен — объект на проверке ЦОД.</p><button type="button" class="om-btn" data-reopen>Вернуть в работу</button></section>`;
  const miss = ui.asking ? missingOf(o) : [];
  const ask = ui.asking ? `<div class="om-card om-ask" role="alert"><b>${miss.length ? 'Заполнено не всё обязательное' : 'Закончить осмотр?'}</b>
      ${miss.length ? `<ul>${miss.map((m) => `<li>${esc(m)}</li>`).join('')}</ul><p class="om-muted">Осмотр уйдёт с отметкой «неполный».</p>` : '<p class="om-muted">Снятое уйдёт в E•state, объект — на проверку ЦОД.</p>'}
      <div class="om-shoot-act"><button type="button" class="om-btn om-btn-primary" data-finish="${miss.length ? 'incomplete' : 'full'}">${miss.length ? 'Закончить как неполный' : 'Закончить'}</button>
      <button type="button" class="om-btn" data-finish-cancel>${miss.length ? 'Дозаполнить' : 'Отмена'}</button></div></div>`
    : '<button type="button" class="om-btn om-btn-primary om-btn-wide" data-finish-ask>Осмотр закончен</button>';
  const mv = o.moveReq ? `<p class="om-muted">Перенос запрошен на ${esc(shortDate(o.moveReq.date))}: ${esc(o.moveReq.reason)} — ждёт регионала.</p>`
    : `<details class="om-card om-more-act"><summary>Перенести</summary><form class="om-found-add" data-move>
      <label class="om-flabel" for="om-move-date">Дата</label><input class="om-input" id="om-move-date" name="date" type="date" required min="${isoDay()}">
      <label class="om-flabel" for="om-move-reason">Причина</label><span class="om-select"><select class="om-input" id="om-move-reason" name="reason" required>${skipReasons().map((x) => `<option>${esc(x)}</option>`).join('')}</select></span>
      <input class="om-input" name="note" maxlength="200" placeholder="Пояснение" aria-label="Пояснение">
      <button class="om-btn" type="submit">Запросить перенос</button></form></details>`;
  const reasons = OUTCOMES.filter((x) => x !== 'Другое ТС' || o.entity === 'vehicle' || (o.ois || []).some((y) => y.kind === 'vehicle'));
  const fail = `<details class="om-card om-more-act"><summary>Осмотр не состоялся</summary><form class="om-found-add" data-outcome>
      <fieldset class="om-radios"><legend class="om-flabel">Причина</legend>${reasons.map((x, i) => `<label class="om-radio"><input type="radio" name="reason" value="${esc(x)}"${i ? '' : ' checked'}> ${esc(x)}</label>`).join('')}</fieldset>
      <textarea class="om-input" name="note" rows="2" maxlength="300" placeholder="Пояснение" aria-label="Пояснение"></textarea>
      <button class="om-btn" type="submit">Отправить регионалу</button></form></details>`;
  return `<section class="om-finish">${last}${ask}${mv}${fail}</section>`;
}

// --- отчёт дня (как в приложении «Осмотр», EstateDay.kt, ReportBody) -----------------------------------------
// Утро — одометр (необязательно) или «Одометра нет»; вечер — пробег (по дорогам — подставлен, можно поправить),
// выезды дня с исходом «Осмотрен / Частично / Не состоялся» (частично — причина обязательна; не состоялся —
// причина из перечня приложения, уходит исходом выезда), комментарий. Сдать можно не позже 3 рабочих дней
// (kernel/inspections.js, LATE_REPORT_WORKDAYS). Решения 06.11.2026 (пачка А).
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: пробег по дорогам считает сервер (OSRM) по точкам дня; здесь — запрос из браузера.
const routeKmCache = new Map();
const kmText = (km) => (km == null ? '' : String(Math.round(km * 10) / 10).replace('.', ','));
const kmHint = (km) => (km === undefined ? 'Считается маршрут по дорогам…' : km != null ? `По дорогам (OSM): ${kmText(km)} км — можно поправить` : 'Маршрут по дорогам не посчитан — введите вручную');
function dayTripsOf(person, date) {
  return assignmentsOfPerson(person, { live: false }).filter((a) => a.plannedAt === date && a.state !== 'removed')
    .map((a) => ({ assignId: a.id, objectId: `${a.typeId}|${a.ocId}`, typeId: a.typeId, ocId: a.ocId, title: titleOf(loadTask(a.typeId, a.ocId) || {}, a.ocId), state: a.state }));
}
function viewReport(q, rerender) {
  const person = session.state.person;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(q.date || '') ? q.date : isoDay();
  const morning = reportOf(person, date, 'morning');
  const evening = reportOf(person, date, 'evening');
  const late = date < isoDay() ? lateWorkdays(person, date) : 0;
  const open = !!(morning && evening) || late <= LATE_REPORT_WORKDAYS;
  const trips = dayTripsOf(person, date);
  // Пробег по дорогам — фоном; пришёл — экран перерисуется.
  if (!routeKmCache.has(person + '|' + date)) {
    routeKmCache.set(person + '|' + date, undefined);
    const pts = dayPoints(person, date);
    const done = (km) => { routeKmCache.set(person + '|' + date, km); rerender(km); };
    (pts ? osrmKm(pts) : Promise.resolve(null)).then(done, () => done(null));
  }
  const routeKm = routeKmCache.get(person + '|' + date);
  const routeText = kmText(routeKm);
  const ev = evening || {};
  const done = new Set(ev.done || []);
  const partial = new Map((ev.partial || []).map((p) => [p.assignId, p.reason]));
  const resOf = (t) => (done.has(t.assignId) ? 'done' : partial.has(t.assignId) ? 'partial' : !evening && t.state === 'done' ? 'done' : '');
  const dis = open ? '' : ' disabled';
  const clock = (iso) => (iso ? String(new Date(iso).toTimeString()).slice(0, 5) : '');
  const d = new Date(date + 'T00:00:00');
  const prev = new Date(d); prev.setDate(d.getDate() - 1);
  const next = new Date(d); next.setDate(d.getDate() + 1);
  const dayLink = (x, label) => `<a class="om-btn om-btn-sm" href="${href({ v: 'report', date: isoDay(x) })}">${label}</a>`;
  return `${back(href({ v: 'today' }), 'Сегодня')}
    <h1 class="om-title om-title-sm">Отчёт дня</h1>
    <div class="om-daynav">${dayLink(prev, '‹')}<b>${d.getDate()} ${MONTHS[d.getMonth()]}, ${WEEKDAYS[d.getDay()].toLowerCase()}</b>${date < isoDay() ? dayLink(next, '›') : '<span class="om-btn om-btn-sm om-off" aria-hidden="true">›</span>'}</div>
    ${open ? '' : '<p class="om-warn">Срок сдачи отчёта за этот день прошёл</p>'}
    ${workdayOf(person, date).ok ? '' : '<p class="om-muted">Нерабочий день</p>'}
    <form class="om-card om-report" data-morning>
      <h2 class="om-card-t">Утро</h2>
      ${morning ? `<p class="om-ok-line">День начат в ${esc(clock(morning.at))}</p>` : ''}
      <label class="om-flabel" for="om-odo">Одометр, км <span class="om-muted">(необязательно)</span></label>
      <input class="om-input" id="om-odo" name="odometer" inputmode="decimal" value="${esc((morning || {}).odometer || '')}"${dis}${(morning || {}).noOdometer ? ' disabled' : ''}>
      <label class="om-radio"><input type="checkbox" name="noOdometer"${(morning || {}).noOdometer ? ' checked' : ''}${dis}> Одометра нет</label>
      <button class="om-btn om-btn-primary om-btn-wide" type="submit"${dis}>${morning ? 'Обновить' : 'Начал день'}</button>
    </form>
    <form class="om-card om-report" data-evening novalidate>
      <h2 class="om-card-t">Вечер</h2>
      ${evening ? `<p class="om-ok-line">Отчёт сдан в ${esc(clock(evening.at))}</p>` : ''}
      <label class="om-flabel" for="om-km">Пробег, км</label>
      <input class="om-input" id="om-km" name="km" inputmode="decimal" value="${esc(ev.km || routeText)}" aria-describedby="om-km-h"${dis}>
      <p class="om-hint" id="om-km-h">${esc(kmHint(routeKm))}</p>
      <input type="hidden" name="route" value="${esc(routeText)}">
      <span class="om-flabel">Выезды дня</span>
      ${trips.length ? trips.map((t) => {
    const r = resOf(t);
    return `<fieldset class="om-trip" data-trip="${esc(t.assignId)}"><legend><b>${esc(t.title || 'Объект')}</b></legend>
        <div class="om-ms">${[['done', 'Осмотрен'], ['partial', 'Частично'], ['failed', 'Не состоялся']].map(([k, l]) => `<label class="om-opt om-opt-r"><input type="radio" name="r_${esc(t.assignId)}" value="${k}"${r === k ? ' checked' : ''}${dis}>${l}</label>`).join('')}</div>
        <div class="om-trip-partial"><label class="om-flabel" for="om-pr-${esc(t.assignId)}">Причина <i class="om-req">*</i></label>
          <textarea class="om-input" id="om-pr-${esc(t.assignId)}" name="p_${esc(t.assignId)}" rows="2"${dis}>${esc(partial.get(t.assignId) || '')}</textarea></div>
        <div class="om-trip-failed"><span class="om-flabel">Причина <i class="om-req">*</i></span>${OUTCOMES.map((o) => `<label class="om-radio"><input type="radio" name="f_${esc(t.assignId)}" value="${esc(o)}"${dis}> ${esc(o)}</label>`).join('')}</div>
        <p class="om-hint om-hint-diff om-trip-err" hidden>Укажите причину</p></fieldset>`;
  }).join('') : '<p class="om-muted">Выездов на этот день нет</p>'}
      <label class="om-flabel" for="om-day-note">Комментарий</label>
      <textarea class="om-input" id="om-day-note" name="note" rows="2"${dis}>${esc(ev.note || '')}</textarea>
      <button class="om-btn om-btn-primary om-btn-wide" type="submit"${dis}>${evening ? 'Обновить отчёт' : 'Сдать вечерний отчёт'}</button>
    </form>`;
}

// --- запросы документов из Кадастра (как в приложении «Осмотр», EstateCadastre.kt; решения 06.11.2026, пачка Б) ---
// Строка: что просят, по какому объекту, ЕНИ, учреждение; ответ — «Получен» (скан или PDF), «Нет», «Отказ»;
// после разбора ЦОД — принят, возвращён или отклонён с причиной; ответ можно поправить.
function cadRows(person) {
  const state = (x) => (x.review ? x.review.state : x.file && x.file.docId ? 'accepted' : x.result ? 'wait' : '');
  return allCadRequests().filter((r) => r.person === person).map((r) => ({
    id: r.id, no: r.no, kind: cadKindLabel(r.kind), due: r.due || '', note: r.note || '', closed: !!r.closedAt,
    // Филиал — выбранный регионалом.
    branch: r.kind === 'cadastre' ? cadBranch(r.branch) : null,
    rows: r.rows.map((x) => {
      const rec = x.typeId && x.ocId ? loadTask(x.typeId, x.ocId) : null;
      return { id: x.id, doc: x.doc || '', title: rec ? titleOf(rec, x.ocId) : '', eni: fmtEni(x.eni) || x.eni || '', inst: x.inst || '',
        result: x.result || '', resultLabel: x.result ? cadResultLabel(x.result) : 'Ждёт', answer: x.answer || '', scanDate: x.scanDate || '',
        file: x.file ? x.file.name || '' : '', fileObj: x.file ? { name: x.file.name || '', ...(x.file.attached || {}) } : null, locked: cadFileAccepted(x), review: state(x) };
    }),
  }));
}
// --- прикреплённые файлы: карточка (миниатюра, имя, вид, размер; «Открыть», «Открепить») и просмотр ----------
// Пользователь 17.11.2026: «нужна возможность открепить прикрепленный скан… Ну и так же открыть его просмотр.
// Оформляем красиво». Открепление — с подтверждением в строке, без окна поверх экрана.
const isPdfFile = (f) => !!f && (/pdf/i.test(f.mime || '') || f.kind === 'pdf' || /\.pdf$/i.test(f.name || ''));
const fileSize = (n) => (!n ? '' : n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + ' КБ' : (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' МБ');
const fileMeta = (f) => [isPdfFile(f) ? 'PDF' : 'Снимок', f.pageCount > 1 ? f.pageCount + ' стр.' : '', fileSize(f.size)].filter(Boolean).join(' · ');
// f — { name, mime, kind, dataUrl, size, pageCount }; open — адрес просмотра; detach — { key, attr, ask, text, label } или null.
function fileCard(f, open, detach = null, note = '') {
  const prev = isPdfFile(f) ? `<span class="om-file-pdf" aria-hidden="true">PDF</span>` : f.dataUrl ? `<img src="${esc(f.dataUrl)}" alt="" loading="lazy">` : `<span class="om-file-pdf" aria-hidden="true">${ico('photo', 20)}</span>`;
  const asking = detach && detach.ask;
  return `<div class="om-file${asking ? ' asking' : ''}">
    <a class="om-file-prev" href="${open}" aria-label="Открыть: ${esc(f.name || 'файл')}">${prev}</a>
    <a class="om-file-tx" href="${open}"><b>${esc(f.name || 'Файл')}</b><small>${esc(fileMeta(f))}</small>${note ? `<small class="om-file-note">${esc(note)}</small>` : ''}</a>
    <span class="om-file-act">
      <a class="om-btn om-btn-sm" href="${open}">${ico('photo', 16)}Открыть</a>
      ${detach && !asking ? `<button type="button" class="om-btn om-btn-sm om-btn-ghost-danger" data-detach-ask="${esc(detach.key)}">${ico('trash', 16)}${esc(detach.label || 'Открепить')}</button>` : ''}
    </span>
    ${asking ? `<div class="om-file-ask" role="group" aria-label="Подтверждение">
      <span>${esc(detach.text)}</span>
      <span class="om-file-ask-act"><button type="button" class="om-btn om-btn-sm om-btn-danger" ${detach.attr}>${esc(detach.label || 'Открепить')}</button>
      <button type="button" class="om-btn om-btn-sm" data-detach-ask="">Отмена</button></span></div>` : ''}
  </div>`;
}
// Просмотр файла во всю страницу: снимок — картинкой, PDF — встроенным просмотрщиком браузера.
function viewFile(all, q, ui) {
  let f = null;
  let backTo = href({ v: 'today' });
  let backLabel = 'Назад';
  let detach = null;
  if (q.src === 'cad') {
    const r = cadRows(session.state.person).find((x) => x.id === q.r);
    const x = r && r.rows.find((y) => y.id === q.row);
    backTo = href({ v: 'cad', r: q.r });
    backLabel = r ? `Запрос № ${r.no}` : 'Запросы документов';
    if (x && x.fileObj) {
      f = x.fileObj;
      if (!x.locked && !r.closed) detach = { key: 'view', ask: ui.detachAsk === 'view', attr: `data-cad-detach="${esc(q.r)}|${esc(q.row)}"`, text: 'Открепить скан? Ответ «Получен» снимется, строка снова будет ждать ответа.' };
    }
  } else if (q.src === 'inv') {
    const o = all.find((x) => x.id === q.id);
    const inv = o && inventoryOf(session.state.person, o.id, q.inv);
    const it = inv && inv.items.find((x) => x.id === q.it);
    backTo = href({ v: 'item', id: q.id, inv: q.inv, it: q.it });
    backLabel = it ? it.name : 'Позиция описи';
    const ph = it && photosOfCard(o, inv, cardOf(o, inv, it)).find((x) => x.id === q.ph);
    if (ph) {
      f = { name: ph.name || 'Снимок позиции', mime: 'image/*', dataUrl: ph.dataUrl, size: ph.size };
      if (o.state !== 'done' && it.own !== false) detach = { key: 'view', ask: ui.detachAsk === 'view', label: 'Удалить снимок', attr: `data-inv-ph-del="${esc(ph.id)}"`, text: 'Удалить снимок позиции?' };
    }
  }
  if (!f || !f.dataUrl) return `${back(backTo, backLabel)}<div class="om-card om-empty">Файла нет — он откреплён или удалён</div>`;
  return `${back(backTo, backLabel)}
    <h1 class="om-title om-title-sm om-file-title">${esc(f.name || 'Файл')}</h1>
    <p class="om-muted">${esc(fileMeta(f))}</p>
    ${isPdfFile(f) ? `<iframe class="om-docview" src="${esc(f.dataUrl)}" title="${esc(f.name || 'PDF')}"></iframe>` : `<img class="om-docimg" src="${esc(f.dataUrl)}" alt="${esc(f.name || 'Снимок')}">`}
    <div class="om-file-bar"><a class="om-btn" href="${esc(f.dataUrl)}" download="${esc(f.name || 'файл')}">${ico('docs', 18)}Скачать</a>
      ${detach ? (detach.ask ? `<span class="om-file-ask"><span>${esc(detach.text)}</span><span class="om-file-ask-act"><button type="button" class="om-btn om-btn-danger" ${detach.attr}>${esc(detach.label || 'Открепить')}</button><button type="button" class="om-btn" data-detach-ask="">Отмена</button></span></span>`
    : `<button type="button" class="om-btn om-btn-ghost-danger" data-detach-ask="view">${ico('trash', 18)}${esc(detach.label || 'Открепить')}</button>`) : ''}</div>`;
}

// Ждёт осмотрщика: без ответа или возвращён ЦОД.
const cadWaits = (x) => !x.result || x.review === 'returned';
const waitingCad = (person) => cadRows(person).filter((r) => !r.closed).flatMap((r) => r.rows).filter(cadWaits).length;

function branchCard(b) {
  return `<section class="om-card om-branch" aria-label="Филиал Кадастра">
    <span class="om-cap">Филиал Кадастра</span>
    <b>${esc(b.name)}</b>
    <span>${esc(b.address)}</span>
    <span class="om-branch-who">${esc(b.person)} · <a href="tel:${esc(b.phone.replace(/[^\d+]/g, ''))}">${esc(b.phone)}</a></span>
    <div class="om-place-act">${routeBtn(b, true)}</div>
  </section>`;
}

// Запросы бывают по 100–200 документов (пользователь 16.11.2026: «Бывает и по 100-200 доков за раз»):
// список запросов — сводкой; в запросе — поиск, отбор по состоянию, строки в одну линию; форма ответа —
// только у раскрытой строки; после ответа раскрывается следующая ждущая.
const CAD_RESULTS = [['got', 'Получен'], ['none', 'Нет'], ['refused', 'Отказ']];
const CAD_FILTERS = [['', 'Ждут ответа', cadWaits], ['done', 'Отвечено', (x) => x.result && x.review !== 'returned'], ['returned', 'Возвращены', (x) => x.review === 'returned'], ['all', 'Все', () => true]];
const CAD_LIMIT = 60;
const CAD_REVIEW = { accepted: ['Принят ЦОД', 'green'], returned: ['Возвращён', 'amber'], rejected: ['Отклонён', 'rose'], wait: ['На разборе ЦОД', 'blue'] };
const lc = (v) => String(v || '').toLowerCase().replace(/ё/g, 'е');
function cadChip(x) {
  if (!x.result) return '<span class="om-chip om-t-blue">Ждёт</span>';
  const [rw, tone] = CAD_REVIEW[x.review] || ['', 'blue'];
  return `<span class="om-chip om-t-${tone}">${esc(x.review === 'wait' ? x.resultLabel : rw)}</span>`;
}
function viewCad(q, openRow, detachAsk = '') {
  const list = cadRows(session.state.person);
  const r = q.r && list.find((x) => x.id === q.r);
  if (r) return viewCadOne(r, q, openRow, detachAsk);
  const shown = list.filter((x) => (q.s === 'closed' ? x.closed : !x.closed));
  return `${back(href({ v: 'menu' }), 'Меню')}
    <h1 class="om-title om-title-sm">Запросы документов</h1>
    <div class="om-tabs3 om-tabs2">${[['', 'Открытые', list.filter((x) => !x.closed).length], ['closed', 'Закрытые', list.filter((x) => x.closed).length]].map(([k, l, n]) => `<a class="om-tab3${(q.s || '') === k ? ' on' : ''}" href="${href({ v: 'cad', s: k })}">${l} <b>${n}</b></a>`).join('')}</div>
    ${shown.length ? `<div class="om-group">${shown.map((x) => {
    const wait = x.rows.filter(cadWaits).length;
    const done = x.rows.filter((y) => y.result).length;
    return `<a class="om-row" href="${href({ v: 'cad', r: x.id })}" data-req="${esc(x.id)}"><span class="om-row-ico om-t-violet">${ico('docs')}</span>
        <span class="om-row-tx"><span>№ ${esc(String(x.no))} · ${esc(x.kind)}</span><small class="om-prog">${esc([x.branch ? x.branch.name : '', x.due ? 'срок ' + shortDate(x.due) : '', `ответ ${done} из ${x.rows.length}`].filter(Boolean).join(' · '))}</small></span>
        ${wait ? `<b class="om-n om-t-violet" title="Ждут ответа">${wait}</b>` : ''}${ico('chev', 18)}</a>`;
  }).join('')}</div>` : `<div class="om-card om-empty">${q.s === 'closed' ? 'Закрытых запросов нет' : 'Открытых запросов нет'}</div>`}`;
}
function viewCadOne(r, q, openRow, detachAsk = '') {
  const f = CAD_FILTERS.find(([k]) => k === (q.f || '')) || CAD_FILTERS[0];
  const needle = lc(q.q);
  const hit = (x) => !needle || lc(`${x.doc} ${x.title} ${x.eni} ${x.eni.replace(/\D/g, '')} ${x.inst}`).includes(needle);
  const rows = r.rows.filter((x) => f[2](x) && hit(x));
  const done = r.rows.filter((x) => x.result).length;
  const pct = r.rows.length ? Math.round((done / r.rows.length) * 100) : 0;
  const nextWait = (id) => { const i = rows.findIndex((x) => x.id === id); return (rows.slice(i + 1).find(cadWaits) || {}).id || ''; };
  const line = (x) => {
    const open = x.id === openRow && !r.closed;
    return `<div class="om-cadline${open ? ' open' : ''}" data-row="${esc(x.id)}">
      <button type="button" class="om-cadline-h" data-cad-open="${esc(x.id)}" aria-expanded="${open}"${r.closed ? ' disabled' : ''}>
        <span class="om-cadline-tx"><b>${esc(x.doc || 'Документ')}</b><small>${esc([x.eni, x.title].filter(Boolean).join(' · '))}</small></span>${x.fileObj ? `<span class="om-clip" title="Прикреплён скан: ${esc(x.fileObj.name)}" aria-label="Прикреплён скан">${ico('clip', 16)}</span>` : ''}${cadChip(x)}</button>
      ${open ? `<form class="om-cadrow" data-cad="${esc(r.id)}" data-row="${esc(x.id)}" data-next="${esc(nextWait(x.id))}" data-has-file="${x.fileObj ? 1 : 0}">
        <dl class="om-dl">${[['Учреждение', x.inst], ['Ответ', x.result ? x.resultLabel : ''], ['Пояснение', x.answer]].filter(([, v]) => v).map(([l, v]) => `<dt>${esc(l)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        ${x.fileObj ? fileCard(x.fileObj, href({ v: 'file', src: 'cad', r: r.id, row: x.id }),
    x.locked ? null : { key: x.id, ask: detachAsk === x.id, attr: `data-cad-detach="${esc(r.id)}|${esc(x.id)}"`, text: 'Открепить скан? Ответ «Получен» снимется, строка снова будет ждать ответа.' },
    x.locked ? 'Принят ЦОД — документ объекта' : '') : ''}
        <div class="om-ms" role="group" aria-label="Ответ">${CAD_RESULTS.map(([k, l]) => `<label class="om-opt om-opt-r"><input type="radio" name="result" value="${k}"${x.result === k ? ' checked' : ''}>${l}</label>`).join('')}</div>
        <div class="om-cad-got">${x.locked ? '' : `<label class="om-btn">${ico('camera', 18)}${x.fileObj ? 'Заменить скан' : 'Скан или PDF'}<input type="file" name="file" accept="image/*,application/pdf" capture="environment" hidden data-cad-file></label>
          <div class="om-cad-pick" hidden></div>`}
          <label class="om-flabel" for="om-cd-${esc(x.id)}">Дата документа</label><input class="om-input" type="date" id="om-cd-${esc(x.id)}" name="scanDate" value="${esc(x.scanDate)}"></div>
        <textarea class="om-input" name="answer" rows="2" maxlength="300" placeholder="Пояснение" aria-label="Пояснение">${esc(x.answer)}</textarea>
        <p class="om-hint om-hint-diff" data-cad-err hidden></p>
        <button class="om-btn om-btn-primary" type="submit">Отправить ответ</button>
      </form>` : ''}
    </div>`;
  };
  return `${back(href({ v: 'cad', s: r.closed ? 'closed' : '' }), 'Запросы документов')}
    <p class="om-kicker">${esc(r.kind)}${r.due ? ' · срок ' + esc(shortDate(r.due)) : ''}${r.closed ? ' · закрыт' : ''}</p>
    <h1 class="om-title om-title-sm">Запрос № ${esc(String(r.no))}</h1>
    ${r.note ? `<p class="om-cad-note"><span>Комментарий регионала</span>${esc(r.note)}</p>` : ''}
    ${r.branch ? branchCard(r.branch) : ''}
    <div class="om-cadprog"><span>ответ ${done} из ${r.rows.length}</span><span class="om-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Отвечено"><i style="width:${pct}%"></i></span></div>
    <label class="om-search">${ico('search', 18)}<input id="om-cad-q" data-invq type="search" value="${esc(q.q || '')}" placeholder="Документ, объект, ЕНИ" aria-label="Поиск по запросу: документ, объект, ЕНИ, учреждение"></label>
    <div class="om-segs om-segs-line" role="group" aria-label="Состояние строк">${CAD_FILTERS.map(([k, l, fn]) => `<a class="om-seg${(q.f || '') === k ? ' on' : ''}" href="${href({ ...q, f: k })}" aria-current="${(q.f || '') === k}">${l}<b>${r.rows.filter((x) => fn(x) && hit(x)).length}</b></a>`).join('')}</div>
    ${rows.length ? `<div class="om-card om-cadlist">${rows.slice(0, CAD_LIMIT).map(line).join('')}</div>
      ${rows.length > CAD_LIMIT ? `<p class="om-muted om-found-n">Показано ${CAD_LIMIT} из ${rows.length} — уточните поиск</p>` : ''}`
    : `<div class="om-card om-empty">${needle ? 'Ничего не найдено' : f[0] === '' ? 'Все строки отвечены' : 'Строк нет'}</div>`}`;
}

// Вкладки ОИ — «Сведения» (разделы осмотра) и «Фото», как у литеры на стенде.
function oiTabs(o, ctx, q) {
  const tabs = [['', 'docs', 'Сведения'], ['photo', 'camera', 'Фото']];
  return `<nav class="om-bnav om-objtabs" aria-label="Разделы объекта имущества">${tabs.map(([k, icon, label]) => `<a class="om-btab${(q.tab || '') === k ? ' on' : ''}" href="${href({ v: 'oi', id: o.id, oi: ctx.row.id, tab: k })}" aria-current="${(q.tab || '') === k}">${ico(icon, 22)}<span>${label}${k === 'photo' && ctx.photos ? ` <b>${ctx.photos}</b>` : ''}</span></a>`).join('')}</nav>`;
}

// Фото ОИ: «куда снимаем» — категория съёмки (перечень по виду ОИ, pages/inspection/tasks.js, photoCatsOf),
// съёмка камерой телефона или выбор из галереи; снимки — по категориям, снимок — во всю страницу.
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: снимки — в памяти вкладки и хранилище браузера (kernel/inspectionResults.js);
// на сервере — загрузка с очередью и повтором при плохой связи.
function photosBlock(o, ctx, q) {
  const cats = photoCatsOf(ctx.oi);
  const cat = cats.includes(q.cat) ? q.cat : cats[0];
  const list = (resultsOf(o.typeId, o.ocId).photos || []).filter((p) => p.oiId === ctx.row.id && !p.deleted && p.dataUrl);
  const groups = [...new Set([...cats, ...list.map((p) => p.cat)])].map((c) => [c, list.filter((p) => p.cat === c)]).filter(([, l]) => l.length);
  const shoot = ctx.ro ? '' : `<section class="om-card om-shoot"><span class="om-cap">Куда снимаем</span>
      <div class="om-segs">${cats.map((c) => `<a class="om-seg${c === cat ? ' on' : ''}" href="${href({ v: 'oi', id: o.id, oi: ctx.row.id, tab: 'photo', cat: c })}" aria-current="${c === cat}">${esc(c)}<b>${list.filter((p) => p.cat === c).length || ''}</b></a>`).join('')}</div>
      <div class="om-shoot-act">
        <label class="om-btn om-btn-primary">${ico('camera', 18)}Снять<input type="file" accept="image/*" capture="environment" multiple hidden data-shoot="${esc(cat)}"></label>
        <label class="om-btn">${ico('photo', 18)}Из галереи<input type="file" accept="image/*" multiple hidden data-shoot="${esc(cat)}"></label>
      </div></section>`;
  return `${shoot}${groups.length ? groups.map(([c, l]) => `<h2 class="om-cap om-sec">${esc(c)} · ${l.length}</h2>
    <div class="om-thumbs">${l.map((p) => `<a class="om-thumb" href="${href({ v: 'ph', id: o.id, oi: ctx.row.id, ph: p.id })}"><img src="${esc(p.dataUrl)}" alt="${esc(c)}" loading="lazy"></a>`).join('')}</div>`).join('')
    : '<div class="om-card om-empty">Снимков этого объекта пока нет</div>'}`;
}

// Снимок во всю страницу: категория (перенос — требование ТЗ), удаление.
function viewPhoto(o, q) {
  const ctx = o && oiCtx(o, q.oi);
  const p = ctx && (resultsOf(o.typeId, o.ocId).photos || []).find((x) => x.id === q.ph);
  const to = ctx ? href({ v: 'oi', id: o.id, oi: ctx.row.id, tab: 'photo' }) : href({ v: 'trips' });
  if (!p) return `${back(to, 'Фото')}<div class="om-card om-empty">Снимка нет</div>`;
  const cats = photoCatsOf(ctx.oi);
  const opts = cats.includes(p.cat) ? cats : [p.cat, ...cats];
  return `${back(to, 'Фото · ' + oiHead(ctx.row).name)}
    <img class="om-photo" src="${esc(p.dataUrl)}" alt="${esc(p.cat)}">
    <div class="om-card om-photo-meta">
      <label class="om-flabel" for="om-ph-cat">Категория</label>
      <span class="om-select"><select class="om-input" id="om-ph-cat" data-ph-cat="${esc(p.id)}"${ctx.ro ? ' disabled' : ''}>${opts.map((c) => `<option${c === p.cat ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></span>
      <p class="om-hint">${esc(new Date(p.at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }))}${p.place ? ' · место съёмки есть' : ''}</p>
      ${ctx.ro ? '' : `<button type="button" class="om-btn om-btn-danger" data-ph-del="${esc(p.id)}">${ico('trash', 18)}Удалить снимок</button>`}
    </div>`;
}

const fid = (key) => 'om-f-' + String(key).replace(/[^\w-]/g, '_');
function hintHTML(f) {
  return `<p class="om-hint" id="${fid(f.key)}-h">${esc(f.hint || '')}</p>`;
}
function fieldHTML(f, ctx) {
  const key = f.path || f.key;
  const v = getValue(ctx.values, key);
  const id = fid(f.key);
  const dis = ctx.ro ? ' disabled' : '';
  const req = f.req && f.req(ctx.values) ? '<i class="om-req" title="Обязательное поле"> *</i>' : '';
  if (f.opts && f.multi) {
    const set = new Set(Array.isArray(v) ? v : v ? String(v).split(/,\s*/) : []);
    return `<div class="om-field"><span class="om-flabel" id="${id}-l">${esc(f.label)}${req}</span>
      <div class="om-ms" role="group" aria-labelledby="${id}-l" aria-describedby="${id}-h">${f.opts.map((x) => `<button type="button" class="om-opt" data-ms="${esc(key)}" data-opt="${esc(x)}" aria-pressed="${set.has(x)}"${dis}>${esc(x)}</button>`).join('')}</div>
      ${hintHTML(f)}</div>`;
  }
  const attrs = `id="${id}" data-f="${esc(key)}" aria-describedby="${id}-h"${dis}${f.max ? ` maxlength="${f.max}"` : ''}${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''}`;
  let ctl;
  if (f.opts) {
    const opts = v && !f.opts.includes(v) ? [v, ...f.opts] : f.opts;
    ctl = `<span class="om-select"><select class="om-input" ${attrs}><option value="">не выбрано</option>${opts.map((x) => `<option${x === v ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></span>`;
  } else if (f.long) {
    ctl = `<textarea class="om-input" rows="${f.rows || 3}" ${attrs}>${esc(v || '')}</textarea>`;
  } else {
    const num = f.num ? ` inputmode="${f.int ? 'numeric' : 'decimal'}"` : '';
    ctl = `<span class="om-inputwrap"><input class="om-input" type="text"${num} value="${esc(v == null ? '' : v)}" ${attrs}>${f.unit ? `<span class="om-unit">${esc(f.unit)}</span>` : ''}</span>`;
  }
  return `<div class="om-field"><label class="om-flabel" for="${id}">${esc(f.label)}${req}</label>${ctl}${hintHTML(f)}</div>`;
}

// Фото фасада с прошлого осмотра — по ОИ, последнее (согласовано 16.11.2026).
function facadeOf(o) {
  const out = {};
  ((resultsOf(o.typeId, o.ocId) || {}).photos || []).filter((p) => p.dataUrl && /фасад/i.test(p.cat || '') && !p.deleted)
    .forEach((p) => { if (!out[p.oiId] || String(p.at) > String(out[p.oiId].at)) out[p.oiId] = p; });
  return out;
}

function docsBlock(o) {
  if (!o.docs.length) return '<div class="om-card om-empty">Документов для выезда нет</div>';
  const groups = new Map();
  o.docs.forEach((d) => { const k = d.owner || 'Объект оценки'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(d); });
  return [...groups].map(([owner, list]) => `<h2 class="om-cap om-sec">${esc(owner)}</h2><div class="om-group">${list.map((d) => d.file
    ? `<a class="om-row" href="${href({ v: 'doc', id: o.id, doc: d.id })}"><span class="om-row-ico om-t-blue">${ico('docs')}</span><span class="om-row-tx"><b>${esc(d.type || d.name)}</b>${d.type ? `<small>${esc(d.name)}</small>` : ''}</span>${ico('chev', 18)}</a>`
    : `<div class="om-row om-off"><span class="om-row-ico">${ico('docs')}</span><span class="om-row-tx"><b>${esc(d.type || d.name)}</b><small>файла нет</small></span></div>`).join('')}</div>`).join('');
}

// Документ — во всю страницу, без окна поверх (правило «без модальных окон»).
function viewDoc(o, q) {
  let doc = null;
  try { const { rec } = findObject(session.state.person, q.id); doc = docsOf(rec).find((d) => d.id === q.doc) || null; } catch { doc = null; }
  const f = doc && doc.doc.file;
  const name = doc ? doc.doc.type || doc.doc.name || (f && f.name) || 'Документ' : 'Документ';
  const isPdf = f && (/pdf/i.test(f.mime || '') || /\.pdf$/i.test(f.name || '') || /^data:application\/pdf/.test(f.dataUrl || ''));
  return `${back(href({ v: 'obj', id: q.id, tab: 'docs' }), o ? o.title : 'Объект')}
    <h1 class="om-title om-title-sm">${esc(name)}</h1>
    ${!f || !f.dataUrl ? '<div class="om-card om-empty">У документа нет файла</div>'
      : isPdf ? `<iframe class="om-docview" src="${esc(f.dataUrl)}" title="${esc(name)}"></iframe>`
        : `<img class="om-docimg" src="${esc(f.dataUrl)}" alt="${esc(name)}">`}`;
}

// Нижняя панель главных разделов (как у стенда: Сегодня, Выезды, Поиск, Меню).
function bottomNav(v, todayN) {
  const at = { today: 'today', trips: 'trips', search: 'search', menu: 'menu', notes: 'menu' }[v] || 'today';
  const items = [['today', 'today', 'Сегодня', todayN], ['trips', 'trips', 'Выезды'], ['search', 'search', 'Поиск'], ['menu', 'menu', 'Меню']];
  return `<nav class="om-bnav" aria-label="Разделы">${items.map(([k, icon, label, n]) => `<a class="om-btab${at === k ? ' on' : ''}" href="${href({ v: k })}" aria-current="${at === k}">${ico(icon, 22)}${n ? `<b class="om-badge">${n}</b>` : ''}<span>${label}</span></a>`).join('')}</nav>`;
}

export function mountOsmotr(host) {
  const scope = host.scope;
  document.body.dataset.page = 'osmotr';
  setActiveNav('insp-field');
  setCrumbs([{ label: 'Главная', to: '#/' }, { label: 'Осмотры (осмотрщики)', current: true }]);
  let q = host.route.query || {};
  let map = null;
  let mapKey = '';
  let savedAt = '';
  // Состояние экрана объекта: подтверждение «Осмотр закончен» (по объекту).
  const ui = { asking: false, askFor: '', filters: false, cadRow: '', contactOpen: false, take: '', takeDay: '', detachAsk: '' };
  // Оглавление инструкций — сразу: подсказки «Инструкция: …» у ОИ и позиций описи.
  instrIndex(() => { const v = q.v || 'today'; if (v === 'oi' || v === 'item' || v === 'instr') render(); });
  // Выбранные позиции описи (в одну карточку) — по описи; сменилась опись — выбор снимается.
  const sel = new Set();
  let selFor = '';
  // Раскрытые разделы ОИ — «ОИ|раздел»; адрес с &s= (прежний экран раздела) раскрывает свой.
  const opened = new Set();
  let cur = null; // объект на экране (obj, doc, oi, sec)

  const dropMap = () => { if (map) { try { map.remove(); } catch { /* уже снята */ } } map = null; mapKey = ''; };

  function render() {
    const v = q.v || 'today';
    dirty = false;
    if (q.oi && q.s) opened.add(q.oi + '|' + q.s);
    const person = session.state.person;
    const all = myObjects(person);
    const notes = notesOf(person);
    const unread = notes.filter((n) => n.unread).length;
    const todayN = all.filter((o) => o.plannedAt === isoDay() && o.state !== 'done' && !o.removed).length;
    const inObj = ['obj', 'doc', 'oi', 'sec', 'ph', 'inv', 'item'].includes(v) || (v === 'file' && q.src === 'inv');
    const o = inObj ? all.find((x) => x.id === q.id) : null;
    cur = o || null;
    if (ui.askFor !== q.id) ui.asking = false;
    if (selFor !== q.id + '|' + q.inv + '|' + (q.to || '')) { sel.clear(); selFor = q.id + '|' + q.inv + '|' + (q.to || ''); }
    const screen = v === 'trips' ? viewTrips(all, q, unread) : v === 'search' ? viewSearch(all, q) : v === 'menu' ? viewMenu(all, unread)
      : v === 'notes' ? viewNotes(notes) : v === 'obj' ? viewObj(o, q, ui) : v === 'doc' ? viewDoc(o, q)
        : v === 'oi' || v === 'sec' ? viewOi(o, q, opened, savedAt) : v === 'ph' ? viewPhoto(o, q)
          : v === 'report' ? viewReport(q, routeCame) : v === 'cad' ? viewCad(q, ui.cadRow, ui.detachAsk) : v === 'file' ? viewFile(all, q, ui) : v === 'plans' ? viewPlans(all, ui) : v === 'instr' ? viewInstr(q, () => { if ((q.v || '') === 'instr') render(); })
          : v === 'inv' ? viewInv(o, q, sel, ui.filters) : v === 'item' ? viewItem(o, q) : viewToday(all, q, unread);
    const openParcel = !!(scope.$('.om-parcel') && scope.$('.om-parcel').open);
    const asBar = session.state.role !== 'insp'
      ? `<div class="om-asbar" role="status"><span>Вы смотрите как: осмотрщик</span><a href="#/">Вернуться</a></div>` : '';
    const geoAt = o ? ((loadTask(o.typeId, o.ocId) || {}).geo || {}).at || '' : '';
    const keepMap = v === 'obj' && map && mapKey === q.id + '|' + geoAt && (q.tab || 'task') === 'task';
    const mapEl = keepMap ? map.getContainer() : null;
    // Перерисовка по событию (назначение, участок, своя правка) не сбивает ввод и прокрутку.
    const ae = document.activeElement;
    const focus = ae && ae.id && scope.root.contains(ae) ? { id: ae.id, a: ae.selectionStart, b: ae.selectionEnd } : null;
    const top0 = (scope.$('.om-app') || {}).dataset?.v === v ? (scope.$('.om-scr') || {}).scrollTop || 0 : 0;
    scope.setHTML(`<div class="om-app" data-v="${esc(v)}">${asBar}<main class="om-scr">${screen}</main>${inObj || ['report', 'cad', 'plans', 'instr', 'file'].includes(v) ? '' : bottomNav(v, todayN)}</div>`);
    if (top0) scope.$('.om-scr').scrollTop = top0;
    // Инструкция из поиска — к найденному месту.
    else if (v === 'instr' && q.id && q.b) { const h = scope.$('#om-ib-' + CSS.escape(q.b)); if (h) h.scrollIntoView({ block: 'center' }); }
    // «Без даты» с «Сегодня» — сразу к своему разделу (раздел внизу «Планов», как в приложении).
    else if (v === 'plans' && q.at === 'nodate') { const h = scope.$('#om-nodate'); if (h) h.scrollIntoView({ block: 'start' }); }
    const el = focus && document.getElementById(focus.id);
    if (el && scope.root.contains(el)) { el.focus({ preventScroll: true }); try { if (focus.a != null) el.setSelectionRange(focus.a, focus.b); } catch { /* у списка выделения нет */ } }
    // Карта той же записи переносится, а не создаётся заново (WebGL-контекстов у браузера мало).
    if (openParcel) { const d = scope.$('.om-parcel'); if (d) d.open = true; }
    const slot = scope.$('[data-map]');
    if (slot && mapEl) { slot.replaceWith(mapEl); mapEl.setAttribute('data-map', ''); }
    else { dropMap(); if (slot && o) drawMap(slot, o); }
    // «Входящие» открыты — показанное прочитано (значок «новое» у них остаётся до ухода с экрана).
    if (v === 'notes') markRead(person, notes);
    fillGeo(all.map((x) => ({ rec: loadTask(x.typeId, x.ocId) })).filter((x) => x.rec)).catch(() => {});
  }

  async function drawMap(slot, o) {
    const rec = loadTask(o.typeId, o.ocId) || {};
    if (!(rec.geo && rec.geo.extent) && o.lat == null) return; // ждёт участка по ЕНИ — перерисуется, когда придёт
    const gl = await loadMapLibre(host.ensureStyle).catch(() => null);
    if (!gl || !slot.isConnected) return;
    const m = await createMap(gl, slot, o.lat != null ? { center: [o.lon, o.lat], zoom: 16, cooperativeGestures: true } : { cooperativeGestures: true });
    if (!slot.isConnected) { m.remove(); return; }
    map = m; mapKey = o.id + '|' + ((rec.geo || {}).at || '');
    const box = rec.geo && rec.geo.extent ? ownParcelsGL(m, [rec.geo]) : null;
    if (box) m.fitBounds(box, { padding: 28, maxZoom: 18, animate: false });
    else if (o.lat != null) new gl.Marker({ color: '#1668c9' }).setLngLat([o.lon, o.lat]).addTo(m);
  }

  scope.on('submit', '[data-search]', (e, form) => {
    e.preventDefault();
    location.hash = href({ v: 'search', q: form.q.value.trim() });
  });
  scope.on('input', '[data-search] input', (e, input) => {
    clearTimeout(input._t);
    input._t = setTimeout(() => { history.replaceState(null, '', href({ v: 'search', q: input.value.trim() })); q = { v: 'search', q: input.value.trim() }; renderKeepFocus(); }, 250);
  });
  scope.on('click', '[data-copy]', (e, b) => {
    navigator.clipboard && navigator.clipboard.writeText(b.dataset.copy).then(() => { b.classList.add('done'); setTimeout(() => b.classList.remove('done'), 1200); }, () => {});
  });

  // Поле осмотра: значение — в «Результаты осмотра» сразу; первая правка переводит назначение «в работу».
  function saveField(key, value) {
    if (!cur || !q.oi) return;
    const vals = valuesOf(cur.typeId, cur.ocId, q.oi);
    const prev = getValue(vals, key);
    setValue(vals, key, value);
    if (NET_KEYS.includes(key)) {
      const ctx = oiCtx(cur, q.oi);
      const liter = ctx && ctx.oi.card === 'land' ? soleLiter(cur, ctx.rec) : '';
      if (liter) {
        const lv = valuesOf(cur.typeId, cur.ocId, liter);
        const was = getValue(lv, key);
        if (!isFilled(was) || was === prev) setValue(lv, key, value);
      }
    }
    startWork(session.state.person, cur.typeId, cur.ocId);
    saveResults();
    const d = new Date();
    savedAt = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const st = scope.$('.om-saved');
    if (st) st.textContent = 'Сохранено ' + savedAt;
  }
  scope.on('input', 'input[data-f], textarea[data-f]', (e, el) => saveField(el.dataset.f, el.value));
  // Выбор из списка может открыть или спрятать поля (тип объекта → его признаки) — раздел перерисовывается.
  scope.on('change', 'select[data-f]', (e, el) => { saveField(el.dataset.f, el.value); render(); });
  scope.on('click', '[data-ms]', (e, b) => {
    const ctx = cur && oiCtx(cur, q.oi);
    if (!ctx || ctx.ro) return;
    const v0 = getValue(ctx.values, b.dataset.ms);
    const set = new Set(Array.isArray(v0) ? v0 : v0 ? String(v0).split(/,\s*/) : []);
    if (set.has(b.dataset.opt)) set.delete(b.dataset.opt); else set.add(b.dataset.opt);
    saveField(b.dataset.ms, [...set]);
    render();
  });

  // Раздел раскрыт или свёрнут — запоминается: перерисовка после правки не сворачивает его.
  scope.on('click', '.om-acc > summary', (e, sum) => {
    const k = q.oi + '|' + sum.parentElement.dataset.sec;
    if (sum.parentElement.open) opened.delete(k); else opened.add(k);
  });
  // --- опись: выбор «в одну карточку», нерабочее, осмотрено ранее, снимки карточки, «Нет в описи», поиск ---
  const curInv = () => (cur && q.inv ? inventoryOf(session.state.person, cur.id, q.inv) : null);
  const curItem = () => {
    const inv = curInv();
    const it = inv && inv.items.find((x) => x.id === q.it);
    return it && it.own !== false && cur.state !== 'done' ? { inv, it } : null;
  };
  const marked = () => {
    const d = new Date();
    const st = scope.$('.om-saved');
    if (st) st.textContent = `Сохранено ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  scope.on('click', '[data-sel]', (e, b) => {
    e.preventDefault();
    const id = b.dataset.sel;
    if (sel.has(id)) sel.delete(id); else sel.add(id);
    render();
  });
  scope.on('click', '[data-filters]', () => { ui.filters = !ui.filters; render(); });
  scope.on('click', '[data-sel-clear]', () => { sel.clear(); render(); });
  // Выбранные — в одну карточку: карточка первой, у кого она уже есть, иначе — первой выбранной (Inventory.group).
  scope.on('click', '[data-sel-group]', () => {
    const inv = curInv(); if (!inv || cur.state === 'done') return;
    const items = inv.items.filter((x) => sel.has(x.id) && x.own !== false);
    if (items.length < 2) return;
    const lead = items.find((x) => rawMark(cur, inv, x).group) || items[0];
    addToCard(cur, inv, lead, items.filter((x) => x !== lead));
    sel.clear();
    location.hash = href({ v: 'item', id: cur.id, inv: inv.id, it: lead.id });
  });
  scope.on('click', '[data-sel-add]', () => {
    const inv = curInv(); if (!inv || cur.state === 'done') return;
    const lead = inv.items.find((x) => x.id === q.to);
    const items = inv.items.filter((x) => sel.has(x.id) && x.own !== false);
    if (!lead || !items.length) return;
    addToCard(cur, inv, lead, items);
    sel.clear();
    location.hash = href({ v: 'item', id: cur.id, inv: inv.id, it: lead.id });
  });
  scope.on('click', '[data-card-similar]', () => {
    const x = curItem(); if (!x) return;
    const members = cardOf(cur, x.inv, x.it);
    addToCard(cur, x.inv, members[0], similarOf(cur, x.inv, members));
    render(); marked();
  });
  scope.on('click', '[data-card-remove]', (e, b) => {
    const x = curItem(); if (!x) return;
    const it = x.inv.items.find((y) => y.id === b.dataset.cardRemove);
    if (!it) return;
    markSet(cur, x.inv, it, { group: '' });
    // Убрали ту, с которой открыта карточка, — открыть карточку с оставшимися.
    if (it.id === q.it) { const rest = x.inv.items.find((y) => y.id !== it.id && rawMark(cur, x.inv, y).group && rawMark(cur, x.inv, y).group === rawMark(cur, x.inv, x.it).group); location.hash = href({ v: 'item', id: cur.id, inv: x.inv.id, it: rest ? rest.id : it.id }); return; }
    render(); marked();
  });
  scope.on('click', '[data-mk-broken]', (e, b) => {
    const x = curItem(); if (!x) return;
    const it = x.inv.items.find((y) => y.id === b.dataset.mkBroken);
    if (!it || !photosOfCard(cur, x.inv, cardOf(cur, x.inv, it)).length) return;
    markSet(cur, x.inv, it, { cond: rawMark(cur, x.inv, it).cond === BROKEN ? '' : BROKEN, state: 'seen' });
    render(); marked();
  });
  scope.on('click', '[data-mk-earlier]', (e, b) => {
    const x = curItem(); if (!x) return;
    const it = x.inv.items.find((y) => y.id === b.dataset.mkEarlier);
    if (!it) return;
    const m = rawMark(cur, x.inv, it);
    const on = !(m.earlier || m.state === 'seen');
    markSet(cur, x.inv, it, { earlier: on, state: on ? 'seen' : '' });
    render(); marked();
  });
  scope.on('input', '[data-mk-comment]', (e, el) => {
    const x = curItem(); if (!x) return;
    markSet(cur, x.inv, cardOf(cur, x.inv, x.it)[0], { comment: el.value });
    marked();
  });
  // Снимки — карточке: засчитываются всем её позициям, позиции — осмотрены.
  scope.on('change', '[data-mk-shoot]', (e, input) => {
    const x = curItem(); if (!x) return;
    const person = session.state.person;
    const a = myAssignsOn(person, cur.typeId, cur.ocId)[0];
    const members = cardOf(cur, x.inv, x.it);
    [...(input.files || [])].forEach((f) => {
      if (x.inv.kind === 'mech') addResultPhoto(cur.typeId, cur.ocId, f, { oiId: x.inv.oiId, cat: members[0].name, units: members.map((u) => u.id), by: person, at: new Date().toISOString() });
      else addItemPhoto(x.inv.id, members[0].id, f, { by: person, assignId: a ? a.id : '' });
    });
    input.value = '';
    members.forEach((u) => { if (rawMark(cur, x.inv, u).state !== 'seen') markSet(cur, x.inv, u, { state: 'seen' }); });
    startWork(person, cur.typeId, cur.ocId);
    saveResults();
    render(); marked();
  });
  scope.on('submit', '[data-extra]', (e, form) => {
    e.preventDefault();
    if (!cur || !form.name.value.trim()) return;
    const person = session.state.person;
    const a = myAssignsOn(person, cur.typeId, cur.ocId)[0];
    addExtra(q.inv, { name: form.name.value, comment: form.comment.value.trim() }, { by: person, assignId: a ? a.id : '' });
    startWork(person, cur.typeId, cur.ocId);
    render();
  });
  scope.on('input', '[data-invnum]', (e, input) => {
    clearTimeout(input._t);
    input._t = setTimeout(() => { q = { ...q, [input.dataset.invnum]: input.value.replace(/\D/g, '') }; history.replaceState(null, '', href(q)); render(); }, 400);
  });
  scope.on('change', '[data-invsort]', (e, el) => { location.hash = href({ ...q, sort: el.value }); });
  scope.on('input', '[data-invq]', (e, input) => {
    clearTimeout(input._t);
    input._t = setTimeout(() => { q = { ...q, q: input.value.trim() }; history.replaceState(null, '', href(q)); render(); }, 250);
  });

  // --- отчёт дня ---
  scope.on('change', '[data-morning] input[name=noOdometer]', (e, cb) => { const f = cb.form.odometer; f.disabled = cb.checked; if (cb.checked) f.value = ''; });
  scope.on('submit', '[data-morning]', (e, form) => {
    e.preventDefault();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(q.date || '') ? q.date : isoDay();
    const r = saveReport({ person: session.state.person, date, kind: 'morning', odometer: form.odometer.value.trim(), noOdometer: form.noOdometer.checked });
    if (r) changed();
    render();
  });
  scope.on('submit', '[data-evening]', (e, form) => {
    e.preventDefault();
    const person = session.state.person;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(q.date || '') ? q.date : isoDay();
    const trips = dayTripsOf(person, date);
    let bad = false;
    const doneIds = [];
    const partial = [];
    const failed = [];
    trips.forEach((t) => {
      const box = form.querySelector(`[data-trip="${CSS.escape(t.assignId)}"]`);
      const r = (box.querySelector(`input[name="r_${CSS.escape(t.assignId)}"]:checked`) || {}).value || '';
      const why = r === 'partial' ? form[`p_${t.assignId}`].value.trim() : r === 'failed' ? (box.querySelector(`input[name="f_${CSS.escape(t.assignId)}"]:checked`) || {}).value || '' : 'ok';
      box.querySelector('.om-trip-err').hidden = !!why;
      if (!why) bad = true;
      if (r === 'done') doneIds.push(t.assignId);
      if (r === 'partial') partial.push({ assignId: t.assignId, reason: why });
      if (r === 'failed') failed.push({ t, reason: why });
    });
    if (bad) { const x = form.querySelector('.om-trip-err:not([hidden])'); if (x) x.closest('fieldset').scrollIntoView({ block: 'center' }); return; }
    failed.forEach(({ t, reason }) => outcomeOf(t, reason, ''));
    const km = form.km.value.trim();
    const r = saveReport({ person, date, kind: 'evening', km, kmByRoute: !!km && km === form.route.value, done: doneIds, partial, note: form.note.value.trim() });
    if (r) changed();
    render();
  });

  // --- запросы документов из Кадастра ---
  scope.on('click', '[data-cad-open]', (e, b) => { ui.cadRow = ui.cadRow === b.dataset.cadOpen ? '' : b.dataset.cadOpen; dirty = false; render(); });
  // Выбранный, но не отправленный файл — карточкой с «Убрать» (до отправки ответа).
  scope.on('change', '[data-cad-file]', (e, input) => {
    const box = input.closest('form').querySelector('.om-cad-pick');
    const f = input.files && input.files[0];
    if (!box) return;
    box.hidden = !f;
    // Просмотр до отправки — сам выбранный файл в новой вкладке (снимок или PDF — встроенный просмотр браузера).
    if (box.dataset.url) { URL.revokeObjectURL(box.dataset.url); delete box.dataset.url; }
    const url = f ? URL.createObjectURL(f) : '';
    if (url) box.dataset.url = url;
    const open = `href="${esc(url)}" target="_blank" rel="noopener"`;
    box.innerHTML = f ? `<div class="om-file om-file-new"><a class="om-file-prev" ${open} aria-label="Открыть: ${esc(f.name)}">${/pdf/i.test(f.type) ? '<span class="om-file-pdf" aria-hidden="true">PDF</span>' : `<img src="${esc(url)}" alt="">`}</a>
      <a class="om-file-tx" ${open}><b>${esc(f.name)}</b><small>${esc(fileMeta({ name: f.name, mime: f.type, size: f.size }))} · будет отправлен с ответом</small></a>
      <span class="om-file-act"><a class="om-btn om-btn-sm" ${open}>${ico('photo', 16)}Открыть</a><button type="button" class="om-btn om-btn-sm om-btn-ghost-danger" data-cad-file-clear>${ico('trash', 16)}Убрать</button></span></div>` : '';
  });
  scope.on('click', '[data-cad-file-clear]', (e, b) => {
    const form = b.closest('form');
    form.file.value = '';
    const box = form.querySelector('.om-cad-pick');
    if (box.dataset.url) { URL.revokeObjectURL(box.dataset.url); delete box.dataset.url; }
    box.hidden = true; box.innerHTML = '';
  });
  // Открепить: первый щелчок — подтверждение в строке; второй — само действие.
  scope.on('click', '[data-detach-ask]', (e, b) => { ui.detachAsk = b.dataset.detachAsk; dirty = false; render(); });
  scope.on('click', '[data-cad-detach]', (e, b) => {
    const [reqId, rowId] = b.dataset.cadDetach.split('|');
    const row = detachCadFile(reqId, rowId);
    ui.detachAsk = '';
    if (!row) { host.toast('Скан принят ЦОД — открепить нельзя', 'warn'); render(); return; }
    host.toast('Скан откреплён — строка снова ждёт ответа', 'ok');
    if ((q.v || '') === 'file') { location.hash = href({ v: 'cad', r: reqId }); return; }
    render();
  });
  scope.on('click', '[data-inv-ph-del]', (e, b) => {
    const o = cur;
    const inv = o && inventoryOf(session.state.person, o.id, q.inv);
    const it = inv && inv.items.find((x) => x.id === q.it);
    if (!it) return;
    const ph = photosOfCard(o, inv, cardOf(o, inv, it)).find((x) => x.id === b.dataset.invPhDel);
    if (!ph) return;
    if (inv.kind === 'mech') removePhoto(o.typeId, o.ocId, ph.id);
    else removeItemPhoto(inv.id, ph.itemId, ph.id, { by: session.state.person });
    saveResults();
    ui.detachAsk = '';
    host.toast('Снимок удалён', 'ok');
    location.hash = href({ v: 'item', id: o.id, inv: inv.id, it: it.id });
  });
  scope.on('submit', '[data-cad]', async (e, form) => {
    e.preventDefault();
    const err = form.querySelector('[data-cad-err]');
    const result = (form.querySelector('input[name=result]:checked') || {}).value || '';
    const file = form.file.files && form.file.files[0];
    const say = (t) => { err.textContent = t; err.hidden = !t; };
    if (!result) return say('Выберите ответ: получен, нет или отказ');
    if (result === 'got' && !file && form.dataset.hasFile !== '1') return say('Нужен скан или PDF документа');
    say('');
    const row = await answerCadRow(form.dataset.cad, form.dataset.row, { result, scanDate: form.scanDate.value, answer: form.answer.value.trim(), file: file || null, fileName: file ? file.name : '' });
    if (!row) return say('Строка запроса не найдена');
    // Следующая ждущая строка раскрывается сама — сотню ответов подряд не листать.
    ui.cadRow = form.dataset.next || '';
    dirty = false;
    changed();
    render();
    const nx = ui.cadRow && scope.$(`.om-cadline[data-row="${CSS.escape(ui.cadRow)}"]`);
    if (nx) nx.scrollIntoView({ block: 'nearest' });
  });

  // --- исход выезда ---
  const mine = () => myAssignsOn(session.state.person, cur.typeId, cur.ocId);
  scope.on('click', '[data-finish-ask]', () => { ui.asking = true; ui.askFor = q.id; render(); });
  scope.on('click', '[data-finish-cancel]', () => { ui.asking = false; render(); });
  scope.on('click', '[data-finish]', (e, b) => {
    if (!cur) return;
    finishWork(session.state.person, cur.typeId, cur.ocId, true, { incomplete: b.dataset.finish === 'incomplete' });
    ui.asking = false;
    changed();
  });
  scope.on('click', '[data-reopen]', () => { if (cur) { finishWork(session.state.person, cur.typeId, cur.ocId, false); changed(); } });
  scope.on('submit', '[data-move]', (e, form) => {
    e.preventDefault();
    if (!cur) return;
    mine().filter(isLive).forEach((a) => requestMove(a.id, { date: form.date.value, reason: form.reason.value, note: form.note.value.trim() }));
  });
  // --- инструкции: переход к разделу ---
  scope.on('click', '[data-instr-go]', (e, b) => { const h = scope.$('#om-ib-' + b.dataset.instrGo); if (h) h.scrollIntoView({ block: 'start', behavior: 'smooth' }); });

  // --- планы: взять на день ---
  scope.on('click', '[data-take]', (e, b) => { ui.take = ui.take === b.dataset.take ? '' : b.dataset.take; ui.takeDay = isoDay(); render(); });
  scope.on('change', '[data-take-form] input[name=day]', (e, r) => { ui.takeDay = r.value; render(); });
  scope.on('submit', '[data-take-form]', (e, form) => {
    e.preventDefault();
    const o = myObjects(session.state.person).find((x) => x.id === form.dataset.takeForm);
    const day = ui.takeDay || isoDay();
    if (!o) return;
    myAssignsOn(session.state.person, o.typeId, o.ocId).filter((a) => isLive(a) && !a.plannedAt).forEach((a) => takeForDay(a.id, day));
    ui.take = '';
    changed();
    render();
    host.toast(`Взято на ${shortDate(day)}`, 'ok');
  });

  // --- контакты на месте ---
  scope.on('submit', '[data-ct-add]', (e, form) => {
    e.preventDefault();
    if (!cur) return;
    const v = (k) => form[k].value.trim();
    const err = form.querySelector('[data-ct-err]');
    const say = (t, f) => { err.textContent = t; err.hidden = !t; if (f) form[f].focus(); };
    if (!v('name') && !v('phone')) return say('Укажите ФИО или телефон', 'name');
    if (v('phone') && telOf(v('phone')).replace(/\D/g, '').length < 6) return say('Телефон — не меньше шести цифр', 'phone');
    if (v('email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('email'))) return say('Почта указана с ошибкой', 'email');
    const res = resultsOf(cur.typeId, cur.ocId);
    const had = (res.contacts || []).filter((c) => !c.deleted);
    if (v('phone') && [...(cur.contacts || []), ...had].some((c) => telOf(c.phone) && telOf(c.phone) === telOf(v('phone')))) return say('Контакт с этим телефоном уже есть', 'phone');
    (res.contacts = res.contacts || []).push({ id: 'ct' + Date.now().toString(36), name: v('name'), role: v('role'), phone: v('phone'), email: v('email'), note: v('note'), by: session.state.person, at: new Date().toISOString() });
    saveResults();
    ui.contactOpen = false;
    dirty = false;
    changed();
    render();
  });
  scope.on('click', '[data-ct-del]', (e, b) => {
    if (!cur) return;
    const c = (resultsOf(cur.typeId, cur.ocId).contacts || []).find((x) => x.id === b.dataset.ctDel);
    if (!c) return;
    Object.assign(c, { deleted: true, deletedBy: session.state.person, deletedAt: new Date().toISOString() });
    saveResults();
    changed();
    render();
  });
  // toggle не всплывает — раскрытие формы ловится по щелчку заголовка.
  scope.on('click', '.om-ct-add > summary', (e, sm) => { ui.contactOpen = !sm.parentElement.open; });
  // Телефонная книга — Contact Picker API (Chrome на Android): один человек, без доступа ко всей книге.
  scope.on('click', '[data-ct-pick]', async (e, b) => {
    const form = b.closest('form');
    try {
      const [c] = await navigator.contacts.select(['name', 'tel', 'email'], { multiple: false });
      if (!c) return;
      if (c.name && c.name[0]) form.name.value = c.name[0];
      if (c.tel && c.tel[0]) form.phone.value = c.tel[0];
      if (c.email && c.email[0]) form.email.value = c.email[0];
    } catch (err) { /* отказ или закрыто — поля как были */ }
  });

  scope.on('submit', '[data-outcome]', (e, form) => {
    e.preventDefault();
    if (!cur) return;
    outcomeOf(cur, (form.querySelector('[name=reason]:checked') || {}).value || OUTCOMES[0], form.note.value.trim());
  });

  scope.on('submit', '[data-found]', (e, form) => {
    e.preventDefault();
    if (!cur) return;
    const f = addFoundOi(cur.typeId, cur.ocId, { cat: form.cat.value, name: form.name.value, by: session.state.person });
    startWork(session.state.person, cur.typeId, cur.ocId);
    location.hash = href({ v: 'oi', id: cur.id, oi: f.id });
  });
  // Снимки выявленного не пропадают — остаются у объекта без привязки (tasks.js, removeFoundOi).
  scope.on('click', '[data-found-del]', (e, b) => {
    if (!cur) return;
    removeFoundOi(cur.typeId, cur.ocId, b.dataset.foundDel);
    location.hash = href({ v: 'obj', id: cur.id });
  });

  // Съёмка: снимки — к этому ОИ, в выбранную категорию.
  scope.on('change', '[data-shoot]', (e, input) => {
    if (!cur || !q.oi) return;
    const files = [...(input.files || [])];
    const err = files.map((f) => addPhoto(cur.typeId, cur.ocId, f, { oiId: q.oi, cat: input.dataset.shoot }).error).find(Boolean);
    input.value = '';
    render();
    if (err) { const st = scope.$('.om-shoot'); if (st) st.insertAdjacentHTML('afterbegin', `<p class="om-warn" role="alert">${esc(err)}</p>`); }
  });
  scope.on('change', '[data-ph-cat]', (e, el) => { if (cur) { movePhoto(cur.typeId, cur.ocId, el.dataset.phCat, { cat: el.value }); render(); } });
  scope.on('click', '[data-ph-del]', (e, b) => {
    if (!cur) return;
    removePhoto(cur.typeId, cur.ocId, b.dataset.phDel);
    location.hash = href({ v: 'oi', id: cur.id, oi: q.oi, tab: 'photo' });
  });

  function renderKeepFocus() {
    const at = document.activeElement && document.activeElement.selectionStart;
    render();
    const inp = scope.$('[data-search] input');
    if (inp) { inp.focus(); if (at != null) inp.setSelectionRange(at, at); }
  }

  // Регионал назначил, снял, вернул; участок подтянулся — перерисовать.
  // Пробег по дорогам пришёл — подсказка и пустое поле пробега, без перерисовки (введённое не теряется).
  function routeCame(km) {
    if ((q.v || '') !== 'report') return;
    const h = scope.$('#om-km-h'); if (h) h.textContent = kmHint(km);
    const f = scope.$('[data-evening]'); if (!f) return;
    f.route.value = kmText(km);
    if (!f.km.value && !f.km.disabled) f.km.value = kmText(km);
  }
  // Форма отчёта или ответа на запрос заполняется — фоновая перерисовка ждёт (иначе введённое пропадёт).
  let dirty = false;
  scope.on('input', '[data-morning], [data-evening], [data-cad], [data-ct-add]', () => { dirty = true; });
  scope.on('change', '[data-morning], [data-evening], [data-cad]', () => { dirty = true; });
  let t = 0;
  const onChanged = () => { clearTimeout(t); t = setTimeout(() => { const v = q.v || 'today'; if (!(dirty && (v === 'report' || v === 'cad' || v === 'obj'))) render(); }, 300); };
  window.addEventListener('inside:inspections', onChanged);
  const unsub = session.subscribe(onChanged);
  const offGeo = onGeoDone(onChanged);

  render();
  return {
    onRoute(route) { const prevV = q.v; q = route.query || {}; ui.detachAsk = ''; render(); if ((q.v !== prevV || q.v !== 'search') && !(q.v === 'plans' && q.at) && !(q.v === 'instr' && q.b)) scope.root.querySelector('.om-scr')?.scrollTo(0, 0); },
    destroy() {
      dropMap();
      clearTimeout(t);
      window.removeEventListener('inside:inspections', onChanged);
      if (typeof unsub === 'function') unsub();
      offGeo();
    },
  };
}
