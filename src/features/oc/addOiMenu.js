import { OC } from '../../core/state.js';
import { esc } from '../../core/utils.js';
import {
  allowedRealtyOiTypesForOc,
  allowedMovableOiTypesForOc,
  MOVABLE_OI_TYPE_LABELS,
} from './ocRules.js';

export function addOiMenuHTML() {
  const realtyTypes = allowedRealtyOiTypesForOc(OC);
  const movableTypes = allowedMovableOiTypesForOc(OC);

  return `${realtyTypes.length ? `<div class="dd-group">Недвижимость</div>
${realtyTypes.map((type) => `<button data-add-oi="${esc(type)}">${esc(type)}</button>`).join('')}` : ''}

${movableTypes.length ? `<div class="dd-group">Движимое имущество</div>
${movableTypes.map((type) => `<button data-add-oi="${esc(type)}">${esc(MOVABLE_OI_TYPE_LABELS[type] || type)}</button>`).join('')}` : ''}`;
}