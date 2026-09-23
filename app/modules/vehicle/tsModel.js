// Данные карточки ТС по категоризации «база + модуль».
//
// Запись описывает одно из трёх (решения пользователя 22–23.09.2026):
//   base   — транспортное средство: категория из техпаспорта → база, сверху
//            модули (надстройки, навесное, сменное);
//   self   — самоходная машина: группа → вид, модули так же ставятся сверху;
//   module — модуль без машины: снятый ковш, жатка на тележке.
//
// Состав полей — справочник data/tsCatalog.js, собранный скриптом из того же
// источника, что и книга docs/kategorii-ts-baza-modul.xlsx: поля карточки и
// справочника не расходятся.
//
// Значения лежат по ключу поля в f, единица измерения — отдельным ключом
// «<ключ>@unit»: «110» и «л.с.» это разные сведения. Поле, которого при смене
// базы или вида на экране больше нет, из данных не удаляется — вернули прежний
// выбор, вернулось и значение (практика динамических полей по категории).
import {
  TS_CATEGORIES, TS_BASES, TS_BASE_FIELDS, TS_SPECIAL, TS_TOWED, TS_SELF_GROUPS, TS_SELF_FIELDS,
  TS_MODULE_GROUPS, TS_MODULE_FIELDS,
} from './data/tsCatalog.js';

// Подписи — по указанию пользователя 23.09.2026: «самоходную технику меняем на
// спецтехнику», «отдельный модуль надо переименовать». В справочнике это
// по-прежнему «самоходная машина» и «модуль без машины».
export const KINDS = [
  { key: 'base', label: 'Транспортное средство' },
  { key: 'self', label: 'Спецтехника' },
  { key: 'module', label: 'Оборудование без машины' },
];

// База «Прочее» стоит в каждой категории: машина, которая не легла ни в одну
// базу, остаётся в категории из техпаспорта (правило 16 справочника).
const OTHER = 'Прочее';
export const CATEGORIES = TS_CATEGORIES.filter((c) => !TS_BASES.some((b) => b.category === c && b.name === OTHER));

export const basesOf = (category) => (category
  ? TS_BASES.filter((b) => b.category === category || b.name === OTHER)
  : []);

export const baseInfo = (name) => TS_BASES.find((b) => b.name === name) || null;
export const selfGroups = () => TS_SELF_GROUPS.map((g) => g.group);
export const selfKinds = (group) => (TS_SELF_GROUPS.find((g) => g.group === group) || { items: [] }).items;
export const selfInfo = (group, name) => selfKinds(group).find((k) => k.name === name) || null;
export const moduleGroups = () => TS_MODULE_GROUPS.map((g) => g.group);
export const moduleKinds = (group) => (TS_MODULE_GROUPS.find((g) => g.group === group) || { items: [] }).items;
export const moduleInfo = (group, name) => moduleKinds(group).find((k) => k.name === name) || null;
export const towedInfo = (name) => TS_TOWED.find((t) => t.name === name) || null;
export const MODULE_FIELDS = TS_MODULE_FIELDS;

export const tsOf = (rec) => {
  // Объектов имущества у ТС нет, но просмотрщик ядра перебирает rec.oi
  // (перенос фото к другой литере, боковая панель) — пустой перечень.
  rec.oi = rec.oi || [];
  const v = rec.vehicle;
  v.f = v.f || {};
  v.extra = v.extra || [];
  v.modules = v.modules || [];
  // Записи до 23.09.2026: марка и модель были двумя полями, категория тракторов
  // называлась «Спецтехника» (как вид объекта — их путали).
  if (v.f.model) {
    v.f.make = [v.f.make, v.f.model].filter(Boolean).join(' ');
    delete v.f.model;
  }
  if (v.category === 'Спецтехника') v.category = 'Тракторы и специальные шасси';
  return v;
};

// Категория по записи «Тип ТС» из свидетельства: там вид ТС и тип кузова
// пишут одной строкой — «легковой минивэн», «легковой, седан», «мото,
// мотоцикл», «грузовой бортовой». Первое слово и есть категория (указание
// пользователя 23.09.2026: «тип кузова автоматом в 02 переносить»).
const CATEGORY_BY_WORD = [
  [/^легков/, 'Легковое'],
  [/^грузов/, 'Грузовое'],
  [/^автобус|^микроавтобус/, 'Автобусы'],
  [/^мото|^мопед|^квадро|^скутер/, 'Мототехника'],
  [/^полуприцеп|^прицеп/, 'Прицепы и полуприцепы'],
  [/^трактор|^специальн|^спецтехн|^самоходн|^вездеход/, 'Тракторы и специальные шасси'],
];

