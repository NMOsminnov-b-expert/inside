// Контракт модуля для меню ОЦ: сводки, запросы, фасеты, локатор, создание.
// Меню не знает предметной области — только форму сводки и смысл полей фильтра.
import { recHasSpecials } from './parts/specials/model.js';
import { foldEniList, oiEniCodes } from '../../kernel/eniFold.js';
import { ocFullAddress, syncOcAddress } from '../../kernel/address.js';
import { fmtNum, num } from '../../kernel/fmt.js';
import { manifest } from './manifest.js';
import { session } from '../../kernel/session.js';
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

// Площадь земельных участков — отдельно от площади литер (Л1.8): это разные
// величины, складывать их нельзя.
function landAreaOf(rec) {
  return rec.oi
    .filter((o) => o.card === 'land')
    .reduce((s, o) => s + num((o.areas && o.areas.pravo) || o.area), 0);
}

// Тип земель записи: считается по её участкам (решение пользователя
// 05.09.2026). Участков нет — и говорить не о чем, столбец останется пустым.
function landKindOf(rec) {
  const kinds = new Set((rec.oi || [])
    .filter((o) => o.card === 'land')
    .map((o) => (o.landType === 'Несельскохозяйственный' ? 'Несельхоз' : 'Сельхоз')));

  if (!kinds.size) return '';
  if (kinds.size > 1) return 'Смешанный';
  return [...kinds][0];
}

function metricsOf(rec) {
  const photos = rec.oi.reduce(
    (s, o) => s + Object.values(o.photos || {}).reduce((a, b) => a + b, 0), 0
  );
  const docs = (rec.docs || []).length + rec.oi.reduce((s, o) => s + (o.docs || []).length, 0);

  return {
    oiCount: rec.oi.length,
    area: areaOf(rec),
    landArea: landAreaOf(rec),
    photos,
    docs,
    pendingNotes: totalPendingNotes(rec),
  };
}

// Публично — та же функция нужна карточке: значки состояния показываются
// и в реестре, и в шапке ОЦ, и в плашке литеры.
export function recFlags(rec) {
  return flagsOf(rec);
}

