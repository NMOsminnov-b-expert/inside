// Слияние запросов по модулям. Каждый модуль отвечает только за свои записи;
// меню складывает их страницы и пересчитывает общий порядок.
import { sortedTypes, getType } from '../../kernel/registry.js';

const STATUS_ORDER = new Map([
  'В заполнении',
  'Удостоверен по документам',
  'Осмотрен',
  'Удостоверен после осмотра',
  'На юридической экспертизе',
].map((s, i) => [s, i]));

// Копия компараторов: меню сортирует уже слитый результат.
const CMP = {
  updatedAt: (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)),
  title: (a, b) => a.title.localeCompare(b.title, 'ru'),
  eni: (a, b) => String(a.eni).localeCompare(String(b.eni)),
  area: (a, b) => (b.metrics.area || 0) - (a.metrics.area || 0),
  oiCount: (a, b) => (b.metrics.oiCount || 0) - (a.metrics.oiCount || 0),
  pendingNotes: (a, b) => (b.metrics.pendingNotes || 0) - (a.metrics.pendingNotes || 0),
  status: (a, b) => (STATUS_ORDER.get(a.status) ?? 99) - (STATUS_ORDER.get(b.status) ?? 99),
};

function comparator(sort) {
  const base = CMP[sort && sort.key] || CMP.updatedAt;
  return (sort && sort.dir === 'asc') ? (a, b) => -base(a, b) : base;
}

function typesFor(filter) {
  const ids = filter && filter.typeId;
  const all = sortedTypes();
  return (ids && ids.length) ? all.filter((t) => ids.includes(t.manifest.id)) : all;
}

export function queryAll({ filter, sort, offset = 0, limit = 60 }) {
  const types = typesFor(filter);
  const need = offset + limit;

  let total = 0;
  const rows = [];

  types.forEach((t) => {
    const res = t.records.queryRecords({ filter, sort, offset: 0, limit: need });
    total += res.total;
    for (let i = 0; i < res.rows.length; i++) rows.push(res.rows[i]);
  });

  rows.sort(comparator(sort));

  return { rows: rows.slice(offset, offset + limit), total };
}

export function countAll(filter) {
  return typesFor(filter).reduce((n, t) => n + t.records.countRecords(filter), 0);
}

export function facetsAll(filter) {
  const merged = { status: {}, city: {}, institution: {}, insp: {}, typeId: {}, flags: {} };

  // Фасет «тип ОЦ» считаем по всем модулям, остальные — по отобранным.
  sortedTypes().forEach((t) => {
    const f = t.records.facets(filter);
    Object.keys(f.typeId).forEach((k) => { merged.typeId[k] = (merged.typeId[k] || 0) + f.typeId[k]; });
  });

  typesFor(filter).forEach((t) => {
    const f = t.records.facets(filter);
    ['status', 'city', 'institution', 'insp'].forEach((key) => {
      Object.keys(f[key]).forEach((k) => { merged[key][k] = (merged[key][k] || 0) + f[key][k]; });
    });
    Object.keys(f.flags).forEach((k) => { merged.flags[k] = (merged.flags[k] || 0) + f.flags[k]; });
  });

  return merged;
}

export function locateAll(query) {
  const out = { eni: [], address: [], institution: [], letter: [] };

  sortedTypes().forEach((t) => {
    const r = t.records.locate(query);
    ['eni', 'address', 'institution', 'letter'].forEach((k) => {
      for (const s of r[k]) if (out[k].length < 8) out[k].push(s);
    });
  });

  return out;
}

export function summaryOf(typeId, id) {
  const t = getType(typeId);
  return t ? t.records.getSummary(id) : null;
}

export function recordOf(typeId, id) {
  const t = getType(typeId);
  return t && t.records.loadRecord ? t.records.loadRecord(id) : null;
}

export function totalObjects() {
  return sortedTypes().reduce((n, t) => n + t.records.totalCount(), 0);
}

// Демонстрационный объём: раздаём поровну между модулями.
export function setBulkTotal(n) {
  const types = sortedTypes();
  const per = Math.floor(n / types.length);
  types.forEach((t, i) => {
    const extra = i === 0 ? n - per * types.length : 0;
    t.records.setBulkCount(per + extra);
  });
}

export function bulkTotal() {
  return sortedTypes().reduce((n, t) => n + t.records.bulkCount(), 0);
}

export function mutate(typeId, id, fn) {
  const t = getType(typeId);
  if (!t) return null;
  return fn(t.records, id);
}