export function categoryFromVtype(text) {
  const t = String(text || '').trim().toLowerCase().replace(/^[^a-zа-яё]+/, '');
  const hit = CATEGORY_BY_WORD.find(([re]) => re.test(t));
  return hit ? hit[1] : '';
}

// Выбор дописан до конца: без этого поля машины не показываются — дочернее
// не показывают, пока не выбран родитель (практика каскадных списков).
export function classified(v) {
  if (v.kind === 'base') return !!v.base;
  if (v.kind === 'self') return !!v.selfKind;
  if (v.kind === 'module') return !!v.modKind;
  return false;
}

// Общие поля машины: у ТС — поля базы, у самоходной машины — свои.
export const commonFields = (v) => (v.kind === 'self' ? TS_SELF_FIELDS : TS_BASE_FIELDS);

// Особые поля: у базы — свои (страна сборки, навеска…); у прицепной машины к
// ним добавляются поля её вида — она остаётся цельной, со своими полями
// (решение пользователя 23.09.2026).
export function specialFields(v) {
  if (v.kind !== 'base' || !v.base) return [];
  const own = TS_SPECIAL[v.base] || [];
  const towed = v.base === 'Прицепная машина' ? towedInfo(v.f.vidMashiny) : null;
  const extra = towed ? towed.fields.filter((f) => !own.some((o) => o.key === f.key)) : [];
  return [...own, ...extra];
}

// --- дополнительные параметры: строки «наименование — значение» ------------
let seq = 1;
const nextId = (p) => `${p}-${Date.now().toString(36)}-${seq += 1}`;

export function addExtra(list, label = '') {
  const row = { id: nextId('vx'), label, value: '' };
  list.push(row);
  return row;
}

export function dropExtra(list, id) {
  const at = list.findIndex((r) => r.id === id);
  if (at >= 0) list.splice(at, 1);
}

// --- модули на машине -------------------------------------------------------
export function addModule(v) {
  const m = { id: nextId('vm'), group: '', kind: '', f: {}, extra: [] };
  v.modules.push(m);
  return m;
}

export function dropModule(v, id) {
  const at = v.modules.findIndex((m) => m.id === id);
  if (at >= 0) v.modules.splice(at, 1);
}

export const moduleTitle = (m) => m.kind || 'Модуль не выбран';

// --- подписи записи -----------------------------------------------------------
// Название — марка и модель, как в техпаспорте; отдельного поля «наименование»
// нет. Пока их нет — то, что уже выбрано в классификации.
export const makeModel = (v) => [v.f.make, v.f.model].map((s) => String(s || '').trim()).filter(Boolean).join(' ');

export function tsTitle(v) {
  return makeModel(v) || whatLabel(v) || 'Новое транспортное средство';
}

export function whatLabel(v) {
  if (v.kind === 'base') return v.base ? `${v.category} · ${v.base}` : v.category || '';
  if (v.kind === 'self') return v.selfKind || v.selfGroup || '';
  if (v.kind === 'module') return v.modKind || v.modGroup || '';
  return '';
}

// VIN у современных машин — 17 знаков без I, O и Q (ISO 3779). У старых машин
// в графе стоит короткий заводской номер (036932), у японских VIN часто нет
// вовсе — идентификатор записан в № кузова. Поэтому несоответствие — не
// ошибка, а предупреждение (практика «предупреждение вместо ошибки»).
export const normVin = (value) => String(value || '').toUpperCase().replace(/\s+/g, '');

export function vinWarning(value) {
  const v = normVin(value);
  if (!v || (v.length === 17 && !/[IOQ]/.test(v))) return '';
  return 'Не похоже на VIN из 17 знаков. У старых машин здесь заводской номер — оставьте как есть; '
    + 'у японских VIN часто нет, их номер пишут в «№ кузова».';
}

export const normPlate = (value) => String(value || '').toUpperCase().replace(/\s+/g, ' ').trim();

// Из VIN, № кузова и № шасси нужно хотя бы одно — по нему машину опознают
// (правило справочника, поле «Идентификационный номер»).
export const idMissing = (v) => !['vin', 'bodyNo', 'chassisNo'].some((k) => String(v.f[k] || '').trim());
