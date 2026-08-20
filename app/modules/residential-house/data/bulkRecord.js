// Полная запись синтетического ОЦ собирается лениво — при открытии карточки.
// Параметры те же, что использовались для сводки, поэтому список и карточка
// не расходятся.
import { fmt } from '../../../kernel/fmt.js';
import { addressOf } from './bulk.js';

function structFor(i) {
  const walls = ['Жжёный кирпич', 'Газобетон', 'Шлакоблок', 'Силикатный кирпич', 'Сэндвич-панели'];
  const roofs = ['Шифер', 'Металл', 'Плоская', 'Мягкая'];
  const floors = ['Ламинат', 'Линолеум', 'Плитка', 'Бетонные', 'Деревянные'];

  return {
    foundation: 'Бетонный',
    wallsExt: walls[i % walls.length],
    ceilings: 'Железобетонные плиты',
    roof: roofs[i % roofs.length],
    floors: floors[i % floors.length],
    windows: i % 2 ? 'ПВХ (стеклопакет)' : 'Деревянные',
    doors: i % 3 ? 'Металлические' : 'Деревянные',
  };
}

function base(id, i, p) {
  return {
    id,
    typeId: 'residential-house',
    residential: true,
    category: 'Недвижимое',
    type: 'Жилое здание (дом)',
    purposeTP: p.purpose,
    eni: p.eni,
    address: addressOf(p, i),
    city: p.city,
    gps: '',
    status: p.status,
    institution: p.institution,
    podved: 'Подведомственная организация',
    complex: false,
    updatedAt: p.updatedAt,
    owners: [p.institution],
    users: [],
    resp: p.resp,
    notes: [],
    docs: p.docs
      ? Array.from({ length: p.docs }, (_, k) => ({
        id: `${id}-d${k}`,
        type: ['Техпаспорт', 'ПУД', 'Гос. акт на землю', 'Акт осмотра', 'Прочее'][k % 5],
        name: `Документ №${100 + i % 900 + k}`,
        date: '12.05.2024',
        pages: null,
      }))
      : [],
    oi: [],
  };
}

function photosFor(p, share) {
  const total = Math.max(0, Math.round(p.metrics.photos * share));
  if (!total) return {};
  const cats = ['Фасад', 'Внутр. помещения', 'Кровля', 'Конструкции'];
  const out = {};
  let left = total;
  for (let k = 0; k < cats.length && left > 0; k++) {
    const take = Math.max(1, Math.ceil(left / (cats.length - k)));
    out[cats[k]] = take;
    left -= take;
  }
  return out;
}

function buildingOi(id, i, p, letter, opts = {}) {
  const area = fmt(Math.max(12, p.metrics.area * (opts.share || 1)));

  return {
    id: `${id}-oi${letter}`,
    card: 'building',
    letter,
    name: opts.name || 'Строение',
    status: opts.status || 'Основное',
    origin: p.ml ? 'ml' : 'manual',
    residential: !!opts.residential,
    resCat: opts.resCat || '',
    eni: String(+p.eni + (opts.eniShift || 1)),
    year: String(1970 + (i % 50)),
    flags: { entered: p.status !== 'В заполнении', matched: p.ml && !p.mlUnverified },
    areas: { tp: area, pud: area, fact: area, build: fmt(Math.max(10, p.metrics.area * 0.6)) },
    floors: 1 + (i % 4),
    floorList: [],
    heights: { ext: fmt(3 + (i % 7)), int: fmt(2.6 + (i % 3) * 0.2) },
    buildType: i % 5 ? 'Отдельностоящее' : 'Встроенное',
    struct: structFor(i),
    structOther: {},
    heating: i % 3 === 0 ? ['Центральное'] : (i % 3 === 1 ? ['Автономное', 'Современные радиаторы'] : ['Печное']),
    heatingOther: '',
    comment: '',
    catClass: opts.catClass || 'Гражданское здание',
    dis: !!p.defects,
    docs: [],
    photos: photosFor(p, opts.photoShare === undefined ? 1 : opts.photoShare),
    notes: [],
  };
}

