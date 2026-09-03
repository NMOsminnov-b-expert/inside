import { num, fmt, round2 } from '../../../../kernel/fmt.js';
import { MANSARD_TYPE } from '../../data/dictionaries.js';
import { opt } from '../../data/opts.js';

// Две площади у каждого этажа, и каждая распределяется ОТ СВОЕГО ИТОГА
// (Л5.1/Л5.2). Раньше площадь была одна — «общая по техпаспорту», а застройка
// жила только суммарно на карточке.
export const AREA_FIELDS = [
  { key: 'area', total: 'tp', label: 'Площадь по ТП, м²', title: 'общая по техпаспорту' },
  // Площадь застройки и площадь по наружным замерам — одна и та же величина
  // (решение пользователя 28.08.2026), поэтому колонка одна. Подсказка про
  // наружные замеры остаётся: под этим названием её знают на местах.
  {
    key: 'areaBuild', total: 'build', label: 'Площадь застройки, м²',
    title: 'площадь застройки — она же по наружным замерам',
  },
];

// Была отдельная колонка «Площадь внешн.» (areaExt). Значения переносим в
// застройку, чтобы введённое не пропало; вызывать ДО отрисовки, иначе перенос
// попадёт в лог правок как правка пользователя.
export function migrateFloorAreas(oi) {
  (oi && oi.floorList ? oi.floorList : []).forEach((f) => {
    if (f.areaExt === undefined) return;
    if (!f.areaBuild) f.areaBuild = f.areaExt;
    delete f.areaExt;
  });
}

// Категории строк развёртки. Строки ЛЮБОЙ категории добавляются и удаляются
// вручную (решение пользователя 2026-08-28): подвалов и цоколей может быть
// несколько, мансард тоже, а бывает и объект вообще без надземных этажей —
// только цоколь и мансарда. Поэтому фиксированного набора строк больше нет.
export const FLOOR_CATS = [
  { key: 'over', label: 'Надземные', add: 'Этаж', auto: true },
  { key: 'under', label: 'Подземные', add: 'Подвал', auto: false },
  { key: 'mansard', label: 'Мансардные', add: 'Мансарда', auto: false },
];

const catDef = (cat) => FLOOR_CATS.find((c) => c.key === cat) || FLOOR_CATS[0];

function mkRow(name, cat, oi) {
  const row = {
    name, cat,
    on: catDef(cat).auto,
    area: '', areaBuild: '',
    hExt: cat === 'over' ? (oi.heights?.ext || '') : '',
    hInt: cat === 'over' ? (oi.heights?.int || '') : '',
  };
  if (cat === 'mansard') row.mansardType = oi.mansardType || opt('apartment', 'mansardType', MANSARD_TYPE)[0];
  return row;
}

// Имя новой строки: «Этаж 3», «Подвал 2», «Мансарда 2». Первая в категории —
// без номера, как было до появления нескольких: переименование потеряло бы
// уже введённые по ней данные.
export function nextRowName(oi, cat) {
  const base = catDef(cat).add;
  const n = (oi.floorList || []).filter((f) => f.cat === cat).length;
  return n === 0 ? base : `${base} ${n + 1}`;
}

// Первое построение развёртки: этажи 1..N плюс по одному подвалу, цоколю и
// мансарде — как ориентир. Дальше состав правит человек.
export function buildFloors(oi) {
  const n = Math.max(0, oi.floors | 0);
  const keep = oi.floorList || [];
  const list = [];

  const reuse = (name, cat) => keep.find((f) => f.name === name && f.cat === cat);

  for (let i = 0; i < n; i++) {
    const name = 'Этаж ' + (i + 1);
    list.push(reuse(name, 'over') || mkRow(name, 'over', oi));
  }

  // Строки, заведённые вручную (переименованные этажи, лишние подвалы и
  // мансарды), переносим как есть — их состав не наш.
  keep.forEach((f) => {
    if (f.cat === 'over' && list.includes(f)) return;
    if (f.cat === 'over' && /^Этаж \d+$/.test(f.name) && +f.name.slice(5) <= n) return;
    if (!list.includes(f)) list.push(f);
  });

  if (!keep.length) {
    ['Подвал', 'Цоколь'].forEach((name) => list.push(mkRow(name, 'under', oi)));
    list.push(mkRow('Мансарда', 'mansard', oi));
  }

  oi.floorList = list;
  recalcFloors(oi);
}

export function addFloorRow(oi, cat) {
  const list = oi.floorList || (oi.floorList = []);
  list.push(mkRow(nextRowName(oi, cat), cat, oi));
  if (cat === 'over') oi.floors = list.filter((f) => f.cat === 'over').length;
  recalcFloors(oi);
}

// Удалить можно любую строку — и этаж, и подвал, и мансарду. Последнюю строку
// категории тоже: категория просто исчезает из развёртки, добавить новую можно
// кнопкой в её заголовке, а заголовки показываются всегда.
export function removeFloorRow(oi, index) {
  const list = oi.floorList || [];
  if (!list[index]) return;
  const wasOver = list[index].cat === 'over';
  list.splice(index, 1);
  if (wasOver) oi.floors = list.filter((f) => f.cat === 'over').length;
  recalcFloors(oi);
}

export function renameFloorRow(oi, index, name) {
  const row = (oi.floorList || [])[index];
  if (row) row.name = name;
}

// Каждая площадь распределяется независимо: свой итог, своя сумма ручных
// значений, свой остаток. Отметка «авто» у строки при этом одна на обе —
// она про сам этаж, а не про отдельную колонку.
export function recalcFloors(oi) {
  const areas = oi.areas || {};
  const manual = (oi.floorList || []).filter((f) => !f.on);
  const auto = (oi.floorList || []).filter((f) => f.on);
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
