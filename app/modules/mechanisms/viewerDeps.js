import { ensureFilePages, attachedFileFrom, isFileTooLarge, MAX_DOC_FILE_MB } from '../../kernel/fileUpload.js';
import { DOC_TYPES } from './data/dictionaries.js';
import { photoPages, photoGroups, photoFileAt, catLabel } from './photos.js';

// Доступ просмотрщика ядра к данным ОЦ «Механизмы и оборудование»
// (kernel/viewer/deps.js). Устроено как у ОЦ «Транспортные средства»:
// объектов имущества нет, снимки держит часть записи (rec.mech), и модуль
// отдаёт её просмотрщику как ctx.oi (index.js). Категория снимка — единица
// техники, подпись — её название (photos.js, catLabel).
export const viewerDeps = {
  typeId: 'mechanisms',
  typeLabel: 'Механизмы и оборудование',

  docListFor: (ctx) => ctx.rec.docs || [],
  ensureDocPages: (d) => { ensureFilePages(d.file); d.pages = d.file ? d.file.pages : []; },
  attachedFileFrom,
  isFileTooLarge,
  maxFileMb: MAX_DOC_FILE_MB,
  scopeLabel: () => 'ОЦ',
  nextDocId: (rec) => `mech-doc-${rec.id}-${(rec.docs || []).length + 1}-${Date.now()}`,
  docTypes: () => DOC_TYPES,

  photoPages,
  photoGroups,
  photoFileAt,
  catLabel,

  // Лога правок у ОЦ механизмов нет (как у ОЦ ТС) — постраничные действия не
  // записываются.
  pushDocPageLog: () => {},
};
