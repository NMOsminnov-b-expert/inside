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

// Административные границы — слоем карты адресного регистра «Дарек» ГУ «Кадастр»
// (сервер QGIS map.darek.kg, WMS; пользователь 04.11.2026: «Границы регионов,
// айыльных аймаков, административных границ… Нужна актуальная информация»;
// «Давай сначала на карте подложку»). Картинки только видимой части, как на
// самой карте Дарека; уровень сервер выбирает по масштабу сам: издали области,
// ближе районы, вблизи айыл аймаки (до 1:300 000). Сервер отдаёт картинки с
// любого адреса (Access-Control-Allow-Origin: *), только по http.
// Источник и проверки — запись графа cadastre-kg-otkrytye-zaprosy-portala-chto-mozhno-poluchit.
const BOUNDS_LAYERS = 'Граница Кыргызстана,Границы областей,Границы районов,Границы айылных аймаков,Линии — периметр анклавов';
const BOUNDS_URL = 'http://map.darek.kg/qgis/qgis_mapserv.fcgi.exe?map=' + encodeURIComponent('C:/OSGeo4W64/projects/ГИСАР/ГИСАР.qgz')
  + '&SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857'
  + '&LAYERS=' + encodeURIComponent(BOUNDS_LAYERS);
// Одна картинка на видимую часть карты, а не квадратами: сервер подписывает
// каждую картинку отдельно, и квадраты повторяли подписи областей и аймаков
// внахлёст (снимки 04.11.2026). Так же берёт картинку сама карта Дарека.
const merc = ([lon, lat]) => [lon * 20037508.34 / 180, Math.log(Math.tan((90 + lat) * Math.PI / 360)) * 20037508.34 / Math.PI];
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: показ границ — удобство одного человека, хранится в
// браузере; на сервере — в личных настройках. Сам слой — открытая карта Дарека
// без договора: для работы — официальный доступ (решение 14.10.2026 о Кадастре).
const BOUNDS_KEY = 'inside.map.bounds';
const BOUNDS_MAXZOOM = 12.5;
const BOUNDS_ATTR = 'Границы: ГУ «Кадастр», <a href="http://darek.kg/Map" target="_blank" rel="noopener">адресный регистр «Дарек»</a>';
const boundsOn = () => { try { return localStorage.getItem(BOUNDS_KEY) !== '0'; } catch (e) { return true; } };
const setBoundsOn = (v) => { try { localStorage.setItem(BOUNDS_KEY, v ? '1' : '0'); } catch (e) { /* до перезагрузки */ } };

