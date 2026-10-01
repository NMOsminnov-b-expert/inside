// Отбор, подсчёт, сортировка и поиск сводок реестра — для модулей, у которых
// записи лежат простым массивом (ТС, механизмы).
//
// Реестр (pages/ocMenu) передаёт всем модулям один и тот же фильтр: поиск q,
// списки status/typeId/region/city/institution/insp/flags, staleDays, mine.
// Модули ТС и механизмов проверяли из него только тип, статус и учреждение, а
// поиск искали в несуществующем поле filter.search — поэтому их записи были
// видны при любом поиске, попадали во все срезы и завышали счётчики (обход
// главной 01.10.2026). Здесь — та же логика, что у модулей недвижимого
// (modules/civil/data/query.js, matches), но одна на все такие модули.
import { eniRegion } from './fmt.js';

const inList = (list, v) => !list || !list.length || list.includes(v);

function daysBetween(fromIso, toIso) {
  const a = Date.parse(fromIso || '');
  const b = Date.parse(toIso || '');
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.floor((b - a) / 86400000);
}

// skip — фильтр, который не применять (фасет считается без своего фильтра).
export function matchSummary(s, f, skip) {
  if (!f) return true;
  const resp = s.resp || {};

  if (skip !== 'status' && !inList(f.status, s.status)) return false;
  if (skip !== 'city' && !inList(f.city, s.city)) return false;
  if (skip !== 'institution' && !inList(f.institution, s.institution)) return false;
  if (skip !== 'insp' && !inList(f.insp, resp.insp)) return false;
  if (skip !== 'typeId' && f.typeId && f.typeId.length && !f.typeId.includes(s.typeId)
    && !f.typeId.includes(s.typeKey)) return false;
  if (skip !== 'region' && !inList(f.region, eniRegion(s.eni))) return false;

  if (skip !== 'flags' && f.flags && f.flags.length) {
    for (const flag of f.flags) if (!(s.flags || {})[flag]) return false;
  }
  if (skip !== 'stale' && f.staleDays && daysBetween(s.updatedAt, f.today) < f.staleDays) return false;

  if (skip !== 'mine' && f.mine && f.mine.person) {
    const p = f.mine.person;
    if (f.mine.role === 'any') {
      if (resp.gov !== p && resp.cod !== p && resp.appr !== p && resp.insp !== p) return false;
    } else if (resp[f.mine.role] !== p) {
      return false;
    }
  }

  if (skip !== 'q' && f.q && !String(s.search || '').includes(f.q)) return false;
  return true;
}

function countBy(rows, get) {
  const out = {};
  rows.forEach((r) => { const v = get(r); if (v) out[v] = (out[v] || 0) + 1; });
  return out;
}

// Фасеты: каждый считается без собственного фильтра — как у модулей
// недвижимого. typeId — без фильтра по типу, чтобы тип не пропадал из списка,
// когда отмечен другой.
export function facetsFrom(rows, f) {
  const by = (skip) => rows.filter((r) => matchSummary(r, f, skip));
  const flagsRows = by('flags');
  const flags = {};
  flagsRows.forEach((r) => Object.keys(r.flags || {}).forEach((k) => { if (r.flags[k]) flags[k] = (flags[k] || 0) + 1; }));
  return {
    status: countBy(by('status'), (r) => r.status),
    region: countBy(by('region'), (r) => eniRegion(r.eni)),
    city: countBy(by('city'), (r) => r.city),
    institution: countBy(by('institution'), (r) => r.institution),
    insp: countBy(by('insp'), (r) => (r.resp || {}).insp),
    typeId: countBy(by('typeId'), (r) => r.typeId),
    flags,
  };
}

const CMP = {
  updatedAt: (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)),
  title: (a, b) => String(a.title).localeCompare(String(b.title), 'ru'),
  eni: (a, b) => String(a.eni).localeCompare(String(b.eni)),
  status: (a, b) => String(a.status).localeCompare(String(b.status), 'ru'),
  pendingNotes: (a, b) => ((b.metrics || {}).pendingNotes || 0) - ((a.metrics || {}).pendingNotes || 0),
};
const metricCmp = (k) => (a, b) => ((b.metrics || {})[k] || 0) - ((a.metrics || {})[k] || 0);

// Сортировка внутри модуля — чтобы первые need строк были верными; общий
// порядок реестр восстанавливает сам после слияния модулей.
export function sortRows(rows, sort) {
  const key = sort && sort.key;
  const cmp = CMP[key] || (key ? metricCmp(key) : CMP.updatedAt);
  return rows.slice().sort((sort && sort.dir === 'asc') ? (a, b) => -cmp(a, b) : cmp);
}

// Локатор: запись кладётся в одну группу, а не во все — иначе одно совпадение
// выглядело как три, и Enter его не открывал (обход главной 01.10.2026).
export function locateIn(rows, raw) {
  const q = String(raw || '').trim().toLowerCase();
  const res = { eni: [], address: [], institution: [], letter: [] };
  if (!q) return res;
  for (const s of rows) {
    if (res.address.length >= 8) break;
    if (String(s.search || '').includes(q)) res.address.push(s);
    else if (String(s.institution || '').toLowerCase().includes(q) && res.institution.length < 8) res.institution.push(s);
  }
  return res;
}
