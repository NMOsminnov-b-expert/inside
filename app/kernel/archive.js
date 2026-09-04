// Архив — общий механизм на всю систему: правила над хранилищем
// (kernel/archiveStore.js).
//
// Что это такое (ТЗ docs/tz/20-arhiv.md): удаление в интерфейсе не удаляет
// данные, а убирает их в архив, откуда запись можно найти, посмотреть и
// вернуть на место. Архив вечен — окончательного удаления нет ни у кого
// (решение пользователя 03.09.2026).
//
// Почему в ядре: архив один на систему, а класть в него умеют все пять модулей
// ОЦ и три общих раздела. Держать копии правил — верный способ получить
// несколько разных архивов (так уже разъезжались значки состояния и состав
// ui-состояния).
//
// Виды записей (kind): document — сделан; oc, oi, institution, dict — этапы 3–5
// ТЗ. Хранилище про виды не знает: их знают только правила здесь.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: дата и автор берутся с клиента, файл — blob-ссылкой;
// на сервере это серверное время, подтверждённый пользователь и файловое
// хранилище. Право возврата (canRestore) считается здесь для того, чтобы
// спрятать кнопку, — на сервере то же правило обязано проверяться заново.
import { session, seesEverything, myInstitutions } from './session.js';
import { sortedTypes } from './registry.js';
import {
  addEntries, allEntries, entryById, markRestored, nextArchiveId,
} from './archiveStore.js';
import { takeDocument, restoreDocument, getDocument } from './documentsRegistry.js';
import { eniIndexes, pendingBatch } from './archiveStore.js';
import { ENI_UNIQUE } from './fmt.js';

export { entryById } from './archiveStore.js';

// Куда именно был прикреплён документ: к самому ОЦ или к литере/участку.
// Подпись нужна в архиве — без неё непонятно, откуда документ пришёл.
export function docScopeLabel(rec, oi) {
  if (!oi) return 'Объект оценки';
  const letter = oi.letter ? `Литера ${oi.letter}` : (oi.card === 'land' ? 'Земельный участок' : 'ОИ');
  return oi.name ? `${letter} · ${oi.name}` : letter;
}

// --- миграция старого архива ----------------------------------------------
//
// До 03.09.2026 архивные документы лежали в самой записи (`rec.archive`).
// Переносим их в общий список при первом чтении и убираем поле: иначе один и
// тот же документ был бы виден в двух источниках сразу.
const migrated = new WeakSet();

function migrateRecord(rec) {
  if (!rec || migrated.has(rec)) return;
  migrated.add(rec);

  const old = rec.archive;
  if (!old || !old.length) {
    delete rec.archive;
    return;
  }

  old.forEach((entry) => {
    const { archivedAt, archivedBy, from, ...doc } = entry;
    addEntries({
      id: nextArchiveId(),
      kind: 'document',
      title: doc.name || doc.type || 'Документ',
      subtitle: (from && from.scopeLabel) || '',
      archivedAt,
      archivedBy,
      from: { place: from && from.oiId ? 'oi' : 'oc', ...from },
      payload: { doc },
    });
  });

  delete rec.archive;
}

function migrateAll() {
  sortedTypes().forEach((t) => {
    const records = t.records.allRecords ? t.records.allRecords() : [];
    records.forEach(migrateRecord);
  });
}

// --- положить в архив -----------------------------------------------------

