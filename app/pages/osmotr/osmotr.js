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
// осмотра), sec (&id, &oi, &s — раздел: поля осмотра), app —
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
import { resultsOf, valuesOf, saveResults } from '../../kernel/inspectionResults.js';
import { startWork } from '../../kernel/inspections.js';
import { getValue, setValue, sectionProgress } from '../../kernel/fieldSchema.js';
import { loadTask, ownOis, photoCatsOf, addPhoto, removePhoto, movePhoto, foundOi, addFoundOi, removeFoundOi, foundCat, FOUND_CATS } from '../inspection/tasks.js';
import { sections, setNetsRec, mismatchHint } from '../inspection/form.js';
import { connectBridge } from './bridge.js';
import { myObjects, docsOf, findObject, fillGeo, onGeoDone, isoDay } from './data.js';
import { notesOf, markRead } from './feed.js';

export const OSMOTR_SRC = './app/vendor/osmotr/index.html';
// Есть ли сборка приложения — пишет tools/osmotr/sync_pwa.py; файл в репозитории всегда.
const OSMOTR_INFO = './app/vendor/osmotr.json';
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
const routeUrl = (o) => (o.lat != null ? `https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lon}`
  : o.address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(o.address)}` : '');

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
  route: '<path d="M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 15V9a4 4 0 0 1 4-4h4M18 9v6a4 4 0 0 1-4 4h-4"/>',
  copy: '<path d="M9 9h11v11H9zM5 15H4V4h11v1"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5zM3 13l9 5 9-5"/>',
  alert: '<path d="M12 4 2 20h20zM12 10v4M12 17h.01"/>',
  app: '<path d="M7 2h10v20H7zM11 18h2"/>',
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
    ${o.institution && o.address ? `<span class="om-obj-inst">${esc(o.institution)}</span>` : ''}
    ${meta ? `<span class="om-obj-meta">${meta}</span>` : ''}
  </a>`;
}

// --- экраны -------------------------------------------------------------------------------------
function viewToday(all, q, unread) {
  // Отбор по типам — только там, где видны сами объекты (16.11.2026), на «Сегодня» его нет.
  const list = all;
  const today = isoDay();
  const open = list.filter((o) => o.state !== 'done' && !o.removed);
  const todays = open.filter((o) => o.plannedAt === today);
  const next = todays[0] || open[0];
  const back2 = open.filter((o) => (o.returned || []).length);
  const late = open.filter((o) => o.plannedAt && o.plannedAt < today);
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
          ${routeUrl(next) ? `<a class="om-btn" href="${esc(routeUrl(next))}" target="_blank" rel="noopener">Маршрут</a>` : ''}
          <a class="om-btn om-btn-primary" href="${href({ v: 'obj', id: next.id })}">Открыть</a>
        </span></div>`
        : '<div class="om-next om-next-none"><span class="om-cap">Следующий</span><span>Назначенных объектов нет</span></div>'}
    </section>
    ${urgent ? `<h2 class="om-cap om-sec">Срочно</h2><div class="om-group">${urgent}</div>` : ''}
    <h2 class="om-cap om-sec">Мои задачи</h2>
    <div class="om-group">
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
    </div>
    <h2 class="om-cap om-sec">К осмотру</h2>
    <div class="om-group">${KINDS.map((k) => row(href({ v: 'trips', f: k.key }), k.key, k.label, byKind(all, k.key).filter((o) => o.state !== 'done' && !o.removed).length, { real: 'blue', vehicle: 'violet', inv: 'amber' }[k.key])).join('')}</div>
    <h2 class="om-cap om-sec">Приложение</h2>
    <div class="om-group">${row(href({ v: 'app' }), 'app', 'Приложение «Осмотр»')}</div>`;
}

function viewNotes(items) {
  return `${top('Входящие')}
    <div class="om-list">${items.length ? items.map((n) => `<a class="om-card om-note${n.unread ? ' new' : ''}" href="${n.objectId ? href({ v: 'obj', id: n.objectId }) : href({ v: 'notes' })}">
      <span class="om-note-head"><b>${esc(n.label)}</b><time>${esc(shortDate(String(n.at).slice(0, 10)))}</time></span>
      <span>${esc(n.text)}</span></a>`).join('') : '<div class="om-card om-empty">Уведомлений за две недели нет</div>'}</div>`;
}

