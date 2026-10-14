// Кадастровые слои поверх карты Leaflet: границы участков и капитальные
// строения ВОКРУГ наших объектов (решение пользователя 13.10.2026:
// «Участки вокруг на карте, Строения на участке»). Подключают карта
// маршрута дня (вокруг остановок) и карта участка в карточке ОЦ (вокруг
// участка).
//
// Где смотришь — там и Кадастр (13.10.2026: «И где кадастр?», «чтобы можно
// было без проблем перемещаться»): видимая часть делится на клетки ~450 м,
// клетка грузится один раз и запоминается, при перемещении догружаются только
// новые. С масштаба 17 (кварталы): по видимой части на 16 в центре Бишкека
// выходило 500+ участков и 300+ строений — карта перегружена («Ты всю базу
// кадастра чтоль…», снимок пользователя 13.10.2026); на 17 — десятки.
// Запросов разом — не больше трёх. Всё — в памяти вкладки, никуда не
// пишется. Строка состояния на карте: «приблизьте», «загружаю», «участков N ·
// строений M», «Кадастр не ответил» (практика APCS «три состояния блока»).
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: слой отдаёт свой картосервер из выгрузки Кадастра —
// без запросов к порталу с рабочего места.
import { featuresInBox } from './cadastreGeo.js';
import { esc } from './dom.js';
import { formatEniText } from './eniField.js';

// Масштаб карт макета: дробные уровни (колесо ведёт kernel/smoothWheel.js —
// одной плавной кривой), кнопки «+»/«−» — на уровень.
export const SMOOTH_ZOOM = { zoomSnap: 0, zoomDelta: 1 };

const MIN_ZOOM = 17;
const CELL_LAT = 0.004;       // клетка ≈ 445 м по широте
const CELL_LON = 0.0055;      // ≈ 450 м по долготе на широте Кыргызстана
const PARALLEL = 3;           // запросов к порталу разом

