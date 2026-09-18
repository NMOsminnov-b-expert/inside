import { manifest } from './manifest.js';

const records = [];
let seq = 0;

function nextId() {
  seq += 1;
  return `oc-vehicle-${seq}`;
}

function searchOf(rec) {
  return [rec.vehicle.brand, rec.vehicle.model, rec.vehicle.plate, rec.vehicle.vin, rec.vehicle.type]
    .filter(Boolean).join(' ').toLowerCase();
}

export function summarize(rec) {
  return {
    id: rec.id,
    typeId: manifest.id,
    typeLabel: manifest.label,
    typeIcon: manifest.icon,
    title: [rec.vehicle.brand, rec.vehicle.model].filter(Boolean).join(' ') || 'Новое транспортное средство',
    subtitle: rec.vehicle.plate || 'Госномер не указан',
    eni: rec.eni,
    status: rec.status,
    city: rec.city,
    institution: rec.institution,
    podved: rec.podved,
    owners: rec.owners,
    users: rec.users,
    purposeTP: '',
    resp: rec.resp,
    badges: [{ label: rec.status, tone: 'status' }],
    facts: [
      { label: 'Тип ТС', value: rec.vehicle.type || '—' },
      { label: 'Госномер', value: rec.vehicle.plate || '—' },
      { label: 'Год выпуска', value: rec.vehicle.year || '—' },
      { label: 'Материалы', value: String((rec.docs || []).reduce((n, d) => n + (d.files || []).length, 0)) },
    ],
    metrics: { oiCount: 0, area: 0, photos: 0, docs: rec.docs.length },
    flags: {},
    letters: [],
    updatedAt: rec.updatedAt,
    search: searchOf(rec),
  };
}

function matches(summary, filter = {}) {
  if (filter.typeId && filter.typeId.length && !filter.typeId.includes(manifest.id)) return false;
  if (filter.status && filter.status.length && !filter.status.includes(summary.status)) return false;
  if (filter.institution && filter.institution.length && !filter.institution.includes(summary.institution)) return false;
  if (filter.search && !summary.search.includes(String(filter.search).toLowerCase())) return false;
  return true;
}

export function queryRecords({ filter, offset = 0, limit = 50 } = {}) {
  const rows = records.map(summarize).filter((row) => matches(row, filter));
  return { rows: rows.slice(offset, offset + limit), total: rows.length };
}

export function countRecords(filter) { return queryRecords({ filter }).total; }
export function facets(filter) {
  const rows = records.map(summarize).filter((row) => matches(row, { ...filter, status: [], institution: [] }));
  return {
    status: Object.fromEntries([...new Set(rows.map((r) => r.status))].map((v) => [v, rows.filter((r) => r.status === v).length])),
    institution: Object.fromEntries([...new Set(rows.map((r) => r.institution).filter(Boolean))].map((v) => [v, rows.filter((r) => r.institution === v).length])),
    // institution собран выше — второй раз его писать нельзя: пустой объект
    // затирал посчитанные учреждения, и срез по ним не работал.
    region: {}, city: {}, insp: {}, typeId: { [manifest.id]: rows.length }, flags: {},
  };
}
export function locate(query) {
  const row = records.map(summarize).find((item) => item.search.includes(String(query || '').toLowerCase()));
  return row ? { eni: [row], address: [row], institution: [row], letter: [] } : { eni: [], address: [], institution: [], letter: [] };
}
export function getSummary(id) { const rec = loadRecord(id); return rec ? summarize(rec) : null; }
export function loadRecord(id) { return records.find((rec) => rec.id === id) || null; }
export function allRecords() { return records; }
export function totalCount() { return records.length; }
export function bulkCount() { return 0; }
export function setBulkCount() {}

export function createRecord() {
  const rec = {
    id: nextId(), typeId: manifest.id, type: manifest.label, category: 'Движимое', status: 'В заполнении',
    city: '', institution: '', podved: '', eni: '', updatedAt: new Date().toISOString().slice(0, 10),
    owners: [], users: [], resp: { gov: '', cod: '', appr: '', insp: [] }, docs: [],
    // Опознавательные сведения лежат полями записи, характеристики и осмотр —
    // в params по ключам справочника (data/vehicleFields.js), свободные
    // добавления — строками extra.
    vehicle: {
      type: '', brand: '', model: '', plate: '', vin: '', year: '', color: '', country: '',
      notes: '', params: {}, extra: [],
    },
  };
  records.unshift(rec);
  return rec;
}

export function setStatus(id, status) { const rec = loadRecord(id); if (rec) rec.status = status; return rec; }
export function assignResponsible(id, role, person) { const rec = loadRecord(id); if (rec) rec.resp[role] = person; return rec; }
export function setInstitution(id, { institution = '', podved = '', nodeId = '' } = {}) { const rec = loadRecord(id); if (rec) Object.assign(rec, { institution, podved, institutionId: nodeId }); return rec; }
export function takeRecord(id) { const i = records.findIndex((rec) => rec.id === id); return i < 0 ? null : records.splice(i, 1)[0]; }
export function restoreRecord(rec) { if (rec && !loadRecord(rec.id)) records.push(rec); return rec; }
export function fieldLabel(key) { return key; }

// VIN: 17 знаков, без букв I, O и Q — их нет в стандарте, чтобы не путать с
// единицей и нулём (ISO 3779 / 49 CFR 565).
export const VIN_LENGTH = 17;
const VIN_ALLOWED = /[^A-HJ-NPR-Z0-9]/g;

export const normVin = (value) => String(value || '').toUpperCase()
  .replace(VIN_ALLOWED, '').slice(0, VIN_LENGTH);

export function vinError(value) {
  const v = normVin(value);
  if (!v) return '';
  return v.length === VIN_LENGTH ? '' : `В VIN ${v.length} из ${VIN_LENGTH} знаков`;
}

export const normPlate = (value) => String(value || '').toUpperCase().replace(/\s+/g, ' ').trim();

// Дополнительные параметры записи: наименование и значение.
export const vehicleExtra = (rec) => (rec.vehicle.extra = rec.vehicle.extra || []);

let extraSeq = 1;
export function addVehicleExtra(rec) {
  const row = { id: `vx-${Date.now().toString(36)}-${extraSeq += 1}`, label: '', value: '' };
  vehicleExtra(rec).push(row);
  return row;
}

export function dropVehicleExtra(rec, id) {
  const list = vehicleExtra(rec);
  const at = list.findIndex((f) => f.id === id);
  if (at >= 0) list.splice(at, 1);
}
export const oiCards = {};
export const oiTypes = [];
