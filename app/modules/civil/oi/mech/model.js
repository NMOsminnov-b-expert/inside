// Модель ОИ «Механизмы и оборудование».
//
// Один ОИ — ПЕРЕЧЕНЬ единиц техники, а не одна единица (решение пользователя
// 07.09.2026, ветка mech): на участке может стоять десяток однотипных
// механизмов, и заводить на каждый отдельный объект имущества незачем.
//
//   oi.mechanisms = [{
//     id, name, inv,             // наименование и инвентарный номер
//     cls, sub, type,            // классификация: класс → подгруппа → тип
//     year,                      // год ввода в эксплуатацию
//     country,                   // страна происхождения (не у всех категорий)
//     params: {ключ: значение, 'ключ@unit': единица},  // поля категории
//     extra: [{id, label, value}],   // свои поля, которых нет в справочнике
//     comment,                   // сведения, для которых не нашлось поля
//     qty, cost,                 // количество и балансовая стоимость
//   }]
//
// Состав полей категории — data/mechFields.js: там каждый сводный параметр
// таблицы разбит на отдельные поля, а перечисления стали списками.
//
// Фото лежат на самом ОИ, в oi.photos / oi.photoFiles, с категорией = id
// единицы. Так снимки попадают в общий просмотрщик, счётчик фото в перечне ОИ
// и в раздел «Фото» записи без отдельной механики, а подпись категории
// подставляет карточка (photoCatLabel).
import { MECH_CLASSIFIER } from '../../data/mechClassifier.js';
import { MECH_EXTRA_CLASSES, fieldsFor } from '../../data/mechFields.js';

let seq = 1;
const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

// Классы: из таблицы плюс те, что есть только на листе «Схема» (см.
// mechFields.js, MECH_EXTRA_CLASSES) — без них не описать станки и линии.
const CLASSES = MECH_CLASSIFIER.classes.concat(MECH_EXTRA_CLASSES);

export function mechUnits(oi) {
  if (!oi) return [];
  if (!Array.isArray(oi.mechanisms)) oi.mechanisms = [];
  return oi.mechanisms;
}

export function createUnit(patch = {}) {
  return {
    id: uid('mu'),
    name: '',
    inv: '',
    cls: '', sub: '', type: '',
    year: '', country: '',
    params: {},
    extra: [],
    comment: '',
    qty: '1',
    cost: '',
    ...patch,
  };
}

// --- Классификатор --------------------------------------------------------

export const classNames = () => CLASSES.map((c) => c.name);

export function classOf(name) {
  return CLASSES.find((c) => c.name === name) || null;
}

export function subgroupOf(clsName, subName) {
  const c = classOf(clsName);
  return c ? c.subgroups.find((s) => s.name === subName) || null : null;
}

// Есть ли у класса подгруппы. Класс с одним названием в таблице — без
// подгрупп — подгруппу и тип не спрашивает (сейчас это «Прочее», см.
// mechFields.js, MECH_CLASS_FIELDS).
export const hasSubgroups = (clsName) => !!(classOf(clsName) || { subgroups: [] }).subgroups.length;

// Поля единицы по её классу, подгруппе и типу (data/mechFields.js). Пока
// классификация не выбрана настолько, чтобы знать состав, — пусто: показывать
// чужие поля «на всякий случай» значит предлагать заполнять то, что к механизму
// не относится.
export function paramsOf(unit) {
  const f = unit ? fieldsFor(unit.cls, unit.sub, unit.type) : null;
  return f || { main: [], extra: [], country: false };
}

// Спрашивать ли страну происхождения: только у значимого оборудования —
// станки, линии, энергетика, медицина, лаборатория (решение пользователя
// 17.09.2026). У мебели и оргтехники страна для оценки не важна.
export const asksCountry = (unit) => !!paramsOf(unit).country;

