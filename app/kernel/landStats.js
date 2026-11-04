// Земли по айыл аймакам: контур и земельный баланс аймака (Дарек) и занятость
// участками с ЕНИ — по координатам контуров участков из Кадастра.
//
// Пользователь 04.11.2026: «Нам необходимо так же считать и незанятую площадь
// по аймакам. Для расчета соотношений площадей занятых и нет»; занятое —
// «Участки с ЕНИ»; «Нас интересует оценка по координатам. Т.к. точность
// важна»; «Нам уже отдают координаты для карты? Остается лишь границы регионов
// прикрутить». Выгрузку базы Кадастр готовит сам («В последствии все соединим
// воедино»).
//
// Как считается (estimateAimak):
//   1. Контур и баланс аймака — Дарек, WMS GetFeatureInfo по точке (aimakAt).
//   2. Рамка аймака режется на квадраты 4 096 м карты (EPSG:3857); по каждому —
//      контуры участков картосервера Кадастра (ENI_WGS84 — и участки поселений,
//      и сельхозучастки, проверено 04.11.2026). Ответ упёрся в предел — квадрат
//      делится на четыре.
//   3. Контуры рисуются по координатам на полотно 2 048 точек (2 м карты ≈
//      1,5 м земли на точку) со сглаживанием: точка учитывается долей, на
//      которую её покрывают контуры; наложения не считаются дважды; всё за
//      контуром аймака срезается. Площадь точки — по её широте.
//   4. Доля = покрытое / контур аймака на тех же полотнах; занято, га = доля ×
//      площадь аймака по контуру.
//   5. Дороги — отдельной категорией («Дороги не считаем свободными землями»,
//      04.11.2026): линии OpenStreetMap (kernel/osmRoads.js) шириной по классу
//      в контуре аймака за вычетом участков; не занято = остальное.
//   ГФСУ (фонд сельхозугодий) у Кадастра контурами не отдаётся — его доля по
//   картинке слоя Дарека (заливка) на тех же полотнах; подписана отдельно.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: открытые карты Кадастра и Дарека без договора; в
// системе — по выгрузке Кадастра на сервере (объединение контуров внутри
// аймака), с датой выгрузки.
import { registerPersisted, scheduleSave } from './persist.js';
import { parseAdmin } from './darekAdmin.js';
import { areaM2 } from './cadastreTip.js';
import { featuresInBox } from './cadastreGeo.js';
import { cachedFetch } from './netCache.js';
import { roadsInBox, strokeRoads } from './osmRoads.js';

const BASE = 'http://map.darek.kg/qgis/qgis_mapserv.fcgi.exe?map=' + encodeURIComponent('C:/OSGeo4W64/projects/ГИСАР/ГИСАР.qgz');
const AIMAK_LAYER = 'Границы айылных аймаков';
const GFSU_LAYER = 'ГФСУ';
// Сведения участка для сводки «Участки» (пользователь 04.11.2026: «нужна сводка
// по тому, что вытащили. Сколько в гос собственности, сколько в частной. Что без
// меток… всевозможные срезы»).
const PARCEL_PROPS = 'PROPCODE,NAZNACHENI,PROPFOR_NAME,PROPFORM_NAME,DATEINS,AMNESTIED,FROM_GPS,THE_GEOM';
const SIZE = 2048;             // сторона полотна, точек
const TILE = 4096;             // сторона квадрата, метров карты (2 м на точку)
const MAX = 3000;              // предел ответа Кадастра на квадрат
// Картинка незанятой земли аймака для карты страницы «Аналитика»: 40 м карты
// (≈ 30 м земли) на точку — видно, где не занято, и запись не раздувается.
const FREE_RES = 40;
const FREE_COLOR = '#e8730c';

