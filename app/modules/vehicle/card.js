// Карточка ТС для других модулей — единственная «дверь» в модуль ТС.
//
// Решение пользователя 23.09.2026: транспортное средство внутри гражданского
// здания — та же карточка «база + модуль», что и ТС как объект оценки, без
// блока сторон («блок 01 не требуется»: там ТС — объект имущества, стороны у
// ОЦ). С 28.09.2026 — в любом типе ОЦ («механизмы могут быть в любом ОЦ…
// аналогично и ТС»). Это исключение из запрета modules/* → modules/*, как у
// карточки земельного участка: карточка одна, правка сразу видна везде.
// Правило проверяет .dependency-cruiser.cjs — разрешён только этот файл.
//
// Стили карточки — vehicle/module.css; модуль-потребитель подключает их сам
// (kernel/registry.js, styleHref) и оборачивает форму в .ts-host.
export { tsFormHTML } from './view.js';
export { bindTsForm } from './ctrl.js';
export { tsOf, tsTitle, whatLabel, makeModel } from './tsModel.js';
export { PHOTO_CATS } from './photos.js';
// Объект имущества «Транспортное средство»: карточка, описание для реестра
// карточек ОИ, создание, подпись и перевод записей прежней карточки.
export {
  vehicleOiCard, vehicleCardMeta, createVehicleOi, migrateVehicleOi, syncVehicleName,
} from './oiCard.js';
// Осмотр ТС осмотрщиком (запись графа osmotr-ts-na-meste-i-po-snimkam): поля
// «на месте», ракурсы снимков, виды выявленного ТС. Экран осмотрщика берёт их
// через kernel/registry.js.
export { TS_ONSITE, tsInspectPlan, tsShots, tsFoundKinds, tsName, isTsHolder } from './inspect.js';