// Убрать документ карточки ОЦ/ОИ в архив. Сигнатура сохранена: её зовут все
// пять модулей (parts/viewer/ctrl.js). Возвращает архивную запись либо null,
// если документа в списке не оказалось.
export function archiveDoc({ rec, oi, docId, typeId, typeLabel, today }) {
  const holder = oi || rec;
  const list = holder && holder.docs;
  if (!list) return null;

  const i = list.findIndex((d) => d.id === docId);
  if (i < 0) return null;

  const [doc] = list.splice(i, 1);

  // Файл НЕ освобождается: архивный документ ещё открывают и скачивают.
  const [entry] = addEntries({
    kind: 'document',
    title: doc.name || doc.type || 'Документ',
    subtitle: docScopeLabel(rec, oi),
    archivedAt: today,
    archivedBy: session.state.person,
    from: {
      place: oi ? 'oi' : 'oc',
      typeId,
      typeLabel,
      ocId: rec.id,
      ocTitle: rec.address || rec.title || rec.id,
      eni: rec.eni || '',
      institution: rec.institution || '',
      podved: rec.podved || '',
      oiId: oi ? oi.id : null,
      scopeLabel: docScopeLabel(rec, oi),
      staff: staffOfRecord(rec, oi),
    },
    payload: { doc },
  });

  return entry;
}

// Убрать документ РЕЕСТРА в архив: из реестра «Документы» или из документов
// учреждения. Отличие от archiveDoc: там документ лежал в карточке объекта, а
// здесь — в общем реестре, и место возврата у него другое.
//
// Открепление и архивирование — разные вещи (ТЗ §4.1): открепить документ от
// учреждения значит снять связь, документ остаётся в реестре. В архив уезжает
// только то, что человек удаляет.
export function archiveRegistryDoc({ docId, place = 'docs', node = null, today }) {
  const doc = takeDocument(docId);
  if (!doc) return null;

  const file = (doc.files || [])[0];
  const [entry] = addEntries({
    kind: 'document',
    title: `${doc.type || 'Документ'}${file ? ' · ' + file.name : ''}`,
    subtitle: place === 'institution' ? (node ? node.name : 'Учреждение') : 'Реестр документов',
    archivedAt: today || todayIso(),
    archivedBy: session.state.person,
    from: {
      place,
      institution: doc.institution || (node ? node.name : ''),
      nodeId: node ? node.id : null,
      nodeName: node ? node.name : '',
      ocTitle: '',
      eni: '',
      scopeLabel: place === 'institution'
        ? `Документы учреждения${node ? ' · ' + node.name : ''}`
        : 'Реестр документов',
    },
    payload: { doc },
  });

  return entry;
}

// Вернуть документ реестра. Возвращается с тем же идентификатором: на него
// ссылаются привязки к объектам и документы учреждений.
export function restoreRegistryDoc(entryId, today) {
  const entry = entryById(entryId);
  if (!entry || entry.restoredAt || entry.kind !== 'document') return null;
  if (entry.from.place !== 'docs' && entry.from.place !== 'institution') return null;

  const doc = entry.payload.doc;
  const already = getDocument(doc.id);
  if (!already) restoreDocument(doc);

  markRestored(entry.id, session.state.person, today || todayIso());

  // Привязки к объектам, которых больше нет, восстановить некуда — называем их
  // в отчёте, чтобы возврат не выглядел полным.
  const lost = (doc.linkedObjects || []).filter((l) => !linkAlive(l));
  return {
    doc,
    restoredTo: entry.from.scopeLabel,
    lostLinks: lost.map((l) => `${l.type || 'объект'} ${l.eni || ''}`.trim()),
    alreadyThere: !!already,
  };
}

function linkAlive(link) {
  if (!link || !link.typeId || !link.ocId) return true;   // нечего проверять
  const type = sortedTypes().find((t) => t.manifest.id === link.typeId);
  if (!type || !type.records.allRecords) return true;
  return type.records.allRecords().some((r) => r.id === link.ocId);
}

// --- объект оценки --------------------------------------------------------

