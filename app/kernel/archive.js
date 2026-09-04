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

export { entryById, subscribe, batchOf } from './archiveStore.js';

// --- лог действий (ТЗ §9) ---------------------------------------------------
//
// Каждый модуль ведёт СВОЙ лог на записи (modules/*/audit/model.js) — ядро не
// умеет его писать напрямую (не знает форму записи ни одного типа ОЦ) и не
// импортирует его статически: audit/model.js тянет data/store.js за
// nextEniScoped, а там — синтетика (seed.js). Статический импорт заставил бы
// грузить синтетику всех пяти модулей при каждом старте приложения — ровно то,
// от чего уже избавились ленивой загрузкой кода карточки (registry.js:
// `load`). Поэтому `type.loadAudit()` — тоже лениво, а функции архива,
// которые пишут в лог, стали async.
export async function auditFor(typeId) {
  const type = sortedTypes().find((t) => t.manifest.id === typeId);
  if (!type || !type.loadAudit) return null;
  try {
    return await type.loadAudit();
  } catch (e) {
    console.warn('Не удалось загрузить лог действий модуля', typeId, e);
    return null;
  }
}

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
export async function archiveDoc({ rec, oi, docId, typeId, typeLabel, today }) {
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

  const audit = await auditFor(typeId);
  if (audit && audit.pushDocArchiveLog) audit.pushDocArchiveLog(rec, doc);

  return entry;
}

