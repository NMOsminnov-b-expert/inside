// Карточка ОИ «Транспортное средство» — та же форма «база + модуль», что у ТС
// как объекта оценки (vehicle/card.js), без блока сторон: у объекта имущества
// стороны — у ОЦ (указание пользователя 23.09.2026). Снимки держит сам объект
// имущества, поэтому он же передаётся форме держателем фото.
import { splitWrap, viewerHTML } from '../../../../kernel/viewer/shell.js';
import { tsFormHTML } from '../../../vehicle/card.js';

export function render(ctx, oi) {
  // .ts-host — граница стилей карточки ТС внутри гражданского (vehicle/module.css).
  const body = `<div class="oi-stack ts-host">${tsFormHTML(ctx, oi, oi)}</div>`;
  return splitWrap(ctx.ui.viewer ? viewerHTML(ctx) : null, body);
}
