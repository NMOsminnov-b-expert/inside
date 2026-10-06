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
  TS_CATEGORIES, TS_BASES, TS_BASE_FIELDS, TS_BASE_FIELDS_BY_CATEGORY, TS_SPECIAL, TS_TOWED, TS_SELF_GROUPS, TS_SELF_FIELDS,
  TS_MODULE_GROUPS, TS_MODULE_FIELDS, TS_VTYPE_BY_CATEGORY, TS_VTYPE_SELF,
} from './data/tsCatalog.js';

// Подписи — по указанию пользователя 23.09.2026: «самоходную технику меняем на
// спецтехнику», «отдельный модуль надо переименовать». В справочнике это
// по-прежнему «самоходная машина» и «модуль без машины».
// С 06.10.2026 спецтехника — категория ТС «Специализированная техника» со своим
// подменю (группа → вид), а оборудование без машины из выбора убрано (уходит в
// механизмы; записи этого вида открываются как прежде). Указание пользователя:
// «Спецтехнику… воткнуть в ТС… как специализированную. Своим подменю»,
// «Оборудование без машины уводим в механизмы… Данные не терять!».
export const SELF_CAT = 'Специализированная техника';
export const KINDS = [
  { key: 'base', label: 'Транспортное средство' },
  { key: 'self', label: SELF_CAT },
  { key: 'module', label: 'Оборудование без машины' },
];

// База «Прочее» стоит в каждой категории: машина, которая не легла ни в одну
// базу, остаётся в категории из техпаспорта (правило 16 справочника).
const OTHER = 'Прочее';
export const CATEGORIES = TS_CATEGORIES.filter((c) => !TS_BASES.some((b) => b.category === c && b.name === OTHER));

export const basesOf = (category) => (category
  ? TS_BASES.filter((b) => b.category === category || b.name === OTHER)
  : []);

// База категории, если она одна (без «Прочего»): тогда выбирать нечего — база
// ставится сама, списка баз нет (решение пользователя 06.10.2026: «Где поля не
// различаются, уходим от базы. Где отличаются — оставляем»). Сейчас это
// легковое, автобусы и мототехника.
export function singleBase(category) {
  const own = TS_BASES.filter((b) => b.category === category && b.name !== OTHER);
  return own.length === 1 ? own[0].name : '';
}
export const baseInfo = (name) => TS_BASES.find((b) => b.name === name) || null;
export const selfGroups = () => TS_SELF_GROUPS.map((g) => g.group);
export const selfKinds = (group) => (TS_SELF_GROUPS.find((g) => g.group === group) || { items: [] }).items;
export const selfInfo = (group, name) => selfKinds(group).find((k) => k.name === name) || null;
export const moduleGroups = () => TS_MODULE_GROUPS.map((g) => g.group);
export const moduleKinds = (group) => (TS_MODULE_GROUPS.find((g) => g.group === group) || { items: [] }).items;
export const moduleInfo = (group, name) => moduleKinds(group).find((k) => k.name === name) || null;
export const towedInfo = (name) => TS_TOWED.find((t) => t.name === name) || null;
export const MODULE_FIELDS = TS_MODULE_FIELDS;

// holder — запись с полем vehicle: ОЦ «Транспортные средства» или объект
// имущества «Транспортное средство» гражданского здания.
export const tsOf = (holder) => {
  const v = (holder.vehicle = holder.vehicle || { kind: '', f: {}, extra: [], modules: [] });
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
  // Записи до 30.09.2026: у модуля было одно поле «Двигатель установки» с
  // вариантом «Нет своего (от КОМ базы)»; теперь сначала привод, а тип
  // двигателя — только у своего.
  v.modules.forEach((m) => migrateDrive(m.f = m.f || {}));
  if (v.kind === 'module') migrateDrive(v.f);
  if (isPassenger(v)) migratePassenger(v);
  if (isTrailer(v)) migrateTrailer(v);
  migrateTruckBase(v);
  return v;
};

function migrateDrive(f) {
  if (f.drive || !f.engineKind) return;
  if (f.engineKind === 'Нет своего (от КОМ базы)') {
    f.drive = 'От двигателя базы (КОМ)';
    delete f.engineKind;
  } else {
    f.drive = 'Свой двигатель';
  }
}

