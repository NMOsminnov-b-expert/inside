// Правила состава именно этого типа ОЦ.
// card — идентификатор карточки ОИ внутри этого модуля (см. oi/registry.js).
export const OI_TYPES = [
  // single убран: участков на объекте может быть несколько (Л2.2, Л4.6).
  { label: 'Земельный участок', card: 'land' },
  { label: 'Квартира', card: 'apartment' },
  { label: 'Жилой дом', card: 'building' },
  { label: 'Прочее строение', card: 'building' },
];

export function oiTypeByLabel(label) {
  return OI_TYPES.find((t) => t.label === label) || null;
}
