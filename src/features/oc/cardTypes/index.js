import { OC_SUBTYPE, resolveOcSubtype } from '../ocSubtypes.js';

import { ocResidentialForm } from './ocResidentialForm.js';
import { ocCivilForm } from './ocCivilForm.js';
import { ocProductionForm } from './ocProductionForm.js';
import { ocOtherRealtyForm } from './ocOtherRealtyForm.js';
import { ocMovableForm } from './ocMovableForm.js';

const registry = new Map();

export function registerOcForm(subtype, definition) {
  registry.set(subtype, definition);
}

export function getOcFormDefinitionBySubtype(subtype) {
  return registry.get(subtype) || registry.get(OC_SUBTYPE.CIVIL);
}

export function getOcFormDefinition(oc) {
  const subtype = resolveOcSubtype(oc);
  return getOcFormDefinitionBySubtype(subtype);
}

registerOcForm(OC_SUBTYPE.RESIDENTIAL, ocResidentialForm);
registerOcForm(OC_SUBTYPE.CIVIL, ocCivilForm);
registerOcForm(OC_SUBTYPE.PRODUCTION, ocProductionForm);
registerOcForm(OC_SUBTYPE.OTHER_REALTY, ocOtherRealtyForm);
registerOcForm(OC_SUBTYPE.MOVABLE, ocMovableForm);