// Легковые до 02.10.2026: одна база «Легковой автомобиль и внедорожник»,
// колёсная формула, массы, оси, моточасы, КОМ, раздатка, техсостояние одним
// списком, комплектность. База становится типом кузова по записи «Тип ТС»
// из техпаспорта (не узнан — пусто, выбирает человек); что переводится
// однозначно — переводится (4×4 — полный привод, больше одной управляемой оси
// — подруливание, списки — на значения справочника mashina.kg); прежние
// записи без пары уходят в «Дополнительные параметры» под прежней подписью.
// Прицепы — без двигателя (указание пользователя 06.10.2026): прежние
// значения его полей не теряются, а уходят в «Дополнительные параметры».
const TRAILER_CAT = 'Прицепы и полуприцепы';
export const isTrailer = (v) => !!v && v.kind === 'base' && v.category === TRAILER_CAT;
const TRAILER_OLD = { engineNo: '№ двигателя', fuel: 'Тип топлива', engineVolume: 'Рабочий объём двигателя',
  power: 'Мощность двигателя', engineHours: 'Моточасы', gearbox: 'Тип КПП', pto: 'Коробка отбора мощности' };
function migrateTrailer(v) {
  const f = v.f;
  Object.entries(TRAILER_OLD).forEach(([key, label]) => {
    if (f[key] === undefined) return;
    if (String(f[key]).trim()) {
      const unit = f[key + '@unit'];
      v.extra.push({ id: nextId('vx'), label, value: String(f[key]) + (unit ? ' ' + unit : '') });
    }
    delete f[key];
    delete f[key + '@unit'];
  });
}
// Грузовое — две базы с 06.10.2026: «Грузовое ТС» и «Седельное ТС».
// Три весовые базы переходят в грузовой автомобиль; значения их полей, которых
// больше нет (исполнение, число ведущих осей), — в «Дополнительные параметры».
const TRUCK_OLD_BASES = ['Лёгкий коммерческий (до 3,5 т)', 'Среднетоннажный грузовик (3,5–12 т)', 'Тяжёлый грузовик (свыше 12 т)',
  'Грузовой автомобиль'];
// Седельный тягач — «Седельное ТС» с 06.10.2026 (указание пользователя:
// «Переименуй грузовой автомобиль в грузовое ТС, седельный тягач переименуй
// аналогичным образом»).
const TRUCK_RENAMED = { 'Седельный тягач': 'Седельное ТС' };
const TRUCK_OLD_FIELDS = { ispolnenieBazy: 'Исполнение базы', chisloVeduschihOsey: 'Число ведущих осей' };
function migrateTruckBase(v) {
  if (v.kind === 'base' && TRUCK_RENAMED[v.base]) v.base = TRUCK_RENAMED[v.base];
  if (v.kind !== 'base' || !TRUCK_OLD_BASES.includes(v.base)) return;
  v.base = 'Грузовое ТС';
  Object.entries(TRUCK_OLD_FIELDS).forEach(([key, label]) => {
    if (v.f[key] === undefined) return;
    if (String(v.f[key]).trim()) v.extra.push({ id: nextId('vx'), label, value: String(v.f[key]) });
    delete v.f[key];
  });
}
const PASSENGER_CAT = 'Легковое';
const PASSENGER_OLD_BASE = 'Легковой автомобиль и внедорожник';
const PASSENGER_OLD = { wheelFormula: 'Колёсная формула', engineHours: 'Моточасы',
  pto: 'Коробка отбора мощности', steerAxles: 'Число управляемых осей', transferCase: 'Раздаточная коробка',
  massEmpty: 'Масса без нагрузки', massMax: 'Максимальная разрешённая масса', axles: 'Число осей',
  state: 'Техническое состояние', kit: 'Комплектность' };
