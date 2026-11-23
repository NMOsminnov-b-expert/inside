// Досрочный осмотр: ОЦ или его ОИ направляют на осмотр раньше обычного порядка — флагом, без смены статуса.
//
// Пользователь 23.11.2026 (запись графа tz-dosrochnoe-napravlenie-oc-oi-na-osmotr-flag-filtr-i-rekomendacii-u):
// «Мы МОЖЕМ раньше времени направить регионалу со специальной пометкой ОЦ/ОИ на осмотр… Статус при этом не
// переводится в осмотрен и т.д. Ставится флаг. Досрочно направлен на осмотр, досрочно осмотрен. (Единовременно может
// быть только 1 флаг). Механика та же». Ответы: недвижимость и ТС; ставят «ЦОД и регионал»; из любого статуса до
// «Направлен на осмотр»; флаг «Осмотр проведён досрочно» остаётся и после перевода в «Осмотрен»; «После повторного
// направления на осмотр просто разрешаем при наличии завершенного осмотра сразу перевести в статус осмотрен».
//
// Данные — в записи ОЦ: rec.early = { state: 'sent' | 'done', oiIds: [] (пусто — весь объект), note, by, at,
// log: [{ kind, by, at, text }] }. Один флаг: state — либо одно, либо другое.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: флаг — поле записи ОЦ с журналом; право ставить — по роли (ЦОД, регионал) и региону.
import { session } from './session.js';
import { localIso } from './fmt.js';

export const EARLY_STATES = {
  sent: { label: 'Досрочно направлен на осмотр', short: 'Досрочно на осмотр' },
  done: { label: 'Осмотр проведён досрочно', short: 'Осмотрен досрочно' },
};
// Статусы, из которых можно направить досрочно: всё, что до «Направлен на осмотр».
export const EARLY_FROM = ['В заполнении', 'Удостоверен по документам'];
// Типы ОЦ без досрочного осмотра: у механизмов свой порядок — опись (запись графа tz-mehanizmy-…).
const NO_EARLY = new Set(['mechanisms']);
const ROLES = new Set(['any', 'cod', 'rm', 'admin']);

export const earlyOf = (rec) => (rec && rec.early && EARLY_STATES[rec.early.state] ? rec.early : null);
export const earlyLabel = (rec) => { const e = earlyOf(rec); return e ? EARLY_STATES[e.state].label : ''; };
// Признаки для значков и фасета реестра (kernel/flagBadges.js; модули кладут их в flags сводки).
export const earlyFlags = (rec) => { const e = earlyOf(rec); return { earlySent: !!e && e.state === 'sent', earlyDone: !!e && e.state === 'done' }; };

export const earlyAllowedType = (typeId) => !NO_EARLY.has(typeId);
export const canManageEarly = () => ROLES.has(session.state.role);
// Направить можно: тип с досрочным осмотром, роль ЦОД или регионал, статус до «Направлен на осмотр», флага нет.
export function canSendEarly(rec, typeId) {
  return !!rec && earlyAllowedType(typeId) && canManageEarly() && EARLY_FROM.includes(rec.status || '') && !earlyOf(rec);
}

// Живые назначения на объект — пока они есть, направление не отозвать (регионал уже назначил осмотрщика).
// Источник — kernel/inspections.js, регистрацией (setEarlyAssigns): прямой импорт замыкал круг — модули ОЦ при загрузке
// берут отсюда earlyFlags, а inspections.js при загрузке обращается к реестру типов ОЦ.
// Строки: { person, state, label, plannedAt }.
let assignsOf = () => [];
export function setEarlyAssigns(fn) { assignsOf = fn; }
export const earlyAssigns = (rec, typeId) => (rec ? assignsOf(typeId, rec.id) : []);

const fail = (text) => { throw new Error(text); };
const stamp = () => ({ by: session.state.person || '', at: new Date().toISOString() });
const cleanIds = (rec, ids) => [...new Set(ids || [])].filter((id) => (rec.oi || []).some((o) => o.id === id));
function logTo(rec, kind, text) {
  rec.early.log = [...(rec.early.log || []), { kind, text, ...stamp() }];
  rec.updatedAt = localIso();
}

export function sendEarly(rec, typeId, { oiIds = [], note = '' } = {}) {
  if (!canSendEarly(rec, typeId)) fail('Досрочно направить нельзя: статус, роль или флаг уже стоит');
  const ids = cleanIds(rec, oiIds);
  rec.early = { state: 'sent', oiIds: ids, note: String(note || '').trim(), ...stamp(), log: [] };
  logTo(rec, 'sent', ids.length ? `ОИ: ${ids.length}` : 'весь объект');
  return rec.early;
}

export function updateEarly(rec, { oiIds = [], note = '' } = {}) {
  const e = earlyOf(rec);
  if (!e || e.state !== 'sent') fail('Изменить можно только направление, по которому ещё нет осмотра');
  if (!canManageEarly()) fail('Нет права менять досрочное направление');
  e.oiIds = cleanIds(rec, oiIds);
  e.note = String(note || '').trim();
  logTo(rec, 'edited', e.oiIds.length ? `ОИ: ${e.oiIds.length}` : 'весь объект');
  return e;
}

// Отозвать — пока осмотрщик не назначен; флаг снимается, в журнале записи остаётся след.
export function cancelEarly(rec, typeId) {
  const e = earlyOf(rec);
  if (!e || e.state !== 'sent') fail('Отозвать можно только досрочное направление');
  if (!canManageEarly()) fail('Нет права отзывать досрочное направление');
  if (earlyAssigns(rec, typeId).length) fail('Осмотрщик уже назначен — сначала снимите назначение');
  logTo(rec, 'cancelled', '');
  rec.earlyLog = [...(rec.earlyLog || []), ...e.log];
  delete rec.early;
}

// Входит ли ОИ в досрочное направление (пусто — весь объект).
export const earlyCovers = (rec, oiId) => { const e = earlyOf(rec); return !!e && (!e.oiIds.length || e.oiIds.includes(oiId)); };
