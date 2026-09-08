// Правила состава ОЦ «Механизмы и оборудование».
//
// У этого типа ОЦ нет объектов имущества вообще: сам ОЦ уже единица техники
// (подтверждено пользователем). Поэтому здесь нет ни «+ Добавить ОИ», ни видов
// ОИ — списки пустые, но экспортируются в той же форме, что у остальных
// модулей: kernel/typeChange.js читает records.oiTypes при смене вида ОИ у
// записей, приехавших из других типов, и ожидает массив (пусть и пустой).
export const REALTY_OI_TYPES = [];
export const MOVABLE_OI_TYPES = [];

export function realtyTypes() {
  return REALTY_OI_TYPES;
}

export function movableTypes() {
  return MOVABLE_OI_TYPES;
}

export function oiTypeByLabel() {
  return null;
}