// Аймаки: код аймака → { code, aimak, district, oblast, balance, geometry, areaHa, occ }.
const aimaks = new Map();
// Сведения участков аймака (parcelStats) в хранилище браузера не кладутся —
// сотни тысяч строк не помещаются; живут в памяти и в файле готовых данных
// app/data/analytics/land-parcels.json.
const parcelStats = new Map();   // код аймака → { dict, rows }
export const parcelStatsOf = (code) => parcelStats.get(code) || null;
export const allParcelStats = () => [...parcelStats.entries()];
registerPersisted('analytics.aimaks', {
  snapshot: () => [...aimaks.values()],
  restore: (saved) => {
    if (!Array.isArray(saved)) return;
    aimaks.clear();
    saved.filter((a) => a && a.code).forEach((a) => aimaks.set(a.code, a));
  },
});
export const allAimaks = () => [...aimaks.values()];
export const aimakByCode = (code) => aimaks.get(code) || null;

const unmerc = (x, y) => [x * 180 / 20037508.34, (2 * Math.atan(Math.exp(y * Math.PI / 20037508.34)) - Math.PI / 2) * 180 / Math.PI];
const merc = (lon, lat) => [lon * 20037508.34 / 180, Math.log(Math.tan((90 + lat) * Math.PI / 360)) * 20037508.34 / Math.PI];

// Аймак в точке [широта, долгота] — с контуром; записывается в перечень.
export async function aimakAt(lat, lon) {
  const d = 0.0005;
  const q = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetFeatureInfo', LAYERS: AIMAK_LAYER, QUERY_LAYERS: AIMAK_LAYER,
    CRS: 'CRS:84', BBOX: [lon - d, lat - d, lon + d, lat + d].join(','), WIDTH: '101', HEIGHT: '101', I: '50', J: '50',
    INFO_FORMAT: 'application/json', FEATURE_COUNT: '1', WITH_GEOMETRY: 'true',
  });
  const r = await cachedFetch(BASE + '&' + q.toString(), { ttlDays: 30 });
  if (!r.ok) throw new Error('Дарек ответил ' + r.status);
  const fc = await r.json();
  const f = (fc.features || [])[0];
  if (!f || !f.geometry) return null;
  const adm = parseAdmin({ features: [f] });
  if (!adm.aimakCode) return null;
  const prev = aimaks.get(adm.aimakCode);
  const row = {
    ...(prev || {}), code: adm.aimakCode, aimak: adm.aimak, district: adm.district, oblast: adm.oblast, balance: adm.balance,
    geometry: f.geometry, areaHa: Math.round(areaM2(f.geometry) / 100) / 100, at: new Date().toISOString(),
  };
  aimaks.set(row.code, row);
  scheduleSave();
  return row;
}

function loadImage(url) {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => ok(img);
    img.onerror = () => fail(new Error('картинка слоя ГФСУ не загрузилась'));
    img.src = url;
  });
}

// Контуры участков Кадастра в квадрате [x1, y1, x2, y2] (метры карты): упёрся
// в предел — делится на четыре.
async function parcelsIn(b, depth = 0) {
  const [lon1, lat1] = unmerc(b[0], b[1]);
  const [lon2, lat2] = unmerc(b[2], b[3]);
  // Контуры — в кэше браузера на 7 дней: повторный расчёт и показ того же места не идут в Кадастр.
  const fs = await featuresInBox('ENI_WGS84', [lon1, lat1, lon2, lat2], PARCEL_PROPS, MAX, { cacheDays: 7 });
  if (fs.length < MAX || depth >= 4) return fs;
  const mx = (b[0] + b[2]) / 2;
  const my = (b[1] + b[3]) / 2;
  const parts = await Promise.all([[b[0], b[1], mx, my], [mx, b[1], b[2], my], [b[0], my, mx, b[3]], [mx, my, b[2], b[3]]].map((q) => parcelsIn(q, depth + 1)));
  return parts.flat();
}