// Убрать объект оценки в архив вместе со всем содержимым (ТЗ §4.2).
//
// Пакетом: корневая запись `oc` со снимком всей записи плюс по одной записи
// `document` на каждый документ карточки и литер. Зачем дублировать документы
// отдельными записями — чтобы документ находился в архиве поиском по имени
// файла, а не только внутри объекта; возврат корня их не задваивает (проверяет
// restoredAt).
export function archiveRecord({ typeId, typeLabel, rec, today }) {
  const type = sortedTypes().find((t) => t.manifest.id === typeId);
  if (!type || !type.records.takeRecord) return null;

  const taken = type.records.takeRecord(rec.id);
  if (!taken) return null;

  const day = today || todayIso();
  const who = session.state.person;
  const oiList = taken.oi || [];

  // Скрытый индекс кода: у второй записи с тем же кодом он равен 2 и т. д.
  // Человеку не показывается (§6.3) — нужен только чтобы записи различались.
  if (!taken.eniIndex) taken.eniIndex = 1;

  const base = {
    typeId,
    typeLabel: typeLabel || type.manifest.label,
    ocId: taken.id,
    ocTitle: taken.address || taken.title || taken.id,
    eni: taken.eni || '',
    institution: taken.institution || '',
    podved: taken.podved || '',
    staff: staffOfRecord(taken, null),
  };

  const root = {
    kind: 'oc',
    title: base.ocTitle,
    subtitle: `${base.typeLabel} · ${oiList.length} ${plural(oiList.length, 'объект имущества', 'объекта имущества', 'объектов имущества')}`,
    archivedAt: day,
    archivedBy: who,
    from: { place: 'oc', ...base, scopeLabel: 'Объект оценки' },
    payload: { rec: taken, eniIndex: taken.eniIndex },
  };

  // Документы карточки и литер — дочерними записями, но БЕЗ изъятия: они уже
  // внутри снимка объекта, здесь только «карточки поиска».
  const docs = [];
  (taken.docs || []).forEach((doc) => docs.push({ doc, oi: null }));
  oiList.forEach((oi) => (oi.docs || []).forEach((doc) => docs.push({ doc, oi })));

  const children = docs.map(({ doc, oi }) => ({
    kind: 'document',
    title: doc.name || doc.type || 'Документ',
    subtitle: docScopeLabel(taken, oi),
    archivedAt: day,
    archivedBy: who,
    from: {
      place: oi ? 'oi' : 'oc',
      ...base,
      oiId: oi ? oi.id : null,
      scopeLabel: docScopeLabel(taken, oi),
      insideOc: true,          // документ приехал вместе с объектом
    },
    payload: { doc },
  }));

  const entries = addEntries([root, ...children]);
  return entries[0];
}

// Вернуть объект оценки. Совпадение кода ЕНИ возврату не мешает: запись
// получает свободный скрытый индекс (§6.3). При ENI_UNIQUE = true возврат
// запрещён, если код уже занят живой записью.
export function restoreRecordEntry(entryId, today) {
  const entry = entryById(entryId);
  if (!entry || entry.restoredAt || entry.kind !== 'oc') return null;

  const type = sortedTypes().find((t) => t.manifest.id === entry.from.typeId);
  if (!type || !type.records.restoreRecord) return null;

  const rec = entry.payload.rec;
  const live = type.records.allRecords ? type.records.allRecords() : [];

  const sameEni = rec.eni
    ? live.filter((r) => String(r.eni) === String(rec.eni))
    : [];

  if (ENI_UNIQUE && sameEni.length) {
    return { blocked: 'eni', takenBy: sameEni[0] };
  }

  // Свободный скрытый индекс: считаем и по живым записям, и по архивным.
  if (sameEni.length) {
    const used = new Set([
      ...sameEni.map((r) => r.eniIndex || 1),
      ...eniIndexes(rec.eni),
    ]);
    let idx = 1;
    while (used.has(idx)) idx++;
    rec.eniIndex = idx;
  }

  // Учреждение могло уехать в архив — объект возвращается нераспределённым.
  const lostInstitution = !!(rec.institution && !institutionAlive(rec.institution));
  if (lostInstitution) {
    rec.institution = '';
    rec.podved = '';
  }

  type.records.restoreRecord(rec);
  markRestored(entry.id, session.state.person, today || todayIso());

  // Дочерние записи документов возвращаются вместе с объектом: они уже внутри
  // снимка, и держать их «живыми» в архиве было бы неправдой.
  let docs = 0;
  if (entry.batchId) {
    pendingBatch(entry.batchId).forEach((child) => {
      if (child.id === entry.id) return;
      markRestored(child.id, session.state.person, today || todayIso());
      docs++;
    });
  }

  return {
    rec,
    oiCount: (rec.oi || []).length,
    docs,
    lostInstitution,
    eniIndex: rec.eniIndex || 1,
  };
}

