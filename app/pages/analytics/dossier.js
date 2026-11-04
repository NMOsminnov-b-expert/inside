// Досье айыл аймака — подробная аналитика одного аймака (страница «Аналитика»).
//
// Пользователь 04.11.2026: «Необходимо добавить аналитику по районам. С
// интерактивным взаимодействием. Например выбрали Ыссык-Кол и у нас
// открывается аналитика по нему. Детальная… собираем список всех
// инструментов… всех выборок… включая конфигураторы. И оформляем».
//
// Вкладки: Обзор · Свободная земля (конфигуратор отбора массивов) · Участки ·
// Вода и здания · Источники · Объекты системы; выгрузка в Excel. Данные —
// итоги векторного расчёта (tools/analytics/land_pipeline.py) из
// land-seed.json и части аймака из free/<код>.json; срезы участков —
// pages/analytics/parcels.js. Только факты источников, без толкований.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: досье — запросами к базе lands (PostGIS), массивы и
// расстояния — на сервере.
import { esc } from '../../kernel/dom.js';
import { areaM2 } from '../../kernel/cadastreTip.js';

export const TABS = [
  { key: 'overview', label: 'Обзор' },
  { key: 'free', label: 'Свободная земля' },
  { key: 'parcels', label: 'Участки' },
  { key: 'water', label: 'Вода и здания' },
  { key: 'sources', label: 'Источники' },
  { key: 'objects', label: 'Объекты системы' },
];
// Классы площади свободных массивов, га.
export const PATCH_CLASSES = [[0.1, 'до 0,1 га'], [0.5, '0,1–0,5 га'], [1, '0,5–1 га'], [5, '1–5 га'], [20, '5–20 га'], [100, '20–100 га'], [Infinity, 'больше 100 га']];
export const MIN_PRESETS = [[0.02, '2 сотки'], [0.1, '10 соток'], [1, '1 га'], [5, '5 га'], [20, '20 га']];

// Свободные массивы аймака из частей (free/<код>.json): каждая часть
// многоугольника зоны свободной земли — отдельный массив.
export function patchesOf(fc, freeKeys) {
  const out = [];
  (fc && fc.features || []).forEach((f) => {
    const z = (f.properties || {}).zone;
    if (!freeKeys.has(z) || !f.geometry) return;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
    polys.forEach((rings) => {
      const g = { type: 'Polygon', coordinates: rings };
      const ha = areaM2(g) / 1e4;
      if (ha <= 0) return;
      let x1 = Infinity; let y1 = Infinity; let x2 = -Infinity; let y2 = -Infinity;
      rings[0].forEach(([x, y]) => { if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; });
      out.push({ id: out.length + 1, zone: z, ha, geom: g, bounds: [[x1, y1], [x2, y2]] });
    });
  });
  return out.sort((a, b) => b.ha - a.ha);
}

// Отбор массивов конфигуратором: { min (га), zones: Set }.
export const pickPatches = (patches, cfg) => patches.filter((p) => p.ha >= cfg.min && (!cfg.zones.size || cfg.zones.has(p.zone)));

// --- разметка ---------------------------------------------------------------
// d — { a, objs, tab, cfg, patches (null — грузятся), all (посчитанные аймаки), parts (PARTS), fmt, parcelsHTML }
export function dossierHTML(d) {
  const { a, tab } = d;
  return `<section class="ad" aria-label="Досье аймака ${esc(a.aimak)}">
    <header class="ad-head">
      <button type="button" class="btn btn-ghost btn-sm ad-back" data-ad-close>‹ Все аймаки</button>
      <div class="ad-title"><h2>${esc(a.aimak)}</h2><span>${esc([a.code, a.district, a.oblast].filter(Boolean).join(' · '))}</span></div>
      <button type="button" class="btn btn-ghost btn-sm" data-ad-xlsx title="Обзор, свободные массивы, участки по формам собственности, сверка источников">Выгрузить в Excel</button>
    </header>
    <nav class="ad-tabs" role="tablist">${TABS.map((t) => `<button type="button" role="tab" class="ad-tab${t.key === tab ? ' on' : ''}" aria-selected="${t.key === tab}" data-ad-tab="${t.key}">${esc(t.label)}</button>`).join('')}</nav>
    <div class="ad-body" role="tabpanel">${tabHTML(d)}</div>
  </section>`;
}

