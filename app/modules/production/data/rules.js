// Правила состава ОЦ «Производственное строение».
export const REALTY_OI_TYPES = [
  { label: 'Земельный участок', card: 'land', single: true },
  { label: 'Производственное строение', card: 'building', catClass: 'Производственно-складское' },
  { label: 'Гражданское здание', card: 'building' },
  { label: 'Прочее строение', card: 'building' },
];

export const MOVABLE_OI_TYPES = [
  { label: 'Механизмы и производственное оборудование', card: 'movable', kind: 'МЕХ', wizard: 'mech' },
  { label: 'Офисная техника и мебель', card: 'movable', kind: 'ОФИС', wizard: 'office' },
];

export function realtyTypes() {
  return REALTY_OI_TYPES;
}

export function movableTypes(rec) {
  return rec && rec.complex ? MOVABLE_OI_TYPES : [];
}

export function oiTypeByLabel(label, rec) {
  return [...REALTY_OI_TYPES, ...movableTypes(rec)].find((t) => t.label === label) || null;
}