// Живо ли учреждение с таким названием.
//
// Архив НЕ импортирует дерево учреждений намеренно: на этапе 4 ТЗ учреждения
// сами зовут архив (каскад), и взаимный импорт дал бы цикл на уровне модулей —
// с непредсказуемым порядком инициализации. Поэтому проверку ставит снаружи
// boot.js; пока не поставлена, считаем учреждение живым (это верно для всех
// сценариев, кроме возврата объекта после каскада).
let institutionProbe = null;

export function setInstitutionProbe(fn) {
  institutionProbe = typeof fn === 'function' ? fn : null;
}

function institutionAlive(name) {
  if (!institutionProbe) return true;
  return institutionProbe(name);
}

// --- литера / объект имущества --------------------------------------------

// Убрать литеру (помещение, участок) в архив (ТЗ §4.3). Снимок уносит её
// содержимое целиком; фотографии, которые логика модуля переносит на объект,
// помечаются в снимке — возврат забирает их обратно.
export function archiveOi({ typeId, typeLabel, rec, oi, movedPhotos, today }) {
  const list = rec && rec.oi;
  if (!list) return null;

  const i = list.findIndex((o) => o.id === oi.id);
  if (i < 0) return null;

  const [taken] = list.splice(i, 1);
  const day = today || todayIso();

  const [entry] = addEntries({
    kind: 'oi',
    title: docScopeLabel(rec, taken),
    subtitle: rec.address || rec.title || '',
    archivedAt: day,
    archivedBy: session.state.person,
    from: {
      place: 'oi',
      typeId,
      typeLabel,
      ocId: rec.id,
      ocTitle: rec.address || rec.title || rec.id,
      eni: rec.eni || '',
      institution: rec.institution || '',
      podved: rec.podved || '',
      oiId: taken.id,
      scopeLabel: docScopeLabel(rec, taken),
      staff: staffOfRecord(rec, taken),
    },
    payload: { oi: taken, movedPhotos: movedPhotos || null },
  });

  return entry;
}

// Вернуть литеру в её объект. Если объект в архиве — возврат невозможен:
// сначала нужно поднять объект (ТЗ §4.3), и об этом говорит экран.
export function restoreOiEntry(entryId, today) {
  const entry = entryById(entryId);
  if (!entry || entry.restoredAt || entry.kind !== 'oi') return null;

  const rec = findRecordOf(entry);
  if (!rec) return { blocked: 'oc' };

  rec.oi = rec.oi || [];
  if (rec.oi.some((o) => o.id === entry.payload.oi.id)) {
    markRestored(entry.id, session.state.person, today || todayIso());
    return { alreadyThere: true };
  }

  rec.oi.push(entry.payload.oi);
  markRestored(entry.id, session.state.person, today || todayIso());

  return { oi: entry.payload.oi, restoredTo: entry.from.ocTitle };
}

// Склонение при числе — то же правило, что в остальных разделах.
function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

// Состав сотрудников блока-источника — по нему считается право возврата (§6.2
// ТЗ). Снимаем на момент архивирования: состав объекта мог поменяться, а
// отвечал за документ тот, кто был назначен тогда... и одновременно проверяем
// живой состав (см. canRestore) — человек, назначенный позже, тоже отвечает за
// объект и должен уметь вернуть.
function staffOfRecord(rec, oi) {
  const resp = Object.assign({}, (oi && oi.resp) || {}, {});
  const base = (rec && rec.resp) || {};
  const out = {};
  ['gov', 'cod', 'appr', 'insp'].forEach((key) => {
    out[key] = resp[key] || base[key] || '';
  });
  return out;
}

