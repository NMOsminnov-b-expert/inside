// Что модуль «Транспортные средства» отдаёт в раздел «Справочники».
//
// Устройство то же, что у остальных модулей: сами значения лежат в
// dictionaries.js, здесь — описание, какой перечень становится справочником и
// к какому полю привязан. Карточка у этого типа ОЦ одна — сам объект оценки:
// объектов имущества внутри ТС нет.
import * as D from './dictionaries.js';

const list = (key, title, values, field, label) => ({
  key,
  title,
  kind: 'list',
  system: false,
  values,
  slots: [{ card: 'oc', field, label }],
});

export const DICT_SOURCES = [
  list('VEHICLE_TYPE', 'Тип транспортного средства', D.VEHICLE_TYPES.map(([, label]) => label),
    'type', 'Тип ТС'),
  list('VEHICLE_GEARBOX', 'Коробка передач', D.GEARBOX, 'gearbox', 'Тип КПП'),
  list('VEHICLE_FUEL', 'Топливо', D.FUEL, 'fuel', 'Тип топлива с завода'),
  list('VEHICLE_STEERING', 'Расположение руля', D.STEERING, 'steering', 'Расположение руля'),
  list('VEHICLE_CARGO', 'Вид грузового ТС', D.CARGO_TYPES, 'cargoType', 'Тип (грузовое)'),
  list('VEHICLE_SPECIAL', 'Вид спецтехники', D.SPECIAL_TYPES, 'specialType', 'Тип (спецтехника)'),
  list('VEHICLE_TRAILER', 'Вид прицепа', D.TRAILER_TYPES, 'trailerType', 'Тип (прицеп)'),
  list('VEHICLE_BODY', 'Тип кузова прицепа', D.BODY_TYPES, 'body', 'Тип кузова'),
];