function tabHTML(d) {
  if (!d.a.occ || !d.a.occ.zones) return '<p class="an-empty-page">Аймак не посчитан векторным расчётом — досье строится по его итогам (tools/analytics/land_pipeline.py).</p>';
  if (d.tab === 'free') return freeHTML(d);
  if (d.tab === 'parcels') return d.parcelsHTML();
  if (d.tab === 'water') return waterHTML(d);
  if (d.tab === 'sources') return sourcesHTML(d);
  if (d.tab === 'objects') return d.objectsHTML();
  return overviewHTML(d);
}

const share = (x, A) => (A ? x / A : 0);

function overviewHTML(d) {
  const { a, fmt } = d;
  const o = a.occ;
  const A = a.areaHa || 1;
  const parts = [
    ['o', 'Занято участками с ЕНИ', o.occHa], ['r', 'Дороги', o.roadsHa || 0], ['w', 'Вода и русла', o.waterHa || 0],
    ['l', 'Овраги, обрывы, крутые склоны', o.reliefHa || 0], ['b', 'Здания без ЕНИ', o.bldHa || 0],
    ['u', 'Непригодно: узкие полосы и клочки', (o.stripsHa || 0) + (o.smallHa || 0)], ['f', 'Свободно', o.freeHa],
  ];
  const tile = (label, ha, cls = '') => `<div class="ad-kpi ${cls}"><span>${esc(label)}</span><b>${fmt.area(ha)}</b><i>${fmt.pct(share(ha, A))}</i></div>`;
  // Место среди посчитанных аймаков — по доле занятого и по свободной площади.
  const done = d.all.filter((x) => x.occ && x.occ.zones);
  const rank = (val) => { const s = done.map(val).sort((x, y) => y - x); return s.indexOf(val(a)) + 1; };
  const bal = a.balance && a.balance.parts ? a.balance.parts : [];
  const q = a.quality && a.quality.note;
  return `<div class="ad-kpis">
      ${tile('Площадь по контуру', A, 'k-area')}${parts.map(([c, l, h]) => tile(l, h, 'k-' + c)).join('')}
    </div>
    <section class="ad-card"><h3>Структура земли аймака</h3>
      <div class="ad-stack" role="img" aria-label="${esc(parts.map(([, l, h]) => `${l} ${fmt.pct(share(h, A))}`).join(', '))}">${parts.filter((p) => p[2] > 0).map(([c, l, h]) => `<i class="s-${c}" style="flex:${share(h, A).toFixed(4)} 1 0" title="${esc(l)}: ${esc(fmt.area(h))} · ${fmt.pct(share(h, A))}"></i>`).join('')}</div>
      <ul class="ad-keys">${parts.map(([c, l, h]) => `<li><i class="s-${c}"></i>${esc(l)} <b>${fmt.pct(share(h, A))}</b></li>`).join('')}</ul>
    </section>
    <div class="ad-cols">
      <section class="ad-card"><h3>Земельный баланс Кадастра</h3>
        ${bal.length ? `<dl class="an-bal">${bal.map((p) => `<dt>${esc(p.label)}</dt><dd class="num">${fmt.area(p.ha)}</dd>`).join('')}
        <dt class="an-bal-total">Всего по балансу</dt><dd class="num an-bal-total">${fmt.area(a.balance.total)}</dd>
        <dt>По контуру Дарека</dt><dd class="num">${fmt.area(A)}</dd></dl>` : '<p class="ad-muted">Баланса нет</p>'}
        ${q ? `<p class="an-d-note">Контур Дарека: ${esc(q)}.</p>` : ''}</section>
      ${d.members ? membersHTML(d) : `<section class="ad-card"><h3>Среди посчитанных аймаков (${done.length})</h3>
        <dl class="an-bal"><dt>Доля занятого участками с ЕНИ</dt><dd class="num">${rank((x) => x.occ.share)}-е место</dd>
        <dt>Свободная площадь</dt><dd class="num">${rank((x) => x.occ.freeHa)}-е место</dd>
        <dt>Здания без ЕНИ</dt><dd class="num">${rank((x) => x.occ.bldHa || 0)}-е место</dd></dl>
        <p class="an-d-note">Посчитано ${esc(fmt.date(o.at))}. Участков в расчёте: ${(o.parcels || 0).toLocaleString('ru-RU')}.</p></section>`}
    </div>`;
}

