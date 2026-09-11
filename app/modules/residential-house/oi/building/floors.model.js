import { num, fmt, round2 } from '../../../../kernel/fmt.js';
import { MANSARD_TYPE } from '../../data/dictionaries.js';
import { opt } from '../../data/opts.js';

// Две площади у каждого этажа, и каждая распределяется ОТ СВОЕГО ИТОГА
// (Л5.1/Л5.2). Раньше площадь была одна — «общая по техпаспорту», а застройка
// жила только суммарно на карточке.
// auto — распределяется ли колонка между отмеченными этажами и блокируется ли
// у них поле. Распределяется только площадь по внешним замерам: она и есть
// сумма этажей. Площадь по внутреннему обмеру этажи не делят — её вводят руками
// у каждой строки (решение пользователя 09.09.2026).
//
// Названия колонок 09.09.2026 приведены к тому, как площади называют в
// техпаспорте: «общая по техпаспорту» стала «по внешним замерам», «площадь
// застройки» — «по внутреннему обмеру». Прежняя оговорка «застройка — она же по
// наружным замерам» (28.08.2026) с этим расходилась и снята. Ключи данных
// (area, areaBuild, areas.tp, areas.build) не менялись — переименование подписи
// не должно ломать уже введённое.
// Делится и сверяется площадь по ВНУТРЕННЕМУ обмеру (решение пользователя
// 11.09.2026). Прежде распределялась внешняя: правило 09.09.2026 запрещало
// делить «площадь застройки» — срез сверху, на который этажи не влияют. В тот
// же день поле переименовали в «площадь по внутреннему обмеру», а она из этажей
// складывается — и довод вместе с подписью потерял силу.
export const AREA_FIELDS = [
  {
    key: 'area', total: 'tp', label: 'По внешним замерам, м²',
    title: 'площадь по внешним замерам', auto: false,
  },
  {
    key: 'areaBuild', total: 'build', label: 'По внутреннему обмеру, м²',
    title: 'площадь по внутреннему обмеру', auto: true,
  },
];

// Колонки, которые распределяются и показываются итогом.
export const AUTO_AREA_FIELDS = AREA_FIELDS.filter((a) => a.auto);

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

// Поля, которые есть только у своего размещения. Строка развёртки — ОДНА
// структура на все размещения: общие поля (название, площади, высоты, отметка
// «авто») лежат у всех, уникальные — заводятся, когда строка в это размещение
// попадает, и НЕ стираются, когда уходит. Иначе перенос «мансарда → этаж →
// обратно» терял бы конструктивный тип, а человек этого не ждёт: он двигал
// строку, а не чистил её.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: здесь это один список floorList с полем cat. На сервере
// то же самое — одна таблица строк развёртки с колонкой размещения и общими
// колонками, а уникальные поля живут либо отдельными nullable-колонками (их
// немного), либо json-полем. Разводить по трём таблицам не нужно: перенос
// между ними стал бы удалением и вставкой, и история правок по строке рвалась
// бы на каждом переносе.
const CAT_ONLY_FIELDS = {
  mansard: (oi) => ({ mansardType: oi.mansardType || opt('building', 'mansardType', MANSARD_TYPE)[0] }),
};

// Дописать строке то, чего у неё в этом размещении ещё не было. Уже
// заполненное не трогаем — оно и есть смысл «общей структуры».
function ensureCatFields(row, cat, oi) {
  const mk = CAT_ONLY_FIELDS[cat];
  if (!mk) return;
  const extra = mk(oi);
  Object.keys(extra).forEach((k) => {
    if (row[k] === undefined || row[k] === '') row[k] = extra[k];
  });
}

function mkRow(name, cat, oi) {
  const row = {
    name, cat,
    on: catDef(cat).auto,
    area: '', areaBuild: '',
    hExt: cat === 'over' ? (oi.heights?.ext || '') : '',
    hInt: cat === 'over' ? (oi.heights?.int || '') : '',
  };
  if (cat === 'mansard') row.mansardType = oi.mansardType || opt('building', 'mansardType', MANSARD_TYPE)[0];
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

// Перенос строки в другое размещение: этаж — в подвалы или мансарды и обратно.
// Меняем размещение и ставим строку в конец целевой группы, чтобы порядок в
// списке совпал с тем, что человек видит на экране.
//
// Отметку «авто» при переносе НЕ трогаем, хотя у надземных она включена по
// умолчанию, а у прочих нет: это выбор человека по конкретной строке, и молча
// переигрывать его на переносе — значит менять посчитанные площади за спиной.
// Название тоже остаётся прежним: «Этаж 3», уехавший в подвалы, переименует
// тот, кто его туда отправил, — нам его замысел неизвестен.
export function moveFloorRow(oi, index, cat) {
  const list = oi.floorList || [];
  const row = list[index];
  if (!row || row.cat === cat || !FLOOR_CATS.some((c) => c.key === cat)) return false;

  const wasOver = row.cat === 'over';
  row.cat = cat;
  ensureCatFields(row, cat, oi);

  list.splice(index, 1);
  const lastOfCat = list.reduce((at, f, i) => (f.cat === cat ? i : at), -1);
  list.splice(lastOfCat + 1, 0, row);

  if (wasOver || cat === 'over') oi.floors = list.filter((f) => f.cat === 'over').length;
  recalcFloors(oi);
  return true;
}

export function renameFloorRow(oi, index, name) {
  const row = (oi.floorList || [])[index];
  if (row) row.name = name;
}

// Распределяется только то, что объявлено auto (см. AREA_FIELDS): свой итог,
// своя сумма ручных значений, свой остаток. Отметка «авто» у строки — про сам
// этаж; какие колонки она затрагивает, решает колонка.
export function recalcFloors(oi) {
  const areas = oi.areas || {};
  const manual = (oi.floorList || []).filter((f) => !f.on);
  const auto = (oi.floorList || []).filter((f) => f.on);
  if (!auto.length) return;

  AUTO_AREA_FIELDS.forEach(({ key, total }) => {
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
