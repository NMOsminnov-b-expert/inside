// Разметка экранов осмотрщика. Ничего не считает и ничего не меняет — только
// показывает то, что дали tasks.js, form.js и запись.
//
// Экраны свои, а не адаптив настольных карточек: у осмотрщика телефон, одна
// рука и улица, а настольная карточка ОЦ — это широкие таблицы, просмотрщик
// документов рядом с полями и панель фильтров. При этом сами экраны
// АДАПТИВНЫЕ (задача пользователя 08.09.2026): на планшете и мониторе они
// раскладываются в две колонки, а разделы уходят наверх — см. inspector.css.
//
// Поля осмотра строятся не разметкой, а из ОПИСАНИЯ (kernel/fieldSchema.js +
// form.js): одно описание — и мобильный экран, и, в дальнейшем, настольная
// карточка. Это и есть «конструктор», о котором просил пользователь.
import { esc } from '../../kernel/dom.js';
import { ownHTML, listHTML as contactListHTML, isEmptyContact } from '../../kernel/contacts.js';
import { fmtEni } from '../../kernel/fmt.js';
import {
  sectionHTML, requiredLeft, filledCount, sectionProgress,
} from '../../kernel/fieldSchema.js';
import { PHOTO_CATS, PHOTO_LIMIT, READY_STATUS, oiLabel, FOUND_CATS, foundCat, UNSORTED } from './tasks.js';
import { sections, allFields, mismatchHint } from './form.js';

// --- значки ---------------------------------------------------------------
//
// Контурные SVG, как в остальном макете (kernel/yearField.js, ctxPlate.js).
// Эмодзи не годятся: их рисует цветной шрифт системы, и на Android и iOS одна
// и та же «камера» выглядит по-разному.
const I = {
  back: '<path d="M13 4 6 11l7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  task: '<path d="M6 3h6a1 1 0 0 1 1 1v1h2v13H3V5h2V4a1 1 0 0 1 1-1Zm-1 6h8M5 12h8M5 15h5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  object: '<path d="M3 17V6l6-3 6 3v11M7 17v-4h4v4M6 9h2M11 9h2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  docs: '<path d="M5 2h6l4 4v12H5zM11 2v4h4M7 11h6M7 14h4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  play: '<path d="M6 4.5v11l9-5.5z" fill="currentColor"/>',
  stop: '<rect x="5" y="5" width="10" height="10" rx="1.5" fill="currentColor"/>',
  photo: '<path d="M3 7h3l1.5-2h5L14 7h3v10H3z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="10" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  pin: '<path d="M10 18s6-5.5 6-9.5A6 6 0 0 0 4 8.5C4 12.5 10 18 10 18Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="10" cy="8.5" r="2.2" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  copy: '<rect x="4" y="4" width="9" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 4V2.5h8.5V14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  trash: '<path d="M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11M9 9v5M11 9v5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  chev: '<path d="M6 8l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  grip: '<g fill="currentColor"><circle cx="7.5" cy="5" r="1.5"/><circle cx="12.5" cy="5" r="1.5"/><circle cx="7.5" cy="10" r="1.5"/><circle cx="12.5" cy="10" r="1.5"/><circle cx="7.5" cy="15" r="1.5"/><circle cx="12.5" cy="15" r="1.5"/></g>',
  search: '<circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M13 13l4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  ok: '<path d="M4 10.5 8 14.5 16 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  pen: '<path d="M3 17h4l9-9-4-4-9 9zM12 4l4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  today: '<rect x="3" y="4.5" width="14" height="12.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3 8h14M7 3v3M13 3v3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="10" cy="12.5" r="1.6" fill="currentColor"/>',
  bell: '<path d="M5 14V9a5 5 0 0 1 10 0v5l1.5 1.5h-13zM8.5 17.5a1.6 1.6 0 0 0 3 0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  nav: '<path d="M10 2.5 16.5 17 10 13.5 3.5 17z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  expand: '<path d="M12 3h5v5M8 17H3v-5M17 3l-6 6M3 17l6-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  shrink: '<path d="M16 9h-5V4M4 11h5v5M11 9l6-6M9 11l-6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
};

export const ico = (name, size = 20) =>
  `<svg viewBox="0 0 20 20" width="${size}" height="${size}" aria-hidden="true">${I[name]}</svg>`;

// Классы полей на этих экранах. Описание поля их не знает: оформление здесь
// своё, а в настольной карточке будет своё — конструктор ядра принимает набор
// классов снаружи.
const FS_UI = {
  // Любой выбор — списком (замечание пользователя 14.10.2026, kernel/fieldSchema.js).
  lists: true,
  field: 'ins-fs',
  label: 'ins-fs-l',
  req: 'ins-fs-req',
  opts: 'ins-chips',
  opt: 'ins-chip',
  rows: 'ins-rows',
  row: 'ins-row',
  mark: 'ins-row-m',
  on: 'on',
  input: 'ins-num',
  unit: 'ins-num-u',
  select: 'select ins-select',
  wide: 'ins-fs-wide',
  area: 'ins-ta',
  hint: 'ins-fs-hint',
};

// --- общие части ----------------------------------------------------------

const statusTone = (status) => {
  if (status === READY_STATUS) return 'go';
  if (status === 'Осмотрен' || status === 'Удостоверен после осмотра') return 'done';
  return 'wait';
};

// Статус НЕ в шапке, а полосой под ней: статусы длинные («Удостоверен по
// документам»), и на 390 пикселях они отжимали адрес до «г. Бишкек,
// Первомайский …». Адресу нужна вся ширина — по нему осмотрщик и опознаёт
// объект.
// ЕНИ — в шапке каждого экрана задачи (указание пользователя 12.10.2026:
// «Осмотрщик должен видеть и ЕНИ. Как при выезде, так и при осмотрах»):
// шапка закреплена, и код виден при съёмке, в документах и на любой
// прокрутке осмотра.
// Шапка всех экранов осмотрщика (пересмотр 14.10.2026, «шапку надо радикально
// пересмотреть»): название одной строкой; под ним одна строка сведений — ЕНИ
// (касание копирует), короткая подпись, отметка «сохранено»; внизу — тонкая
// полоса хода заполнения там, где он есть. Адрес в шапке не стоит — он в
// сведениях об объекте («Адрес к слову лучше в информацию об объекте
// перенести»), ЕНИ — только здесь («И ЕНИ дублировать не нужно»).
export function headerHTML({ title, sub, backHref, backLabel, status, eni = '', progress = null, saved = null }) {
  const pct = progress === null ? null : Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return `<header class="ins-head">
    <a class="ins-back" href="${esc(backHref)}" aria-label="${esc(backLabel)}" title="${esc(backLabel)}">${ico('back', 22)}</a>
    <div class="ins-head-txt">
      <b class="ins-head-title" title="${esc(title)}">${esc(title)}</b>
      <span class="ins-head-meta">
        ${eni ? `<button type="button" class="ins-head-eni" data-ins-eni data-ins-copy="${esc(eni)}" title="Скопировать ЕНИ"><span class="ins-eni-l">ЕНИ</span> <b class="mono">${esc(eni)}</b></button>` : ''}
        ${sub ? `<span class="ins-head-sub">${esc(sub)}</span>` : ''}
        ${saved !== null ? `<span class="ins-saved" data-ins-saved>${esc(saved)}</span>` : ''}
      </span>
    </div>
    ${pct !== null ? `<span class="ins-prog" role="progressbar" aria-label="Заполнено полей" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i data-ins-prog style="width:${pct}%"></i></span>` : ''}
  </header>
  ${status ? `<div class="ins-strip ins-strip-${statusTone(status)}">
    <span class="ins-strip-l">Статус</span>
    <b>${esc(status)}</b>
  </div>` : ''}`;
}

// Панель разделов. Четыре пункта — предел, за которым подписи перестают
// читаться на узком экране; пятый раздел пришлось бы прятать в «ещё», а это
// уже не «быстро и удобно». На телефоне панель внизу, на широком экране
// уезжает наверх — порядком в CSS, без второй разметки.
const TABS = [
  { key: 'task', label: 'Задача', icon: 'task' },
  { key: 'object', label: 'Объект', icon: 'object' },
  { key: 'docs', label: 'Документы', icon: 'docs' },
  { key: 'photo', label: 'Фото', icon: 'photo' },
];

export function tabsHTML(section, hrefFor, counts = {}) {
  return `<nav class="ins-tabs" role="tablist">
    ${TABS.map((t) => {
    const n = counts[t.key];
    return `<a class="ins-tab ${t.key === section ? 'on' : ''}" href="${esc(hrefFor(t.key))}"
      role="tab" aria-selected="${t.key === section ? 'true' : 'false'}">
      <span class="ins-tab-ico">${ico(t.icon)}${n ? `<i class="ins-tab-n">${n > 99 ? '99+' : n}</i>` : ''}</span>
      <span class="ins-tab-l">${esc(t.label)}</span>
    </a>`;
  }).join('')}
  </nav>`;
}

const rowHTML = (label, value, mono) => `<div class="ins-row">
    <span class="ins-row-l">${esc(label)}</span>
    <span class="ins-row-v${mono ? ' mono' : ''}">${value === '' || value == null ? '—' : esc(String(value))}</span>
  </div>`;

// --- экран 1: мои осмотры -------------------------------------------------

