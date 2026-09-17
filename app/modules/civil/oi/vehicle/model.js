// Данные карточки ОИ «Транспортное средство».
//
// Одно ТС — один объект имущества (решение пользователя 17.09.2026): госномер
// и VIN индивидуальны, и каждая машина видна в перечне ОЦ отдельной строкой.
// Перечня единиц внутри карточки, как у механизмов, здесь поэтому нет.
//
// Состав полей зависит от типа ТС и живёт в data/vehicleFields.js. Значения
// характеристик хранятся в oi.params по ключу поля, единица измерения —
// отдельным ключом «<ключ>@unit»: «2,5» и «т» это разные сведения.
import { vehicleFieldsFor, VEHICLE_REG_FIELDS } from '../../data/vehicleFields.js';
import { paramOf, paramUnit } from '../../parts/fields.js';

// VIN: 17 знаков, латиница верхнего регистра и цифры. Букв I, O и Q в коде не
// бывает — их исключили, чтобы не путать с единицей и нулём (стандарт
// ISO 3779 / 49 CFR 565). Поэтому набранное нормализуем сразу: человек,
// переписывающий VIN с кузова, не должен разбираться, почему поле ругается.
export const VIN_LENGTH = 17;
const VIN_ALLOWED = /[^A-HJ-NPR-Z0-9]/g;

export function normVin(value) {
  return String(value || '').toUpperCase().replace(VIN_ALLOWED, '').slice(0, VIN_LENGTH);
}

export function vinError(value) {
  const v = normVin(value);
  if (!v) return '';
  return v.length === VIN_LENGTH ? '' : `В VIN ${v.length} из ${VIN_LENGTH} знаков`;
}

// Госномер записывается как есть, только без лишних пробелов и в верхнем
// регистре: форматы в республике и у ввезённых машин разные, и подгонять их
// под одну маску значит мешать вводу.
export const normPlate = (value) => String(value || '').toUpperCase().replace(/\s+/g, ' ').trim();

export const vehicleParams = (oi) => (oi.params = oi.params || {});

// Поля характеристик по типу ТС. null — тип ещё не выбран.
export const paramsOf = (oi) => vehicleFieldsFor(oi.vtype);

export const regFields = () => VEHICLE_REG_FIELDS;

export const vehicleParam = (oi, key) => paramOf(oi.params, key);
export const vehicleParamUnit = (oi, f) => paramUnit(oi.params, f);

// Подпись ТС: марка с моделью, а госномер — приметa, по которой машину и
// находят в перечне.
export function vehicleTitle(oi) {
  const name = [oi.brand, oi.model].filter(Boolean).join(' ').trim();
  return name || 'Транспортное средство';
}

export function vehicleSubtitle(oi) {
  return oi.plate || (oi.vtype || '');
}

// Название ОИ — производное от марки, модели и госномера: отдельного поля
// «наименование» у ТС нет, его незачем заполнять руками (так же устроена
// подпись ОИ у механизмов).
export function syncVehicleName(oi) {
  const plate = oi.plate ? ` · ${oi.plate}` : '';
  oi.name = vehicleTitle(oi) + plate;
  return oi.name;
}

export function createVehicleOi(base) {
  const oi = {
    ...base,
    card: 'vehicle',
    name: '',
    // Кода ЕНИ у транспортного средства нет: он присваивается Кадастром
    // недвижимости, а ТС стоит на учёте в органах регистрации транспорта.
    eni: '',
    vtype: '',
    brand: '',
    model: '',
    plate: '',
    vin: '',
    inv: '',
    color: '',
    year: '',
    commissioned: '',
    country: '',
    cost: '',
    params: {},
    comment: '',
    docs: [],
    photos: {},
    photoFiles: {},
    notes: [],
  };
  syncVehicleName(oi);
  return oi;
}
