import { createOC, createOI, createDOCS } from './seed.js';
import { buildFloors } from '../features/oi/floorsModel.js';

export const OC = createOC();
export const OI = createOI();
export const DOCS = createDOCS();

OI.filter((o) => o.kind === 'realty').forEach(buildFloors);

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

  // Новое состояние сворачивания левого сайдбара.
  sidebarCollapsed: false,
};