// total и pendingCount приходят снаружи: считать их из показанного списка
// нельзя — он уже отфильтрован, и «Все мои» показывали бы число ждущих.
// Разделы верхнего уровня (14.10.2026, «проработать навигацию... переходы по
// экранам»): прежде список «Мои осмотры» был лентой — уведомления, отчёты,
// запросы и лишь под ними задачи, ниже первого экрана. Теперь у каждого свой
// раздел нижней панели; первым — «Сегодня»: выезды дня по маршруту и отчёты.
// Раздел — в адресе (?tab=), чтобы «назад» на телефоне возвращал туда же.
export const HOME_TABS = [
  { key: 'today', label: 'Сегодня', icon: 'today' },
  { key: 'tasks', label: 'Задачи', icon: 'task' },
  { key: 'cad', label: 'Запросы', icon: 'docs' },
  { key: 'notes', label: 'Уведомления', icon: 'bell' },
];

function homeTabsHTML(cur, counts) {
  return `<nav class="ins-tabs" aria-label="Разделы">
  ${HOME_TABS.map((t) => {
    const on = t.key === cur;
    const n = counts[t.key];
    return `<a class="ins-tab ${on ? 'on' : ''}" href="#/insp?tab=${t.key}" data-home-tab="${t.key}"
      ${on ? 'aria-current="page"' : ''}>
      <span class="ins-tab-ico">${ico(t.icon, 22)}${n ? `<i class="ins-tab-n">${n}</i>` : ''}</span>
      <span class="ins-tab-l">${esc(t.label)}</span>
    </a>`;
  }).join('')}
  </nav>`;
}

export function listHTML({
  tasks, total, pendingCount, inspectors, person, onlyPending, backHref, reports = '', cad = '', notes = '',
  tab = 'today', today = '', counts = {}, tasksMap = '',
}) {
  const title = (HOME_TABS.find((t) => t.key === tab) || HOME_TABS[0]).label;
  const asHTML = `<div class="ins-as">
        <label for="insAs">Показать осмотры</label>
        <select class="select ins-select" id="insAs" data-view-as>
          ${inspectors.map((x) => `<option value="${esc(x.name)}" ${x.name === person ? 'selected' : ''}>${esc(x.name)} · ${x.count}</option>`).join('')}
        </select>
        <span class="ins-note">В работе осмотрщик — это вошедший пользователь;
          выбор здесь нужен только макету, чтобы показать чужие назначения.</span>
      </div>`;
  let body;
  if (tab === 'today') body = `${reports}${today}${asHTML}`;
  else if (tab === 'cad') body = cad || '<p class="ins-empty">Запросов документов в кадастр нет.</p>';
  else if (tab === 'notes') body = notes || '<p class="ins-empty">Уведомлений нет.</p>';
  else body = null;
  return `<div class="ins ins-home">
    ${headerHTML({ title, sub: person, backHref, backLabel: 'К объектам оценки' })}

    <div class="ins-body ins-body-list">
      ${body !== null ? body : `<div class="ins-seg" role="tablist">
        <button class="ins-seg-b ${onlyPending ? 'on' : ''}" data-only="1" role="tab"
          aria-selected="${onlyPending ? 'true' : 'false'}">Ждут осмотра${pendingCount ? ` · ${pendingCount}` : ''}</button>
        <button class="ins-seg-b ${onlyPending ? '' : 'on'}" data-only="0" role="tab"
          aria-selected="${onlyPending ? 'false' : 'true'}">Все мои · ${total}</button>
      </div>
      ${tasksMap}

      ${tasks.length ? `<ul class="ins-list">
        ${tasks.map(cardHTML).join('')}
      </ul>` : `<p class="ins-empty">${onlyPending
    ? 'Объектов, ждущих осмотра, нет. Посмотрите «Все мои».'
    : 'На этого осмотрщика объекты не назначены.'}</p>`}

      ${asHTML}`}
    </div>
    ${homeTabsHTML(tab, counts)}
  </div>`;
}

// Кнопка «Ехать» с выбором навигатора — раскрывается на месте, без окна
// поверх (правило проекта «без модальных окон»). Выбранный навигатор
// запоминается (inspector.js), и дальше «Ехать» открывает его сразу.
// links — { google, yandex, dgis, geo } от navLinks().
export function navPickHTML(id, links, label, app = '', main = true, extra = '') {
  const cls = main ? 'ins-btn ins-btn-main ins-go-b' : 'ins-btn ins-go-b';
  const known = app && links[app] ? NAVIGATORS.find((n) => n.key === app) : null;
  return `<div class="ins-go" data-go="${esc(id)}">
    <div class="ins-go-row">
      ${known
    ? `<a class="${cls}" href="${esc(links[app])}" target="_blank" rel="noopener" data-go-app="${known.key}">${ico('nav', 18)} ${esc(label)}<span class="ins-go-app">· ${esc(known.label)}</span></a>
      <button type="button" class="ins-btn ins-go-alt" data-go-open="${esc(id)}" aria-expanded="false">Другой</button>`
    : `<button type="button" class="${cls}" data-go-open="${esc(id)}" aria-expanded="false">${ico('nav', 18)} ${esc(label)}</button>`}
      ${extra}
    </div>
    <div class="ins-go-pick" data-go-pick="${esc(id)}" hidden>
      <span class="ins-go-h">Открыть в навигаторе</span>
      ${NAVIGATORS.map((n) => links[n.key] ? `<a class="ins-btn ins-go-o" href="${esc(links[n.key])}" target="_blank" rel="noopener"
        data-go-app="${n.key}">${esc(n.label)}</a>` : '').join('')}
    </div>
  </div>`;
}

export const NAVIGATORS = [
  { key: 'google', label: 'Google Карты' },
  { key: 'yandex', label: 'Яндекс Карты' },
  { key: 'dgis', label: '2ГИС' },
  { key: 'geo', label: 'Карты телефона' },
];

// Ссылки «проложить маршрут» в навигаторы. pts — [[широта, долгота], …]:
// одна точка — до неё от текущего места, несколько — маршрут через все.
// Форматы — открытые ссылки навигаторов (Google Maps URLs, Яндекс Карты
// rtext, 2ГИС directions), приложение на телефоне перехватывает их само.
export function navLinks(pts) {
  if (!pts.length) return {};
  const ll = (p) => `${p[0]},${p[1]}`;
  const last = pts[pts.length - 1];
  const mid = pts.slice(0, -1);
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${ll(last)}&travelmode=driving${mid.length ? `&waypoints=${encodeURIComponent(mid.map(ll).join('|'))}` : ''}`,
    yandex: `https://yandex.ru/maps/?rtext=~${pts.map(ll).join('~')}&rtt=auto`,
    dgis: `https://2gis.kg/directions/points/${encodeURIComponent('|' + pts.map((p) => `${p[1]},${p[0]}`).join('|'))}`,
    // Карты телефона — только до одной точки: geo: маршрута через несколько не знает.
    geo: pts.length === 1 ? `geo:${ll(last)}?q=${ll(last)}` : '',
  };
}

// Сегодня — по местной полуночи: просрочка плана считается по местным суткам.
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function cardHTML(t) {
  return `<li class="ins-card ${t.done ? 'is-done' : ''}">
    <a class="ins-card-a" href="#/insp/${encodeURIComponent(t.typeId)}/${encodeURIComponent(t.ocId)}">
      <span class="ins-card-top">
        <span class="ins-pill ins-pill-${statusTone(t.status)}">${esc(t.status)}</span>
        <span class="ins-card-type">${esc(t.typeLabel)}</span>
      </span>
      <b class="ins-card-title">${esc(t.title)}</b>
      <span class="ins-card-eni mono">${esc(t.eni || '')}</span>
      <span class="ins-card-meta">
        ${t.plannedAt ? `<span class="${t.pending && t.plannedAt < todayIso() ? 'ins-warn' : ''}">план: ${esc(t.plannedAt.slice(8, 10) + '.' + t.plannedAt.slice(5, 7))}</span>` : ''}
        <span>ОИ: ${t.oiAssigned ? `${t.oiAssigned} из ${t.oiCount}` : t.oiCount}</span>
        ${t.photos ? `<span>фото: ${t.photos}</span>` : ''}
        ${t.pendingNotes ? `<span class="ins-warn">заметок: ${t.pendingNotes}</span>` : ''}
        ${t.done ? `<span class="ins-done">${ico('ok', 14)} осмотр завершён</span>` : ''}
      </span>
    </a>
  </li>`;
}

