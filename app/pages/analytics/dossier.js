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
  return `<section class="ad" data-key="${esc(a.code)}" aria-label="Досье: ${esc(a.aimak)}">
    <header class="ad-head">
      <button type="button" class="btn btn-ghost btn-sm ad-back" data-ad-close>‹ Все аймаки</button>
      <div class="ad-title"><h2>${esc(a.aimak)}</h2><span>${esc([a.code, a.district, a.oblast].filter(Boolean).join(' · '))}</span></div>
      <button type="button" class="btn btn-ghost btn-sm" data-ad-xlsx title="Обзор, свободные массивы, участки по формам собственности, сверка источников">Выгрузить в Excel</button>
      <button type="button" class="btn btn-ghost btn-sm ad-fold" data-ad-fold aria-expanded="true" aria-label="Свернуть досье" title="Свернуть досье — карта целиком">Свернуть <span aria-hidden="true">›</span></button>
    </header>
    <nav class="ad-tabs" role="tablist" aria-label="Разделы досье">${TABS.map((t) => `<button type="button" role="tab" class="ad-tab${t.key === tab ? ' on' : ''}" aria-selected="${t.key === tab}" tabindex="${t.key === tab ? 0 : -1}" data-ad-tab="${t.key}">${esc(t.label)}</button>`).join('')}<i class="ad-ink" aria-hidden="true"></i></nav>
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

// Непригодный рельеф по видам: [класс, подпись, га]. Расчёты до разделения (нет rockHa) — одной строкой.
export function terrainOf(o) {
  if (o.rockHa == null) return [['l', 'Овраги, обрывы, крутые склоны', o.reliefHa || 0]];
  return [['g', 'Овраги, обрывы, карьеры', o.gullyHa || 0], ['k', 'Скалы и осыпи', o.rockHa || 0],
    ['s', 'Снег и лёд', o.snowHa || 0], ['l', `Крутые склоны (круче ${o.slope}°)`, o.steepHa || 0]];
}

function overviewHTML(d) {
  const { a, fmt } = d;
  const o = a.occ;
  const A = a.areaHa || 1;
  const parts = [
    ['o', 'Занято участками с ЕНИ', o.occHa], ['r', 'Дороги', o.roadsHa || 0], ['w', 'Вода и русла', o.waterHa || 0],
    // Виды рельефа, которых в аймаке нет (0 га), — без плиток: пустые плитки только отвлекают.
    ...terrainOf(o).filter((x, i, all) => all.length === 1 || x[2] / A >= 0.0005), ['b', 'Здания без ЕНИ', o.bldHa || 0],
    ['u', 'Узкие полосы и клочки', (o.stripsHa || 0) + (o.smallHa || 0)], ['f', 'Свободно', o.freeHa],
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

// Здания по снимкам: с ЕНИ и без ЕНИ — по доле площади контура на участках (пользователь 04.11.2026:
// «По процентам площади. Выше порога - на участке» — порог 10 %; «проводить процентное соотношение
// зданий с ЕНИ и зданий без ЕНИ»). Порог в досье меняет только счёт зданий (по распределению
// cmp.bldCoverHist шагом 5 %); площадь без ЕНИ посчитана расчётом при его пороге.
// Оформление — плитки итогов, таблицы с итоговой строкой, распределение столбцами (пользователь
// 04.11.2026: «качественно оформить в виде карточек, сводок, таблиц. Сейчас очень бедно»).
export const BLD_PRESETS = [0.05, 0.1, 0.2, 0.3, 0.5];
const BLD_GROUPS = [[0, 2, 'меньше 10 %'], [2, 6, '10–30 %'], [6, 10, '30–50 %'], [10, 18, '50–90 %'], [18, 21, '90 % и больше']];
const nfr = (x) => Math.round(x || 0).toLocaleString('ru-RU');
// Ячейка доли: число и тонкая полоса (масштабом, не шириной).
const shareCell = (x, fmt, cls = '') => `<td class="num ad-sh"><span>${fmt.pct(x)}</span><span class="ad-mini ${cls}" aria-hidden="true"><i style="transform:scaleX(${Math.max(0, Math.min(1, x)).toFixed(4)})"></i></span></td>`;

function bldState(d) {
  const o = d.a.occ;
  const c = o.cmp || {};
  const n = c.buildings || 0;
  const base = o.bldOn != null ? o.bldOn : null;
  const hist = Array.isArray(c.bldCoverHist) && c.bldCoverHist.length === 21 ? c.bldCoverHist : null;
  const thr = hist && d.cfg.bldOn != null ? d.cfg.bldOn : base;
  const no = hist && thr != null ? hist.slice(0, Math.round(thr * 20)).reduce((t, x) => t + x, 0) : (c.buildingsNoEni || 0);
  return { n, no, on: n - no, base, hist, thr };
}

function bldHTML(d) {
  const { a, fmt } = d;
  const o = a.occ;
  const { n, no, on, base, hist, thr } = bldState(d);
  const rule = base == null ? 'по точке внутри контура (расчёт до перехода на долю площади)' : `на участке — ${fmt.pct(thr)} площади контура и больше`;
  const max = hist ? Math.max(1, ...hist) : 1;
  const cut = thr != null ? Math.round(thr * 20) : 0;
  return `<section class="ad-card ad-bld ad-wide"><h3>Здания по снимкам</h3>
    <div class="ad-bld-grid">
      <div>
        <div class="ad-stack" role="img" aria-label="На участках с ЕНИ ${fmt.pct(n ? on / n : 0)}, без ЕНИ ${fmt.pct(n ? no / n : 0)}">${n ? `<i class="s-o" style="flex:${(on / n).toFixed(4)} 1 0"></i><i class="s-b" style="flex:${(no / n).toFixed(4)} 1 0"></i>` : ''}</div>
        <table class="itbl ad-tbl ad-tbl-c"><thead><tr><th>Здания</th><th class="num">Число</th><th class="num">Доля</th></tr></thead><tbody>
          <tr><td><i class="an-dsw s-o"></i>На участках с ЕНИ</td><td class="num">${nfr(on)}</td>${shareCell(n ? on / n : 0, fmt, 'm-o')}</tr>
          <tr><td><i class="an-dsw s-b"></i>Без ЕНИ</td><td class="num">${nfr(no)}</td>${shareCell(n ? no / n : 0, fmt, 'm-b')}</tr>
        </tbody><tfoot><tr><td>Всего по снимкам</td><td class="num">${nfr(n)}</td><td class="num">100 %</td></tr></tfoot></table>
        <p class="ad-kv"><span>Площадь без ЕНИ с двором ${esc(String(o.bldYard))} м${base != null ? `, порог ${fmt.pct(base)}` : ''}</span><b class="num">${fmt.area(o.bldHa || 0)}</b></p>
      </div>
      ${hist ? `<div>
        <div class="ad-cfg-row"><span class="ad-cfg-l">Порог «на участке»</span><span class="ad-presets">${BLD_PRESETS.map((v) => `<button type="button" class="ap-chip${Math.abs(v - thr) < 1e-9 ? ' on' : ''}" data-ad-bldon="${v}" aria-pressed="${Math.abs(v - thr) < 1e-9}">${fmt.pct(v)}</button>`).join('')}</span></div>
        <div class="ad-hist" role="img" aria-label="Здания по доле площади на участках с ЕНИ, шаг 5 %">${hist.map((x, i) => `<i class="${i < cut ? 'h-b' : 'h-o'}" style="--h:${(x / max).toFixed(4)}" title="${i === 20 ? '100 %' : `${i * 5}–${i * 5 + 5} %`}: ${nfr(x)} зд."></i>`).join('')}</div>
        <div class="ad-hist-x" aria-hidden="true"><span>0 %</span><span>доля площади здания на участках</span><span>100 %</span></div>
        <table class="itbl ad-tbl ad-tbl-c"><thead><tr><th>Доля площади на участках</th><th class="num">Зданий</th><th class="num">Доля</th></tr></thead><tbody>
          ${BLD_GROUPS.map(([i, j, l]) => { const k = hist.slice(i, j).reduce((t, x) => t + x, 0); return `<tr><td>${esc(l)}</td><td class="num">${nfr(k)}</td>${shareCell(n ? k / n : 0, fmt)}</tr>`; }).join('')}
        </tbody></table></div>` : ''}
    </div>
    <p class="an-d-note">Microsoft Global ML Building Footprints — контуры зданий по снимкам. Привязка снимков к Кадастру неточна на метры, поэтому здание считается по доле площади: ${esc(rule)}.</p></section>`;
}

function waterHTML(d) {
  const { a, fmt } = d;
  const o = a.occ;
  const c = o.cmp || {};
  const A = a.areaHa || 1;
  const wet = Object.entries(c.parcelsOnWater || {}).sort((x, y) => y[1].ha - x[1].ha);
  const wetN = wet.reduce((t, [, v]) => t + v.n, 0);
  const wetHa = wet.reduce((t, [, v]) => t + v.ha, 0);
  const b = bldState(d);
  const osm = c.waterOsmHa || 0;
  const wc = c.waterWcHa || 0;
  const both = c.waterBothHa || 0;
  const onlyO = Math.max(0, osm - both);
  const onlyW = Math.max(0, wc - both);
  const any = onlyO + onlyW + both || 1;
  const tile = (label, val, sub, cls) => `<div class="ad-kpi ${cls}"><span>${esc(label)}</span><b>${val}</b><i>${sub}</i></div>`;
  const terr = terrainOf(o);
  const terrHa = terr.reduce((t, x) => t + x[2], 0);
  const src = { g: 'OpenStreetMap', k: 'OpenStreetMap, ESA WorldCover и рельеф', s: 'ESA WorldCover, OpenStreetMap', l: 'Copernicus DEM' };
  return `<div class="ad-kpis">
      ${tile('Вода вне участков с ЕНИ', fmt.area(o.waterHa || 0), `${fmt.pct((o.waterHa || 0) / A)} площади`, 'k-w')}
      ${tile('Участки с ЕНИ на воде', `${nfr(wetN)} уч.`, fmt.area(wetHa), 'k-w')}
      ${tile('Зданий по снимкам', nfr(b.n), `с ЕНИ ${fmt.pct(b.n ? b.on / b.n : 0)}`, 'k-o')}
      ${tile('Зданий без ЕНИ', nfr(b.no), `${fmt.pct(b.n ? b.no / b.n : 0)} зданий`, 'k-b')}
    </div>
    <div class="ad-cols">
    <section class="ad-card"><h3>Вода по источникам</h3>
      <div class="ad-stack" role="img" aria-label="Только OpenStreetMap ${fmt.pct(onlyO / any)}, в обоих ${fmt.pct(both / any)}, только WorldCover ${fmt.pct(onlyW / any)}"><i class="s-wo" style="flex:${(onlyO / any).toFixed(4)} 1 0"></i><i class="s-w" style="flex:${(both / any).toFixed(4)} 1 0"></i><i class="s-ww" style="flex:${(onlyW / any).toFixed(4)} 1 0"></i></div>
      <table class="itbl ad-tbl ad-tbl-c"><thead><tr><th>Источник</th><th class="num">Площадь</th><th class="num">Доля воды</th></tr></thead><tbody>
        <tr><td><i class="an-dsw s-wo"></i>Только OpenStreetMap</td><td class="num">${fmt.area(onlyO)}</td>${shareCell(onlyO / any, fmt, 'm-w')}</tr>
        <tr><td><i class="an-dsw s-w"></i>В обоих источниках</td><td class="num">${fmt.area(both)}</td>${shareCell(both / any, fmt, 'm-w')}</tr>
        <tr><td><i class="an-dsw s-ww"></i>Только ESA WorldCover</td><td class="num">${fmt.area(onlyW)}</td>${shareCell(onlyW / any, fmt, 'm-w')}</tr>
      </tbody><tfoot><tr><td>Вода вне участков с ЕНИ</td><td class="num">${fmt.area(o.waterHa || 0)}</td><td class="num">${fmt.pct((o.waterHa || 0) / A)} аймака</td></tr></tfoot></table>
      <p class="an-d-note">WorldCover (10 м) не различает русла уже ~10 м — арыки и каналы видит OpenStreetMap.</p></section>
    <section class="ad-card"><h3>Участки с ЕНИ на воде</h3>
      ${wet.length ? `<table class="itbl ad-tbl ad-tbl-c"><thead><tr><th>Форма собственности</th><th class="num">Участков</th><th class="num">Площадь</th><th class="num">Доля</th></tr></thead><tbody>
        ${wet.map(([f, v]) => `<tr><td>${esc(f)}</td><td class="num">${nfr(v.n)}</td><td class="num">${fmt.area(v.ha)}</td>${shareCell(wetHa ? v.ha / wetHa : 0, fmt, 'm-w')}</tr>`).join('')}
      </tbody><tfoot><tr><td>Всего</td><td class="num">${nfr(wetN)}</td><td class="num">${fmt.area(wetHa)}</td><td class="num">100 %</td></tr></tfoot></table>
      <p class="an-d-note">На воде — 20 % площади участка и больше (вода OpenStreetMap и WorldCover).</p>` : '<p class="ad-muted">Нет участков, на 20 % и больше лежащих на воде.</p>'}</section>
    ${bldHTML(d)}
    <section class="ad-card ad-wide"><h3>Рельеф — непригодно</h3>
      <table class="itbl ad-tbl ad-tbl-c"><thead><tr><th>Вид</th><th>Источник</th><th class="num">Площадь</th><th class="num">Доля аймака</th></tr></thead><tbody>
        ${terr.map(([k, l, h]) => `<tr><td><i class="an-dsw s-${k}"></i>${esc(l)}</td><td class="ad-src">${esc(src[k] || 'OpenStreetMap, Copernicus DEM')}</td><td class="num">${fmt.area(h)}</td>${shareCell(h / A, fmt, 'm-' + k)}</tr>`).join('')}
      </tbody><tfoot><tr><td colspan="2">Всего вне участков, дорог и воды</td><td class="num">${fmt.area(terrHa)}</td><td class="num">${fmt.pct(terrHa / A)}</td></tr></tfoot></table>
      <p class="an-d-note">До вычета участков: овраги, обрывы, карьеры OpenStreetMap — ${fmt.area(c.reliefOsmHa || 0)}; склоны круче ${esc(String(o.slope))}° по Copernicus DEM — ${fmt.area(c.steepHa || 0)}.${o.rockHa != null ? ` Скалы и осыпи — OpenStreetMap и голая поверхность WorldCover на склоне круче ${esc(String(o.rockSlope))}°; положе — голая земля, она свободна.` : ''}</p></section>
  </div>`;
}

// Источники — карточками: что даёт источник, откуда, точность и лицензия, и его цифра в этом аймаке
// (пользователь 04.11.2026: «источники данных тоже не оформлены»). Цвет полосы — цвет той же части
// на карте и в легенде. Параметры — таблицей «значение — что значит»; порядок учёта — цепочкой.
function sourcesHTML(d) {
  const { a, fmt } = d;
  const o = a.occ;
  const c = o.cmp || {};
  const nfr0 = (x) => Math.round(x || 0).toLocaleString('ru-RU');
  const zonesHa = Object.values(o.zones || {}).reduce((t, x) => t + x, 0);
  const src = [
    ['o', 'Участки с ЕНИ', 'ГУ «Кадастр» — картосервер портала, слой ENI_WGS84', 'контуры, форма собственности, вид использования, назначение, даты', `${nfr0(o.parcels)} участков`, `занято ${fmt.area(o.occHa)}`],
    ['a', 'Границы и баланс аймака', 'Адресный регистр «Дарек», ГУ «Кадастр»', 'контур аймака, земельный баланс по категориям', fmt.area(a.areaHa), a.balance && a.balance.total ? `по балансу ${fmt.area(a.balance.total)}` : 'баланса нет'],
    ['r', 'Дороги, вода, русла', 'OpenStreetMap — векторные плитки OpenFreeMap', 'коридор дороги и русла — по классу', `дороги ${fmt.area(o.roadsHa || 0)}`, `вода ${fmt.area(c.waterOsmHa || 0)}`],
    ['g', 'Овраги, обрывы, карьеры, осыпи', 'OpenStreetMap — Overpass', 'линии и контуры природных и нарушенных форм', fmt.area(c.reliefOsmHa || 0), o.reliefOk === false ? 'не получено' : 'до вычета участков'],
    ['w', 'Вода, покров земли', 'ESA WorldCover 2021 v200 · 10 м · CC BY 4.0', 'вода и болота, голая поверхность, снег; зоны свободной земли', `вода ${fmt.area(c.waterWcHa || 0)}`, `зоны ${fmt.area(zonesHa)}`],
    ['l', 'Рельеф', 'Copernicus DEM GLO-30 · 30 м, сгущение до 10 м', `уклон: круче ${o.slope}° — крутой склон${o.rockSlope ? `, круче ${o.rockSlope}° на голой поверхности — скалы` : ''}`, fmt.area(c.steepHa || 0), 'склонов до вычета'],
    ['b', 'Здания', 'Microsoft Global ML Building Footprints · выпуск 2026-02 · ODbL', `контуры по снимкам; на участке — от ${fmt.pct(o.bldOn != null ? o.bldOn : 0.1)} площади`, `${nfr0(c.buildings)} зданий`, `без ЕНИ ${nfr0(c.buildingsNoEni)}`],
  ];
  const steps = ['Участки с ЕНИ', 'Дороги', 'Вода', 'Овраги, карьеры', 'Скалы и осыпи', 'Снег и лёд', 'Крутые склоны', 'Здания без ЕНИ', 'Полосы и клочки', 'Свободно'];
  const par = [
    ['Узкая полоса', `уже ${o.strip} м`, 'промежуток между участками и дорогами — непригоден'],
    ['Клочок', `меньше ${o.minPatch} м²`, 'обрывок свободной земли — непригоден'],
    ['Крутой склон', `круче ${o.slope}°`, 'по рельефу Copernicus DEM — непригоден'],
    ...(o.rockSlope ? [['Скалы', `круче ${o.rockSlope}°`, 'голая поверхность WorldCover на таком склоне — скалы и осыпи; положе — голая земля, свободна']] : []),
    ['Здание на участке', `от ${fmt.pct(o.bldOn != null ? o.bldOn : 0.1)} площади`, 'доля площади контура здания на участках с ЕНИ'],
    ['Двор здания без ЕНИ', `${o.bldYard} м`, 'полоса вокруг здания вне участков — занято'],
    ['Коридор дороги', '6–50 м', 'магистраль 50 · главная 32 · жилая 16 · проезд 10 · полевая 6 м'],
    ['Ширина русла', '3–25 м', 'река 25 · канал 10 · ручей 5 · коллектор 4 · арык 3 м'],
    ['Вода на участке', 'от 20 % площади', 'участок с ЕНИ считается лежащим на воде'],
  ];
  return `<div class="ad-src-grid">${src.map(([k, t, from, use, v1, v2]) => `<section class="ad-srcc c-${k}">
      <h3>${esc(t)}</h3><p class="ad-srcc-from">${esc(from)}</p>
      <p class="ad-srcc-use">${esc(use)}</p>
      <div class="ad-srcc-v"><b class="num">${esc(v1)}</b><span>${esc(v2)}</span></div></section>`).join('')}</div>
    <section class="ad-card"><h3>Порядок учёта</h3>
      <ol class="ad-steps">${steps.map((s, i) => `<li><span class="num">${i + 1}</span>${esc(s)}</li>`).join('')}</ol>
      <p class="an-d-note">Каждая следующая часть считается только там, где не легли предыдущие: площадь не учитывается дважды.</p></section>
    <section class="ad-card"><h3>Параметры расчёта</h3>
      <table class="itbl ad-tbl ad-tbl-c"><thead><tr><th>Параметр</th><th class="num">Значение</th><th>Что значит</th></tr></thead>
      <tbody>${par.map(([n, v, w]) => `<tr><td>${esc(n)}</td><td class="num">${esc(v)}</td><td class="ad-src">${esc(w)}</td></tr>`).join('')}</tbody></table>
      <p class="an-d-note">${esc(o.by || '')}. Посчитано ${esc(fmt.date(o.at))}.</p></section>`;
}

// Листы выгрузки досье.
export function dossierSheets(d) {
  const { a, fmt } = d;
  const o = a.occ;
  const A = a.areaHa || 1;
  const r2 = (x) => Math.round(x * 100) / 100;
  const overview = [['Площадь по контуру', r2(A), 100], ['Занято участками с ЕНИ', r2(o.occHa), r2(o.occHa / A * 100)], ['Дороги', r2(o.roadsHa || 0), r2((o.roadsHa || 0) / A * 100)],
    ['Вода и русла', r2(o.waterHa || 0), r2((o.waterHa || 0) / A * 100)], ...terrainOf(o).map(([, l, h]) => [l, r2(h), r2(h / A * 100)]),
    ['Здания без ЕНИ', r2(o.bldHa || 0), r2((o.bldHa || 0) / A * 100)], ['Узкие полосы', r2(o.stripsHa || 0), r2((o.stripsHa || 0) / A * 100)],
    ['Клочки', r2(o.smallHa || 0), r2((o.smallHa || 0) / A * 100)], ['Свободно', r2(o.freeHa), r2(o.freeHa / A * 100)],
    ...d.parts.filter((p) => p.free).map((p) => ['  свободно: ' + p.label, r2(o.zones[p.key] || 0), r2((o.zones[p.key] || 0) / A * 100)])];
  const c = o.cmp || {};
  const sheets = [
    { name: 'Обзор', head: ['Показатель', 'га', '% площади'], rows: overview },
    { name: 'Свободные массивы', head: ['№', 'Покров', 'Площадь, га', 'Запад', 'Юг', 'Восток', 'Север'],
      rows: (d.patches ? pickPatches(d.patches, d.cfg) : []).map((p, i) => [i + 1, (d.parts.find((x) => x.key === p.zone) || {}).label || p.zone, r2(p.ha), ...p.bounds.flat().map((v) => +v.toFixed(6))]) },
    { name: 'Сверка', head: ['Показатель', 'Значение'], rows: [['Вода — OpenStreetMap, га', c.waterOsmHa], ['Вода — ESA WorldCover, га', c.waterWcHa], ['Вода — в обоих, га', c.waterBothHa],
      ['Овраги, обрывы, карьеры — OpenStreetMap, га', c.reliefOsmHa], ['Склоны круче ' + o.slope + '° — Copernicus DEM, га', c.steepHa], ['Зданий по снимкам', c.buildings], ['Зданий на участках с ЕНИ', c.buildings != null ? c.buildings - (c.buildingsNoEni || 0) : null], ['Зданий без ЕНИ', c.buildingsNoEni],
      ['Порог «на участке», доля площади здания', o.bldOn != null ? o.bldOn : 'по точке внутри контура'],
      ...(Array.isArray(c.bldCoverHist) ? c.bldCoverHist.map((x, i) => [`Зданий с долей на участках ${i * 5}–${Math.min(100, i * 5 + 5)} %${i === 20 ? ' (целиком)' : ''}`, x]) : []),
      ...Object.entries(c.parcelsOnWater || {}).map(([f, v]) => [`Участки на воде: ${f}`, `${v.n} уч., ${v.ha} га`])] },
  ];
  if (d.parcelRows) sheets.push({ name: 'Участки по формам', head: ['Форма собственности', 'Участков', 'Площадь, га'], rows: d.parcelRows });
  return { name: `Досье аймака ${a.aimak} (${a.code}) ${fmt.date(new Date().toISOString())}.xlsx`, sheets };
}
