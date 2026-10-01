import { matchSummary, facetsFrom, sortRows, locateIn } from '../../kernel/registryRows.js';
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
  return [f.make, f.model, f.plate, f.vin, f.bodyNo, f.chassisNo, whatLabel(v), rec.institution]
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
    // Для вкладки «Движимое» реестра: номер, позиции, количество, стоимость
    // (у ТС одна позиция; балансовой стоимости в карточке ТС нет).
    regNo: (rec.vehicle.f || {}).plate || (rec.vehicle.f || {}).vin || '',
    kindLabel: ['ТС', whatLabel(rec.vehicle)].filter(Boolean).join(' · '),
    // Состав для превью реестра: модули на машине.
    composition: { label: 'Модули', items: (rec.vehicle.modules || []).map((m) => ({ name: m.kind || 'Модуль не выбран', sub: (m.f || {}).year || '' })) },
    metrics: { oiCount: 0, area: 0, photos: 0, docs: (rec.docs || []).length, positions: 1, qty: 1, cost: 0, pendingNotes: 0 },
    flags: {},
    letters: [],
    updatedAt: rec.updatedAt,
    search: searchOf(rec),
  };
}

export function queryRecords({ filter, sort, offset = 0, limit = 50 } = {}) {
  const rows = sortRows(records.map(summarize).filter((row) => matchSummary(row, filter)), sort);
  return { rows: rows.slice(offset, offset + limit), total: rows.length };
}

export function countRecords(filter) { return records.map(summarize).filter((row) => matchSummary(row, filter)).length; }
// Отбор, фасеты и локатор — общие для модулей с записями-массивом
// (kernel/registryRows.js): раньше здесь проверялись только тип, статус и
// учреждение, и поиск, срезы и признаки на ТС и механизмы не действовали.
export function facets(filter) { return facetsFrom(records.map(summarize), filter); }
export function locate(query) { return locateIn(records.map(summarize), query); }
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
