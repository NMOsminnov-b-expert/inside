// Назначения на осмотр: кто, что и когда осматривает.
//
// ТЗ панели осмотров — запись графа panel-osmotrov-tz (постановка пользователя
// 12.10.2026 и его ответы на вопросы В1–В10). Региональный менеджер назначает
// осмотрщиков на объекты оценки или на отдельные ОИ, выбирает, какие документы
// и описи осмотрщик увидит, и ставит плановую дату осмотра. ОИ одного объекта
// можно раздать разным людям, на один ОИ — нескольких (ответ В7: «Система
// максимально гибкая»).
//
// Назначение — своя сущность, а не поле записи: у поля resp.insp одно
// значение, у назначений — сколько угодно. resp.insp при этом не бросаем —
// реестр, срез «Мне осмотреть» и фильтр по осмотрщику работают по нему, —
// а держим равным осмотрщику последнего действующего назначения (syncResp).
//
// Ядро не знает видов ОИ: ОИ здесь — только id внутри записи, подписи и
// документы берёт страница через kernel/registry.js.
import { getType } from './registry.js';
import { registerPersisted, scheduleSave } from './persist.js';
import { session } from './session.js';
import { demoInspections } from './inspectionsDemo.js';
import { registerDemoResults } from './inspectionResults.js';
import { attachedFileFrom } from './fileUpload.js';
import { eniRegion } from './fmt.js';
import { optionsFor } from './dicts.js';
import {
  SKIP_REASONS, ABSENCE_KINDS, ACTIVITY_KINDS, CAD_DOCS, DEFAULT_DOC_TYPES, CAR_FUELS,
} from './inspectionsDicts.js';
import { setEarlyAssigns, earlyOf } from './earlyInspection.js';
import { testDataOn } from './testData.js';

// Перечни «Осмотров» — из раздела «Справочники» (группа «Осмотры», решение
// пользователя 15.10.2026), встроенные — запасные (kernel/inspectionsDicts.js).
export { SKIP_REASONS, ABSENCE_KINDS, ACTIVITY_KINDS, CAD_DOCS, DEFAULT_DOC_TYPES, CAR_FUELS };
const fromDict = (card, field, fallback) => {
  try { return optionsFor('inspections', card, field) || fallback; } catch (e) { return fallback; }
};
export const skipReasons = () => fromDict('plan', 'skipReason', SKIP_REASONS);
export const cadDocs = () => fromDict('cad', 'docs', CAD_DOCS);
export const carFuels = () => fromDict('car', 'fuel', CAR_FUELS);
// Отсутствия и работа вне выездов хранятся ключом: встроенные подписи
// сопоставляются со своим ключом, новое значение справочника — само себе ключ.
const keyed = (labels, builtIn) => labels.map((label) => builtIn.find((k) => k.label === label) || { key: label, label, short: label });
export const absenceKinds = () => keyed(fromDict('plan', 'absence', ABSENCE_KINDS.map((k) => k.label)), ABSENCE_KINDS);
export const activityKinds = () => keyed(fromDict('plan', 'activity', ACTIVITY_KINDS.map((k) => k.label)), ACTIVITY_KINDS);

// Состояния назначения — в порядке жизни.
export const ASSIGN_STATES = [
  { key: 'assigned', label: 'Назначено' },
  { key: 'progress', label: 'В работе' },
  { key: 'done', label: 'Осмотр закончен' },
  { key: 'removed', label: 'Снято' },
];
const LIVE = new Set(['assigned', 'progress']);
export const isLive = (a) => !!a && LIVE.has(a.state);

// Документы, которые отмечены в окне назначения сразу: кадастровый и
// поэтажный план (заметки пользователя 12.10.2026 «для выезда нужен только
// кадастровый + поэтажка»; заменяет прежний ответ В6 «техпаспорт,
// кадастровый, ситуационный»). Сверяются по виду и имени документа без
// регистра.
// Вид «Планировка» в справочнике документов — тот же поэтажный план.
// Список — справочник «Документы по умолчанию в назначении»; сверка — по
// основе первого слова (7 букв: «кадастр», «поэтажн», «планиро»).
const stem = (v) => String(v || '').toLowerCase().replace(/ё/g, 'е').trim().split(/\s+/)[0].slice(0, 7);
export const isDefaultDoc = (kind) => {
  const k = String(kind || '').toLowerCase().replace(/ё/g, 'е');
  return !!k && fromDict('assign', 'defaultDocs', DEFAULT_DOC_TYPES).some((v) => stem(v) && k.includes(stem(v)));
};

// Засев — демо-история (kernel/inspectionsDemo.js): заполняется до
// регистрации в сохранении, поэтому считается исходными данными, а не
// правками пользователя; правки ложатся поверх него, как у записей ОЦ.
const demo = demoInspections({ isDefaultDoc, me: session.state.person });
registerDemoResults(demo.results, demo.resultsVer);
const assignments = demo.assignments;
const events = demo.events;
// Тумблер «Тестовые данные» выключен (kernel/testData.js) — демо-назначения и демо-события не видны нигде; в данных
// они остаются, иначе сохранение сочло бы их удалёнными. Правки идут по полному списку.
const visA = () => (testDataOn() ? assignments : assignments.filter((a) => !a.demo));

// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: назначения и их журнал — записи на сервере с автором
// и временем сервера; осмотрщик видит только свои назначения, менеджер —
// все (ответ В5: привязки к области пока нет), проверка — на сервере, а не в
// интерфейсе. В макете — общее сохранение (kernel/persist.js) с автором и
// временем, поставленными на клиенте.
registerPersisted('inspections.assignments', {
  snapshot: () => assignments,
  restore: (saved) => {
    if (!Array.isArray(saved)) return;
    assignments.splice(0, assignments.length, ...saved.filter((x) => x && x.id));
  },
});
registerPersisted('inspections.events', {
  snapshot: () => events,
  restore: (saved) => {
    if (!Array.isArray(saved)) return;
    events.splice(0, events.length, ...saved.filter((x) => x && x.id));
  },
});

// Счёт id от времени, а не с нуля: две вкладки, создавшие назначение в одну
// сессию, не должны выдать одинаковые id (тот же приём, что в контактах).
let seq = Date.now();
const nextId = (p) => `${p}-${(++seq).toString(36)}`;
const now = () => new Date().toISOString();

// --- журнал ------------------------------------------------------------------

// Событие осмотра: кто, когда, что, по какому объекту. Из журнала строятся
// история и статистика осмотрщика — отдельного итога, который правится
// руками, нет (практика opyt-prilozheniya-osmotr-dlya-paneli-osmotrov).
export function logEvent(kind, a, extra = {}) {
  const ev = {
    id: nextId('ev'),
    at: now(),
    who: session.state.person,
    kind,
    assignId: a ? a.id : '',
    typeId: a ? a.typeId : extra.typeId || '',
    ocId: a ? a.ocId : extra.ocId || '',
    person: a ? a.person : extra.person || '',
    ...extra,
  };
  events.push(ev);
  return ev;
}

export function eventsOf({ person = '', typeId = '', ocId = '' } = {}) {
  return (testDataOn() ? events : events.filter((e) => !e.demo)).filter((e) => (!person || e.person === person)
    && (!typeId || e.typeId === typeId) && (!ocId || e.ocId === ocId));
}

// --- выборки -----------------------------------------------------------------

export const allAssignments = () => visA();
export const assignmentById = (id) => assignments.find((a) => a.id === id) || null;

export function assignmentsOf(typeId, ocId, { live = true } = {}) {
  return visA().filter((a) => a.typeId === typeId && a.ocId === ocId && (!live || isLive(a)));
}
// Досрочный осмотр (kernel/earlyInspection.js) берёт живые назначения объекта отсюда — регистрацией, без круга импортов.
setEarlyAssigns((typeId, ocId) => assignmentsOf(typeId, ocId).map((a) => ({ person: a.person, state: a.state, plannedAt: a.plannedAt || '',
  label: (ASSIGN_STATES.find((x) => x.key === a.state) || {}).label || a.state })));

export function assignmentsOfPerson(person, { live = true } = {}) {
  return visA().filter((a) => a.person === person && (!live || isLive(a)));
}

// Назначение покрывает ОИ, если оно на объект целиком (oiIds пуст) или ОИ в
// его перечне.
export const coversOi = (a, oiId) => !a.oiIds || !a.oiIds.length || a.oiIds.includes(oiId);

// --- запись в объект оценки ----------------------------------------------------

function recordsOf(typeId) {
  const t = getType(typeId);
  return t ? t.records : null;
}

// resp.insp — осмотрщик последнего не снятого назначения (действующего или
// законченного) или пусто: законченный осмотр осмотрщика из карточки не
// убирает. Пишем, только если поменялось: assignResponsible двигает дату
// обновления записи, и пустой пересчёт не должен её трогать.
// Статус ОЦ по шкале — от осмотра (решение пользователя 06.11.2026 «Шаг — по приёмке ЦОД»,
// «Сам список не меняем»): первое назначение — «Направлен на осмотр»; сняты все назначения —
// снова «Удостоверен по документам»; приёмка ЦОД — «Осмотрен» (results.js); возврат ОИ на
// доосмотр — назад к «Направлен на осмотр». Статус двигается только с этих шагов: объект,
// который уже дальше по шкале или ещё не удостоверен, не трогается.
export const READY_STATUS = 'Удостоверен по документам';
export const SENT_STATUS = 'Направлен на осмотр';
export const DONE_STATUS = 'Осмотрен';
// Досрочно направленный объект (kernel/earlyInspection.js): статус не двигается ни назначением, ни снятием —
// пользователь 23.11.2026: «Статус при этом не переводится… Ставится флаг».
const earlySent = (rec) => { const e = earlyOf(rec); return !!e && e.state === 'sent'; };
function moveStatus(recs, rec, ocId, from, to) {
  if (!from.includes(rec.status) || earlySent(rec)) return;
  recs.setStatus(ocId, to);
}