// --- участок по Кадастру -------------------------------------------------
//
// Что известно об участке с портала Кадастра (rec.geo — kernel/cadastreGeo.js,
// по ЕНИ или адресу, решение 13.10.2026 «Если там рамка, забираем всю
// рамку»): когда и как получен контур, площадь по контуру рядом с площадью
// участка по документам — расхождение видно на месте. Нет контура — кнопка
// «Получить с Кадастра» по ЕНИ (ЕНИ наружу отправлять можно — решение
// пользователя 13.10.2026).
function cadParcelHTML(rec, geo, msg) {
  const land = (rec.oi || []).find((o) => o.card === 'land');
  const doc = land && land.areas ? parseFloat(String(land.areas.pravo || land.areas.fact || '').replace(',', '.')) : NaN;
  const docLabel = land && land.areas && land.areas.pravo ? 'по документам' : 'по факту';
  const docHint = land && land.areas && land.areas.pravo ? 'По правоустанавливающим документам — из карточки участка' : 'По факту — из карточки участка';
  if (!geo || !geo.extent) {
    // Пустое состояние — одной плашкой: что не так и что сделать, вместе
    // (пояснение и действие не расходятся на два блока; ход запроса — там же).
    return `<section class="ins-blk ins-cadp">
      <h2 class="ins-blk-h">Участок по Кадастру</h2>
      <div class="ins-empty ins-cadp-empty">
        <p>${rec.eni ? 'Контура участка нет.' : 'Контура участка нет, ЕНИ не указан.'}</p>
        <p class="ins-hint" role="status" data-cad-geo-msg>${esc(msg || '')}</p>
        ${rec.eni ? `<button type="button" class="ins-btn ins-btn-wide" data-cad-geo>${ico('pin')} Получить с Кадастра по ЕНИ</button>` : ''}
      </div>
    </section>`;
  }
  const m2 = geo.contour ? contourAreaM2(geo.contour) : null;
  const fmt = (v) => Math.round(v).toLocaleString('ru-RU');
  const d = geo.at ? new Date(geo.at) : null;
  const when = d && !isNaN(d) ? `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}` : '';
  let diff = '';
  if (m2 && Number.isFinite(doc) && doc > 0) {
    const pct = ((m2 - doc) / doc) * 100;
    const big = Math.abs(pct) >= 5;
    diff = `<div class="ins-row ${big ? 'ins-cadp-warn' : ''}"><span class="ins-row-l">Разница</span>
      <span class="ins-row-v">${pct > 0 ? '+' : '−'}${fmt(Math.abs(m2 - doc))} м² (${Math.abs(pct).toFixed(1).replace('.', ',')} %)${big ? ' — сверить на месте' : ''}</span></div>`;
  }
  return `<section class="ins-blk ins-cadp">
    <h2 class="ins-blk-h">Участок по Кадастру</h2>
    ${rowHTML('Контур', geo.contour ? `${geo.saved === false ? 'получен сейчас' : `получен ${when}`}${geo.by === 'адрес' ? ' по адресу' : ' по ЕНИ'}` : `только рамка, ${when} — запрашиваю контур…`)}
    ${geo.use ? rowHTML('Целевое назначение по Кадастру', geo.use) : ''}
    ${m2 ? rowHTML('Площадь по контуру', `≈ ${fmt(m2)} м²`) : ''}
    ${Number.isFinite(doc) && doc > 0 ? `<div class="ins-row" title="${esc(docHint)}"><span class="ins-row-l">Площадь ${docLabel}</span><span class="ins-row-v">${fmt(doc)} м²</span></div>` : ''}
    ${diff}
    ${geo.house ? rowHTML('Дом по Кадастру', geo.house) : ''}
    <p class="ins-hint">На карте: синим — участок, фиолетовым — соседние участки, серым — строения (видны при приближении).${geo.saved === false ? ' Контур получен сейчас и в карточку не записан.' : ''}</p>
  </section>`;
}

// Площадь мультиполигона [[[ [долгота, широта], … ]]] в м² — по сфере
// (формула площади сферического многоугольника, радиус 6 378 137 м);
// дыры вычитаются. Для участков в сотни метров погрешность — доли процента.
export function contourAreaM2(contour) {
  const R2 = 6378137 * 6378137;
  const rad = (x) => (x * Math.PI) / 180;
  const ring = (pts) => {
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      s += rad(x2 - x1) * (2 + Math.sin(rad(y1)) + Math.sin(rad(y2)));
    }
    return Math.abs((s * R2) / 2);
  };
  return (contour || []).reduce((sum, poly) => sum + poly.reduce((a, r, i) => a + (i === 0 ? ring(r) : -ring(r)), 0), 0);
}

// --- экран 2: задача ------------------------------------------------------

export function taskHTML({ rec, state, hrefFor, counts, backHref, geo = null, ll = null, app = '', geoMsg = '', unsorted = 0, contacts = null, voices = [], recording = null }) {

  const notes = (rec.notes || []).filter((n) => n && n.text);

  return `<div class="ins">
    ${headerHTML({
    title: rec.type || 'Объект оценки',
    eni: fmtEni(rec.eni),
    backHref,
    backLabel: 'К моим осмотрам',
    status: rec.status,
  })}

    <div class="ins-body">
      <div class="ins-cols">
        <section class="ins-blk">
          <h2 class="ins-blk-h">Куда ехать</h2>
          ${ll ? `<div class="ins-gmap-w" data-ins-map-w>
            <div class="ins-gmap" data-ins-map role="img"
              aria-label="Участок на карте: контур из Кадастра, вокруг — соседние участки и строения"></div>
            <button type="button" class="ins-gmap-t" data-map-big aria-pressed="false"
              aria-label="Развернуть карту" title="Развернуть карту">${ico('expand', 20)}</button>
          </div>
          ${navPickHTML('task', navLinks([ll]), 'Ехать', app, true,
    `<button class="ins-btn ins-btn-icon" data-copy-gps="${esc(`${ll[0].toFixed(6)}, ${ll[1].toFixed(6)}`)}"
              aria-label="Скопировать координаты" title="Скопировать координаты">${ico('copy')}</button>`)}` : '<p class="ins-empty">Координат нет — ни в карточке, ни с Кадастра. Ориентируйтесь по адресу.</p>'}
        </section>

        ${cadParcelHTML(rec, geo, geoMsg)}

        <section class="ins-blk">
          <h2 class="ins-blk-h">Сводка</h2>
          ${rowHTML('Адрес', rec.address)}
          ${rowHTML('Назначение по ТП', rec.purposeTP)}
          ${rowHTML('Учреждение', rec.institution)}
          ${rowHTML('Подвед', rec.podved)}
          ${rowHTML('Объектов имущества', (rec.oi || []).length)}
          ${rowHTML('Оператор ЦОД', (rec.resp || {}).cod)}
        </section>
      </div>

      ${contacts ? contactsHTML(contacts) : ''}

      <section class="ins-blk">
        <h2 class="ins-blk-h">Примечания к объекту</h2>
        ${notes.length ? `<ul class="ins-notes">
          ${notes.map((n) => `<li class="${n.done ? 'is-done' : ''}">
            <span class="ins-note-txt">${esc(n.text)}</span>
            <span class="ins-note-st">${n.done ? 'выполнено' : 'ждёт'}</span>
          </li>`).join('')}
        </ul>` : '<p class="ins-empty">Замечаний от ЦОД нет.</p>'}
      </section>

      <section class="ins-blk">
        <h2 class="ins-blk-h">Моя заметка с осмотра</h2>
        <textarea class="textarea ins-ta" data-own-note rows="4"
          placeholder="Что увидели на месте: расхождения, доступ, кто встречал">${esc(state.note)}</textarea>
        <p class="ins-hint">Заметка уйдёт в объект вместе с фотографиями.</p>
        ${voiceHTML(voices, recording, '')}
      </section>

      <section class="ins-blk">
        <button class="ins-btn ${state.done ? '' : 'ins-btn-main'} ins-btn-wide" data-toggle-done
          ${!state.done && unsorted ? 'aria-describedby="insUnsorted"' : ''}>
          ${ico('ok')} ${state.done ? 'Снять отметку «осмотр завершён»' : 'Осмотр завершён'}
        </button>
        ${!state.done && unsorted ? `<p class="ins-hint ins-hint-warn" id="insUnsorted">Снимков не распределено по категориям: ${unsorted}.
          Распределите их — кнопка «Не распределено» у камеры в осмотре объекта или раздел «Фото», — затем завершайте осмотр.</p>` : ''}
        <p class="ins-hint">Статус «Осмотрен» ставит ЦОД после проверки —
          отметка говорит ему, что можно проверять.</p>
      </section>
    </div>

    ${tabsHTML('task', hrefFor, counts)}
  </div>`;
}

// --- экран 3: карточка ОЦ, только для чтения ------------------------------

// Разделы перечня ОИ — те же, что в карточке ОЦ (узел участка: основные
// здания и сооружения, движимое, вспомогательные постройки), чтобы осмотрщик
// и ЦОД видели одно деление (аудит 14.10.2026: ОИ шли одним списком
// вперемешку). Порядок — как в карточке.
const OI_GROUPS = [
  { label: 'Земельные участки', cards: ['land'] },
  { label: 'Основные здания и сооружения', cards: ['building', 'apartment'], rest: true },
  { label: 'Движимое имущество', cards: ['vehicle', 'mech', 'movable'] },
  { label: 'Вспомогательные постройки', cards: ['aux'] },
];