// Путь контура (Polygon или MultiPolygon в долготе и широте) на полотне квадрата b.
function path(ctx, geometry, b) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  const k = SIZE / (b[2] - b[0]);
  polys.forEach((rings) => rings.forEach((ring) => ring.forEach(([lon, lat], i) => {
    const [x, y] = merc(lon, lat);
    const px = (x - b[0]) * k;
    const py = (b[3] - y) * k;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  })));
}

// Покрытие полотна в м² земли: доля точки (прозрачность) × площадь точки на её
// широте (сторона точки на земле — 2 м карты × cos широты).
function coveredM2(ctx, b) {
  const d = ctx.getImageData(0, 0, SIZE, SIZE).data;
  const side = (b[2] - b[0]) / SIZE;
  let sum = 0;
  for (let r = 0; r < SIZE; r++) {
    let row = 0;
    for (let c = 0, i = r * SIZE * 4 + 3; c < SIZE; c++, i += 4) row += d[i];
    if (!row) continue;
    const lat = unmerc(0, b[3] - (r + 0.5) * side)[1];
    const g = side * Math.cos(lat * Math.PI / 180);
    sum += (row / 255) * g * g;
  }
  return sum;
}

function canvas() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  return cv.getContext('2d', { willReadFrequently: true });
}

// Залить контуры (каждый — своим путём: дыры участка остаются дырами, а
// наложения разных участков не складываются).
function fillAll(ctx, geometries, b) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#000';
  geometries.forEach((g) => { if (g) { ctx.beginPath(); path(ctx, g, b); ctx.fill('evenodd'); } });
}

// Стереть контуры с полотна (что под участками — не дорога и не свободно).
function eraseAll(ctx, geometries, b) {
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  geometries.forEach((g) => { if (g) { ctx.beginPath(); path(ctx, g, b); ctx.fill('evenodd'); } });
  ctx.globalCompositeOperation = 'source-over';
}

function clipTo(ctx, geometry, b) {
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath();
  path(ctx, geometry, b);
  ctx.fill('evenodd');
  ctx.globalCompositeOperation = 'source-over';
}