// Объект: шапка, назначение, место (карта, маршрут, контакт), документы для выезда, состав.
function viewObj(o, q) {
  if (!o) return `${back(href({ v: 'trips' }), 'Выезды')}<div class="om-card om-empty">Объект не назначен или снят</div>`;
  const tab = q.tab === 'docs' ? 'docs' : 'task';
  const rec = loadTask(o.typeId, o.ocId) || {};
  const head = `${back(href({ v: 'trips', f: q.f }), 'Выезды')}
    <p class="om-kicker">${esc(o.typeLabel)}</p>
    <h1 class="om-title">${esc(o.title)}</h1>
    <div class="om-idrow">${o.eni ? `<button type="button" class="om-eni" data-copy="${esc(o.eni)}" title="Скопировать ЕНИ">${esc(fmtEni(o.eni) || o.eni)} ${ico('copy', 14)}</button>` : ''}${chip(o)}</div>`;
  const body = tab === 'docs' ? docsBlock(o) : taskBlock(o, rec);
  const tabs = [['task', 'task', 'Задача'], ['docs', 'docs', 'Документы']];
  return `${head}${body}
    <nav class="om-bnav om-objtabs" aria-label="Разделы объекта">${tabs.map(([k, icon, label]) => `<a class="om-btab${tab === k ? ' on' : ''}" href="${href({ v: 'obj', id: o.id, tab: k === 'task' ? '' : k, f: q.f })}" aria-current="${tab === k}">${ico(icon, 22)}<span>${label}${k === 'docs' && o.docs.length ? ` <b>${o.docs.length}</b>` : ''}</span></a>`).join('')}</nav>`;
}

