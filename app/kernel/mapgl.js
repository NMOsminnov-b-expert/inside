// Карты на MapLibre GL (видеокарта): загрузка, подложка OSM, подсказка.
//
// Почему не Leaflet (указание пользователя 13.10.2026: «Переходи на maplibre с
// их слоем, если все так плохо»): Leaflet рисует каждый участок отдельной
// SVG-фигурой — на тысяче участков вида квартала масштаб и перемещение идут
// рывками, а точки объектов не меняют размер при приближении. MapLibre рисует
// всё на видеокарте, масштаб у него плавный с инерцией, размер точек задаётся
// выражением от масштаба.
//
// Подложка — растровые тайлы OSM (исключение к правилу о данных, решение
// пользователя 12.10.2026); подпись — условие OSM.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: подложка — свой сервер тайлов (векторных — тогда и
// подписи улиц, и тёмная тема без растров).
import { esc } from './dom.js';

let loading = null;

export function loadMapLibre(ensureStyle) {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (!loading) {
    // Движок (0,9 МБ) — после загрузки страницы: списки и панели появляются
    // сразу, карта подтягивается следом. Вставленный раньше скрипт держал
    // событие загрузки страницы — на слабом железе и в параллельных прогонах
    // проверок открытие «Осмотров» уходило за 9–10 с (замер 13.10.2026).
    const afterLoad = document.readyState === 'complete' ? Promise.resolve()
      : new Promise((ok) => addEventListener('load', () => ok(), { once: true }));
    loading = afterLoad.then(() => Promise.all([
      ensureStyle ? ensureStyle('./app/vendor/maplibre/maplibre-gl.css') : Promise.resolve(),
      new Promise((ok, fail) => {
        const s = document.createElement('script');
        s.src = './app/vendor/maplibre/maplibre-gl.js';
        s.onload = () => ok();
        s.onerror = () => fail(new Error('MapLibre не загрузился'));
        document.head.appendChild(s);
      }),
    ])).then(() => window.maplibregl);
  }
  return loading;
}

export const OSM_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster', tileSize: 256, maxzoom: 19,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

// Карта с подложкой и кнопками масштаба; без поворота и наклона — это план.
// Подсказки «совместных жестов» (cooperativeGestures) — по-русски: карта в
// потоке страницы двигается двумя пальцами, одним листается страница.
const LOCALE_RU = {
  'CooperativeGesturesHandler.WindowsHelpText': 'Масштаб — Ctrl + колесо мыши',
  'CooperativeGesturesHandler.MacHelpText': 'Масштаб — ⌘ + колесо мыши',
  'CooperativeGesturesHandler.MobileHelpText': 'Двигать карту — двумя пальцами',
  // Подписи элементов карты — по-русски (были «Zoom in» и т. п.).
  'NavigationControl.ZoomIn': 'Приблизить',
  'NavigationControl.ZoomOut': 'Отдалить',
  'NavigationControl.ResetBearing': 'Север вверх',
  'AttributionControl.ToggleAttribution': 'Источники карты',
  'AttributionControl.MapFeedback': 'Сообщить об ошибке на карте',
  'FullscreenControl.Enter': 'Во весь экран',
  'FullscreenControl.Exit': 'Выйти из полноэкранного режима',
  'GeolocateControl.FindMyLocation': 'Где я',
  'GeolocateControl.LocationNotAvailable': 'Местоположение недоступно',
  'Map.Title': 'Карта',
  'Popup.Close': 'Закрыть',
  'ScaleControl.Meters': 'м',
  'ScaleControl.Kilometers': 'км',
};

