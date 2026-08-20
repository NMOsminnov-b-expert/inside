// Правила состава ОЦ «Жилое здание (квартира)».
export const OI_TYPES = [
  { label: 'Квартира', card: 'apartment' },
  { label: 'Прочее строение', card: 'building' },
];

export function oiTypeByLabel(label) {
  return OI_TYPES.find((t) => t.label === label) || null;
}
