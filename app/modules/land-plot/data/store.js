import { createSeed } from './seed.js';
import { LETTER_SEQ } from './dictionaries.js';

// Данные и UI-состояние ЭТОГО модуля. Один экземпляр на сессию (ES-модуль).
export const records = createSeed();

export function getRecord(id) {
  return records.find((r) => r.id === id) || null;
}

export function getOi(rec, oiId) {
  return rec ? (rec.oi.find((o) => o.id === oiId) || null) : null;
}

// UI-состояние карточки: раскрытия, режимы, просмотрщик.
// Навигация (какая запись, какой ОИ, какая вкладка) живёт в маршруте.
export const ui = {
  expanded: {},
  photoPop: null,        // id литеры, у которой открыто окно со списком фото
  // Столбцы перечня ОИ: порядок и изменённые вручную ширины
  // (общий механизм — kernel/columns.js).
  oiCols: null,
  oiColWidths: {},
  accOpen: {},
  doneOpen: {},
  viewer: null,        // { mode: 'doc' | 'photo' | 'compare' }
  viewerDoc: null,     // { scope, id }
  letterEdit: false,
  heatOpen: false,
  photoQuery: '',
  mechMode: 'mono',
  mechDocs: [],
  // Ширина просмотрщика — своя для каждого режима (parts/viewer/shell.js).
  splitVW: {},
  // Сравнение: соотношение колонок и свёрнутая половина (Л3.9).
  cmpSplit: 50,
  cmpHidden: null,
  railCollapsed: false,
  viewerSidebar: false,   // выехал сайдбар выбора документа/фото
  // Фильтры вкладки «Логи»: пустой массив = «без ограничения, показаны все».
  auditCatOpen: false,
  auditCatFilter: [],
  auditPersonOpen: false,
  auditPersonFilter: [],
  auditActionOpen: false,
  auditActionFilter: [],
  auditObjectOpen: false,
  auditObjectFilter: [],
  auditDateFrom: '',
  auditDateTo: '',
  auditSearchText: '',
  pageSel: [],   // лента миниатюр просмотрщика свёрнута
};

export function resetViewer() {
  ui.viewer = null;
  ui.viewerDoc = null;
  // Закладка «Документы» — состояние ЭКРАНА, а не записи: перешли к другому
  // объекту оценки, значит просмотрщик снова открыт по умолчанию.
  ui.viewerClosed = false;
}

export function nextLetter(rec) {
  const used = new Set(rec.oi.filter((o) => o.card !== 'land').map((o) => o.letter));
  return LETTER_SEQ.find((x) => !used.has(x)) || ('Л' + (used.size + 1));
}

// Идентификаторы: последовательные внутри записи, без опоры на длину массива.
let seq = Date.now() % 100000;
export function nextId(prefix) {
  seq += 1;
  return `${prefix}-${seq.toString(36)}`;
}

// ЕНИ выдаётся от максимума уже использованных, а не от длины массива —
// иначе после удаления ОИ код повторяется (исправление дефекта макета).
export function nextEni(rec, base) {
  const used = rec.oi.map((o) => parseInt(o.eni, 10)).filter((n) => !isNaN(n));
  const max = used.length ? Math.max(...used) : parseInt(base, 10) || 147561681300;
  return String(max + 1);
}

// Id вида «<ЕНИ записи>-<порядковый номер>» — для записей лога действий
// (см. audit/model.js). Тот же принцип, что у nextEni: порядковый номер берётся
// от максимума уже использованных суффиксов, а не от длины массива, — переживает
// удаления. Пока у записи ещё нет ЕНИ — базой служит rec.id.
export function nextEniScoped(rec, existingIds) {
  const used = (existingIds || [])
    .map((id) => { const m = /-(\d+)$/.exec(id || ''); return m ? parseInt(m[1], 10) : NaN; })
    .filter((n) => !isNaN(n));
  const base = rec.eni || rec.id;
  return `${base}-${(used.length ? Math.max(...used) : 0) + 1}`;
}

// Документ — это то, что прикреплено к ОЦ (см. audit/model.js), независимо
// от того, лежит ли он технически в rec.docs или в docs конкретного ОИ —
// поэтому счётчик общий на всю запись, не на каждый массив по отдельности.
export function nextDocId(rec) {
  const ids = (rec.docs || []).map((d) => d.id)
    .concat((rec.oi || []).flatMap((o) => (o.docs || []).map((d) => d.id)));
  return nextEniScoped(rec, ids);
}

export function addRecord(rec) {
  records.push(rec);
  return rec;
}

export function removeRecord(id) {
  const i = records.findIndex((r) => r.id === id);
  if (i >= 0) records.splice(i, 1);
}

// Изъять запись, отдав её содержимое: так объект уезжает в архив, а не
// исчезает (kernel/archive.js, ТЗ docs/tz/20-arhiv.md §4.2). Отличие от
// removeRecord ровно в том, что запись возвращается вызывающему.
export function takeRecord(id) {
  const i = records.findIndex((r) => r.id === id);
  if (i < 0) return null;
  const [rec] = records.splice(i, 1);
  return rec;
}

// Вернуть запись из архива — С ТЕМ ЖЕ идентификатором: на него ссылаются
// документы, привязки и лог действий. Если запись с таким id уже есть,
// возврат ничего не делает: повторный возврат не должен создавать дубль.
export function restoreRecord(rec) {
  if (!rec || !rec.id) return null;
  if (records.some((r) => r.id === rec.id)) return null;
  records.push(rec);
  return rec;
}
