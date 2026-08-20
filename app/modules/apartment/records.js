// Контракт модуля для меню ОЦ: сводки, запросы, фасеты, локатор, создание.
// Меню не знает предметной области — только форму сводки и смысл полей фильтра.
import { fmt, num } from '../../kernel/fmt.js';
import { manifest } from './manifest.js';
import { records, addRecord, nextId } from './data/store.js';
import { totalPendingNotes } from './parts/notes/model.js';
import { filterRows, sortRows, computeFacets, locateIn } from './data/query.js';
import { bulkSummaries, bulkCount, setBulkCount, isBulkId, materialize } from './data/bulk.js';
import { buildBulkRecord } from './data/bulkRecord.js';

function areaOf(rec) {
    return rec.oi
    .filter((o) => o.card !== 'land' && o.card !== 'movable')
    .reduce((s, o) => s + num(o.areas && o.areas.tp), 0);
}

function metricsOf(rec) {
  const photos = rec.oi.reduce(
    (s, o) => s + Object.values(o.photos || {}).reduce((a, b) => a + b, 0), 0
  );
  const docs = (rec.docs || []).length + rec.oi.reduce((s, o) => s + (o.docs || []).length, 0);

  return {
    oiCount: rec.oi.length,
    area: areaOf(rec),
    photos,
    docs,
    pendingNotes: totalPendingNotes(rec),
  };
}

function flagsOf(rec) {
  const ml = rec.oi.some((o) => (o.origin || 'manual') === 'ml');
  return {
    ml,
    mlUnverified: rec.oi.some((o) => (o.origin || 'manual') === 'ml' && !(o.flags || {}).matched),
    defects: rec.oi.some((o) => !!o.dis),
    pendingNotes: totalPendingNotes(rec) > 0,
  };
}

function searchOf(parts) {
  return parts.filter(Boolean).join(' ').toLowerCase();
}

// Сводка записи из сида или созданной пользователем.
export function summarize(rec) {
  const m = metricsOf(rec);
  const flags = flagsOf(rec);
  const letters = rec.oi.map((o) => o.letter).filter(Boolean);

  return {
    id: rec.id,
    typeId: manifest.id,
    typeLabel: manifest.label,
    typeIcon: manifest.icon,
    title: rec.address,
    subtitle: rec.institution,
    eni: rec.eni,
    status: rec.status,
    city: rec.city || '',
    institution: rec.institution || '',
    purposeTP: rec.purposeTP || '',
    resp: Object.assign({ gov: '', cod: '', appr: '', insp: '' }, rec.resp),
    badges: [
      { label: rec.status, tone: 'status' },
      ...(flags.ml ? [{ label: 'ML-импорт', tone: 'info' }] : []),
    ],
    facts: [
      { label: 'Код ЕНИ', value: rec.eni, mono: true },
      { label: 'Общая площадь', value: m.area ? fmt(m.area) + ' м²' : '—' },
      { label: 'ОИ', value: String(m.oiCount) },
      { label: 'Фото', value: String(m.photos) },
    ],
    metrics: m,
    flags,
    letters,
    updatedAt: rec.updatedAt || '',
    search: searchOf([
      rec.address, rec.eni, rec.institution, rec.podved, rec.status,
      ...(rec.owners || []), ...(rec.users || []),
      ...Object.values(rec.resp || {}),
      ...rec.oi.map((o) => `${o.letter || ''} ${o.name}`),
    ]),
  };
}

// Сводка синтетической записи (генератор отдаёт готовые параметры).
function bulkSummary(raw) {
  const m = raw.metrics;

  return {
    id: raw.id,
    typeId: manifest.id,
    typeLabel: manifest.label,
    typeIcon: manifest.icon,
    title: raw.address,
    subtitle: raw.institution,
    eni: raw.eni,
    status: raw.status,
    city: raw.city,
    institution: raw.institution,
    purposeTP: raw.purposeTP || '',
    resp: raw.resp,
    badges: [
      { label: raw.status, tone: 'status' },
      ...(raw.flags.ml ? [{ label: 'ML-импорт', tone: 'info' }] : []),
    ],
    facts: [
      { label: 'Код ЕНИ', value: raw.eni, mono: true },
      { label: 'Общая площадь', value: m.area ? fmt(m.area) + ' м²' : '—' },
      { label: 'ОИ', value: String(m.oiCount) },
      { label: 'Фото', value: String(m.photos) },
    ],
    metrics: m,
    flags: raw.flags,
    letters: ['А'],
    updatedAt: raw.updatedAt,
    search: searchOf([raw.address, raw.eni, raw.institution, raw.status, raw.resp.insp, raw.resp.appr]),
  };
}

