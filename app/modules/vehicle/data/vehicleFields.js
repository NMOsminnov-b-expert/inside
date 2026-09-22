// Поля карточки транспортного средства по типу ТС.
//
// Состав задан пользователем 18.09.2026 — по типам ТС и по ЭТАПАМ работы:
//   passport — то, что переписывают с документов и шильдиков (ЦОД);
//   inspect  — то, что определяют на осмотре: состояния узлов и комплектность.
// Разделение на этапы и есть причина двух списков: на карточке они стоят
// разными блоками, потому что заполняют их разные люди и в разное время.
//
// Справочник живёт в модуле транспортных средств, а карточка объекта имущества
// в гражданском здании берёт его отсюда: одно и то же ТС должно описываться
// одинаково, чем бы оно ни было заведено — объектом оценки или объектом
// имущества. Это второе осознанное исключение из запрета «modules/* →
// modules/*» (первое — карточка земельного участка).
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: состав полей — справочник, который правят без
// программиста; здесь он в коде макета.
import { text, num, int, sel, area } from '../../../kernel/fieldSpec.js';
import * as D from './dictionaries.js';

// Тип ТС — корень каскада: от него зависят и характеристики, и состав осмотра.
// Значения перечней — в data/dictionaries.js: оттуда они попадают в раздел
// «Справочники» и правятся без разработчика.
export const VEHICLE_TYPES = D.VEHICLE_TYPES;

const state = (key, label) => sel(key, label, D.WEAR);

// --- поля, общие для нескольких типов ---------------------------------------
// Одинаковый ключ — одно и то же поле: при смене типа значение остаётся.
const ENGINE_KIND = sel('engineKind', 'Тип двигателя', D.ENGINE_KIND);
const ENGINE_VOLUME = int('engineVolume', 'Объём двигателя, куб. см');
const GEARBOX = sel('gearbox', 'Тип КПП', D.GEARBOX);
const BODY_NO = text('bodyNo', 'Кузов №');
const MILEAGE = int('mileage', 'Пробег, км');
const HOURS = int('engineHours', 'Наработка, моточасы');
const LOAD = num('loadCapacity', 'Грузоподъёмность', ['т', 'кг']);
const AXLES = int('axles', 'Число осей');
const WHEELS = text('wheelFormula', 'Колёсная формула', { hint: 'Например: 4x2, 6x4' });

// Спецтехника. Параметры в таблице сводные, по две величины в одном
// («Марка (модель) и заводской/серийный номер (VIN)», «Объём двигателя /
// мощность», «Наработка (моточасы/пробег)», «Эксплуатационная масса /
// грузоподъёмность»): здесь каждая величина — своё поле. Марка и модель, VIN и
// год выпуска уже есть в опознавательном блоке; заводской номер — отдельно:
// у спецтехники VIN бывает не всегда. «Тип питания» погрузчиков — это тип
// двигателя, отдельного поля нет.
const SERIAL = text('serialNo', 'Заводской (серийный) номер');
const POWER = num('power', 'Мощность двигателя', ['л.с.', 'кВт']);
const OP_MASS = num('operatingMass', 'Эксплуатационная масса', ['т', 'кг']);
const LIFT_H = num('liftHeight', 'Высота подъёма, м');
// Навесное и сменное оборудование — плуги, сеялки, оросительное, отвалы,
// щётки, ковши. Как правило вписывается и оценивается в составе машины, на
// которой работает, одним объектом; но может оцениваться и отдельной записью —
// вид «Прицепная и навесная сельхозтехника» (решение пользователя 22.09.2026,
// оба пути нужны). Колёсная и гусеничная техника — ТС одинаково.
const ATTACH = area('attachmentsList', 'Навесное и сменное оборудование',
  { hint: 'Наименование, количество, состояние каждой единицы' });

const OTHER = text('otherParts', 'Прочие элементы');
const KIT = area('kit', 'Комплектация');

// Осмотр кузовной техники — один и тот же набор у легковой и лёгкого
// коммерческого (указание пользователя: «то же, что у легковой»).
const CAR_INSPECT = [
  state('stBody', 'Состояние кузова и окраски'),
  state('stCabin', 'Состояние салона'),
  state('stEngine', 'Состояние двигателя'),
  state('stChassis', 'Состояние ходовой части'),
  state('stElectric', 'Состояние электрооборудования'),
  OTHER, KIT,
];

