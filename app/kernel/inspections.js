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

// Виды отсутствий — в порядке частоты.
export const ABSENCE_KINDS = [
  { key: 'vacation', label: 'Отпуск' },
  { key: 'dayoff', label: 'Выходной' },
  { key: 'sick', label: 'Больничный' },
  { key: 'other', label: 'Другое' },
];
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
    birthDate: '', homeAddress: '', tempAddress: '', tempFrom: '', tempTo: '',
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
  Object.assign(p, patch, { updatedAt: now(), updatedBy: session.state.person });
  changed();
  return p;
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
  assignments.forEach((a) => {
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
const deadlines = [];
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
    logEvent('moved', a, { text: `${was || 'без даты'} → ${plannedAt || 'без даты'}` });
  });
  changed();
}

export function unassignMany(ids) {
  ids.forEach((id) => setAssignState(id, 'removed'));
}

// «Зависло»: назначено давно, а осмотр не начат (нет событий осмотрщика), или
// начат и не закончен долго. Пороги — рабочая неделя и две; на сервере —
// настройка (ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: пороги — в настройках региона).
export const STALL_DAYS = { notStarted: 5, notFinished: 10 };
export function stallOf(a) {
  if (!isLive(a)) return '';
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
export function addCustomField({ label, kind = 'text', options = [] }) {
  if (!label || !label.trim()) return null;
  const f = { id: nextId('cf'), label: label.trim(), kind, options: kind === 'list' ? options.filter(Boolean) : [], at: now(), by: session.state.person };
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

export function saveReport({ person, date, kind, ...data }) {
  let r = reportOf(person, date, kind);
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

// День осмотрщика по отчётам: что сдано, когда, пробег, литры, пропуски.
export function dayReport(person, date) {
  const p = profileOf(person);
  const work = workdayOf(person, date);
  const morning = reportOf(person, date, 'morning');
  const evening = reportOf(person, date, 'evening');
  const nowD = new Date();
  const today = localIso(nowD);
  const nowHM = hm(nowD.toISOString());
  const odo0 = morning ? num(morning.odometer) : null;
  const odo1 = evening ? num(evening.odometer) : null;
  let km = null;
  let kmBy = '';
  if (odo0 !== null && odo1 !== null && odo1 >= odo0) { km = odo1 - odo0; kmBy = 'odometer'; }
  else if (evening && num(evening.km) !== null) { km = num(evening.km); kmBy = 'route'; }
  const cons = num(p.car.consumption);
  const litres = km !== null && cons !== null ? Math.round(km * cons) / 100 : null;
  const late = !!morning && hm(morning.at) > p.schedule.from;
  // Отчёт обязателен в рабочий день с выездами (назначения с плановой датой
  // этого дня). День без выездов — без пропуска: вопрос пользователю, нужен
  // ли отчёт и в такой день (работа дома, разбор снимков — ТЗ раздел 4).
  const trips = assignments.filter((a) => a.person === person && a.plannedAt === date && a.state !== 'removed').length;
  const due = work.ok && trips > 0;
  return {
    person, date, work: work.ok, reason: work.reason, morning, evening, km, kmBy, litres,
    fuel: p.car.fuel, car: [p.car.make, p.car.plate].filter(Boolean).join(' · '), consumption: cons,
    late, lateFrom: p.schedule.from,
    // Вечерний сдан на следующий день и позже — тоже пропуск срока.
    eveningLate: !!evening && localIso(new Date(evening.at)) > date,
    trips,
    missingMorning: due && !morning && (date < today || (date === today && nowHM > p.schedule.from)),
    missingEvening: due && !evening && (date < today || (date === today && nowHM > p.schedule.to)),
  };
}
