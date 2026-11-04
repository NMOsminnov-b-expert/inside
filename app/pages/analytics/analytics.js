// «Аналитика · Земли по айыл аймакам» — отдельная страница (пользователь
// 04.11.2026: «можно добавить отдельную страницу в макете. Что бы в осмотрах
// не городить. Пускай будет аналитикой»; «добавить бы на карте фильтры.
// Например где какая площадь не занята… полезным как для аналитики, так и для
// красивых и удобных демонстраций»).
//
// Раскладка — как «Осмотры» по APCS (решение perestroyka-osmotrov-po-apcs-
// karta-scena-ostrovki-paneli-rezhimov; пользователь 04.11.2026: «Работу с
// картой подтягиваем к тому же со стилей APCS. Позаботься и о плавности всех
// анимаций карты на странице»): карта — сцена на всю рабочую область, сверху
// островки (отбор; «Карта / Таблица» и итоги), слева панель списка аймаков со
// своей прокруткой, скрываемая язычком; «Таблица» — поверхностью над сценой;
// на окнах до 1100 — карта сверху, панели листом ниже. Движение — только
// transform и opacity, одна длительность на событие (практика dvizhenie-
// otvechaet-na-vopros-i-stoit-malo), «меньше движения» — без перелётов.
//
// Что на странице:
//   * отбор на карту, список и таблицу: поиск, область, район; «Отбор» —
//     «Занято, %» от–до, «Не занято от, га», «Только посчитанные»;
//   * итоги по показанному — в островке;
//   * карта: аймаки залиты по доле занятого (5 ступеней одного синего), внутри
//     посчитанных — незанятая земля оранжевым, ОЦ системы точками, участки
//     Кадастра вблизи, границы «Дарек» (кнопка карты); наведение — подсказка,
//     щелчок по аймаку — его строка в таблице, щелчок по строке — карта к аймаку;
//   * таблица аймаков: площадь по контуру и по балансу, занято, не занято, доля,
//     ГФСУ, ОЦ; строка раскрывается — баланс, занятость, ОЦ с ЕНИ.
// Данные — kernel/darekAdmin.js (привязка ОЦ), kernel/landStats.js (контур,
// баланс, занятость по координатам контуров Кадастра). Расчёт — кнопкой на
// аймак или «Посчитать показанные»; всю страну здесь не обходим («Для тестов в
// макете выгружать всю базу не стоит. Можно просто с десяток аймаков пройти»).
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: привязка и расчёт — на сервере по выгрузке Кадастра,
// страница только показывает; кнопки расчёта станут датой выгрузки.
import { esc } from '../../kernel/dom.js';
import { OC_TYPES } from '../../kernel/registry.js';
import { scheduleSave } from '../../kernel/persist.js';
import { formatEniText } from '../../kernel/eniField.js';
import { enhanceSelects } from '../../kernel/dropdown.js';
import { loadMapLibre, createMap, hoverTip, emptyFC } from '../../kernel/mapgl.js';
import { attachCadastreGL } from '../../kernel/cadastreLayersGL.js';
import { fillAdmin, pointOf } from '../../kernel/darekAdmin.js';
import { allAimaks, aimakAt, estimateAimak, loadSeed, seedAdmOf, exportSeed, exportParcels, freeCell, aimaksInCell, CELL, allParcelStats, loadParcelsSeed } from '../../kernel/landStats.js';
import { buildCube, summarize as parcelSum, parcelsHTML } from './parcels.js';
import { dossierHTML, patchesOf, pickPatches, dossierSheets } from './dossier.js';
import { downloadXlsx } from '../../kernel/xlsx.js';
import { go } from '../../kernel/router.js';

const SEARCH_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
// Типы ОЦ с участком (у ТС и механизмов земли нет).
const LAND_TYPES = new Set(['residential-house', 'apartment', 'civil', 'land-plot']);
// Доля занятого — 5 ступеней одного синего (последовательная шкала, светлое —
// мало занято); незанятая земля — оранжевым поверх (другая сущность — другой цвет).
const STEPS = [
  { to: 0.2, color: '#cde2fb', label: 'до 20 %' },
  { to: 0.4, color: '#9ec5f4', label: '20–40 %' },
  { to: 0.6, color: '#5598e7', label: '40–60 %' },
  { to: 0.8, color: '#256abf', label: '60–80 %' },
  { to: 1.01, color: '#104281', label: '80–100 %' },
];
const FREE_COLOR = '#e8730c';
// Части аймака векторного расчёта (tools/analytics/land_pipeline.py, файлы
// app/data/analytics/free/<код>.json): свободное — по зонам покрова ESA
// WorldCover; непригодное и занятое без ЕНИ — своими цветами.
export const PARTS = [
  { key: 'farm', label: 'Пашня', color: '#f2a73b', free: true },
  { key: 'grass', label: 'Луга и пастбища', color: '#f6d365', free: true },
  { key: 'shrub', label: 'Кустарник', color: '#b5c94f', free: true },
  { key: 'wood', label: 'Деревья', color: '#5fa35a', free: true },
  { key: 'built', label: 'Застроенная территория', color: '#e8730c', free: true },
  { key: 'bare', label: 'Голая земля, скалы, снег', color: '#c9b49a', free: true },
  { key: 'none', label: 'Без класса', color: '#f0b27a', free: true },
  { key: 'bld', label: 'Здания без ЕНИ (по снимкам)', color: '#c2185b' },
  { key: 'water', label: 'Вода и русла', color: '#4fa3d9' },
  { key: 'relief', label: 'Овраги, обрывы, крутые склоны', color: '#8d6e63' },
  { key: 'roads', label: 'Дороги', color: '#8a96a8' },
  { key: 'strips', label: 'Узкие полосы (непригодны)', color: '#b9b9b9' },
  { key: 'small', label: 'Клочки (непригодны)', color: '#9e9e9e' },
];
const PART_COLOR = ['match', ['get', 'zone'], ...PARTS.flatMap((x) => [x.key, x.color]), '#e8730c'];
const isVec = (a) => !!(a && a.occ && a.occ.zones);
const vecUrl = (code) => `./app/data/analytics/free/${String(code).replace(/,/g, '_')}.json`;
const ROAD_COLOR = '#8a96a8';
// Доли аймака: занято, под дорогами, не занято (у расчётов до дорог — без дорог).
const roadSh = (o) => (o && o.roadsShare) || 0;
const freeSh = (o) => (o ? (o.freeShare != null ? o.freeShare : 1 - o.share) : 0);
const roadHa = (o) => (o && o.roadsHa) || 0;
// Незанятая земля — картинка ≈ 30 м на точку: издали показывает, где не занято;
// вблизи её клетки видны (замечание пользователя 04.11.2026 «Что за квадраты?»),
// а незанятое и так видно промежутками между участками Кадастра — с 12 она
// тает и к 14 уходит. Сглаживание — без клеток при любом масштабе.
const FREE_OPACITY = ['interpolate', ['linear'], ['zoom'], 11.5, 0.55, 13.6, 0.55, 14.1, 0];
// Вблизи (с 13,6) — клетки по координатам (landStats.freeCell): контуры аймаков
// минус участки Кадастра минус дороги; остаются на карте, дорисовываются при движении.
const VIEW_ZOOM = 13.4;
const VIEW_OPACITY = ['interpolate', ['linear'], ['zoom'], 13.6, 0, 14.1, 0.55];
const merc3857 = ([lon, lat]) => [lon * 20037508.34 / 180, Math.log(Math.tan((90 + lat) * Math.PI / 360)) * 20037508.34 / Math.PI];

