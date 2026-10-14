// Маршрут дня осмотрщика и нормы осмотра (ТЗ рабочего дня осмотрщика,
// пункты 7.2–7.4).
//
// Маршрут — по кругу от дома (временного жилья, если день в его периоде)
// через объекты и обратно. Объекты дня: назначенные на этот день — всегда;
// к ним система предлагает объекты очереди «К назначению» из области плана
// месяца (или областей осмотрщика), ближайшие по пути, пока весь круг
// укладывается в рабочий день по графику. Предложение — совет: регионал
// снимает лишние и назначает остальные (практики планировщиков выездов:
// рекомендация не решает за человека).
//
// Время дня = дорога + осмотры. Осмотр объекта = основа + площадь × норма
// на 1 м² по виду здания: склад и производственное — быстрее, гражданское
// той же площади — дольше (заметки пользователя 12.10.2026). Норма по факту
// — из истории: от первых снимков до окончания осмотра, медиана по виду.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: дорога — по прямой × 1,3 со средней скоростью; на
// сервере — свой сервер маршрутов на данных OSM (OSRM, Valhalla): реальные
// дороги и время, координаты объектов не уходят наружу. Порядок объектов —
// жадный (ближайший следующий); на сервере — решатель задачи коммивояжёра
// с окнами времени.
import { getType } from '../../kernel/registry.js';
import {
  allAssignments, isLive, eventsOf, profileOf, planOf, workdayOf, activitiesOn,
} from '../../kernel/inspections.js';
import { registerPersisted, scheduleSave } from '../../kernel/persist.js';
import { queueBase, regionOf } from './model.js';

// --- нормы осмотра ----------------------------------------------------------

export const NORM_KINDS = [
  { key: 'production', label: 'Производственное, склад', re: /производ|склад/i, base: 20, perM2: 0.012 },
  { key: 'civil', label: 'Гражданское', re: /граждан|нежил/i, base: 25, perM2: 0.03 },
  { key: 'house', label: 'Жилой дом', re: /дом/i, base: 20, perM2: 0.06 },
  { key: 'flat', label: 'Квартира', re: /квартир/i, base: 15, perM2: 0.1 },
  { key: 'land', label: 'Земельный участок', re: /участ|земел/i, base: 10, perM2: 0.002 },
  { key: 'other', label: 'Прочее', re: /.*/, base: 20, perM2: 0.02 },
];
// Вид — по типу ОЦ в сводке (до определения типа здания — по назначению из
// техпаспорта: у нежилого здания тип считает система по площадям литер).
export const normKindOf = (s) => (NORM_KINDS.find((k) => k.re.test(String((s && s.typeLabel) || ''))) || NORM_KINDS[NORM_KINDS.length - 1]).key;

// Правки норм регионалом — поверх значений по умолчанию; запись на вид
// здания (общее сохранение хранит части осмотров списками записей с id).
const normEdits = [];
registerPersisted('inspections.norms', {
  snapshot: () => normEdits,
  restore: (saved) => { if (Array.isArray(saved)) normEdits.splice(0, normEdits.length, ...saved.filter((x) => x && x.id)); },
});
export const normOf = (key) => {
  const k = NORM_KINDS.find((x) => x.key === key) || NORM_KINDS[NORM_KINDS.length - 1];
  const e = normEdits.find((x) => x.id === key) || {};
  return { ...k, ...(e.base !== undefined ? { base: e.base } : {}), ...(e.perM2 !== undefined ? { perM2: e.perM2 } : {}) };
};
export function setNorm(key, patch) {
  let e = normEdits.find((x) => x.id === key);
  if (!e) { e = { id: key }; normEdits.push(e); }
  Object.assign(e, patch);
  scheduleSave();
}
export const inspectMinutes = (s) => {
  const n = normOf(normKindOf(s));
  const area = (s && s.metrics && s.metrics.area) || 0;
  return Math.round(n.base + area * n.perM2);
};

// Нормы по факту: длительность осмотра — от первых снимков до окончания;
// норма на 1 м² = (длительность − основа) / площадь; медиана по виду.
export function measuredNorms(all) {
  const first = new Map();
  eventsOf({}).forEach((e) => { if (e.kind === 'photos' && (!first.has(e.assignId) || e.at < first.get(e.assignId))) first.set(e.assignId, e.at); });
  const by = new Map();
  allAssignments().forEach((a) => {
    if (a.state !== 'done' || !a.doneAt || !first.has(a.id)) return;
    const s = all.get(a.typeId + '|' + a.ocId);
    const area = s && s.metrics && s.metrics.area;
    if (!area) return;
    const min = (new Date(a.doneAt) - new Date(first.get(a.id))) / 60000;
    if (min <= 0 || min > 600) return;
    const k = normKindOf(s);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push({ min, area });
  });
  const out = {};
  by.forEach((list, k) => {
    const base = normOf(k).base;
    const per = list.map((x) => Math.max(0, (x.min - base) / x.area)).sort((p, q) => p - q);
    out[k] = { n: list.length, perM2: per[Math.floor(per.length / 2)], minutes: list.map((x) => x.min).sort((p, q) => p - q)[Math.floor(list.length / 2)] };
  });
  return out;
}

// --- расстояния ----------------------------------------------------------------

export const parseGps = (v) => {
  const m = /(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)/.exec(String(v || ''));
  return m ? [+m[1], +m[2]] : null;
};
const toRad = (x) => (x * Math.PI) / 180;
// Км по дорогам ≈ по прямой × 1,3 (средний коэффициент извилистости).
export function roadKm(a, b) {
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h)) * 1.3;
}
// Средняя скорость: по городу (до 15 км) — 30 км/ч, дальше — 60 км/ч.
export const driveMinutes = (km) => Math.round(km < 15 ? (km / 30) * 60 : 30 + ((km - 15) / 60) * 60);