export function objectHTML({ rec, openOi, found, locked, hrefFor, assetHref, filledFor, counts, backHref }) {
  const oi = rec.oi || [];

  return `<div class="ins">
    ${headerHTML({
    title: 'Объект оценки',
    sub: rec.type,
    eni: fmtEni(rec.eni),
    backHref,
    backLabel: 'К задаче',
    status: rec.status,
  })}

    <div class="ins-body">
      <p class="ins-ro">${ico('ok', 14)} Данные ЦОД — только для просмотра. Свои значения вносите в осмотре объекта имущества</p>

      <section class="ins-blk">
        <h2 class="ins-blk-h">Общие данные</h2>
        <div class="ins-cols">
          <div>
            ${rowHTML('Адрес', rec.address)}
            ${rowHTML('Категория', rec.category)}
            ${rowHTML('Тип ОЦ', rec.type)}
          </div>
          <div>
            ${rowHTML('Координаты', rec.gps, true)}
            ${rowHTML('Собственники', (rec.owners || []).join(', '))}
            ${rowHTML('Пользователи', (rec.users || []).join(', '))}
          </div>
        </div>
      </section>

      <section class="ins-blk">
        <h2 class="ins-blk-h">Объекты имущества · ${oi.length}</h2>
        ${oi.length ? OI_GROUPS.map((g) => {
    const list = oi.filter((o) => g.cards.includes(o.card) || (g.rest && !OI_GROUPS.some((x) => x.cards.includes(o.card))));
    return list.length ? `<h3 class="ins-oi-g">${esc(g.label)} · ${list.length}</h3>
        <ul class="ins-oi">
          ${list.map((o) => oiItemHTML(o, o.id === openOi, assetHref, filledFor)).join('')}
        </ul>` : '';
  }).join('') : '<p class="ins-empty">В объекте нет ни одного ОИ.</p>'}
      </section>

      ${foundBlockHTML({ rec, found, locked, openOi, assetHref, filledFor })}
    </div>

    ${tabsHTML('object', hrefFor, counts)}
  </div>`;
}

// Объекты имущества раскрываются по одному: на телефоне десять развёрнутых
// карточек — это сплошная прокрутка, в которой не найти нужную.
function oiItemHTML(o, open, assetHref, filledFor) {
  const addr = [o.street ? 'ул. ' + o.street : '', o.house ? 'д. ' + o.house : '',
    o.flat ? 'кв. ' + o.flat : ''].filter(Boolean).join(', ');

  // Статус и адрес склеиваем через фильтр, а не строкой с точкой: у движимого
  // имущества статуса нет, и точка висела в начале строки.
  const sub = [o.status || '', addr].filter(Boolean).join(' · ');
  const filled = filledFor ? filledFor(o.id) : 0;

  return `<li class="ins-oi-i ${open ? 'on' : ''}">
    <button class="ins-oi-h" data-oi="${esc(o.id)}" aria-expanded="${open ? 'true' : 'false'}">
      <span class="ins-oi-t">
        <b>${esc(oiLabel(o))}</b>
        <span class="ins-oi-sub">${esc(sub)}</span>
      </span>
      ${filled ? `<span class="ins-oi-n" title="Заполнено полей осмотра">${filled}</span>` : ''}
      <span class="ins-oi-chev">${ico('chev', 18)}</span>
    </button>
    ${open ? `<div class="ins-oi-b">
      ${rowHTML('Код ЕНИ', fmtEni(o.eni), true)}
      ${rowHTML('Год постройки', Array.isArray(o.year) ? o.year.join(', ') : o.year)}
      ${rowHTML('Площадь по ТП, м²', (o.areas || {}).tp)}
      ${rowHTML('Площадь застройки, м²', (o.areas || {}).build)}
      ${rowHTML('Этажей', o.floors)}
      ${rowHTML('Координаты', o.gps, true)}
      ${o.serial ? rowHTML('Заводской номер', o.serial, true) : ''}
      <a class="ins-btn ins-btn-main ins-btn-wide ins-oi-go"
        href="${esc(assetHref(o.id))}">${ico('pen')} ${filled ? 'Продолжить осмотр' : 'Осмотреть'}</a>
    </div>` : ''}
  </li>`;
}

// Выявленные на осмотре здания — неутверждённые литеры (решение пользователя
// 15.10.2026). Для осмотрщика — такой же ОИ, как учтённые: тот же пункт
// списка, та же форма осмотра, снимки к нему. Отличие видно меткой
// «выявлено» и действиями: пока осмотр не завершён — перенести снимки и
// значения в учтённую литеру или удалить; после — «на разборе», правки нет.
function foundBlockHTML({ rec, found, locked, openOi, assetHref, filledFor }) {
  const lands = (rec.oi || []).filter((o) => o.card === 'land');
  const targets = (rec.oi || []).filter((o) => o.card === 'building');
  return `<section class="ins-blk">
    <h2 class="ins-blk-h">Выявлено на осмотре${found.length ? ' · ' + found.length : ''}</h2>
    ${found.length ? `<ul class="ins-oi">
      ${found.map((f) => foundItemHTML(f, { open: f.id === openOi, locked, targets, lands, assetHref, filledFor })).join('')}
    </ul>` : (locked ? '<p class="ins-empty">На осмотре новых зданий не выявлено.</p>' : '')}
    ${locked ? '' : `<form class="ins-found-new" data-found-form>
      <div class="ins-field">
        <label for="insFoundCat">Категория</label>
        <select class="select ins-select" id="insFoundCat" data-found-cat>
          ${FOUND_CATS.map((c) => `<option value="${c.key}">${esc(c.label)}</option>`).join('')}
        </select>
      </div>
      ${lands.length > 1 ? `<div class="ins-field">
        <label for="insFoundLand">Земельный участок</label>
        <select class="select ins-select" id="insFoundLand" data-found-land>
          ${lands.map((l) => `<option value="${esc(l.id)}">${esc([fmtEni(l.eni), l.name].filter(Boolean).join(' · '))}</option>`).join('')}
        </select>
      </div>` : ''}
      <div class="ins-field">
        <label for="insFoundName">Название по факту</label>
        <input class="input ins-input" id="insFoundName" data-found-new-name placeholder="Например: склад у ворот">
      </div>
      <button class="ins-btn ins-btn-main" type="submit">Добавить здание</button>
    </form>`}
  </section>`;
}

function foundItemHTML(f, { open, locked, targets, lands, assetHref, filledFor }) {
  const land = lands.find((l) => l.id === f.landId);
  const sub = [foundCat(f.cat).label, land && lands.length > 1 ? 'участок ' + fmtEni(land.eni) : ''].filter(Boolean).map(esc).join(' · ');
  const filled = filledFor ? filledFor(f.id) : 0;
  return `<li class="ins-oi-i ins-oi-found ${open ? 'on' : ''}">
    <button class="ins-oi-h" data-oi="${esc(f.id)}" aria-expanded="${open ? 'true' : 'false'}">
      <span class="ins-oi-t">
        <b>${esc(f.name || foundCat(f.cat).label)}</b>
        <span class="ins-oi-sub"><span class="ins-pill ins-pill-wait">${locked ? 'на разборе' : 'выявлено'}</span> ${sub}${f.foundAt ? ` · <span class="ins-nowrap">${esc(f.foundAt)}</span>` : ''}</span>
      </span>
      ${filled ? `<span class="ins-oi-n" title="Заполнено полей осмотра">${filled}</span>` : ''}
      <span class="ins-oi-chev">${ico('chev', 18)}</span>
    </button>
    ${open ? `<div class="ins-oi-b">
      ${locked ? `${rowHTML('Название', f.name)}${rowHTML('Описание с осмотра', f.note)}
      <p class="ins-empty">Осмотр завершён — здание передано на разбор в карточку объекта оценки.</p>` : `
      <div class="ins-field">
        <label for="fn-${esc(f.id)}">Название по факту</label>
        <input class="input ins-input" id="fn-${esc(f.id)}" data-found-name="${esc(f.id)}" value="${esc(f.name)}">
      </div>
      <div class="ins-field">
        <label for="fd-${esc(f.id)}">Описание с осмотра</label>
        <textarea class="textarea ins-ta" id="fd-${esc(f.id)}" data-found-note="${esc(f.id)}" rows="2"
          placeholder="Размеры на глаз, примыкания">${esc(f.note)}</textarea>
      </div>
      <a class="ins-btn ins-btn-main ins-btn-wide ins-oi-go"
        href="${esc(assetHref(f.id))}">${ico('pen')} ${filled ? 'Продолжить осмотр' : 'Осмотреть'}</a>
      ${targets.length ? `<div class="ins-found-move">
        <div class="ins-field">
          <label for="fm-${esc(f.id)}">Перенести в учтённое здание</label>
          <select class="select ins-select" id="fm-${esc(f.id)}" data-found-target="${esc(f.id)}">
            ${targets.map((o) => `<option value="${esc(o.id)}">${esc(oiLabel(o))}</option>`).join('')}
          </select>
        </div>
        <button class="ins-btn" type="button" data-found-move="${esc(f.id)}">Перенести снимки и значения</button>
      </div>` : ''}
      <button class="ins-btn ins-btn-del" type="button" data-found-drop="${esc(f.id)}">${ico('trash', 18)} Удалить выявленное</button>`}
    </div>` : ''}
  </li>`;
}

