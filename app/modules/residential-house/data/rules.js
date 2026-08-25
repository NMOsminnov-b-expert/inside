// Правила состава именно этого типа ОЦ.
// card — идентификатор карточки ОИ внутри этого модуля (см. oi/registry.js).
export const OI_TYPES = [
  { label: 'Земельный участок', card: 'land', single: true },
  { label: 'Квартира', card: 'apartment' },
  { label: 'Жилой дом', card: 'building' },
  { label: 'Прочее строение', card: 'building' },
];

export function oiTypeByLabel(label) {
  return OI_TYPES.find((t) => t.label === label) || null;
}
