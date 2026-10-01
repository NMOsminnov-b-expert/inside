import { matchSummary, facetsFrom, sortRows, locateIn } from '../../kernel/registryRows.js';
import { manifest } from './manifest.js';
import { registerPersisted } from '../../kernel/persist.js';
import { fmtNum } from '../../kernel/fmt.js';
import {
  mechUnits, createMechOi, syncMechName, totalQty, totalCost, hasCost, unitClassPath,
} from './form/model.js';

// Записи ОЦ «Механизмы и оборудование». Устроены как у ОЦ «Транспортные
// средства» (ответ пользователя 28.09.2026): стороны у самой записи, перечень
// единиц — в rec.mech, в том же виде, что у объекта имущества «Механизмы и
// оборудование» в любом другом ОЦ (mechanisms/form/model.js). Один ОЦ — один
// список.
const records = [];
let seq = 0;

// Введённое переживает перезагрузку страницы — как у остальных типов ОЦ
// (kernel/persist.js). Массив не подменяется, а перезаполняется: на него уже
// ссылается реестр. Счётчик номеров продолжается с наибольшего сохранённого.
registerPersisted('records.mechanisms', {
  snapshot: () => records,
  restore: (saved) => {
    if (!Array.isArray(saved) || !saved.length) return;
    records.splice(0, records.length, ...saved);
    seq = saved.reduce((max, r) => Math.max(max, Number(String(r.id).split('-').pop()) || 0), seq);
  },
});

function nextId() {
  seq += 1;
  return `oc-mech-${seq}`;
}

// Перечень единиц записи. Заводится при первом обращении — у записи, пришедшей
// без него, форма иначе открылась бы пустой.
export function mechOf(rec) {
  if (!rec.mech) rec.mech = createMechOi({ id: `${rec.id}-mech` });
  if (!mechUnits(rec.mech).length) rec.mech.mechanisms.push(...createMechOi({}).mechanisms);
  syncMechName(rec.mech);
  return rec.mech;
}

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function searchOf(rec) {
  const m = mechOf(rec);
  return [m.groupName, rec.institution, ...mechUnits(m).flatMap((u) => [u.name, u.inv, unitClassPath(u)])]
    .filter(Boolean).join(' ').toLowerCase();
}

const pendingOf = (m) => (m.notes || []).filter((x) => !x.done).length;
const photoCount = (m) => Object.values(m.photos || {}).reduce((s, n) => s + n, 0);

export function summarize(rec) {
  const m = mechOf(rec);
  const n = mechUnits(m).length;
  return {
    id: rec.id,
    typeId: manifest.id,
    typeLabel: manifest.label,
    typeIcon: manifest.icon,
    title: m.name,
    subtitle: `${n} ${plural(n, 'позиция', 'позиции', 'позиций')} · ${totalQty(m)} шт.`,
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
      { label: 'Позиций', value: String(n) },
      { label: 'Количество', value: `${totalQty(m)} шт.` },
      { label: 'Бал. стоимость', value: hasCost(m) ? `${fmtNum(totalCost(m))} сом` : '—' },
      { label: 'Материалы', value: String((rec.docs || []).reduce((k, d) => k + (d.files || []).length, 0)) },
    ],
    // Для вкладки «Движимое» реестра: название списка (счёт ББ или МОЛ) —
    // в столбце номера; позиции, количество, стоимость; невыполненные
    // заметки перечня.
    regNo: m.groupName || '',
    kindLabel: ['Механизмы и оборудование', mechUnits(m)[0] && mechUnits(m)[0].cls].filter(Boolean).join(' · '),
    // Состав для превью реестра: позиции перечня с состоянием.
    composition: { label: 'Состав', items: mechUnits(m).map((u) => ({ name: u.name || u.type || u.sub || 'Позиция', sub: u.state || '' })) },
    metrics: {
      oiCount: 0, area: 0, photos: photoCount(m), docs: (rec.docs || []).length,
      positions: n, qty: totalQty(m), cost: hasCost(m) ? totalCost(m) : 0, pendingNotes: pendingOf(m),
    },
    flags: { pendingNotes: pendingOf(m) > 0 },
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
  const id = nextId();
  const rec = {
    id, typeId: manifest.id, type: manifest.label, category: 'Движимое', status: 'В заполнении',
    city: '', institution: '', podved: '', eni: '', updatedAt: new Date().toISOString().slice(0, 10),
    // Пользователей, как у ОЦ ТС, не ведут — блок сторон только с
    // собственниками; пустой список оставлен ради общих столбцов реестра.
    owners: [], users: [], resp: { gov: '', cod: '', appr: '', insp: '' }, docs: [],
    mech: createMechOi({ id: `${id}-mech` }),
  };
  syncMechName(rec.mech);
  records.unshift(rec);
  return rec;
}

export function setStatus(id, status) { const rec = loadRecord(id); if (rec) rec.status = status; return rec; }
export function assignResponsible(id, role, person) { const rec = loadRecord(id); if (rec) rec.resp[role] = person; return rec; }
export function setInstitution(id, { institution = '', podved = '', nodeId = '' } = {}) { const rec = loadRecord(id); if (rec) Object.assign(rec, { institution, podved, institutionId: nodeId }); return rec; }
export function takeRecord(id) { const i = records.findIndex((rec) => rec.id === id); return i < 0 ? null : records.splice(i, 1)[0]; }
export function restoreRecord(rec) { if (rec && !loadRecord(rec.id)) records.push(rec); return rec; }
export function fieldLabel(key) { return key; }

// Подсказки к наименованию собственника — уже заведённые у других ОЦ механизмов.
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
