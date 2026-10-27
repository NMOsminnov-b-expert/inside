// Осмотр ТС осмотрщиком: какие поля каталога он заполняет на месте и какие
// категории у выявленного на осмотре ТС.
//
// Решение пользователя 27.10.2026 — запись графа osmotr-ts-na-meste-i-po-snimkam
// (ответ В1: «осмотрщик не специалист… Надо четко разделять, что заполняется
// по ходу осмотра (само собой с фотографированием), а что по фото уже в
// ЦОД/отделе оценки»). Признак поля «на месте»: значение читается с таблички,
// прибора или документа, считается или меряется рулеткой — без специальных
// знаний. Остальное (состояния, комплектация, КПП, тормоза, привод установки…)
// — «по снимкам»: в форме осмотрщика не показывается.
//
// Перечень ключей держит модуль ТС: подписи, типы, единицы, подсказки и
// значения «по документам» — из каталога (data/tsCatalog.js) и записи ТС, а
// экран осмотрщика получает готовое описание через дверь card.js и
// kernel/registry.js. Карточка ТС (переключатель «Для осмотра» в view.js) не
// меняется: карточки ОЦ пока не трогаем (запись графа kartochki-oc-poka-ne-trogat).
import { TS_MODULE_FIELDS } from './data/tsCatalog.js';
import {
  tsOf, tsTitle, commonFields, specialFields, moduleSpecial, moduleTitle, isTrailer, CATEGORIES, SELF_CAT,
} from './tsModel.js';

// Ключи каталога, которые осмотрщик заполняет на месте, по разделам формы
// (запись графа osmotr-ts-na-meste-i-po-snimkam, пункт «На месте»).
export const TS_ONSITE = {
  // Опознание: рядом — значение «по документам» и пометка расхождения.
  ident: ['plate', 'vin', 'bodyNo', 'chassisNo'],
  // Показания приборов: одометр, счётчик моточасов.
  readings: ['mileage', 'engineHours'],
  // Видно глазом.
  visible: ['axles', 'wheel'],
  // Таблички модуля, моточасы модуля и замеры рулеткой.
  module: ['maker', 'model', 'serialNo', 'year', 'gruzopodemnost', 'hours', 'dlinaPlatformy', 'pogruzochnayaVysota'],
  // Что есть при машине.
  kit: ['kit'],
};

// Поле каталога → описание для формы осмотра: подпись, тип, единицы, подсказка
// каталога и значение из записи ТС (с единицей, если она записана отдельно).
function describe(f, values) {
  const unitSaved = values[f.key + '@unit'];
  return {
    key: f.key,
    label: f.label,
    type: f.type,
    units: f.units || [],
    unit: unitSaved || (f.units || [])[0] || '',
    hint: f.hint || '',
    options: f.options || [],
    // «Осмотр» в каталоге — значение в карточке пришло с прошлого осмотра, а
    // не из документа: рядом с полем подпись «в карточке», как у обмеров ЦОД.
    fromDocs: f.source !== 'Осмотр',
    doc: values[f.key] == null ? '' : String(values[f.key]),
  };
}

const pickFields = (list, keys, values) => keys
  .map((k) => list.find((f) => f.key === k))
  .filter(Boolean)
  .map((f) => describe(f, values));

// Описание формы осмотра одного ТС (ОЦ «ТС» или ОИ «Транспортное средство»):
// поля базы по разделам и по разделу на каждый модуль.
export function tsInspectPlan(holder) {
  const v = tsOf(holder);
  const own = v.kind === 'module'
    ? [...TS_MODULE_FIELDS, ...moduleSpecial(v.modKind)]
    : [...commonFields(v), ...specialFields(v)];
  const f = v.f || {};
  return {
    title: tsTitle(v),
    ident: pickFields(own, TS_ONSITE.ident, f),
    readings: pickFields(own, TS_ONSITE.readings, f),
    visible: pickFields(own, TS_ONSITE.visible, f),
    // Оборудование без машины — само табличка модуля.
    plates: v.kind === 'module' ? pickFields(own, TS_ONSITE.module, f) : [],
    kit: pickFields(own, TS_ONSITE.kit, f),
    modules: (v.modules || []).map((m) => {
      const list = [...TS_MODULE_FIELDS, ...moduleSpecial(m.kind)];
      const mf = m.f || {};
      return {
        id: m.id,
        title: moduleTitle(m),
        fields: pickFields(list, TS_ONSITE.module, mf),
        kit: pickFields(list, TS_ONSITE.kit, mf),
      };
    }),
  };
}

// Держит ли запись или ОИ сведения ТС (ОЦ «ТС» или ОИ «Транспортное
// средство») — для демо назначений ядра, которое видов ОИ не знает.
export const isTsHolder = (x) => !!x && (x.card === 'vehicle' || (!!x.vehicle && !x.card));

// Виды ТС для выявленного на осмотре: категории каталога и спецтехника.
export const tsFoundKinds = () => [...CATEGORIES, SELF_CAT];

// Подпись ТС: марка с моделью и госномер.
export function tsName(holder) {
  const v = tsOf(holder);
  return [tsTitle(v), (v.f || {}).plate].filter(Boolean).join(' · ');
}
