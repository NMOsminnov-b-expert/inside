import { manifest } from './manifest.js';
import { tsTitle, whatLabel } from './tsModel.js';
import { registerPersisted } from '../../kernel/persist.js';

const records = [];
let seq = 0;

// Введённое переживает перезагрузку страницы — как у остальных типов ОЦ
// (kernel/persist.js, требование пользователя 09.09.2026). Модуль пришёл из
// ветки TS-Daniil без этого, и каждая перезагрузка стирала заведённые ТС
// (замечание пользователя 23.09.2026: «тестировать неудобно»).
//
// Массив не подменяется, а перезаполняется: на него уже ссылается реестр.
// Счётчик номеров продолжается с наибольшего сохранённого — иначе новая
// карточка получила бы номер уже существующей.
registerPersisted('records.vehicle', {
  snapshot: () => records,
  restore: (saved) => {
    if (!Array.isArray(saved) || !saved.length) return;
    records.splice(0, records.length, ...saved);
    seq = saved.reduce((max, r) => Math.max(max, Number(String(r.id).split('-').pop()) || 0), seq);
  },
});

function nextId() {
  seq += 1;
  return `oc-vehicle-${seq}`;
}

function searchOf(rec) {
  const v = rec.vehicle;
  const f = v.f || {};
  return [f.make, f.model, f.plate, f.vin, f.bodyNo, f.chassisNo, whatLabel(v)]
    .filter(Boolean).join(' ').toLowerCase();
}

export function summarize(rec) {
  return {
    id: rec.id,
    typeId: manifest.id,
    typeLabel: manifest.label,
    typeIcon: manifest.icon,
    title: tsTitle(rec.vehicle),
    subtitle: (rec.vehicle.f || {}).plate || 'Рег. номер не указан',
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
      { label: 'Вид', value: whatLabel(rec.vehicle) || '—' },
      { label: 'Рег. номер', value: (rec.vehicle.f || {}).plate || '—' },
      { label: 'Год выпуска', value: (rec.vehicle.f || {}).year || '—' },
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
    // Пользователей у ТС не ведут — блок сторон в карточке только с
    // собственниками; пустой список оставлен ради общих столбцов реестра.
    owners: [], users: [], resp: { gov: '', cod: '', appr: '', insp: '' }, docs: [],
    // Категоризация «база + модуль» (tsModel.js): что это за объект, значения
    // полей по ключам справочника data/tsCatalog.js, модули на машине и
    // свободные добавления строками.
    vehicle: {
      kind: '', category: '', base: '', selfGroup: '', selfKind: '', modGroup: '', modKind: '',
      f: {}, modules: [], extra: [],
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

// Подсказки к наименованию собственника — уже заведённые у других ТС.
export function ownerNames() {
  const set = new Set();
  records.forEach((r) => (r.owners || []).forEach((x) => {
    const name = (x && typeof x === 'object' ? x.name : x) || '';
    if (name) set.add(name);
  }));
  return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
}

export const oiCards = {};
export const oiTypes = [];
