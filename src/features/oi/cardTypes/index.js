import { OI_SUBTYPE, resolveOiSubtype } from '../oiSubtypes.js';

import { realtyResidentialCard } from './realtyResidentialCard.js';
import { realtyApartmentCard } from './realtyApartmentCard.js';
import { realtyCivilCard } from './realtyCivilCard.js';
import { realtyProductionCard } from './realtyProductionCard.js';
import { realtyOtherCard } from './realtyOtherCard.js';

import { landCard } from './landCard.js';
import { vehicleCard } from './vehicleCard.js';
import { mechCard } from './mechCard.js';
import { officeCard } from './officeCard.js';

const registry = new Map();

export function registerOiCard(subtype, definition) {
  registry.set(subtype, definition);
}

export function getOiCardDefinitionBySubtype(subtype) {
  return registry.get(subtype) || registry.get(OI_SUBTYPE.REALTY_CIVIL);
}

export function getOiCardDefinition(oi) {
  const subtype = resolveOiSubtype(oi);
  return getOiCardDefinitionBySubtype(subtype);
}

registerOiCard(OI_SUBTYPE.REALTY_RESIDENTIAL, realtyResidentialCard);
registerOiCard(OI_SUBTYPE.REALTY_APARTMENT, realtyApartmentCard);
registerOiCard(OI_SUBTYPE.REALTY_CIVIL, realtyCivilCard);
registerOiCard(OI_SUBTYPE.REALTY_PRODUCTION, realtyProductionCard);
registerOiCard(OI_SUBTYPE.REALTY_OTHER, realtyOtherCard);

registerOiCard(OI_SUBTYPE.LAND, landCard);
registerOiCard(OI_SUBTYPE.VEHICLE, vehicleCard);
registerOiCard(OI_SUBTYPE.MECH, mechCard);
registerOiCard(OI_SUBTYPE.OFFICE, officeCard);