const CAR_BODY = sel('bodyType', 'Тип кузова', D.CAR_BODY);

const VAN_BODY = sel('bodyType', 'Тип кузова', D.VAN_BODY);

const TRUCK_BODY = sel('superstructure', 'Тип надстройки', D.TRUCK_SUPER);

// Осмотр спецтехники. В таблице его нет — ЧЕРНОВИК на согласование: узлы
// грузовой техники плюс гидравлика и рабочее оборудование, которые у
// спецтехники и определяют её состояние.
const SPEC_INSPECT = [
  state('stCab', 'Состояние кабины и окраски'),
  state('stEngine', 'Состояние двигателя'),
  state('stChassis', 'Состояние ходовой части'),
  state('stHydraulics', 'Состояние гидравлики'),
  state('stWorkGear', 'Состояние рабочего оборудования'),
  state('stElectric', 'Состояние электрооборудования'),
  OTHER, KIT,
];

export const VEHICLE_FIELDS = {
  'Легковая': {
    passport: [CAR_BODY, ENGINE_KIND, ENGINE_VOLUME, GEARBOX, BODY_NO, MILEAGE],
    inspect: CAR_INSPECT,
  },

  'Лёгкий коммерческий (до 3,5 т)': {
    passport: [
      VAN_BODY, LOAD,
      sel('drive', 'Привод', D.DRIVE),
      ENGINE_KIND, ENGINE_VOLUME, GEARBOX, BODY_NO, MILEAGE,
    ],
    inspect: CAR_INSPECT,
  },

  'Грузовой (свыше 3,5 т)': {
    passport: [
      TRUCK_BODY, WHEELS,
      num('grossMass', 'Разрешённая максимальная масса', ['т', 'кг']),
      LOAD, ENGINE_KIND, ENGINE_VOLUME, GEARBOX, BODY_NO, MILEAGE, HOURS,
    ],
    inspect: [
      state('stCab', 'Состояние кабины и окраски'),
      state('stFrame', 'Состояние рамы'),
      state('stSuper', 'Состояние надстройки'),
      state('stEngine', 'Состояние двигателя'),
      state('stChassis', 'Состояние ходовой части'),
      state('stElectric', 'Состояние электрооборудования'),
      OTHER, KIT,
    ],
  },

  'Седельный тягач': {
    passport: [
      WHEELS,
      num('power', 'Мощность', 'л.с.'),
      sel('cabType', 'Тип кабины', D.CAB_TYPE),
      ENGINE_KIND, ENGINE_VOLUME, GEARBOX, BODY_NO, MILEAGE, HOURS,
    ],
    inspect: [
      state('stCab', 'Состояние кабины и окраски'),
      state('stFrame', 'Состояние рамы'),
      state('stEngine', 'Состояние двигателя'),
      state('stChassis', 'Состояние ходовой части'),
      state('stElectric', 'Состояние электрооборудования'),
      OTHER, KIT,
    ],
  },

  'Автобус': {
    passport: [
      sel('busUse', 'Назначение', D.BUS_USE),
      sel('busClass', 'Класс', D.BUS_CLASS),
      int('seats', 'Пассажировместимость, мест'),
      ENGINE_KIND, ENGINE_VOLUME, GEARBOX, BODY_NO, MILEAGE,
    ],
    inspect: [
      state('stBody', 'Состояние кузова и окраски'),
      state('stCabin', 'Состояние салона'),
      state('stEngine', 'Состояние двигателя'),
      state('stChassis', 'Состояние ходовой части'),
      state('stElectric', 'Состояние электрооборудования'),
      OTHER,
      area('comfortKit', 'Комфорт и комплектация'),
    ],
  },

  'Прицеп легковой': {
    passport: [
      sel('trailerUse', 'Назначение', D.TRAILER_LIGHT_USE),
      AXLES, LOAD,
      text('platform', 'Габариты платформы', { hint: 'Длина × ширина × высота борта, мм' }),
    ],
    inspect: [
      state('stBody', 'Состояние кузова и окраски'),
      state('stFrame', 'Состояние рамы'),
      state('stFloor', 'Состояние пола'),
      state('stChassis', 'Состояние ходовой части'),
      OTHER, KIT,
    ],
  },

  'Прицеп и полуприцеп грузовой': {
    passport: [
      sel('trailerKind', 'Тип', D.TRAILER_KIND),
      sel('trailerUse', 'Назначение', D.TRAILER_CARGO_USE),
      AXLES, LOAD,
    ],
    inspect: [
      state('stBody', 'Состояние кузова и окраски'),
      state('stFrame', 'Состояние рамы'),
      state('stFloor', 'Состояние пола'),
      state('stTent', 'Состояние тента'),
      state('stChassis', 'Состояние ходовой части'),
      OTHER, KIT,
    ],
  },

  'Мототранспорт': {
    passport: [
      sel('motoKind', 'Тип', D.MOTO_KIND),
      ENGINE_VOLUME, GEARBOX,
      text('frameNo', 'Рама №'),
      text('engineNo', 'Двигатель №'),
      MILEAGE, HOURS,
    ],
    inspect: [
      state('stFrameBody', 'Состояние рамы и обвеса'),
      state('stEngine', 'Состояние двигателя'),
      state('stChassis', 'Состояние ходовой части'),
      state('stElectric', 'Состояние электрооборудования'),
      OTHER, KIT,
    ],
  },
};

