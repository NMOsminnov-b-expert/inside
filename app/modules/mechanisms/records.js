// Контракт модуля для меню ОЦ: сводки, запросы, фасеты, локатор, создание.
// Меню не знает предметной области — только форму сводки и смысл полей фильтра.
//
// У этого типа ОЦ нет ни кода ЕНИ, ни ГЛПС, ни назначения по ТП, ни объектов
// имущества (см. app/modules/mechanisms/manifest.js и card/ocForm.view.js) —
// сам ОЦ уже единица техники, а её состав описывает конструктор полей
// (rec.mechanisms). Поэтому сводка ниже проще, чем у остальных модулей: полей,
// которых у записи нет, в ней тоже нет (eni/purposeTP оставлены пустыми
// строками — не бизнес-поле записи, а только форма совместимости с общими
// столбцами реестра/локатора, которые ожидают эти ключи у любой сводки).
import { session } from '../../kernel/session.js';
import { records, addRecord, nextId } from './data/store.js';
import { totalPendingNotes } from './parts/notes/model.js';
import { filterRows, sortRows, computeFacets, locateIn } from './data/query.js';
import { bulkSummaries, bulkCount, setBulkCount, isBulkId, materialize } from './data/bulk.js';
import { buildBulkRecord } from './data/bulkRecord.js';
import { manifest } from './manifest.js';
import { uid } from './parts/mechConstructor.js';

function metricsOf(rec) {
  return {
    oiCount: 0,
    area: 0,
    landArea: 0,
    photos: 0,
    docs: (rec.docs || []).length,
    pendingNotes: totalPendingNotes(rec),
  };
}

// Публично — та же функция нужна карточке: значки состояния показываются и в
// реестре, и в шапке ОЦ. У этого модуля из общих признаков есть только
// «невыполненные заметки» — нет ни ОИ (расхождения, особенности), ни ML-импорта.
export function recFlags(rec) {
  return { pendingNotes: totalPendingNotes(rec) > 0 };
}

function searchOf(parts) {
  return parts.filter(Boolean).join(' ').toLowerCase();
}

// Первый механизм записи — как «Название» для строки реестра; если их
// больше одного, суффикс «(+N)» намекает на остальные (полный состав — в
// самой карточке). Дизайн-решение: показывать первый, а не, скажем,
// объединять все названия через запятую — так строка реестра остаётся
// короткой независимо от того, сколько единиц техники описывает запись.
function mechFacts(rec) {
  const mechanisms = (rec.mechanisms && rec.mechanisms.length) ? rec.mechanisms : [{ name: '', fields: [] }];
  const first = mechanisms[0];
  const extra = mechanisms.length > 1 ? ` (+${mechanisms.length - 1})` : '';
  const out = [{ label: 'Название', value: (first.name || '—') + extra }];
  (first.fields || []).slice(0, 3).forEach((f) => out.push({ label: f.label, value: f.value || '—' }));
  return out;
}

// Сводка записи из сида или созданной пользователем.
export function summarize(rec) {
  const m = metricsOf(rec);
  const flags = recFlags(rec);
  const mechanisms = (rec.mechanisms && rec.mechanisms.length) ? rec.mechanisms : [{ name: '', fields: [] }];

  return {
    id: rec.id,
    typeId: manifest.id,
    typeLabel: manifest.label,
    typeIcon: manifest.icon,
    title: rec.address,
    subtitle: rec.institution,
    // Полей ЕНИ/назначения по ТП у записи нет — пустые строки только для
    // совместимости формы сводки с общими столбцами реестра.
    eni: '',
    purposeTP: '',
    status: rec.status,
    city: rec.city || '',
    institution: rec.institution || '',
    podved: rec.podved || '',
    owners: rec.owners || [],
    users: rec.users || [],
    resp: Object.assign({ gov: '', cod: '', appr: '', insp: '' }, rec.resp),
    badges: [{ label: rec.status, tone: 'status' }],
    facts: mechFacts(rec),
    metrics: m,
    flags,
    letters: [],
    updatedAt: rec.updatedAt || '',
    // Все механизмы записи (не только первый) фолдятся в строку поиска —
    // реестр должен находить запись по названию/полю/значению ЛЮБОГО из них,
    // а не только того, что показан в facts.
    search: searchOf([
      rec.address, rec.institution, rec.podved, rec.status,
      ...(rec.owners || []), ...(rec.users || []),
      ...Object.values(rec.resp || {}),
      ...mechanisms.flatMap((mech) => [mech.name, ...(mech.fields || []).flatMap((f) => [f.label, f.value])]),
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
    eni: '',
    purposeTP: '',
    status: raw.status,
    city: raw.city,
    institution: raw.institution,
    podved: raw.podved || '',
    owners: raw.owners || [],
    users: raw.users || [],
    resp: raw.resp,
    badges: [{ label: raw.status, tone: 'status' }],
    facts: [{ label: 'Название', value: raw.mechName || '—' }],
    metrics: m,
    flags: raw.flags,
    letters: [],
    updatedAt: raw.updatedAt,
    search: searchOf([raw.address, raw.institution, raw.status, raw.mechName, raw.resp.insp, raw.resp.appr]),
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

// Записи, живущие в памяти модуля: сид плюс материализованные из массовой
// генерации. Нужны архиву документов (kernel/archive.js) — он обходит модули
// через реестр и собирает rec.archive.
export { takeRecord, restoreRecord } from './data/store.js';

// Подписи полей — для смены типа ОЦ (kernel/typeChange.js): ядро не знает ни
// одного типа ОЦ, поэтому человеческие названия полей приходят из модуля.
export { fieldLabel } from './audit/fieldLabels.js';

// У этого модуля нет ни одной карточки ОИ и ни одного вида ОИ — оба экспорта
// пустые, но в той же форме, что у остальных модулей (kernel/typeChange.js
// ожидает объект/массив, даже пустые, а не undefined).
export const oiCards = {};
export const oiTypes = [];

export function allRecords() {
  return records;
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

// Создание ОЦ не открывает отдельную форму/диалог — модуль сразу отдаёт
// пустую запись (статус «В заполнении»), меню открывает её форму
// редактирования (см. app/pages/ocMenu/ocMenu.js).
export function createRecord() {
  const today = new Date().toISOString().slice(0, 10);

  const rec = {
    id: nextId('oc-mh'),
    typeId: manifest.id,
    // Категория этого типа ОЦ навсегда «Движимое» — не выбирается
    // пользователем (см. manifest.js и kernel/typeChange.js).
    category: manifest.category,
    type: manifest.label,
    address: '',
    city: '',
    status: 'В заполнении',
    institution: '',
    podved: '',
    updatedAt: today,
    owners: [],
    users: [],
    // Оператор ЦОД — тот, кто создаёт карточку (Л2.14).
    // ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: здесь должен встать идентификатор пользователя из
    // сессии, а не его отображаемое имя — имя может измениться, и старые
    // карточки тогда начнут ссылаться в пустоту.
    resp: { gov: '', cod: session.state.person || '', appr: '', insp: '' },
    notes: [],
    docs: [],
    mechanisms: [{ id: uid(), name: '', qty: 1, fields: [] }],
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

// Привязка объекта оценки к учреждению — из раздела «Учреждения».
export function setInstitution(id, { institution = '', podved = '', nodeId = '' } = {}) {
  const rec = loadRecord(id);
  if (!rec) return null;
  rec.institution = institution;
  rec.podved = podved;
  rec.institutionId = nodeId;
  rec.updatedAt = new Date().toISOString().slice(0, 10);
  return rec;
}