// --- вернуть из архива ----------------------------------------------------

// Сегодняшняя дата — тем же форматом, что у записей (ГГГГ-ММ-ДД).
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: время возврата ставит сервер, а не браузер.
const todayIso = () => new Date().toISOString().slice(0, 10);

// Вернуть документ туда, откуда он был убран. Если литеры больше нет (её могли
// удалить, пока документ лежал в архиве), возвращаем в документы самого ОЦ —
// иначе документ было бы некуда положить и он застрял бы в архиве навсегда.
//
// Первый аргумент — либо запись ОЦ (как было раньше), либо ничего: запись
// находится по архивной записи.
export function restoreDoc(recOrNull, entryId, today) {
  const entry = entryById(entryId) || findByDocId(recOrNull, entryId);
  if (!entry || entry.restoredAt) return null;

  const rec = recOrNull && recOrNull.id === entry.from.ocId ? recOrNull : findRecordOf(entry);
  if (!rec) return null;

  const oi = entry.from.oiId ? (rec.oi || []).find((o) => o.id === entry.from.oiId) : null;
  const holder = oi || rec;
  holder.docs = holder.docs || [];

  const doc = entry.payload.doc;
  holder.docs.push(doc);
  markRestored(entry.id, session.state.person, today || todayIso());

  return {
    doc,
    restoredTo: oi ? entry.from.scopeLabel : 'Объект оценки',
    movedToOc: !!(entry.from.oiId && !oi),
  };
}

// Совместимость: раньше экран передавал id самого документа, а не архивной
// записи. Ищем по документу, если по id записи не нашлось.
function findByDocId(rec, docId) {
  return allEntries().find((e) => e.kind === 'document' && !e.restoredAt
    && e.payload && e.payload.doc && e.payload.doc.id === docId
    && (!rec || e.from.ocId === rec.id)) || null;
}

// Общий вход возврата: экран не должен знать, какой именно вид записи он
// возвращает — иначе каждая новая разновидность требовала бы правки экрана.
export function restoreEntry(entryId, today) {
  const entry = entryById(entryId);
  if (!entry || entry.restoredAt) return null;

  if (entry.kind === 'document') {
    const place = entry.from.place;
    if (place === 'docs' || place === 'institution') return restoreRegistryDoc(entry.id, today);
    return restoreDoc(null, entry.id, today);
  }

  if (entry.kind === 'oc') return restoreRecordEntry(entry.id, today);
  if (entry.kind === 'oi') return restoreOiEntry(entry.id, today);

  // institution, dict — этапы 4–5 ТЗ.
  return null;
}

// --- права ----------------------------------------------------------------

// Кто вправе вернуть запись (§6.2 ТЗ, уточнение пользователя 03.09.2026):
// администратор — всегда; сотрудник — если он закреплён в том блоке, откуда
// запись убрали. Блок может быть объектом оценки, литерой или учреждением:
// проверяется состав сотрудников источника, а не учреждение записи.
export function canRestore(entry) {
  if (!entry) return false;
  if (seesEverything()) return true;

  // Справочники — структура системы, состава сотрудников у них нет.
  if (entry.kind === 'dict') return false;

  const me = session.state.person;
  if (!me) return false;

  // Живой состав блока сильнее снимка: человека могли назначить и после того,
  // как документ убрали, — за объект отвечает он.
  const rec = findRecordOf(entry);
  const oi = rec && entry.from.oiId ? (rec.oi || []).find((o) => o.id === entry.from.oiId) : null;
  const live = rec ? staffOfRecord(rec, oi) : {};
  const snapshot = entry.from.staff || {};

  const inStaff = ['gov', 'cod', 'appr', 'insp']
    .some((key) => live[key] === me || snapshot[key] === me);
  if (inStaff) return true;

  // Закреплён за учреждением источника — тоже свой блок.
  return myInstitutions().includes(entry.from.institution);
}

