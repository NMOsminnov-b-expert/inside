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
import { getType, sortedTypes } from './registry.js';
import { registerPersisted, scheduleSave } from './persist.js';
import { session } from './session.js';
import { demoInspections } from './inspectionsDemo.js';
import { eniRegion } from './fmt.js';

// Состояния назначения — в порядке жизни.
export const ASSIGN_STATES = [
  { key: 'assigned', label: 'Назначено' },
  { key: 'progress', label: 'В работе' },
  { key: 'done', label: 'Осмотр закончен' },
  { key: 'removed', label: 'Снято' },
];
const LIVE = new Set(['assigned', 'progress']);
export const isLive = (a) => !!a && LIVE.has(a.state);

// Документы, которые отмечены в окне назначения сразу (ответ пользователя
// В6 12.10.2026: «По умолчанию даем техпаспорт, кадастровый, ситуационный
// планы»). Сверяются по виду документа без регистра.
export const DEFAULT_DOC_KINDS = [/техн\S*\s*паспорт|техпаспорт/i, /кадастр/i, /ситуацион/i];
export const isDefaultDoc = (kind) => DEFAULT_DOC_KINDS.some((re) => re.test(String(kind || '')));

// Засев — демо-история (kernel/inspectionsDemo.js): заполняется до
// регистрации в сохранении, поэтому считается исходными данными, а не
// правками пользователя; правки ложатся поверх него, как у записей ОЦ.
const demo = demoInspections();
const assignments = demo.assignments;
const events = demo.events;

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
  return events.filter((e) => (!person || e.person === person)
    && (!typeId || e.typeId === typeId) && (!ocId || e.ocId === ocId));
}

// --- выборки -----------------------------------------------------------------

export const allAssignments = () => assignments;
export const assignmentById = (id) => assignments.find((a) => a.id === id) || null;

export function assignmentsOf(typeId, ocId, { live = true } = {}) {
  return assignments.filter((a) => a.typeId === typeId && a.ocId === ocId && (!live || isLive(a)));
}

export function assignmentsOfPerson(person, { live = true } = {}) {
  return assignments.filter((a) => a.person === person && (!live || isLive(a)));
}

// Назначение покрывает ОИ, если оно на объект целиком (oiIds пуст) или ОИ в
// его перечне.
export const coversOi = (a, oiId) => !a.oiIds || !a.oiIds.length || a.oiIds.includes(oiId);

// --- запись в объект оценки ----------------------------------------------------

function recordsOf(typeId) {
  const t = getType(typeId);
  return t ? t.records : null;
}

// resp.insp — осмотрщик последнего действующего назначения или пусто.
// Пишем, только если поменялось: assignResponsible двигает дату обновления
// записи, и пустой пересчёт не должен её трогать.
function syncResp(typeId, ocId) {
  const recs = recordsOf(typeId);
  if (!recs) return;
  const rec = recs.loadRecord(ocId);
  if (!rec) return;
  // Демо-назначения запись не трогают (kernel/inspectionsDemo.js).
  const live = assignmentsOf(typeId, ocId).filter((a) => !a.demo).sort((x, y) => String(x.at).localeCompare(String(y.at)));
  const person = live.length ? live[live.length - 1].person : '';
  if (((rec.resp || {}).insp || '') === person) return;
  recs.assignResponsible(ocId, 'insp', person);
}

