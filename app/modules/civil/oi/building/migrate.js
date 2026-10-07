// Перевод записей литер из прежних форматов — при загрузке, до отрисовки.
//
// Вынесено из capClass.js 07.10.2026. Перевод зовёт и расчёт класса
// (capClass.js), и подгруппы помещений (zones.js), а zones.js сам берёт расчёт
// класса из capClass.js; пока перевод жил в capClass.js, файлы импортировали
// друг друга по кругу (npm run lint:arch, «нет-круговых-зависимостей»).
// Теперь зависимости в одну сторону: migrate.js → zones.js → capClass.js.
import { signsOf, syncCapClass } from './capClass.js';
import { hasZones, syncFromZones } from './zones.js';

// Записи до 23.09.2026: вид литеры держал catClass («Производственно-
// складское» — производственное, остальное — гражданское), признаки
// производственной литеры лежали в «Доп. параметрах» одним значением и с
// прежними подписями вариантов. Переводится до отрисовки и до снимка журнала
// правок — иначе перевод попал бы в журнал как правка пользователя.
const FLOORS_OLD = { 'Отсутствуют': 'Отсутствуют', 'Не усиленные': 'Простые',
  'Усиленные для техники': 'Усиленные для техники или специальные' };
const FRAME_OLD = {
  'Блочные по железобетонному каркасу утепленный': 'Блочные по железобетонному каркасу, утеплённые',
  'Блочные по железобетонному каркасу': 'Блочные по железобетонному каркасу, без утепления',
  'Металлокаркасные тёплые': 'Металлокаркасные тёплые',
  'Блочные бескаркасные и металлокаркасные холодные': 'Блочные бескаркасные или металлокаркасные холодные',
};

// Прежние значения состояния — в шкалу методологии (решение пользователя
// 25.09.2026): «Плохое» — требует ремонта, «Аварийное» — неудовлетворительное.
const CONDITION_OLD = { 'Плохое': 'Требует ремонта', 'Аварийное': 'Неудовлетворительное' };

export function migrateLiterKinds(rec) {
  if (!rec || !Array.isArray(rec.oi)) return;
  rec.oi.forEach((oi) => {
    if (oi.card !== 'building') return;
    ['conditionInner', 'conditionOuter', 'conditionTotal'].forEach((k) => {
      if (CONDITION_OLD[oi[k]]) oi[k] = CONDITION_OLD[oi[k]];
    });
    if (oi.residential) return;
    // Класс пишется в запись у всех литер: засеянные и заведённые до расчёта
    // держали бы в oi.oiCategory класс, выбранный руками. У литеры из
    // подгрупп помещений класс — от самой большой подгруппы: собственных
    // признаков у такой литеры нет, и расчёт по ним стирал класс при каждой
    // загрузке (найдено 25.09.2026 при сверке карточки с методологией).
    if (oi.litKind !== undefined) {
      if (hasZones(oi)) syncFromZones(oi); else syncCapClass(oi);
      return;
    }
    const prod = oi.catClass === 'Производственно-складское';
    oi.litKind = prod ? 'prod' : 'civil';
    // «Производственно-складское» было признаком вида, а не записью из
    // техпаспорта — в поле «Назначение по тех паспорту» ему не место.
    if (prod) oi.catClass = '';
    const s = signsOf(oi);
    if (oi.prodFrame && FRAME_OLD[oi.prodFrame]) s.frame = [FRAME_OLD[oi.prodFrame]];
    if (oi.prodFloors && FLOORS_OLD[oi.prodFloors]) s.floors = [FLOORS_OLD[oi.prodFloors]];
    if (oi.craneBeam === 'Есть') s.crane = 'Да';
    else if (oi.craneBeam === 'Нет') s.crane = 'Нет';
    delete oi.prodFrame; delete oi.prodFloors; delete oi.craneBeam;
    syncCapClass(oi);
  });
}