// Аймаки набора — для сравнения: площадь, занято, свободно, рельеф, без ЕНИ.
function membersHTML(d) {
  const { fmt } = d;
  return `<section class="ad-card ad-wide"><h3>Аймаки (${d.members.length})</h3>
    <table class="itbl ad-tbl"><thead><tr><th>Аймак</th><th class="num">Площадь</th><th class="num">Занято</th><th class="num">Свободно</th><th class="num">Рельеф</th><th class="num">Без ЕНИ</th></tr></thead>
    <tbody>${d.members.map((m) => { const o = m.occ; const A = m.areaHa || 1; return `<tr data-ad-open="${esc(m.code)}" tabindex="0" title="Досье аймака"><td>${esc(m.aimak)}<span class="an-sub">${esc(m.code)}</span></td>
      <td class="num">${fmt.area(A)}</td><td class="num">${fmt.pct(o.occHa / A)}</td><td class="num">${fmt.pct(o.freeHa / A)}</td><td class="num">${fmt.pct((o.reliefHa || 0) / A)}</td><td class="num">${fmt.area(o.bldHa || 0)}</td></tr>`; }).join('')}</tbody></table></section>`;
}

function freeHTML(d) {
  const { cfg, patches, fmt, parts } = d;
  const free = parts.filter((p) => p.free);
  if (!patches) return '<div class="ap-wait" role="status">Загружаю части аймака…</div>';
  const sel = pickPatches(patches, cfg);
  const tot = sel.reduce((t, p) => t + p.ha, 0);
  const allTot = patches.reduce((t, p) => t + p.ha, 0);
  const byClass = PATCH_CLASSES.map(([to, label], i) => {
    const from = i ? PATCH_CLASSES[i - 1][0] : 0;
    const xs = sel.filter((p) => p.ha >= from && p.ha < to);
    return { label, n: xs.length, ha: xs.reduce((t, p) => t + p.ha, 0) };
  });
  const byZone = free.map((z) => { const xs = sel.filter((p) => p.zone === z.key); return { ...z, n: xs.length, ha: xs.reduce((t, p) => t + p.ha, 0) }; }).filter((z) => z.n);
  const bars = (list, val, lab) => { const mx = Math.max(1e-9, ...list.map(val)); return `<ul class="ap-bars">${list.map((x) => `<li><div class="ap-bar ad-bar"><span class="ap-l">${lab(x)}</span><span class="ap-track"><i style="width:${((val(x) / mx) * 100).toFixed(1)}%"></i></span><span class="ap-v">${fmt.area(x.ha)}</span><span class="ap-p">${x.n.toLocaleString('ru-RU')} шт.</span></div></li>`).join('')}</ul>`; };
  const top = sel.slice(0, 50);
  return `<section class="ad-card ad-cfg" aria-label="Отбор свободных массивов">
      <h3>Отбор свободных массивов</h3>
      <div class="ad-cfg-row"><span class="ad-cfg-l">Площадь массива от</span>
        <input class="an-num an-num-w" data-ad-min inputmode="decimal" value="${esc(String(cfg.min).replace('.', ','))}" aria-label="Площадь массива от, га"><span class="ad-muted">га</span>
        <span class="ad-presets">${MIN_PRESETS.map(([v, l]) => `<button type="button" class="ap-chip${cfg.min === v ? ' on' : ''}" data-ad-preset="${v}">${esc(l)}</button>`).join('')}</span></div>
      <div class="ad-cfg-row"><span class="ad-cfg-l">Покров земли</span>
        <span class="ad-zones">${free.map((z) => `<label class="ad-zone"><input type="checkbox" data-ad-zone="${z.key}" ${!cfg.zones.size || cfg.zones.has(z.key) ? 'checked' : ''}><i style="background:${z.color}"></i>${esc(z.label)}</label>`).join('')}</span></div>
      <p class="ad-res" role="status">Отобрано массивов: <b>${sel.length.toLocaleString('ru-RU')}</b> · площадь <b>${fmt.area(tot)}</b> · ${fmt.pct(allTot ? tot / allTot : 0)} свободной земли аймака</p>
    </section>
    <div class="ad-cols">
      <section class="ad-card"><h3>По размеру массива</h3>${bars(byClass.filter((c) => c.n), (x) => x.ha, (x) => esc(x.label))}</section>
      <section class="ad-card"><h3>По покрову земли</h3>${bars(byZone, (x) => x.ha, (x) => `<i class="an-dsw" style="background:${x.color}"></i>${esc(x.label)}`)}</section>
    </div>
    <section class="ad-card"><h3>Крупнейшие массивы${sel.length > top.length ? ` — первые ${top.length} из ${sel.length.toLocaleString('ru-RU')}` : ''}</h3>
      <table class="itbl ad-tbl"><thead><tr><th class="num">№</th><th>Покров</th><th class="num">Площадь</th><th class="num">Доля свободного</th></tr></thead>
      <tbody>${top.map((p, i) => { const z = free.find((x) => x.key === p.zone) || {}; return `<tr class="${d.pick === p.id ? 'sel' : ''}" data-ad-patch="${p.id}" tabindex="0" title="Показать на карте"><td class="num">${i + 1}</td><td><i class="an-dsw" style="background:${z.color || '#ccc'}"></i>${esc(z.label || p.zone)}</td><td class="num">${fmt.area(p.ha)}</td><td class="num">${fmt.pct(allTot ? p.ha / allTot : 0)}</td></tr>`; }).join('') || '<tr><td colspan="4" class="an-empty">Массивов по отбору нет</td></tr>'}</tbody></table>
    </section>`;
}