// Значение поля и его единица измерения. Единица хранится отдельным ключом —
// это разные сведения: «400» и «кВА».
export const unitParam = (unit, key) => ((unit && unit.params) || {})[key] || '';
export const unitParamUnit = (unit, field) => {
  const v = unitParam(unit, field.key + '@unit');
  return v || (field.units && field.units.length ? field.units[0] : '');
};

// Смена класса сбрасывает подгруппу и тип, смена подгруппы — тип (практика
// каскадных списков: зависимый выбор без родителя теряет смысл). Если у
// родителя единственный вариант, он подставляется сам.
//
// Значения параметров НЕ стираются: они лежат по подписи параметра. Общие для
// двух подгрупп («Марка (модель) и заводской номер») остаются видны после
// смены, остальные просто скрываются и вернутся, если подгруппу выбрать
// обратно, — набранное пользователем молча не пропадает.
export function setClass(unit, name) {
  unit.cls = name;
  unit.sub = '';
  unit.type = '';
  const c = classOf(name);
  if (c && c.subgroups.length === 1) setSub(unit, c.subgroups[0].name);
}

export function setSub(unit, name) {
  unit.sub = name;
  unit.type = '';
  const s = subgroupOf(unit.cls, name);
  if (s && s.types.length === 1) unit.type = s.types[0];
}

// --- Подписи ----------------------------------------------------------------

// Название единицы для перечня: своё название, иначе тип, иначе подгруппа или
// класс — чтобы у только что заведённой строки была понятная подпись, а не
// пустое место.
export function unitTitle(unit) {
  return (unit && (unit.name || unit.type || unit.sub || unit.cls)) || 'Механизм без названия';
}

export function unitClassPath(unit) {
  return [unit.cls, unit.sub, unit.type].filter(Boolean).join(' › ');
}

// Подпись ОИ целиком — для перечня ОИ, крошек и плашки.
//
// Название списка (oi.groupName) — название списка, номер счёта по балансу или
// МОЛ. Если оно указано, ОИ называется по нему: оно описывает группу целиком и
// важнее названия первой единицы.
export function mechListLabel(oi) {
  if (oi && oi.groupName) return oi.groupName;
  const list = mechUnits(oi);
  if (!list.length) return 'Механизмы и оборудование';
  const first = unitTitle(list[0]);
  return list.length > 1 ? `${first} (+${list.length - 1})` : first;
}

// oi.name у этого вида — производная подпись, а не поле ввода. Её читают
// десятки мест модуля (плашка, перечень ОИ, крошки, лог, фото, просмотрщик),
// поэтому она держится в актуальном виде здесь, при каждой правке состава,
// а не вычисляется в каждом из этих мест отдельно.
//
// Там же — подписи категорий фото: снимки единицы лежат в категории с её id,
// а показывать надо название (parts/photos/model.js, catLabel).
export function syncMechName(oi) {
  if (!oi || oi.card !== 'mech') return;
  oi.name = mechListLabel(oi);
  oi.photoCatNames = Object.fromEntries(mechUnits(oi).map((u) => [u.id, unitTitle(u)]));
}

// --- Числа ------------------------------------------------------------------

