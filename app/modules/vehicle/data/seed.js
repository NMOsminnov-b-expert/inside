// Демо-записи ОЦ «Транспортные средства» — для осмотра ТС (этап А, запись
// графа osmotr-ts-na-meste-i-po-snimkam): разные категории, с модулями и без,
// с адресом и без него («ТС не закреплены за конкретным адресом» — заметка
// пользователя 27.10.2026). Номера, VIN и адреса вымышленные. Назначения
// осмотрщикам — kernel/inspectionsDemo.js.
//
// Ответственный осмотрщик (resp.insp) не ставится: состав осмотрщиков демо-
// истории собирается по записям, и новые записи не должны его менять.
const base = (id, status = 'Удостоверен по документам') => ({
  id, typeId: 'vehicle', type: 'Транспортные средства', category: 'Движимое', status,
  city: '', institution: 'Министерство для ТЕСТА', podved: 'Административный департамент', eni: '',
  updatedAt: '2026-10-20', owners: ['Министерство для ТЕСТА'], users: [],
  resp: { gov: '', cod: 'Айдай', appr: '', insp: '' }, docs: [],
});

export function createSeed() {
  return [
    {
      ...base('oc-vehicle-d1'),
      city: 'г. Бишкек',
      address: 'г. Бишкек, ул. Тестовая, д. 5',
      gps: '42.8652, 74.5903',
      vehicle: {
        kind: 'base', category: 'Легковое', base: 'Легковой автомобиль и внедорожник',
        f: {
          make: 'Toyota Camry', year: '2019', color: 'Серый', vin: 'XTD11183000000001',
          vtype: 'легковой, седан', plate: '01KG100DEM', wheel: 'Левый (стандартный)', mileage: '86000',
        },
        extra: [], modules: [],
      },
    },
    {
      // Грузовой с краном-манипулятором; где стоит — уточняется на месте.
      ...base('oc-vehicle-d2'),
      vehicle: {
        kind: 'base', category: 'Грузовое', base: 'Грузовое ТС',
        f: {
          make: 'КамАЗ 43118', year: '2015', color: 'Оранжевый', vin: 'XTC43118000000002',
          chassisNo: 'XTC43118000000002', vtype: 'грузовой, бортовой с манипулятором (КМУ)', plate: '02KG200DEM',
          axles: '3', mileage: '214000', engineHours: '6100', kit: 'Аутригеры, пульт управления краном',
        },
        extra: [],
        modules: [
          { id: 'vm-d2-1', group: 'Подъёмные', kind: 'Кран-манипулятор (КМУ)',
            f: { maker: 'Palfinger', model: 'PK 23500', serialNo: 'DEM-23500-0002', year: '2015', hours: '3200' }, extra: [] },
        ],
      },
    },
    {
      // Полуприцеп-трал; адреса нет.
      ...base('oc-vehicle-d3'),
      vehicle: {
        kind: 'base', category: 'Прицепы и полуприцепы', base: 'Полуприцеп',
        f: { make: 'ЧМЗАП 99064', year: '2012', vin: 'X8999064000000003', plate: '03KG300DEM', axles: '3' },
        extra: [],
        modules: [
          { id: 'vm-d3-1', group: 'Грузовые кузова', kind: 'Низкорамная платформа (трал)',
            f: { gruzopodemnost: '48', dlinaPlatformy: '9500', pogruzochnayaVysota: '900' }, extra: [] },
        ],
      },
    },
    {
      // Фургон с серверной установкой («автомобиль с сервером на борту» —
      // ответ пользователя на В3 27.10.2026): адрес есть, координат нет.
      ...base('oc-vehicle-d4'),
      city: 'г. Ош',
      address: 'г. Ош, ул. Демонстрационная, д. 12',
      vehicle: {
        kind: 'base', category: 'Грузовое', base: 'Грузовое ТС',
        f: { make: 'ГАЗ ГАЗель NEXT', year: '2021', color: 'Белый', vin: 'X96A21R2000000004', vtype: 'грузовой, фургон',
          plate: '04KG400DEM', mileage: '52000' },
        extra: [],
        modules: [
          { id: 'vm-d4-1', group: 'Грузовые кузова', kind: 'Промтоварный фургон', f: { year: '2021' }, extra: [] },
          { id: 'vm-d4-2', group: 'Служебные и аварийные', kind: 'Передвижная лаборатория',
            f: { maker: 'Демо-Сервер', model: 'Стойка 42U', serialNo: 'DEM-SRV-0004', year: '2022' },
            extra: [{ id: 'vx-d4-1', label: 'Назначение', value: 'Серверная установка на борту' }] },
        ],
      },
    },
  ];
}
