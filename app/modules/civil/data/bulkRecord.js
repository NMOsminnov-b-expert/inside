// Полная запись синтетического ОЦ собирается лениво — при открытии карточки.
// Параметры те же, что использовались для сводки, поэтому список и карточка
// не расходятся.
import { fmt } from '../../../kernel/fmt.js';
import { landPurposeSample } from '../../land-plot/oi/land/model.js';
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
    typeId: 'civil',
    residential: false,
    category: 'Недвижимое',
    type: 'Гражданское здание',
    purposeTP: p.purpose,
    eni: p.eni,
    address: addressOf(p, i),
    // Части адреса — у записи: их правят в блоке «Местоположение».
    city: p.city,
    street: p.street,
    house: p.house,
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
    heating: i % 3 === 0 ? ['Центральное водяное отопление'] : (i % 3 === 1 ? ['Современные радиаторы'] : ['Печное отопление']),
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
    purpose: landPurposeSample(i),
    // Тип ЗУ и площади — в том виде, что читает карточка участка
    // (land-plot/oi/land/view.js); плоское `area` она не видит.
    landType: i % 2 ? 'Несельскохозяйственный' : 'Сельскохозяйственный',
    areas: {
      pravo: fmt(opts.area === undefined ? p.metrics.area * 3 : opts.area),
      fact: fmt(opts.area === undefined ? p.metrics.area * 3 : opts.area),
      build: i % 2 ? '0' : '',
    },
    eni: String(+p.eni + 90 + suffix),
    status: opts.status || 'Основное',
    origin: 'manual',
    flags: { entered: true, matched: true },
    docs: [],
    photos: { 'Земельный участок': 1 + (i % 3) },
    notes: [],
  };
}

// Механизмы и оборудование: перечень единиц, классифицированных по
// классификатору движимого имущества (oi/mech). Набор детерминирован — берётся
// по индексу записи, как и остальные поля генератора.
const MECH_POOL = [
  { name: 'Дизельный генератор АД-100', cls: 'Энергетическое оборудование', sub: 'Генераторы',
    type: 'Дизельные генераторы' },
  { name: 'Котёл водогрейный КВ-0,5', cls: 'Энергетическое оборудование', sub: 'Котельное оборудование',
    type: 'Водогрейные котлы' },
  { name: 'Кран-балка подвесная 3,2 т', cls: 'Подъёмно-транспортное оборудование', sub: 'Краны',
    type: 'Кран-балки (подвесные/опорные)' },
];
const OFFICE_POOL = [
  { name: 'МФУ Kyocera M2040', cls: 'Офисное оборудование и мебель', sub: 'Компьютерная и оргтехника',
    type: 'Принтеры, МФУ, сканеры, копировальные аппараты' },
  { name: 'Столы рабочие', cls: 'Офисное оборудование и мебель', sub: 'Офисная мебель',
    type: 'Столы (рабочие, переговорные, руководителя)' },
];

function movableOi(id, i, p, suffix, kind) {
  const pool = kind === 'МЕХ' ? MECH_POOL : OFFICE_POOL;
  const units = [0, 1].map((k) => {
    const it = pool[(i + k) % pool.length];
    return {
      id: `${id}-oim${suffix}-u${k}`,
      name: it.name, cls: it.cls, sub: it.sub, type: it.type,
      year: String(1990 + ((i + k * 7) % 34)),
      maker: '',
      params: {},
      extra: [{ id: `${id}-oim${suffix}-u${k}-f1`, label: 'Инвентарный номер', value: `ИН-${(i * 7919 + k) % 100000}` }],
      qty: String(1 + ((i + k) % 3)),
      cost: '',
    };
  });

  return {
    id: `${id}-oim${suffix}`,
    card: 'mech',
    name: `${units[0].name} (+1)`,
    groupName: '',
    eni: '',
    status: '',
    origin: 'manual',
    flags: { entered: false, matched: false },
    mechanisms: units,
    docs: [],
    photos: {},
    notes: [],
  };
}

export function buildBulkRecord(id, i, p) {
  const rec = base(id, i, p);
  rec.complex = p.metrics.oiCount > 2;

  rec.oi.push(buildingOi(id, i, p, 'А', {
    name: ['Административное здание', 'Учебный корпус', 'Поликлиника', 'Дом культуры'][i % 4],
    catClass: 'Нежилое · офисное',
    photoShare: 0.8,
  }));

  if (p.metrics.oiCount > 1) rec.oi.push(landOi(id, i, p, 1, { area: p.metrics.area * 1.8 }));
  if (rec.complex) rec.oi.push(movableOi(id, i, p, 1, i % 2 ? 'МЕХ' : 'ОФИС'));
  return rec;
}