const PASSENGER_VALUES = {
  wheel: { 'Левый': 'Левый (стандартный)' },
  fuel: { 'Газ-бензин': 'Бензин / газ' },
  gearbox: { 'Механическая': 'Механика', 'Автоматическая': 'Автомат', 'Роботизированная': 'Робот' },
};
// Базы-кузова легкового (02.10–06.10.2026) — снова одна база; кузов уходит в
// «Тип ТС, вид кузова», если тот пуст (иначе там уже запись техпаспорта).
const PASSENGER_BODY = new Set((TS_VTYPE_BY_CATEGORY[PASSENGER_CAT] || []).map((x) => x.replace(/^легковой, /, '')));
function migratePassenger(v) {
  const f = v.f;
  if (v.base && v.base !== PASSENGER_OLD_BASE && PASSENGER_BODY.has(String(v.base).toLowerCase())) {
    if (!String(f.vtype || '').trim()) f.vtype = 'легковой, ' + String(v.base).toLowerCase();
    v.base = PASSENGER_OLD_BASE;
  }
  if (!v.base) v.base = PASSENGER_OLD_BASE;
  if (f.wheelFormula && !f.driveType && /4\s*[×xх*]\s*4/i.test(f.wheelFormula)) f.driveType = 'Полный';
  if (f.steerAxles && !f.rearSteer && Number(f.steerAxles) > 1) f.rearSteer = 'Да';
  Object.entries(PASSENGER_VALUES).forEach(([key, map]) => { if (map[f[key]]) f[key] = map[f[key]]; });
  // Комплектация была свободной записью (до 06.10.2026): значение не из списка
  // — «Своя» с прежней записью в комментарии, а не потеря.
  const trims = (commonFields(v).find((x) => x.key === 'trim') || {}).options || [];
  if (f.trim && trims.length && !trims.includes(f.trim)) {
    const caseFree = trims.find((o) => o.toLowerCase() === String(f.trim).trim().toLowerCase());
    if (caseFree) f.trim = caseFree;
    else { f.trimNote = f.trimNote || f.trim; f.trim = 'Своя'; }
  }
  Object.entries(PASSENGER_OLD).forEach(([key, label]) => {
    if (f[key] === undefined) return;
    if (String(f[key]).trim()) {
      const unit = f[key + '@unit'];
      v.extra.push({ id: nextId('vx'), label, value: String(f[key]) + (unit ? ' ' + unit : '') });
    }
    delete f[key];
    delete f[key + '@unit'];
  });
}

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

// Какие категории может означать запись «Тип ТС» — ПРЕДЛОЖЕНИЕ, а не выбор.
// Указание пользователя 30.09.2026: «Бывает, когда надо выбирать самим… откуда
// ты знаешь, что это грузовик, а не пожарка?» — категория сама больше не
// ставится; строка только подсказывает, и там, где запись двусмысленна
// («специальный» — это и спецшасси, и пожарная на грузовом шасси), вариантов
// несколько.
export function categoryCandidates(text) {
  const guess = categoryFromVtype(text);
  if (!guess) return [];
  return guess === 'Тракторы и специальные шасси' ? ['Грузовое', guess] : [guess];
}

// --- поиск по справочнику: помощник над каскадом (kernel/treeSearch.js) -----
// Варианты вида объекта — все ветки сразу: базы ТС, виды спецтехники и
// оборудование без машины; путь начинается с вида объекта.
export function kindLeaves() {
  const out = [];
  TS_BASES.filter((b) => b.name !== OTHER).forEach((b) => out.push({
    kind: 'base', category: b.category, base: b.name, name: b.name,
    path: [b.category], extra: [b.hint, b.examples].filter(Boolean).join(' '),
  }));
  TS_SELF_GROUPS.forEach((g) => g.items.forEach((it) => out.push({
    kind: 'self', group: g.group, item: it.name, name: it.name, path: [SELF_CAT, g.group], extra: it.examples,
  })));
  // Оборудование без машины в поиске не предлагается (уходит в механизмы).
  return out;
}

// Модули на машине — путь от группы.
export function moduleLeaves() {
  const out = [];
  TS_MODULE_GROUPS.forEach((g) => g.items.forEach((it) => out.push({
    group: g.group, item: it.name, name: it.name, path: [g.group],
  })));
  return out;
}

// Подставить выбранное в поиске: вид объекта и оба уровня каскада.
export function applyKindLeaf(v, l) {
  v.kind = l.kind;
  if (l.kind === 'base') { v.category = l.category; v.base = l.base; }
  if (l.kind === 'self') { v.selfGroup = l.group; v.selfKind = l.item; }
  if (l.kind === 'module') { v.modGroup = l.group; v.modKind = l.item; }
}

// Выбор дописан до конца: без этого поля машины не показываются — дочернее
// не показывают, пока не выбран родитель (практика каскадных списков).
export function classified(v) {
  if (v.kind === 'base') return !!v.base;
  if (v.kind === 'self') return !!v.selfKind;
  if (v.kind === 'module') return !!v.modKind;
  return false;
}