const numOf = (v) => {
  const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export const totalQty = (oi) => mechUnits(oi).reduce((s, u) => s + numOf(u.qty), 0);
export const totalCost = (oi) => mechUnits(oi).reduce((s, u) => s + numOf(u.cost), 0);
export const hasCost = (oi) => mechUnits(oi).some((u) => String(u.cost || '').trim());

// --- Фото -------------------------------------------------------------------

export const unitPhotoCount = (oi, unit) => ((oi.photos || {})[unit.id]) || 0;

export function dropUnitPhotos(oi, unit) {
  if (oi.photos) delete oi.photos[unit.id];
  if (oi.photoFiles) delete oi.photoFiles[unit.id];
}

// --- Создание и перенос старых данных -------------------------------------

export function createMechOi(base) {
  const unit = createUnit();
  return {
    ...base,
    card: 'mech',
    name: 'Механизм без названия',
    eni: '',
    letter: '',
    status: '',
    mechanisms: [unit],
    groupName: '',
    docs: [],
    photos: {},
    notes: [],
  };
}

// Прежний ОИ «movable» (механизм или офисная техника, одиночный или комплекс)
// переводится в перечень единиц. Делается до отрисовки — иначе перенос попал
// бы в лог правок как правка человека (тот же приём, что у migrateStruct).
//
// Ничего не теряется: год остаётся годом, заводской номер и код ЕНИ уходят в
// свои поля (у механизма кода ЕНИ нет — решение пользователя 07.09.2026), а
// каждый узел комплекса становится отдельной единицей того же ОИ. Офисная
// техника сразу получает свой класс — он однозначен.
export function migrateMovable(rec) {
  if (!rec || !Array.isArray(rec.oi)) return;

  rec.oi.forEach((oi) => {
    if (oi.card !== 'movable') return;

    const office = oi.kind === 'ОФИС';
    const cls = office ? 'Офисное оборудование и мебель' : '';
    const field = (label, value) => (value ? [{ id: uid('mf'), label, value: String(value) }] : []);

    const units = Array.isArray(oi.complexItems) && oi.complexItems.length
      ? oi.complexItems.map((it) => createUnit({
        name: it.name || '',
        cls,
        extra: [...field('Узел комплекса', it.type), ...field('Код ЕНИ', it.eni)],
      }))
      : [createUnit({
        name: oi.name || '',
        cls,
        year: oi.year || '',
        extra: [...field('Заводской номер', oi.serial), ...field('Код ЕНИ', oi.eni)],
      })];

    const complex = Array.isArray(oi.complexItems) && oi.complexItems.length;

    oi.card = 'mech';
    oi.mechanisms = units;
    // Название комплекса описывает группу — оно остаётся у ОИ. У одиночного
    // механизма название переехало в единицу, дублировать его незачем.
    if (complex && oi.name) oi.groupName = oi.name;
    oi.eni = '';
    delete oi.kind;
    delete oi.year;
    delete oi.serial;
    delete oi.complexItems;
    syncMechName(oi);
  });
}


// --- Перенос прежней формы единиц ------------------------------------------
//
// Первая версия карточки хранила параметры по ПОДПИСИ из таблицы и держала одно
// поле «Производитель (страна происхождения)». После разбора таблицы на поля
// (data/mechFields.js) значения переносятся: страна — в своё поле,
// инвентарный номер — из своих полей в собственное, а параметры со старыми
// подписями уходят в «свои поля»: сопоставлять их с новыми автоматически
// нельзя, но и терять нельзя — пусть человек перенесёт их глазами.
export function migrateMechUnits(rec) {
  if (!rec || !Array.isArray(rec.oi)) return;

  rec.oi.forEach((oi) => {
    if (oi.card !== 'mech') return;

    mechUnits(oi).forEach((u) => {
      if (u.maker) {
        u.country = u.country || u.maker;
        delete u.maker;
      }
      if (u.inv === undefined) u.inv = '';

      u.extra = (u.extra || []).filter((f) => {
        if (String(f.label || '').toLowerCase().indexOf('инвентарный номер') < 0) return true;
        if (!u.inv) u.inv = f.value;
        return false;
      });

      const known = new Set();
      const f = fieldsFor(u.cls, u.sub, u.type);
      if (f) [...f.main, ...f.extra].forEach((x) => known.add(x.key));

      Object.keys(u.params || {}).forEach((key) => {
        if (key.endsWith('@unit') || known.has(key)) return;
        const value = u.params[key];
        delete u.params[key];
        delete u.params[key + '@unit'];
        if (value) u.extra.push({ id: uid('mf'), label: key, value: String(value) });
      });
    });

    syncMechName(oi);
  });
}