// Оценка занятости аймака. onProgress(готово, всего); signal.aborted — остановить.
export async function estimateAimak(code, { onProgress, signal } = {}) {
  const row = aimaks.get(code);
  if (!row || !row.geometry) throw new Error('нет контура аймака');
  const polys = row.geometry.type === 'Polygon' ? [row.geometry.coordinates] : row.geometry.coordinates;
  let [x1, y1, x2, y2] = [Infinity, Infinity, -Infinity, -Infinity];
  polys.forEach((rings) => rings[0].forEach(([lon, lat]) => {
    const [x, y] = merc(lon, lat);
    x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y);
  }));
  const ctx = canvas();
  // Полотно незанятой земли на всю рамку аймака.
  const fw = Math.max(1, Math.ceil((x2 - x1) / FREE_RES));
  const fh = Math.max(1, Math.ceil((y2 - y1) / FREE_RES));
  const free = document.createElement('canvas');
  free.width = fw;
  free.height = fh;
  const fctx = free.getContext('2d');
  fctx.imageSmoothingEnabled = true;
  const tiles = [];
  for (let tx = x1; tx < x2; tx += TILE) for (let ty = y1; ty < y2; ty += TILE) tiles.push([tx, ty, tx + TILE, ty + TILE]);
  let mask = 0;
  let occ = 0;
  let gfsu = 0;
  // Участки аймака для сводки: один участок — одному аймаку (центр контура в
  // контуре аймака), площадь — по контуру; значения — словарями, строки — числами.
  const dict = { form: [''], use: [''], purp: [''] };
  const idx = (k, v) => { const x = String(v == null ? '' : v).trim(); const s2 = x === 'None' || x === '-9999' || x === 'null' ? '' : x; let i = dict[k].indexOf(s2); if (i < 0) { i = dict[k].length; dict[k].push(s2); } return i; };
  const prow = [];
  const collect = (f) => {
    const g = f.geometry;
    if (!g) return;
    const c = centroidOf(g);
    if (!c || !insideGeom(c, row.geometry)) return;
    const pr = f.properties || {};
    const y = String(pr.DATEINS || '').match(/^(\d{4})/);
    prow.push([Math.round(areaM2(g)), idx('form', pr.PROPFORM_NAME), idx('use', pr.PROPFOR_NAME), idx('purp', pr.NAZNACHENI),
      y ? +y[1] : 0, /^(true|1)$/i.test(String(pr.AMNESTIED || '')) ? 1 : 0, /^(true|1)$/i.test(String(pr.FROM_GPS || '')) ? 1 : 0]);
  };
  let roads = 0;
  let roadsMissing = 0;
  const seen = new Set();
  let done = 0;
  for (const b of tiles) {
    if (signal && signal.aborted) throw new Error('остановлено');
    fillAll(ctx, [row.geometry], b);
    const m = coveredM2(ctx, b);
    if (m > 0) {
      const url = `${BASE}&SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${encodeURIComponent(GFSU_LAYER)}&STYLES=&FORMAT=image/png&TRANSPARENT=true`
        + `&CRS=EPSG:3857&WIDTH=${SIZE}&HEIGHT=${SIZE}&BBOX=${b.join(',')}`;
      const [fs, img, rd] = await Promise.all([parcelsIn(b), loadImage(url), roadsInBox(b).catch(() => null)]);
      if (!rd) roadsMissing++;
      fs.forEach((f) => {
        const k = (f.properties || {}).PROPCODE || f.id;
        if (seen.has(k)) return;
        seen.add(k);
        collect(f);
      });
      const geoms = fs.map((f) => f.geometry);
      fillAll(ctx, geoms, b);
      clipTo(ctx, row.geometry, b);
      occ += coveredM2(ctx, b);
      // Под дорогами: дороги в контуре аймака за вычетом участков (дорога, оформленная участком, — «занято»).
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.strokeStyle = '#000';
      if (rd) strokeRoads(ctx, rd, b, SIZE);
      clipTo(ctx, row.geometry, b);
      eraseAll(ctx, geoms, b);
      roads += coveredM2(ctx, b);
      // Незанятое: контур аймака минус участки минус дороги — уменьшенно на общее полотно.
      fillAll(ctx, [row.geometry], b);
      eraseAll(ctx, geoms, b);
      ctx.globalCompositeOperation = 'destination-out';
      if (rd) strokeRoads(ctx, rd, b, SIZE);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = FREE_COLOR;
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.globalCompositeOperation = 'source-over';
      fctx.drawImage(ctx.canvas, (b[0] - x1) / FREE_RES, (y2 - b[3]) / FREE_RES, TILE / FREE_RES, TILE / FREE_RES);
      ctx.fillStyle = '#000';
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.drawImage(img, 0, 0);
      clipTo(ctx, row.geometry, b);
      gfsu += coveredM2(ctx, b);
      mask += m;
    }
    done++;
    if (onProgress) onProgress(done, tiles.length);
  }
  const share = mask ? occ / mask : 0;
  const rshare = mask ? roads / mask : 0;
  const gshare = mask ? gfsu / mask : 0;
  const r2 = (x) => Math.round(x * 100) / 100;
  row.occ = {
    share, occHa: r2(row.areaHa * share),
    roadsShare: rshare, roadsHa: r2(row.areaHa * rshare), roadsMissing,
    freeShare: Math.max(0, 1 - share - rshare), freeHa: r2(row.areaHa * Math.max(0, 1 - share - rshare)),
    gfsuShare: gshare, gfsuHa: Math.round(row.areaHa * gshare * 100) / 100,
    parcels: seen.size, tiles: tiles.length, at: new Date().toISOString(),
    // Незанятая земля картинкой: углы — [запад, север], [восток, север], [восток, юг], [запад, юг].
    free: { url: free.toDataURL('image/png'), coords: [unmerc(x1, y2), unmerc(x2, y2), unmerc(x2, y1), unmerc(x1, y1)] },
    by: 'контуры участков Кадастра (ENI_WGS84); дороги — OpenStreetMap (ширина по классу); ГФСУ — картинка слоя Дарека',
  };
  parcelStats.set(row.code, { dict, rows: prow, at: row.occ.at });
  scheduleSave();
  return row;
}