function syncResp(typeId, ocId) {
  const recs = recordsOf(typeId);
  if (!recs) return;
  const rec = recs.loadRecord(ocId);
  if (!rec) return;
  // Демо-назначения запись не трогают (kernel/inspectionsDemo.js).
  const live = assignmentsOf(typeId, ocId, { live: false }).filter((a) => !a.demo && a.state !== 'removed').sort((x, y) => String(x.at).localeCompare(String(y.at)));
  if (live.length) moveStatus(recs, rec, ocId, [READY_STATUS], SENT_STATUS);
  else moveStatus(recs, rec, ocId, [SENT_STATUS], READY_STATUS);
  const person = live.length ? live[live.length - 1].person : '';
  if (((rec.resp || {}).insp || '') === person) return;
  recs.assignResponsible(ocId, 'insp', person);
}

// Возврат на доосмотр: принятый осмотр («Осмотрен») снова «Направлен на осмотр». С этапов оценки
// («Удостоверен после осмотра», «Готов к оценке», «В процессе оценки») статус ОЦ не меняется — возврат
// только у назначения и ОИ (пользователь 06.11.2026: «Откатывать только с «Осмотрен»»).
const REOPEN_FROM = [DONE_STATUS];
function reopenStatus(typeId, ocId) {
  const recs = recordsOf(typeId);
  const rec = recs && recs.loadRecord(ocId);
  if (rec) moveStatus(recs, rec, ocId, REOPEN_FROM, SENT_STATUS);
}

export function changed() {
  scheduleSave();
  window.dispatchEvent(new CustomEvent('inside:inspections'));
}

// --- действия ----------------------------------------------------------------

// Назначить. oiIds пуст — объект целиком. Повторное назначение того же
// человека на тот же объект с тем же перечнем ОИ не плодит дубль, а
// обновляет действующее.
// docs не передан — документы по умолчанию (defaultDocIds). prevId — правка
// действующего назначения: тот же человек — меняется на месте, другой —
// прежнее снимается, новое заводится (история у обоих остаётся).
// invParts — часть описи у этого назначения: { id описи: { by, values } } (kernel/inventories.js,
// PART_KINDS); нет — вся опись.
export function assign({ typeId, ocId, person, oiIds = [], docs, inventories = [], plannedAt = '', note = '', prevId = '', invParts = {} }) {
  if (!typeId || !ocId || !person) return null;
  if (!Array.isArray(docs)) docs = defaultDocIds(typeId, ocId);
  const prev = prevId ? assignmentById(prevId) : null;
  if (prev && isLive(prev) && prev.person !== person) setAssignState(prev.id, 'removed');
  const sameOi = (a) => String([...(a.oiIds || [])].sort()) === String([...oiIds].sort());
  let a = prev && isLive(prev) && prev.person === person ? prev
    : assignments.find((x) => isLive(x) && x.typeId === typeId && x.ocId === ocId && x.person === person && sameOi(x));
  if (a) {
    // «Было → стало» (решение пользователя 05.11.2026 на вопрос «Автор и «было → стало» в истории назначений»).
    const diff = changesOf(a, { oiIds, docs, inventories, plannedAt, note });
    Object.assign(a, { oiIds: [...oiIds], docs: [...docs], inventories: [...inventories], invParts: { ...invParts }, plannedAt, note, updatedAt: now() });
    logEvent('updated', a, diff ? { text: diff } : {});
  } else {
    a = {
      id: nextId('as'),
      typeId, ocId, person,
      oiIds: [...oiIds],
      docs: [...docs],
      inventories: [...inventories],
      invParts: { ...invParts },
      plannedAt,
      note,
      by: session.state.person,
      at: now(),
      state: 'assigned',
      doneAt: '',
    };
    // Назначение по досрочному направлению — пометкой: по ней приёмка ЦОД ставит «Осмотр проведён досрочно».
    const recs = recordsOf(typeId);
    if (recs && earlySent(recs.loadRecord(ocId))) a.early = true;
    assignments.push(a);
    logEvent('assigned', a);
  }
  syncResp(typeId, ocId);
  changed();
  return a;
}

// extra — сведения к переходу: { incomplete } у «Осмотр закончен» (осмотр
// завершён при незаполненном — ответ пользователя 30.10.2026 «Предупреждать,
// разрешать»; пометку видят регионал и ЦОД).
export function setAssignState(id, state, extra = {}) {
  const a = assignmentById(id);
  if (!a || a.state === state || !ASSIGN_STATES.some((s) => s.key === state)) return a;
  const was = a.state;
  a.state = state;
  // Сдано с причиной (аудит 17.11.2026: «Сдаем с причиной. Варианты из выпадающего поля и возможность указать
  // свой вариант текстом») — причина неполного осмотра видна регионалу и ЦОД.
  if (state === 'done') { a.doneAt = now(); a.incomplete = !!extra.incomplete; a.incompleteReason = extra.incomplete ? extra.reason || '' : ''; }
  if (was === 'done' && state !== 'done') { a.doneAt = ''; a.incomplete = false; a.incompleteReason = ''; }
  if (state === 'removed') a.removedAt = now();
  logEvent(state, a, extra.incomplete ? { text: 'неполный осмотр' + (extra.reason ? ': ' + extra.reason : '') } : {});
  syncResp(a.typeId, a.ocId);
  changed();
  return a;
}

export const unassign = (id) => setAssignState(id, 'removed');

// Возврат ОИ на доосмотр ЦОД (ответ пользователя 02.11.2026 «По ОИ, а не
// целиком»): законченное назначение, покрывающее ОИ, снова «В работе» у того
// же осмотрщика; в назначении — какие ОИ и почему возвращены, в журнале —
// событие «returned» с причиной (его видит регионал в «Назначено» и «Истории»).
// Принятые ОИ того же назначения остаются принятыми — решение по ОИ хранится
// в результатах осмотра (inspectionResults.js, reviewOf).
export function returnOis(typeId, ocId, oiIds, reason) {
  const text = String(reason || '').trim();
  if (!text) throw new Error('Причина возврата обязательна');
  const hit = assignmentsOf(typeId, ocId, { live: false })
    .filter((a) => a.state === 'done' && oiIds.some((id) => coversOi(a, id)));
  hit.forEach((a) => {
    const ids = oiIds.filter((id) => coversOi(a, id));
    a.returned = [...(a.returned || []), { oiIds: ids, reason: text, by: session.state.person, at: now() }];
    // Напрямую, а не setAssignState: тот пишет «начал осмотр», а здесь — возврат.
    a.state = 'progress';
    a.doneAt = '';
    a.incomplete = false;
    logEvent('returned', a, { text, oiIds: ids });
    syncResp(a.typeId, a.ocId);
  });
  if (hit.length) reopenStatus(typeId, ocId);
  changed();
  return hit;
}

// Ход осмотра — по назначению, а не по объекту (ответ пользователя
// 30.10.2026 «Каждый свою часть»): у объекта бывает несколько осмотрщиков на
// разные ОИ, и отметка одного не должна закрывать осмотр другого.
// Свои назначения осмотрщика на объект — действующие и законченные.
export const myAssignsOn = (person, typeId, ocId) =>
  assignmentsOf(typeId, ocId, { live: false }).filter((a) => a.person === person && a.state !== 'removed');

// Первый ввод осмотрщика: «Назначено» → «В работе» (событие для истории,
// статистики и «не начат N дн.»).
export function startWork(person, typeId, ocId) {
  myAssignsOn(person, typeId, ocId).filter((a) => a.state === 'assigned').forEach((a) => setAssignState(a.id, 'progress'));
}

// «Осмотр завершён» и снятие отметки. Объект закончен, когда закончены все
// его назначения.
export function finishWork(person, typeId, ocId, done, { incomplete = false, reason = '' } = {}) {
  const mine = myAssignsOn(person, typeId, ocId);
  mine.forEach((a) => setAssignState(a.id, done ? 'done' : 'progress', done ? { incomplete, reason } : {}));
  return mine.length;
}

// Объекты, осмотр которых закончен: есть не снятые назначения и все
// закончены — «тип|id» (срез ЦОД «Осмотр закончен — проверить»).
// «Мои осмотры» (решение пользователя 06.11.2026 «Только назначения»): объекты, на которые у
// человека есть действующее назначение регионала, — ключи «тип|запись». Одно число везде:
// срез «Мне осмотреть», задачи осмотрщика, приложение «Осмотр».
// У кого опись уже в действующих назначениях (регионалу: «опись уже у такого-то»).
export function inventoryHolders(invId, exceptId = '') {
  return visA().filter((a) => isLive(a) && a.id !== exceptId && (a.inventories || []).includes(invId))
    .map((a) => ({ person: a.person, part: (a.invParts || {})[invId] || null, assignId: a.id }));
}