// --- экран 3б: осмотр одного объекта имущества ----------------------------
//
// Поля строятся из описания (form.js) конструктором ядра — разметки полей тут
// нет вовсе. Добавили поле в описание — оно появится и здесь, и в карточке,
// когда карточка на конструктор перейдёт.
export function assetHTML({
  rec, typeId, oi, values, premises, photoHref, collapsed, hrefFor, counts, backHref, savedText, oiPhotos = 0,
  shots = [], shotsOpen = false, cam = {}, voices = [], recording = null,
}) {
  // Разделы и перечень полей — по типу ОЦ задачи: материалы приходят из его
  // справочников, поэтому описание формы уже не константа.
  const SECTIONS = sections(typeId, oi);
  const ALL_FIELDS = allFields(typeId, oi);
  const left = requiredLeft(ALL_FIELDS, values);
  const filled = filledCount(ALL_FIELDS, values);

  // Все разделы открыты по умолчанию: свёрнутое заранее приходится
  // разворачивать, а на осмотре нужно заполнять (замечание пользователя
  // 08.09.2026). Свернуть раздел можно руками — тогда он попадает в collapsed.

  // Сохранение — само, по ходу ввода («Пробуй», 14.10.2026, вместо кнопки
  // «Сохранить» в полосе): в шапке — «сохранено ЧЧ:ММ», ход заполнения —
  // полоса под шапкой и строка разделов (sectionNavHTML).
  const year = Array.isArray(oi.year) ? oi.year.join(', ') : oi.year;
  const facts = [oi.floors ? `${oi.floors} эт.` : '', year ? `${year} г.` : ''].filter(Boolean).join(' · ');
  return `<div class="ins ins-asset">
    ${headerHTML({
    title: oiLabel(oi),
    eni: fmtEni(oi.eni || rec.eni),
    backHref,
    backLabel: 'К объектам имущества',
    progress: ALL_FIELDS.length ? filled / ALL_FIELDS.length : 0,
    saved: savedText || '',
  })}
    ${SECTIONS.length ? sectionNavHTML(SECTIONS, values, HAS_PREMISES.includes(oi.card || 'building') ? premises.length : null, left) : ''}

    <div class="ins-body">
      <section class="ins-blk ins-objinfo">
        <h2 class="ins-blk-h">Об объекте</h2>
        ${rec.address ? `<p class="ins-objinfo-a">${esc(rec.address)}</p>` : ''}
        ${facts ? `<p class="ins-objinfo-f">${esc(facts)}</p>` : ''}
      </section>

      ${SECTIONS.length ? SECTIONS.map((sec) => accordionHTML(sec, values, oi, collapsed, { photos: oiPhotos })).join('')
    : `<section class="ins-blk"><h2 class="ins-blk-h">Осмотр</h2>
        <p class="ins-empty">Поля осмотра для этого вида ещё не заданы. Снимите объект и оставьте заметку в задаче —
          ЦОД увидит их в карточке.</p></section>`}

      <section class="ins-blk">
        <h2 class="ins-blk-h">Голосовые заметки${voices.length ? ' · ' + voices.length : ''}</h2>
        ${voiceHTML(voices, recording, oi.id)}
      </section>

      ${HAS_PREMISES.includes(oi.card || 'building') ? premisesHTML(premises) : ''}

      <section class="ins-blk">
        <a class="ins-btn ins-btn-wide" href="${esc(photoHref)}">${ico('photo')} Прикрепить фото или документ</a>
      </section>
    </div>

    ${cameraHTML(shots, shotsOpen, cam)}

    ${tabsHTML('object', hrefFor, counts)}
  </div>`;
}

// Съёмка прямо из формы осмотра (указание пользователя 15.10.2026: «Должна
// быть возможность выполнения фото прямо из карточки заполнения… Буквально
// кнопка»): круглая кнопка камеры внизу справа, всегда под большим пальцем —
// снимок сразу этому ОИ, категория — по разделу на экране. Рядом — «Снимки N»:
// раскрывает панель уже сделанного по категориям в порядке съёмки («с
// возможностью переноса и удаления» — касание снимка открывает просмотр, где
// его переносят в другую категорию или к другому ОИ и удаляют). Панель не
// модальная: форма под ней прокручивается и заполняется.
// Время снимка — ISO с поясом. Ранние записи хранили «ГГГГ-ММ-ДД ЧЧ:ММ» по
// UTC без пояса — их читаем как UTC.
const LEGACY_AT = /^\d{4}-\d\d-\d\d \d\d:\d\d$/;
const shotTime = (p) => (p.at && LEGACY_AT.test(p.at) ? p.at.replace(' ', 'T') + ':00Z' : p.at) || (() => {
  const t = parseInt(String(p.id || '').split('-')[1], 36);
  return Number.isFinite(t) ? new Date(t).toISOString() : '';
})();
const hhmm = (iso) => (iso ? new Date(iso).toTimeString().slice(0, 5) : '');

// Категория — после съёмки (указание пользователя 16.10.2026: «Лучше тогда
// уже понаделать фото, а потом их к категории при выходе с камеры
// определить»): вернувшись с камеры, осмотрщик видит «Новые снимки · N» —
// миниатюры, все отмечены, и кнопки категорий; касание категории относит
// туда отмеченные. Серию по разным категориям — снять отметку с части и
// отнести остальное. «Позже» — снимки остаются «Не распределено» (кнопка
// у камеры), осмотр не завершить, пока они есть.
function cameraHTML(shots, open, cam = {}) {
  const cats = [UNSORTED, ...PHOTO_CATS, ...new Set(shots.map((p) => p.cat).filter((c) => c !== UNSORTED && !PHOTO_CATS.includes(c)))];
  const byCat = cats.map((c) => [c, shots.filter((p) => p.cat === c)
    .sort((a, b) => shotTime(a).localeCompare(shotTime(b)))]).filter(([, l]) => l.length);
  return `<div class="ins-cam" data-cam><div class="ins-cam-in">
    ${open && shots.length ? `<section class="ins-cam-panel" id="insShots" aria-label="Снимки объекта">
      <div class="ins-cam-head"><b>Снимки объекта · ${shots.length}</b>
        <button class="ins-cam-x" data-cam-list aria-label="Скрыть снимки" title="Скрыть снимки">${ico('chev', 18)}</button></div>
      <div class="ins-cam-scroll">
        ${byCat.map(([c, list]) => `<div class="ins-shots">
          <span class="ins-shots-h">${esc(c)} · ${list.length}</span>
          <ul class="ins-grid">
            ${list.map((p) => `<li class="ins-shot">
              <button class="ins-shot-b" data-shot="${esc(p.id)}" title="Открыть: перенести или удалить">
                <img src="${esc(p.dataUrl || p.url || '')}" alt="${esc(p.name)}" loading="lazy">
                ${hhmm(shotTime(p)) ? `<span class="ins-shot-t">${esc(hhmm(shotTime(p)))}</span>` : ''}
              </button>
            </li>`).join('')}
          </ul>
        </div>`).join('')}
      </div>
      <p class="ins-hint">Касание снимка — просмотр: перенести в другую категорию или к другому объекту, удалить.</p>
    </section>` : ''}
    ${cam.sortOpen && (cam.batch || []).length ? sortHTML(cam.batch, cam.sel || new Set()) : ''}
    <div class="ins-cam-btns">
      ${!cam.sortOpen && (cam.batch || []).length ? `<button type="button" class="ins-cam-unsorted" data-cam-sort>
        Не распределено <b>${cam.batch.length}</b></button>` : ''}
      ${shots.length ? `<button class="ins-cam-list" data-cam-list aria-expanded="${open}" aria-controls="insShots">
        ${ico('photo', 18)} Снимки <b>${shots.length}</b></button>` : ''}
      <button class="ins-cam-shoot" data-cam-shoot aria-label="Снять или выбрать снимки — можно несколько, категорию выберете после">${ico('photo', 28)}</button>
    </div>
  </div></div>`;
}

function sortHTML(batch, sel) {
  const n = batch.filter((p) => sel.has(p.id)).length;
  return `<section class="ins-cam-panel ins-cam-sort" aria-label="Новые снимки — категория">
    <div class="ins-cam-head"><b>Не распределено · ${batch.length}</b>
      <button class="ins-cam-later" type="button" data-cam-later>Позже</button></div>
    <div class="ins-cam-scroll">
      <ul class="ins-grid">
        ${batch.map((p) => `<li class="ins-shot">
          <button class="ins-shot-b ins-shot-sel ${sel.has(p.id) ? 'on' : ''}" type="button" data-cam-sel="${esc(p.id)}"
            aria-pressed="${sel.has(p.id)}" title="${sel.has(p.id) ? 'Снять отметку' : 'Отметить'}">
            <img src="${esc(p.dataUrl || p.url || '')}" alt="${esc(p.name)}">
            <span class="ins-shot-mark" aria-hidden="true">${sel.has(p.id) ? '✓' : ''}</span>
          </button>
        </li>`).join('')}
      </ul>
      <span class="ins-shots-h">${n ? `Отнести отмеченные (${n}) в категорию:` : 'Отметьте снимки, чтобы отнести их в категорию'}</span>
      <div class="ins-cam-cats">
        ${PHOTO_CATS.map((c) => `<button type="button" data-cam-put="${esc(c)}" ${n ? '' : 'disabled'}>${esc(c)}</button>`).join('')}
      </div>
    </div>
  </section>`;
}

// Раздел. Свёрнутый ОБЯЗАН говорить о себе: сколько полей заполнено и сколько
// обязательных осталось — иначе свёртка прячет не только поля, но и то, что в
// них не хватает.
function accordionHTML(sec, values, oi, collapsed, ctx = {}) {
  const p = sectionProgress(sec, values);
  const open = !(collapsed || []).includes(sec.key);

  const inner = sectionHTML(sec, values, {
    ui: FS_UI,
    hintFor: (f) => mismatchHint(f, values, oi, ctx),
    wrap: (s, html) => `<div class="ins-fs-grid">${html}</div>`,
  });

  return `<section class="ins-blk ins-acc ${open ? 'on' : ''}" data-sec-box="${esc(sec.key)}">
    <button class="ins-acc-h" data-sec="${esc(sec.key)}" aria-expanded="${open ? 'true' : 'false'}">
      <span class="ins-acc-t">
        <b>${esc(sec.title)}</b>
        <span class="ins-acc-sub">${p.filled} из ${p.total}${sec.optional ? ' · по возможности' : ''}</span>
      </span>
      ${p.requiredLeft
    ? `<span class="ins-acc-n ins-acc-need"
        title="Обязательных полей осталось: ${p.requiredLeft}">${p.requiredLeft}</span>`
    : (p.filled ? `<span class="ins-acc-n ins-acc-ok"
        title="Обязательные поля раздела заполнены">${ico('ok', 14)}</span>` : '')}
      <span class="ins-oi-chev">${ico('chev', 18)}</span>
    </button>
    ${open ? `<div class="ins-acc-b">${inner}</div>` : ''}
  </section>`;
}

