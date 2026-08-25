import { esc } from '../../../kernel/dom.js';
import { OI_TYPES } from '../data/rules.js';

// Меню добавления ОИ строится по правилам ЭТОГО типа ОЦ.
export function addOiMenuHTML() {
  return `<div class="dd-group">Недвижимость</div>
${OI_TYPES.map((t) => `<button data-add-oi="${esc(t.label)}">${esc(t.label)}</button>`).join('')}`;
}
