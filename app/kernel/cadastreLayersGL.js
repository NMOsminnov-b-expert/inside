// Участки и строения Кадастра на карте MapLibre — где смотришь.
//
// То же, что kernel/cadastreLayers.js для Leaflet (решения пользователя
// 13.10.2026: «Участки вокруг на карте, Строения на участке»; «И где
// кадастр?»; «чтобы можно было без проблем перемещаться»; выделение — по
// контуру, сколько бы в нём ни было точек), но на видеокарте: тысячи
// участков квартала не тормозят ни масштаб, ни перемещение. Видимая часть
// делится на клетки ~670 м, клетка грузится один раз, при перемещении —
// только новые; с масштаба 16. Запросов разом — три. В память вкладки,
// никуда не пишется.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: слой отдаёт свой картосервер векторными тайлами из
// выгрузки Кадастра — без запросов к порталу с рабочего места.
import { featuresInBox } from './cadastreGeo.js';
import { PARCEL_FIELDS, BUILD_FIELDS, parcelTipHTML, buildingTipHTML, buildsOfParcel } from './cadastreTip.js';
import { emptyFC, hoverTip } from './mapgl.js';

const MIN_ZOOM = 16;
const CELL_LAT = 0.006;
const CELL_LON = 0.008;
const PARALLEL = 3;

