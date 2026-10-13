// Кадастровые слои поверх карты Leaflet: границы участков вокруг и
// капитальные строения (решение пользователя 13.10.2026: «Участки вокруг на
// карте, Строения на участке»). Подключают карта маршрута дня и карта
// участка в карточке ОЦ.
//
// Слои грузятся при приближении (с масштаба MIN_ZOOM — на меньшем участков
// тысячи) по окончании движения карты, с задержкой: серию сдвигов не гоним
// в портал по одному. Ход виден строкой на карте: «приблизьте», «загружаю»,
// «участков N · строений M», «Кадастр не ответил» (практика APCS «три
// состояния блока»).
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: слой отдаёт свой картосервер (WMS/векторные плитки
// из выгрузки Кадастра) — без запроса к порталу на каждый сдвиг карты.
import { featuresInBox } from './cadastreGeo.js';
import { esc } from './dom.js';
import { formatEniText } from './eniField.js';

const MIN_ZOOM = 16;

export function attachCadastreLayers(L, map) {
  const parcels = L.layerGroup().addTo(map);
  const builds = L.layerGroup().addTo(map);
  const Note = L.Control.extend({
    onAdd() { const d = L.DomUtil.create('div', 'cad-note'); L.DomEvent.disableClickPropagation(d); return d; },
  });
  const note = new Note({ position: 'bottomleft' }).addTo(map);
  const say = (t, cls = '') => { const el = note.getContainer(); el.textContent = t; el.className = 'cad-note ' + cls; };
  const toLL = (poly) => poly.map((ring) => ring.map(([lon, lat]) => [lat, lon]));
  const shapes = (g) => (g.type === 'Polygon' ? [toLL(g.coordinates)] : g.type === 'MultiPolygon' ? g.coordinates.map(toLL) : []);
  let timer = 0;
  let seq = 0;
  const load = async () => {
    const my = ++seq;
    if (map.getZoom() < MIN_ZOOM) {
      parcels.clearLayers(); builds.clearLayers();
      say('Кадастр: приблизьте карту — покажу участки и строения');
      return;
    }
    const b = map.getBounds();
    const box = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    say('Кадастр: загружаю участки…');
    try {
      const [ps, bs] = await Promise.all([
        featuresInBox('ENI_WGS84', box, 'PROPCODE,DOMCODE,ADDRESS,NAZNACHENI,THE_GEOM'),
        featuresInBox('ENI_BUILDINGS', box, 'PROPCODE,BUILD_TYPE,NAZNACHENI,ADDRESS,THE_GEOM'),
      ]);
      if (my !== seq) return;                       // карту уже сдвинули дальше
      parcels.clearLayers(); builds.clearLayers();
      ps.forEach((f) => shapes(f.geometry || {}).forEach((poly) => {
        const p = f.properties || {};
        L.polygon(poly, { color: '#7c3aed', weight: 1, fillOpacity: 0.04, className: 'cad-parcel' })
          .bindTooltip(`<b>ЕНИ ${esc(formatEniText(String(p.PROPCODE || '').replace(/\D/g, '')))}</b>${p.ADDRESS ? `<br>${esc(p.ADDRESS)}` : ''}${p.NAZNACHENI ? `<br><i>${esc(p.NAZNACHENI)}</i>` : ''}`, { sticky: true, className: 'map-tip' })
          .addTo(parcels);
      }));
      bs.forEach((f) => shapes(f.geometry || {}).forEach((poly) => {
        const p = f.properties || {};
        L.polygon(poly, { color: '#334155', weight: 1, fillColor: '#64748b', fillOpacity: 0.25, className: 'cad-build' })
          .bindTooltip(`<b>Строение${p.BUILD_TYPE ? ` · ${esc(p.BUILD_TYPE)}` : ''}</b>${p.NAZNACHENI ? `<br>${esc(p.NAZNACHENI)}` : ''}${p.ADDRESS ? `<br>${esc(p.ADDRESS)}` : ''}`, { sticky: true, className: 'map-tip' })
          .addTo(builds);
      }));
      parcels.eachLayer((l) => l.bringToBack());
      say(`Кадастр: участков ${ps.length}${ps.length >= 500 ? '+' : ''} · строений ${bs.length}`);
    } catch (e) {
      if (my === seq) say('Кадастр не ответил — запустите прокси: python tools/cadastre/proxy.py', 'err');
    }
  };
  const later = () => { clearTimeout(timer); timer = setTimeout(load, 350); };
  map.on('moveend', later);
  later();
  return () => { clearTimeout(timer); map.off('moveend', later); parcels.remove(); builds.remove(); note.remove(); };
}
