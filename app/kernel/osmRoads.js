// Дороги OpenStreetMap — из векторных плиток OpenFreeMap (tiles.openfreemap.org,
// схема OpenMapTiles, слой transportation): для расчёта земель по айыл аймакам
// (kernel/landStats.js) и точной картинки незанятой земли вблизи
// (pages/analytics). Ключа не нужно, ответ с любого адреса; запрос — только
// номер плитки (координаты), данных проекта в нём нет.
//
// Пользователь 04.11.2026: «местами оно то считает дороги, то не считает»;
// решение — «Отдельной категорией», «Дороги не считаем свободными землями».
// Ширина дороги — по её классу (OpenMapTiles class), в метрах земли; это
// оценка: в OSM ширина у дорог почти не записана. Пешеходные дорожки и тоннели
// не считаются — земли они не занимают.
//
// Плитки MVT разбираются здесь же (protobuf — несколько десятков строк, без
// сторонних библиотек): нужны только линии слоя transportation и поле class.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: дороги — из выгрузки Кадастра (земли общего
// пользования) или своего источника на сервере; ширины — по нормативу.

import { cachedFetch } from './netCache.js';

// Ширина — коридор улицы, а не проезжая часть: участки всегда главнее (дорога
// считается только вне участков с ЕНИ), поэтому широкая линия не «съедает»
// участок, а закрывает полосу между фасадами. С узкими ширинами (жилая улица
// 8 м) вдоль улиц оставались ложные «незанятые» полосы (снимок 04.11.2026, Талас).
export const ROAD_W = {
  motorway: 50, trunk: 40, primary: 32, secondary: 26, tertiary: 20,
  minor: 16, busway: 16, raceway: 12, service: 10, track: 6,
};
export const Z = 14;                         // самые подробные плитки OpenFreeMap
const TILEJSON = 'https://tiles.openfreemap.org/planet';
const W = 20037508.34;
const SIZE = (2 * W) / 2 ** Z;               // сторона плитки, метров карты

let tmpl = null;
async function template() {
  if (!tmpl) {
    tmpl = cachedFetch(TILEJSON, { ttlDays: 1 }).then((r) => r.json()).then((j) => (j.tiles || [])[0]).catch((e) => { tmpl = null; throw e; });
  }
  return tmpl;
}

// --- protobuf ---
function reader(buf) {
  let pos = 0;
  const varint = () => {
    let res = 0;
    let shift = 0;
    let b;
    do {
      b = buf[pos++];
      res += (b & 0x7f) * 2 ** shift;
      shift += 7;
    } while (b & 0x80);
    return res;
  };
  return {
    get pos() { return pos; },
    end: buf.length,
    varint,
    tag() { const t = varint(); return [t >>> 3, t & 7]; },
    bytes() { const n = varint(); const s = buf.subarray(pos, pos + n); pos += n; return s; },
    skip(type) {
      if (type === 0) varint();
      else if (type === 1) pos += 8;
      else if (type === 2) pos += varint();
      else if (type === 5) pos += 4;
    },
  };
}
const utf8 = new TextDecoder();
function value(buf) {
  const r = reader(buf);
  while (r.pos < r.end) {
    const [f, t] = r.tag();
    if (f === 1) return utf8.decode(r.bytes());
    r.skip(t);
  }
  return '';
}
const packed = (buf) => { const r = reader(buf); const out = []; while (r.pos < r.end) out.push(r.varint()); return out; };
const zz = (n) => (n >>> 1) ^ -(n & 1);

