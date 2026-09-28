import { blockNumbers } from '../../kernel/blockIndex.js';
import { splitWrap, viewerHTML } from '../../kernel/viewer/shell.js';
import { ocHeadHTML } from '../../kernel/ocHead.js';
import { fmtNum } from '../../kernel/fmt.js';
import { ownerNames, mechOf } from './records.js';
import { partiesHTML } from './parties.view.js';
import { mechFormHTML } from './form/view.js';
import { mechUnits, totalQty, totalCost, hasCost } from './form/model.js';

// Карточка ОЦ «Механизмы и оборудование» — как у ОЦ «Транспортные средства»
// (ответ пользователя 28.09.2026):
//
//   01  Учреждение, собственники и ответственные
//   02  Состав          — тот же перечень, что у объекта имущества «Механизмы
//                         и оборудование» в любом ОЦ: название списка (ББ,
//                         МОЛ), таблица единиц с итогами
//   03  <единица>       — карточка выбранной единицы: классификация,
//                         параметры, учётные сведения, свои поля, фото

function formHTML(ctx) {
  const idx = blockNumbers();
  const parties = partiesHTML(ctx.rec, String(idx()).padStart(2, '0'), ownerNames());
  return mechFormHTML(ctx, mechOf(ctx.rec), { idx, before: parties });
}

// Шапка — общая на все типы ОЦ (kernel/ocHead.js). Объектов имущества у ОЦ
// механизмов нет — меню «+ Добавить ОИ» тоже нет, а карточка правится прямо
// на месте: вместо «Редактировать» и «Удалить» — сохранение и возврат.
function headMech(ctx) {
  const m = mechOf(ctx.rec);
  return ocHeadHTML(ctx, {
    meta: [
      { label: 'Тип ОЦ', value: ctx.manifest.label },
      { label: 'Позиций', value: String(mechUnits(m).length) },
      { label: 'Количество', value: `${totalQty(m)} шт.` },
      { label: 'Бал. стоимость', value: hasCost(m) ? `${fmtNum(totalCost(m))} сом` : 'не указана' },
      { label: 'Название списка', value: m.groupName || m.name, wide: true },
    ],
    actions: `<button class="btn btn-ghost" data-mech-back>← К объектам оценки</button>
      <button class="btn btn-primary" data-mech-save>Сохранить</button>`,
    tabs: [{ key: 'general', label: 'Общие данные' }],
  });
}

export function viewMech(ctx) {
  return `${headMech(ctx)}
    ${splitWrap(ctx.ui.viewer ? viewerHTML(ctx) : null, formHTML(ctx))}`;
}
