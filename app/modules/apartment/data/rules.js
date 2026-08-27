// Правила состава ОЦ «Жилое здание (квартира)».
export const OI_TYPES = [
  // Участок доступен и в квартире — структура «участок → литеры» одна на все
  // типы ОЦ (решение пользователя 2026-08-27). Пока участок не заведён,
  // литеры лежат в группе «Без участка».
  { label: 'Земельный участок', card: 'land' },
  { label: 'Квартира', card: 'apartment' },
  { label: 'Прочее строение', card: 'building' },
];

export function oiTypeByLabel(label) {
  return OI_TYPES.find((t) => t.label === label) || null;
}
