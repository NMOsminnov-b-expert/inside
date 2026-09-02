import { mkNote } from '../features/notes/notesStore.js';

export function createOC() {
  return {
    category: 'Недвижимое',
    type: 'Жилое здание (дом)',
    purposeTP: 'Жилое',
    eni: '147561681351',
    address: 'г. Бишкек, ул. Фрунзе, д. 35',
    gps: '42.8746, 74.5698',
    status: 'В заполнении',
    institution: 'Министерство для ТЕСТА',
    podved: 'Подвед Министерства для ТЕСТ',
    complex: false,
    owners: ['Министерство для ТЕСТА'],
    users: [],
    resp: {
      gov: 'Абдылдаев Айсултан Марсович',
      cod: 'Айдай',
      appr: 'Молчанов Кирилл Витальевич',
      insp: 'Карабекова Анара Тариеловна',
    },
    notes: [
      mkNote('Не полный ПУД — не хватает страниц 4-7', false),
      mkNote('Нет гос. акта на землю', false),
      mkNote('Техпаспорт от 2020 года — проверить актуальность', true),
    ],
  };
}

export function createOI() {
  return [
    {
      id: 'oi-a',
      kind: 'realty',
      subtype: 'realty_residential',
      letter: 'А',
      name: 'Жилое здание',
      status: 'Основное',
      origin: 'ml',
      residential: true,
      resCat: 'Обособленный',
      eni: '147561681351',
      year: '1990',
      flags: { entered: true, matched: false },
      areas: { tp: '96.40', pud: '96.40', fact: '96.40', build: '98.60' },
      floors: 2,
      floorList: [],
      heights: { ext: '5.90', int: '2.70' },
      buildType: 'Отдельностоящее',
      struct: {
        foundation: 'Бетонный',
        wallsExt: 'Жжёный кирпич',
        ceilings: 'Железобетонные плиты',
        roof: 'Шифер',
        floors: 'Деревянные',
        windows: 'Деревянные',
        doors: 'Деревянные',
      },
      heating: ['Центральное'],
      heatingOther: '',
      comment: 'Капитальный ремонт кровли — 2018 г.',
      catClass: 'Жилое здание',
      dis: false,
      premises: [
        { cat: 'Помещение', name: 'Кухня', area: '12.40' },
        { cat: 'Помещение', name: 'Жилая комната', area: '24.80' },
        { cat: 'Мансарда', name: 'Мансарда', area: '18.00' },
      ],
      photos: {
        'Фасад': 3,
        'Внутр. помещения': 4,
        'Кровля': 2,
        'Конструкции': 2,
      },
      notes: [
        mkNote('Нет страницы 5 в техпаспорте', false),
        mkNote('Плохое качество скана фото фасада', false),
        mkNote('Уточнить год постройки — расхождение в документах', true),
      ],
      apartment: null,
    },

    {
      id: 'oi-b',
      kind: 'realty',
      subtype: 'realty_apartment',
      letter: 'Б',
      name: 'Квартира',
      status: 'Основное',
      origin: 'ml',
      residential: true,
      resCat: '',
      eni: '147561681352',
      year: '1985',
      flags: { entered: true, matched: false },
      areas: { tp: '64.20', pud: '64.20', fact: '64.20', build: '' },
      floors: 1,
      floorList: [],
      heights: { ext: '', int: '' },
      buildType: 'Встроенное',
      struct: {
        foundation: 'Не указано',
        wallsExt: 'Жжёный кирпич',
        ceilings: 'Железобетонные плиты',
        roof: 'Не указано',
        floors: 'Ламинат',
        windows: 'ПВХ (стеклопакет)',
        doors: 'Деревянные',
      },
      heating: ['Центральное', 'Современные радиаторы'],
      heatingOther: '',
      comment: '',
      catClass: 'Гражданское здание',
      dis: false,
      premises: [],
      photos: {
        'Фасад': 2,
        'Внутр. помещения': 3,
      },
      notes: [
        mkNote('Уточнить серию дома', false),
      ],
      apartment: {
        floor: '5',
        buildingFloors: '9',
        rooms: '3',
        series: 'Серия 105',
        location: 'Неугловое',
        locationOther: '',
      },
    },

    {
      id: 'oi-l',
      kind: 'land',
      subtype: 'land',
      name: 'Земельный участок',
      purpose: 'Жилое',
      area: '640.00',
      eni: '147561681350',
      status: 'Основное',
      flags: { entered: true, matched: true },
      docs: [
        {
          id: 'ld1',
          type: 'Гос. акт на землю',
          name: 'Гос. акт №44/07',
          date: '03.02.2019',
        },
      ],
      photos: {
        'Земельный участок': 2,
      },
      notes: [
        mkNote('Границы участка на плане не совпадают с фактическими', false),
      ],
    },
  ];
}

export function createDOCS() {
  return [
    {
      id: 'd1',
      type: 'Техпаспорт',
      name: 'Техпаспорт от 12.05.2020',
      date: '12.05.2020',
      pages: null,
    },
    {
      id: 'd2',
      type: 'ПУД',
      name: 'ПУД №118',
      date: '12.05.2020',
      pages: null,
    },
    {
      id: 'd3',
      type: 'Гос. акт на землю',
      name: 'Гос. акт №44/07',
      date: '03.02.2019',
      pages: null,
      
    },
  ];
}