function addBounds(map) {
  let shown = '';
  let want = '';
  let timer = 0;
  const load = () => {
    // Вблизи границы Дарека не нужны и мешают: линии у него толстые (на местности),
    // с 12,5 расплываются в широкую ленту поверх участков (снимок 04.11.2026, Каракол).
    if (!boundsOn() || !map.getStyle() || map.getZoom() > BOUNDS_MAXZOOM) return;
    const c = map.getCanvas();
    const w = Math.min(2048, Math.round(c.clientWidth));
    const h = Math.min(2048, Math.round(c.clientHeight));
    if (w < 50 || h < 50) return;
    const b = map.getBounds();
    const nw = [b.getWest(), Math.min(85, b.getNorth())];
    const se = [b.getEast(), Math.max(-85, b.getSouth())];
    const [x1, y2] = merc(nw);
    const [x2, y1] = merc(se);
    const url = `${BOUNDS_URL}&WIDTH=${w}&HEIGHT=${h}&BBOX=${x1},${y1},${x2},${y2}`;
    if (url === shown || url === want) return;
    want = url;
    // Картинка сначала грузится, затем подменяет прежнюю — без мигания пустотой.
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // Пока грузилась, карту сдвинули — эта картинка уже не нужна, ждём следующую.
      if (!map.getStyle() || url !== want) return;
      const coords = [[nw[0], nw[1]], [se[0], nw[1]], [se[0], se[1]], [nw[0], se[1]]];
      const src = map.getSource('bounds');
      shown = url;
      if (src) { apply({ url, coordinates: coords }); return; }
      map.addSource('bounds', { type: 'image', url, coordinates: coords });
      busy = true;
      // Над подложкой OSM, под всем, что карта добавила (участки, строения, точки).
      const above = (map.getStyle().layers || []).find((l) => l.id !== 'osm');
      map.addLayer({ id: 'bounds', type: 'raster', source: 'bounds', maxzoom: BOUNDS_MAXZOOM, paint: { 'raster-opacity': 0.7, 'raster-fade-duration': 0 },
        layout: { visibility: boundsOn() ? 'visible' : 'none' } }, above ? above.id : undefined);
    };
    img.src = url;
  };
  // Подмена картинки — по очереди: новая, пока карта грузит прежнюю, обрывала её
  // («AbortError» в консоли, сценарий аналитики 04.11.2026). Ждёт загрузки
  // прежней; из ждущих берётся последняя.
  let busy = false;
  let queued = null;
  const apply = (img) => {
    if (busy) { queued = img; return; }
    busy = true;
    map.getSource('bounds').updateImage(img);
  };
  map.on('sourcedata', (e) => {
    if (e.sourceId !== 'bounds' || !e.isSourceLoaded || !busy) return;
    busy = false;
    if (queued) { const q = queued; queued = null; apply(q); }
  });
  map.on('moveend', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
  map.on('resize', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
  map._boundsLoad = load;
  load();
}

// Кнопка «Границы» — в группе кнопок масштаба: включить и выключить слой.
// Выбор общий для всех карт системы.
class BoundsControl {
  onAdd(map) {
    const box = document.createElement('div');
    box.className = 'maplibregl-ctrl maplibregl-ctrl-group map-bounds-ctrl';
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Границы';
    const sync = () => {
      const on = boundsOn();
      b.setAttribute('aria-pressed', String(on));
      b.title = on ? 'Скрыть административные границы (Кадастр, «Дарек»)' : 'Показать административные границы: области, районы, айыл аймаки (Кадастр, «Дарек»)';
    };
    b.onclick = () => {
      setBoundsOn(!boundsOn());
      if (map.getLayer('bounds')) map.setLayoutProperty('bounds', 'visibility', boundsOn() ? 'visible' : 'none');
      if (boundsOn() && map._boundsLoad) map._boundsLoad();
      sync();
    };
    sync();
    box.appendChild(b);
    return box;
  }
  onRemove() {}
}

// more — дополнительные настройки карты (например, cooperativeGestures).
export async function createMap(gl, el, { center = [74.6, 42.87], zoom = 6.5, ...more } = {}) {
  const map = new gl.Map({
    container: el, style: OSM_STYLE, center, zoom, maxZoom: 19.5,
    attributionControl: { compact: true, customAttribution: BOUNDS_ATTR }, dragRotate: false, pitchWithRotate: false, touchPitch: false,
    locale: LOCALE_RU, ...more,
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  wheelZoom(map);
  map.addControl(new BoundsControl(), 'bottom-right');
  map.addControl(new gl.NavigationControl({ showCompass: false }), 'bottom-right');
  if (!map.loaded()) await new Promise((ok) => map.once('load', ok));
  addBounds(map);
  return map;
}

// Подсказка при наведении — одна на карту, оформление как у подсказок
// Leaflet в макете (.map-tip): белая карточка с тенью.
// Подсказка раскрывается туда, где больше места: курсор в нижней половине карты —
// над ним, в правой — слева (правило «подсказки не выходят за границы»: подпись
// участка Кадастра длинная и у нижнего края карты уходила под край, 04.11.2026).
export function hoverTip(gl, map) {
  let pop = null;
  let side = '';
  return {
    show(lngLat, html) {
      // Место — по видимой части: карта бывает выше окна, её низ — за краем экрана.
      const p = map.project(lngLat);
      const r = map.getContainer().getBoundingClientRect();
      const y = r.top + p.y;
      const x = r.left + p.x;
      const below = Math.min(r.bottom, window.innerHeight) - y;
      const above = y - Math.max(r.top, 0);
      const right = Math.min(r.right, window.innerWidth) - x;
      const left = x - Math.max(r.left, 0);
      const anchor = (below >= above ? 'top' : 'bottom') + '-' + (right >= left ? 'left' : 'right');
      if (!pop || side !== anchor) {
        if (pop) pop.remove();
        pop = new gl.Popup({ closeButton: false, closeOnClick: false, className: 'map-tip-gl', offset: 10, maxWidth: '340px', anchor });
        side = anchor;
      }
      pop.setLngLat(lngLat).setHTML(html).addTo(map);
    },
    hide() { if (pop) pop.remove(); },
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