// Убрать документ РЕЕСТРА в архив: из реестра «Документы» или из документов
// учреждения. Отличие от archiveDoc: там документ лежал в карточке объекта, а
// здесь — в общем реестре, и место возврата у него другое.
//
// Открепление и архивирование — разные вещи (ТЗ §4.1): открепить документ от
// учреждения значит снять связь, документ остаётся в реестре. В архив уезжает
// только то, что человек удаляет.
// Собрать архивную запись документа реестра БЕЗ записи в хранилище — нужно и
// одиночному архивированию (archiveRegistryDoc ниже), и каскаду учреждения
// (kernel/institutions.js), который кладёт документы узлов в ОДИН общий пакет
// вместе с самими узлами и их объектами, а не отдельными addEntries на каждый.
export function buildRegistryDocEntry({ doc, place = 'docs', node = null, today, who }) {
  const file = (doc.files || [])[0];
  return {
    kind: 'document',
    title: `${doc.type || 'Документ'}${file ? ' · ' + file.name : ''}`,
    subtitle: place === 'institution' ? (node ? node.name : 'Учреждение') : 'Реестр документов',
    archivedAt: today || todayIso(),
    archivedBy: who || session.state.person,
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
  };
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

  const [entry] = addEntries(buildRegistryDocEntry({ doc, place, node, today }));
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

// Собрать [корень-oc, ...дочерние-document] БЕЗ записи в хранилище — нужно и
// одиночному архивированию объекта (archiveRecord ниже), и каскаду учреждения
// (kernel/institutions.js), который кладёт объекты всех узлов поддерева в ОДИН
// общий пакет вместе с самими узлами, а не отдельным addEntries на каждый.
// `taken` — запись, уже изъятая из модуля (type.records.takeRecord).
export async function buildOcEntries({ typeId, typeLabel, taken, today, who }) {
  const type = sortedTypes().find((t) => t.manifest.id === typeId);
  const day = today || todayIso();
  const author = who || session.state.person;
  const oiList = taken.oi || [];

  // Скрытый индекс кода: у второй записи с тем же кодом он равен 2 и т. д.
  // Человеку не показывается (§6.3) — нужен только чтобы записи различались.
  if (!taken.eniIndex) taken.eniIndex = 1;

  const base = {
    typeId,
    typeLabel: typeLabel || (type ? type.manifest.label : typeId),
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
    archivedBy: author,
    from: { place: 'oc', ...base, scopeLabel: 'Объект оценки' },
    payload: { rec: taken, eniIndex: taken.eniIndex },
  };

  // Документы карточки и литер — дочерними записями, ИЗЫМАЮТСЯ из снимка (были
  // «БЕЗ изъятия» до уточнения пользователя 04.09.2026: возврат ОДНОГО
  // документа не должен молча возвращать вместе с ним и все остальные
  // документы объекта — значит документ не может просто «лежать внутри»
  // снимка, а обязан быть самостоятельной единицей возврата. payload.rec
  // (= taken, та же ссылка) после этого хранит объект БЕЗ документов; сами
  // документы живут только в payload.doc дочерних записей, а обратно в
  // rec.docs/oi.docs их кладёт восстановление (restoreRecordEntry ниже) —
  // по умолчанию все ещё-не-возвращённые сразу, а если запись понадобилась
  // только как площадка под ОДИН конкретный документ (ensureOcLive) — ни
  // одного лишнего.
  const docs = [];
  (taken.docs || []).forEach((doc) => docs.push({ doc, oi: null }));
  taken.docs = [];
  oiList.forEach((oi) => {
    (oi.docs || []).forEach((doc) => docs.push({ doc, oi }));
    oi.docs = [];
  });

  const children = docs.map(({ doc, oi }) => ({
    kind: 'document',
    title: doc.name || doc.type || 'Документ',
    subtitle: docScopeLabel(taken, oi),
    archivedAt: day,
    archivedBy: author,
    from: {
      place: oi ? 'oi' : 'oc',
      ...base,
      oiId: oi ? oi.id : null,
      scopeLabel: docScopeLabel(taken, oi),
      insideOc: true,          // документ приехал вместе с объектом
    },
    payload: { doc },
  }));

  // Один на объект — «Объект оценки убран в архив (N документов, M литер)»
  // (ТЗ §9), в лог самого объекта. Пишем на taken, а не на копию: снимок в
  // payload.rec — та же ссылка, и запись лога уезжает в архив вместе с
  // остальным, а после возврата видна как обычная история объекта. Каскад
  // учреждения (kernel/institutions.js) зовёт этот же buildOcEntries на каждый
  // затронутый объект — тем самым и он получает свою строку в логе, без
  // отдельного «общего лога учреждения» (то же самое просит ТЗ: «в логи всех
  // затронутых объектов», а не в новый журнал).
  const audit = await auditFor(typeId);
  if (audit && audit.pushRecordArchiveLog) {
    audit.pushRecordArchiveLog(taken, { oiCount: oiList.length, docsCount: docs.length });
  }

  return [root, ...children];
}

// Убрать объект оценки в архив вместе со всем содержимым (ТЗ §4.2) — одиночный
// случай: изымает запись сама и кладёт buildOcEntries отдельным пакетом.
export async function archiveRecord({ typeId, typeLabel, rec, today }) {
  const type = sortedTypes().find((t) => t.manifest.id === typeId);
  if (!type || !type.records.takeRecord) return null;

  const taken = type.records.takeRecord(rec.id);
  if (!taken) return null;

  const entries = addEntries(await buildOcEntries({ typeId, typeLabel, taken, today }));
  return entries[0];
}

// Положить документ обратно туда, откуда он был изъят при архивировании
// объекта (buildOcEntries) — общий кусок для восстановления вместе с
// объектом (см. ниже) и для одиночного восстановления самого документа
// (restoreDoc).
function attachDocToHolder(rec, childEntry) {
  const oi = childEntry.from.oiId ? (rec.oi || []).find((o) => o.id === childEntry.from.oiId) : null;
  const holder = oi || rec;
  holder.docs = holder.docs || [];
  holder.docs.push(childEntry.payload.doc);
  return oi;
}

// Вернуть объект оценки. Совпадение кода ЕНИ возврату не мешает: запись
// получает свободный скрытый индекс (§6.3). При ENI_UNIQUE = true возврат
// запрещён, если код уже занят живой записью.
//
// opts.skipDocs — не возвращать вместе с объектом ОСТАЛЬНЫЕ его документы
// (только сам объект, пустым по документам). Нужен ensureOcLive ниже: если
// объект понадобился только как площадка под ОДИН конкретный документ
// (пользователь восстанавливает документ, чей объект ещё в архиве), нельзя
// молча возвращать заодно и все остальные документы того же объекта —
// решение пользователя 04.09.2026. При обычном (не через ensureOcLive)
// восстановлении объекта — например, кликом по самой записи в архиве, или
// как часть возврата целой ветки учреждения — skipDocs не передаётся, и
// все ещё-не-возвращённые документы объекта возвращаются вместе с ним, как
// и раньше.
export async function restoreRecordEntry(entryId, today, opts = {}) {
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

  // Учреждение (или подведка) могло уехать в архив вместе с объектом (или
  // отдельно) — по решению пользователя 04.09.2026 объект поднимает ветку
  // учреждения следом за собой, а не остаётся нераспределённым. Смотрим
  // сначала на подведку (она конкретнее): если её нет в архиве, но нет и в
  // живом дереве, восстановление её цепочки поднимет и главное учреждение
  // над ней — оно окажется архивным предком того же узла. Если подведка жива
  // или не указана вовсе — проверяем главное учреждение отдельно.
  // Нераспределённым объект становится, только если для найденного имени не
  // нашлось архивной записи вовсе — такое бывает, если запись переименовали
  // или удалили насовсем на сервере (в макете такого не происходит, но
  // защититься дёшево).
  const missingName = (rec.podved && !institutionAlive(rec.podved)) ? rec.podved
    : (rec.institution && !institutionAlive(rec.institution)) ? rec.institution
      : null;
  let lostInstitution = !!missingName;
  if (lostInstitution && institutionBranchRestorer) {
    const restoredNode = institutionBranchRestorer(missingName, today || todayIso());
    if (restoredNode) lostInstitution = false;
  }
  if (lostInstitution) {
    rec.institution = '';
    rec.podved = '';
  }

  type.records.restoreRecord(rec);
  markRestored(entry.id, session.state.person, today || todayIso());

  const audit = await auditFor(entry.from.typeId);
  if (audit && audit.pushRecordRestoreLog) audit.pushRecordRestoreLog(rec);

  // Дочерние записи ДОКУМЕНТОВ ЭТОГО объекта — если не skipDocs (см. выше),
  // возвращаются вместе с ним: buildOcEntries изымает документы из снимка при
  // архивировании, и без этого шага объект восстановился бы вовсе без них.
  //
  // Отбор — строго по from.ocId === rec.id, а НЕ «весь пакет» (было багом,
  // найденным пользователем 04.09.2026): у объекта, убранного каскадом
  // учреждения (kernel/institutions.js: archiveNodeCascade), batchId ОДИН на
  // ВСЮ ветку — узлы учреждения, все объекты поддерева и их документы разом
  // (addEntries зовётся один раз на весь список). Отбор по from.ocId отличает
  // «мои документы» от документов/объектов/узлов, которые просто оказались в
  // одном пакете по совпадению происхождения.
  let docs = 0;
  if (entry.batchId && !opts.skipDocs) {
    pendingBatch(entry.batchId).forEach((child) => {
      if (child.id === entry.id) return;
      if (child.kind !== 'document' || !child.from || child.from.ocId !== rec.id) return;
      attachDocToHolder(rec, child);
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

// Возврат учреждения (каскад, ТЗ §4.4) — та же причина держать это снаружи:
// дерево учреждений само зовёт архив при удалении, и обратный импорт замкнул
// бы цикл. boot.js регистрирует настоящую функцию через setInstitutionRestorer;
// пока не зарегистрирована, возврат недоступен (только на время инициализации).
let institutionRestorer = null;

export function setInstitutionRestorer(fn) {
  institutionRestorer = typeof fn === 'function' ? fn : null;
}

// Тот же приём для справочников (ТЗ §4.5) — раздел «Справочники» тоже не
// импортируется архивом напрямую.
let dictRestorer = null;

export function setDictRestorer(fn) {
  dictRestorer = typeof fn === 'function' ? fn : null;
}

// Восстановление ветки учреждения по названию — вызывается из
// restoreRecordEntry ниже, когда учреждение объекта ещё в архиве. Решение
// пользователя 04.09.2026: объект не должен становиться «нераспределённым» —
// вместе с ним поднимается и сама ветка учреждения (только цепочка узлов до
// первого живого предка, без остальных объектов и документов, которые могли
// уехать в архив тем же каскадом — тех восстанавливать никто не просил).
let institutionBranchRestorer = null;

export function setInstitutionBranchRestorer(fn) {
  institutionBranchRestorer = typeof fn === 'function' ? fn : null;
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
export async function restoreOiEntry(entryId, today) {
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

  const audit = await auditFor(entry.from.typeId);
  if (audit && audit.pushOiRestoreLog) audit.pushOiRestoreLog(rec, entry.payload.oi);

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

// Объект оценки, к которому привязана запись document/oi — если он ещё в
// архиве, поднимает его сам (решение пользователя 04.09.2026: возврат
// документа поднимает ОЦ, а тот — свою ветку учреждения, а не отказывает со
// словами «сначала верните объект»). skipDocs:true — объект поднимается
// ПУСТЫМ по документам: остальные документы, которые были у него на момент
// архивирования, остаются в архиве, а не возвращаются молча заодно с этим
// одним (тоже решение пользователя 04.09.2026 — возврат документа не должен
// без спроса возвращать и все остальные документы того же объекта; сам
// документ, ради которого всё это вызвано, прикладывает уже вызвавший код).
// Возвращает живую запись или null, если объекта нет ни живого, ни архивного
// вовсе (устаревшая/битая ссылка).
async function ensureOcLive(entry, today) {
  const rec = findRecordOf(entry);
  if (rec) return rec;
  if (!entry.from.ocId) return null;

  const ocEntry = allEntries().find((e) => e.kind === 'oc' && !e.restoredAt
    && e.from.typeId === entry.from.typeId && e.from.ocId === entry.from.ocId);
  if (!ocEntry) return null;

  const res = await restoreRecordEntry(ocEntry.id, today, { skipDocs: true });
  return res && !res.blocked ? res.rec : null;
}

// Вернуть документ туда, откуда он был убран. Если литеры больше нет (её могли
// удалить, пока документ лежал в архиве), возвращаем в документы самого ОЦ —
// иначе документ было бы некуда положить и он застрял бы в архиве навсегда.
//
// Первый аргумент — либо запись ОЦ (как было раньше), либо ничего: запись
// находится по архивной записи.
export async function restoreDoc(recOrNull, entryId, today) {
  const entry = entryById(entryId) || findByDocId(recOrNull, entryId);
  if (!entry || entry.restoredAt) return null;

  const rec = (recOrNull && recOrNull.id === entry.from.ocId ? recOrNull : null)
    || await ensureOcLive(entry, today || todayIso());
  if (!rec) return null;

  const oi = attachDocToHolder(rec, entry);
  const doc = entry.payload.doc;
  markRestored(entry.id, session.state.person, today || todayIso());

  const audit = await auditFor(entry.from.typeId);
  if (audit && audit.pushDocRestoreLog) audit.pushDocRestoreLog(rec, doc);

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
export async function restoreEntry(entryId, today) {
  const entry = entryById(entryId);
  if (!entry || entry.restoredAt) return null;

  if (entry.kind === 'document') {
    const place = entry.from.place;
    if (place === 'docs' || place === 'institution') return restoreRegistryDoc(entry.id, today);
    return restoreDoc(null, entry.id, today);
  }

  if (entry.kind === 'oc') return restoreRecordEntry(entry.id, today);
  if (entry.kind === 'oi') return restoreOiEntry(entry.id, today);
  if (entry.kind === 'institution') return institutionRestorer ? institutionRestorer(entry, today || todayIso()) : null;
  if (entry.kind === 'dict') return dictRestorer ? dictRestorer(entry, today || todayIso()) : null;

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

  // Учреждение (каскад, §4.4): дерева уже нет, поэтому состав берётся из
  // снимка узла (staffOf с уже разрешённым наследованием на момент удаления),
  // а не из живой записи, — узла для «живого» состава попросту не осталось.
  if (entry.kind === 'institution') {
    const staff = (entry.payload && entry.payload.staff) || {};
    if (['gov', 'cod', 'appr', 'insp'].some((key) => staff[key] === me)) return true;
    return myInstitutions().includes(entry.from.institution);
  }

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
  const doc = entry.payload && entry.payload.doc;
  const fileNames = doc ? (doc.files || (doc.file ? [doc.file] : [])).map((f) => f.name) : [];
  const hay = [
    entry.title, entry.subtitle, doc && doc.type,
    from.ocTitle, from.eni, from.institution, from.scopeLabel, entry.archivedBy,
    ...fileNames,
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

export const docTypeOf = (entry) => (entry.payload && entry.payload.doc && entry.payload.doc.type) || '';

// Сырой видимый список — без фильтров и без сортировки. Нужен экрану архива
// для самоисключающихся счётчиков фасетов (ТЗ §7.3): считать, что останется
// при снятии ОДНОГО конкретного фильтра, можно только имея под рукой все
// видимые записи и применяя к ним остальные условия самостоятельно —
// queryArchive() и archiveFacets() всегда фильтруют по ВСЕМ условиям сразу.
export function visibleEntries(seeFn) {
  migrateAll();
  const visible = seeFn ? (e) => seeFn((e.from || {}).institution) : canSee;
  return allEntries().filter(visible);
}

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