// Линии слоя transportation плитки: [{ cls, brunnel, lines: [[[x, y]…]…] }] в
// долях плитки (0…extent), extent — из слоя.
export function decodeRoads(buf) {
  const r = reader(buf);
  const out = [];
  while (r.pos < r.end) {
    const [f, t] = r.tag();
    if (f !== 3) { r.skip(t); continue; }
    const lb = r.bytes();
    const lr = reader(lb);
    let name = '';
    let extent = 4096;
    const keys = [];
    const vals = [];
    const feats = [];
    while (lr.pos < lr.end) {
      const [lf, lt] = lr.tag();
      if (lf === 1) name = utf8.decode(lr.bytes());
      else if (lf === 2) feats.push(lr.bytes());
      else if (lf === 3) keys.push(utf8.decode(lr.bytes()));
      else if (lf === 4) vals.push(value(lr.bytes()));
      else if (lf === 5) extent = lr.varint();
      else lr.skip(lt);
    }
    if (name !== 'transportation') continue;
    feats.forEach((fb) => {
      const fr = reader(fb);
      let tags = [];
      let type = 0;
      let geom = [];
      while (fr.pos < fr.end) {
        const [ff, ft] = fr.tag();
        if (ff === 2) tags = packed(fr.bytes());
        else if (ff === 3) type = fr.varint();
        else if (ff === 4) geom = packed(fr.bytes());
        else fr.skip(ft);
      }
      if (type !== 2) return;   // только линии
      const props = {};
      for (let i = 0; i + 1 < tags.length; i += 2) props[keys[tags[i]]] = vals[tags[i + 1]];
      const lines = [];
      let x = 0;
      let y = 0;
      let line = null;
      for (let i = 0; i < geom.length;) {
        const cmd = geom[i] & 7;
        const n = geom[i] >> 3;
        i++;
        if (cmd === 7) continue;
        for (let k = 0; k < n; k++) {
          x += zz(geom[i++]);
          y += zz(geom[i++]);
          if (cmd === 1) { line = [[x, y]]; lines.push(line); } else if (line) line.push([x, y]);
        }
      }
      out.push({ cls: props.class || '', brunnel: props.brunnel || '', lines, extent });
    });
  }
  return out;
}

const cache = new Map();   // «x/y» → Promise<[{ w, pts:[[mx, my]…] }]> в метрах карты
async function tile(x, y) {
  const key = x + '/' + y;
  if (!cache.has(key)) {
    // Плитка — в кэше браузера на 30 дней (kernel/netCache.js): дороги меняются редко.
    const p = template().then((t) => cachedFetch(t.replace('{z}', Z).replace('{x}', x).replace('{y}', y), { ttlDays: 30 }))
      .then((r) => (r.ok ? r.arrayBuffer() : new ArrayBuffer(0)))
      .then((ab) => {
        const left = -W + x * SIZE;
        const top = W - y * SIZE;
        const roads = [];
        decodeRoads(new Uint8Array(ab)).forEach((f) => {
          const w = ROAD_W[f.cls];
          if (!w || f.brunnel === 'tunnel') return;
          const k = SIZE / f.extent;
          f.lines.forEach((ln) => roads.push({ w, pts: ln.map(([px, py]) => [left + px * k, top - py * k]) }));
        });
        return roads;
      })
      .catch((e) => { cache.delete(key); throw e; });
    cache.set(key, p);
  }
  return cache.get(key);
}

// Дороги в рамке [x1, y1, x2, y2] (метры карты EPSG:3857): линии с шириной в метрах земли.
export async function roadsInBox(b) {
  const tx1 = Math.floor((b[0] + W) / SIZE);
  const tx2 = Math.floor((b[2] + W) / SIZE);
  const ty1 = Math.floor((W - b[3]) / SIZE);
  const ty2 = Math.floor((W - b[1]) / SIZE);
  const jobs = [];
  for (let x = tx1; x <= tx2; x++) for (let y = ty1; y <= ty2; y++) jobs.push(tile(x, y));
  return (await Promise.all(jobs)).flat();
}

// Провести дороги по полотну квадрата b (SIZE точек на сторону): ширина в точках
// полотна — ширина на земле ÷ сторона точки на земле (метры карты × cos широты).
export function strokeRoads(ctx, roads, b, px) {
  const k = px / (b[2] - b[0]);
  const lat = (2 * Math.atan(Math.exp(((b[1] + b[3]) / 2) * Math.PI / W)) - Math.PI / 2);
  const groundPerPx = ((b[2] - b[0]) / px) * Math.cos(lat);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const byW = new Map();
  roads.forEach((r) => { (byW.get(r.w) || byW.set(r.w, []).get(r.w)).push(r.pts); });
  byW.forEach((lines, w) => {
    ctx.lineWidth = Math.max(1, w / groundPerPx);
    ctx.beginPath();
    lines.forEach((pts) => pts.forEach(([x, y], i) => {
      const cx = (x - b[0]) * k;
      const cy = (b[3] - y) * k;
      if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
    }));
    ctx.stroke();
  });
}

export const clearRoadCache = () => cache.clear();