// Помещения — у строений и квартир; у участка и механизмов их нет.
export const HAS_PREMISES = ['building', 'apartment'];

// Строка разделов под шапкой: переход касанием к разделу и где не хватает
// обязательного (янтарное число). Листается вбок, если не влезает; при
// прокрутке отмечается текущий раздел (inspector.js, onScroll).
export function sectionNavHTML(sections, values, premisesN, left) {
  const items = sections.map((s) => {
    const p = sectionProgress(s, values);
    return `<button type="button" class="ins-secnav-b" data-goto-sec="${esc(s.key)}">
      ${esc(s.short || s.title)} <span class="ins-secnav-n${p.requiredLeft ? ' need' : (p.filled === p.total && p.total ? ' ok' : '')}"
        title="${p.requiredLeft ? `Обязательных осталось: ${p.requiredLeft}` : `Заполнено ${p.filled} из ${p.total}`}">${p.requiredLeft || `${p.filled}/${p.total}`}</span>
    </button>`;
  }).join('');
  return `<nav class="ins-secnav" data-secnav aria-label="Разделы осмотра${left ? `, обязательных осталось ${left}` : ''}">
    ${items}
    ${premisesN === null ? '' : `<button type="button" class="ins-secnav-b" data-goto-sec="premises">Помещения${premisesN ? ` <span class="ins-secnav-n">${premisesN}</span>` : ''}</button>`}
  </nav>`;
}

function premisesHTML(list) {
  return `<section class="ins-blk" data-sec-box="premises">
    <h2 class="ins-blk-h">Помещения${list.length ? ' · ' + list.length : ''}</h2>
    ${list.length ? `<ul class="ins-pm">
      ${list.map((pm) => `<li class="ins-pm-i">
        <div class="ins-field">
          <label>Наименование</label>
          <input class="input ins-input" data-pm-name="${esc(pm.id)}" value="${esc(pm.name)}"
            placeholder="Кабинет, коридор, санузел">
        </div>
        <button class="ins-icon-b" data-pm-drop="${esc(pm.id)}"
          aria-label="Убрать помещение" title="Убрать помещение">${ico('trash', 18)}</button>
      </li>`).join('')}
    </ul>` : '<p class="ins-empty">Помещений пока нет.</p>'}
    <button class="ins-btn ins-btn-wide" data-pm-add style="margin-top:10px">Добавить помещение</button>
    <p class="ins-hint">Поэтажные планы и экспликации — в техпаспорте, раздел «Документы».
      Планировку определяет оценщик, на осмотре её не заполняют.</p>
  </section>`;
}

// --- экран 4: документы ---------------------------------------------------

// Голосовые заметки (16.10.2026, образец — диктофон приложения «Осмотр»):
// большая кнопка — запись, ещё раз — стоп и сохранение; пока пишет — время и
// полоска громкости (видно, что микрофон слышит). Запись — касание: слушать
// или остановить; длительность, время записи; удалить.
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function voiceHTML(list, recording, oiId) {
  const on = recording && recording.oiId === oiId;
  return `<div class="ins-voice" data-voice-box="${esc(oiId)}">
    ${list.length ? `<ul class="ins-voice-list">${list.map((v) => `<li class="ins-voice-i">
      <button class="ins-voice-play" type="button" data-voice-play="${esc(v.id)}" aria-label="Прослушать заметку ${esc(mmss(v.dur || 0))}">${ico('play', 18)}</button>
      <span class="ins-voice-t"><b>${esc(mmss(v.dur || 0))}</b><small>${esc(v.at ? new Date(v.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '')}</small></span>
      <button class="ins-btn ins-btn-icon" type="button" data-voice-drop="${esc(v.id)}" aria-label="Удалить заметку" title="Удалить заметку">${ico('trash', 18)}</button>
    </li>`).join('')}</ul>` : ''}
    <button class="ins-voice-rec ${on ? 'on' : ''}" type="button" data-voice-rec="${esc(oiId)}" aria-pressed="${on ? 'true' : 'false'}">
      <span class="ins-voice-dot" aria-hidden="true"></span>
      <span data-voice-label>${on ? 'Остановить и сохранить' : 'Записать голосовую заметку'}</span>
      ${on ? '<span class="ins-voice-time" data-voice-time>0:00</span><span class="ins-voice-lvl" aria-hidden="true"><i data-voice-lvl></i></span>' : ''}
    </button>
  </div>`;
}

// Контакты на месте: свои, добавленные на осмотре (правка на месте, как в
// карточках), и контакты объекта и учреждения — только просмотр: телефон —
// звонок, почта — письмо (как в приложении «Осмотр»: «Касание телефона —
// звонок»).
function contactsHTML({ own, editing, object, chain }) {
  const known = [...object, ...chain.flatMap((g) => g.contacts)].filter((c) => !isEmptyContact(c));
  return `<section class="ins-blk ins-contacts" aria-label="Контакты на месте">
    <h2 class="ins-blk-h">Контакты на месте</h2>
    ${ownHTML(own, { key: 'insp', editing, title: 'Добавлены на осмотре',
    empty: 'Кто встретил, кто отвечает за объект — ФИО, телефон, комментарий' })}
    ${object.length ? `<section class="ct-group from"><header class="ct-group-h"><span class="ct-group-k">Контакты объекта</span></header>
      ${contactListHTML(object)}</section>` : ''}
    ${chain.map((g) => `<section class="ct-group from"><header class="ct-group-h"><span class="ct-group-k">От учреждения</span><b title="${esc(g.name)}">${esc(g.name)}</b></header>
      ${contactListHTML(g.contacts)}</section>`).join('')}
    ${known.length ? '' : '<p class="ins-hint">У объекта и учреждения контактов нет.</p>'}
  </section>`;
}

export function docsHTML({ rec, docs, hrefFor, counts, backHref, scans = [], draft = null, oiList = [], locked = false }) {
  return `<div class="ins">
    ${headerHTML({
    title: 'Документы',
    eni: fmtEni(rec.eni),
    backHref,
    backLabel: 'К задаче',
  })}

    <div class="ins-body">
      ${scanBlockHTML({ scans, draft, oiList, locked })}
      <section class="ins-blk">
        <h2 class="ins-blk-h">Назначенные документы${docs.length ? ' · ' + docs.length : ''}</h2>
      ${docs.length ? `<ul class="ins-docs">
        ${docs.map(docItemHTML).join('')}
      </ul>` : `<p class="ins-empty">На осмотр документы не назначены.
        Их выбирает региональный менеджер при назначении осмотра.</p>`}
      </section>
    </div>

    ${tabsHTML('docs', hrefFor, counts)}
  </div>`;
}

