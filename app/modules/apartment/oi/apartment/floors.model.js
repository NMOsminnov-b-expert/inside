import { num, fmt, round2 } from '../../../../kernel/fmt.js';

// Этажный список квартиры: только этажи 1..N.
// Подвал, мансарда и цоколь не создаются, внешний замер высоты не используется.
export function buildApartmentFloors(oi) {
  const n = Math.max(1, oi.floors | 0);
  const keep = oi.floorList || [];
  const list = [];

  for (let i = 0; i < n; i++) {
    const name = 'Этаж ' + (i + 1);
    const ex = keep.find((f) => f.name === name && !f.special);
    list.push(ex || { name, on: true, special: false, area: '', hExt: '', hInt: '' });
  }

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