// Середина самого большого кольца контура [долгота, широта].
function centroidOf(g) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  let best = null;
  polys.forEach((rings) => { if (rings[0] && (!best || rings[0].length > best.length)) best = rings[0]; });
  if (!best || !best.length) return null;
  let x = 0;
  let y = 0;
  best.forEach((p) => { x += p[0]; y += p[1]; });
  return [x / best.length, y / best.length];
}
// Точка в контуре (чёт-нечет по всем кольцам).
function insideGeom([x, y], g) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let inside = false;
  polys.forEach((rings) => rings.forEach((ring) => {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }));
  return inside;
}

// Покрытие квадрата контурами — для сверки с точным объединением (проверки).
export async function coverageOfBox(lon, lat, halfM) {
  const [cx, cy] = merc(lon, lat);
  const b = [cx - halfM, cy - halfM, cx + halfM, cy + halfM];
  const ctx = canvas();
  const fs = await parcelsIn(b);
  fillAll(ctx, fs.map((f) => f.geometry), b);
  const occ = coveredM2(ctx, b);
  ctx.fillRect(0, 0, SIZE, SIZE);
  return { parcels: fs.length, share: occ / coveredM2(ctx, b) };
}

// --- готовые данные для показа ---------------------------------------------
// Пользователь 04.11.2026: «Все расчеты и данные сохрани… Что бы на
// демонстрации не ждать 10 минут». Файл app/data/analytics/land-seed.json —
// аймаки (контур, баланс, занятость, картинка незанятой земли) и привязки ОЦ к
// аймакам (ключ «тип|id записи»); собирает tools/analytics/build_land_seed.py с
// живой страницы. Свой расчёт в браузере новее — он и остаётся.
const SEED_URL = './app/data/analytics/land-seed.json';
let seedAdm = {};
let seedAt = '';
let seeding = null;
export function loadSeed() {
  if (!seeding) {
    seeding = fetch(SEED_URL).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((d) => {
      if (!d || !Array.isArray(d.aimaks)) return;
      seedAt = d.at || '';
      d.aimaks.filter((a) => a && a.code).forEach((a) => {
        const own = aimaks.get(a.code);
        const newer = (x) => (x && x.occ && x.occ.at) || '';
        if (!own || (!own.geometry && a.geometry) || newer(a) > newer(own)) aimaks.set(a.code, a);
      });
      seedAdm = d.adm || {};
    });
  }
  return seeding;
}
export const seedInfo = () => ({ at: seedAt, aimaks: Object.keys(seedAdm).length ? allAimaks().length : 0 });
export const seedAdmOf = (typeId, id) => seedAdm[typeId + '|' + id] || null;
// Снимок для файла готовых данных: все аймаки и привязки переданных записей.
export function exportParcels() {
  return { at: new Date().toISOString(), aimaks: Object.fromEntries(parcelStats) };
}
// Сведения участков из файла готовых данных — по запросу экрана «Участки».
let parcelsLoading = null;
export function loadParcelsSeed() {
  if (!parcelsLoading) {
    parcelsLoading = fetch('./app/data/analytics/land-parcels.json').then((r) => (r.ok ? r.json() : null)).catch(() => null).then((d) => {
      if (!d || !d.aimaks) return;
      Object.entries(d.aimaks).forEach(([code, st]) => {
        const own = parcelStats.get(code);
        if (!own || (st.at || '') > (own.at || '')) parcelStats.set(code, st);
      });
    });
  }
  return parcelsLoading;
}
export function exportSeed(objs) {
  const adm = {};
  objs.forEach((o) => { if (o.rec.adm && o.rec.adm.aimakCode) adm[o.typeId + '|' + o.rec.id] = o.rec.adm; });
  return { at: new Date().toISOString(), aimaks: allAimaks(), adm };
}