function taskBlock(o, rec) {
  const facts = [
    o.address && o.institution ? ['Учреждение', o.institution] : null,
    ...(o.facts || []).map((f) => [f.label, f.value]),
    o.plannedAt ? ['Выезд', shortDate(o.plannedAt)] : null,
    o.deadline ? ['Срок', shortDate(o.deadline)] : null,
    o.by ? ['Назначил', o.by] : null,
  ].filter(Boolean);
  const returned = (o.returned || []).map((r) => `<p class="om-warn"><b>На доосмотр</b>${r.reason ? ' — ' + esc(r.reason) : ''}</p>`).join('');
  const contacts = (o.contacts || []).slice(0, 4).map((c) => `<div class="om-contact"><span class="om-row-tx"><b>${esc(c.name || 'Контакт')}</b>${c.role ? `<small>${esc(c.role)}</small>` : ''}</span>
    ${c.phone ? `<a class="om-icon om-icon-sm" href="tel:${esc(c.phone.replace(/[^\d+]/g, ''))}" aria-label="Позвонить: ${esc(c.phone)}" title="${esc(c.phone)}">${ico('phone', 18)}</a>` : ''}</div>`).join('');
  const r = routeUrl(o);
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
      <div class="om-place-act">${r ? `<a class="om-btn om-btn-primary" href="${esc(r)}" target="_blank" rel="noopener">${ico('route', 18)}Маршрут</a>` : ''}</div>
      ${contacts ? `<div class="om-contacts"><span class="om-cap">На месте</span>${contacts}</div>` : ''}
    </section>
    ${o.docs.length ? `<a class="om-card om-row om-doclink" href="${href({ v: 'obj', id: o.id, tab: 'docs' })}"><span class="om-row-ico om-t-blue">${ico('docs')}</span><span class="om-row-tx"><b>Документы для выезда</b><small>${esc(o.docs.slice(0, 3).map((d) => d.type || d.name).join(', '))}${o.docs.length > 3 ? '…' : ''}</small></span><b class="om-n">${o.docs.length}</b>${ico('chev', 18)}</a>` : ''}
    ${(o.ois || []).length ? `<section class="om-card om-comp"><h2 class="om-card-h">Состав объекта</h2>${o.ois.map((x) => oiRow(o, x, facade[x.id])).join('')}</section>` : ''}
    ${foundBlock(o)}
    ${(o.inventories || []).length ? `<section class="om-card om-comp"><h2 class="om-card-h">Описи</h2>${o.inventories.map((x) => `<div class="om-oi"><span class="om-sq om-t-amber">${ico('inv', 18)}</span><span class="om-row-tx"><b>${esc(x.title)}</b><small>позиций: ${x.count}</small></span></div>`).join('')}</section>` : ''}`;
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
// Поля — схема осмотра макета (pages/inspection/form.js, sections): разделы по виду ОИ, перечни и подписи из
// карточек, рядом — значение в карточке (решения 15–16.10.2026; эталон полей — макет, пользователь
// 16.11.2026: «Эталон по полям - наш макет… В стенде есть ошибки»). Значения — в «Результаты осмотра»
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
  setNetsRec(rec);
  // Значения ОИ читаются без создания (assets[oiId]) — пустой набор создаёт первая правка (saveField).
  const r = resultsOf(o.typeId, o.ocId);
  const values = (r.assets || {})[oiId] || {};
  const photos = (r.photos || []).filter((p) => p.oiId === oiId && !p.deleted).length;
  // Закончен — только просмотр; ОИ, возвращённый на доосмотр, снова правится.
  const ro = o.state === 'done' && row.review !== 'returned';
  return { rec, oi, row, values, photos, ro, secs: sections(o.typeId, oi).filter((s) => s.fields.length) };
}
const visibleFields = (s, values) => s.fields.filter((f) => !f.visible || f.visible(values));
function progressOf(ctx) {
  return ctx.secs.map((s) => sectionProgress(s, ctx.values))
    .reduce((a, p) => ({ total: a.total + p.total, filled: a.filled + p.filled, requiredLeft: a.requiredLeft + p.requiredLeft }), { total: 0, filled: 0, requiredLeft: 0 });
}
const progressText = (p) => `заполнено ${p.filled} из ${p.total}${p.requiredLeft ? ` · обязательных осталось ${p.requiredLeft}` : ''}`;
const shown = (v) => (Array.isArray(v) ? v.filter(Boolean).join(', ') : String(v == null ? '' : v).trim());

function viewOi(o, q) {
  const ctx = o && oiCtx(o, q.oi);
  if (!ctx) return `${back(o ? href({ v: 'obj', id: o.id }) : href({ v: 'trips' }), o ? o.title : 'Выезды')}<div class="om-card om-empty">Объект имущества не назначен</div>`;
  const h = oiHead(ctx.row, 'om-sq-lg');
  const p = progressOf(ctx);
  const returned = (o.returned || []).filter((r) => r.oiIds.includes(ctx.row.id))
    .map((r) => `<p class="om-warn"><b>На доосмотр</b>${r.reason ? ' — ' + esc(r.reason) : ''}</p>`).join('');
  // Комментарий — не разделом, а полем прямо под разделами (пользователь 16.11.2026: «В комментарии не
  // обязательно проваливаться. Выносим их к блокам 01 02 03 на уровень литеры»).
  const note = ctx.secs.find((s) => s.key === 'comments');
  const rows = ctx.secs.filter((s) => s !== note).map((s, i) => {
    const sp = sectionProgress(s, ctx.values);
    const vals = visibleFields(s, ctx.values).map((f) => shown(getValue(ctx.values, f.path || f.key))).filter(Boolean);
    const tone = sp.requiredLeft ? 'om-t-amber' : sp.filled ? 'om-t-teal' : 'om-t-blue';
    return `<a class="om-row om-secrow" href="${href({ v: 'sec', id: o.id, oi: ctx.row.id, s: s.key })}">
      <span class="om-sq om-sq-sm ${tone}">${String(i + 1).padStart(2, '0')}</span>
      <span class="om-row-tx"><b>${esc(s.title)}</b><small>${esc(vals.length ? vals.join(', ') : 'не заполнено')}</small>${sp.requiredLeft ? `<small class="om-prog-req">обязательных осталось ${sp.requiredLeft}</small>` : ''}</span>${ico('chev', 18)}</a>`;
  }).join('');
  const chipTone = p.requiredLeft ? 'om-t-amber' : p.filled === p.total ? 'om-t-green' : 'om-t-blue';
  return `${back(href({ v: 'obj', id: o.id }), o.title)}
    <div class="om-oihead">${h.sq}<div class="om-row-tx"><h1 class="om-title om-title-oi">${esc(h.name)}</h1>${h.sub ? `<small>${esc(h.sub)}</small>` : ''}</div></div>
    <div class="om-idrow">${p.total ? `<span class="om-chip ${chipTone}" title="${esc(progressText(p))}">заполнено ${p.filled} из ${p.total}</span>` : ''}${ctx.ro ? '<span class="om-muted">Осмотр закончен — только просмотр</span>' : ''}</div>
    ${returned}
    ${q.tab === 'photo' ? photosBlock(o, ctx, q) : `${rows ? `<div class="om-group">${rows}</div>` : '<div class="om-card om-empty">Полей осмотра у этого объекта нет — только снимки</div>'}
      ${note ? `<div class="om-group om-form om-note-card">${note.fields.map((f) => fieldHTML(f, ctx)).join('')}<span class="om-saved om-saved-in" role="status" aria-live="polite"></span></div>` : ''}`}
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

// Раздел: подпись — над полем (на узком экране длинные значения перечней не обрезаются), под полем —
// значение в карточке или «РАСХОДИТСЯ». Сохранение сразу; строка «Сохранено» — что правка дошла.
function viewSec(o, q, savedAt) {
  const ctx = o && oiCtx(o, q.oi);
  // «Далее» — по разделам экрана ОИ; комментарий — на самом экране ОИ, не разделом.
  const secs = ctx ? ctx.secs.filter((s) => s.key !== 'comments') : [];
  const i = secs.findIndex((s) => s.key === q.s);
  if (i < 0) return `${back(o ? href({ v: 'obj', id: o.id }) : href({ v: 'trips' }), o ? o.title : 'Выезды')}<div class="om-card om-empty">Раздела нет</div>`;
  const s = secs[i];
  const next = secs[i + 1];
  const h = oiHead(ctx.row);
  const who = h.letter ? `Литера ${h.letter} · ${h.name}` : h.name;
  return `${back(href({ v: 'oi', id: o.id, oi: ctx.row.id }), who)}
    <h1 class="om-title om-title-sm om-sec-title">${esc(s.title)}</h1>
    <p class="om-sec-sub"><span>${esc(who)}</span><span class="om-saved" role="status" aria-live="polite">${savedAt ? 'Сохранено ' + esc(savedAt) : ''}</span></p>
    ${ctx.ro ? '<p class="om-warn">Осмотр закончен — поля только для просмотра</p>' : ''}
    <div class="om-group om-form">${visibleFields(s, ctx.values).map((f) => fieldHTML(f, ctx)).join('')}</div>
    <div class="om-sec-act">
      ${next ? `<a class="om-btn om-btn-next" href="${href({ v: 'sec', id: o.id, oi: ctx.row.id, s: next.key })}"><span><small>Далее</small>${esc(next.title)}</span>${ico('chev', 18)}</a>` : ''}
      <a class="om-btn om-btn-primary" href="${href({ v: 'oi', id: o.id, oi: ctx.row.id })}">Готово</a>
    </div>`;
}

const fid = (key) => 'om-f-' + String(key).replace(/[^\w-]/g, '_');
function hintOf(f, ctx) {
  const text = mismatchHint(f, ctx.values, ctx.oi, { photos: ctx.photos });
  const v = getValue(ctx.values, f.path || f.key);
  return { text, diff: /^РАСХОДИТСЯ/.test(text), note: (f.optNotes && v && f.optNotes[v]) || f.note || '' };
}
function hintHTML(f, ctx) {
  const h = hintOf(f, ctx);
  return `<p class="om-hint${h.diff ? ' om-hint-diff' : ''}" id="${fid(f.key)}-h">${esc(h.text)}</p>${h.note ? `<p class="om-hint om-hint-note">${esc(h.note)}</p>` : ''}`;
}
function fieldHTML(f, ctx) {
  const key = f.path || f.key;
  const v = getValue(ctx.values, key);
  const id = fid(f.key);
  const dis = ctx.ro ? ' disabled' : '';
  const req = f.req ? '<i class="om-req" title="Обязательное поле"> *</i>' : '';
  if (f.opts && f.multi) {
    const set = new Set(Array.isArray(v) ? v : v ? String(v).split(/,\s*/) : []);
    return `<div class="om-field"><span class="om-flabel" id="${id}-l">${esc(f.label)}${req}</span>
      <div class="om-ms" role="group" aria-labelledby="${id}-l" aria-describedby="${id}-h">${f.opts.map((x) => `<button type="button" class="om-opt" data-ms="${esc(key)}" data-opt="${esc(x)}" aria-pressed="${set.has(x)}"${dis}>${esc(x)}</button>`).join('')}</div>
      ${hintHTML(f, ctx)}</div>`;
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
  return `<div class="om-field"><label class="om-flabel" for="${id}">${esc(f.label)}${req}</label>${ctl}${hintHTML(f, ctx)}</div>`;
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
  let disconnect = null;
  let map = null;
  let mapKey = '';
  let savedAt = '';
  let cur = null; // объект на экране (obj, doc, oi, sec)

  const dropMap = () => { if (map) { try { map.remove(); } catch { /* уже снята */ } } map = null; mapKey = ''; };

  function render() {
    const v = q.v || 'today';
    if (v === 'app') return renderApp();
    if (disconnect) { disconnect(); disconnect = null; }
    const person = session.state.person;
    const all = myObjects(person);
    const notes = notesOf(person);
    const unread = notes.filter((n) => n.unread).length;
    const todayN = all.filter((o) => o.plannedAt === isoDay() && o.state !== 'done' && !o.removed).length;
    const inObj = ['obj', 'doc', 'oi', 'sec', 'ph'].includes(v);
    const o = inObj ? all.find((x) => x.id === q.id) : null;
    cur = o || null;
    const screen = v === 'trips' ? viewTrips(all, q, unread) : v === 'search' ? viewSearch(all, q) : v === 'menu' ? viewMenu(all, unread)
      : v === 'notes' ? viewNotes(notes) : v === 'obj' ? viewObj(o, q) : v === 'doc' ? viewDoc(o, q)
        : v === 'oi' ? viewOi(o, q) : v === 'sec' ? viewSec(o, q, savedAt) : v === 'ph' ? viewPhoto(o, q) : viewToday(all, q, unread);
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
    scope.setHTML(`<div class="om-app" data-v="${esc(v)}">${asBar}<main class="om-scr">${screen}</main>${inObj ? '' : bottomNav(v, todayN)}</div>`);
    if (top0) scope.$('.om-scr').scrollTop = top0;
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

  // Приложение «Осмотр» в рамке — пока перенос не закончен (этапы 2–3).
  function renderApp() {
    dropMap();
    scope.setHTML(`<div class="om-app om-app-frame" data-v="app"><div class="om-frame-bar">${back(href({ v: 'menu' }), 'Меню')}</div><div class="om-page"></div></div>`);
    const page = scope.$('.om-page');
    fetch(OSMOTR_INFO, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : {}), () => ({}))
      .then((info) => {
        if (!page.isConnected) return;
        page.innerHTML = info && info.present
          ? `<iframe class="om-frame" src="${OSMOTR_SRC}" aria-label="Приложение «Осмотр»" allow="camera; geolocation; microphone; clipboard-write"></iframe>`
          : '<div class="om-none"><b>Приложение «Осмотр» не подключено к макету</b><span>Нет сборки приложения в app/vendor/osmotr.</span></div>';
        const frame = page.querySelector('.om-frame');
        if (frame) disconnect = connectBridge(frame);
      });
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
    setValue(valuesOf(cur.typeId, cur.ocId, q.oi), key, value);
    startWork(session.state.person, cur.typeId, cur.ocId);
    saveResults();
    const d = new Date();
    savedAt = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const st = scope.$('.om-saved');
    if (st) st.textContent = 'Сохранено ' + savedAt;
  }
  // Подсказка под полем («в карточке…», «РАСХОДИТСЯ») — на месте, без перерисовки: ввод не прерывается.
  function refreshHint(el) {
    const ctx = cur && oiCtx(cur, q.oi);
    const s = ctx && ctx.secs.find((x) => x.key === q.s);
    const f = s && s.fields.find((x) => (x.path || x.key) === el.dataset.f);
    const p = f && document.getElementById(fid(f.key) + '-h');
    if (!p) return;
    const h = hintOf(f, ctx);
    p.textContent = h.text;
    p.classList.toggle('om-hint-diff', h.diff);
  }
  scope.on('input', 'input[data-f], textarea[data-f]', (e, el) => { saveField(el.dataset.f, el.value); refreshHint(el); });
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
  let t = 0;
  const onChanged = () => { clearTimeout(t); t = setTimeout(() => { if ((q.v || 'today') !== 'app') render(); }, 300); };
  window.addEventListener('inside:inspections', onChanged);
  const unsub = session.subscribe(onChanged);
  const offGeo = onGeoDone(onChanged);

  render();
  return {
    onRoute(route) { const prevV = q.v; q = route.query || {}; render(); if (q.v !== prevV || q.v !== 'search') scope.root.querySelector('.om-scr')?.scrollTo(0, 0); },
    destroy() {
      if (disconnect) disconnect();
      dropMap();
      clearTimeout(t);
      window.removeEventListener('inside:inspections', onChanged);
      if (typeof unsub === 'function') unsub();
      offGeo();
    },
  };
}
