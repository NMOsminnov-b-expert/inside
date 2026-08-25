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
    areas: { pravo: '', fact: '', build: '' },
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
    buildings: 'Нет',
    buildingType: '',
    buildingArea: '',
    gasification: '',
    centralHeating: '',
    centralWater: '',
    autonomousHeating: '',
    status: 'Основное',
    flags: { entered: false, matched: false },
    docs: [],
    photos: {},
    notes: [],
  };
}
