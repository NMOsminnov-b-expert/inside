import { docListFor, ensureDocPages, attachedFileFrom, isFileTooLarge, MAX_DOC_FILE_MB, scopeLabel } from './model.js';
import { photoPages, photoGroups, photoFileAt, catLabel } from '../photos/model.js';
import { DOC_TYPES } from '../../data/dictionaries.js';
import { opt } from '../../data/opts.js';
import { nextDocId } from '../../data/store.js';
import { pushDocPageLog } from '../../audit/model.js';

// Доступ просмотрщика ядра к данным этого модуля (kernel/viewer/deps.js).
// Просмотрщик один на все типы ОЦ, а документы, фото, справочник видов,
// выдача идентификаторов и лог действий у каждого модуля свои.
export const viewerDeps = {
  typeId: 'civil',
  typeLabel: 'Гражданское здание',

  docListFor,
  ensureDocPages,
  attachedFileFrom,
  isFileTooLarge,
  maxFileMb: MAX_DOC_FILE_MB,
  scopeLabel,
  nextDocId,
  docTypes: () => opt('oc', 'docType', DOC_TYPES),

  photoPages,
  photoGroups,
  photoFileAt,
  catLabel,

  pushDocPageLog,
};