// --- чтение архива по всем модулям ----------------------------------------

function matchText(entry, q) {
  if (!q) return true;
  const from = entry.from || {};
  const hay = [
    entry.title, entry.subtitle, (entry.payload && entry.payload.doc && entry.payload.doc.type),
    from.ocTitle, from.eni, from.institution, from.scopeLabel, entry.archivedBy,
  ].filter(Boolean).join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

// Видимость записи: администратор видит всё, остальные — по своим учреждениям
// (то же правило, по которому открывается лог действий).
export function canSee(entry) {
  if (seesEverything()) return true;
  if (entry.kind === 'dict') return false;
  const mine = myInstitutions();
  return mine.length > 0 && mine.includes((entry.from || {}).institution);
}

const docTypeOf = (entry) => (entry.payload && entry.payload.doc && entry.payload.doc.type) || '';

// filter: { q, typeId, docType, institution, kind, from, to, showRestored }
export function queryArchive(filter = {}, seeFn) {
  migrateAll();
  const visible = seeFn ? (e) => seeFn((e.from || {}).institution) : canSee;

  const out = allEntries().filter((entry) => {
    if (!visible(entry)) return false;
    if (!filter.showRestored && entry.restoredAt) return false;
    if (filter.kind && filter.kind.length && !filter.kind.includes(entry.kind)) return false;
    if (filter.typeId && filter.typeId.length
        && !filter.typeId.includes((entry.from || {}).typeId)) return false;
    if (filter.docType && filter.docType.length
        && !filter.docType.includes(docTypeOf(entry))) return false;
    if (filter.institution && filter.institution.length
        && !filter.institution.includes((entry.from || {}).institution)) return false;
    if (filter.from && String(entry.archivedAt) < filter.from) return false;
    if (filter.to && String(entry.archivedAt) > filter.to) return false;
    if (!matchText(entry, filter.q)) return false;
    return true;
  });

  // Свежие сверху: в архив заходят чаще всего за тем, что убрали только что.
  out.sort((a, b) => String(b.archivedAt).localeCompare(String(a.archivedAt)));
  return out;
}

// Значения для фильтров — считаются по тому же набору, что и сам список,
// чтобы в списке фильтра не было вариантов, которых не встретить.
export function archiveFacets(seeFn) {
  migrateAll();
  const visible = seeFn ? (e) => seeFn((e.from || {}).institution) : canSee;

  const docType = {};
  const institution = {};
  const typeId = {};
  const kind = {};
  let total = 0;

  allEntries().forEach((entry) => {
    if (!visible(entry) || entry.restoredAt) return;
    total++;
    const t = docTypeOf(entry);
    if (t) docType[t] = (docType[t] || 0) + 1;
    const inst = (entry.from || {}).institution || '—';
    institution[inst] = (institution[inst] || 0) + 1;
    const tid = (entry.from || {}).typeId;
    if (tid) typeId[tid] = (typeId[tid] || 0) + 1;
    kind[entry.kind] = (kind[entry.kind] || 0) + 1;
  });

  return { docType, institution, typeId, kind, total };
}

// Найти запись ОЦ по архивной записи — для возврата и перехода.
export function findRecordOf(entry) {
  const from = entry && entry.from;
  if (!from) return null;
  const type = sortedTypes().find((t) => t.manifest.id === from.typeId);
  if (!type || !type.records.allRecords) return null;
  return type.records.allRecords().find((r) => r.id === from.ocId) || null;
}

// Сколько записей в архиве доступно этому сотруднику — для счётчика в меню.
export function archiveCount() {
  migrateAll();
  return allEntries().filter((e) => !e.restoredAt && canSee(e)).length;
}
