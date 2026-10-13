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
    loading = Promise.all([
      ensureStyle ? ensureStyle('./app/vendor/maplibre/maplibre-gl.css') : Promise.resolve(),
      new Promise((ok, fail) => {
        const s = document.createElement('script');
        s.src = './app/vendor/maplibre/maplibre-gl.js';
        s.onload = () => ok();
        s.onerror = () => fail(new Error('MapLibre не загрузился'));
        document.head.appendChild(s);
      }),
    ]).then(() => window.maplibregl);
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
export async function createMap(gl, el, { center = [74.6, 42.87], zoom = 6.5 } = {}) {
  const map = new gl.Map({
    container: el, style: OSM_STYLE, center, zoom, maxZoom: 19.5,
    attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false, touchPitch: false,
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
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
export { esc };