function changed() {
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
export function assign({ typeId, ocId, person, oiIds = [], docs, inventories = [], plannedAt = '', note = '', prevId = '' }) {
  if (!typeId || !ocId || !person) return null;
  if (!Array.isArray(docs)) docs = defaultDocIds(typeId, ocId);
  const prev = prevId ? assignmentById(prevId) : null;
  if (prev && isLive(prev) && prev.person !== person) setAssignState(prev.id, 'removed');
  const sameOi = (a) => String([...(a.oiIds || [])].sort()) === String([...oiIds].sort());
  let a = prev && isLive(prev) && prev.person === person ? prev
    : assignments.find((x) => isLive(x) && x.typeId === typeId && x.ocId === ocId && x.person === person && sameOi(x));
  if (a) {
    Object.assign(a, { oiIds: [...oiIds], docs: [...docs], inventories: [...inventories], plannedAt, note, updatedAt: now() });
    logEvent('updated', a);
  } else {
    a = {
      id: nextId('as'),
      typeId, ocId, person,
      oiIds: [...oiIds],
      docs: [...docs],
      inventories: [...inventories],
      plannedAt,
      note,
      by: session.state.person,
      at: now(),
      state: 'assigned',
      doneAt: '',
    };
    assignments.push(a);
    logEvent('assigned', a);
  }
  syncResp(typeId, ocId);
  changed();
  return a;
}

export function setAssignState(id, state) {
  const a = assignmentById(id);
  if (!a || a.state === state || !ASSIGN_STATES.some((s) => s.key === state)) return a;
  a.state = state;
  if (state === 'done') a.doneAt = now();
  if (state === 'removed') a.removedAt = now();
  logEvent(state, a);
  syncResp(a.typeId, a.ocId);
  changed();
  return a;
}

export const unassign = (id) => setAssignState(id, 'removed');

// Переназначить другому: прежнее снимается, новое заводится с тем же
// составом — история у обоих остаётся.
export function reassign(id, person) {
  const a = assignmentById(id);
  if (!a || !person || a.person === person) return a;
  setAssignState(id, 'removed');
  return assign({ ...a, person });
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
  assignmentsOfPerson(person).forEach((a) => {
    const k = a.typeId + '|' + a.ocId;
    if (!byObj.has(k)) byObj.set(k, { typeId: a.typeId, ocId: a.ocId, assigns: [] });
    byObj.get(k).assigns.push(a);
  });
  const out = [...byObj.values()].map((t) => {
    const sorted = t.assigns.slice().sort((x, y) => String(x.plannedAt || '9999').localeCompare(String(y.plannedAt || '9999')));
    const whole = t.assigns.some((a) => !a.oiIds || !a.oiIds.length);
    return { ...t, assign: sorted[0], oiIds: whole ? [] : [...new Set(t.assigns.flatMap((a) => a.oiIds))] };
  });
  const seen = new Set(out.map((t) => t.typeId + '|' + t.ocId));
  sortedTypes().forEach((t) => {
    const res = t.records.queryRecords({ filter: { mine: { role: 'insp', person } }, offset: 0, limit: 100000 });
    res.rows.forEach((s) => {
      const k = t.manifest.id + '|' + s.id;
      if (seen.has(k) || assignmentsOf(t.manifest.id, s.id, { live: false }).some((a) => !a.demo)) return;
      seen.add(k);
      out.push({ typeId: t.manifest.id, ocId: s.id, assign: null });
    });
  });
  return out;
}

// --- профили осмотрщиков: контакты и области -----------------------------------
//
// Просьба пользователя 12.10.2026: «для каждого осмотрщика нужны контактные
// данные. Необходима фильтрация по областям осмотрщиков». Справочника
// сотрудников в макете нет, поэтому профиль живёт здесь, по ФИО: телефон,
// почта, области, примечание. Контакты в демо не выдумываются — у
// осмотрщиков реальные фамилии; поля пустые, пока их не внесут.
//
// Область, если её не указали, выводится из объектов, которые человек
// осматривал или должен осмотреть (по коду ЕНИ, eniRegion): решение 12.10
// «каждый знает свою область» — фактическая область видна по его объектам.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: профиль — учётная запись сотрудника в справочнике
// «Пользователи» (контакты, роль, области); здесь он заменится ссылкой на неё.

const profiles = [];
registerPersisted('inspections.people', {
  snapshot: () => profiles,
  restore: (saved) => {
    if (!Array.isArray(saved)) return;
    profiles.splice(0, profiles.length, ...saved.filter((x) => x && x.id));
  },
});

export const PROFILE_FIELDS = [
  { key: 'phone', label: 'Телефон', type: 'tel' },
  { key: 'email', label: 'Почта', type: 'email' },
  { key: 'note', label: 'Примечание' },
];

export function profileOf(name) {
  return profiles.find((p) => p.id === name) || { id: name, phone: '', email: '', regions: [], note: '' };
}

export function saveProfile(name, patch) {
  let p = profiles.find((x) => x.id === name);
  if (!p) { p = { id: name, phone: '', email: '', regions: [], note: '' }; profiles.push(p); }
  Object.assign(p, patch, { updatedAt: now(), updatedBy: session.state.person });
  changed();
  return p;
}

// Области человека: указанные в профиле, иначе — по его объектам (чаще
// встречающиеся первыми). derived — признак, что выведены, а не указаны.
export function regionsOf(name, summaryEni) {
  const p = profileOf(name);
  if (p.regions && p.regions.length) return { regions: p.regions, derived: false };
  const count = new Map();
  assignments.forEach((a) => {
    if (a.person !== name) return;
    const r = eniRegion(summaryEni(a.typeId, a.ocId));
    if (r) count.set(r, (count.get(r) || 0) + 1);
  });
  return { regions: [...count.entries()].sort((x, y) => y[1] - x[1]).map(([r]) => r), derived: true };
}
