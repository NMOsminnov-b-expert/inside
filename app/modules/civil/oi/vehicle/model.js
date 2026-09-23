// Данные карточки ОИ «Транспортное средство» гражданского здания.
//
// Одно ТС — один объект имущества (решение пользователя 17.09.2026): госномер
// и VIN индивидуальны, и каждая машина видна в перечне ОЦ отдельной строкой.
//
// С 23.09.2026 карточка та же, что у ТС как объекта оценки, — «база + модуль»
// (решение пользователя: «ТС тоже перенеси внутрь гражданского так же, как и
// был в ОЦ»). Сведения лежат в oi.vehicle в том же виде, что rec.vehicle у ОЦ;
// снимки — у самого объекта имущества (oi.photos, oi.photoFiles), как у литер,
// поэтому просмотрщик гражданского видит их без переделок.
import { tsOf, tsTitle, PHOTO_CATS, vehicleFieldsFor } from '../../../vehicle/card.js';

// Подпись ОИ — марка с моделью и госномер: по ним машину находят в перечне.
// Отдельного поля «наименование» у ТС нет.
export function syncVehicleName(oi) {
  const v = tsOf(oi);
  const plate = v.f.plate ? ` · ${v.f.plate}` : '';
  oi.name = tsTitle(v) + plate;
  return oi.name;
}

// Прежние восемь типов ТС и пять подгрупп спецтехники (карточка до
// 23.09.2026) → категория и база справочника «база + модуль».
const OLD_TYPE = {
  'Легковая': ['Легковое', 'Легковой автомобиль и внедорожник'],
  'Лёгкий коммерческий (до 3,5 т)': ['Грузовое', 'Лёгкий коммерческий (до 3,5 т)'],
  'Грузовой (свыше 3,5 т)': ['Грузовое', ''],
  'Седельный тягач': ['Грузовое', 'Седельный тягач'],
  'Автобус': ['Автобусы', 'Автобус'],
  'Прицеп легковой': ['Прицепы и полуприцепы', 'Прицеп'],
  'Прицеп и полуприцеп грузовой': ['Прицепы и полуприцепы', ''],
  'Мототранспорт': ['Мототехника', 'Мототехника'],
};
// Поля прежней карточки, у которых в новой есть поле с тем же смыслом.
const SAME_KEY = ['engineVolume', 'gearbox', 'bodyNo', 'chassisNo', 'engineNo', 'mileage', 'engineHours', 'kit'];

let seq = 1;
const rowId = () => `vx-${Date.now().toString(36)}-${seq += 1}`;

// Перевод ТС, заведённого прежней карточкой: марка, госномер, VIN, год, цвет
// ложатся в свои поля; остальное, чему нет поля, — в дополнительные параметры
// с прежней подписью. Ничего не теряется, а тип ТС подсказывает категорию.
// Снимки прежних категорий («Кузов», «Салон» …) переходят в «Машину».
export function migrateVehicleOi(oi) {
  if (oi.vehicle) return;
  const [category, base] = OLD_TYPE[oi.vtype] || ['', ''];
  const spec = /спецтехника/i.test(oi.vtype || '');
  const f = {};
  const put = (k, val) => { if (val !== undefined && val !== null && String(val).trim()) f[k] = val; };
  put('make', oi.makeModel);
  put('plate', oi.plate);
  put('vin', oi.vin);
  put('year', oi.year);
  put('color', oi.color);
  put('country', oi.country);

  const params = oi.params || {};
  const old = vehicleFieldsFor(oi.vtype);
  const labels = {};
  if (old) [...old.passport, ...old.inspect].forEach((d) => { labels[d.key] = d.label; });
  const extra = [];
  if (oi.vtype && !base) extra.push({ id: rowId(), label: 'Тип ТС (прежняя карточка)', value: oi.vtype });
  Object.keys(params).filter((k) => !k.endsWith('@unit')).forEach((k) => {
    const unit = params[k + '@unit'];
    if (SAME_KEY.includes(k)) {
      put(k, params[k]);
      if (unit) f[k + '@unit'] = unit;
      return;
    }
    const value = [params[k], unit].filter(Boolean).join(' ');
    if (String(value).trim()) extra.push({ id: rowId(), label: labels[k] || k, value: String(value) });
  });
  (oi.extra || []).forEach((r) => extra.push({ id: r.id || rowId(), label: r.label || '', value: r.value || '' }));
  if (String(oi.marks || '').trim()) extra.push({ id: rowId(), label: 'Особые отметки', value: oi.marks });
  if (String(oi.comment || '').trim()) extra.push({ id: rowId(), label: 'Комментарий', value: oi.comment });

  oi.vehicle = {
    kind: spec ? 'self' : (category ? 'base' : ''),
    category, base, f, extra, modules: [],
  };

  const photos = oi.photos || {};
  const files = oi.photoFiles || {};
  const moved = Object.keys(photos).filter((c) => !PHOTO_CATS.includes(c));
  if (moved.length) {
    const cat = PHOTO_CATS[0];
    let n = photos[cat] || 0;
    const arr = files[cat] || [];
    while (arr.length < n) arr.push(null);
    moved.forEach((c) => {
      const from = files[c] || [];
      for (let i = 0; i < photos[c]; i++) arr.push(from[i] || null);
      n += photos[c];
      delete photos[c];
      delete files[c];
    });
    photos[cat] = n;
    files[cat] = arr;
    oi.photos = photos;
    oi.photoFiles = files;
  }
  ['vtype', 'makeModel', 'plate', 'vin', 'year', 'color', 'country', 'params', 'extra', 'marks', 'comment']
    .forEach((k) => delete oi[k]);
}

export function createVehicleOi(base) {
  const oi = {
    ...base,
    card: 'vehicle',
    name: '',
    // Кода ЕНИ у транспортного средства нет: он присваивается Кадастром
    // недвижимости, а ТС стоит на учёте в органах регистрации транспорта.
    eni: '',
    vehicle: { kind: '', f: {}, extra: [], modules: [] },
    docs: [],
    photos: {},
    photoFiles: {},
    notes: [],
  };
  syncVehicleName(oi);
  return oi;
}
