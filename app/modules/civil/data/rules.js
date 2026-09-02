// Правила состава ОЦ «Гражданское здание».
//
// Недвижимость: в объект оценки любого типа можно добавить любой недвижимый ОИ
// — участок, квартиру, жилой дом, гражданское, производственное или прочее
// строение (решение пользователя 02.09.2026). Ограничений по типу ОЦ нет:
// какой ОИ реально стоит на объекте, знает только оценщик.
//
// card — идентификатор карточки ОИ внутри ЭТОГО модуля (см. oi/registry.js);
// residential помечает жилое строение, catClass — класс ОИ по умолчанию.
export const REALTY_OI_TYPES = [
  { label: 'Земельный участок', card: 'land' },
  { label: 'Квартира', card: 'apartment' },
  { label: 'Гражданское здание', card: 'building' },
  { label: 'Производственное строение', card: 'building',
    catClass: 'Производственно-складское' },
  { label: 'Жилой дом', card: 'building', residential: true },
  { label: 'Прочее строение', card: 'building' },
];

export const MOVABLE_OI_TYPES = [
  { label: 'Механизмы и производственное оборудование', card: 'movable', kind: 'МЕХ', wizard: 'mech' },
  { label: 'Офисная техника и мебель', card: 'movable', kind: 'ОФИС', wizard: 'office' },
];

export function realtyTypes() {
  return REALTY_OI_TYPES;
}

// Движимое — только у имущественного комплекса, как было.
export function movableTypes(rec) {
  return rec && rec.complex ? MOVABLE_OI_TYPES : [];
}

export function oiTypeByLabel(label, rec) {
  return [...REALTY_OI_TYPES, ...movableTypes(rec)].find((t) => t.label === label) || null;
}
