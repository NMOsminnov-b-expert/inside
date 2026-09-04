// Назначение участка для синтетики — только значения справочника
// LAND_PURPOSE_DOC: поле стало селектом, и формулировка не из справочника
// показалась бы как «Не выбрано». Живёт здесь, рядом с фабрикой участка,
// потому что генераторы всех пяти модулей заполняют один и тот же участок.
const PURPOSE_SAMPLES = [
  'Сельскохозяйственное',
  'Под общественную застройку',
  'Под промышленную застройку',
  'Под индивидуальное жилищное строительство',
];

export const landPurposeSample = (i) => PURPOSE_SAMPLES[Math.abs(i | 0) % PURPOSE_SAMPLES.length];

// Фабрика данных ОИ «Земельный участок» — единый источник для всех модулей,
// у которых есть этот вид ОИ (сознательное исключение из изоляции модулей:
// см. app/README.md и граф знаний, decision про импорт карточки участка).
// nextId/nextEni передаются вызывающим модулем — у каждого свой счётчик.
export function createLandOi(rec, { nextId, nextEni, multiple = false } = {}) {
  const existingCount = rec.oi.filter((o) => o.card === 'land').length;

  return {
    id: nextId('oi-l'),
    card: 'land',
    name: multiple && existingCount ? `Участок №${existingCount + 1}` : 'Земельный участок',
    purpose: '',
    landType: 'Сельскохозяйственный',
    areas: { pravo: '', pravoUd: '', fact: '', build: '' },
    eni: nextEni(rec, rec.eni),
    rights: '',
    rightsOther: '',
    useCategory: '',
    irrigation: '',
    soil: '',
    bonitet: '',
    stoniness: '',
    utilities: { electricity: false, water: false, sewerage: false, heating: false },
    form: '',
    location: '',
    locationFeatures: '',
    roadLocation: '',
    corner: '',
    encumbrance: 'Нет',
    encumbranceArea: '',
    encumbranceNote: '',
    landCategory: '',
    // Поля «наличие/тип/площадь построек» убраны 04.09.2026: их заменил
    // список вспомогательных построек (buildings.js) — там и состав, и
    // площадь каждой постройки, а не одно суммарное число.
    gasification: '',
    centralHeating: '',
    centralWater: '',
    electricity: '',
    sewerage: '',
    gps: '',
    zone: '',
    microdistrict: '',
    distanceToCenter: '',
    auxBuildings: [],
    improvementRank: '',
    improvementNote: '',
    // Статус участка убран из карточки 04.09.2026 (этап процесса ведётся у
    // объекта оценки), но поле остаётся в данных: на него смотрит перечень ОИ
    // и лог правок прежних записей.
    status: 'Основное',
    flags: { entered: false, matched: false },
    docs: [],
    photos: {},
    notes: [],
  };
}