function waterHTML(d) {
  const { a, fmt } = d;
  const o = a.occ;
  const c = o.cmp || {};
  const wet = c.parcelsOnWater || {};
  return `<div class="ad-cols">
    <section class="ad-card"><h3>Вода и русла</h3><dl class="an-bal">
      <dt>Вода вне участков с ЕНИ</dt><dd class="num">${fmt.area(o.waterHa || 0)}</dd>
      <dt>OpenStreetMap</dt><dd class="num">${fmt.area(c.waterOsmHa || 0)}</dd>
      <dt>ESA WorldCover</dt><dd class="num">${fmt.area(c.waterWcHa || 0)}</dd>
      <dt>В обоих источниках</dt><dd class="num">${fmt.area(c.waterBothHa || 0)}</dd></dl>
      <p class="an-d-note">WorldCover (10 м) не различает русла уже ~10 м — арыки и каналы видит OpenStreetMap.</p></section>
    <section class="ad-card"><h3>Участки с ЕНИ на воде</h3>
      ${Object.keys(wet).length ? `<dl class="an-bal">${Object.entries(wet).sort((x, y) => y[1].n - x[1].n).map(([f, v]) => `<dt>${esc(f)}</dt><dd class="num">${v.n.toLocaleString('ru-RU')} уч. · ${fmt.area(v.ha)}</dd>`).join('')}</dl>
      <p class="an-d-note">На воде — 20 % площади участка и больше (вода OpenStreetMap и WorldCover).</p>` : '<p class="ad-muted">Нет участков, на 20 % и больше лежащих на воде.</p>'}</section>
    <section class="ad-card"><h3>Здания по снимкам</h3><dl class="an-bal">
      <dt>Зданий в аймаке</dt><dd class="num">${(c.buildings || 0).toLocaleString('ru-RU')}</dd>
      <dt>Вне участков с ЕНИ</dt><dd class="num">${(c.buildingsNoEni || 0).toLocaleString('ru-RU')} · ${fmt.pct(c.buildings ? c.buildingsNoEni / c.buildings : 0)}</dd>
      <dt>Площадь без ЕНИ с двором ${esc(String(o.bldYard))} м</dt><dd class="num">${fmt.area(o.bldHa || 0)}</dd></dl>
      <p class="an-d-note">Microsoft Global ML Building Footprints — контуры зданий, распознанные по снимкам.</p></section>
    <section class="ad-card"><h3>Рельеф</h3><dl class="an-bal">
      <dt>Овраги, обрывы, карьеры — OpenStreetMap</dt><dd class="num">${fmt.area(c.reliefOsmHa || 0)}</dd>
      <dt>Склоны круче ${esc(String(o.slope))}° — Copernicus DEM</dt><dd class="num">${fmt.area(c.steepHa || 0)}</dd>
      <dt>Рельеф вне участков, дорог и воды</dt><dd class="num">${fmt.area(o.reliefHa || 0)}</dd></dl></section>
  </div>`;
}