// Сканы с осмотра (16.10.2026): «Отсканировать документ» — снять или выбрать
// несколько страниц; затем форма прямо здесь — название и к какому объекту
// относится, миниатюры страниц; «Сохранить» — документ в списке «Отсканировано
// на осмотре» с меткой «с осмотра · ждёт удостоверения ЦОД».
function scanBlockHTML({ scans, draft, oiList, locked }) {
  const ownerOf = (id) => (oiList.find((o) => o.id === id) || {}).label || 'Объект оценки';
  return `<section class="ins-blk ins-scans" aria-label="Сканы с осмотра">
    <h2 class="ins-blk-h">Отсканировано на осмотре${scans.length ? ' · ' + scans.length : ''}</h2>
    ${draft ? `<div class="ins-scan-new">
      <ul class="ins-grid">${draft.urls.map((u, i) => `<li class="ins-shot"><span class="ins-shot-b"><img src="${esc(u)}" alt="Страница ${i + 1}"></span></li>`).join('')}</ul>
      <div class="ins-field">
        <label for="insScanTitle">Название документа</label>
        <input class="input ins-input" id="insScanTitle" data-scan-title value="${esc(draft.title || '')}" placeholder="Например: техпаспорт, акт, договор аренды">
      </div>
      <div class="ins-field">
        <label for="insScanOi">К чему относится</label>
        <select class="select ins-select" id="insScanOi" data-scan-oi>
          <option value="" ${draft.oiId ? '' : 'selected'}>Объект оценки</option>
          ${oiList.map((o) => `<option value="${esc(o.id)}" ${o.id === draft.oiId ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
        </select>
      </div>
      <div class="ins-acts">
        <button class="ins-btn" type="button" data-scan-cancel>Отмена</button>
        <button class="ins-btn ins-btn-main" type="button" data-scan-save>Сохранить · ${draft.urls.length} стр.</button>
      </div>
    </div>` : ''}
    ${scans.length ? `<ul class="ins-docs">${scans.map((s) => `<li class="ins-doc ins-scan">
      <span class="ins-doc-ico">${ico('docs')}</span>
      <span class="ins-doc-t">
        <b>${esc(s.title)}</b>
        <small>${esc([ownerOf(s.oiId), `${s.pages.length} стр.`].join(' · '))}</small>
        <span class="ins-pill ins-pill-wait">с осмотра · ${esc(s.status === 'ждёт ЦОД' ? 'ждёт удостоверения ЦОД' : s.status)}</span>
      </span>
      ${locked ? '' : `<button class="ins-btn ins-btn-icon" type="button" data-scan-drop="${esc(s.id)}" aria-label="Удалить скан" title="Удалить скан">${ico('trash', 18)}</button>`}
    </li>`).join('')}</ul>` : (draft ? '' : '<p class="ins-empty">Документ, которого нет в списке, — снимите его страницы: ЦОД удостоверит и разнесёт.</p>')}
    ${locked || draft ? '' : `<button class="ins-btn ins-btn-main ins-btn-wide" type="button" data-scan-add>${ico('docs')} Отсканировать документ</button>`}
  </section>`;
}

// owner — чей это документ: объект оценки, литера, механизм или транспортное
// средство. Без него «паспорт котла» не найти среди десятка паспортов, а
// техпаспорт литеры не отличить от техпаспорта соседней (требование
// пользователя 08.09.2026).
function docItemHTML({ doc: d, owner }) {
  const file = d.file || null;
  const meta = [d.type, d.date, file && file.name].filter(Boolean).join(' · ');

  return `<li class="ins-doc">
    <span class="ins-doc-ico">${ico('docs')}</span>
    <span class="ins-doc-t">
      <b>${esc(d.title || d.name || 'Документ')}</b>
      <span class="ins-doc-owner">${esc(owner)}</span>
      <span class="ins-doc-sub">${esc(meta || 'без файла')}</span>
    </span>
    ${file && file.dataUrl
    ? `<a class="ins-btn ins-btn-sm" href="${esc(file.dataUrl)}" target="_blank" rel="noopener">Открыть</a>`
    : '<span class="ins-doc-no">файла нет</span>'}
  </li>`;
}

// --- экран 5: фото --------------------------------------------------------
//
// Снимок привязывается к объекту имущества, а не только к категории
// (требование пользователя 08.09.2026): фото кровли без литеры не отличить от
// фото кровли соседней литеры, а «какой механизм» — единственное, что делает
// снимок механизма осмысленным.
export function photoHTML({ groups, total, oiId, cat, oiList, hrefFor, counts, backHref, sub, eni = '' }) {
  return `<div class="ins">
    ${headerHTML({
    title: 'Фото с осмотра',
    sub: sub || `${total} из ${PHOTO_LIMIT}`,
    eni,
    backHref,
    backLabel: 'К задаче',
  })}

    <div class="ins-body">
      <section class="ins-blk">
        <div class="ins-cols">
          <div class="ins-field">
            <label for="insOi">Объект имущества</label>
            <select class="select ins-select" id="insOi" data-oi-pick>
              ${oiList.map((o) => `<option value="${esc(o.id)}" ${o.id === oiId ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
            </select>
          </div>
          <div class="ins-field">
            <label for="insCat">Категория съёмки</label>
            <select class="select ins-select" id="insCat" data-cat>
              ${PHOTO_CATS.map((c) => `<option ${c === cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}
            </select>
          </div>
        </div>
        <button class="ins-btn ins-btn-main ins-btn-wide" data-shoot
          ${oiList.length ? '' : 'disabled'}>${ico('photo')} Снять или выбрать</button>
        <p class="ins-hint">${oiList.length
    ? 'Снимок попадёт выбранному объекту в выбранную категорию — перенести его можно из просмотра.'
    : 'Сначала в объекте должен появиться хотя бы один объект имущества.'}</p>
      </section>

      ${total ? [...groups.entries()].map(([, g]) => `<section class="ins-blk">
        <h2 class="ins-blk-h">${esc(g.label)}</h2>
        ${[...g.cats.entries()].map(([name, list]) => `<div class="ins-shots">
          <span class="ins-shots-h">${esc(name)} · ${list.length}</span>
          <ul class="ins-grid">
            ${list.map((p) => `<li class="ins-shot">
              <button class="ins-shot-b" data-shot="${esc(p.id)}" title="Открыть снимок">
                <img src="${esc(p.dataUrl || p.url || "")}" alt="${esc(p.name)}" loading="lazy">
              </button>
            </li>`).join('')}
          </ul>
        </div>`).join('')}
      </section>`).join('') : '<p class="ins-empty">Снимков пока нет.</p>'}
    </div>

    ${tabsHTML('photo', hrefFor, counts)}
  </div>`;
}

// Полноэкранный просмотр снимка — он же место, где снимок переносят и
// удаляют. В сетке для двух списков и кнопки нет ширины, а здесь есть: и
// смотреть удобнее, и промахнуться по мелкой кнопке невозможно.
export function lightboxHTML(p, oiList) {
  return `<div class="ins-lb" data-lb>
    <button class="ins-lb-x" data-lb-close aria-label="Закрыть">${ico('back', 22)}</button>
    <img src="${esc(p.dataUrl || p.url || "")}" alt="${esc(p.name)}">
    <div class="ins-lb-bar">
      <div class="ins-field">
        <label for="lbOi">Объект имущества</label>
        <select class="select ins-select" id="lbOi" data-move-oi="${esc(p.id)}">
          ${oiList.map((o) => `<option value="${esc(o.id)}" ${o.id === p.oiId ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
        </select>
      </div>
      <div class="ins-field">
        <label for="lbCat">Категория</label>
        <select class="select ins-select" id="lbCat" data-move="${esc(p.id)}">
          ${PHOTO_CATS.includes(p.cat) ? '' : `<option value="" selected disabled>${esc(p.cat || UNSORTED)}</option>`}
          ${PHOTO_CATS.map((c) => `<option ${c === p.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
      </div>
      <button class="ins-btn ins-btn-icon" data-drop="${esc(p.id)}"
        aria-label="Удалить снимок" title="Удалить снимок">${ico('trash', 18)}</button>
    </div>
  </div>`;
}

// --- отчёты за день (ТЗ рабочего дня осмотрщика, раздел 3) -------------------
//
// Плашка над списком: утренний и вечерний — сдан во столько-то, ждёт к сроку
// или не сдан. Отчёт — отдельный экран (#/insp?report=…), «назад» телефона
// возвращает к списку. Практики: учёт пробега в приложениях — показания
// начала и конца дня, снимок одометра как главный путь, число — запасной;
// цифровая клавиатура у чисел (inputmode).

const fmtD = (iso) => iso.split('-').reverse().join('.');

function repLine(kind, label, sub, r, due, missing) {
  const state = r ? `<span class="ins-pill ins-pill-done">сдан ${esc(r)}</span>`
    : missing ? '<span class="ins-pill ins-pill-late">не сдан</span>'
      : `<span class="ins-pill ins-pill-wait">к ${esc(due)}</span>`;
  return `<a class="ins-rep-row" href="#/insp?report=${kind}" data-rep-open="${kind}">
    <span class="ins-rep-t"><b>${label}</b><small>${sub}</small></span>${state}${ico('chev', 18)}</a>`;
}

export function dayReportsHTML({ morning, evening, from, to, missingMorning, missingEvening }) {
  return `<section class="ins-blk ins-rep" aria-label="Отчёты за сегодня">
    <h2 class="ins-blk-h">Отчёты за сегодня</h2>
    ${repLine('morning', 'Утренний', 'куда выезжаю, одометр', morning, from, missingMorning)}
    ${repLine('evening', 'Вечерний', 'что осмотрено, пробег', evening, to, missingEvening)}
  </section>`;
}

const checkRow = (attr, val, on, text, sub = '') => `<button type="button" class="ins-row ${on ? 'on' : ''}" ${attr}="${esc(val)}" aria-pressed="${on}">
  <span class="ins-row-m" aria-hidden="true"></span><span class="ins-row-txt">${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}</span></button>`;

// draft — черновик формы; trips — выезды дня; prev — утренний (для вечернего:
// показание утром и расчёт пробега); preview — { km, litres } или null.
export function reportFormHTML({ kind, date, person, draft, trips, existing, prev, preview, err }) {
  const morning = kind === 'morning';
  const title = morning ? 'Утренний отчёт' : 'Вечерний отчёт';
  const odo = `<section class="ins-blk">
      <h2 class="ins-blk-h">Одометр</h2>
      ${draft.noOdometer ? '' : `<div class="ins-field ins-rp-odo">
        <label for="rpOdo">Показание, км${!morning && prev && prev.odometer ? ` · утром ${esc(Number(prev.odometer).toLocaleString('ru-RU'))}` : ''}</label>
        <div class="ins-num-wrap"><input class="ins-num" id="rpOdo" data-rp="odometer" inputmode="numeric" autocomplete="off" value="${esc(draft.odometer)}"><span class="ins-num-u">км</span></div>
      </div>
      ${draft.photo ? `<figure class="ins-rp-photo"><img src="${esc(draft.photo)}" alt="Снимок одометра">
          <figcaption><button type="button" class="ins-btn ins-btn-sm" data-rp-shoot>Переснять</button>
            <button type="button" class="ins-icon-b" data-rp-unshoot aria-label="Убрать снимок" title="Убрать снимок">${ico('trash', 18)}</button></figcaption></figure>`
        : `<button type="button" class="ins-btn ins-btn-wide" data-rp-shoot>${ico('photo', 20)} Сфотографировать одометр</button>`}`}
      <div class="ins-rows ins-rp-noodo">${checkRow('data-rp-noodo', '1', draft.noOdometer, 'Одометра нет')}</div>
    </section>`;
  const routeBlk = !morning && draft.noOdometer ? `<section class="ins-blk">
      <h2 class="ins-blk-h">Маршрут</h2>
      <ol class="ins-rp-route">${draft.route.map((x, i) => `<li><span class="ins-rp-n">${i + 1}</span><input class="ins-num ins-rp-pt" data-rp-pt="${i}" value="${esc(x)}" aria-label="Пункт ${i + 1}" placeholder="${i === 0 ? 'откуда' : 'куда'}">
        ${draft.route.length > 2 ? `<button type="button" class="ins-icon-b" data-rp-pt-drop="${i}" aria-label="Убрать пункт ${i + 1}">${ico('trash', 18)}</button>` : ''}</li>`).join('')}</ol>
      <button type="button" class="ins-btn ins-btn-sm" data-rp-pt-add>Добавить пункт</button>
      <div class="ins-field ins-rp-km"><label for="rpKm">Пробег по маршруту, км</label>
        <div class="ins-num-wrap"><input class="ins-num" id="rpKm" data-rp="km" inputmode="decimal" autocomplete="off" value="${esc(draft.km)}"><span class="ins-num-u">км</span></div></div>
    </section>` : '';
  const placesBlk = morning ? `<section class="ins-blk">
      <h2 class="ins-blk-h">Куда выезжаю</h2>
      ${trips.length ? `<div class="ins-rows">${trips.map((t) => checkRow('data-rp-place', t.assignId, draft.pick.includes(t.assignId), t.title, t.sub)).join('')}</div>`
        : '<p class="ins-hint">На сегодня выездов не назначено.</p>'}
      ${draft.extra.map((x) => `<div class="ins-rp-extra"><span>${esc(x)}</span>
        <button type="button" class="ins-icon-b" data-rp-extra-drop="${esc(x)}" aria-label="Убрать">${ico('trash', 18)}</button></div>`).join('')}
      <div class="ins-rp-add"><input class="ins-num" data-rp-extra placeholder="№ и название учреждения" aria-label="Другое место">
        <button type="button" class="ins-btn ins-btn-sm" data-rp-extra-add>Добавить</button></div>
    </section>` : `<section class="ins-blk">
      <h2 class="ins-blk-h">Осмотрено сегодня</h2>
      ${trips.length ? `<div class="ins-rows">${trips.map((t) => checkRow('data-rp-done', t.assignId, draft.done.includes(t.assignId), t.title, t.sub)).join('')}</div>`
        : '<p class="ins-hint">На сегодня выездов не назначено.</p>'}
    </section>`;
  return `<div class="ins ins-rp">
    ${headerHTML({ title, sub: `${fmtD(date)} · ${person}`, backHref: '#/insp', backLabel: 'К моим осмотрам' })}
    <div class="ins-body">
      ${existing ? `<p class="ins-ro">${ico('ok', 16)} Сдан в ${esc(existing)} — правки сохраняются поверх</p>` : ''}
      ${placesBlk}
      ${odo}
      ${routeBlk}
      ${morning ? '' : `<section class="ins-blk"><h2 class="ins-blk-h">Комментарий</h2>
        <textarea class="ins-ta" data-rp="note" rows="3" aria-label="Комментарий">${esc(draft.note)}</textarea></section>`}
      ${preview ? `<p class="ins-rp-sum">Пробег за день <b>${preview.km} км</b>${preview.by ? ` ${preview.by}` : ''}${preview.litres !== null ? ` · бензин <b>${preview.litres.toLocaleString('ru-RU')} л</b>` : ''}</p>` : ''}
      <div class="ins-rp-foot">
        <p class="ins-rp-err" role="alert" data-rp-err>${err ? esc(err) : ''}</p>
        <button type="button" class="ins-btn ins-btn-main ins-btn-wide" data-rp-send>${existing ? 'Сохранить отчёт' : 'Сдать отчёт'}</button>
      </div>
    </div>
  </div>`;
}

// --- запросы документов (ТЗ рабочего дня осмотрщика, раздел 5) ---------------
//
// Над списком — открытые запросы строками во всю ширину (как отчёты за
// день); запрос — отдельный экран (#/insp?cad=…): по строке документа —
// итог переключателем, для «получен» — PDF и дата сканирования, для «нет» и
// «отказа» — причина; ответ сохраняется по строке.

export function cadListHTML(list) {
  if (!list.length) return '';
  return `<section class="ins-blk ins-rep" aria-label="Запросы документов">
    <h2 class="ins-blk-h">Запросы документов</h2>
    ${list.map((r) => `<a class="ins-rep-row" href="#/insp?cad=${encodeURIComponent(r.id)}" data-cad-open="${esc(r.id)}">
      <span class="ins-rep-t"><b>${esc(r.kindLabel)} № ${r.no}</b><small>${r.wait ? `ждёт ответа ${r.wait} из ${r.total}` : 'все строки отвечены'}${r.due ? ` · срок ${esc(fmtD(r.due).slice(0, 5))}` : ''}</small></span>
      <span class="ins-pill ${r.wait ? (r.late ? 'ins-pill-late' : 'ins-pill-wait') : 'ins-pill-done'}">${r.got} из ${r.total}</span>${ico('chev', 18)}</a>`).join('')}
  </section>`;
}

// req — запрос; rows — строки с подписями { row, code, title, draft };
// results — CAD_RESULTS.
export function cadScreenHTML({ req, kindLabel, rows, results }) {
  return `<div class="ins ins-rp ins-cad">
    ${headerHTML({ title: `${kindLabel} № ${req.no}`, sub: `${req.due ? `срок ${fmtD(req.due)} · ` : ''}строк ${rows.length}`, backHref: '#/insp', backLabel: 'К моим осмотрам' })}
    <div class="ins-body">
      ${req.note ? `<p class="ins-hint ins-cad-note">${esc(req.note)}</p>` : ''}
      ${rows.map(({ row, code, title, fileName, draft, err }) => `<section class="ins-blk ins-cad-row" data-cad-row="${esc(row.id)}">
        <h2 class="ins-cad-doc">${esc(row.doc)}</h2>
        <p class="ins-cad-sub">${code ? `№ ${esc(code)} · ` : ''}<span class="mono">${esc(row.eni)}</span>${title ? `<br>${esc(title)}` : ''}</p>
        ${row.note ? `<p class="ins-hint">${esc(row.note)}</p>` : ''}
        <div class="ins-seg ins-cad-res" role="radiogroup" aria-label="Итог">${results.map((x) => `<button type="button" class="ins-seg-b ${draft.result === x.key ? 'on' : ''}" role="radio"
          aria-checked="${draft.result === x.key}" data-cad-res="${esc(row.id)}|${x.key}">${x.label}</button>`).join('')}</div>
        ${draft.result === 'got' ? `<div class="ins-cad-file">
            ${draft.file || row.file ? `<span class="ins-cad-fname">${ico('docs', 18)} ${esc(fileName)}</span>` : ''}
            <button type="button" class="ins-btn ins-btn-sm" data-cad-file="${esc(row.id)}">${draft.file || row.file ? 'Заменить PDF' : 'Прикрепить PDF'}</button></div>
          <div class="ins-field"><label for="cadScan-${esc(row.id)}">Дата сканирования</label>
            <input class="ins-num" type="date" id="cadScan-${esc(row.id)}" data-cad-scan="${esc(row.id)}" value="${esc(draft.scanDate)}"></div>` : ''}
        ${draft.result ? `<div class="ins-field"><label for="cadAns-${esc(row.id)}">${draft.result === 'got' ? 'Комментарий' : 'Причина'}</label>
          <textarea class="ins-ta" rows="2" id="cadAns-${esc(row.id)}" data-cad-ans="${esc(row.id)}">${esc(draft.answer)}</textarea></div>` : ''}
        ${err ? `<p class="ins-rp-err" role="alert">${esc(err)}</p>` : ''}
        ${row.answeredAt ? `<p class="ins-ro">${ico('ok', 16)} Ответ сохранён ${esc(fmtD(row.answeredAt.slice(0, 10)).slice(0, 5))} ${esc(new Date(row.answeredAt).toTimeString().slice(0, 5))} · ${esc(row.result === 'got' ? 'получен' : row.result === 'none' ? 'нет в кадастре' : 'отказ')}</p>` : ''}
        ${draft.result ? `<button type="button" class="ins-btn ins-btn-main ins-btn-wide" data-cad-save="${esc(row.id)}">Сохранить ответ</button>` : ''}
      </section>`).join('')}
    </div>
  </div>`;
}

// Уведомления осмотрщику о себе (ТЗ рабочего дня, пункт 8.2): новое
// назначение, перенос даты, снятие, срок доверенности — за последние дни.
export function notesHTML(list) {
  if (!list.length) return '';
  return `<section class="ins-blk ins-ntfs" aria-label="Уведомления">
    <h2 class="ins-blk-h">Уведомления</h2>
    <ul class="ins-ntf-list">${list.map((n) => `<li class="ins-ntf ${n.tone || ''}">${n.href ? `<a href="${esc(n.href)}">` : '<span>'}
      <b>${esc(n.title)}</b><small>${esc(n.text)}</small>${n.href ? '</a>' : '</span>'}</li>`).join('')}</ul>
  </section>`;
}
