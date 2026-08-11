import { num, fmt, round2 } from '../../core/utils.js';

export function buildFloors(oi) {
  const n = Math.max(1, oi.floors | 0);
  const he = oi.heights.ext || '';
  const hi = oi.heights.int || '';
  const keep = oi.floorList || [];
  const list = [];
  const mk = (name, on, special) => {
    const ex = keep.find((f) => f.name === name && !!f.special === special);
    return ex || { name, on, special, area: '', hExt: special ? '' : he, hInt: special ? '' : hi };
  };
  for (let i = 0; i < n; i++) list.push(mk('Этаж ' + (i + 1), true, false));
  ['Подвал', 'Мансарда', 'Цоколь'].forEach((sp) => list.push(mk(sp, false, true)));
  oi.floorList = list;
  recalcFloors(oi);
}

export function recalcFloors(oi) {
  const total = num(oi.areas.tp);
  const manual = oi.floorList.filter((f) => !f.on);
  const auto = oi.floorList.filter((f) => f.on);
  const mSum = manual.reduce((s, f) => s + num(f.area), 0);
  const rem = Math.max(0, total - mSum);
  if (auto.length) {
    const base = Math.floor(rem / auto.length * 100) / 100;
    let acc = 0;
    auto.forEach((f, i) => {
      const a = i === auto.length - 1 ? round2(rem - acc) : base;
      acc += a;
      f.area = fmt(a);
    });
  }
}

export function floorsSum(oi) {
  return (oi.floorList || []).reduce((s, f) => s + num(f.area), 0);
}