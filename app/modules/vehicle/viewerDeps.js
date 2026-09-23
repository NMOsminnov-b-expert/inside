import { ensureFilePages, attachedFileFrom, isFileTooLarge, MAX_DOC_FILE_MB } from '../../kernel/fileUpload.js';
import { DOC_TYPES } from './data/dictionaries.js';
import { photoPages, photoGroups, photoFileAt, catLabel } from './photos.js';

// Доступ просмотрщика ядра к данным этого модуля (kernel/viewer/deps.js).
//
// Все режимы — «Фото», «Документы», «Сравнение» — как в карточках
// недвижимости (задача пользователя 23.09.2026). Литер у ТС нет: снимки держит
// сама запись (photos.js), и модуль отдаёт этот держатель просмотрщику как
// ctx.oi (index.js).
export const viewerDeps = {
  typeId: 'vehicle',
  typeLabel: 'Транспортное средство',

  docListFor: (ctx) => ctx.rec.docs || [],
  ensureDocPages: (d) => { ensureFilePages(d.file); d.pages = d.file ? d.file.pages : []; },
  attachedFileFrom,
  isFileTooLarge,
  maxFileMb: MAX_DOC_FILE_MB,
  scopeLabel: () => 'ТС',
  nextDocId: (rec) => `vehicle-doc-${rec.id}-${(rec.docs || []).length + 1}-${Date.now()}`,
  docTypes: () => DOC_TYPES,

  photoPages,
  photoGroups,
  photoFileAt,
  catLabel,

  // Лога правок у ТС нет (в модуле нет каталога audit) — постраничные
  // действия не записываются.
  pushDocPageLog: () => {},
};