// Общие поля машины: у ТС — поля базы (у категории со своими заменами — её
// список: у легковых без масс, осей, моточасов, КОМ и комплектности, с
// приводом, комплектацией, батареей и таблицей состояния), у самоходной
// машины — свои.
export const commonFields = (v) => (v.kind === 'self' ? TS_SELF_FIELDS
  : (v.kind === 'base' && TS_BASE_FIELDS_BY_CATEGORY[v.category]) || TS_BASE_FIELDS);
// Подсказки «Тип ТС, вид кузова» — своей категории (замечание пользователя
// 06.10.2026: «В грузовом видно легковые и наоборот»); у спецтехники — свои;
// пока категория не выбрана — всех категорий.
export function vtypeField(v, f) {
  if (!f || f.key !== 'vtype') return f;
  const list = v.kind === 'self' ? TS_VTYPE_SELF
    : TS_VTYPE_BY_CATEGORY[v.category] || TS_VTYPE_BY_CATEGORY['По техпаспорту'] || f.suggest;
  return { ...f, suggest: list };
}
export const isPassenger = (v) => !!v && v.kind === 'base' && v.category === PASSENGER_CAT;

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

// Единица мощности по типу двигателя (решение пользователя 01.10.2026:
// «Электро и гибрид — кВт»): у электрического и гибридного — кВт, у
// остальных — л.с. Тип двигателя в карточке — «Тип топлива» (fuel: Бензин,
// Дизель, Газ, Газ-бензин, Гибрид, Электро), у модуля со своим двигателем —
// ещё и engineKind. Ставится при выборе; поменять вручную можно.
export const POWER_UNIT_BY = ['fuel', 'engineKind'];
export const powerUnitFor = (kind) =>
  !kind ? '' : /Электр|Гибрид/.test(kind) ? 'кВт' : 'л.с.';

// «Создать похожее» — для парка одинаковых машин (развёртка, согласована
// 30.09.2026): переносится то, что у машин одной модели общее, — вид объекта,
// база, характеристики и модули. Не переносится то, что у каждой машины своё:
// номера, регистрация, где стоит, наработка и состояние, особые отметки
// (дополнительные параметры), фото. У модулей — без заводского номера и
// наработки.
const OWN_KEYS = ['vin', 'bodyNo', 'chassisNo', 'engineNo', 'serialNo', 'plate', 'vid', 'regDate', 'docNo',
  'factAddr', 'mileage', 'engineHours', 'hours', 'state', 'kit'];
const pick = (f) => Object.fromEntries(Object.entries(f || {}).filter(([k]) => !OWN_KEYS.some((o) => k === o || k === o + '@unit')));

export function copyVehicle(v) {
  return {
    kind: v.kind, category: v.category, base: v.base, selfGroup: v.selfGroup, selfKind: v.selfKind,
    modGroup: v.modGroup, modKind: v.modKind,
    f: pick(v.f), extra: [],
    modules: v.modules.map((m) => ({ id: nextId('vm'), group: m.group, kind: m.kind, f: pick(m.f), extra: [] })),
  };
}

// Подпись шапки: марка с моделью и то, что стоит на машине.
export function makeWithModules(v) {
  const mods = v.modules.map((m) => m.kind).filter(Boolean);
  return [makeModel(v), ...mods].filter(Boolean).join(' + ');
}

// --- подписи записи -----------------------------------------------------------
// Название — марка и модель, как в техпаспорте; отдельного поля «наименование»
// нет. Пока их нет — то, что уже выбрано в классификации.
export const makeModel = (v) => [v.f.make, v.f.model].map((s) => String(s || '').trim()).filter(Boolean).join(' ');

export function tsTitle(v) {
  return makeModel(v) || whatLabel(v) || 'Новое транспортное средство';
}

export function whatLabel(v) {
  // У категории с одной базой название базы ничего не добавляет
  // («Мототехника · Мототехника») — только категория.
  if (v.kind === 'base') return v.base && v.base !== singleBase(v.category) ? `${v.category} · ${v.base}` : v.category || '';
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
  return 'Не похоже на VIN из 17 знаков';
}

export const normPlate = (value) => String(value || '').toUpperCase().replace(/\s+/g, ' ').trim();

// Из VIN, № кузова и № шасси нужно хотя бы одно — по нему машину опознают
// (правило справочника, поле «Идентификационный номер»).
export const idMissing = (v) => !['vin', 'bodyNo', 'chassisNo'].some((k) => String(v.f[k] || '').trim());