function flagsOf(rec) {
  const ml = rec.oi.some((o) => (o.origin || 'manual') === 'ml');
  return {
    ml,
    mlUnverified: rec.oi.some((o) => (o.origin || 'manual') === 'ml' && !(o.flags || {}).matched),
    defects: rec.oi.some((o) => !!o.dis),
    pendingNotes: totalPendingNotes(rec) > 0,
    // Есть ли у объекта особенности — признак записи, по нему будут столбец и
    // фильтр в реестре (Л4.5, пункт E3 в docs/tz/00-tz.md).
    specials: recHasSpecials(rec),
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
    title: ocFullAddress(rec),
    subtitle: rec.institution,
    eni: rec.eni,
    status: rec.status,
    city: rec.city || '',
    landKind: landKindOf(rec),
    eniList: foldEniList(oiEniCodes(rec)),
    institution: rec.institution || '',
    podved: rec.podved || '',
    owners: rec.owners || [],
    users: rec.users || [],
    purposeTP: rec.purposeTP || '',
    resp: Object.assign({ gov: '', cod: '', appr: '', insp: '' }, rec.resp),
    badges: [
      { label: rec.status, tone: 'status' },
      ...(rec.complex ? [{ label: 'комплекс', tone: 'info' }] : []),
      ...(flags.ml ? [{ label: 'ML-импорт', tone: 'info' }] : []),
    ],
    facts: [
      { label: 'Код ЕНИ', value: rec.eni, mono: true },
      { label: 'Общая площадь', value: m.area ? fmtNum(m.area) + ' м²' : '—' },
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
    landKind: raw.landKind || '',
    eniList: raw.eniList || '',
    institution: raw.institution,
    podved: raw.podved || '',
    owners: raw.owners || [],
    users: raw.users || [],
    purposeTP: raw.purposeTP || '',
    resp: raw.resp,
    badges: [
      { label: raw.status, tone: 'status' },
      ...(raw.flags.ml ? [{ label: 'ML-импорт', tone: 'info' }] : []),
    ],
    facts: [
      { label: 'Код ЕНИ', value: raw.eni, mono: true },
      { label: 'Общая площадь', value: m.area ? fmtNum(m.area) + ' м²' : '—' },
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

// Записи, живущие в памяти модуля: сид плюс материализованные из массовой
// генерации. Нужны архиву документов (kernel/archive.js) — он обходит модули
// через реестр и собирает rec.archive.
// Изъятие и возврат записи — для архива (kernel/archive.js). Реестр модуля
// остаётся единственным, кто трогает свой список записей.
export { takeRecord, restoreRecord } from './data/store.js';

// Подписи полей и виды ОИ — для смены типа ОЦ и вида ОИ (kernel/typeChange.js):
// ядро не знает ни одного типа, поэтому человеческие названия полей и список
// видов ОИ приходят из модуля.
export { fieldLabel } from './audit/fieldLabels.js';
// Какие карточки ОИ есть у этого модуля — по ним ядро понимает, найдётся ли
// куда открыть объект имущества после смены типа ОЦ (kernel/typeChange.js).
export { OI_CARDS as oiCards } from './oi/registry.js';
import { REALTY_OI_TYPES, MOVABLE_OI_TYPES } from './data/rules.js';
// У этого модуля виды ОИ разделены на недвижимость и движимое —
// ядру отдаём объединённый список (kernel/typeChange.js).
export const oiTypes = [...REALTY_OI_TYPES, ...MOVABLE_OI_TYPES];

export function allRecords() {
  return records;
}

export function totalCount() {
  return records.length + bulkCount();
}

// Ленивая материализация: карточка синтетической записи собирается при открытии.
export function loadRecord(id) {
  const found = records.find((r) => r.id === id);
  // Адрес записи — производное от её частей и адресов ОИ (kernel/address.js).
  // Собираем при загрузке: rec.address читают шапка, архив, лог и поиск, а
  // строкой он больше нигде не задаётся.
  if (found) { syncOcAddress(found); return found; }

  const built = materialize(id, buildBulkRecord);
  if (built) return addRecord(built);

  return null;
}

export { setBulkCount, bulkCount };

// --- Создание записи ----------------------------------------------------

// Создание ОЦ не открывает отдельную форму/диалог — модуль сразу отдаёт
// пустую запись (статус «В заполнении»), меню открывает её форму
// редактирования (см. app/pages/ocMenu/ocMenu.js). Один экран, а не два.
export function createRecord() {
  const today = new Date().toISOString().slice(0, 10);

  const rec = {
    id: nextId('oc-cv'),
    typeId: manifest.id,
    residential: false,
    category: 'Недвижимое',
    type: 'Гражданское здание',
    purposeTP: 'Административное',
    eni: '',
    address: '',
    city: '',
    gps: '',
    status: 'В заполнении',
    institution: '',
    podved: '',
    complex: false,
    updatedAt: today,
    owners: [],
    users: [],
    // Оператор ЦОД — тот, кто создаёт карточку (Л2.14). Реальных учётных
    // записей в макете нет, поэтому берётся выбранный переключателем роли.
    // ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: здесь должен встать идентификатор пользователя из
    // сессии, а не его отображаемое имя, — имя может измениться, и старые
    // карточки тогда начнут ссылаться в пустоту.
    resp: { gov: '', cod: session.state.person || '', appr: '', insp: '' },
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

// Привязка объекта оценки к учреждению — из раздела «Учреждения».
//
// В записи два поля из реестра: institution (учреждение) и podved
// (подведомственная организация). Дерево учреждений вложено на любую глубину,
// поэтому раздел передаёт готовую пару: имя верхнего учреждения ветки и имя
// самого узла, если он глубже.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: на сервере у записи будет идентификатор узла дерева, а
// не пара названий — тогда переименование учреждения не потребует обхода
// объектов. Здесь имена, потому что реестр фильтрует и группирует по строкам.
export function setInstitution(id, { institution = '', podved = '', nodeId = '' } = {}) {
  const rec = loadRecord(id);
  if (!rec) return null;
  rec.institution = institution;
  rec.podved = podved;
  rec.institutionId = nodeId;
  rec.updatedAt = new Date().toISOString().slice(0, 10);
  return rec;
}