// --- незанятая земля вблизи — клетками ------------------------------------
// Пользователь 04.11.2026 про картинку аймака ≈ 30 м: «Я про грубую очень
// сетку при приближении»; затем про картинку под экран: «Отрисовывается только
// пока карта в состоянии покоя». Вблизи незанятое рисуется клетками (как плитки
// карты): клетка CELL метров карты — контуры посчитанных аймаков минус участки
// Кадастра минус дороги OSM, по координатам, 1024 точки (≈ 1,5 м земли на точку);
// нарисованная клетка остаётся на карте, при движении дорисовываются новые.
// Контуры и дороги — из кэша (kernel/netCache.js). Картинка — файлом в памяти
// браузера (toBlob, без кодирования в строку).
export const CELL = 2048;   // метров карты
const CELL_PX = 1024;

function bboxOf(a) {
  if (!a._bb) {
    const polys = a.geometry.type === 'Polygon' ? [a.geometry.coordinates] : a.geometry.coordinates;
    let [bx1, by1, bx2, by2] = [Infinity, Infinity, -Infinity, -Infinity];
    polys.forEach((rings) => rings[0].forEach(([lon, lat]) => { const [x, y] = merc(lon, lat); bx1 = Math.min(bx1, x); by1 = Math.min(by1, y); bx2 = Math.max(bx2, x); by2 = Math.max(by2, y); }));
    Object.defineProperty(a, '_bb', { value: [bx1, by1, bx2, by2], enumerable: false, configurable: true });
  }
  return a._bb;
}
const meets = (bb, b) => !(bb[2] < b[0] || bb[0] > b[2] || bb[3] < b[1] || bb[1] > b[3]);

// Аймаки (посчитанные), задевающие клетку b = [x1, y1, x2, y2] (метры карты).
export const aimaksInCell = (rows, b) => rows.filter((a) => a && a.geometry && a.occ && meets(bboxOf(a), b));

// Картинка незанятой земли клетки: { url, coords } или null, если аймаков в клетке нет.
export async function freeCell(rows, b) {
  const hit = aimaksInCell(rows, b);
  if (!hit.length) return null;
  const [fs, rd] = await Promise.all([parcelsIn(b), roadsInBox(b).catch(() => [])]);
  const cv = document.createElement('canvas');
  cv.width = cv.height = CELL_PX;
  const ctx = cv.getContext('2d');
  const k = CELL_PX / (b[2] - b[0]);
  const trace = (g) => {
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    polys.forEach((rings) => rings.forEach((ring) => ring.forEach(([lon, lat], i) => {
      const [x, y] = merc(lon, lat);
      const px = (x - b[0]) * k;
      const py = (b[3] - y) * k;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    })));
  };
  ctx.fillStyle = FREE_COLOR;
  hit.forEach((a) => { ctx.beginPath(); trace(a.geometry); ctx.fill('evenodd'); });
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  fs.forEach((f) => { if (f.geometry) { ctx.beginPath(); trace(f.geometry); ctx.fill('evenodd'); } });
  ctx.strokeStyle = '#000';
  strokeRoads(ctx, rd, b, CELL_PX);
  const blob = await new Promise((ok) => cv.toBlob(ok, 'image/png'));
  return { url: URL.createObjectURL(blob), coords: [unmerc(b[0], b[3]), unmerc(b[2], b[3]), unmerc(b[2], b[1]), unmerc(b[0], b[1])] };
}
