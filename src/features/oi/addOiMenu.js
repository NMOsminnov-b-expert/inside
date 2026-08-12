import { OC } from '../../core/state.js';
import { REALTY_TYPES } from '../../core/dictionaries.js';
import { esc } from '../../core/utils.js';

export function addOiMenuHTML() {
  return `<div class="dd-group">Недвижимость</div>
${REALTY_TYPES.map((type) => `<button data-add-oi="${esc(type)}">${esc(type)}</button>`).join('')}

${OC.complex ? `<div class="dd-group">Движимое имущество</div>
<button data-add-oi="МЕХ">Механизмы и производственное оборудование</button>
<button data-add-oi="ОФИС">Офисная техника и мебель</button>` : ''}`;
}