// --- спецтехника: по подгруппе таблицы, вид — первым полем -----------------
Object.assign(VEHICLE_FIELDS, {
  'Строительная спецтехника': {
    passport: [
      sel('specKind', 'Вид техники', D.SPEC_CONSTRUCTION), SERIAL,
      sel('undercarriage', 'Тип ходовой части', D.UNDERCARRIAGE),
      OP_MASS, LOAD, ENGINE_KIND, ENGINE_VOLUME, POWER, HOURS, MILEAGE, ATTACH,
    ],
    inspect: SPEC_INSPECT,
  },

  'Коммунальная спецтехника': {
    passport: [
      sel('specKind', 'Вид техники', D.SPEC_MUNICIPAL), SERIAL,
      num('bodyVolume', 'Объём кузова / цистерны / бункера, м³'),
      ENGINE_KIND, ENGINE_VOLUME, POWER, HOURS, MILEAGE, ATTACH,
    ],
    inspect: SPEC_INSPECT,
  },

  'Сельскохозяйственная спецтехника': {
    passport: [
      sel('specKind', 'Вид техники', D.SPEC_AGRO), SERIAL,
      sel('hitch', 'Тип агрегатирования', D.HITCH),
      num('productivity', 'Производительность, га/ч'),
      num('workWidth', 'Ширина захвата, м'),
      ENGINE_KIND, ENGINE_VOLUME, POWER, HOURS, ATTACH,
    ],
    inspect: SPEC_INSPECT,
  },

  'Погрузочно-разгрузочная спецтехника': {
    passport: [
      sel('specKind', 'Вид техники', D.SPEC_LOADER), SERIAL,
      LOAD, LIFT_H, ENGINE_KIND, ENGINE_VOLUME, POWER, HOURS, ATTACH,
    ],
    inspect: SPEC_INSPECT,
  },

  'Грузоподъёмная самоходная спецтехника': {
    passport: [
      sel('specKind', 'Вид техники', D.SPEC_LIFT), SERIAL,
      LOAD, num('boomReach', 'Максимальный вылет стрелы, м'), LIFT_H,
      ENGINE_KIND, ENGINE_VOLUME, POWER, HOURS, MILEAGE, ATTACH,
    ],
    inspect: SPEC_INSPECT,
  },
});

// Состав полей по типу ТС. null — тип ещё не выбран, и полей не знаем.
export function vehicleFieldsFor(type) {
  const d = VEHICLE_FIELDS[type];
  if (!d) return null;
  return { passport: d.passport || [], inspect: d.inspect || [] };
}

// Все ключи полей всех типов — для переноса значений и проверок состава.
export function allVehicleKeys() {
  const out = new Set();
  Object.values(VEHICLE_FIELDS).forEach((d) => {
    [...(d.passport || []), ...(d.inspect || [])].forEach((f) => out.add(f.key));
  });
  return [...out];
}
