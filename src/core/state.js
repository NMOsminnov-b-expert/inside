import { createOC, createOI, createDOCS } from './seed.js';
import { buildFloors, buildApartmentFloors } from '../features/oi/floorsModel.js';

export const OC = createOC();
export const OI = createOI();
export const DOCS = createDOCS();

// Этажные списки: у квартир отдельная модель без подвала/мансарды/цоколя.
// Подтип проверяется строковым литералом, чтобы не тянуть лишние импорты в state.
OI.filter((o) => o.kind === 'realty').forEach((o) => {
  if (o.subtype === 'realty_apartment') buildApartmentFloors(o);
  else buildFloors(o);
});

// Единое изменяемое состояние UI (навигация, раскрытия, режимы).
export const appState = {
  view: 'oc',          // oc | oi | ocform | mech
  tab: 'general',      // general | docs | photo
  openOi: null,
  expanded: {},
  viewer: null,        // { mode: 'doc' | 'photo' | 'compare' }
  viewerDoc: null,     // { scope, id }
  mechMode: 'mono',
  mechKind: 'МЕХ',
  heatOpen: false,
  letterEdit: false,
  mechDocs: [],
  accOpen: {},
  doneOpen: {},
  notesOpen: false,
  photoQuery: '',
  // Состояние сворачивания левого сайдбара.
  sidebarCollapsed: false,
};