// Второй довод (точки) больше не нужен: слои — по видимой части карты.
export function attachCadastreLayers(L, map) {
  // Порядок слоёв — панелями карты, а не порядком загрузки: участки соседних
  // точек догружаются позже и иначе ложились поверх строений (по строению не
  // щёлкнуть). Снизу вверх: участки 380, строения 390, линия маршрута
  // (overlayPane, 400), свой участок ('own', 450), значки.
  [['cadParcels', 380], ['cadBuilds', 390]].forEach(([n, z]) => { if (!map.getPane(n)) map.createPane(n).style.zIndex = z; });
  const parcels = L.layerGroup().addTo(map);
  const builds = L.layerGroup().addTo(map);
  const Note = L.Control.extend({
    onAdd() { const d = L.DomUtil.create('div', 'cad-note'); L.DomEvent.disableClickPropagation(d); return d; },
  });
  const note = new Note({ position: 'bottomleft' }).addTo(map);
  const say = (t, cls = '') => { const el = note.getContainer(); el.textContent = t; el.className = 'cad-note ' + cls; };
  const toLL = (poly) => poly.map((ring) => ring.map(([lon, lat]) => [lat, lon]));
  const shapes = (g) => (g.type === 'Polygon' ? [toLL(g.coordinates)] : g.type === 'MultiPolygon' ? g.coordinates.map(toLL) : []);
  const seen = new Set();      // ЕНИ и строения, уже нарисованные (квадраты соседних точек пересекаются)
  // Выделение участка — по его контуру, сколько бы в нём ни было точек:
  // заливка и толстая граница самой фигуры (замечание пользователя
  // 13.10.2026: «Выделение явно не по границам… Это не обязательно 4 точки!
  // напиши нормальное выделение»). Прямоугольник, который был виден, —
  // обводка фокуса браузера по габаритам фигуры; она снята в tokens.css.
  // Щелчок по выделенному или мимо участков — снять выделение.
  const PARCEL = { color: '#8b5cf6', opacity: 0.6, weight: 0.8, fillColor: '#8b5cf6', fillOpacity: 0 };
  const PICKED = { color: '#6d28d9', opacity: 1, weight: 3, fillColor: '#8b5cf6', fillOpacity: 0.32 };
  // Строения — так же (13.10.2026: «А со строениями как быть?»): одно
  // выделенное на карте — участок или строение.
  const BUILD = { color: '#64748b', opacity: 0.7, weight: 0.8, fillColor: '#94a3b8', fillOpacity: 0.22 };
  const BUILD_PICKED = { color: '#334155', opacity: 1, weight: 3, fillColor: '#64748b', fillOpacity: 0.55 };
  let picked = null;
  let skip = false;            // щелчок по участку дошёл и до карты — его не считать «мимо»
  const pick = (layer) => {
    skip = true;
    setTimeout(() => { skip = false; });
    if (picked) picked.setStyle(picked.options.base);
    picked = picked === layer ? null : layer;
    if (picked) {
      picked.setStyle(picked.options.hot);
      picked.bringToFront();
    }
  };
  const onMapClick = () => {
    if (skip) { skip = false; return; }
    if (picked) { picked.setStyle(picked.options.base); picked = null; }
  };
  map.on('click', onMapClick);
  let np = 0;
  let nb = 0;
  let failed = false;
  const cells = new Map();     // «i|j» → 'busy' | 'done'
  const queue = [];
  let running = 0;
  const status = () => {
    if (map.getZoom() < MIN_ZOOM) return say('Кадастр: приблизьте карту — покажу участки и строения');
    if (failed) return say('Кадастр не ответил — запустите прокси: python tools/cadastre/proxy.py', 'err');
    say(`Кадастр: участков ${np} · строений ${nb}${running || queue.length ? ' · загружаю…' : ''}`);
  };
  const drawParcels = (ps) => ps.forEach((f) => {
    const pr = f.properties || {};
    const key = 'p' + (pr.PROPCODE || JSON.stringify(f.geometry).slice(0, 80));
    if (seen.has(key)) return;
    seen.add(key);
    np += 1;
    shapes(f.geometry || {}).forEach((poly) => L.polygon(poly, { ...PARCEL, pane: 'cadParcels', fill: true, className: 'cad-parcel', base: PARCEL, hot: PICKED })
      .on('click', (e) => pick(e.target))
      .bindTooltip(`<b>ЕНИ ${esc(formatEniText(String(pr.PROPCODE || '').replace(/\D/g, '')))}</b>${pr.ADDRESS ? `<br>${esc(pr.ADDRESS)}` : ''}${pr.NAZNACHENI ? `<br><i>назначение по Кадастру: ${esc(pr.NAZNACHENI)}</i>` : ''}`, { sticky: true, className: 'map-tip' })
      .addTo(parcels));
  });
  const drawBuilds = (bs) => bs.forEach((f) => {
    const key = 'b' + JSON.stringify(f.geometry).slice(0, 120);
    if (seen.has(key)) return;
    seen.add(key);
    nb += 1;
    const pr = f.properties || {};
    shapes(f.geometry || {}).forEach((poly) => L.polygon(poly, { ...BUILD, pane: 'cadBuilds', className: 'cad-build', base: BUILD, hot: BUILD_PICKED })
      .on('click', (e) => pick(e.target))
      .bindTooltip(`<b>Строение${pr.BUILD_TYPE ? ` · ${esc(pr.BUILD_TYPE)}` : ''}</b>${pr.NAZNACHENI ? `<br><i>назначение по Кадастру: ${esc(pr.NAZNACHENI)}</i>` : ''}${pr.ADDRESS ? `<br>${esc(pr.ADDRESS)}` : ''}`, { sticky: true, className: 'map-tip' })
      .addTo(builds));
  });
  const pump = () => {
    while (running < PARALLEL && queue.length) {
      const [k, box] = queue.shift();
      if (!map._loaded) return;
      running += 1;
      Promise.all([
        featuresInBox('ENI_WGS84', box, 'PROPCODE,DOMCODE,ADDRESS,NAZNACHENI,THE_GEOM', 400),
        featuresInBox('ENI_BUILDINGS', box, 'PROPCODE,BUILD_TYPE,NAZNACHENI,ADDRESS,THE_GEOM', 400),
      ]).then(([ps, bs]) => {
        if (!map._loaded) return;
        cells.set(k, 'done');
        drawParcels(ps);
        drawBuilds(bs);
      }).catch(() => { cells.delete(k); failed = true; })
        .finally(() => { running -= 1; status(); pump(); });
    }
  };
  // Клетки видимой части (с запасом в полклетки) — в очередь, ближние к
  // середине — первыми.
  const load = () => {
    if (map.getZoom() < MIN_ZOOM) { status(); return; }
    failed = false;
    const b = map.getBounds().pad(0.15);
    const c = map.getCenter();
    const want = [];
    for (let i = Math.floor(b.getSouth() / CELL_LAT); i <= Math.floor(b.getNorth() / CELL_LAT); i++) {
      for (let j = Math.floor(b.getWest() / CELL_LON); j <= Math.floor(b.getEast() / CELL_LON); j++) {
        const k = i + '|' + j;
        if (cells.has(k)) continue;
        const box = [j * CELL_LON, i * CELL_LAT, (j + 1) * CELL_LON, (i + 1) * CELL_LAT];
        want.push([k, box, Math.hypot((box[1] + box[3]) / 2 - c.lat, (box[0] + box[2]) / 2 - c.lng)]);
      }
    }
    want.sort((x, y) => x[2] - y[2]).forEach(([k, box]) => { cells.set(k, 'busy'); queue.push([k, box]); });
    status();
    pump();
  };
  const onZoom = () => {
    const show = map.getZoom() >= MIN_ZOOM;
    [parcels, builds].forEach((g) => { if (show && !map.hasLayer(g)) g.addTo(map); if (!show && map.hasLayer(g)) g.remove(); });
    load();
  };
  map.on('moveend', onZoom);

  onZoom();
  return () => { map.off('moveend', onZoom); map.off('click', onMapClick); queue.length = 0; parcels.remove(); builds.remove(); note.remove(); };
}