function sourcesHTML(d) {
  const o = d.a.occ;
  const src = [
    ['Участки с ЕНИ, сведения', 'ГУ «Кадастр», картосервер портала (ENI_WGS84)', 'контуры, форма собственности, вид использования, назначение, даты'],
    ['Границы и баланс аймака', 'Адресный регистр «Дарек», ГУ «Кадастр»', 'контур аймака, земельный баланс по категориям'],
    ['Дороги, вода, русла', 'OpenStreetMap (векторные плитки OpenFreeMap)', 'ширина коридора дороги и русла — по классу'],
    ['Овраги, обрывы, карьеры', 'OpenStreetMap (Overpass)', 'линии и контуры природных и нарушенных форм'],
    ['Вода, покров земли', 'ESA WorldCover 2021 v200, 10 м (CC BY 4.0)', 'вода и болота; зоны свободной земли'],
    ['Крутые склоны', 'Copernicus DEM GLO-30, 30 м', 'уклон по высотам'],
    ['Здания', 'Microsoft Global ML Building Footprints, выпуск 2026-02 (ODbL)', 'контуры зданий по снимкам'],
  ];
  return `<section class="ad-card"><h3>Источники</h3>
      <table class="itbl ad-tbl"><thead><tr><th>Что</th><th>Откуда</th><th>Как используется</th></tr></thead>
      <tbody>${src.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</tbody></table></section>
    <section class="ad-card"><h3>Параметры расчёта</h3><dl class="an-bal">
      <dt>Узкая полоса — непригодна, уже</dt><dd class="num">${esc(String(o.strip))} м</dd>
      <dt>Клочок — непригоден, меньше</dt><dd class="num">${esc(String(o.minPatch))} м²</dd>
      <dt>Крутой склон — круче</dt><dd class="num">${esc(String(o.slope))}°</dd>
      <dt>Двор здания без ЕНИ</dt><dd class="num">${esc(String(o.bldYard))} м</dd>
      <dt>Ширина коридора дороги</dt><dd class="num">магистраль 50 · главная 32 · жилая 16 · проезд 10 · полевая 6 м</dd>
      <dt>Ширина русла</dt><dd class="num">река 25 · канал 10 · ручей 5 · коллектор 4 · арык 3 м</dd>
      <dt>Порядок учёта</dt><dd>участки → дороги → вода → рельеф → здания без ЕНИ</dd></dl>
      <p class="an-d-note">${esc(o.by || '')}. Посчитано ${esc(d.fmt.date(o.at))}.</p></section>`;
}

// Листы выгрузки досье.
export function dossierSheets(d) {
  const { a, fmt } = d;
  const o = a.occ;
  const A = a.areaHa || 1;
  const r2 = (x) => Math.round(x * 100) / 100;
  const overview = [['Площадь по контуру', r2(A), 100], ['Занято участками с ЕНИ', r2(o.occHa), r2(o.occHa / A * 100)], ['Дороги', r2(o.roadsHa || 0), r2((o.roadsHa || 0) / A * 100)],
    ['Вода и русла', r2(o.waterHa || 0), r2((o.waterHa || 0) / A * 100)], ['Овраги, обрывы, крутые склоны', r2(o.reliefHa || 0), r2((o.reliefHa || 0) / A * 100)],
    ['Здания без ЕНИ', r2(o.bldHa || 0), r2((o.bldHa || 0) / A * 100)], ['Узкие полосы', r2(o.stripsHa || 0), r2((o.stripsHa || 0) / A * 100)],
    ['Клочки', r2(o.smallHa || 0), r2((o.smallHa || 0) / A * 100)], ['Свободно', r2(o.freeHa), r2(o.freeHa / A * 100)],
    ...d.parts.filter((p) => p.free).map((p) => ['  свободно: ' + p.label, r2(o.zones[p.key] || 0), r2((o.zones[p.key] || 0) / A * 100)])];
  const c = o.cmp || {};
  const sheets = [
    { name: 'Обзор', head: ['Показатель', 'га', '% площади'], rows: overview },
    { name: 'Свободные массивы', head: ['№', 'Покров', 'Площадь, га', 'Запад', 'Юг', 'Восток', 'Север'],
      rows: (d.patches ? pickPatches(d.patches, d.cfg) : []).map((p, i) => [i + 1, (d.parts.find((x) => x.key === p.zone) || {}).label || p.zone, r2(p.ha), ...p.bounds.flat().map((v) => +v.toFixed(6))]) },
    { name: 'Сверка', head: ['Показатель', 'Значение'], rows: [['Вода — OpenStreetMap, га', c.waterOsmHa], ['Вода — ESA WorldCover, га', c.waterWcHa], ['Вода — в обоих, га', c.waterBothHa],
      ['Рельеф — OpenStreetMap, га', c.reliefOsmHa], ['Склоны круче ' + o.slope + '° — Copernicus DEM, га', c.steepHa], ['Зданий по снимкам', c.buildings], ['Зданий вне ЕНИ', c.buildingsNoEni],
      ...Object.entries(c.parcelsOnWater || {}).map(([f, v]) => [`Участки на воде: ${f}`, `${v.n} уч., ${v.ha} га`])] },
  ];
  if (d.parcelRows) sheets.push({ name: 'Участки по формам', head: ['Форма собственности', 'Участков', 'Площадь, га'], rows: d.parcelRows });
  return { name: `Досье аймака ${a.aimak} (${a.code}) ${fmt.date(new Date().toISOString())}.xlsx`, sheets };
}
