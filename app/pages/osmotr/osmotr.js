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
// «typeId|ocId», &tab — task, docs), doc (&id, &doc — документ), app —
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
import { resultsOf } from '../../kernel/inspectionResults.js';
import { loadTask } from '../inspection/tasks.js';
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

// Буква литеры — в квадрате (как на стенде), у участка — значок.
function oiRow(o, x0, photo) {
  // Подпись без повтора («Квартира · Квартира» — вид и наименование совпали).
  const x = { ...x0, label: [...new Set(String(x0.label || '').split(' · '))].join(' · ') };
  const m = /^Литера\s+(\S+)/.exec(x.label || '');
  const sq = m ? `<span class="om-sq om-t-blue">${esc(m[1])}</span>` : `<span class="om-sq om-t-teal">${ico(x.kind === 'land' ? 'layers' : x.kind === 'vehicle' ? 'vehicle' : 'real', 18)}</span>`;
  const sub = [x.oiType && !String(x.label || '').startsWith(x.oiType) ? x.oiType : '', x.eni ? fmtEni(x.eni) || x.eni : '', x.review === 'returned' ? 'на доосмотр' + (x.reason ? ': ' + x.reason : '') : ''].filter(Boolean).join(' · ');
  return `<div class="om-oi">${sq}<span class="om-row-tx"><b>${esc(m ? (x.label.replace(/^Литера\s+\S+\s*·?\s*/, '') || x.label) : x.label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>
    ${photo ? `<img class="om-facade" src="${esc(photo.dataUrl)}" alt="Фасад с прошлого осмотра" title="Фасад с прошлого осмотра${photo.at ? ', ' + esc(String(photo.at).slice(0, 10)) : ''}" loading="lazy">` : ''}</div>`;
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
    const o = (v === 'obj' || v === 'doc') ? all.find((x) => x.id === q.id) : null;
    const screen = v === 'trips' ? viewTrips(all, q, unread) : v === 'search' ? viewSearch(all, q) : v === 'menu' ? viewMenu(all, unread)
      : v === 'notes' ? viewNotes(notes) : v === 'obj' ? viewObj(o, q) : v === 'doc' ? viewDoc(o, q) : viewToday(all, q, unread);
    const openParcel = !!(scope.$('.om-parcel') && scope.$('.om-parcel').open);
    const asBar = session.state.role !== 'insp'
      ? `<div class="om-asbar" role="status"><span>Вы смотрите как: осмотрщик</span><a href="#/">Вернуться</a></div>` : '';
    const geoAt = o ? ((loadTask(o.typeId, o.ocId) || {}).geo || {}).at || '' : '';
    const keepMap = v === 'obj' && map && mapKey === q.id + '|' + geoAt && (q.tab || 'task') === 'task';
    const mapEl = keepMap ? map.getContainer() : null;
    scope.setHTML(`<div class="om-app" data-v="${esc(v)}">${asBar}<main class="om-scr">${screen}</main>${v === 'obj' || v === 'doc' ? '' : bottomNav(v, todayN)}</div>`);
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
    onRoute(route) { const prevV = q.v; q = route.query || {}; render(); if (q.v !== prevV || q.v === 'obj') scope.root.querySelector('.om-scr')?.scrollTo(0, 0); },
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