// Полный набор сводок модуля: сид + синтетика (материализованные записи
// берутся из сида, чтобы правки пользователя были видны в списке).
function allSummaries() {
  const own = records.map(summarize);
  const bulk = bulkSummaries(bulkSummary);

  if (!bulk.length) return own;

  const materialized = new Set();
  for (const r of records) if (isBulkId(r.id)) materialized.add(r.id);

  return materialized.size
    ? own.concat(bulk.filter((s) => !materialized.has(s.id)))
    : own.concat(bulk);
}

// --- Контракт для меню ---------------------------------------------------

export function queryRecords({ filter, sort, offset = 0, limit = 50 } = {}) {
  const all = allSummaries();
  const rows = sortRows(filterRows(all, filter), sort);

  return {
    rows: rows.slice(offset, offset + limit),
    total: rows.length,
  };
}

// Только количество: без сортировки, для счётчиков и срезов.
export function countRecords(filter) {
  return filterRows(allSummaries(), filter).length;
}

export function facets(filter) {
  return computeFacets(allSummaries(), filter);
}

export function locate(query) {
  return locateIn(allSummaries(), query);
}

export function getSummary(id) {
  return allSummaries().find((s) => s.id === id) || null;
}

export function totalCount() {
  return records.length + bulkCount();
}

// Ленивая материализация: карточка синтетической записи собирается при открытии.
export function loadRecord(id) {
  const found = records.find((r) => r.id === id);
  if (found) return found;

  const built = materialize(id, buildBulkRecord);
  if (built) return addRecord(built);

  return null;
}

export { setBulkCount, bulkCount };

// --- Создание записи ----------------------------------------------------

export const createForm = {
  title: 'Новая квартира (ОЦ)',
  fields: [
    { key: 'address', label: 'Адрес', placeholder: 'г. Бишкек, ул. …, д. …, кв. …', required: true },
    { key: 'eni', label: 'Код ЕНИ', placeholder: '1475…', required: true },
    { key: 'institution', label: 'Учреждение', placeholder: 'Наименование учреждения' },
    { key: 'podved', label: 'Подвед', placeholder: 'Подведомственная организация' },
  ],
};

export function createRecord(values) {
  const today = new Date().toISOString().slice(0, 10);

  const rec = {
    id: nextId('oc-ap'),
    typeId: manifest.id,
    residential: true,
    category: 'Недвижимое',
    type: 'Жилое здание (квартира)',
    purposeTP: 'Жилое',
    eni: values.eni || '',
    address: values.address || '',
    city: (values.address || '').includes('Ош') ? 'Ош' : 'Бишкек',
    gps: '',
    status: 'В заполнении',
    institution: values.institution || '',
    podved: values.podved || '',
    complex: false,
    updatedAt: today,
    owners: values.institution ? [values.institution] : [],
    users: [],
    resp: { gov: '', cod: '', appr: '', insp: '' },
    notes: [],
    docs: [],
    oi: [],
  };

  return addRecord(rec);
}

// --- Точечные изменения из реестра (канбан, массовые действия) ------------

export function setStatus(id, status) {
  const rec = loadRecord(id);
  if (!rec) return null;
  rec.status = status;
  rec.updatedAt = new Date().toISOString().slice(0, 10);
  return rec;
}

export function assignResponsible(id, role, person) {
  const rec = loadRecord(id);
  if (!rec) return null;
  rec.resp = Object.assign({ gov: '', cod: '', appr: '', insp: '' }, rec.resp);
  rec.resp[role] = person;
  rec.updatedAt = new Date().toISOString().slice(0, 10);
  return rec;
}