// Единицы площади (пользователь 04.11.2026: «Единицы измерения тоже
// подтягиваем»): как у величин с несколькими единицами в системе (kernel/
// fieldSpec.js) — выбор списком рядом с числом; сокращение с точкой, полное — в
// подсказке. Хранятся гектары, показ — в выбранной; выбор общий на страницу и
// запоминается. s / f — знаков после запятой коротко (список, итоги) и в таблице.
const UNITS = [
  { key: 'ha', label: 'га', full: 'гектары', k: 1, s: 0, f: 2 },
  { key: 'km', label: 'км²', full: 'квадратные километры', k: 0.01, s: 1, f: 2 },
  { key: 'm', label: 'м²', full: 'квадратные метры', k: 10000, s: 0, f: 0 },
  { key: 'sot', label: 'сот.', full: 'сотки (1 сотка = 100 м²)', k: 100, s: 0, f: 0 },
];
const UNIT_KEY = 'inside.analytics.unit';
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: единица и порядок — личные настройки пользователя.
const unitSaved = () => { try { return localStorage.getItem(UNIT_KEY) || 'ha'; } catch (e) { return 'ha'; } };
// Порядок списка и таблицы: по смыслу аналитики — где больше незанятого, где выше занятость.
const SORTS = [
  { key: 'place', label: 'По области и району' },
  { key: 'free', label: 'Больше незанятой земли' },
  { key: 'share-', label: 'Ниже занятость' },
  { key: 'share', label: 'Выше занятость' },
  { key: 'area', label: 'Больше площадь' },
  { key: 'oc', label: 'Больше ОЦ системы' },
];
const nf = (n, d = 2) => (n == null || !Number.isFinite(n) ? '' : n.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (x) => (x == null || !Number.isFinite(x) ? '' : (x * 100).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %');
const dateOf = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '');
const digits = (s) => String(s || '').replace(/\D/g, '');
const numIn = (v) => { const n = parseFloat(String(v || '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

// Точка подписи аймака: середина самого большого кольца (у аймаков из
// нескольких частей середина общей рамки бывает вне аймака).
function labelPoint(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let best = null;
  let bestN = -1;
  polys.forEach((rings) => { if (rings[0] && rings[0].length > bestN) { best = rings[0]; bestN = rings[0].length; } });
  if (!best) return null;
  const x = best.reduce((t, c) => t + c[0], 0) / best.length;
  const y = best.reduce((t, c) => t + c[1], 0) / best.length;
  return [x, y];
}

// Рамка контура [[запад, юг], [восток, север]].
function boundsOf(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let b = null;
  polys.forEach((rings) => rings[0].forEach(([x, y]) => {
    b = b ? [[Math.min(b[0][0], x), Math.min(b[0][1], y)], [Math.max(b[1][0], x), Math.max(b[1][1], y)]] : [[x, y], [x, y]];
  }));
  return b;
}

export function mountAnalytics(host) {
  const { scope } = host;
  const view = {
    q: '', oblast: '', district: '', shareFrom: '', shareTo: '', freeFrom: '', onlyDone: false,
    open: new Set(), sel: '', layers: { share: true, free: true, objs: true, cad: true },
    mode: 'map', hideList: false, facets: false, unit: unitSaved(), sort: 'place', hov: '',
    pf: {}, pm: 'count',
    // Досье аймака: код, вкладка, отбор массивов, свой отбор срезов участков, выбранный массив.
    dossier: (host.route && host.route.query && host.route.query.a) || '', dtab: 'overview',
    dcfg: { min: 0.1, zones: new Set() }, dpf: {}, dpick: 0,
    pickSet: new Set(),   // аймаки, отмеченные для досье набора
    lgShut: (() => { try { return localStorage.getItem('inside.analytics.legend') === '0'; } catch (e) { return false; } })(),   // «Участки»: отбор срезов (ключ среза → набор значений) и мера
  };
  const U = () => UNITS.find((u) => u.key === view.unit) || UNITS[0];
  // Площадь из гектаров в выбранной единице: short — список и итоги, иначе — таблица.
  const ar = (ha, short = true) => (ha == null || !Number.isFinite(ha) ? '' : nf(ha * U().k, short ? U().s : U().f));
  const ul = () => U().label;
  const unitAbbr = () => `<abbr title="${esc(U().full)}">${esc(U().label)}</abbr>`;
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MOVE_MS = reduce ? 0 : 650;   // перелёт карты к аймаку
  let sceneEl = null;
  const runs = new Map();   // код аймака → { done, total, ctrl, error }
  let batch = null;         // «Посчитать показанные»: { left, ctrl }
  let binding = { busy: false, error: '' };
  let dead = false;
  let gl = null;
  let map = null;
  let tip = null;

  // ОЦ с участком: запись, тип, заголовок, ссылка.
  const objects = () => {
    const out = [];
    OC_TYPES.filter((t) => LAND_TYPES.has(t.manifest.id)).forEach((t) => {
      const recs = t.records.allRecords ? t.records.allRecords() : [];
      recs.forEach((rec) => {
        if (!rec || !rec.id) return;
        let title = rec.address || rec.title || rec.id;
        try { if (t.records.summarize) title = t.records.summarize(rec).title || title; } catch (e) { /* сводка не собралась — адрес */ }
        out.push({ rec, typeId: t.manifest.id, typeLabel: t.manifest.label || '', title, href: `#/oc/${t.manifest.id}/${rec.id}` });
      });
    });
    return out;
  };

  const rows = () => {
    const by = new Map();
    objects().forEach((o) => { const c = o.rec.adm && o.rec.adm.aimakCode; if (c) (by.get(c) || by.set(c, []).get(c)).push(o); });
    const place = (x, y) => (x.a.oblast || '').localeCompare(y.a.oblast || '', 'ru') || (x.a.district || '').localeCompare(y.a.district || '', 'ru') || (x.a.aimak || '').localeCompare(y.a.aimak || '', 'ru');
    // Непосчитанные — в конце любого порядка по занятости.
    const num = (f) => (x, y) => { const a = f(x); const b = f(y); return (a == null) - (b == null) || (b - a) || place(x, y); };
    const by2 = {
      place, free: num((r) => (r.a.occ ? r.a.occ.freeHa : null)), share: num((r) => (r.a.occ ? r.a.occ.share : null)),
      'share-': num((r) => (r.a.occ ? -r.a.occ.share : null)), area: num((r) => r.a.areaHa), oc: num((r) => r.objs.length),
    };
    return allAimaks().map((a) => ({ a, objs: by.get(a.code) || [] })).sort(by2[view.sort] || place);
  };

  const matches = (r) => {
    const a = r.a;
    if (view.oblast && a.oblast !== view.oblast) return false;
    if (view.district && a.district !== view.district) return false;
    const sf = numIn(view.shareFrom);
    const st = numIn(view.shareTo);
    const ff = numIn(view.freeFrom);
    if ((view.onlyDone || sf != null || st != null || ff != null) && !a.occ) return false;
    if (sf != null && a.occ.share * 100 < sf) return false;
    if (st != null && a.occ.share * 100 > st) return false;
    if (ff != null && a.occ.freeHa < ff / U().k) return false;
    const q = view.q.trim().toLowerCase();
    if (!q) return true;
    const qd = digits(q);
    const text = [a.aimak, a.code, a.district, a.oblast, ...r.objs.map((o) => `${o.title} ${o.rec.eni || ''} ${(o.rec.adm && o.rec.adm.quarter) || ''}`)].join(' ').toLowerCase();
    return text.includes(q) || (qd.length >= 4 && r.objs.some((o) => digits(o.rec.eni).includes(qd)));
  };

  const options = (list, cur, all) => `<option value="">${all}</option>${[...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'))
    .map((v) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('')}`;

  // --- островки: отбор, режим, итоги ---
  const facetCount = () => [view.shareFrom, view.shareTo, view.freeFrom].filter((v) => numIn(v) != null).length + (view.onlyDone ? 1 : 0);
  const islesHTML = (all, shown) => {
    const done = shown.filter((r) => r.a.occ);
    const area = done.reduce((s, r) => s + r.a.areaHa, 0);
    const occ = done.reduce((s, r) => s + r.a.occ.occHa, 0);
    const rds = done.reduce((s, r) => s + roadHa(r.a.occ), 0);
    const fre = done.reduce((s, r) => s + r.a.occ.freeHa, 0);
    const todo = shown.filter((r) => !r.a.occ && !runs.has(r.a.code)).length;
    const fc = facetCount();
    const kv = (label, value, sub = '', cls = '') => `<span class="an-kv${cls}"><span>${label}</span><b>${value}</b>${sub ? `<i>${sub}</i>` : ''}</span>`;
    return `<div class="an-isl an-isl-filter">
        <span class="isearch">${SEARCH_ICON}<input data-an-q value="${esc(view.q)}" autocomplete="off" placeholder="Айыл аймак, код, ЕНИ, адрес" aria-label="Поиск по аймакам и объектам">
          ${view.q ? '<button class="isearch-clear" data-an-q-clear title="Очистить" aria-label="Очистить поиск">×</button>' : ''}</span>
        <select class="select an-f" data-an-oblast aria-label="Область">${options(all.map((r) => r.a.oblast), view.oblast, 'Все области')}</select>
        <select class="select an-f" data-an-district aria-label="Район">${options(all.filter((r) => !view.oblast || r.a.oblast === view.oblast).map((r) => r.a.district), view.district, 'Все районы')}</select>
        ${view.district && all.some((r) => r.a.district === view.district && isVec(r.a)) ? `<button type="button" class="btn btn-ghost an-fbtn" data-ad-open="${esc('d:' + view.district)}" title="Подробная аналитика по всем посчитанным аймакам района">Досье района</button>` : ''}
        ${view.pickSet.size > 1 ? `<button type="button" class="btn btn-primary an-fbtn" data-ad-open="${esc('m:' + [...view.pickSet].join('|'))}">Досье выбранных · ${view.pickSet.size}</button>` : ''}
        <button type="button" class="btn btn-ghost an-fbtn${view.facets ? ' on' : ''}" data-an-facets aria-expanded="${view.facets}" aria-controls="anFacets">Отбор${fc ? `<b>${fc}</b>` : ''}</button>
      </div>
      <div class="an-isl an-isl-sum">
        <span class="an-seg" role="group" aria-label="Вид">
          <button type="button" class="itab${view.mode === 'map' ? ' on' : ''}" data-an-mode="map" aria-pressed="${view.mode === 'map'}">Карта</button>
          <button type="button" class="itab${view.mode === 'table' ? ' on' : ''}" data-an-mode="table" aria-pressed="${view.mode === 'table'}">Таблица</button>
          <button type="button" class="itab${view.mode === 'parcels' ? ' on' : ''}" data-an-mode="parcels" aria-pressed="${view.mode === 'parcels'}" title="Сводка по участкам с ЕНИ: собственность, вид использования, назначение, метки — со срезами">Участки</button>
        </span>
        ${kv('Посчитано', `${done.length} из ${shown.length}`)}
        ${kv(`Площадь, ${unitAbbr()}`, ar(area), '', ' an-kv-area')}
        ${kv(`Занято, ${unitAbbr()}`, ar(occ), area ? pct(occ / area) : '')}
        ${kv(`Дороги, ${unitAbbr()}`, ar(rds), area ? pct(rds / area) : '', ' an-kv-area')}
        ${kv(`Не занято, ${unitAbbr()}`, ar(fre), area ? pct(fre / area) : '')}
        ${batch ? `<span class="an-run" role="status">осталось: ${batch.left}</span><button type="button" class="btn btn-ghost btn-sm" data-an-batch-stop>Стоп</button>`
          : `<button type="button" class="btn btn-primary" data-an-batch ${todo ? '' : 'disabled'} title="${todo ? 'Посчитать по очереди непосчитанные аймаки из показанных' : 'Все показанные посчитаны'}"><span class="an-long">Посчитать показанные</span><span class="an-short">Посчитать</span>${todo ? ` · ${todo}` : ''}</button>`}
      </div>`;
  };
  const facetsHTML = () => `<div class="an-facets-in">
      <label class="an-range" title="Доля площади аймака под участками с ЕНИ"><span>Занято, %</span>
        <input class="an-num" data-an-f="shareFrom" inputmode="decimal" value="${esc(view.shareFrom)}" placeholder="от" aria-label="Занято, % от">
        <input class="an-num" data-an-f="shareTo" inputmode="decimal" value="${esc(view.shareTo)}" placeholder="до" aria-label="Занято, % до"></label>
      <label class="an-range" title="Незанятая площадь аймака не меньше, ${esc(U().full)}"><span>Не занято, ${esc(ul())}</span>
        <input class="an-num an-num-w" data-an-f="freeFrom" inputmode="decimal" value="${esc(view.freeFrom)}" placeholder="от" aria-label="Не занято, ${esc(ul())} от"></label>
      <label class="an-check"><input type="checkbox" data-an-done ${view.onlyDone ? 'checked' : ''}> Только посчитанные</label>
      ${facetCount() ? '<button type="button" class="btn btn-ghost btn-sm" data-an-facets-clear>Сбросить</button>' : ''}
    </div>`;
  const statusText = (all, shown) => {
    const objs = objects();
    const withPoint = objs.filter((o) => pointOf(o.rec)).length;
    const bound = objs.filter((o) => o.rec.adm && o.rec.adm.aimakCode).length;
    return `ОЦ с точкой на карте: ${withPoint} · привязано к аймаку: ${bound}${binding.busy ? ' · идёт привязка…' : ''}${binding.error ? ` · ${esc(binding.error)}` : ''} · аймаков: ${all.length} · показано: ${shown.length}`;
  };

  // --- панель списка: строки-карточки ---
  const listHTML = (all, shown) => {
    // Пока идёт привязка — серые карточки той же высоты, что строки: список не прыгает, когда приходят данные.
    if (!all.length && binding.busy) return `<ul class="an-items an-skel" aria-hidden="true">${'<li class="an-item"><i></i><i></i><i></i></li>'.repeat(5)}</ul><p class="sr-only" role="status">Привязываю объекты к аймакам…</p>`;
    if (!all.length) return '<p class="an-empty-page">Нет объектов с точкой на карте: аймаки появятся, когда у объектов будут координаты участка или GPS.</p>';
    if (!shown.length) return '<p class="an-empty-page">Ничего не найдено</p>';
    return `<ul class="an-items">${shown.map((r) => {
      const a = r.a;
      const open = view.open.has(a.code);
      const run = runs.get(a.code);
      const going = run && !run.error && run.done < run.total;
      const sw = a.occ ? STEPS.find((x) => a.occ.share < x.to).color : '';
      return `<li class="an-item${open ? ' open' : ''}${view.sel === a.code ? ' sel' : ''}${view.hov === a.code ? ' hov' : ''}" data-an-open="${esc(a.code)}" aria-expanded="${open}" tabindex="0">
        <div class="an-it-h">${isVec(a) ? `<input type="checkbox" class="an-pick" data-an-pick="${esc(a.code)}" ${view.pickSet.has(a.code) ? 'checked' : ''} aria-label="Отметить «${esc(a.aimak)}» для досье набора" title="В досье набора">` : ''}${sw ? `<span class="an-sw" style="background:${sw}" aria-hidden="true"></span>` : ''}<b>${esc(a.aimak)}</b>
          <span class="an-it-share num">${a.occ ? pct(a.occ.share) : ''}</span></div>
        <div class="an-it-s"><span>${esc([a.code, a.district, a.oblast].filter(Boolean).join(' · '))}</span>
          <span class="num">${a.occ ? `не занято ${ar(a.occ.freeHa)} ${esc(ul())}` : ''}</span></div>
        ${a.occ ? mbarHTML(a) : ''}
        <div class="an-it-m"><span class="num">площадь ${ar(a.areaHa)} ${esc(ul())}${a.balance ? ` · по балансу ${ar(a.balance.total)}` : ''}${r.objs.length ? ` · ОЦ ${r.objs.length}` : ''}</span>
          <span class="an-it-act">${isVec(a) ? `<button type="button" class="btn btn-ghost btn-sm" data-ad-open="${esc(a.code)}" title="Подробная аналитика аймака">Досье</button>` : ''}${runCell(a)}</span></div>
        ${going ? `<div class="an-bar" aria-hidden="true"><i style="transform:scaleX(${(run.done / run.total).toFixed(3)})"></i></div>` : ''}
        ${open ? detailHTML(r) : ''}
      </li>`;
    }).join('')}</ul>`;
  };

  const runCell = (a) => {
    const r = runs.get(a.code);
    if (r && !r.error && r.done < r.total) {
      return `<span class="an-run" role="status">квадратов ${r.done} из ${r.total}</span>
        <button type="button" class="btn btn-ghost btn-sm" data-an-stop="${esc(a.code)}">Стоп</button>`;
    }
    // Векторный расчёт (источники, база, очистка) — инструментом, не в браузере: браузерный пересчёт затёр бы его.
    if (isVec(a)) return `<span class="an-vec" title="${esc(a.occ.by || '')}. Пересчёт — python tools/analytics/land_pipeline.py --aimak «${esc(a.aimak)}»">по векторам · ${esc(dateOf(a.occ.at))}</span>`;
    const label = a.occ ? 'Пересчитать' : 'Посчитать';
    const title = a.occ ? `Посчитано ${dateOf(a.occ.at)}: участков ${a.occ.parcels.toLocaleString('ru-RU')}` : 'Занятость участками с ЕНИ — по контурам Кадастра в границах аймака';
    return `${r && r.error ? `<span class="an-err" title="${esc(r.error)}">не посчитано</span>` : ''}
      <button type="button" class="btn btn-ghost btn-sm" data-an-run="${esc(a.code)}" title="${esc(title)}">${label}</button>`;
  };

  // Полоска частей аймака: занято · дороги · вода · рельеф · без ЕНИ · непригодно · свободно.
  const partsOf = (a) => {
    const o = a.occ;
    const A = a.areaHa || 1;
    if (!isVec(a)) return [['o', o.share, 'занято'], ['r', roadSh(o), 'дороги'], ['f', freeSh(o), 'не занято']];
    return [['o', o.occHa / A, 'занято'], ['r', (o.roadsHa || 0) / A, 'дороги'], ['w', (o.waterHa || 0) / A, 'вода'], ['l', (o.reliefHa || 0) / A, 'рельеф'],
      ['b', (o.bldHa || 0) / A, 'здания без ЕНИ'], ['u', ((o.stripsHa || 0) + (o.smallHa || 0)) / A, 'непригодно'], ['f', o.freeHa / A, 'свободно']];
  };
  const mbarHTML = (a) => {
    const ps = partsOf(a).filter((x) => x[1] > 0.0005);
    return `<div class="an-mbar" role="img" aria-label="${esc(ps.map((x) => `${x[2]} ${pct(x[1])}`).join(', '))}">${ps.map((x) => `<i class="${x[0]}" style="flex:${x[1].toFixed(4)} 1 0" title="${esc(x[2])} ${pct(x[1])}"></i>`).join('')}</div>`;
  };
  const vecHTML = (a) => {
    if (!isVec(a)) return '';
    const o = a.occ;
    const A = a.areaHa || 1;
    const row = (label, h, cls = '') => `<dt class="${cls}">${esc(label)}</dt><dd class="num ${cls}">${ar(h, false)} ${esc(ul())} · ${pct(h / A)}</dd>`;
    const c = o.cmp || {};
    const q = a.quality && a.quality.note;
    return `<div class="an-d-sec"><h3>Земли аймака по источникам</h3>
      <dl class="an-bal">${row('Занято участками с ЕНИ', o.occHa)}${row('Дороги', o.roadsHa || 0)}${row('Вода и русла', o.waterHa || 0)}
      ${row('Овраги, обрывы, крутые склоны', o.reliefHa || 0)}${row('Здания без ЕНИ (по снимкам)', o.bldHa || 0)}
      ${row('Узкие полосы и клочки — непригодны', (o.stripsHa || 0) + (o.smallHa || 0))}${row('Свободно', o.freeHa, 'an-bal-total')}</dl></div>
      <div class="an-d-sec"><h3>Свободно по покрову земли</h3>
      <dl class="an-bal">${PARTS.filter((x) => x.free && (o.zones[x.key] || 0) > 0).map((x) => `<dt><i class="an-dsw" style="background:${x.color}"></i>${esc(x.label)}</dt><dd class="num">${ar(o.zones[x.key], false)} ${esc(ul())}</dd>`).join('')}</dl></div>
      <div class="an-d-sec"><h3>Сверка источников</h3>
      <dl class="an-bal"><dt>Вода — OpenStreetMap</dt><dd class="num">${ar(c.waterOsmHa || 0, false)} ${esc(ul())}</dd>
      <dt>Вода — ESA WorldCover</dt><dd class="num">${ar(c.waterWcHa || 0, false)} ${esc(ul())}</dd>
      <dt>Вода — в обоих</dt><dd class="num">${ar(c.waterBothHa || 0, false)} ${esc(ul())}</dd>
      <dt>Рельеф — OpenStreetMap</dt><dd class="num">${ar(c.reliefOsmHa || 0, false)} ${esc(ul())}</dd>
      <dt>Склоны круче ${esc(String(o.slope || 12))}° — Copernicus DEM</dt><dd class="num">${ar(c.steepHa || 0, false)} ${esc(ul())}</dd>
      <dt>Зданий по снимкам · из них вне ЕНИ</dt><dd class="num">${(c.buildings || 0).toLocaleString('ru-RU')} · ${(c.buildingsNoEni || 0).toLocaleString('ru-RU')}</dd></dl>
      ${c.parcelsOnWater && Object.keys(c.parcelsOnWater).length ? `<h3 class="an-d-sub">Участки с ЕНИ на воде (20 % площади и больше)</h3>
      <dl class="an-bal">${Object.entries(c.parcelsOnWater).sort((x, y) => y[1].n - x[1].n).map(([f, v]) => `<dt>${esc(f)}</dt><dd class="num">${v.n.toLocaleString('ru-RU')} уч. · ${ar(v.ha, false)} ${esc(ul())}</dd>`).join('')}</dl>` : ''}
      <p class="an-d-note">Узкие полосы — уже ${esc(String(o.strip))} м, клочки — меньше ${esc(String(o.minPatch))} м²; здания без ЕНИ — с двором ${esc(String(o.bldYard))} м.${q ? ` Контур Дарека: ${esc(q)}.` : ''}</p></div>`;
  };
  const detailHTML = ({ a, objs }) => {
    const tot = a.balance && a.balance.total;
    const bal = a.balance && a.balance.parts && a.balance.parts.length ? `<div class="an-d-sec"><h3>Земельный баланс аймака, ${unitAbbr()}</h3>
      <dl class="an-bal">${a.balance.parts.map((p) => `<dt>${esc(p.label)}</dt><dd class="num">${ar(p.ha)}</dd>
        ${tot ? `<span class="an-bb" aria-hidden="true"><i style="width:${Math.min(100, (p.ha / tot) * 100).toFixed(2)}%"></i></span>` : ''}`).join('')}
      <dt class="an-bal-total">Всего</dt><dd class="num an-bal-total">${ar(tot)}</dd></dl></div>` : '';
    const occ = a.occ ? `<div class="an-d-sec"><h3>Занятость участками с ЕНИ</h3>
      <dl class="an-bal"><dt>Занято</dt><dd class="num">${ar(a.occ.occHa, false)} ${esc(ul())} · ${pct(a.occ.share)}</dd>
      <dt>Под дорогами</dt><dd class="num">${a.occ.roadsShare != null ? `${ar(roadHa(a.occ), false)} ${esc(ul())} · ${pct(roadSh(a.occ))}` : 'не посчитано'}</dd>
      <dt>Не занято</dt><dd class="num">${ar(a.occ.freeHa, false)} ${esc(ul())} · ${pct(freeSh(a.occ))}</dd>
      <dt>ГФСУ</dt><dd class="num">${ar(a.occ.gfsuHa, false)} ${esc(ul())} · ${pct(a.occ.gfsuShare)}</dd>
      <dt>Участков в расчёте</dt><dd class="num">${a.occ.parcels.toLocaleString('ru-RU')}</dd></dl>
      <p class="an-d-note">Посчитано ${dateOf(a.occ.at)}: занято — по контурам участков Кадастра в границах аймака; дороги — по OpenStreetMap, ширина по классу дороги (оценка)${a.occ.roadsMissing ? `, без дорог в квадратах: ${a.occ.roadsMissing}` : ''}; ГФСУ — по слою карты «Дарек».</p></div>` : '';
    const list = objs.length ? `<div class="an-d-sec an-d-objs"><h3>ОЦ системы в аймаке</h3>
      <table class="an-objs"><thead><tr><th>ЕНИ</th><th>Объект</th><th>Квартал</th><th>Земли в точке</th></tr></thead><tbody>
      ${objs.map((o) => {
        const ad = o.rec.adm || {};
        const lands = (ad.lands || []).map((l) => [l.kind, l.use, l.area, l.eni && `ЕНИ ${l.eni}`, l.note].filter(Boolean).join(', ')).join('; ');
        return `<tr><td class="an-eni">${esc(o.rec.eni ? formatEniText(digits(o.rec.eni).slice(0, 13)) : '—')}</td>
          <td><a href="${esc(o.href)}">${esc(o.title)}</a><span class="an-sub">${esc(o.typeLabel)}${ad.by ? ` · точка: ${esc(ad.by)}` : ''}</span></td>
          <td>${esc(ad.quarter || '')}${ad.coate ? `<span class="an-sub">СОАТЕ ${esc(ad.coate)}</span>` : ''}</td>
          <td>${esc(lands || '—')}</td></tr>`;
      }).join('')}</tbody></table></div>` : '';
    return `<div class="an-detail">${bal}${isVec(a) ? vecHTML(a) : occ}${list}</div>`;
  };

  // Шапка с сортировкой: щелчок — этот порядок (aria-sort для чтения с экрана).
  const SORT_OF = { area: 'area', free: 'free', share: 'share', oc: 'oc' };
  const th = (key, label, title) => {
    const on = view.sort === SORT_OF[key] || (key === 'share' && view.sort === 'share-');
    const dir = on ? (view.sort === 'share-' ? 'ascending' : 'descending') : 'none';
    return `<th class="num an-th-sort${on ? ' on' : ''}" aria-sort="${dir}" title="${esc(title)}"><button type="button" data-an-sort="${key}">${label}${on ? `<span aria-hidden="true">${dir === 'ascending' ? '▲' : '▼'}</span>` : ''}</button></th>`;
  };
  const unitsHTML = () => `<span class="an-units" role="group" aria-label="Единицы площади">${UNITS.map((u) => `<button type="button" class="${u.key === view.unit ? 'on' : ''}" data-an-unit="${u.key}" aria-pressed="${u.key === view.unit}" title="${esc(u.full)}">${esc(u.label)}</button>`).join('')}</span>`;
  const tableHTML = (all, shown) => {
    if (!all.length) return `<p class="an-empty-page">${binding.busy ? 'Привязываю объекты к аймакам…' : 'Нет объектов с точкой на карте.'}</p>`;
    const done = shown.filter((r) => r.a.occ);
    const sum = (f) => done.reduce((s, r) => s + (f(r.a) || 0), 0);
    const tArea = sum((a) => a.areaHa);
    const tOcc = sum((a) => a.occ.occHa);
    const body = shown.map((r) => {
      const a = r.a;
      const open = view.open.has(a.code);
      return `<tr class="an-row${open ? ' open' : ''}${view.sel === a.code ? ' sel' : ''}" data-an-open="${esc(a.code)}" aria-expanded="${open}" tabindex="0">
          <td class="an-name"><span class="an-caret" aria-hidden="true">${open ? '▾' : '▸'}</span>${a.occ ? `<span class="an-sw" style="background:${STEPS.find((s) => a.occ.share < s.to).color}" aria-hidden="true"></span>` : ''}<b>${esc(a.aimak)}</b><span class="an-sub">${esc(a.code)}</span></td>
          <td>${esc(a.district)}</td><td>${esc(a.oblast)}</td>
          <td class="num">${ar(a.areaHa, false)}</td>
          <td class="num">${a.balance ? ar(a.balance.total) : ''}</td>
          <td class="num">${a.occ ? ar(a.occ.occHa, false) : ''}</td>
          <td class="num">${a.occ && a.occ.roadsShare != null ? ar(roadHa(a.occ), false) : ''}</td>
          <td class="num">${a.occ ? ar(a.occ.freeHa, false) : ''}</td>
          <td class="num">${a.occ ? pct(a.occ.share) : ''}</td>
          <td class="num">${a.occ ? ar(a.occ.gfsuHa, false) : ''}</td>
          <td class="num">${r.objs.length || ''}</td>
          <td class="an-act">${runCell(a)}</td>
        </tr>${open ? `<tr class="an-drow"><td colspan="12">${detailHTML(r)}</td></tr>` : ''}`;
    }).join('');
    return `<div class="an-sheet-h"><b>Айыл аймаки</b><span class="an-sheet-n">показано ${shown.length} из ${all.length} · посчитано ${done.length}</span>${unitsHTML()}</div>
      <div class="icols an-wrap"><table class="itbl an-tbl">
        <colgroup><col class="c-name"><col class="c-dist"><col class="c-obl"><col class="c-n"><col class="c-n"><col class="c-n"><col class="c-n"><col class="c-n"><col class="c-p"><col class="c-n"><col class="c-oc"><col class="c-act"></colgroup>
        <thead><tr>
          <th>Айыл аймак</th><th>Район</th><th>Область</th>
          ${th('area', `Площадь, ${esc(ul())}`, `Площадь аймака по его контуру на карте «Дарек», ${U().full}`)}
          <th class="num" title="Общая площадь по земельному балансу аймака (Кадастр), ${esc(U().full)}">По балансу, ${esc(ul())}</th>
          <th class="num" title="Площадь под участками с ЕНИ в границах аймака, ${esc(U().full)}">Занято, ${esc(ul())}</th>
          <th class="num" title="Площадь под дорогами вне участков с ЕНИ (OpenStreetMap, ширина по классу), ${esc(U().full)}">Дороги, ${esc(ul())}</th>
          ${th('free', `Не занято, ${esc(ul())}`, `Площадь аймака без участков с ЕНИ и дорог, ${U().full}`)}
          ${th('share', 'Занято', 'Доля площади аймака под участками с ЕНИ')}
          <th class="num" title="Государственный фонд сельскохозяйственных угодий, ${esc(U().full)}">ГФСУ, ${esc(ul())}</th>
          ${th('oc', 'ОЦ', 'Объектов оценки системы в аймаке')}
          <th><span class="sr-only">Расчёт</span></th>
        </tr></thead>
        <tbody>${body || '<tr><td colspan="12" class="an-empty">Ничего не найдено</td></tr>'}</tbody>
        ${done.length ? `<tfoot><tr><td colspan="3">Итого по посчитанным: ${done.length}</td><td class="num">${ar(tArea, false)}</td><td></td>
          <td class="num">${ar(tOcc, false)}</td><td class="num">${ar(sum((a) => roadHa(a.occ)), false)}</td><td class="num">${ar(sum((a) => a.occ.freeHa), false)}</td><td class="num">${pct(tArea ? tOcc / tArea : null)}</td>
          <td class="num">${ar(sum((a) => a.occ.gfsuHa), false)}</td><td colspan="2"></td></tr></tfoot>` : ''}
      </table></div>`;
  };

  // --- карта ---
  // Легенда — она же переключатель слоёв (практика legend-interactive: щелчок по
  // строке легенды прячет и показывает слой). Занятость — непрерывной шкалой
  // ступеней 0–100 %; «не посчитано» и дороги — без переключателя (это не слои).
  const legendHTML = () => {
    const row = (key, swatch, label, title = '') => `<label class="an-lg-row"${title ? ` title="${esc(title)}"` : ''}>
        <input type="checkbox" class="an-sw-in" data-an-layer="${key}" ${view.layers[key] ? 'checked' : ''}>
        <span class="an-switch" aria-hidden="true"></span>${swatch}<span>${label}</span></label>`;
    const ramp = `<span class="an-ramp" aria-hidden="true">${STEPS.map((x) => `<i style="background:${x.color}"></i>`).join('')}</span>`;
    return `<section class="an-legend" aria-label="Легенда и слои карты">
      <button type="button" class="an-lg-h" data-an-lg-toggle aria-expanded="${!view.lgShut}" aria-controls="anLgBody">Легенда<span aria-hidden="true">${view.lgShut ? '▸' : '▾'}</span></button>
      <div class="an-lg-body" id="anLgBody" ${view.lgShut ? 'hidden' : ''}>
      ${row('share', '', 'Занято участками с ЕНИ, %')}
      <div class="an-lg-ramp">${ramp}<span class="an-ramp-ticks" aria-hidden="true"><i>0</i><i>20</i><i>40</i><i>60</i><i>80</i><i>100</i></span>
        <span class="an-lg-note"><i class="an-lg-none" aria-hidden="true"></i>не посчитано</span></div>
      ${row('free', `<i class="an-lg-sw" style="background:${FREE_COLOR}" aria-hidden="true"></i>`, 'Части аймака: свободно и непригодно')}
      <ul class="an-lg-parts">${PARTS.map((x) => `<li><i style="background:${x.color}" aria-hidden="true"></i>${esc(x.label)}</li>`).join('')}</ul>
      ${row('objs', '<i class="an-lg-dot" aria-hidden="true"></i>', 'ОЦ системы')}
      ${row('cad', '<i class="an-lg-sw an-lg-cad" aria-hidden="true"></i>', 'Участки Кадастра вблизи')}
      </div>
    </section>`;
  };

  const freeIds = new Set();
  const vecIds = new Set();
  let vecShown = new Set();
  // Подписи аймаков на карте — HTML-метками (у подложки нет шрифтов для подписей
  // слоем); видны с приближения 8, едут вместе с картой (transform).
  const labels = new Map();
  let declutterRef = null;
  let cellsApi = null;   // клетки незанятой земли вблизи (mountMap)
  let cellSig = '';
  const syncLabels = (shown) => {
    const want = new Set(shown.map((r) => r.a.code));
    labels.forEach((m, c) => { if (!want.has(c)) { m.remove(); labels.delete(c); } });
    shown.forEach(({ a }) => {
      const pt = a.label || (a.geometry && labelPoint(a.geometry));
      if (!pt) return;
      const html = `<b>${esc(a.aimak)}</b>${a.occ ? `<span>${pct(a.occ.share)}</span>` : ''}`;
      let m = labels.get(a.code);
      if (!m) {
        // Прозрачность метки карта пишет в стиль самого элемента — видимость и
        // оформление подписи живут на вложенном (.an-lbl-in), его карта не трогает.
        const el = document.createElement('div');
        el.className = 'an-lbl';
        el.innerHTML = '<div class="an-lbl-in"></div>';
        m = new gl.Marker({ element: el, anchor: 'center' }).setLngLat(pt).addTo(map);
        labels.set(a.code, m);
      }
      const el = m.getElement().firstChild;
      if (el.innerHTML !== html) el.innerHTML = html;
      el.classList.toggle('sel', view.sel === a.code);
    });
  };
  let freeShown = new Set();
  const syncMap = (shown) => {
    if (!map || !map.getSource('aim')) return;
    const feats = shown.map(({ a, objs }) => ({
      type: 'Feature', geometry: a.geometry,
      properties: { code: a.code, share: a.occ ? a.occ.share : -1, sel: view.sel === a.code, dim: !!view.sel && view.sel !== a.code, oc: objs.length },
    }));
    map.getSource('aim').setData({ type: 'FeatureCollection', features: feats });
    const pts = shown.flatMap(({ objs }) => objs).map((o) => {
      const p = pointOf(o.rec);
      return p && { type: 'Feature', geometry: { type: 'Point', coordinates: [p[1], p[0]] }, properties: { title: o.title, href: o.href, eni: o.rec.eni || '' } };
    }).filter(Boolean);
    map.getSource('objs').setData({ type: 'FeatureCollection', features: pts });
    syncLabels(shown);
    if (declutterRef) declutterRef();
    // Клетки вблизи зависят от показанных посчитанных аймаков и даты расчёта — сменились, перерисовать.
    const sig = shown.filter((r) => r.a.occ).map((r) => r.a.code + '@' + r.a.occ.at).join('|');
    if (cellsApi && sig !== cellSig) { cellSig = sig; cellsApi.drop(); cellsApi.load(); }
    // Векторный расчёт — части аймака векторами (файл free/<код>.json), без картинки и клеток.
    shown.filter((r) => isVec(r.a)).forEach(({ a }) => {
      const id = 'fv-' + a.code;
      if (map.getSource(id)) {
        if (map.getSource(id)._at !== a.occ.at) { map.getSource(id).setData(vecUrl(a.code)); map.getSource(id)._at = a.occ.at; }
        return;
      }
      map.addSource(id, { type: 'geojson', data: vecUrl(a.code), tolerance: 0.2 });
      map.getSource(id)._at = a.occ.at;
      map.addLayer({ id, type: 'fill', source: id, paint: { 'fill-color': PART_COLOR, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.75, 15, 0.55] } }, 'aim-line');
      vecIds.add(a.code);
    });
    vecShown = new Set(shown.filter((r) => isVec(r.a)).map((r) => r.a.code));
    // Незанятая земля — картинка на посчитанный аймак (прежний расчёт по точкам).
    // Скрытые отбором не снимаются с карты, а прячутся: снятие во время загрузки
    // картинки обрывает её с ошибкой в консоли.
    freeShown = new Set(shown.filter((r) => r.a.occ && r.a.occ.free && !isVec(r.a)).map((r) => r.a.code));
    shown.filter((r) => freeShown.has(r.a.code)).forEach(({ a }) => {
      const id = 'free-' + a.code;
      const src = map.getSource(id);
      if (src) {
        if (src._at !== a.occ.at) { src.updateImage({ url: a.occ.free.url, coordinates: a.occ.free.coords }); src._at = a.occ.at; }
        return;
      }
      map.addSource(id, { type: 'image', url: a.occ.free.url, coordinates: a.occ.free.coords });
      map.getSource(id)._at = a.occ.at;
      map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': FREE_OPACITY, 'raster-fade-duration': 0, 'raster-resampling': 'linear' } }, 'aim-line');
      freeIds.add(a.code);
    });
    applyLayers();
  };

  const applyLayers = () => {
    if (!map) return;
    const vis = (on) => (on ? 'visible' : 'none');
    if (map.getLayer('aim-fill')) map.setLayoutProperty('aim-fill', 'visibility', vis(view.layers.share));
    freeIds.forEach((c) => map.setLayoutProperty('free-' + c, 'visibility', vis(view.layers.free && freeShown.has(c))));
    vecIds.forEach((c) => map.setLayoutProperty('fv-' + c, 'visibility', vis(view.layers.free && vecShown.has(c))));
    if (cellsApi) { cellsApi.all.forEach((c) => { if (map.getLayer(c.id)) map.setLayoutProperty(c.id, 'visibility', vis(view.layers.free)); }); if (view.layers.free) cellsApi.load(); }
    if (map.getLayer('objs')) map.setLayoutProperty('objs', 'visibility', vis(view.layers.objs));
    (map.getStyle().layers || []).filter((l) => l.source === 'cadP' || l.source === 'cadB')
      .forEach((l) => map.setLayoutProperty(l.id, 'visibility', vis(view.layers.cad)));
  };

  // Поля карты: слева — панель списка (если не скрыта), сверху — островки.
  const padding = () => {
    const list = scope.root.querySelector('.an-list');
    const wide = innerWidth > 1100;
    const dossierOn = !!view.dossier && view.mode === 'map';
    const left = wide && list && !view.hideList && !dossierOn ? list.getBoundingClientRect().width + 30 : 30;
    const dbox = scope.root.querySelector('.an-dossier');
    const right = wide && dossierOn && dbox ? dbox.getBoundingClientRect().width + 30 : 60;
    return { top: wide ? 80 : 30, bottom: 40, left, right };
  };
  const ease = (t) => 1 - (1 - t) ** 3;
  let pendingFly = '';   // выбор до загрузки карты — перелёт после неё
  const flyTo = (code) => {
    if (String(code).startsWith('d:') || String(code).startsWith('m:')) {
      const bs = membersOf(code).map((r) => boundsOf(r.a.geometry));
      if (map && bs.length) map.fitBounds(bs.reduce((x, y) => [[Math.min(x[0][0], y[0][0]), Math.min(x[0][1], y[0][1])], [Math.max(x[1][0], y[1][0]), Math.max(x[1][1], y[1][1])]]), { padding: padding(), maxZoom: 13, duration: MOVE_MS, easing: ease });
      return;
    }
    const a = allAimaks().find((x) => x.code === code);
    if (!map) { pendingFly = code; return; }
    if (a && a.geometry) map.fitBounds(boundsOf(a.geometry), { padding: padding(), maxZoom: 13, duration: MOVE_MS, easing: ease, essential: false });
  };

  const tipHTML = (code) => {
    const r = rows().find((x) => x.a.code === code);
    if (!r) return '';
    const a = r.a;
    return `<div class="an-tip"><b>${esc(a.aimak)}</b><span>${esc([a.district, a.oblast].filter(Boolean).join(', '))} · код ${esc(a.code)}</span>
      <dl><dt>Площадь</dt><dd>${ar(a.areaHa)} ${esc(ul())}</dd>
      ${a.occ ? `<dt>Занято</dt><dd>${ar(a.occ.occHa)} ${esc(ul())} · ${pct(a.occ.share)}</dd>${roadSh(a.occ) ? `<dt>Дороги</dt><dd>${ar(roadHa(a.occ))} ${esc(ul())} · ${pct(roadSh(a.occ))}</dd>` : ''}<dt>Не занято</dt><dd>${ar(a.occ.freeHa)} ${esc(ul())} · ${pct(freeSh(a.occ))}</dd>`
        : '<dt>Занятость</dt><dd>не посчитана</dd>'}
      ${r.objs.length ? `<dt>ОЦ системы</dt><dd>${r.objs.length}</dd>` : ''}</dl></div>`;
  };

  const mountMap = async () => {
    gl = await loadMapLibre(host.ensureStyle);
    if (dead) return;
    // Сцена — слоем под страницей в рабочей области каркаса (.main-row), как в «Осмотрах».
    sceneEl = document.createElement('div');
    sceneEl.className = 'an-scene';
    sceneEl.setAttribute('role', 'img');
    sceneEl.setAttribute('aria-label', 'Карта: аймаки по доле занятой земли, незанятая земля, объекты оценки');
    const row = document.querySelector('.main-row') || document.body;
    row.insertBefore(sceneEl, row.firstChild);
    map = await createMap(gl, sceneEl, { center: [74.6, 41.4], zoom: 5.6, fadeDuration: reduce ? 0 : 200 });
    if (dead) { map.remove(); return; }
    sceneEl._map = map;   // для сценариев проверки: масштаб и состояние карты
    attachCadastreGL(gl, map);
    const firstCad = (map.getStyle().layers || []).find((l) => l.source === 'cadP' || l.source === 'cadB');
    const before = firstCad ? firstCad.id : undefined;
    map.addSource('aim', { type: 'geojson', data: emptyFC(), promoteId: 'code' });
    map.addSource('objs', { type: 'geojson', data: emptyFC() });
    const color = ['step', ['get', 'share'], STEPS[0].color, ...STEPS.slice(1).flatMap((s, i) => [STEPS[i].to, s.color])];
    // Переходы раскраски — одной длительностью: посчитанный аймак проявляется, а не вспыхивает.
    const fade = { duration: reduce ? 0 : 300, delay: 0 };
    map.addLayer({ id: 'aim-fill', type: 'fill', source: 'aim', filter: ['>=', ['get', 'share'], 0],
      paint: { 'fill-color': color, 'fill-color-transition': fade, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 8, ['case', ['get', 'dim'], 0.28, 0.62], 12, ['case', ['get', 'dim'], 0.14, 0.3], 14, ['case', ['get', 'dim'], 0.04, 0.08]], 'fill-opacity-transition': fade } }, before);
    map.addLayer({ id: 'aim-hit', type: 'fill', source: 'aim', paint: { 'fill-color': '#000', 'fill-opacity': 0 } }, before);
    // Контур: посчитанный — сплошной, непосчитанный — пунктиром; выбранный — толще и темнее.
    const hovS = ['boolean', ['feature-state', 'hov'], false];
    const lineW = ['case', ['get', 'sel'], 3, hovS, 2.4, 1.2];
    const lineC = ['case', ['any', ['get', 'sel'], hovS], '#0d366b', '#1c5cab'];
    map.addLayer({ id: 'aim-line', type: 'line', source: 'aim', filter: ['>=', ['get', 'share'], 0], paint: { 'line-color': lineC, 'line-width': lineW } }, before);
    map.addLayer({ id: 'aim-line-none', type: 'line', source: 'aim', filter: ['<', ['get', 'share'], 0],
      paint: { 'line-color': lineC, 'line-width': lineW, 'line-dasharray': [2, 1.5] } }, before);
    map.addSource('dsel', { type: 'geojson', data: emptyFC() });
    map.addLayer({ id: 'dsel', type: 'line', source: 'dsel', paint: { 'line-color': ['case', ['get', 'pick'], '#0d366b', '#7a2e00'], 'line-width': ['case', ['get', 'pick'], 3.5, 1.4] } });
    map.addLayer({ id: 'objs', type: 'circle', source: 'objs',
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 4, 14, 7], 'circle-color': '#0d366b', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    tip = hoverTip(gl, map);
    // Незанятая земля вблизи — клетками CELL метров карты (как плитки): ближние к
    // середине — первыми, кольцо вокруг экрана — заранее, во время движения — раз
    // в 250 мс. Нарисованная клетка остаётся; больше 120 — дальние снимаются.
    const cellsOn = new Map();   // «i/j» → { id, url, b }
    const cellsWait = new Set();
    let cellQ = [];
    let cellRun = 0;
    let cellGen = 0;
    const cellShown = () => rows().filter(matches).map((r) => r.a).filter((a) => !isVec(a));
    const dropCells = () => {
      cellGen++;
      cellQ = [];
      cellsWait.clear();
      cellsOn.forEach((c) => { if (map.getLayer(c.id)) map.removeLayer(c.id); if (map.getSource(c.id)) map.removeSource(c.id); URL.revokeObjectURL(c.url); });
      cellsOn.clear();
    };
    const cellPump = () => {
      while (cellRun < 2 && cellQ.length) {
        const { key, b } = cellQ.shift();
        const gen = cellGen;
        cellRun++;
        freeCell(cellShown(), b).then((img) => {
          if (gen !== cellGen || dead || !map || !map.getStyle()) { if (img) URL.revokeObjectURL(img.url); return; }
          if (!img) return;
          const id = 'fc-' + key.replace('/', '_');
          map.addSource(id, { type: 'image', url: img.url, coordinates: img.coords });
          map.addLayer({ id, type: 'raster', source: id, layout: { visibility: view.layers.free ? 'visible' : 'none' },
            paint: { 'raster-opacity': VIEW_OPACITY, 'raster-fade-duration': 0 } }, 'aim-line');
          cellsOn.set(key, { id, url: img.url, b });
        }).catch((e) => console.warn('Клетка незанятой земли не нарисована', e))
          .finally(() => { cellsWait.delete(key); cellRun--; cellPump(); });
      }
    };
    const cellLoad = () => {
      if (!map || map.getZoom() < VIEW_ZOOM || !view.layers.free || view.mode !== 'map') return;
      const bb = map.getBounds();
      const [x1, y1] = merc3857([bb.getWest(), bb.getSouth()]);
      const [x2, y2] = merc3857([bb.getEast(), bb.getNorth()]);
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const shown = cellShown();
      for (let i = Math.floor(x1 / CELL) - 1; i <= Math.floor(x2 / CELL) + 1; i++) {
        for (let j = Math.floor(y1 / CELL) - 1; j <= Math.floor(y2 / CELL) + 1; j++) {
          const key = i + '/' + j;
          if (cellsOn.has(key) || cellsWait.has(key)) continue;
          const b = [i * CELL, j * CELL, (i + 1) * CELL, (j + 1) * CELL];
          if (!aimaksInCell(shown, b).length) continue;
          cellsWait.add(key);
          cellQ.push({ key, b });
        }
      }
      const d = (c) => Math.hypot((c.b[0] + c.b[2]) / 2 - cx, (c.b[1] + c.b[3]) / 2 - cy);
      cellQ.sort((p, q) => d(p) - d(q));
      // Дальние нарисованные — снять, если их много (память и число слоёв карты).
      if (cellsOn.size > 120) {
        [...cellsOn.entries()].map(([k, c]) => [k, c, d(c)]).sort((p, q) => q[2] - p[2]).slice(0, cellsOn.size - 120)
          .forEach(([k, c]) => { if (map.getLayer(c.id)) map.removeLayer(c.id); if (map.getSource(c.id)) map.removeSource(c.id); URL.revokeObjectURL(c.url); cellsOn.delete(k); });
      }
      cellPump();
    };
    let cellT = 0;
    map.on('move', () => { if (!cellT) cellT = setTimeout(() => { cellT = 0; cellLoad(); }, 250); });
    map.on('moveend', cellLoad);
    cellsApi = { drop: dropCells, load: cellLoad, all: cellsOn };
    // Подписи не налезают друг на друга: после остановки карты лишние прячутся;
    // первой — подпись выбранного аймака, дальше — по площади.
    const declutter = () => {
      const list = [...labels.entries()].map(([c, m]) => ({ c, el: m.getElement().firstChild, a: allAimaks().find((x) => x.code === c) }))
        .sort((x, y) => (y.c === view.sel) - (x.c === view.sel) || ((y.a && y.a.areaHa) || 0) - ((x.a && x.a.areaHa) || 0));
      const taken = [];
      list.forEach(({ el }) => {
        el.classList.remove('hid');
        const r = el.getBoundingClientRect();
        const hit = taken.some((t) => !(r.right + 4 < t.left || r.left - 4 > t.right || r.bottom + 2 < t.top || r.top - 2 > t.bottom));
        el.classList.toggle('hid', hit);
        if (!hit) taken.push(r);
      });
    };
    declutterRef = declutter;
    const lblZoom = () => { sceneEl.classList.toggle('an-lbl-on', map.getZoom() >= 8); declutter(); };
    // Во время движения — только видимость (без замеров на каждом кадре), порядок — по остановке.
    map.on('zoom', () => sceneEl.classList.toggle('an-lbl-on', map.getZoom() >= 8));
    map.on('moveend', lblZoom);
    lblZoom();
    const cadAt = (pt) => map.queryRenderedFeatures(pt).some((f) => f.source === 'cadP' || f.source === 'cadB' || f.layer.id === 'objs');
    map.on('mousemove', 'aim-hit', (e) => {
      if (cadAt(e.point)) { tip.hide(); return; }
      const c = e.features[0] && e.features[0].properties.code;
      if (c) { map.getCanvas().style.cursor = 'pointer'; tip.show(e.lngLat, tipHTML(c)); hover(c); }
    });
    map.on('mouseleave', 'aim-hit', () => { map.getCanvas().style.cursor = ''; tip.hide(); hover(''); });
    map.on('click', 'aim-hit', (e) => {
      if (cadAt(e.point)) return;
      const c = e.features[0] && e.features[0].properties.code;
      if (!c) return;
      const a0 = allAimaks().find((x) => x.code === c);
      if (isVec(a0)) { openDossier(c); return; }
      view.sel = c;
      view.open.add(c);
      update();
      const row = scope.root.querySelector(`[data-an-open="${CSS.escape(c)}"]`);
      if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    map.on('click', 'objs', (e) => {
      const p = e.features[0].properties;
      new gl.Popup({ closeButton: true, maxWidth: '300px', className: 'map-tip-gl an-pop' }).setLngLat(e.lngLat)
        .setHTML(`<b><a href="${esc(p.href)}">${esc(p.title)}</a></b>${p.eni ? `<i>ЕНИ ${esc(p.eni)}</i>` : ''}`).addTo(map);
    });
    map.on('mouseenter', 'objs', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'objs', () => { map.getCanvas().style.cursor = ''; });
    await loadSeed();
    if (dead) return;
    update();
    const all = allAimaks().filter((a) => a.geometry);
    if (pendingFly) { const c = pendingFly; pendingFly = ''; flyTo(c); } else if (all.length) {
      const b = all.map((a) => boundsOf(a.geometry)).reduce((x, y) => [[Math.min(x[0][0], y[0][0]), Math.min(x[0][1], y[0][1])], [Math.max(x[1][0], y[1][0]), Math.max(x[1][1], y[1][1])]]);
      map.fitBounds(b, { padding: padding(), animate: false });
    }
  };

  // --- отрисовка ---
  const update = () => {
    if (dead) return;
    const all = rows();
    const shown = all.filter(matches);
    const page = scope.root.querySelector('.an-page');
    if (!page) return;
    page.classList.toggle('hide-list', view.hideList);
    document.body.classList.toggle('an-list-hidden', view.hideList);
    // «Таблица» и «Участки» — поверхностью над сценой.
    page.classList.toggle('on-table', view.mode === 'table' || view.mode === 'parcels');
    page.classList.toggle('facets-open', view.facets);
    page.classList.toggle('on-dossier', !!view.dossier && view.mode === 'map');
    const dbox = page.querySelector('[data-an-dossier]');
    if (dbox) {
      const keepScroll = dbox.querySelector('.ad-body') ? dbox.querySelector('.ad-body').scrollTop : 0;
      dbox.innerHTML = view.dossier && view.mode === 'map' ? dossierView() : '';
      const b2 = dbox.querySelector('.ad-body');
      if (b2) b2.scrollTop = keepScroll;
    }
    document.body.classList.toggle('an-table-open', view.mode === 'table' || view.mode === 'parcels');
    const isles = page.querySelector('[data-an-isles]');
    const active = document.activeElement;
    const keep = active && page.contains(active) && active.matches('input[data-an-q],input[data-an-f]')
      ? { sel: active.matches('[data-an-q]') ? '[data-an-q]' : `[data-an-f="${active.dataset.anF}"]`, s: active.selectionStart, e: active.selectionEnd } : null;
    isles.innerHTML = islesHTML(all, shown);
    enhanceSelects(isles);
    page.querySelector('[data-an-facets-box]').innerHTML = facetsHTML();
    page.querySelector('[data-an-status]').innerHTML = statusText(all, shown);
    const lh = page.querySelector('[data-an-list-h]');
    lh.innerHTML = `<label class="an-sort"><span>Порядок</span><select class="select" data-an-sortsel aria-label="Порядок аймаков">${SORTS.map((o) => `<option value="${o.key}" ${o.key === view.sort ? 'selected' : ''}>${o.label}</option>`).join('')}</select></label>
      ${unitsHTML()}`;
    enhanceSelects(lh);
    const list = page.querySelector('[data-an-list]');
    const top = list.scrollTop;
    list.innerHTML = listHTML(all, shown);
    list.scrollTop = top;
    if (view.mode === 'table') page.querySelector('[data-an-table]').innerHTML = tableHTML(all, shown);
    if (view.mode === 'parcels') page.querySelector('[data-an-table]').innerHTML = parcelsView(shown);
    if (keep) { const i = page.querySelector(keep.sel); if (i) { i.focus(); try { i.setSelectionRange(keep.s, keep.e); } catch (e) { /* поле без выделения */ } } }
    syncMap(shown);
    syncDossierMap();
    if (sceneEl) {
      const done = shown.filter((r) => r.a.occ);
      const A = done.reduce((t, r) => t + r.a.areaHa, 0);
      const O = done.reduce((t, r) => t + r.a.occ.occHa, 0);
      const F = done.reduce((t, r) => t + r.a.occ.freeHa, 0);
      sceneEl.setAttribute('aria-label', A ? `Карта айыл аймаков: показано ${shown.length}, посчитано ${done.length}; занято ${pct(O / A)}, не занято ${pct(F / A)} площади посчитанных` : `Карта айыл аймаков: показано ${shown.length}`);
    }
  };

  // --- досье аймака (pages/analytics/dossier.js) ---
  const vecCache = new Map();   // код → Promise<FeatureCollection>
  const vecOf = (code) => {
    if (!vecCache.has(code)) vecCache.set(code, fetch(vecUrl(code)).then((r) => (r.ok ? r.json() : null)).catch(() => null));
    return vecCache.get(code);
  };
  let patches = null;
  let patchesFor = '';
  const fmtD = { area: (ha) => `${ar(ha)} ${ul()}`, pct: (x) => pct(x), n: (n) => nf(n, 0), date: (iso) => dateOf(iso) };
  const dossierCube = (a) => {
    const stats = new Map(allParcelStats());
    const tg = targetOf(view.dossier);
    const list = tg && tg.members ? tg.members : [a];
    return buildCube(list.filter((x) => stats.has(x.code)), stats);
  };
  // Цель досье (пользователь 04.11.2026: «По каждому административному району, либо по нескольким нужна
  // полная детализация по всем категориям»): «<код>» — аймак, «d:<район>» — посчитанные аймаки района,
  // «m:<код>|<код>» — набор, отмеченный в списке. Набор — сумма аймаков по всем категориям.
  const membersOf = (key) => {
    const all = rows().filter((r) => isVec(r.a));
    if (key.startsWith('d:')) return all.filter((r) => r.a.district === key.slice(2));
    if (key.startsWith('m:')) { const set = new Set(key.slice(2).split('|')); return all.filter((r) => set.has(r.a.code)); }
    return rows().filter((r) => r.a.code === key);
  };
  const sumOcc = (list) => {
    const keys = ['occHa', 'roadsHa', 'waterHa', 'reliefHa', 'bldHa', 'stripsHa', 'smallHa', 'freeHa', 'gfsuHa', 'parcels'];
    const o = { zones: {}, cmp: { parcelsOnWater: {} } };
    keys.forEach((k) => { o[k] = list.reduce((t, a) => t + (a.occ[k] || 0), 0); });
    list.forEach((a) => {
      Object.entries(a.occ.zones || {}).forEach(([k, v]) => { o.zones[k] = (o.zones[k] || 0) + v; });
      Object.entries(a.occ.cmp || {}).forEach(([k, v]) => {
        if (k === 'parcelsOnWater') Object.entries(v || {}).forEach(([f, x]) => { const y = o.cmp.parcelsOnWater[f] || { n: 0, ha: 0 }; y.n += x.n; y.ha += x.ha; o.cmp.parcelsOnWater[f] = y; });
        else if (typeof v === 'number') o.cmp[k] = (o.cmp[k] || 0) + v;
      });
    });
    const f = list[0].occ;
    Object.assign(o, { strip: f.strip, minPatch: f.minPatch, slope: f.slope, bldYard: f.bldYard, by: f.by,
      at: list.map((a) => a.occ.at).sort()[0] });
    return o;
  };
  const targetOf = (key) => {
    const ms = membersOf(key);
    if (!ms.length) return null;
    if (!key.startsWith('d:') && !key.startsWith('m:')) return { a: ms[0].a, objs: ms[0].objs, members: null };
    const list = ms.map((r) => r.a);
    const area = list.reduce((t, a) => t + (a.areaHa || 0), 0);
    const occ = sumOcc(list);
    occ.share = area ? occ.occHa / area : 0;
    const bal = new Map();
    let balTot = 0;
    list.forEach((a) => { (a.balance && a.balance.parts || []).forEach((p) => bal.set(p.label, (bal.get(p.label) || 0) + (p.ha || 0))); balTot += (a.balance && a.balance.total) || 0; });
    const title = key.startsWith('d:') ? `Район: ${key.slice(2)}` : `Набор аймаков: ${list.length}`;
    return {
      a: { code: key, aimak: title, district: [...new Set(list.map((a) => a.district))].join(', '), oblast: [...new Set(list.map((a) => a.oblast))].join(', '),
        areaHa: area, occ, balance: balTot ? { total: balTot, parts: [...bal.entries()].map(([label, ha]) => ({ label, ha })) } : null,
        quality: { note: list.filter((a) => a.quality && a.quality.note).map((a) => `${a.aimak} — ${a.quality.note}`).join('; ') } },
      objs: ms.flatMap((r) => r.objs), members: list,
    };
  };
  const dossierView = () => {
    const tg = targetOf(view.dossier);
    if (!tg) return '';
    const r = tg;
    const a = tg.a;
    const memberCodes = (tg.members || [a]).map((x) => x.code);
    if (patchesFor !== view.dossier) {
      patches = null;
      patchesFor = view.dossier;
      const want = view.dossier;
      Promise.all(memberCodes.map((c) => vecOf(c))).then((fcs) => {
        if (patchesFor !== want) return;
        const freeKeys = new Set(PARTS.filter((x) => x.free).map((x) => x.key));
        patches = fcs.flatMap((fc) => patchesOf(fc, freeKeys)).sort((x, y) => y.ha - x.ha).map((x, i) => ({ ...x, id: i + 1 }));
        update();
      });
    }
    return dossierHTML({
      a, objs: r.objs, members: tg.members, tab: view.dtab, cfg: view.dcfg, patches, pick: view.dpick, all: allAimaks(), parts: PARTS, fmt: fmtD,
      parcelsHTML: () => {
        if (parcelsState !== 'ready') { if (parcelsState === 'idle') { parcelsState = 'loading'; loadParcelsSeed().then(() => { parcelsState = 'ready'; update(); }); } return parcelsHTML(null, {}, view.pm, null, { loading: true }); }
        const cube1 = dossierCube(a);
        if (!cube1.length) return parcelsHTML(null, {}, view.pm, null, { empty: true });
        return parcelsHTML(parcelSum(cube1, view.dpf, view.pm), view.dpf, view.pm, { n: (n) => nf(n, 0), area: (ha) => `${ar(ha)} ${ul()}`, pct: (x) => pct(x) });
      },
      objectsHTML: () => (r.objs.length ? detailHTML({ a: { ...a, balance: null, occ: null }, objs: r.objs }) : '<p class="ad-muted">Объектов системы здесь нет.</p>'),
    });
  };
  // Выбранные отбором массивы — обводкой на карте.
  const syncDossierMap = () => {
    if (!map || !map.getSource('dsel')) return;
    const on = view.dossier && view.dtab === 'free' && patches;
    const sel = on ? pickPatches(patches, view.dcfg) : [];
    map.getSource('dsel').setData({ type: 'FeatureCollection', features: sel.slice(0, 3000).map((x) => ({ type: 'Feature', geometry: x.geom, properties: { pick: x.id === view.dpick } })) });
  };
  const openDossier = (code) => {
    view.dossier = code;
    view.dtab = 'overview';
    view.dpf = {};
    view.dpick = 0;
    view.sel = code;
    view.mode = 'map';
    go('#/analytics?a=' + encodeURIComponent(code), { replace: true });
    update();
    flyTo(code);
  };
  const closeDossier = () => { view.dossier = ''; go('#/analytics', { replace: true }); update(); };

  scope.setHTML(`<div class="an-page">
      <h1 class="sr-only">Земли по айыл аймакам</h1>
      <div class="an-isles" data-an-isles></div>
      <div class="an-facets" id="anFacets" data-an-facets-box></div>
      <aside class="an-list" aria-label="Айыл аймаки">
        <div class="an-list-h" data-an-list-h></div>
        <p class="an-status" role="status" data-an-status></p>
        <div class="an-list-body" data-an-list></div>
      </aside>
      <button type="button" class="an-edge" data-an-edge aria-label="Скрыть список аймаков" title="Скрыть список аймаков">‹</button>
      <section class="an-sheet" aria-label="Таблица аймаков"><div class="an-sheet-body" data-an-table></div></section>
      <div class="an-dossier" data-an-dossier></div>
      ${legendHTML()}
    </div>`);

  // --- «Участки»: сводка со срезами (pages/analytics/parcels.js) ---
  // Таблица участков строится один раз на набор аймаков (отбор страницы — область,
  // район, поиск — сужает и её); срезы пересчитываются по отбору щелчком.
  let cube = null;
  let cubeSig = '';
  let parcelsState = 'idle';   // idle → loading → ready
  const parcelsView = (shown) => {
    if (parcelsState !== 'ready') {
      if (parcelsState === 'idle') {
        parcelsState = 'loading';
        loadParcelsSeed().then(() => { parcelsState = 'ready'; update(); });
      }
      return parcelsHTML(null, {}, view.pm, null, { loading: true });
    }
    const stats = new Map(allParcelStats());
    const list = shown.map((r) => r.a).filter((a) => stats.has(a.code));
    const sig = list.map((a) => a.code + '@' + (stats.get(a.code).at || '')).join('|');
    if (sig !== cubeSig) { cube = buildCube(list, stats); cubeSig = sig; }
    if (!cube.length) return parcelsHTML(null, {}, view.pm, null, { empty: true });
    const fmt = { n: (n) => nf(n, 0), area: (ha) => `${ar(ha)} ${ul()}`, pct: (x) => pct(x) };
    return parcelsHTML(parcelSum(cube, view.pf, view.pm), view.pf, view.pm, fmt);
  };

  // --- действия ---
  const run = async (code) => {
    const ctrl = { aborted: false };
    runs.set(code, { done: 0, total: 1, ctrl });
    update();
    try {
      await estimateAimak(code, { signal: ctrl, onProgress: (d, n) => { runs.set(code, { done: d, total: n, ctrl }); update(); } });
      runs.delete(code);
    } catch (e) {
      runs.set(code, { done: 0, total: 0, ctrl, error: e.message || String(e) });
    }
    update();
  };
  const runBatch = async () => {
    const codes = rows().filter(matches).filter((r) => !r.a.occ && !runs.has(r.a.code)).map((r) => r.a.code);
    batch = { left: codes.length, ctrl: { aborted: false } };
    update();
    for (const c of codes) {
      if (dead || batch.ctrl.aborted) break;
      await run(c);
      batch.left--;
      update();
    }
    batch = null;
    update();
  };

  scope.on('click', '[data-an-run]', (e, t) => { e.stopPropagation(); run(t.dataset.anRun); });
  scope.on('click', '[data-an-stop]', (e, t) => { e.stopPropagation(); const r = runs.get(t.dataset.anStop); if (r) r.ctrl.aborted = true; });
  scope.on('click', '[data-an-batch]', () => { runBatch(); });
  scope.on('click', '[data-an-batch-stop]', () => { if (batch) { batch.ctrl.aborted = true; runs.forEach((r) => { r.ctrl.aborted = true; }); } });
  scope.on('click', '[data-an-q-clear]', () => { view.q = ''; update(); });
  scope.on('click', '[data-an-facets]', () => { view.facets = !view.facets; update(); });
  scope.on('click', '[data-an-unit]', (e, t) => {
    // Порог «Не занято от» пересчитывается в новую единицу — отбор не меняется.
    const ff = numIn(view.freeFrom);
    const was = U().k;
    view.unit = t.dataset.anUnit;
    if (ff != null) view.freeFrom = String(Math.round((ff / was) * U().k * 100) / 100).replace('.', ',');
    try { localStorage.setItem(UNIT_KEY, view.unit); } catch (err) { /* до перезагрузки */ }
    update();
  });
  scope.on('change', '[data-an-sortsel]', (e, t) => { view.sort = t.value; update(); });
  scope.on('click', '[data-an-sort]', (e, t) => {
    const k = t.dataset.anSort;
    view.sort = k === 'share' ? (view.sort === 'share' ? 'share-' : 'share') : (view.sort === k ? 'place' : k);
    update();
  });
  // Наведение на строку подсвечивает аймак на карте (список и карта — одно выделенное, практика APCS).
  const hover = (code) => {
    if (view.hov === code) return;
    if (map && view.hov) map.setFeatureState({ source: 'aim', id: view.hov }, { hov: false });
    view.hov = code;
    if (map && code) map.setFeatureState({ source: 'aim', id: code }, { hov: true });
    scope.root.querySelectorAll('.an-item.hov').forEach((el) => el.classList.remove('hov'));
    if (code) { const li = scope.root.querySelector(`.an-item[data-an-open="${CSS.escape(code)}"]`); if (li) li.classList.add('hov'); }
  };
  scope.on('mouseover', '.an-item', (e, t) => hover(t.dataset.anOpen));
  // С клавиатуры — то же, что мышью: строка в фокусе подсвечивает аймак на карте.
  scope.on('focusin', '.an-item', (e, t) => hover(t.dataset.anOpen));
  scope.on('mouseleave', '.an-list-body', () => hover(''));
  scope.on('click', '[data-an-facets-clear]', () => { view.shareFrom = ''; view.shareTo = ''; view.freeFrom = ''; view.onlyDone = false; update(); });
  scope.on('click', '[data-an-mode]', (e, t) => { view.mode = t.dataset.anMode; update(); });
  // Легенда сворачивается (замечание пользователя 04.11.2026: «надо ее к тому же сделать скрываемой»); выбор запоминается.
  scope.on('click', '[data-an-lg-toggle]', (e, t) => {
    view.lgShut = !view.lgShut;
    try { localStorage.setItem('inside.analytics.legend', view.lgShut ? '0' : '1'); } catch (err) { /* до перезагрузки */ }
    t.setAttribute('aria-expanded', String(!view.lgShut));
    t.querySelector('span').textContent = view.lgShut ? '▸' : '▾';
    scope.root.querySelector('#anLgBody').hidden = view.lgShut;
  });
  const pfNow = () => (view.dossier && view.mode === 'map' ? view.dpf : view.pf);
  scope.on('click', '[data-ap-dim]', (e, t) => {
    const f = pfNow();
    const k = t.dataset.apDim;
    const v = t.dataset.apV;
    const set = f[k] || new Set();
    if (set.has(v)) set.delete(v); else set.add(v);
    f[k] = set;
    update();
  });
  scope.on('click', '[data-ap-off]', (e, t) => { const set = pfNow()[t.dataset.apOff]; if (set) set.delete(t.dataset.apV); update(); });
  scope.on('click', '[data-ap-clear]', () => { if (view.dossier && view.mode === 'map') view.dpf = {}; else view.pf = {}; update(); });
  scope.on('click', '[data-ad-open]', (e, t) => { e.stopPropagation(); openDossier(t.dataset.adOpen); });
  scope.on('click', '[data-ad-close]', () => closeDossier());
  scope.on('click', '[data-an-pick]', (e) => e.stopPropagation());
  scope.on('change', '[data-an-pick]', (e, t) => { if (t.checked) view.pickSet.add(t.dataset.anPick); else view.pickSet.delete(t.dataset.anPick); update(); });
  scope.on('click', '[data-ad-tab]', (e, t) => { view.dtab = t.dataset.adTab; update(); });
  scope.on('click', '[data-ad-preset]', (e, t) => { view.dcfg.min = +t.dataset.adPreset; update(); });
  scope.on('change', '[data-ad-min]', (e, t) => { const v = numIn(t.value); if (v != null && v >= 0) view.dcfg.min = v; update(); });
  scope.on('change', '[data-ad-zone]', () => {
    const boxes = [...scope.root.querySelectorAll('[data-ad-zone]')];
    const on = boxes.filter((b) => b.checked).map((b) => b.dataset.adZone);
    view.dcfg.zones = on.length === boxes.length ? new Set() : new Set(on);
    update();
  });
  scope.on('click', '[data-ad-patch]', (e, t) => {
    const id = +t.dataset.adPatch;
    const x = patches && patches.find((q) => q.id === id);
    if (!x) return;
    view.dpick = id;
    update();
    if (map) map.fitBounds(x.bounds, { padding: padding(), maxZoom: 16, duration: MOVE_MS, easing: ease });
  });
  scope.on('keydown', '[data-ad-patch]', (e, t) => { if (e.key === 'Enter') t.click(); });
  scope.on('click', '[data-ad-xlsx]', () => {
    const r = targetOf(view.dossier);
    if (!r) return;
    const cube1 = dossierCube(r.a);
    const byForm = new Map();
    cube1.forEach((p) => { const x = byForm.get(p.form) || [0, 0]; x[0]++; x[1] += p.ha; byForm.set(p.form, x); });
    const d = dossierSheets({ a: r.a, parts: PARTS, patches, cfg: view.dcfg, fmt: fmtD,
      parcelRows: cube1.length ? [...byForm.entries()].sort((x, y) => y[1][0] - x[1][0]).map(([f, v]) => [f, v[0], Math.round(v[1] * 100) / 100]) : null });
    downloadXlsx(d.name, d.sheets);
  });
  scope.on('click', '[data-ap-metric]', (e, t) => { view.pm = t.dataset.apMetric; update(); });
  scope.on('click', '[data-an-edge]', (e, t) => {
    view.hideList = !view.hideList;
    t.textContent = view.hideList ? '›' : '‹';
    t.setAttribute('aria-label', view.hideList ? 'Показать список аймаков' : 'Скрыть список аймаков');
    t.title = t.getAttribute('aria-label');
    update();
  });
  // Строка таблицы — тот же выбор, что в списке: карта к аймаку, вид — карта.
  scope.on('click', '.an-tbl [data-an-open]', (e, t) => {
    if (e.target.closest('a,button')) return;
    view.mode = 'map';
  });
  scope.on('click', '[data-an-open]', (e, t) => {
    if (e.target.closest('a,button,select,input')) return;
    const c = t.dataset.anOpen;
    if (view.open.has(c)) view.open.delete(c); else view.open.add(c);
    view.sel = c;
    update();
    flyTo(c);
  });
  scope.on('keydown', '[data-an-open]', (e, t) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target === t) { e.preventDefault(); t.click(); }
  });
  scope.on('input', '[data-an-q]', (e, t) => { view.q = t.value; update(); });
  scope.on('input', '[data-an-f]', (e, t) => { view[t.dataset.anF] = t.value; update(); });
  scope.on('change', '[data-an-done]', (e, t) => { view.onlyDone = t.checked; update(); });
  scope.on('change', '[data-an-oblast]', (e, t) => { view.oblast = t.value; view.district = ''; update(); });
  scope.on('change', '[data-an-district]', (e, t) => { view.district = t.value; update(); });
  scope.on('change', '[data-an-layer]', (e, t) => { view.layers[t.dataset.anLayer] = t.checked; applyLayers(); });

  // --- привязка фоном: объекты → аймак, аймаки без контура → контур ---
  const bind = async () => {
    binding = { busy: true, error: '' };
    update();
    await loadSeed();
    // Привязки из готовых данных — записям без своей.
    objects().forEach((o) => { if (!o.rec.adm) { const s = seedAdmOf(o.typeId, o.rec.id); if (s) o.rec.adm = s; } });
    update();
    const recs = objects().map((o) => o.rec);
    let failed = 0;
    await fillAdmin(recs, () => { scheduleSave(); update(); });
    const known = new Set(allAimaks().map((a) => a.code));
    const need = new Map();
    recs.forEach((r) => { const c = r.adm && r.adm.aimakCode; if (c && !known.has(c) && !need.has(c)) need.set(c, pointOf(r)); });
    for (const [, pt] of need) {
      if (dead) return;
      try { await aimakAt(pt[0], pt[1]); } catch (e) { failed++; }
      update();
    }
    binding = { busy: false, error: failed ? `контур не получен у аймаков: ${failed}` : '' };
    update();
  };

  host.setCrumbs([{ label: 'Аналитика' }, { label: 'Земли по айыл аймакам' }]);
  update();
  mountMap().catch((e) => console.warn('Карта аналитики не нарисована', e));
  bind().catch((e) => { binding = { busy: false, error: 'Дарек не ответил' }; update(); console.warn('Привязка к аймакам', e); });

  // Для сборки файла готовых данных (tools/analytics/build_land_seed.py).
  host.exportLandSeed = () => exportSeed(objects());
  window.__anExport = () => exportSeed(objects());
  window.__anExportParcels = () => exportParcels();

  return {
    // Досье — из адреса («?a=<код>», «?a=d:<район>», «?a=m:<код>|<код>»): ссылка, «Назад», перезагрузка.
    onRoute(route) {
      const want = (route && route.query && route.query.a) || '';
      if (want !== view.dossier) { view.dossier = want; view.dtab = 'overview'; view.dpf = {}; view.dpick = 0; view.mode = 'map'; if (want) setTimeout(() => flyTo(want), 0); }
      update();
    },
    destroy() {
      dead = true;
      runs.forEach((r) => { if (r.ctrl) r.ctrl.aborted = true; });
      if (batch) batch.ctrl.aborted = true;
      if (map) { map.remove(); map = null; }
      if (sceneEl) { sceneEl.remove(); sceneEl = null; }
      delete window.__anExport;
      delete window.__anExportParcels;
      document.body.classList.remove('an-table-open', 'an-list-hidden');
    },
  };
}
