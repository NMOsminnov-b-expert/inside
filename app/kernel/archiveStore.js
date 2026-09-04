// Хранилище архива — единый список на всю систему.
//
// Почему отдельно от записей ОЦ (ТЗ docs/tz/20-arhiv.md, §1.2): раньше архив
// лежал в самой записи (`rec.archive`), и это работало, пока в архив попадали
// только документы этой записи. Как только в архив начинают уезжать сами
// объекты оценки, документы реестра, учреждения и справочники, места внутри
// записи не остаётся:
//   * удалённый объект некуда положить — его архив исчез бы вместе с ним;
//   * документ реестра и документ учреждения не принадлежат ни одному ОЦ;
//   * учреждение и справочник к объекту не относятся вовсе.
//
// Здесь только хранение и поиск по индексам. Правила — что можно положить, кто
// вправе вернуть, как выполняется возврат — в kernel/archive.js: хранилище не
// должно знать ни одного вида записи по имени.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: список живёт в памяти вкладки и растёт бесконечно —
// архив вечен (решение пользователя 03.09.2026). На сервере это таблица со
// своими индексами и страничной выборкой; для очень старых записей возможен
// перенос в холодное хранилище, но удаления нет. Выбор за теми, кто будет
// делать серверную часть.

const entries = [];

let seq = 0;
let batchSeq = 0;

export const nextArchiveId = () => 'arc-' + (++seq);
export const nextBatchId = () => 'arcb-' + (++batchSeq);

// --- запись ---------------------------------------------------------------

// Добавить записи. Если их больше одной — это пакет: у всех общий batchId, а
// первая считается корневой (её возврат поднимает весь пакет).
export function addEntries(list) {
  const arr = (Array.isArray(list) ? list : [list]).filter(Boolean);
  if (!arr.length) return [];

  const batchId = arr.length > 1 ? nextBatchId() : null;

  arr.forEach((entry, i) => {
    entry.id = entry.id || nextArchiveId();
    entry.batchId = batchId;
    entry.batchRole = batchId ? (i === 0 ? 'root' : 'child') : null;
    entry.restoredAt = entry.restoredAt || null;
    entry.restoredBy = entry.restoredBy || null;
    entries.push(entry);
  });

  return arr;
}

export function markRestored(id, who, when) {
  const entry = entryById(id);
  if (!entry) return null;
  entry.restoredAt = when;
  entry.restoredBy = who;
  return entry;
}

// --- чтение ---------------------------------------------------------------

export function allEntries() {
  return entries;
}

export function entryById(id) {
  return entries.find((e) => e.id === id) || null;
}

// Записи пакета в порядке добавления: возврат идёт сверху вниз (учреждение →
// подведы → объекты → документы), иначе объекту некуда встать.
export function batchOf(batchId) {
  if (!batchId) return [];
  return entries.filter((e) => e.batchId === batchId);
}

// Живые (невозвращённые) записи пакета — возврат не должен дублировать то, что
// уже подняли отдельно.
export function pendingBatch(batchId) {
  return batchOf(batchId).filter((e) => !e.restoredAt);
}

export function countPending(match = () => true) {
  return entries.filter((e) => !e.restoredAt && match(e)).length;
}

// --- код ЕНИ --------------------------------------------------------------
//
// Код ЕНИ может повторяться (уточнение пользователя 03.09.2026), и совпавшие
// записи различаются скрытым индексом. Архив участвует в этом с двух сторон:
//   * eniIndexes — какие индексы этого кода заняты архивными записями, чтобы
//     возврат взял свободный;
//   * eniTaken — занят ли код архивной записью; нужно только когда система
//     настроена на уникальный код (ENI_UNIQUE в kernel/fmt.js).

function eniOf(entry) {
  return (entry.from && entry.from.eni) || '';
}

export function eniIndexes(eni) {
  if (!eni) return [];
  return entries
    .filter((e) => e.kind === 'oc' && !e.restoredAt && eniOf(e) === String(eni))
    .map((e) => (e.payload && e.payload.eniIndex) || 1);
}

export function eniTaken(eni) {
  if (!eni) return false;
  return entries.some((e) => e.kind === 'oc' && !e.restoredAt && eniOf(e) === String(eni));
}

// Архивная запись объекта с этим кодом — для ссылки «такой код у объекта в
// архиве» в форме создания.
export function ocEntryByEni(eni) {
  if (!eni) return null;
  return entries.find((e) => e.kind === 'oc' && !e.restoredAt && eniOf(e) === String(eni)) || null;
}
