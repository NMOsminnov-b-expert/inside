// Синтетические данные для проверки реестра на объёме.
// Генератор детерминированный (mulberry32 от id), поэтому у всех участников
// команды одинаковые данные без файла с дампом.
//
// Наружу отдаются СВОДКИ, а полная запись собирается лениво при открытии
// карточки (materialize) — так 20 000 объектов не занимают память целиком.
// Это же поведение будет у реального бэкенда: список — сводки, карточка — запрос.
import { POOLS } from './bulkPools.js';

// Соль модуля: без неё все типы ОЦ получили бы одинаковые случайные данные.
function saltOf(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length) % arr.length];
const int = (rnd, a, b) => a + Math.floor(rnd() * (b - a + 1));
const pad = (n) => String(n).padStart(2, '0');

function dateStr(rnd, fromDays, toDays) {
  // Фиксированная база, чтобы данные не «плыли» между запусками.
  const base = new Date(2026, 7, 20).getTime();
  const shift = int(rnd, fromDays, toDays) * 86400000;
  const d = new Date(base + shift);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

let count = 0;
let cache = null;

export function bulkCount() { return count; }

export function setBulkCount(n) {
  count = Math.max(0, n | 0);
  cache = null;
}

export function isBulkId(id) {
  return typeof id === 'string' && id.includes('-b');
}

// Адрес формируется по правилам этого типа ОЦ.
export function addressOf(p, i) {
  return `${p.city}, ${p.street} ${p.house}`;
}

// Стабильные параметры записи по её номеру.
function paramsFor(i) {
  const P = POOLS;
  const rnd = mulberry32(1000003 + i * 2654435761 + saltOf(POOLS.idPrefix));

  const city = pick(rnd, P.cities);
  const street = pick(rnd, P.streets);
  const house = int(rnd, 1, 260);
  const institution = pick(rnd, P.institutions);
  const status = pick(rnd, P.statuses);
  const purpose = pick(rnd, P.purposes);
  const eni = String(P.eniBase + i * 7 + int(rnd, 0, 6));

  const resp = {
    gov: pick(rnd, P.people),
    cod: pick(rnd, P.people),
    appr: pick(rnd, P.people),
    insp: pick(rnd, P.people),
  };

  const oiCount = int(rnd, 1, 4);
  const area = Math.round((P.areaMin + rnd() * (P.areaMax - P.areaMin)) * 100) / 100;
  const photos = int(rnd, 0, 14);
  const docs = int(rnd, 0, 5);
  const pendingNotes = rnd() < 0.42 ? int(rnd, 1, 6) : 0;

  const ml = rnd() < 0.55;
  const mlUnverified = ml && rnd() < 0.6;
  const defects = rnd() < 0.12;

  const updatedAt = dateStr(rnd, -400, -1);

  return {
    city, street, house, institution, status, purpose, eni, resp, docs,
    ml, mlUnverified, defects, updatedAt,
    metrics: { oiCount, area, photos, docs, pendingNotes },
    flags: { ml, mlUnverified, defects, pendingNotes: pendingNotes > 0 },
  };
}

export function bulkSummaries(makeSummary) {
  if (cache && cache.length === count) return cache;

  const P = POOLS;
  const out = new Array(count);

  for (let i = 0; i < count; i++) {
    const p = paramsFor(i);
    out[i] = makeSummary({
      id: `${P.idPrefix}-b${i}`,
      address: addressOf(p, i),
      city: p.city,
      institution: p.institution,
      status: p.status,
      purposeTP: p.purpose,
      eni: p.eni,
      resp: p.resp,
      metrics: p.metrics,
      flags: p.flags,
      updatedAt: p.updatedAt,
    });
  }

  cache = out;
  return out;
}

// Полная запись собирается по тем же параметрам — карточка открывается
// так же, как у записей из сида.
export function materialize(id, buildRecord) {
  const P = POOLS;
  const m = /-b(\d+)$/.exec(id);
  if (!m) return null;

  const i = +m[1];
  if (i < 0 || i >= count) return null;

  return buildRecord(id, i, paramsFor(i), P);
}