// beforeId — слой, под которым лежит Кадастр (точки объектов — над ним).
export function attachCadastreGL(gl, map, { beforeId } = {}) {
  const parcels = [];
  const builds = [];
  const seen = new Set();
  let nextId = 1;
  map.addSource('cadP', { type: 'geojson', data: emptyFC() });
  map.addSource('cadB', { type: 'geojson', data: emptyFC() });
  const picked = (on, off) => ['case', ['boolean', ['feature-state', 'picked'], false], on, off];
  const add = (layer) => map.addLayer({ minzoom: MIN_ZOOM - 0.5, ...layer }, beforeId && map.getLayer(beforeId) ? beforeId : undefined);
  add({ id: 'cadP-fill', type: 'fill', source: 'cadP', paint: { 'fill-color': '#8b5cf6', 'fill-opacity': picked(0.32, 0) } });
  add({ id: 'cadP-line', type: 'line', source: 'cadP', paint: { 'line-color': picked('#6d28d9', '#8b5cf6'), 'line-opacity': picked(1, 0.6), 'line-width': picked(3, 0.8) } });
  add({ id: 'cadB-fill', type: 'fill', source: 'cadB', paint: { 'fill-color': picked('#64748b', '#94a3b8'), 'fill-opacity': picked(0.55, 0.22) } });
  add({ id: 'cadB-line', type: 'line', source: 'cadB', paint: { 'line-color': picked('#334155', '#64748b'), 'line-opacity': picked(1, 0.7), 'line-width': picked(3, 0.8) } });

  const note = document.createElement('div');
  note.className = 'cad-note cad-note-gl';
  map.getContainer().appendChild(note);
  // Подпись — над атрибуцией карты, только когда та дотягивается до неё: на узкой
  // карте атрибуция разворачивается во всю ширину низа в одну-две строки, и подпись
  // ложилась на неё («Осмотрщики → Маршрут», 04.11.2026). Иначе — у нижнего края.
  const place = () => {
    const box = map.getContainer();
    const at = box.querySelector('.maplibregl-ctrl-attrib');
    note.style.bottom = '';
    if (!at || !note.textContent) return;
    const a = at.getBoundingClientRect();
    const n = note.getBoundingClientRect();
    if (a.width && a.left < n.right + 8) note.style.bottom = Math.round(box.getBoundingClientRect().bottom - a.top + 6) + 'px';
  };
  const say = (t, cls = '') => { note.textContent = t; note.className = 'cad-note cad-note-gl ' + cls; place(); };
  map.on('resize', place);
  // Атрибуция сворачивается и разворачивается сама (компактный вид на узкой карте).
  const attrib = map.getContainer().querySelector('.maplibregl-ctrl-attrib');
  if (attrib && typeof MutationObserver === 'function') new MutationObserver(place).observe(attrib, { attributes: true, attributeFilter: ['class'] });

  // Выделение — по контуру самой фигуры; одно на карте; повторный щелчок или
  // щелчок мимо снимает.
  let sel = null;
  const pick = (f) => {
    if (sel) map.setFeatureState(sel, { picked: false });
    const same = sel && f && sel.source === f.source && sel.id === f.id;
    sel = f && !same ? { source: f.source, id: f.id } : null;
    if (sel) map.setFeatureState(sel, { picked: true });
  };
  const under = (point) => map.queryRenderedFeatures(point, { layers: ['cadB-fill', 'cadP-fill'] })[0] || null;
  const busyLayer = (point) => beforeId && map.getLayer(beforeId) && map.queryRenderedFeatures(point, { layers: [beforeId] }).length;
  const onClick = (e) => {
    if (busyLayer(e.point)) return;          // щелчок по точке объекта — не наш
    pick(under(e.point));
  };
  const tip = hoverTip(gl, map);
  const onMove = (e) => {
    if (busyLayer(e.point)) return;
    const f = under(e.point);
    if (!f) { tip.hide(); return; }
    // Свойства и контур — из своего списка (у объектов карты геометрия обрезана по клеткам отрисовки).
    const own = (f.source === 'cadP' ? parcels : builds).find((x) => x.id === f.id) || f;
    const pr = own.properties || {};
    tip.show(e.lngLat, f.source === 'cadP'
      ? parcelTipHTML(pr, own.geometry, buildsOfParcel(pr.PROPCODE, builds))
      : buildingTipHTML(pr, own.geometry));
  };
  const onOut = () => tip.hide();
  map.on('click', onClick);
  map.on('mousemove', onMove);
  map.on('mouseout', onOut);

  const cells = new Set();
  const queue = [];
  let running = 0;
  let failed = false;
  const status = () => {
    if (map.getZoom() < MIN_ZOOM) return say('Участки и строения Кадастра — при приближении карты');
    if (failed) return say('Кадастр ответил не на всё — подвиньте карту, чтобы повторить', 'err');
    say(`Кадастр: участков ${parcels.length} · строений ${builds.length}${running || queue.length ? ' · загружаю…' : ''}`);
  };
  const take = (list, out, prefix, keyOf) => list.forEach((f) => {
    const key = prefix + keyOf(f);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ type: 'Feature', id: nextId++, geometry: f.geometry, properties: f.properties || {} });
  });
  const pump = () => {
    while (running < PARALLEL && queue.length) {
      const box = queue.shift();
      running += 1;
      Promise.all([
        // Клетка — в кэше браузера на 7 дней (kernel/netCache.js): вернулся на место — без запроса.
        featuresInBox('ENI_WGS84', box, PARCEL_FIELDS, 800, { cacheDays: 7 }),
        featuresInBox('ENI_BUILDINGS', box, BUILD_FIELDS, 800, { cacheDays: 7 }),
      ]).then(([ps, bs]) => {
        if (!map.getStyle()) return;
        take(ps, parcels, 'p', (f) => (f.properties && f.properties.PROPCODE) || JSON.stringify(f.geometry).slice(0, 80));
        take(bs, builds, 'b', (f) => JSON.stringify(f.geometry).slice(0, 120));
        flush();
      }).catch(() => { failed = true; cells.delete(box.join(',')); })
        .finally(() => { running -= 1; status(); pump(); });
    }
  };
  // Слой обновляется разом не чаще раза в 150 мс: каждая клетка, ставившая
  // данные сразу, заново раскладывала весь растущий слой (замечание
  // пользователя 04.11.2026 — «Отрисовывается только пока карта в состоянии
  // покоя», «отрисовка тормозит»).
  let flushT = 0;
  const flush = () => {
    if (flushT) return;
    flushT = setTimeout(() => {
      flushT = 0;
      if (!map.getStyle()) return;
      map.getSource('cadP').setData({ type: 'FeatureCollection', features: parcels });
      map.getSource('cadB').setData({ type: 'FeatureCollection', features: builds });
    }, 150);
  };
  // Клетки — под экран и кольцом вокруг (подгрузка заранее), и не только по
  // остановке: во время движения — раз в 250 мс. Ближние к середине — первыми.
  const load = () => {
    if (map.getZoom() < MIN_ZOOM) { status(); return; }
    failed = false;
    const b = map.getBounds();
    const c = b.getCenter();
    const want = [];
    for (let i = Math.floor(b.getSouth() / CELL_LAT) - 1; i <= Math.floor(b.getNorth() / CELL_LAT) + 1; i++) {
      for (let j = Math.floor(b.getWest() / CELL_LON) - 1; j <= Math.floor(b.getEast() / CELL_LON) + 1; j++) {
        const box = [j * CELL_LON, i * CELL_LAT, (j + 1) * CELL_LON, (i + 1) * CELL_LAT];
        const k = box.join(',');
        if (cells.has(k)) continue;
        cells.add(k);
        want.push([box, Math.hypot((box[1] + box[3]) / 2 - c.lat, (box[0] + box[2]) / 2 - c.lng)]);
      }
    }
    want.forEach(([box]) => queue.push(box));
    const d = (box) => Math.hypot((box[1] + box[3]) / 2 - c.lat, (box[0] + box[2]) / 2 - c.lng);
    queue.sort((x, y) => d(x) - d(y));
    status();
    pump();
  };
  let moveT = 0;
  const onMoving = () => { if (!moveT) moveT = setTimeout(() => { moveT = 0; load(); }, 250); };
  map.on('moveend', load);
  map.on('move', onMoving);
  load();
  return () => {
    map.off('moveend', load); map.off('move', onMoving); clearTimeout(moveT); clearTimeout(flushT); map.off('click', onClick); map.off('mousemove', onMove); map.off('mouseout', onOut);
    queue.length = 0; tip.hide(); note.remove();
  };
}
