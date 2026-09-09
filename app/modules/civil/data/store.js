import { createSeed } from './seed.js';
import { LETTER_SEQ } from './dictionaries.js';
import { registerPersisted } from '../../../kernel/persist.js';

// Данные и UI-состояние ЭТОГО модуля. Один экземпляр на сессию (ES-модуль).
export const records = createSeed();

// Введённое переживает перезагрузку страницы (требование пользователя
// 09.09.2026). Сохраняются только сами записи: раскрытия, режимы и просмотрщик
// (ui ниже) — это состояние экрана, его восстанавливать незачем.
//
// Массив не подменяется, а перезаполняется: на него уже ссылаются модули,
// поэтому смена ссылки оставила бы их со старыми данными.
registerPersisted('records.civil', {
  snapshot: () => records,
  restore: (saved) => {
    if (!Array.isArray(saved) || !saved.length) return;
    records.splice(0, records.length, ...saved);
  },
});

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
  // Ширина просмотрщика — своя для каждого режима (parts/viewer/shell.js).
  splitVW: {},
  // Сравнение: соотношение колонок и свёрнутая половина (Л3.9).
  cmpSplit: 50,
  cmpHidden: null,
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
  mechMode: 'mono',
  mechDocs: [],
  mechRows: [],
  mechDraft: { name: '', year: '', serial: '' },
};


// Положение и состояние элементов карточки — просмотрщик с его размерами,
// ширины и порядок столбцов, раскрытые блоки (требование пользователя
// 09.09.2026: «внутри ОЦ ОИ так же запоминай положение и статус элементов»).
//
// Сохраняем не всё подряд: сиюминутное состояние (открытое окно фото, набранный
// в поиске текст, раскрытые списки фильтров) при возврате только мешало бы —
// человек ждёт свою раскладку, а не чужое открытое окно.
const UI_KEEP = [
  'expanded', 'accOpen', 'doneOpen',
  'splitVW', 'cmpSplit', 'cmpHidden',
  // viewerClosed — закрыт ли просмотрщик крестиком. Раньше не сохранялся, и
  // перезагрузка возвращала его на экран (замечание пользователя 09.09.2026).
  'viewer', 'viewerDoc', 'viewerSidebar', 'viewerClosed',
  'oiCols', 'oiColWidths',
  'railCollapsed',
];

registerPersisted('ui.civil', {
  snapshot: () => Object.fromEntries(UI_KEEP.map((k) => [k, ui[k]])),
  restore: (saved) => {
    if (!saved || typeof saved !== 'object') return;
    UI_KEEP.forEach((k) => {
      if (saved[k] !== undefined) ui[k] = saved[k];
    });
  },
});

export function resetViewer() {
  // Какой документ открыт — про конкретную запись: перешли к другой, значит
  // выбор сбрасывается.
  ui.viewer = null;
  ui.viewerDoc = null;
  // А вот то, что просмотрщик закрыт крестиком, НЕ сбрасываем: человек закрыл
  // панель для себя, а не для одной записи, и возвращать её на каждом переходе
  // — то самое, что раздражало (решение 09.09.2026). Открыть обратно —
  // закладкой «Документы».
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

// Счётчика ЕНИ для объектов имущества здесь больше нет: новый объект получает
// код самой записи (решение пользователя 09.09.2026, см. card/ocCard.ctrl.js).
// Код объекту имущества присваивает Кадастр, а выданный макетом «следующий
// свободный» всё равно правили руками.

// Id вида «<ЕНИ записи>-<порядковый номер>» — для записей лога действий
// (см. audit/model.js). Порядковый номер берётся от максимума уже
// использованных суффиксов, а не от длины массива, — переживает удаления.
// Пока у записи ещё нет ЕНИ — базой служит rec.id.
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