export function liveObjectsOf(person) {
  return new Set(visA().filter((a) => a.person === person && isLive(a)).map((a) => a.typeId + '|' + a.ocId));
}

export function finishedObjects() {
  const by = new Map();
  visA().forEach((a) => {
    if (a.state === 'removed') return;
    const k = a.typeId + '|' + a.ocId;
    by.set(k, (by.get(k) !== false) && a.state === 'done');
  });
  return new Set([...by].filter(([, done]) => done).map(([k]) => k));
}

// Закончен ли осмотр осмотрщика по объекту: есть свои назначения и все
// закончены. null — назначений нет (объект осмотрщика по карточке).
export function workDone(person, typeId, ocId) {
  const mine = myAssignsOn(person, typeId, ocId);
  return mine.length ? mine.every((a) => a.state === 'done') : null;
}

// Переназначить другому: прежнее снимается, новое заводится с тем же
// составом — история у обоих остаётся.
export function reassign(id, person) {
  const a = assignmentById(id);
  if (!a || !person || a.person === person) return a;
  const was = a.person;
  setAssignState(id, 'removed');
  const off = events.filter((e) => e.assignId === id && e.kind === 'removed').pop();
  if (off) off.text = `переназначено: ${was} → ${person}`;
  const b = assign({ ...a, person });
  const on = b && events.filter((e) => e.assignId === b.id && e.kind === 'assigned').pop();
  if (on) on.text = `переназначено: ${was} → ${person}`;
  return b;
}

// Что поменялось в назначении — словами: «дата 05.11.2026 → 07.11.2026; ОИ 1 → 2; документов 3 → 2; комментарий».
const dmy = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('.') : 'без даты');
function changesOf(a, next) {
  const out = [];
  if ((a.plannedAt || '') !== (next.plannedAt || '')) out.push(`дата ${dmy(a.plannedAt)} → ${dmy(next.plannedAt)}`);
  const n = (x) => (x || []).length;
  const same = (x, y) => String([...(x || [])].sort()) === String([...(y || [])].sort());
  if (!same(a.oiIds, next.oiIds)) out.push(`ОИ ${n(a.oiIds) || 'весь объект'} → ${n(next.oiIds) || 'весь объект'}`);
  if (!same(a.docs, next.docs)) out.push(`документов ${n(a.docs)} → ${n(next.docs)}`);
  if (!same(a.inventories, next.inventories)) out.push(`описей ${n(a.inventories)} → ${n(next.inventories)}`);
  if ((a.note || '') !== (next.note || '')) out.push('комментарий осмотрщику');
  return out.join('; ');
}

// Передать один ОИ назначения другому осмотрщику (заметка пользователя
// 27.10.2026 «ТС может быть переназначен отдельно от ОЦ другому осмотрщику»;
// запись графа osmotr-ts-na-meste-i-po-snimkam). У прежнего остаются прочие
// ОИ: назначение «объект целиком» становится явным перечнем остальных ОИ
// записи. Новому — назначение на этот ОИ с той же плановой датой, документами
// и комментарием. Единственный ОИ назначения — обычное переназначение.
// Возвращает новое назначение или null.
export function transferOi(id, oiId, person) {
  const a = assignmentById(id);
  if (!a || !isLive(a) || !oiId || !person || a.person === person || !coversOi(a, oiId)) return null;
  const recs = recordsOf(a.typeId);
  const rec = recs && recs.loadRecord(a.ocId);
  const all = a.oiIds && a.oiIds.length ? a.oiIds : ((rec && rec.oi) || []).map((o) => o.id);
  const rest = all.filter((x) => x !== oiId);
  if (!rest.length) return reassign(id, person);
  a.oiIds = rest;
  a.updatedAt = now();
  logEvent('transferred', a, { oiId, to: person, text: `кому: ${person}` });
  const b = assign({ typeId: a.typeId, ocId: a.ocId, person, oiIds: [oiId], docs: [...(a.docs || [])],
    inventories: [...(a.inventories || [])], plannedAt: a.plannedAt || '', note: a.note || '' });
  if (b) logEvent('received', b, { oiId, from: a.person, text: `от: ${a.person}` });
  return b;
}

// Назначение из реестра («Назначить осмотрщика» у ЦОД): объект целиком,
// документы — по умолчанию.
export function assignFromRegistry(typeId, ocId, person) {
  return assign({ typeId, ocId, person });
}

// id документов записи и её ОИ, отмеченных по умолчанию. Документы берутся
// из записи как есть: rec.docs и oi.docs — массивы { id, type, name, … }.
export function defaultDocIds(typeId, ocId) {
  const recs = recordsOf(typeId);
  const rec = recs && recs.loadRecord(ocId);
  if (!rec) return [];
  const all = [...(rec.docs || []), ...(rec.oi || []).flatMap((o) => o.docs || [])];
  return all.filter((d) => d && isDefaultDoc(d.type || d.name)).map((d) => d.id);
}

// --- задачи осмотрщика ---------------------------------------------------------

// Задачи человека — по объекту, а не по назначению: назначений на один
// объект бывает несколько (по ОИ), а едет осмотрщик на объект. В задаче —
// все его действующие назначения по объекту (assigns), ближайшее из них
// (assign) и назначенные ОИ (oiIds; пусто — объект целиком). Плюс записи,
// где он стоит в resp.insp без назначения (назначенные до появления
// назначений).
export function tasksOf(person) {
  const byObj = new Map();
  // Законченные назначения остаются в задачах осмотрщика — с пометкой
  // «осмотр завершён» и возможностью снять отметку.
  assignmentsOfPerson(person, { live: false }).filter((a) => a.state !== 'removed').forEach((a) => {
    const k = a.typeId + '|' + a.ocId;
    if (!byObj.has(k)) byObj.set(k, { typeId: a.typeId, ocId: a.ocId, assigns: [] });
    byObj.get(k).assigns.push(a);
  });
  const out = [...byObj.values()].map((t) => {
    // Действующее — первым: по нему план и «ждёт осмотра».
    const sorted = t.assigns.slice().sort((x, y) => (isLive(y) - isLive(x)) || String(x.plannedAt || '9999').localeCompare(String(y.plannedAt || '9999')));
    const whole = t.assigns.some((a) => !a.oiIds || !a.oiIds.length);
    return { ...t, assign: sorted[0], oiIds: whole ? [] : [...new Set(t.assigns.flatMap((a) => a.oiIds))] };
  });
  // Объекты «по карточке» (поле «Осмотрщик» без назначения) задачами больше не считаются:
  // «мои осмотры» — только назначения регионала (решение пользователя 06.11.2026).
  return out;
}

// --- профили осмотрщиков: справочник, контакты, области, график, отсутствия ---
//
// Решение пользователя 12.10.2026 (запись графа
// upravlenie-osmotrschikami-instrumenty): «полноценный профиль осмотрщика.
// Где не только его контакты, но и регионы, рабочий график, план выходных и
// отпусков. С какого числа работает»; «Переписка ведётся в WhatsApp. Стоит
// добавить ссылку на номер». Справочника сотрудников в макете нет, поэтому
// профиль живёт здесь, по ФИО; это и есть справочник осмотрщиков: люди из
// профилей плюс люди из назначений и записей. Контакты в демо не выдумываются
// — у осмотрщиков реальные фамилии; поля пустые, пока их не внесут.
//
// Область, если её не указали, выводится из объектов, которые человек
// осматривал или должен осмотреть (по коду ЕНИ, eniRegion).
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: профиль — учётная запись сотрудника в справочнике
// «Пользователи» (контакты, роль, области, график); отсутствия — из кадрового
// учёта или вносятся менеджером; здесь он заменится ссылкой на учётную
// запись. Развилка — кто ведёт отпуска: кадры (выгрузка) или менеджер (ввод).

const profiles = demo.profiles || [];
registerPersisted('inspections.people', {
  snapshot: () => profiles,
  restore: (saved) => {
    if (!Array.isArray(saved)) return;
    profiles.splice(0, profiles.length, ...saved.filter((x) => x && x.id));
  },
});

export const absenceLabel = (k) => (ABSENCE_KINDS.find((x) => x.key === k) || {}).label || k;

// Рабочие дни недели: 1 — пн … 7 — вс (как в ISO, чтобы не путать с getDay()).
export const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const isoWeekday = (iso) => { const d = new Date(iso + 'T00:00:00').getDay(); return d === 0 ? 7 : d; };

