// Правила состава ОЦ «Земельный участок».
// Участков может быть несколько (каждый со своим ЕНИ), строения — опционально.
export const OI_TYPES = [
  { label: 'Земельный участок', card: 'land' },
  { label: 'Прочее строение', card: 'building' },
];

export function oiTypeByLabel(label) {
  return OI_TYPES.find((t) => t.label === label) || null;
}
