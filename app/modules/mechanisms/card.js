// Механизмы и оборудование для других модулей — единственная «дверь» в модуль
// «Механизмы и оборудование».
//
// Решение пользователя 28.09.2026: механизмы бывают в любом ОЦ и
// самостоятельным ОЦ; карточка одна на весь проект, правка сразу видна везде.
// Третье исключение из запрета modules/* → modules/* — после карточки
// земельного участка и карточки ТС (vehicle/card.js). Правило проверяет
// .dependency-cruiser.cjs — разрешён только этот файл.
//
// Стили формы — mechanisms/module.css; модуль-потребитель подключает их сам
// (kernel/registry.js, styleHref).
export { mechOiCard, mechCardMeta } from './oiCard.js';
export { mechFormHTML } from './form/view.js';
export { bindMechForm } from './form/ctrl.js';
export {
  mechUnits, createUnit, syncMechName, createMechOi, migrateMovable, migrateMechUnits,
  totalQty, totalCost, unitTitle, mechListLabel,
} from './form/model.js';
export { catLabel as mechCatLabel } from './photos.js';
