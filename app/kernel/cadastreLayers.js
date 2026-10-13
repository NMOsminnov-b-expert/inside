// Кадастровые слои поверх карты Leaflet: границы участков и капитальные
// строения ВОКРУГ наших объектов (решение пользователя 13.10.2026:
// «Участки вокруг на карте, Строения на участке»). Подключают карта
// маршрута дня (вокруг остановок) и карта участка в карточке ОЦ (вокруг
// участка).
//
// Только вокруг точек, а не по всей видимой части: по видимой части на
// масштабе 16 в центре Бишкека выходило 500+ участков (обрезано пределом —
// покрытие рваное) и 300+ строений — карта перегружена, а в портал уходило
// куда больше нужного (снимок пользователя 13.10.2026). Вокруг каждой точки —
// квадрат RADIUS м; грузится один раз при приближении (с MIN_ZOOM) и
// хранится в памяти вкладки, никуда не записывается. Строка состояния на
// карте: «приблизьте», «загружаю», «участков N · строений M», «Кадастр не
// ответил» (практика APCS «три состояния блока»).
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: слой отдаёт свой картосервер из выгрузки Кадастра —
// без запросов к порталу с рабочего места.
import { featuresInBox } from './cadastreGeo.js';
import { esc } from './dom.js';
import { formatEniText } from './eniField.js';

// Плавный масштаб для всех карт макета (указание пользователя 13.10.2026:
// «Зум тоже плавный, а не рывками»), но не медленный («Откорректируй зум…
// ну устанешь колесико крутить»): щелчок колеса — около уровня, кнопки —
// ровно уровень; шаг 0,25 — без мыльной подложки на промежуточных масштабах.
export const SMOOTH_ZOOM = { zoomSnap: 0.25, zoomDelta: 1, wheelPxPerZoomLevel: 45, wheelDebounceTime: 20 };

const MIN_ZOOM = 16;
const RADIUS = 150;          // м вокруг точки
const MAX_POINTS = 12;       // точек за раз (остановок дня больше не бывает)

// points — [[широта, долгота], …]
export function attachCadastreLayers(L, map, points) {
  const pts = (points || []).filter(Boolean).slice(0, MAX_POINTS);
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
  const boxOf = ([lat, lon]) => {
    const dLat = RADIUS / 111320;
    const dLon = RADIUS / (111320 * Math.cos(lat * Math.PI / 180));
    return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
  };
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
  let loaded = false;
  let busy = false;
  let np = 0;
  let nb = 0;
  if (!pts.length) { say('Кадастр: у объектов нет координат'); return () => { parcels.remove(); builds.remove(); note.remove(); }; }

  const load = async () => {
    if (loaded || busy) return;
    if (map.getZoom() < MIN_ZOOM) { say('Кадастр: приблизьте карту — покажу участки и строения вокруг объектов'); return; }
    busy = true;
    say('Кадастр: загружаю участки вокруг объектов…');
    try {
      for (const p of pts) {
        const box = boxOf(p);
        const [ps, bs] = await Promise.all([
          featuresInBox('ENI_WGS84', box, 'PROPCODE,DOMCODE,ADDRESS,NAZNACHENI,THE_GEOM', 200),
          featuresInBox('ENI_BUILDINGS', box, 'PROPCODE,BUILD_TYPE,NAZNACHENI,ADDRESS,THE_GEOM', 200),
        ]);
        if (!map._loaded) return;              // карту уже убрали
        ps.forEach((f) => {
          const pr = f.properties || {};
          const key = 'p' + (pr.PROPCODE || JSON.stringify(f.geometry).slice(0, 80));
          if (seen.has(key)) return;
          seen.add(key);
          np += 1;
          shapes(f.geometry || {}).forEach((poly) => L.polygon(poly, { ...PARCEL, pane: 'cadParcels', fill: true, className: 'cad-parcel', base: PARCEL, hot: PICKED })
            .on('click', (e) => pick(e.target))
            .bindTooltip(`<b>ЕНИ ${esc(formatEniText(String(pr.PROPCODE || '').replace(/\D/g, '')))}</b>${pr.ADDRESS ? `<br>${esc(pr.ADDRESS)}` : ''}${pr.NAZNACHENI ? `<br><i>${esc(pr.NAZNACHENI)}</i>` : ''}`, { sticky: true, className: 'map-tip' })
            .addTo(parcels));
        });
        bs.forEach((f) => {
          const key = 'b' + JSON.stringify(f.geometry).slice(0, 120);
          if (seen.has(key)) return;
          seen.add(key);
          nb += 1;
          const pr = f.properties || {};
          shapes(f.geometry || {}).forEach((poly) => L.polygon(poly, { ...BUILD, pane: 'cadBuilds', className: 'cad-build', base: BUILD, hot: BUILD_PICKED })
            .on('click', (e) => pick(e.target))
            .bindTooltip(`<b>Строение${pr.BUILD_TYPE ? ` · ${esc(pr.BUILD_TYPE)}` : ''}</b>${pr.NAZNACHENI ? `<br>${esc(pr.NAZNACHENI)}` : ''}${pr.ADDRESS ? `<br>${esc(pr.ADDRESS)}` : ''}`, { sticky: true, className: 'map-tip' })
            .addTo(builds));
        });
        say(`Кадастр: вокруг объектов — участков ${np} · строений ${nb}`);
      }
      loaded = true;
    } catch (e) {
      say('Кадастр не ответил — запустите прокси: python tools/cadastre/proxy.py', 'err');
    } finally {
      busy = false;
    }
  };
  const onZoom = () => {
    const show = map.getZoom() >= MIN_ZOOM;
    [parcels, builds].forEach((g) => { if (show && !map.hasLayer(g)) g.addTo(map); if (!show && map.hasLayer(g)) g.remove(); });
    if (show) { if (loaded) say(`Кадастр: вокруг объектов — участков ${np} · строений ${nb}`); else load(); } else say('Кадастр: приблизьте карту — покажу участки и строения вокруг объектов');
  };
  map.on('zoomend', onZoom);
  onZoom();
  return () => { map.off('zoomend', onZoom); map.off('click', onMapClick); parcels.remove(); builds.remove(); note.remove(); };
}