// Масштаб колесом — своим обработчиком, с нелинейной скоростью (замечание
// пользователя 15.10.2026: «поработай над ускорением зума/отдаления. Что бы
// нелинейным оно было»; прежде — 14.10.2026 «зум медленный и ленивый» и
// 13.10.2026 «пусть скорость зависит от масштаба»). Встроенный обработчик
// MapLibre — одна скорость на любом масштабе и не больше уровня за событие,
// разгон в него не вписать. Здесь щелчок двигает цель масштаба, а карта
// догоняет её цепочкой плавных переходов (easeTo с общим easeId — без
// событий «движение закончено» между шагами: слои Кадастра не дёргаются);
// точка под курсором остаётся под курсором. Скорость — произведение двух
// множителей:
//   * от масштаба: издали (страна, область) щелчок — 0,85 уровня, вблизи
//     (улица, участок) — 0,4: до места долетаешь быстро, у участка не
//     проскакиваешь; между ними — плавная S-кривая, без изломов;
//   * от быстроты: щелчки чаще двух за четверть секунды разгоняют масштаб до
//     2,2 раза — «крутанул колесо» уводит далеко, одиночный щелчок точен.
// Тачпад и щипок (мелкие частые шаги) — тот же множитель от масштаба, без
// разгона и без догоняния: жест сам задаёт скорость. «Меньше движения» в
// системе — без догоняния. Одна настройка на все карты макета.
const NOTCH = 100;              // щелчок колеса — около 100 px прокрутки
const BURST_MS = 250;           // окно, в котором считается быстрота
const EASE_MS = 260;            // за сколько карта догоняет цель
function levelsAt(z) {
  const t = Math.min(1, Math.max(0, (z - 6) / 11));
  const s = t * t * (3 - 2 * t);                 // S-кривая 0 → 1
  return 0.85 - 0.45 * s;
}
const easeOut = (t) => 1 - (1 - t) ** 3;
function wheelZoom(map) {
  map.scrollZoom.disable();
  const el = map.getCanvasContainer();
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hist = [];
  let goal = null;
  let idle = 0;
  const easeId = 'wheel-' + Math.random().toString(36).slice(2);
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    let dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    if (!dy) return;
    const now = performance.now();
    // Колесо — крупные целые шаги; тачпад и щипок (ctrlKey) — мелкие дробные.
    const pad = e.ctrlKey || Math.abs(dy) < 40 || !Number.isInteger(dy);
    if (e.ctrlKey) dy *= 4;                      // щипок приходит мелкими долями
    const z = map.getZoom();
    if (goal === null || now - idle > EASE_MS + 80) goal = z;
    let boost = 1;
    if (!pad) {
      hist.push([now, Math.abs(dy)]);
      while (hist.length && now - hist[0][0] > BURST_MS) hist.shift();
      const notches = hist.reduce((n, h) => n + h[1], 0) / NOTCH;
      boost = 1 + 1.2 * Math.min(1, Math.max(0, (notches - 2) / 4));
    }
    goal -= (dy / NOTCH) * levelsAt(goal) * boost;
    goal = Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), goal));
    idle = now;
    const r = el.getBoundingClientRect();
    const around = map.unproject([e.clientX - r.left, e.clientY - r.top]);
    map.easeTo({ zoom: goal, around, duration: pad || reduce ? 0 : EASE_MS, easing: easeOut, easeId }, { originalEvent: e });
  }, { passive: false });
}

// more — дополнительные настройки карты (например, cooperativeGestures).
export async function createMap(gl, el, { center = [74.6, 42.87], zoom = 6.5, ...more } = {}) {
  const map = new gl.Map({
    container: el, style: OSM_STYLE, center, zoom, maxZoom: 19.5,
    attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false, touchPitch: false,
    locale: LOCALE_RU, ...more,
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  wheelZoom(map);
  map.addControl(new gl.NavigationControl({ showCompass: false }), 'bottom-right');
  if (!map.loaded()) await new Promise((ok) => map.once('load', ok));
  return map;
}

// Подсказка при наведении — одна на карту, оформление как у подсказок
// Leaflet в макете (.map-tip): белая карточка с тенью.
export function hoverTip(gl, map) {
  const pop = new gl.Popup({ closeButton: false, closeOnClick: false, className: 'map-tip-gl', offset: 10, maxWidth: '300px' });
  return {
    show(lngLat, html) { pop.setLngLat(lngLat).setHTML(html).addTo(map); },
    hide() { pop.remove(); },
  };
}

export const emptyFC = () => ({ type: 'FeatureCollection', features: [] });

// Свой участок (участки) — по контуру из Кадастра, залит и обведён поверх
// соседних; рамка (extent) хранится, но не рисуется (замечание пользователя
// 13.10.2026: «Надо именно участок выделять, а не обводить. Не всё
// прямоугольное»). Контура нет — точка в центре рамки. geos — [{ extent,
// contour? }]. Возвращает рамку всех — [[minLon, minLat], [maxLon, maxLat]].
export function ownParcelsGL(map, geos) {
  const feats = [];
  let box = null;
  (geos || []).filter((g) => g && g.extent).forEach((g) => {
    const [x1, y1, x2, y2] = g.extent;
    box = box ? [[Math.min(box[0][0], x1), Math.min(box[0][1], y1)], [Math.max(box[1][0], x2), Math.max(box[1][1], y2)]] : [[x1, y1], [x2, y2]];
    if (g.contour) feats.push({ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: g.contour }, properties: {} });
    else feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [(x1 + x2) / 2, (y1 + y2) / 2] }, properties: { nocontour: true } });
  });
  map.addSource('own', { type: 'geojson', data: { type: 'FeatureCollection', features: feats } });
  map.addLayer({ id: 'own-fill', type: 'fill', source: 'own', filter: ['!=', ['geometry-type'], 'Point'], paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.35 } });
  map.addLayer({ id: 'own-line', type: 'line', source: 'own', filter: ['!=', ['geometry-type'], 'Point'], paint: { 'line-color': '#1d4ed8', 'line-width': 3 } });
  map.addLayer({ id: 'own-pt', type: 'circle', source: 'own', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 7, 'circle-color': '#3b82f6', 'circle-stroke-color': '#1d4ed8', 'circle-stroke-width': 3 } });
  return box;
}
export { esc };
