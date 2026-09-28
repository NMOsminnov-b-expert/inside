import { esc } from '../../../kernel/dom.js';
import { realtyTypes, movableTypes } from '../data/rules.js';

// Меню добавления ОИ: движимое появляется только у имущественного комплекса.
export function addOiMenuHTML(rec) {
  const realty = realtyTypes();
  const movable = movableTypes(rec);

  return `${realty.length ? `<div class="dd-group">Недвижимость</div>
${realty.map((t) => `<button data-add-oi="${esc(t.label)}">${esc(t.label)}</button>`).join('')}` : ''}

${movable.length ? `<div class="dd-group">Движимое имущество</div>
${movable.map((t) => `<button data-add-oi="${esc(t.label)}">${esc(t.label)}</button>`).join('')}` : ''}`;
}
