import { ensureFilePages, attachedFileFrom, isFileTooLarge, MAX_DOC_FILE_MB } from '../../kernel/fileUpload.js';
import { DOC_TYPES } from './data/dictionaries.js';

// Доступ просмотрщика ядра к данным этого модуля (kernel/viewer/deps.js).
//
// У транспортного средства нет ни литер, ни фотораздела: снимки прикрепляют
// теми же документами (вид «Фото»), поэтому режимы «Фото» и «Сравнение»
// выключены, а всё остальное — вкладки, прикрепление пачкой, миниатюры,
// клавиши — работает как в карточках недвижимости.
export const viewerDeps = {
  typeId: 'vehicle',
  typeLabel: 'Транспортное средство',
  can: { photo: false, compare: false },

  docListFor: (ctx) => ctx.rec.docs || [],
  ensureDocPages: (d) => { ensureFilePages(d.file); d.pages = d.file ? d.file.pages : []; },
  attachedFileFrom,
  isFileTooLarge,
  maxFileMb: MAX_DOC_FILE_MB,
  scopeLabel: () => 'ТС',
  nextDocId: (rec) => `vehicle-doc-${rec.id}-${(rec.docs || []).length + 1}-${Date.now()}`,
  docTypes: () => DOC_TYPES,

  photoPages: () => [],
  photoGroups: () => [],
  photoFileAt: () => null,
  catLabel: (oi, cat) => cat,

  // Лога правок у ТС нет (в модуле нет каталога audit) — постраничные
  // действия не записываются.
  pushDocPageLog: () => {},
};
