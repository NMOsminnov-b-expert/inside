import { num, fmt, round2 } from '../../../../kernel/fmt.js';
import { MANSARD_TYPE } from '../../data/dictionaries.js';

// Три площади у каждого этажа, и каждая распределяется ОТ СВОЕГО ИТОГА
// (решение пользователя 2026-08-28, Л5.1/Л5.2). Раньше в развёртке была одна
// площадь и один итог — «общая по техпаспорту», а внешние замеры и застройка
// жили только суммарно на карточке.
export const AREA_FIELDS = [
  { key: 'area', total: 'tp', label: 'Площадь по ТП, м²', title: 'общая по техпаспорту' },
  { key: 'areaExt', total: 'fact', label: 'Площадь внешн., м²', title: 'общая по факту' },
  { key: 'areaBuild', total: 'build', label: 'Застройка, м²', title: 'площадь застройки' },
];

// Этажный список строения: этажи 1..N (категория "Надземные") плюс
// подвал/цоколь ("Подземные") и мансарды ("Мансардные", своя категория).
//
// Мансард может быть несколько, и у КАЖДОЙ свой конструктивный тип — мансарда
// и полумансарда встречаются в одном здании (Л5.3). Поэтому тип живёт в строке
// (f.mansardType), а не одним полем на всю литеру, как было.
export function buildFloors(oi) {
  const n = Math.max(1, oi.floors | 0);
  const he = oi.heights.ext || '';
  const hi = oi.heights.int || '';
  const keep = oi.floorList || [];
  const list = [];

  const mk = (name, cat, on) => {
    const ex = keep.find((f) => f.name === name && f.cat === cat);
    if (ex) return ex;
    return {
      name, cat, on,
      area: '', areaExt: '', areaBuild: '',
      hExt: cat === 'over' ? he : '', hInt: cat === 'over' ? hi : '',
    };
  };

  for (let i = 0; i < n; i++) list.push(mk('Этаж ' + (i + 1), 'over', true));
  list.push(mk('Подвал', 'under', false));
  list.push(mk('Цоколь', 'under', false));

  // Сколько мансардных строк было — столько и остаётся; при первом построении
  // одна, как и раньше.
  const mansards = keep.filter((f) => f.cat === 'mansard');
  const mCount = Math.max(1, mansards.length);
  for (let i = 0; i < mCount; i++) {
    const row = mk(mansardName(i), 'mansard', false);
    if (!row.mansardType) row.mansardType = oi.mansardType || MANSARD_TYPE[0];
    list.push(row);
  }

  oi.floorList = list;
  recalcFloors(oi);
}

// Первая мансарда называется просто «Мансарда» — так она звалась до появления
// нескольких, и переименование потеряло бы уже введённые по ней данные (mk
// ищет строку по имени).
export function mansardName(i) {
  return i === 0 ? 'Мансарда' : 'Мансарда ' + (i + 1);
}

export function addMansard(oi) {
  const list = oi.floorList || (oi.floorList = []);
  const n = list.filter((f) => f.cat === 'mansard').length;
  list.push({
    name: mansardName(n), cat: 'mansard', on: false,
    area: '', areaExt: '', areaBuild: '', hExt: '', hInt: '',
    mansardType: MANSARD_TYPE[0],
  });
  recalcFloors(oi);
}

export function removeMansard(oi, index) {
  const list = oi.floorList || [];
  const row = list[index];
  if (!row || row.cat !== 'mansard') return;
  // Последнюю мансардную строку не убираем: категория должна остаться видимой,
  // иначе добавить новую будет негде.
  if (list.filter((f) => f.cat === 'mansard').length <= 1) return;
  list.splice(index, 1);
  // Имена пересобираем, чтобы не осталось дыр в нумерации.
  list.filter((f) => f.cat === 'mansard').forEach((f, i) => { f.name = mansardName(i); });
  recalcFloors(oi);
}

// Каждая площадь распределяется независимо: свой итог, своя сумма ручных
// значений, свой остаток. Отметка «авто» у строки при этом одна на все три —
// она про сам этаж, а не про отдельную колонку.
export function recalcFloors(oi) {
  const areas = oi.areas || {};
  const manual = oi.floorList.filter((f) => !f.on);
  const auto = oi.floorList.filter((f) => f.on);
  if (!auto.length) return;

  AREA_FIELDS.forEach(({ key, total }) => {
    const sum = num(areas[total]);
    const mSum = manual.reduce((s, f) => s + num(f[key]), 0);
    const rem = Math.max(0, sum - mSum);

    const base = Math.floor(rem / auto.length * 100) / 100;
    let acc = 0;
    auto.forEach((f, i) => {
      const a = i === auto.length - 1 ? round2(rem - acc) : base;
      acc += a;
      f[key] = fmt(a);
    });
  });
}

export function floorsSum(oi, key = 'area') {
  return (oi.floorList || []).reduce((s, f) => s + num(f[key]), 0);
}

// Площадь одной категории — используется, в частности, как «площадь чистых
// надземных этажей» (cat: 'over'), отдельно от подвала/цоколя/мансарды.
export function floorsSumByCat(oi, cat, key = 'area') {
  return (oi.floorList || []).filter((f) => f.cat === cat).reduce((s, f) => s + num(f[key]), 0);
}
