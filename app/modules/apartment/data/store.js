import { createSeed } from './seed.js';
import { registerPersisted, copyTag } from '../../../kernel/persist.js';
import { persistView, VIEWER_KEEP } from '../../../kernel/viewState.js';
import { LETTER_SEQ } from './dictionaries.js';
import { demoEniNear } from '../../../kernel/demoParcels.js';

// Данные и UI-состояние ЭТОГО модуля. Один экземпляр на сессию (ES-модуль).
export const records = createSeed();

// Введённое переживает перезагрузку страницы (требование пользователя
// 09.09.2026). Сохраняются только данные: раскрытия, режимы и просмотрщик
// (ui ниже) — состояние экрана, его восстанавливать незачем.
//
// Массив не подменяется, а перезаполняется: на него уже ссылаются модули, и
// смена ссылки оставила бы их со старыми данными.
registerPersisted('records.apartment', {
  snapshot: () => records,
  restore: (saved) => {
    // Пустой список — законный итог (все записи типа удалены): прежнее
    // «!saved.length → оставить засев» возвращало удалённые демо-записи после
    // перезагрузки (код-ревью 09.10.2026).
    if (!Array.isArray(saved)) return;
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
  // Ширина просмотрщика — своя для каждого режима (kernel/viewer/shell.js).
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
  // Выбранная единица в карточке механизмов — по id ОИ.
  mechSel: {},
};


// Вид карточки переживает перезагрузку (решение пользователя 09.10.2026: «в
// каком виде мы страницу закрываем, в таком же она потом должна открываться»;
// раньше — 09.09.2026, «внутри ОЦ ОИ так же запоминай положение и статус
// элементов»). Общее правило и состав — kernel/viewState.js; здесь — своё
// модуля: раскрытые блоки, столбцы перечня и развёртки, поиск по фото,
// фильтры «Логов», выбранная единица механизмов, свёрнутые блоки ТС внутри
// здания. Не сохраняется сиюминутное: окно со списком фото, выделение
// страниц, правка литеры, раскрытые списки фильтров.
const UI_KEEP = [
  ...VIEWER_KEEP,
  'expanded', 'accOpen', 'doneOpen', 'heatOpen', 'cardsClosed',
  'oiCols', 'oiColWidths', 'floorCols',
  'photoQuery',
  'auditCatFilter', 'auditPersonFilter', 'auditActionFilter', 'auditObjectFilter',
  'auditDateFrom', 'auditDateTo', 'auditSearchText',
  'mechSel', 'tsClosed', 'tsInspect', 'growSizes',
];

persistView('apartment', ui, UI_KEEP);

// Окно со списком фото привязано к ячейке перечня: как только перечень уходит
// с экрана, окну там делать нечего. Своей функцией, а не внутри resetViewer:
// просмотрщик сбрасывается только при смене записи, а окно фото — при любом
// переходе, в том числе в карточку литеры и обратно.
export function closePhotoPop() {
  ui.photoPop = null;
  ui.photoPopCat = '';
}

export function resetViewer() {
  ui.viewer = null;
  ui.viewerDoc = null;
  // То, что просмотрщик закрыт крестиком, не сбрасываем: человек закрыл его
  // для себя, а не для одной записи (решения 09.09 и 09.10.2026 — как в
  // нежилом здании). Открыть обратно — закладкой «Документы».
  // Фильтр «Логов» по объектам — id ОИ прежней записи: на новой лог выглядел
  // бы пустым (код-ревью 09.10.2026).
  ui.auditObjectFilter = [];
}

export function nextLetter(rec) {
  const used = new Set(rec.oi.filter((o) => o.card !== 'land').map((o) => o.letter));
  return LETTER_SEQ.find((x) => !used.has(x)) || ('Л' + (used.size + 1));
}

// Идентификаторы: последовательные внутри записи, без опоры на длину массива.
// Счёт — от полного времени в миллисекундах: оно растёт от сеанса к сеансу, и
// новый сеанс не выдаёт уже выданный id. Прежде — Date.now() % 100000: полный
// круг за 100 с, и запись нового сеанса могла получить id сохранённой и
// заменить её (код-ревью 09.10.2026).
let seq = Date.now();
// С меткой копии макета: записи сотрудников сводятся вместе (kernel/persist.js),
// и одинаковые номера из разных копий слили бы чужие записи в одну.
export function nextId(prefix) {
  seq += 1;
  const tag = copyTag();
  return `${prefix}-${tag ? tag + '-' : ''}${seq.toString(36)}`;
}

// ЕНИ нового ОИ — настоящий участок Кадастра рядом с кодом записи
// (kernel/demoParcels.js, demoEniNear); занятые коды записи не повторяются.
export function nextEni(rec, base) {
  return demoEniNear(base || rec.eni, [rec.eni, ...rec.oi.map((o) => o.eni)]);
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