export const loadOcRecord = (typeId, ocId) => {
  const t = getType(typeId);
  return t && t.records.loadRecord ? t.records.loadRecord(ocId) : null;
};
// Точка объекта: поле GPS карточки, а если пусто — центр рамки участка из
// Кадастра (rec.geo, 13.10.2026: координаты по ЕНИ и адресу).
export const gpsOfObject = (typeId, ocId) => {
  const rec = loadOcRecord(typeId, ocId);
  if (!rec) return null;
  const g = parseGps(rec.gps);
  if (g) return g;
  const e = rec.geo && rec.geo.extent;
  return e ? [(e[1] + e[3]) / 2, (e[0] + e[2]) / 2] : null;
};
const hm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`;
const minOf = (t) => { const [h, m] = String(t || '09:00').split(':').map(Number); return h * 60 + (m || 0); };

// Дом на этот день: временное жильё, если день в его периоде (командировка),
// иначе — постоянное.
export function homeOf(person, date) {
  const p = profileOf(person);
  const trip = activitiesOn(person, date).find((a) => a.kind === 'trip' && a.homeGps);
  if (trip) return { gps: parseGps(trip.homeGps), label: 'временное жильё' };
  if (p.tempGps && p.tempFrom && p.tempFrom <= date && (!p.tempTo || p.tempTo >= date)) return { gps: parseGps(p.tempGps), label: 'временное жильё' };
  return { gps: parseGps(p.homeGps), label: 'дом' };
}

// --- маршрут дня ------------------------------------------------------------------

// skip — ключи предложенных объектов, которые регионал снял.
export function dayRoute(all, person, date, skip = new Set()) {
  const p = profileOf(person);
  const home = homeOf(person, date);
  const w = workdayOf(person, date);
  const start = minOf(p.schedule.from);
  const end = minOf(p.schedule.to);
  const plan = planOf(person, date);
  const regions = new Set(plan && plan.region ? [plan.region] : (p.regions || []));

  // Назначенные на день — по объекту, ОИ вместе.
  const fixed = new Map();
  allAssignments().forEach((a) => {
    if (a.person !== person || a.plannedAt !== date || !(isLive(a) || a.state === 'done')) return;
    const k = a.typeId + '|' + a.ocId;
    const s = all.get(k);
    if (!s || fixed.has(k)) return;
    fixed.set(k, { key: k, s, gps: gpsOfObject(a.typeId, a.ocId), fixed: true, assignId: a.id, done: a.state === 'done' });
  });
  const noGps = [...fixed.values()].filter((x) => !x.gps);

  // Кандидаты — очередь «К назначению» с координатами, в области плана.
  const cand = queueBase(all)
    .filter((s) => !fixed.has(s.typeId + '|' + s.id) && !skip.has(s.typeId + '|' + s.id))
    .filter((s) => !regions.size || regions.has(regionOf(s)))
    .map((s) => ({ key: s.typeId + '|' + s.id, s, gps: gpsOfObject(s.typeId, s.id), fixed: false, cov: s.cov }))
    .filter((x) => x.gps);

  const stops = [];
  let at = home.gps;
  let t = start;
  let km = 0;
  const leg = (to) => { const d = at ? roadKm(at, to) : 0; return { km: d, min: at ? driveMinutes(d) : 0 }; };
  const take = (x) => {
    const l = leg(x.gps);
    const arrive = t + l.min;
    const insp = inspectMinutes(x.s);
    stops.push({ ...x, km: l.km, drive: l.min, arrive: hm(arrive), inspect: insp, leave: hm(arrive + insp) });
    t = arrive + insp;
    km += l.km;
    at = x.gps;
  };
  // Назначенные — в порядке, который задал осмотрщик (план дня, order —
  // указание пользователя 14.10.2026 «нужна возможность перетаскиванием
  // менять порядок для поездки»), остальные — ближайший следующий.
  let rest = [...fixed.values()].filter((x) => x.gps);
  ((plan && plan.order) || []).forEach((k) => {
    const x = rest.find((y) => y.key === k);
    if (!x) return;
    rest = rest.filter((y) => y !== x);
    take(x);
  });
  while (rest.length) {
    rest.sort((a, b) => roadKm(at || a.gps, a.gps) - roadKm(at || b.gps, b.gps));
    take(rest.shift());
  }
  // Предложенные — пока круг с возвращением укладывается в день.
  const proposed = [];
  if (home.gps && w.ok) {
    let pool = cand.slice();
    while (pool.length) {
      pool.sort((a, b) => roadKm(at, a.gps) - roadKm(at, b.gps));
      const x = pool.shift();
      const l = leg(x.gps);
      const finish = t + l.min + inspectMinutes(x.s) + driveMinutes(roadKm(x.gps, home.gps));
      if (finish > end) { if (l.km > 60) break; continue; }
      take(x);
      proposed.push(x.key);
      pool = pool.filter((y) => y.key !== x.key);
    }
  }
  const back = at && home.gps ? { km: roadKm(at, home.gps), min: driveMinutes(roadKm(at, home.gps)) } : { km: 0, min: 0 };
  const finish = t + back.min;
  return {
    person, date, home, work: w, regions: [...regions], start: hm(start), end: hm(end),
    stops, proposed, noGps, back: { ...back, arrive: hm(finish) }, ordered: !!(plan && plan.order && plan.order.length),
    km: Math.round(km + back.km), driveMin: stops.reduce((n, x) => n + x.drive, 0) + back.min,
    inspectMin: stops.reduce((n, x) => n + x.inspect, 0), over: finish > end ? Math.round(finish - end) : 0,
  };
}
