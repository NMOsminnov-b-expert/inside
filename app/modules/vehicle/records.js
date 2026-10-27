import { matchSummary, facetsFrom, sortRows, locateIn } from '../../kernel/registryRows.js';
import { manifest } from './manifest.js';
import { tsTitle, whatLabel, tsOf } from './tsModel.js';
import { registerPersisted, copyTag } from '../../kernel/persist.js';
import { localIso } from '../../kernel/fmt.js';
import { createSeed } from './data/seed.js';

// Демо-записи для осмотра ТС (data/seed.js) — исходные данные; правки
// пользователя ложатся поверх них сохранением, как у остальных типов ОЦ.
const records = createSeed();
records.forEach((r) => tsOf(r));
const SEED_IDS = records.map((r) => r.id);
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
    // Пустой список — законный итог (все записи типа удалены): прежнее
    // «!saved.length → оставить засев» возвращало удалённые демо-записи после
    // перезагрузки (код-ревью 09.10.2026).
    if (!Array.isArray(saved)) return;
    // Демо-записи — после заведённых пользователем: новая запись встаёт первой
    // (createRecord), и после перезагрузки порядок тот же.
    const demo = new Set(SEED_IDS);
    // Демо-записи, которых в сохранённом нет (состояние сохранено до их
    // появления), добавляются по id; сохранённые и заведённые — не трогаются.
    // ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: демо-записей на сервере нет, вся эта подмешка
    // уходит вместе с засевом; удалённая вручную демо-запись в макете
    // возвращается после перезагрузки.
    const have = new Set(saved.map((r) => r.id));
    const missing = records.filter((r) => demo.has(r.id) && !have.has(r.id));
    records.splice(0, records.length, ...saved.filter((r) => !demo.has(r.id)), ...saved.filter((r) => demo.has(r.id)), ...missing);
    // Старые записи переводятся сразу при загрузке, а не при первом открытии
    // карточки: реестр читает данные машины напрямую, и у старых записей в
    // фасетах и поиске стояли прежние категории и базы (код-ревью 09.10.2026).
    records.forEach((r) => tsOf(r));
    seq = saved.reduce((max, r) => Math.max(max, Number(String(r.id).split('-').pop()) || 0), seq);
  },
});

function nextId() {
  seq += 1;
  // С меткой копии макета — как у остальных типов ОЦ (kernel/persist.js).
  const tag = copyTag();
  return `oc-vehicle-${tag ? tag + '-' : ''}${seq}`;
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
    city: '', institution: '', podved: '', eni: '', updatedAt: localIso(),
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
