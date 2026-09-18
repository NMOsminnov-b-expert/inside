// Что модуль «Транспортные средства» отдаёт в раздел «Справочники».
//
// Устройство то же, что у остальных модулей: сами значения лежат в
// dictionaries.js (оттуда их берут и поля карточки — data/vehicleFields.js),
// здесь — описание, какой перечень становится справочником и к какому полю
// привязан. Карточка у этого типа ОЦ одна — сам объект оценки: объектов
// имущества внутри ТС нет.
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
  list('VEHICLE_TYPE', 'Тип транспортного средства', D.VEHICLE_TYPES, 'type', 'Тип ТС'),
  list('VEHICLE_WEAR', 'Состояние узлов при осмотре', D.WEAR, 'stEngine', 'Состояние узла'),
  list('VEHICLE_ENGINE', 'Тип двигателя', D.ENGINE_KIND, 'engineKind', 'Тип двигателя'),
  list('VEHICLE_GEARBOX', 'Тип КПП', D.GEARBOX, 'gearbox', 'Тип КПП'),
  list('VEHICLE_DRIVE', 'Привод', D.DRIVE, 'drive', 'Привод'),
  list('VEHICLE_CAR_BODY', 'Тип кузова легковой', D.CAR_BODY, 'bodyType', 'Тип кузова'),
  list('VEHICLE_VAN_BODY', 'Тип кузова лёгкого коммерческого', D.VAN_BODY, 'bodyType', 'Тип кузова'),
  list('VEHICLE_SUPER', 'Тип надстройки грузового', D.TRUCK_SUPER, 'superstructure', 'Тип надстройки'),
  list('VEHICLE_CAB', 'Тип кабины тягача', D.CAB_TYPE, 'cabType', 'Тип кабины'),
  list('VEHICLE_BUS_USE', 'Назначение автобуса', D.BUS_USE, 'busUse', 'Назначение'),
  list('VEHICLE_BUS_CLASS', 'Класс автобуса', D.BUS_CLASS, 'busClass', 'Класс'),
  list('VEHICLE_TRAILER_KIND', 'Вид прицепа', D.TRAILER_KIND, 'trailerKind', 'Тип'),
  list('VEHICLE_TRAILER_LIGHT', 'Назначение легкового прицепа', D.TRAILER_LIGHT_USE,
    'trailerUse', 'Назначение'),
  list('VEHICLE_TRAILER_CARGO', 'Назначение грузового прицепа', D.TRAILER_CARGO_USE,
    'trailerUse', 'Назначение'),
  list('VEHICLE_MOTO', 'Вид мототранспорта', D.MOTO_KIND, 'motoKind', 'Тип'),
];
