import { num, fmt, round2 } from '../../../../kernel/fmt.js';

// Этажный список строения: этажи 1..N (категория "Надземные") плюс
// подвал/цоколь ("Подземные") и мансарда ("Мансардные", своя категория).
export function buildFloors(oi) {
  const n = Math.max(1, oi.floors | 0);
  const he = oi.heights.ext || '';
  const hi = oi.heights.int || '';
  const keep = oi.floorList || [];
  const list = [];

  const mk = (name, cat, on) => {
    const ex = keep.find((f) => f.name === name && f.cat === cat);
    return ex || { name, cat, on, area: '', hExt: cat === 'over' ? he : '', hInt: cat === 'over' ? hi : '' };
  };

  for (let i = 0; i < n; i++) list.push(mk('Этаж ' + (i + 1), 'over', true));
  list.push(mk('Подвал', 'under', false));
  list.push(mk('Цоколь', 'under', false));
  list.push(mk('Мансарда', 'mansard', false));

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

// Площадь одной категории — используется, в частности, как «площадь чистых
// надземных этажей» (cat: 'over'), отдельно от подвала/цоколя/мансарды.
export function floorsSumByCat(oi, cat) {
  return (oi.floorList || []).filter((f) => f.cat === cat).reduce((s, f) => s + num(f.area), 0);
}