// Поля профиля по ТЗ рабочего дня осмотрщика (запись графа
// tz-rabota-osmotrschika, разделы 1–2): личное и жильё, доверенность, группа
// WhatsApp области, тип телефона, доступ в кадастр, авто (одно — ответ
// пользователя 12.10.2026), свои поля (custom: { id поля → значение }).
export function blankProfile(name) {
  return {
    id: name, phone: '', whatsapp: '', email: '', device: '', phoneType: '', note: '',
    regions: [], startDate: '', fired: false, firedDate: '',
    // manager — ответственное лицо: региональный менеджер, за которым
    // закреплён осмотрщик (указание пользователя 12.10.2026).
    manager: '',
    birthDate: '', homeAddress: '', homeGps: '', tempAddress: '', tempGps: '', tempFrom: '', tempTo: '',
    poaNumber: '', poaUntil: '', waGroup: '', cadastre: false,
    schedule: { days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' },
    absences: [],
    car: { make: '', year: '', engine: '', consumption: '', plate: '', fuel: '', note: '' },
    custom: {},
  };
}

export function profileOf(name) {
  const p = profiles.find((x) => x.id === name);
  // Поля, добавленные позже, — со значениями по умолчанию: старый профиль
  // (только телефон и почта) не ломает график и отсутствия.
  const b = blankProfile(name);
  return p ? { ...b, ...p, schedule: { ...b.schedule, ...(p.schedule || {}) }, absences: p.absences || [],
    car: { ...b.car, ...(p.car || {}) }, custom: { ...(p.custom || {}) } } : b;
}

export function saveProfile(name, patch) {
  let p = profiles.find((x) => x.id === name);
  if (!p) { p = blankProfile(name); profiles.push(p); }
  const wasFired = !!p.fired;
  Object.assign(p, patch, { updatedAt: now(), updatedBy: session.state.person });
  if (p.fired && !wasFired) releaseFired(name, p.firedDate);
  changed();
  return p;
}

// Увольнение (решение пользователя 05.11.2026 «Вернуть в «К назначению»»): незаконченные назначения
// снимаются — объекты возвращаются в очередь; сделанное (снимки, значения) остаётся в результатах.
// Дата увольнения в будущем — снимаются только выезды с этого дня и без даты.
function releaseFired(name, firedDate) {
  const from = firedDate && firedDate > localIso(new Date()) ? firedDate : '';
  visA().filter((a) => a.person === name && isLive(a) && (!from || !a.plannedAt || a.plannedAt >= from)).forEach((a) => {
    a.state = 'removed';
    a.removedAt = now();
    logEvent('removed', a, { text: 'осмотрщик уволен — объект возвращён к назначению' });
    syncResp(a.typeId, a.ocId);
  });
}

export function addAbsence(name, { kind, from, to, note = '' }) {
  if (!from) return null;
  const p = profileOf(name);
  const item = { id: nextId('ab'), kind: kind || 'vacation', from, to: to && to >= from ? to : from, note };
  saveProfile(name, { absences: [...p.absences, item].sort((a, b) => a.from.localeCompare(b.from)) });
  return item;
}

export function removeAbsence(name, id) {
  const p = profileOf(name);
  saveProfile(name, { absences: p.absences.filter((a) => a.id !== id) });
}

// Отсутствие на день или null.
export function absenceOn(name, iso) {
  return profileOf(name).absences.find((a) => a.from <= iso && iso <= (a.to || a.from)) || null;
}

// Работает ли человек в этот день: в штате с даты начала, не уволен к этому
// дню, день — рабочий по графику, отсутствия нет. reason — почему нет.
export function workdayOf(name, iso) {
  const p = profileOf(name);
  if (p.startDate && iso < p.startDate) return { ok: false, reason: `работает с ${p.startDate.split('-').reverse().join('.')}` };
  if (p.fired && (!p.firedDate || iso >= p.firedDate)) return { ok: false, reason: 'уволен' };
  const ab = absenceOn(name, iso);
  if (ab) return { ok: false, reason: absenceLabel(ab.kind).toLowerCase(), absence: ab };
  if (!p.schedule.days.includes(isoWeekday(iso))) return { ok: false, reason: 'выходной по графику' };
  return { ok: true, reason: '' };
}

// Нерабочий по графику — без учёта отсутствия: выходной остаётся выходным и в день отпуска или больничного.
export function offBySchedule(name, iso) {
  const p = profileOf(name);
  return !p.schedule.days.includes(isoWeekday(iso));
}

// Следующий рабочий день осмотрщика после from: по графику и отсутствиям (workdayOf).
const plusDay = (iso, n = 1) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export function nextWorkday(person, from) {
  for (let i = 1; i <= 60; i++) { const d = plusDay(from, i); if (workdayOf(person, d).ok) return d; }
  return plusDay(from, 1);
}

// Осмотрено частично — выезд целиком на следующий рабочий день осмотрщика, без подтверждения регионала; регионалу —
// уведомление «Остаток перенесён» (пользователь 17.11.2026: «Если осмотрено частично, переносим на следующий рабочий
// день остатки»; ответы: к отчёту дня и к «неполному» — «К обоим», «Сами, регионалу — уведомление», «Весь выезд»).
// Заполненное и снятое остаётся; назначение — в работе. Возвращает новую дату.
// failed — «Осмотр не состоялся» без даты переноса (аудит 17.11.2026: «Сам на след. рабочий день»; регионалу —
// уведомление с причиной). Перенос — не в прошлое: отчёт за прошедший день, сданный позже, переносит не раньше
// сегодняшнего рабочего дня (находка аудита 17.11.2026).
export function carryOver(person, typeId, ocId, { reason = '', from = '', failed = false } = {}) {
  const d0 = new Date();
  const realToday = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-${String(d0.getDate()).padStart(2, '0')}`;
  const today = from || realToday;
  let to = nextWorkday(person, today);
  if (to < realToday) to = workdayOf(person, realToday).ok ? realToday : nextWorkday(person, realToday);
  myAssignsOn(person, typeId, ocId).filter(isLive).forEach((a) => {
    const was = a.plannedAt || '';
    a.plannedAt = to;
    if (a.state === 'done') setAssignState(a.id, 'progress');
    a.updatedAt = now();
    logEvent('carried', a, { date: to, was, failed, text: `${failed ? 'осмотр не состоялся' : 'осмотрено частично'}${reason ? ': ' + reason : ''} — ${was || 'без даты'} → ${to}` });
  });
  changed();
  return to;
}

// Причины «Сдать с причиной» — перечень правит регионал («Люди» → «Настройки»). Начальные — из перечня исходов
// приложения «Осмотр» (Estate.OUTCOMES), без выдуманных; «Свой вариант» — всегда.
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: перечень — справочник организации на сервере (общий для регионалов и осмотрщиков);
// сейчас — в браузере рабочего места.
const HAND_KEY = 'inside.osmotr.handReasons';
export const HAND_REASONS_DEFAULT = ['Нет доступа', 'Объект закрыт', 'Не на месте'];
export function handReasons() {
  try {
    const v = JSON.parse(localStorage.getItem(HAND_KEY) || 'null');
    return Array.isArray(v) ? v : HAND_REASONS_DEFAULT.slice();
  } catch (e) { return HAND_REASONS_DEFAULT.slice(); }
}
export function setHandReasons(list) {
  try { localStorage.setItem(HAND_KEY, JSON.stringify([...new Set(list.map((x) => String(x).trim()).filter(Boolean))])); } catch (e) { /* без памяти браузера */ }
  changed();
}

// Ссылка на чат WhatsApp: номер — WhatsApp, иначе телефон; цифры с кодом
// страны (wa.me не принимает «+», пробелы и скобки).
export function whatsappLink(name) {
  const p = profileOf(name);
  const digits = String(p.whatsapp || p.phone || '').replace(/\D/g, '');
  return digits.length >= 9 ? `https://wa.me/${digits}` : '';
}

// Справочник: все известные осмотрщики — из профилей и из данных.
export function profileNames() {
  return profiles.map((p) => p.id);
}

// Области человека: указанные в профиле, иначе — по его объектам (чаще
// встречающиеся первыми). derived — признак, что выведены, а не указаны.
export function regionsOf(name, summaryEni) {
  const p = profileOf(name);
  // Объекты осмотрщика по областям — за всё время назначений; в профиле
  // область показывается с этим числом (выбор строкой с числом).
  const objs = new Map();
  visA().forEach((a) => {
    if (a.person !== name) return;
    const r = eniRegion(summaryEni(a.typeId, a.ocId));
    if (!r) return;
    if (!objs.has(r)) objs.set(r, new Set());
    objs.get(r).add(a.typeId + '|' + a.ocId);
  });
  const byRegion = Object.fromEntries([...objs.entries()].map(([r, set]) => [r, set.size]));
  if (p.regions && p.regions.length) return { regions: p.regions, derived: false, byRegion };
  return { regions: Object.keys(byRegion).sort((x, y) => byRegion[y] - byRegion[x]), derived: true, byRegion };
}

// --- сроки осмотра объектов ---------------------------------------------------
//
// Крайний срок осмотра объекта ставит региональный менеджер (ответ
// пользователя 12.10.2026 «Ставит менеджер»): у объекта в очереди, можно
// сразу для нескольких. По сроку — «горящие сверху».
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: срок — поле объекта оценки (или задания на осмотр)
// с автором и временем сервера; развилка — один срок на объект или по ОИ.
const deadlines = demo.deadlines || [];
registerPersisted('inspections.deadlines', {
  snapshot: () => deadlines,
  restore: (saved) => {
    if (!Array.isArray(saved)) return;
    deadlines.splice(0, deadlines.length, ...saved.filter((x) => x && x.id));
  },
});

export function deadlineOf(typeId, ocId) {
  const d = deadlines.find((x) => x.id === typeId + '|' + ocId);
  return d ? d.date : '';
}

// keys — «typeId|ocId»; date пуста — срок снимается.
export function setDeadline(keys, date) {
  keys.forEach((k) => {
    const i = deadlines.findIndex((x) => x.id === k);
    if (!date) { if (i >= 0) deadlines.splice(i, 1); return; }
    const item = { id: k, date, by: session.state.person, at: now() };
    if (i >= 0) deadlines[i] = item; else deadlines.push(item);
  });
  changed();
}

// --- массовые действия над назначениями ---------------------------------------

// Переназначить другому: у каждого прежнее снимается, новое заводится с тем
// же составом (история у обоих остаётся). Нужно при болезни, отпуске,
// увольнении (решение 12.10.2026, раздел «Планирование»).
export function reassignMany(ids, person) {
  return ids.map((id) => reassign(id, person)).filter(Boolean);
}

export function moveDateMany(ids, plannedAt) {
  ids.forEach((id) => {
    const a = assignmentById(id);
    if (!a || !isLive(a) || a.plannedAt === plannedAt) return;
    const was = a.plannedAt;
    a.plannedAt = plannedAt;
    a.updatedAt = now();
    logEvent('moved', a, { text: `${dmy(was)} → ${dmy(plannedAt)}` });
  });
  changed();
}

// --- осмотрщик сам меняет свой день -------------------------------------------
//
// Решения пользователя 14.10.2026 (запись графа
// ekran-osmotrschika-pererabotat-ergonomika): осмотрщик сам выбирает, что
// делать сегодня, из назначенного ему; несделанное берёт на сегодня «сразу»;
// запросов на согласование нет, «но если не совпало с планом — отчет
// регионалу», «на отмененное». Взятое не по плану и снятое с дня регионал
// видит в уведомлениях (pages/inspections/notify.js), причина снятия
// обязательна.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: отчёт о снятии — тем же каналом, что остальные
// уведомления регионала (панель, WhatsApp или почта — развилка ТЗ 8.3);
// права — осмотрщик меняет только свои назначения.

export function takeForDay(id, date) {
  const a = assignmentById(id);
  if (!a || !isLive(a) || !date || a.plannedAt === date) return a;
  const was = a.plannedAt || '';
  a.plannedAt = date;
  a.updatedAt = now();
  logEvent('taken', a, { date, was, text: `${was || 'без даты'} → ${date}` });
  changed();
  return a;
}

// Снятый с дня выезд остаётся назначенным, но без даты: следующую ставит
// регионал или берёт сам осмотрщик. Снятие хранится у назначения (skips).
export function skipDay(id, date, reason, note = '') {
  const a = assignmentById(id);
  if (!a || !isLive(a) || !reason) return a;
  a.skips = [...(a.skips || []), { date, reason, note, at: now() }];
  a.plannedAt = '';
  a.updatedAt = now();
  logEvent('skipped', a, { date, reason, note, text: reason + (note ? ` — ${note}` : '') });
  changed();
  return a;
}

// Перенос выезда осмотрщиком — с подтверждением регионала (решения пользователя 06.11.2026: «Причина
// «Объект закрыт», Регионал должен подтвердить перенос»; «Остаётся на старой дате + «запрошен перенос»»).
// Пока регионал не ответил, выезд стоит на прежней дате с запросом (a.moveReq: желаемая дата, причина);
// разрешил — дата меняется; отклонил — запрос снимается с причиной отказа; не ответил до конца дня —
// выезд пропущен (уведомление «Пропущен выезд» считает, как прежде, по плановой дате).
export function requestMove(id, { date, reason, note = '' }) {
  const a = assignmentById(id);
  if (!a || !isLive(a) || !date || !reason) return null;
  a.moveReq = { date, reason, note, from: a.plannedAt || '', by: session.state.person, at: now() };
  a.updatedAt = now();
  logEvent('moveRequested', a, { date, text: `${a.plannedAt || 'без даты'} → ${date}: ${reason}${note ? ` — ${note}` : ''}` });
  changed();
  return a;
}
export function decideMove(id, ok, why = '') {
  const a = assignmentById(id);
  if (!a || !a.moveReq) return null;
  const r = a.moveReq;
  delete a.moveReq;
  if (ok) {
    a.plannedAt = r.date;
    logEvent('moveAllowed', a, { date: r.date, text: `${r.from || 'без даты'} → ${r.date}` });
  } else {
    a.moveRefused = { ...r, why, decidedBy: session.state.person, decidedAt: now() };
    logEvent('moveRefused', a, { date: r.from, text: `${r.date}: ${why || 'без причины'}` });
  }
  a.updatedAt = now();
  changed();
  return a;
}
export const moveRequests = () => visA().filter((a) => isLive(a) && a.moveReq);

// Вернуть снятое с дня (указание пользователя 14.10.2026: «Снятое тоже
// должна быть возможность заново назначить»): снятие отменяется — дата
// возвращается, запись о снятии убирается, отчёт регионалу о нём
// больше не показывается (событие unskipped).
export function unskipDay(id, date) {
  const a = assignmentById(id);
  if (!a || !isLive(a)) return a;
  const i = (a.skips || []).map((x) => x.date).lastIndexOf(date);
  if (i < 0) return a;
  a.skips = a.skips.filter((x, k) => k !== i);
  a.plannedAt = date;
  a.updatedAt = now();
  logEvent('unskipped', a, { date });
  changed();
  return a;
}

// Возвращает прежние состояния — для «Отменить» сразу после снятия (restoreMany).
export function unassignMany(ids) {
  const was = ids.map((id) => [id, (assignmentById(id) || {}).state]).filter(([, s]) => s && s !== 'removed');
  ids.forEach((id) => setAssignState(id, 'removed'));
  return was;
}

// Отмена массового снятия: назначения возвращаются в прежнее состояние, в истории — «снятие отменено».
export function restoreMany(was) {
  (was || []).forEach(([id, state]) => {
    const a = assignmentById(id);
    if (!a || a.state !== 'removed') return;
    a.state = state;
    delete a.removedAt;
    logEvent('restored', a);
    syncResp(a.typeId, a.ocId);
  });
  changed();
}

// «Зависло»: назначено давно, а осмотр не начат (нет событий осмотрщика), или
// начат и не закончен долго. Пороги — рабочая неделя и две; на сервере —
// настройка (ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: пороги — в настройках региона).
export const STALL_DAYS = { notStarted: 5, notFinished: 10 };
export function stallOf(a) {
  if (!isLive(a)) return '';
  // Выезд на будущий день ещё не может зависнуть: «не начат 6 дн.» у
  // назначения на следующую неделю — шум (уведомления, раздел 8 ТЗ рабочего
  // дня осмотрщика, 12.10.2026).
  const t = new Date();
  const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  if (a.plannedAt && a.plannedAt > today) return '';
  const age = (Date.now() - new Date(a.at).getTime()) / 864e5;
  const own = events.some((e) => e.assignId === a.id && ['photos', 'note', 'progress', 'mismatch', 'found'].includes(e.kind));
  if (!own && age >= STALL_DAYS.notStarted) return `не начат ${Math.floor(age)} дн.`;
  if (own && age >= STALL_DAYS.notFinished) return `не закончен ${Math.floor(age)} дн.`;
  return '';
}

// --- свои поля осмотрщиков ------------------------------------------------------
//
// ТЗ 1.2: менеджер заводит поле сам — «формат может меняться». Поле
// появляется у всех осмотрщиков в профиле и в табличном виде.
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: описание полей — справочник с правами на правку
// (кто может заводить поля: администратор или любой менеджер).
export const FIELD_KINDS = [
  { key: 'text', label: 'Текст' },
  { key: 'number', label: 'Число' },
  { key: 'date', label: 'Дата' },
  { key: 'bool', label: 'Да / нет' },
  { key: 'list', label: 'Выбор из списка' },
];
const customFields = [];
registerPersisted('inspections.fields', {
  snapshot: () => customFields,
  restore: (saved) => {
    if (!Array.isArray(saved)) return;
    customFields.splice(0, customFields.length, ...saved.filter((x) => x && x.id));
  },
});
export const allCustomFields = () => customFields;
// required — обязательное: без значения профиль не сохраняется (ТЗ 1.2).
export function addCustomField({ label, kind = 'text', options = [], required = false }) {
  if (!label || !label.trim()) return null;
  const f = { id: nextId('cf'), label: label.trim(), kind, options: kind === 'list' ? options.filter(Boolean) : [], required: !!required && kind !== 'bool', at: now(), by: session.state.person };
  customFields.push(f);
  changed();
  return f;
}
export function removeCustomField(id) {
  const i = customFields.findIndex((f) => f.id === id);
  if (i >= 0) { customFields.splice(i, 1); changed(); }
}

// Доверенность: дней до окончания (отрицательно — истекла) или null.
export function poaDaysLeft(name) {
  const u = profileOf(name).poaUntil;
  if (!u) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((new Date(u + 'T00:00:00') - t) / 864e5);
}

// --- отчёты за день (ТЗ рабочего дня осмотрщика, раздел 3) -------------------
//
// Утренний — куда выезжает (объекты дня из назначений и дописанное вручную),
// одометр числом и снимком. Вечерний — что осмотрено (отметки по назначениям
// дня), одометр числом и снимком; без одометра — маршрут адресами и пробег.
// Пробег дня — разница показаний; литры = пробег × расход авто / 100; деньги
// считает бухгалтерия (ответ пользователя 12.10.2026), цены в системе нет.
// Утренний позже начала дня по графику — поздний выезд; не сдан к началу или
// к концу рабочего дня — пропуск.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: время сдачи — время сервера, снимок одометра — файл
// в хранилище с временем съёмки из EXIF, а не ссылка вкладки; пробег без
// одометра — расстояние по маршруту на карте (раздел 7), в макете его вводит
// осмотрщик. Развилка — можно ли править сданный отчёт: в макете можно,
// правка видна по времени «изменён».

export const REPORT_KINDS = { morning: 'Утренний', evening: 'Вечерний' };
const reports = demo.reports || [];
registerPersisted('inspections.reports', {
  snapshot: () => reports,
  restore: (saved) => {
    if (!Array.isArray(saved)) return;
    reports.splice(0, reports.length, ...saved.filter((x) => x && x.id));
  },
});

export const reportOf = (person, date, kind) => reports.find((r) => r.person === person && r.date === date && r.kind === kind) || null;
export const reportsBetween = (from, to) => reports.filter((r) => r.date >= from && r.date <= to);

// Отчёт за прошедший день — не позже 3 рабочих дней осмотрщика после него, с пометкой «сдан позже»
// (решение пользователя 06.11.2026 «Да, 3 раб. дня, пометка»). Позже — не принимается (null).
export const LATE_REPORT_WORKDAYS = 3;
export function lateWorkdays(person, date, today = localIso(new Date())) {
  let n = 0;
  for (let d = new Date(date + 'T00:00:00'); ;) {
    d.setDate(d.getDate() + 1);
    const iso = localIso(d);
    if (iso > today) break;
    if (workdayOf(person, iso).ok) n++;
  }
  return n;
}
export function saveReport({ person, date, kind, ...data }) {
  let r = reportOf(person, date, kind);
  const today = localIso(new Date());
  if (!r && date < today && lateWorkdays(person, date, today) > LATE_REPORT_WORKDAYS) return null;
  if (!r) {
    r = { id: nextId('rp'), person, date, kind, at: now(), by: session.state.person };
    reports.push(r);
  } else {
    r.editedAt = now();
  }
  Object.assign(r, data);
  changed();
  return r;
}

const hm = (iso) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const localIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const reportTime = hm;
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

// Передвижение за день (пользователь 17.11.2026): «осмотрщик мог передвигаться на такси. Указываем причину. Могла
// быть пересадка, тогда прикладывается утреннее фото, 2 фото с пересадки и вечернее фото с одометра. Каждая
// пересадка — +2 фото и 2 значения с одометров. Нужны единицы одометра. Мили/км/ч»; «Если у нас такси, одометр не
// отправляем. Пересадка могла быть с авто на такси, с такси на авто. Если у нас не было авто, не просим одометр».
//
// День — цепочка отрезков «Авто» или «Такси». Утро открывает первый отрезок, пересадка закрывает текущий и
// открывает следующий, вечер закрывает последний. Одометр — только у авто: в начале и в конце отрезка, у каждого
// показания снимок; единица (км, мили, ч — моточасы; по умолчанию км) — у машины, ставится в начале её отрезка;
// «Одометра нет» — у авто с неработающим одометром. У такси — причина.
//   утренний  { mode: 'car'|'taxi', taxiReason, odometer, unit, photo, noOdometer }
//   вечерний  { transfers: [{ endOdo, endPhoto, mode, taxiReason, startOdo, startPhoto, unit, noOdometer }],
//               odometer, photo, km }
// endOdo — одометр сданной машины (если ехал на авто с одометром), остальное — о новом отрезке.
// Снимок — JPEG до 480 px (практика отчётов дня).
export const ODO_UNITS = ['км', 'мили', 'ч'];
const MILE_KM = 1.609344;
// Отрезки дня: { mode, reason, unit, noOdo, from, fromPhoto, to, toPhoto, bad }. Без утреннего — отрезков нет.
export function dayLegs(morning, evening) {
  if (!morning) return [];
  const open = (s, odo, photo) => {
    const taxi = s.mode === 'taxi';
    return { mode: taxi ? 'taxi' : 'car', reason: taxi ? s.taxiReason || '' : '', unit: s.unit || 'км',
      noOdo: !taxi && !!s.noOdometer, from: taxi ? null : num(odo), fromPhoto: taxi ? '' : photo || '', to: null, toPhoto: '' };
  };
  const legs = [open(morning, morning.odometer, morning.photo)];
  const close = (odo, photo) => {
    const l = legs[legs.length - 1];
    if (l.mode === 'car' && !l.noOdo) { l.to = num(odo); l.toPhoto = photo || ''; }
  };
  ((evening && evening.transfers) || []).forEach((t) => { close(t.endOdo, t.endPhoto); legs.push(open(t, t.startOdo, t.startPhoto)); });
  if (evening) close(evening.odometer, evening.photo);
  legs.forEach((l) => { l.bad = l.from !== null && l.to !== null && l.to < l.from; });
  return legs;
}
// Пробег по отрезкам: by — 'odometer' (у всех авто одометр с обоих концов; км и мили — в км, моточасы — отдельно),
// 'route' (у какого-то авто одометра нет или он не закрыт) или 'taxi' (авто за день не было).
export function legsTotals(legs) {
  const cars = legs.filter((l) => l.mode === 'car');
  if (!legs.length) return { by: '' };
  if (!cars.length) return { by: 'taxi' };
  if (cars.some((l) => l.noOdo || l.from === null || l.to === null || l.bad)) return { by: 'route' };
  const sum = (u) => cars.filter((l) => l.unit === u).reduce((n, l) => n + l.to - l.from, 0);
  return {
    by: 'odometer',
    km: cars.some((l) => l.unit !== 'ч') ? Math.round((sum('км') + sum('мили') * MILE_KM) * 10) / 10 : null,
    hours: cars.some((l) => l.unit === 'ч') ? Math.round(sum('ч') * 10) / 10 : null,
  };
}

// День осмотрщика по отчётам: что сдано, когда, пробег, литры, пропуски.
export function dayReport(person, date) {
  const p = profileOf(person);
  const work = workdayOf(person, date);
  const morning = reportOf(person, date, 'morning');
  const evening = reportOf(person, date, 'evening');
  const nowD = new Date();
  const today = localIso(nowD);
  const nowHM = hm(nowD.toISOString());
  // Пробег: по одометру авто; без одометра — по маршруту дня; весь день на такси — по маршруту, литров нет
  // (бензин машины не расходовался).
  const legs = dayLegs(morning, evening);
  const tot = legsTotals(legs);
  const taxiLegs = legs.filter((l) => l.mode === 'taxi');
  let km = null;
  let kmBy = '';
  if (evening && tot.by === 'odometer' && tot.km !== null) { km = tot.km; kmBy = 'odometer'; }
  else if (evening && num(evening.km) !== null) { km = num(evening.km); kmBy = tot.by === 'taxi' ? 'taxi' : 'route'; }
  const cons = num(p.car.consumption);
  const litres = km !== null && cons !== null && kmBy !== 'taxi' ? Math.round(km * cons) / 100 : null;
  const late = !!morning && hm(morning.at) > p.schedule.from;
  // Отчёт обязателен только в рабочий день с выездами — назначениями с
  // плановой датой этого дня (ответ пользователя 12.10.2026 «Отчеты нужны
  // только при выездах»): работа дома, разбор снимков, переезд — без отчёта.
  const trips = visA().filter((a) => a.person === person && a.plannedAt === date && a.state !== 'removed').length;
  const due = work.ok && trips > 0;
  return {
    person, date, work: work.ok, reason: work.reason, morning, evening, km, kmBy, litres,
    legs, taxi: taxiLegs.length > 0, taxiReason: taxiLegs.map((l) => l.reason).filter(Boolean).join('; '),
    hours: evening && tot.by === 'odometer' ? tot.hours : null,
    transfers: evening ? (evening.transfers || []).length : 0,
    fuel: p.car.fuel, car: [p.car.make, p.car.plate].filter(Boolean).join(' · '), consumption: cons,
    late, lateFrom: p.schedule.from,
    // Вечерний сдан на следующий день и позже — тоже пропуск срока.
    eveningLate: !!evening && localIso(new Date(evening.at)) > date,
    // Утренний, сданный в другой день, — тоже «сдан позже».
    morningFiledLate: !!morning && localIso(new Date(morning.at)) > date,
    trips,
    missingMorning: due && !morning && (date < today || (date === today && nowHM > p.schedule.from)),
    missingEvening: due && !evening && (date < today || (date === today && nowHM > p.schedule.to)),
  };
}

// --- работа вне выездов (ТЗ рабочего дня осмотрщика, раздел 4) --------------
//
// Дни, когда осмотрщик работает, но не выезжает на осмотры системы: работа
// дома (разбор документов и снимков по категориям), переезд в другую
// область, командировка (область и временный адрес жилья), осмотры для
// партнёров и других проектов (проект, объект, время — «тоже фиксируем в
// системе»). Такой день — рабочий, но не свободный: в «свободно N дн.» и в
// подсказке «Кого назначить» не считается. Отчёты за день в такой день не
// нужны (ответ пользователя 12.10.2026 «Отчеты нужны только при выездах»).
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: записи с автором и временем сервера; кто вносит —
// менеджер (план месяца, раздел 7) и сам осмотрщик (партнёрский осмотр,
// работа дома) — развилка прав на сервере.

// Перечень — справочник «Работа вне выездов» (activityKinds выше).
export const activityKind = (k) => ACTIVITY_KINDS.find((x) => x.key === k) || { key: k, label: k, short: k };
const activities = demo.activities || [];
registerPersisted('inspections.activities', {
  snapshot: () => activities,
  restore: (saved) => {
    if (!Array.isArray(saved)) return;
    activities.splice(0, activities.length, ...saved.filter((x) => x && x.id));
  },
});

export const activitiesOn = (person, iso) => activities.filter((a) => a.person === person && a.from <= iso && (a.to || a.from) >= iso);

export function addActivity({ person, kind, from, to, ...rest }) {
  if (!person || !kind || !from) return null;
  const a = { id: nextId('ac'), person, kind, from, to: to && to >= from ? to : from, ...rest, at: now(), by: session.state.person };
  activities.push(a);
  changed();
  return a;
}

export function removeActivity(id) {
  const i = activities.findIndex((a) => a.id === id);
  if (i >= 0) { activities.splice(i, 1); changed(); }
}

// --- кадастр и добывание документов (ТЗ рабочего дня осмотрщика, раздел 5) ---
//
// Запрос — перечень строк: учреждение, ЕНИ, документ, комментарий менеджера.
// Два вида: «Запрос в кадастр» — осмотрщику с доступом в кадастр (раздел
// 1.1); «Документы на месте» — добывание документов при осмотре (5.4), тот
// же перечень и тот же ответ. Ответ по строке: итог (получен / нет в
// кадастре / отказ), файл PDF с именем «№ + ЕНИ + название», дата
// сканирования (именно сканирования), комментарий; кто и когда ответил.
// Полученный файл сразу ложится в документы объекта оценки с датой
// сканирования (5.3).
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: файл — в хранилище документов сервера; имя «№ + ЕНИ
// + название» ставит сервер; дату сканирования осмотрщик вводит, а сервер
// может сверить её с датой в метаданных PDF. Развилка — нужен ли проверяющий
// (ЦОД) до того, как файл станет документом объекта.

export const CAD_KINDS = [
  { key: 'cadastre', label: 'Запрос в кадастр' },
  { key: 'site', label: 'Документы на месте' },
];
export const CAD_RESULTS = [
  { key: 'got', label: 'Получен' },
  { key: 'none', label: 'Нет в кадастре' },
  { key: 'refused', label: 'Отказ' },
  // Документа нет на месте — ответ осмотрщика при окончании осмотра (пользователь 23.11.2026: «Если документа нет на
  // месте оставляет неприкрепленным. Просто спрашиваем при окончании осмотра, найдены ли эти документы»).
  { key: 'missing', label: 'Нет на месте' },
];
export const cadResultLabel = (k) => (CAD_RESULTS.find((x) => x.key === k) || { label: 'Ждёт' }).label;

// --- филиалы Кадастра (решение пользователя 16.11.2026 на вопрос «Откуда адрес филиала и ответственный»:
// «Справочник филиалов»; «Один запрос — один филиал») -------------------------------------------------
//
// Филиал — область и районы, которые он обслуживает, адрес, точка на карте (для навигатора) и ответственный
// от филиала (ФИО, телефон). Регионал выбирает филиал при создании запроса; по умолчанию — филиал района
// первого объекта. Осмотрщик видит адрес, ответственного и маршрут.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: справочник ведёт ЦОД; в макете — демо-записи (выдуманные ФИО и телефоны).
const DEMO_BRANCHES = [
  { id: 'kb-bish-1', name: 'Бишкекский филиал № 1', region: 'Бишкек', districts: ['Октябрьский р-н', 'Ленинский р-н'], address: 'г. Бишкек, ул. Примерная, 1', lat: 42.8746, lon: 74.5698, person: 'Асанова Гульнара Т.', phone: '+996 312 000 101' },
  { id: 'kb-bish-2', name: 'Бишкекский филиал № 2', region: 'Бишкек', districts: ['Первомайский р-н', 'Свердловский р-н'], address: 'г. Бишкек, пр. Демонстрационный, 2', lat: 42.8800, lon: 74.6100, person: 'Токтогулов Бакыт С.', phone: '+996 312 000 102' },
  { id: 'kb-chui', name: 'Чуйский филиал', region: 'Чуй', districts: [], address: 'г. Сокулук, ул. Образцовая, 3', lat: 42.8600, lon: 74.3000, person: 'Иманалиева Айгуль К.', phone: '+996 3134 000 103' },
  { id: 'kb-ik', name: 'Иссык-Кульский филиал', region: 'Иссык-Куль', districts: [], address: 'г. Каракол, ул. Пробная, 4', lat: 42.4907, lon: 78.3936, person: 'Садыков Эрлан М.', phone: '+996 3922 000 104' },
  { id: 'kb-naryn', name: 'Нарынский филиал', region: 'Нарын', districts: [], address: 'г. Нарын, ул. Учебная, 5', lat: 41.4287, lon: 75.9911, person: 'Жумабаева Нургуль А.', phone: '+996 3522 000 105' },
  { id: 'kb-talas', name: 'Таласский филиал', region: 'Талас', districts: [], address: 'г. Талас, ул. Тестовая, 6', lat: 42.5228, lon: 72.2427, person: 'Мамытов Азамат Р.', phone: '+996 3422 000 106' },
  { id: 'kb-ja', name: 'Жалал-Абадский филиал', region: 'Жалал-Абад', districts: [], address: 'г. Жалал-Абад, ул. Макетная, 7', lat: 40.9333, lon: 73.0000, person: 'Абдыкадырова Жылдыз Б.', phone: '+996 3722 000 107' },
  { id: 'kb-osh', name: 'Ошский филиал', region: 'Ош', districts: [], address: 'г. Ош, ул. Демонстрационная, 8', lat: 40.5283, lon: 72.7985, person: 'Ташиев Улан Ж.', phone: '+996 3222 000 108' },
  { id: 'kb-batken', name: 'Баткенский филиал', region: 'Баткен', districts: [], address: 'г. Баткен, ул. Образцовая, 9', lat: 40.0629, lon: 70.8194, person: 'Исакова Мээрим Н.', phone: '+996 3622 000 109' },
];
const cadBranchList = DEMO_BRANCHES.map((b) => ({ ...b, districts: [...b.districts] }));
registerPersisted('inspections.cadBranches', {
  snapshot: () => cadBranchList,
  restore: (saved) => {
    if (!Array.isArray(saved) || !saved.length) return;
    cadBranchList.splice(0, cadBranchList.length, ...saved.filter((x) => x && x.id));
  },
});
export const cadBranches = () => cadBranchList;
export const cadBranch = (id) => cadBranchList.find((b) => b.id === id) || null;
// Филиал объекта: по району (если филиал области делит районы), иначе первый филиал области.
export function cadBranchFor(eni, district = '') {
  const region = eniRegion(eni);
  const inRegion = cadBranchList.filter((b) => b.region === region);
  return inRegion.find((b) => district && b.districts.includes(district)) || inRegion[0] || null;
}

const cadRequests = demo.cadastre || [];
// Демо-запросы, которых нет в сохранённом (появились после сохранения), — добавляются при восстановлении.
const DEMO_CAD = [...cadRequests];
// Демо-запросам без филиала — филиал области большинства строк (запрос в кадастр — один филиал).
function seedBranch(r) {
  if (!r || r.branch || r.kind !== 'cadastre' || !r.rows || !r.rows.length) return;
  const n = {};
  r.rows.forEach((x) => { const reg = eniRegion(x.eni); if (reg) n[reg] = (n[reg] || 0) + 1; });
  const top = Object.keys(n).sort((a, b) => n[b] - n[a])[0];
  const b = top && cadBranchList.find((x) => x.region === top);
  if (b) r.branch = b.id;
}
cadRequests.forEach(seedBranch);
registerPersisted('inspections.cadastre', {
  snapshot: () => cadRequests,
  restore: (saved) => {
    if (!Array.isArray(saved)) return;
    cadRequests.splice(0, cadRequests.length, ...saved.filter((x) => x && x.id));
    DEMO_CAD.filter((d) => !cadRequests.some((x) => x.id === d.id)).forEach((d) => cadRequests.push(d));
    cadRequests.forEach(seedBranch);
  },
});

export const allCadRequests = () => cadRequests;
export const cadRequest = (id) => cadRequests.find((r) => r.id === id) || null;

// Запрос «Документы на месте» из запроса ЦОД (kernel/docRequests.js) бывает без осмотрщика: объект ещё не назначен —
// строки видит любой, кто приедет на объект («Запросить документы» на странице осмотрщика, подбор по объекту и ЕНИ).
// У таких строк — участник карточки (party: собственник или пользователь и его строка «Не подтверждён документом»)
// и реквизиты (spec: вид, №, дата, кем выдан): принятый ЦОД скан привязывается к участнику сам (kernel/scanQueue.js).
export function createCadRequest({ person, kind = 'cadastre', due = '', note = '', branch = '', rows = [], from = '' }) {
  if ((!person && kind !== 'site') || !rows.length) return null;
  const r = {
    id: nextId('cr'), no: cadRequests.reduce((m, x) => Math.max(m, x.no || 0), 0) + 1,
    person: person || '', kind, due, note, branch, at: now(), by: session.state.person, ...(from ? { from } : {}),
    rows: rows.map((x) => ({ id: nextId('cl'), typeId: x.typeId || '', ocId: x.ocId || '', inst: x.inst || '', eni: x.eni || '', doc: x.doc || '', note: x.note || '', result: '',
      ...(x.party ? { party: { ...x.party } } : {}), ...(x.spec ? { spec: { ...x.spec } } : {}) })),
  };
  cadRequests.unshift(r);
  changed();
  return r;
}

// Правка открытого запроса, закрытие и напоминание (решение пользователя 05.11.2026 на вопрос «Изменение
// запроса кадастра и повторы строк»: «Правка и без повторов»). Строки с ответом не трогаются: правятся и
// убираются только ждущие ответа; rows — ждущие строки после правки (у прежних — их id).
export function updateCadRequest(id, { person, kind, due = '', note = '', branch, rows = [] }) {
  const r = cadRequest(id);
  if (!r || r.closedAt) return null;
  const answered = r.rows.filter((x) => x.result);
  const wait = rows.map((x) => {
    const was = x.id && r.rows.find((y) => y.id === x.id && !y.result);
    return was ? Object.assign(was, { doc: x.doc || '', note: x.note || '' })
      : { id: nextId('cl'), typeId: x.typeId || '', ocId: x.ocId || '', inst: x.inst || '', eni: x.eni || '', doc: x.doc || '', note: x.note || '', result: '' };
  });
  const changes = [];
  if (person && person !== r.person) changes.push(`осмотрщик ${r.person} → ${person}`);
  if ((due || '') !== (r.due || '')) changes.push(`срок ${r.due || '—'} → ${due || '—'}`);
  const before = r.rows.filter((x) => !x.result).length;
  if (before !== wait.length) changes.push(`строк без ответа ${before} → ${wait.length}`);
  if (branch !== undefined && (branch || '') !== (r.branch || '')) changes.push(`филиал ${(cadBranch(r.branch) || {}).name || '—'} → ${(cadBranch(branch) || {}).name || '—'}`);
  Object.assign(r, { person: person || r.person, kind: kind || r.kind, due, note, branch: branch === undefined ? r.branch : branch, rows: [...answered, ...wait] });
  (r.log = r.log || []).push({ at: now(), by: session.state.person, kind: 'edit', text: changes.join('; ') || 'изменён' });
  changed();
  return r;
}
export function closeCadRequest(id, closed = true) {
  const r = cadRequest(id);
  if (!r) return null;
  if (closed) Object.assign(r, { closedAt: now(), closedBy: session.state.person });
  else { delete r.closedAt; delete r.closedBy; }
  (r.log = r.log || []).push({ at: now(), by: session.state.person, kind: closed ? 'close' : 'reopen' });
  changed();
  return r;
}
export function remindCadRequest(id) {
  const r = cadRequest(id);
  if (!r || r.closedAt) return null;
  (r.log = r.log || []).push({ at: now(), by: session.state.person, kind: 'remind' });
  changed();
  return r;
}
// Повторы: пара «объект + документ» уже ждёт ответа в другом открытом запросе. exceptId — правимый запрос.
export function cadDuplicateOf(ocId, doc, exceptId = '') {
  const norm = (s) => String(s || '').trim().toLowerCase();
  return cadRequests.find((r) => r.id !== exceptId && !r.closedAt
    && r.rows.some((x) => !x.result && x.ocId === ocId && norm(x.doc) === norm(doc))) || null;
}

// Итог запроса: строк, получено, нет, отказ, ждёт.
export function cadSummary(r) {
  const t = { total: r.rows.length, got: 0, none: 0, refused: 0, missing: 0, wait: 0 };
  r.rows.forEach((x) => { t[x.result || 'wait']++; });
  return t;
}

// Номер документа в записи — как у модулей (ЕНИ-N): счётчик общий на запись.
export function nextRecDocId(rec) {
  const used = (rec.docs || []).map((d) => d.id).concat((rec.oi || []).flatMap((o) => (o.docs || []).map((d) => d.id)))
    .map((id) => { const m = /-(\d+)$/.exec(id || ''); return m ? +m[1] : NaN; }).filter((n) => !Number.isNaN(n));
  return `${rec.eni || rec.id}-${(used.length ? Math.max(...used) : 0) + 1}`;
}

// Ответ по строке. file — File (PDF) или null; fileName — имя «№ + ЕНИ +
// название», его собирает экран (он знает номер учреждения). Полученный файл
// в документы объекта САМ не попадает: он ждёт проверки ЦОД в очереди «Сканы с
// осмотров» (kernel/scanQueue.js, решение пользователя 27.10.2026, В2: «ответы
// на запросы кадастра проверяет ЦОД и без проверки в документы записи не
// попадают»); документ у записи создаёт acceptScan. Файл лежит у строки:
// row.file.attached.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: файл — в хранилище документов сервера; до проверки он
// «входящий», а не документ объекта.
// onSite — документ получен осмотрщиком на месте, при осмотре объекта с тем же ЕНИ (страница осмотрщика, «Спросить на
// месте»; пользователь 19.11.2026): отвечает любой осмотрщик, чей бы ни был запрос.
export async function answerCadRow(reqId, rowId, { result, scanDate = '', answer = '', file = null, fileName = '', onSite = false }) {
  const r = cadRequest(reqId);
  const row = r && r.rows.find((x) => x.id === rowId);
  if (!row) return null;
  Object.assign(row, { result, scanDate: result === 'got' ? scanDate : '', answer, answeredAt: now(), answeredBy: session.state.person });
  if (onSite && result === 'got') row.onSite = true;
  else delete row.onSite;
  // Новый ответ — новая проверка: прежняя отметка ЦОД (возврат) снимается.
  delete row.review;
  if (result === 'got' && file) {
    row.file = { name: fileName || file.name, attached: await attachedFileFrom(file) };
  } else if (result !== 'got') {
    delete row.file;
  }
  changed();
  return row;
}
// Открепить скан ответа (пользователь 17.11.2026: «нужна возможность открепить прикрепленный скан»; ответы на
// вопрос: «Строка снова ждёт», после принятия ЦОД — «Нельзя»). Строка возвращается в «Ждёт ответа»: ответ, дата
// скана, пояснение и отметка ЦОД снимаются, из очереди «Сканы с осмотров» строка уходит сама (её там держит
// result 'got' или review). Принятый ЦОД скан — документ объекта: не открепляется (null).
export const cadFileAccepted = (row) => !!(row && ((row.file && row.file.docId) || (row.review && row.review.state === 'accepted')));
export function detachCadFile(reqId, rowId) {
  const r = cadRequest(reqId);
  const row = r && r.rows.find((x) => x.id === rowId);
  if (!row || !row.file || cadFileAccepted(row)) return null;
  (row.log = row.log || []).push({ at: now(), by: session.state.person, kind: 'detach', text: row.file.name || '' });
  delete row.file;
  delete row.review;
  Object.assign(row, { result: '', scanDate: '', answer: '', answeredAt: '', answeredBy: '' });
  changed();
  return row;
}

// Имя файла ответа — «№ учреждения + ЕНИ + название документа» (заметки
// пользователя 12.10.2026); номер учреждения передаёт страница.
export const cadFileName = (row, instCode = '') => `${[instCode, row.eni, row.doc].filter(Boolean).join(' ')}.pdf`.replace(/[\\/:*?"<>|]+/g, ' ');
export const cadKindLabel = (k) => (CAD_KINDS.find((x) => x.key === k) || { label: k }).label;

// --- план месяца (ТЗ рабочего дня осмотрщика, пункт 7.1) ---------------------
//
// В начале месяца регионал задаёт примерный план поездок осмотрщика по
// дням: область, район, учреждения. План — намерение, а не назначение: по
// нему подбирается маршрут дня (7.2), назначения делаются отдельно.

const plans = demo.plans || [];
registerPersisted('inspections.plan', {
  snapshot: () => plans,
  restore: (saved) => {
    if (!Array.isArray(saved)) return;
    plans.splice(0, plans.length, ...saved.filter((x) => x && x.id));
  },
});

export const planOf = (person, date) => plans.find((p) => p.person === person && p.date === date) || null;

// Пустой план дня удаляется, чтобы не копить пустые строки.
export function setPlan(person, date, patch) {
  let p = planOf(person, date);
  if (!p) { p = { id: `pl-${person}-${date}`, person, date, region: '', district: '', institutions: '', note: '' }; plans.push(p); }
  Object.assign(p, patch, { at: now(), by: session.state.person });
  if (!p.region && !p.district && !p.institutions && !p.note && !(p.order && p.order.length)) plans.splice(plans.indexOf(p), 1);
  changed();
  return p;
}

// Порядок выездов дня, заданный осмотрщиком перетаскиванием: ключи
// «тип|запись» по порядку; пустой — снова «ближайший следующий». По нему
// строится маршрут дня (pages/inspections/route.js) — и у осмотрщика, и в
// «Маршруте» регионала, и ссылка «Весь маршрут» в навигатор.
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: порядок — часть плана дня на сервере; при правке
// регионалом и осмотрщиком одновременно — последняя правка побеждает или
// регионал видит, что порядок задан осмотрщиком (развилка).
export function setDayOrder(person, date, keys) {
  return setPlan(person, date, { order: [...(keys || [])] });
}