function landOi(id, i, p, suffix, opts = {}) {
  return {
    id: `${id}-oil${suffix}`,
    card: 'land',
    name: opts.name || 'Земельный участок',
    purpose: p.purpose,
    area: fmt(opts.area === undefined ? p.metrics.area * 3 : opts.area),
    eni: String(+p.eni + 90 + suffix),
    status: opts.status || 'Основное',
    origin: 'manual',
    flags: { entered: true, matched: true },
    docs: [],
    photos: { 'Земельный участок': 1 + (i % 3) },
    notes: [],
  };
}

function apartmentOi(id, i, p, letter) {
  const area = fmt(Math.max(24, p.metrics.area));

  return {
    id: `${id}-oi${letter}`,
    card: 'apartment',
    letter,
    name: 'Квартира',
    status: 'Основное',
    origin: p.ml ? 'ml' : 'manual',
    residential: true,
    resCat: '',
    eni: String(+p.eni + 1),
    year: String(1965 + (i % 58)),
    flags: { entered: p.status !== 'В заполнении', matched: p.ml && !p.mlUnverified },
    areas: { tp: area, pud: area, fact: area, build: '' },
    floors: 1,
    floorList: [],
    heights: { ext: '', int: '' },
    buildType: 'Встроенное',
    struct: structFor(i),
    structOther: {},
    heating: ['Центральное', i % 2 ? 'Современные радиаторы' : 'Чугунные радиаторы'],
    heatingOther: '',
    comment: '',
    catClass: 'Гражданское здание',
    dis: !!p.defects,
    docs: [],
    photos: photosFor(p, 1),
    notes: [],
    apartment: {
      floor: String(1 + (i % 12)),
      buildingFloors: String(4 + (i % 9)),
      rooms: String(1 + (i % 4)),
      series: ['Индивидуальная', 'Серия 97', 'Серия 104', 'Серия 105', 'Серия 106'][i % 5],
      location: i % 4 ? 'Неугловое' : 'Угловое',
      locationOther: '',
      storeys: '1',
      loggiaCount: i % 3 ? '1' : '',
      balconyCount: i % 2 ? '1' : '',
      loggiaBuildArea: i % 3 ? '4.20' : '',
      balconyBuildArea: i % 2 ? '3.00' : '',
      rights: 'Собственность',
      rightsOther: '',
    },
  };
}

function movableOi(id, i, p, suffix, kind) {
  return {
    id: `${id}-oim${suffix}`,
    card: 'movable',
    kind,
    name: kind === 'МЕХ'
      ? ['Станок токарный', 'Насосная станция', 'Компрессор', 'Кран-балка'][i % 4]
      : ['МФУ', 'Комплект мебели', 'Серверная стойка'][i % 3],
    eni: String(+p.eni + 70 + suffix),
    status: '',
    origin: 'manual',
    flags: { entered: false, matched: false },
    year: String(1990 + (i % 34)),
    serial: `SN-${(i * 7919) % 100000}`,
    docs: [],
    photos: {},
    notes: [],
    complexItems: null,
  };
}

export function buildBulkRecord(id, i, p) {
  const rec = base(id, i, p);
  rec.oi.push(buildingOi(id, i, p, 'А', {
    name: 'Жилой дом',
    residential: true,
    resCat: ['Обособленный', 'Таунхаус', 'Пай-дома'][i % 3],
    catClass: 'Жилое здание',
    photoShare: 0.7,
  }));

  if (p.metrics.oiCount > 1) rec.oi.push(landOi(id, i, p, 1, { area: p.metrics.area * 4 }));
  if (p.metrics.oiCount > 2) {
    rec.oi.push(buildingOi(id, i, p, 'Б', {
      name: 'Прочее строение',
      status: 'Вспомогательное',
      share: 0.25,
      eniShift: 2,
      photoShare: 0.3,
    }));
  }
  return rec;
}
