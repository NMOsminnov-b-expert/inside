// Дерево учреждений — общесистемная сущность (раздел «Учреждения»).
//
// Учреждение вкладывается в учреждение на ЛЮБУЮ глубину (уточнение пользователя
// 03.09.2026: «у учреждения может быть подвед, у подведа свой подвед и т.д.»),
// поэтому это именно дерево с родителем, а не пара полей «учреждение +
// подведомственная организация».
//
// Откуда берутся узлы. В записях объектов оценки уже есть строки institution и
// podved — по ним реестр фильтрует и группирует. Поэтому дерево собирается из
// двух источников сразу:
//   * заведённые здесь узлы (их можно создавать, править, удалять и переносить);
//   * названия, встречающиеся в записях: если такого узла ещё нет, он появляется
//     сам — иначе объекты оказались бы «ничьими», а список учреждений врал бы.
// Автоматические узлы помечены auto: их нельзя удалить, пока за ними числятся
// объекты, зато можно переименовать или перенести — тогда они становятся
// обычными.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: здесь дерево живёт в памяти вкладки, а связь с объектом
// оценки — по названиям (institution/podved), потому что так устроен реестр. На
// сервере у учреждения будет идентификатор, а у объекта — ссылка на него; тогда
// переименование перестанет затрагивать записи, а перенос ветки — пересчитывать
// названия. Заодно появятся реквизиты учреждения (адрес, руководитель, коды) и
// права: кто какие ветки видит и правит.
import { facetsAll, queryAll, mutate } from '../pages/ocMenu/query.js';
import { emptyFilter } from '../pages/ocMenu/state.js';
import { queryDocuments, documentInstitutions, takeDocument, restoreDocument, getDocument } from './documentsRegistry.js';
import { eniRegion } from './fmt.js';
import { seesEverything, session } from './session.js';
import { sortedTypes } from './registry.js';
import { buildOcEntries, buildRegistryDocEntry, auditFor } from './archive.js';
import { addEntries, markRestored, pendingBatch, batchOf } from './archiveStore.js';

const todayIso = () => new Date().toISOString().slice(0, 10);

let seq = 0;
const nextId = () => 'inst-' + (++seq);

// Корни. Названия — не выдумка про устройство государства, а две очевидные
// корзины: то, что уже встречается в данных, надо куда-то класть, а искать
// учреждение удобнее в короткой ветке, чем в списке из полусотни корней.
const ROOT_GOV = { id: nextId(), name: 'Государство', parentId: null, note: 'Республиканские органы и их подведомственные организации' };
const ROOT_LOCAL = { id: nextId(), name: 'Местное самоуправление', parentId: null, note: 'Мэрии и муниципальные организации' };

const nodes = [ROOT_GOV, ROOT_LOCAL];

// Кого считаем муниципальным: по названию. Правило слабое, но оно работает
// только при первом появлении узла — дальше человек может перенести его сам.
function rootFor(name) {
  return /мэри|муниципал|айыл|город/i.test(name) ? ROOT_LOCAL.id : ROOT_GOV.id;
}

function byName(name, parentId) {
  return nodes.find((n) => n.name === name && (parentId === undefined || n.parentId === parentId));
}

// --- сбор названий из записей ---------------------------------------------
//
// Фасеты дают учреждения, но не подведомственные, поэтому за парами
// «учреждение → подвед» идём в сами записи. Выборка ограничена: раздел
// показывает дерево, а не реестр, и обходить 20 000 строк ради него незачем —
// подведомственные, которых не видно в этой выборке, появятся, когда объект
// откроют или отфильтруют по учреждению.
const SCAN_LIMIT = 2000;

function scanFromRecords() {
  const pairs = [];
  const seen = new Set();
  const { rows } = queryAll({ filter: emptyFilter(), sort: { key: 'updatedAt', dir: 'desc' }, offset: 0, limit: SCAN_LIMIT });

  rows.forEach((r) => {
    if (!r.institution) return;
    const key = r.institution + '|' + (r.podved || '');
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ institution: r.institution, podved: r.podved || '' });
  });

  return pairs;
}

// Достроить дерево названиями из данных. Зовётся при каждом чтении дерева:
// объекты создаются и переназначаются на ходу, и список учреждений должен это
// видеть без перезагрузки страницы.
function syncFromData() {
  const facets = facetsAll(emptyFilter()).institution;

  Object.keys(facets).forEach((name) => {
    if (!byName(name)) {
      nodes.push({ id: nextId(), name, parentId: rootFor(name), auto: true });
    }
  });

  documentInstitutions().forEach((name) => {
    if (!byName(name)) {
      nodes.push({ id: nextId(), name, parentId: rootFor(name), auto: true });
    }
  });

  scanFromRecords().forEach(({ institution, podved }) => {
    let parent = byName(institution);
    if (!parent) {
      parent = { id: nextId(), name: institution, parentId: rootFor(institution), auto: true };
      nodes.push(parent);
    }
    if (podved && !byName(podved)) {
      nodes.push({ id: nextId(), name: podved, parentId: parent.id, auto: true });
    }
  });
}

// --- чтение ----------------------------------------------------------------

export function allNodes() {
  syncFromData();
  return nodes.slice();
}

export function getNode(id) {
  return nodes.find((n) => n.id === id) || null;
}

export function childrenOf(id) {
  return nodes.filter((n) => n.parentId === id)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

// Путь от корня до узла включительно — для крошек и подписи «Уровень N».
export function pathOf(id) {
  const out = [];
  let cur = getNode(id);
  while (cur) {
    out.unshift(cur);
    cur = cur.parentId ? getNode(cur.parentId) : null;
  }
  return out;
}

export function levelOf(id) {
  return Math.max(0, pathOf(id).length - 1);
}

export function isDescendant(id, maybeAncestorId) {
  return pathOf(id).slice(0, -1).some((n) => n.id === maybeAncestorId);
}

// Всё поддерево, включая сам узел: по нему считаются «с подведомственными».
export function subtreeOf(id) {
  const out = [];
  const walk = (nodeId) => {
    out.push(getNode(nodeId));
    childrenOf(nodeId).forEach((c) => walk(c.id));
  };
  walk(id);
  return out.filter(Boolean);
}

// --- счётчики --------------------------------------------------------------
//
// Объект относится к узлу, если его institution — это имя узла (и подвед пуст)
// либо podved — имя узла. Так связь с записями остаётся ровно той, по которой
// работает реестр.
function ocFilterFor(node) {
  const f = emptyFilter();
  const parent = node.parentId ? getNode(node.parentId) : null;
  const isRoot = !node.parentId;

  if (isRoot) {
    // У корня своих объектов нет — только у веток под ним.
    f.institution = [];
    return null;
  }

  // Узел второго уровня — учреждение; глубже — подведомственная организация.
  if (parent && !parent.parentId) {
    f.institution = [node.name];
    return f;
  }

  const top = pathOf(node.id)[1];
  f.institution = top ? [top.name] : [];
  return { filter: f, podved: node.name };
}

// Свои объекты узла — ровно те, что показывает его таблица: у учреждения это
// записи без подведомственной организации, у подведомственного — записи с его
// названием. Счёт и таблица идут по одной функции, иначе вкладка обещала бы
// объекты, которых в списке нет (так и было при первом заходе).

export function docCount(node) {
  if (!node.parentId) return 0;
  return queryDocuments({ institution: node.name, limit: 0 }).total;
}

// Счётчик с подведомственными — то число, что стоит у узла в дереве.
export function totalCount(node) {
  return subtreeOf(node.id).reduce((n, x) => n + ocCount(x), 0);
}

// --- объекты оценки узла ---------------------------------------------------

export function ocRowsOf(node, { q = '', limit = 200 } = {}) {
  const spec = ocFilterFor(node);
  if (!spec) return [];

  const filter = spec.podved ? spec.filter : { ...emptyFilter(), institution: [node.name] };
  const { rows } = queryAll({
    filter, sort: { key: 'updatedAt', dir: 'desc' }, offset: 0, limit,
  });

  const own = spec.podved
    ? rows.filter((r) => (r.podved || '') === spec.podved)
    : rows.filter((r) => !r.podved || r.podved === node.name);

  if (!q) return own;
  const needle = q.toLowerCase();
  // Адрес в сводке записи лежит в title (records.js, summarize).
  return own.filter((r) => [r.eni, r.title, r.city, r.status, r.typeLabel]
    .filter(Boolean).join(' ').toLowerCase().includes(needle));
}

export function ocCount(node) {
  return ocRowsOf(node).length;
}

// Объекты узла ВМЕСТЕ с подведомственными, на любую глубину. Нужны для
// сводной вкладки: по министерству смотрят все объекты сети сразу, а не
// перебирают подведы поодиночке.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: здесь поддерево обходится на клиенте и выборки по
// узлам складываются в памяти вкладки. На сервере это один запрос с условием
// «учреждение входит в поддерево N» — иначе у крупного министерства обход
// упрётся и в число запросов, и в объём ответа. Варианты: материализованный
// путь узла в записи (institutionPath), либо рекурсивный CTE по дереву.
export function subtreeRowsOf(node, { limit = 5000 } = {}) {
  const seen = new Set();
  const out = [];

  subtreeOf(node.id).forEach((n) => {
    ocRowsOf(n, { limit }).forEach((r) => {
      const key = r.typeId + '|' + r.id;
      if (seen.has(key)) return;
      seen.add(key);
      // Узел, за которым объект числится: по нему потом фильтруют и группируют.
      out.push({ ...r, nodeId: n.id, nodeName: n.name });
    });
  });

  return out;
}

export function docRowsOf(node, { q = '', limit = 200 } = {}) {
  if (!node.parentId) return [];
  return queryDocuments({ institution: node.name, q, limit }).rows;
}


// --- закреплённый сотрудник -----------------------------------------------
//
// Отвечающий за учреждение человек. Назначает администратор (и роль «любая» —
// у неё те же права, решение пользователя 02.09.2026): остальным поле видно,
// но не редактируется.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: здесь сотрудник — строка с именем, потому что своей
// сущности у людей в макете нет (раздел «Пользователи» помечен «скоро»). На
// сервере это ссылка на учётную запись, и тогда же появится история назначений
// и права «вижу только свои учреждения».

export function canAssignStaff() {
  return seesEverything();
}

// Состав сотрудников — тот же, что у объекта оценки (пользователь 03.09.2026):
// одни и те же люди ведут учреждение и его объекты, разводить два разных набора
// ролей было бы выдумкой.
export const STAFF_ROLES = [
  { key: 'gov', label: 'Ответственный от гос. учреждения' },
  { key: 'cod', label: 'Оператор ЦОД' },
  { key: 'appr', label: 'Оценщик' },
  { key: 'insp', label: 'Осмотрщик' },
];

// Список людей: те, кто уже назначен ответственным по объектам, плюс уже
// назначенные по учреждениям и текущий пользователь. Отдельного справочника
// сотрудников в макете нет — он появится вместе с разделом «Пользователи».
export function staffList() {
  const set = new Set();
  const { rows } = queryAll({
    filter: emptyFilter(), sort: { key: 'updatedAt', dir: 'desc' }, offset: 0, limit: SCAN_LIMIT,
  });

  rows.forEach((r) => {
    const resp = r.resp || {};
    STAFF_ROLES.forEach(({ key }) => { if (resp[key]) set.add(resp[key]); });
  });

  nodes.forEach((n) => {
    STAFF_ROLES.forEach(({ key }) => {
      const who = (n.staff || {})[key];
      if (who) set.add(who);
    });
  });

  if (session.state.person) set.add(session.state.person);
  return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
}

// Кто ведёт учреждение по каждой роли: своё назначение или унаследованное от
// родителя. Подведомственные обычно ведут те же люди, и повторять их у каждого
// узла незачем — но видно, где назначение сделано.
export function staffOf(node) {
  const path = pathOf(node.id);
  const out = {};

  STAFF_ROLES.forEach(({ key }) => {
    for (let i = path.length - 1; i >= 0; i--) {
      const who = (path[i].staff || {})[key];
      if (who) {
        out[key] = { name: who, from: path[i].id === node.id ? null : path[i] };
        return;
      }
    }
    out[key] = null;
  });

  return out;
}

// Сколько ролей закрыто — для подписи в шапке и в дереве.
export function staffFilled(node) {
  const staff = staffOf(node);
  return STAFF_ROLES.filter(({ key }) => staff[key]).length;
}

// --- правка дерева ---------------------------------------------------------

export function createNode(parentId, { name, note = '', region = '', staff = null }) {
  const clean = String(name || '').trim();
  if (!clean) return { ok: false, reason: 'Название не может быть пустым' };
  if (byName(clean, parentId)) return { ok: false, reason: 'В этом узле уже есть учреждение с таким названием' };

  const node = {
    id: nextId(), name: clean, parentId: parentId || null, note, region,
    staff: staff ? { ...staff } : {},
  };
  nodes.push(node);
  return { ok: true, node };
}

export function updateNode(id, patch) {
  const node = getNode(id);
  if (!node) return { ok: false, reason: 'Учреждение не найдено' };

  if (patch.name !== undefined) {
    const clean = String(patch.name).trim();
    if (!clean) return { ok: false, reason: 'Название не может быть пустым' };

    const twin = byName(clean, node.parentId);
    if (twin && twin.id !== id) return { ok: false, reason: 'В этом узле уже есть учреждение с таким названием' };

    // Переименование тянет за собой записи: в них лежит имя, а не ссылка.
    if (clean !== node.name) renameInRecords(node, clean);
    node.name = clean;
    delete node.auto;
  }

  if (patch.note !== undefined) node.note = patch.note;
  if (patch.region !== undefined) node.region = patch.region;
  // Сотрудников меняет только администратор — правило проверяется здесь, а не
  // только в разметке: прямой вызов из консоли тоже не должен его обходить.
  // Пустое значение роли — это «убрать назначение», поэтому не отбрасываем.
  if (patch.staff !== undefined && canAssignStaff()) {
    node.staff = node.staff || {};
    STAFF_ROLES.forEach(({ key }) => {
      if (patch.staff[key] !== undefined) node.staff[key] = patch.staff[key];
    });
  }

  return { ok: true, node };
}

// Перенос ветки. Внутрь себя переносить нельзя — дерево перестало бы им быть.
export function moveNode(id, newParentId) {
  const node = getNode(id);
  if (!node) return { ok: false, reason: 'Учреждение не найдено' };
  if (id === newParentId) return { ok: false, reason: 'Учреждение не может быть вложено в себя' };
  if (newParentId && isDescendant(newParentId, id)) {
    return { ok: false, reason: 'Нельзя перенести учреждение внутрь своей же ветки' };
  }
  if (byName(node.name, newParentId)) {
    return { ok: false, reason: 'В этом узле уже есть учреждение с таким названием' };
  }

  node.parentId = newParentId || null;
  delete node.auto;
  return { ok: true, node };
}

// --- удаление: каскад в архив (ТЗ §4.4, решение пользователя 03.09.2026) ---
//
// Прежний запрет «нельзя удалить учреждение с объектами» снят: одной операцией
// в архив уезжают сам узел, всё его поддерево на любую глубину, объекты оценки
// закреплённых узлов (пакетом kind:'oc') и документы — и этих объектов, и самих
// учреждений (kind:'document'). Возврат поднимает всю ветку целиком.
//
// Архив это дерево не импортирует (см. комментарий у institutionProbe в
// archive.js — обратный импорт замкнул бы цикл), поэтому сам каскад собран
// здесь, а не там: buildOcEntries/buildRegistryDocEntry — чистые сборщики
// записи без обращения к хранилищу, addEntries кладёт всё одним пакетом.

function resolvedStaff(node) {
  const s = staffOf(node);
  const out = {};
  STAFF_ROLES.forEach(({ key }) => { if (s[key]) out[key] = s[key].name; });
  return out;
}

function ocDocCount(rec) {
  const own = (rec.docs || []).length;
  const oi = (rec.oi || []).reduce((n, o) => n + (o.docs || []).length, 0);
  return own + oi;
}

// Точный состав для диалога подтверждения — тем же обходом, что и сам каскад,
// чтобы текст диалога не мог разойтись с тем, что происходит на самом деле.
export function institutionCascadePreview(nodeId) {
  const root = getNode(nodeId);
  if (!root || !root.parentId) return null;

  const subtree = subtreeOf(nodeId);
  let ocN = 0;
  let docN = 0;

  subtree.forEach((n) => {
    docN += docRowsOf(n, { limit: 5000 }).length;
    ocRowsOf(n, { limit: 5000 }).forEach((row) => {
      ocN++;
      const type = sortedTypes().find((t) => t.manifest.id === row.typeId);
      const rec = type && type.records.allRecords
        ? type.records.allRecords().find((r) => r.id === row.id) : null;
      if (rec) docN += ocDocCount(rec);
    });
  });

  return { root, podvedCount: subtree.length - 1, ocCount: ocN, docCount: docN };
}

// Сам каскад. Возвращает корневую архивную запись узла (batchRole:'root') —
// по ней потом идёт возврат всей ветки.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: здесь каскад — это цикл на клиенте (изъять объекты,
// изъять документы, убрать узлы из дерева), а не атомарная операция. Если
// вкладку закрыть или произойдёт ошибка на середине — часть уже уехала в
// архив, часть ещё нет, и восстановить согласованное состояние нечем. На
// сервере это должна быть транзакция: либо всё поддерево целиком уехало в
// архив, либо ничего (ТЗ §10).
export async function archiveNodeCascade(nodeId, { today } = {}) {
  const root = getNode(nodeId);
  if (!root || !root.parentId) return null;

  const subtree = subtreeOf(nodeId);
  const day = today || todayIso();
  const who = session.state.person;

  // Снимки узлов — со ЖИВЫМ деревом ещё на месте: staffOf/pathOf читают
  // родительскую цепочку, которая после splice ниже перестанет существовать.
  const nodeEntries = subtree.map((n) => ({
    kind: 'institution',
    title: n.name,
    subtitle: n.id === root.id ? '' : `Подведомственная · ${root.name}`,
    archivedAt: day,
    archivedBy: who,
    from: { place: 'institution', nodeId: n.id, institution: n.name, scopeLabel: 'Учреждение' },
    payload: {
      node: { id: n.id, name: n.name, note: n.note || '', region: n.region || '', staff: n.staff || {} },
      parentId: n.parentId,
      favorite: isFavorite(n.id),
      staff: resolvedStaff(n),
    },
  }));

  // buildOcEntries сама пишет «объект убран в архив» в лог каждого объекта
  // (kernel/archive.js) — тем самым каскад пишет в логи всех затронутых
  // объектов, как просит ТЗ §9, без отдельного «общего лога учреждения».
  const ocEntries = [];
  for (const n of subtree) {
    for (const row of ocRowsOf(n, { limit: 5000 })) {
      const type = sortedTypes().find((t) => t.manifest.id === row.typeId);
      if (!type || !type.records.takeRecord) continue;
      const taken = type.records.takeRecord(row.id);
      if (!taken) continue;
      ocEntries.push(...await buildOcEntries({ typeId: row.typeId, typeLabel: row.typeLabel, taken, today: day, who }));
    }
  }

  const docEntries = [];
  subtree.forEach((n) => {
    docRowsOf(n, { limit: 5000 }).forEach((doc) => {
      const taken = takeDocument(doc.id);
      if (!taken) return;
      docEntries.push(buildRegistryDocEntry({ doc: taken, place: 'institution', node: n, today: day, who }));
    });
  });

  // Дерево обновляем последним: снимки и выборки объектов/документов выше уже
  // не нуждаются в живой родительской цепочке.
  const ids = new Set(subtree.map((n) => n.id));
  for (let i = nodes.length - 1; i >= 0; i--) if (ids.has(nodes[i].id)) nodes.splice(i, 1);

  const created = addEntries([...nodeEntries, ...ocEntries, ...docEntries]);
  return created[0];
}

// Один узел из снимка — обратно в дерево. Если его прежнего родителя больше
// нет (тоже в архиве), поднимаемся по цепочке снимков пакета до ближайшего
// живого предка; нет такого — узел встаёт на верхний уровень (ТЗ §4.4).
function restoreSingleNode(entry, today) {
  const p = entry.payload;
  let parentId = p.parentId;

  if (parentId && !getNode(parentId)) {
    const siblings = entry.batchId ? batchOf(entry.batchId).filter((e) => e.kind === 'institution') : [];
    let pid = parentId;
    while (pid && !getNode(pid)) {
      const parentEntry = siblings.find((e) => e.payload.node.id === pid);
      pid = parentEntry ? parentEntry.payload.parentId : null;
    }
    parentId = pid || null;
  }

  if (!getNode(p.node.id)) {
    nodes.push({ id: p.node.id, name: p.node.name, note: p.node.note, region: p.node.region, staff: p.node.staff, parentId });
  }
  if (p.favorite) favorites.add(p.node.id);

  markRestored(entry.id, session.state.person, today);
  return getNode(p.node.id);
}

// Возврат ветки целиком (или одного узла отдельно от неё — ТЗ §5.4): вызывает
// kernel/archive.js через setInstitutionRestorer, чтобы обратный импорт не
// понадобился ни ему, ни этому файлу.
export async function restoreInstitutionEntry(entry, today) {
  if (!entry || entry.restoredAt || entry.kind !== 'institution') return null;

  // Не корень пакета — только этот узел, остальная ветка остаётся в архиве.
  if (entry.batchId && entry.batchRole !== 'root') {
    return { node: restoreSingleNode(entry, today), single: true };
  }

  const batch = entry.batchId ? pendingBatch(entry.batchId) : [entry];
  const nodeItems = batch.filter((e) => e.kind === 'institution');
  const ocItems = batch.filter((e) => e.kind === 'oc');
  const docItems = batch.filter((e) => e.kind === 'document');

  const restoredNodes = nodeItems.map((e) => restoreSingleNode(e, today));

  let ocN = 0;
  for (const e of ocItems) {
    const type = sortedTypes().find((t) => t.manifest.id === e.from.typeId);
    if (!type || !type.records.restoreRecord) continue;
    type.records.restoreRecord(e.payload.rec);
    markRestored(e.id, session.state.person, today);
    const audit = await auditFor(e.from.typeId);
    if (audit && audit.pushRecordRestoreLog) audit.pushRecordRestoreLog(e.payload.rec);
    ocN++;
  }

  let docN = 0;
  docItems.forEach((e) => {
    const doc = e.payload.doc;
    if (!getDocument(doc.id)) restoreDocument(doc);
    markRestored(e.id, session.state.person, today);
    docN++;
  });

  return { nodes: restoredNodes.length, oc: ocN, docs: docN, root: restoredNodes[0] };
}

// --- привязка объектов оценки ----------------------------------------------

// Пара названий для записи: имя учреждения (второй уровень) и имя самого узла,
// если он глубже. Так связь ложится на поля, которые уже есть в реестре.
export function bindingFor(node) {
  const path = pathOf(node.id);
  const top = path[1];
  if (!top) return null;
  return {
    institution: top.name,
    podved: node.id === top.id ? '' : node.name,
    nodeId: node.id,
  };
}

export function attachRecords(node, refs) {
  const binding = bindingFor(node);
  if (!binding) return 0;

  let n = 0;
  refs.forEach(({ typeId, id }) => {
    const done = mutate(typeId, id, (records, recId) => records.setInstitution(recId, binding));
    if (done) n++;
  });
  return n;
}

export function detachRecords(refs) {
  let n = 0;
  refs.forEach(({ typeId, id }) => {
    const done = mutate(typeId, id, (records, recId) => records.setInstitution(recId, {
      institution: '', podved: '', nodeId: '',
    }));
    if (done) n++;
  });
  return n;
}

// Кандидаты на привязку: объекты, которые сейчас относятся к другому
// учреждению или ни к какому. Ищем по ЕНИ, адресу и текущему учреждению.
export function candidates(node, q, limit = 40) {
  const { rows } = queryAll({
    filter: emptyFilter(), sort: { key: 'updatedAt', dir: 'desc' }, offset: 0, limit: SCAN_LIMIT,
  });

  const binding = bindingFor(node);
  const needle = String(q || '').trim().toLowerCase();

  return rows.filter((r) => {
    const mine = binding && r.institution === binding.institution
      && (r.podved || '') === binding.podved;
    if (mine) return false;
    if (!needle) return true;
    return [r.eni, r.title, r.institution, r.podved, r.typeLabel]
      .filter(Boolean).join(' ').toLowerCase().includes(needle);
  }).slice(0, limit);
}

// --- избранное и поиск -----------------------------------------------------

// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: избранное — личная настройка пользователя, здесь живёт
// в памяти вкладки.
const favorites = new Set();

export function isFavorite(id) {
  return favorites.has(id);
}

export function toggleFavorite(id) {
  if (favorites.has(id)) favorites.delete(id);
  else favorites.add(id);
  return favorites.has(id);
}

export function favoriteNodes() {
  return [...favorites].map(getNode).filter(Boolean);
}

export function searchNodes(q) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return [];
  return allNodes()
    .filter((n) => n.parentId && n.name.toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

// Регион узла: свой, если задан, иначе — по объектам оценки этой ветки.
// Область у объекта берётся из первой цифры ЕНИ (kernel/fmt.js), отдельного
// поля в записи нет.
export function regionOf(node) {
  if (node.region) return node.region;

  const rows = subtreeOf(node.id).flatMap((n) => ocRowsOf(n, { limit: 40 }));
  const counts = {};
  // Область берётся из первой цифры ЕНИ: отдельного поля в записи нет.
  rows.forEach((r) => {
    const region = eniRegion(r.eni);
    if (region) counts[region] = (counts[region] || 0) + 1;
  });

  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : '';
}

// --- переименование в записях ---------------------------------------------

function renameInRecords(node, newName) {
  const binding = bindingFor(node);
  if (!binding) return;

  const isTop = !binding.podved;
  const filter = { ...emptyFilter(), institution: [binding.institution] };
  const { rows } = queryAll({
    filter, sort: { key: 'updatedAt', dir: 'desc' }, offset: 0, limit: SCAN_LIMIT,
  });

  rows.forEach((r) => {
    const touchesTop = isTop;
    const touchesPodved = !isTop && (r.podved || '') === node.name;
    if (!touchesTop && !touchesPodved) return;

    mutate(r.typeId, r.id, (records, recId) => records.setInstitution(recId, {
      institution: isTop ? newName : r.institution,
      podved: isTop ? (r.podved || '') : newName,
      nodeId: node.id,
    }));
  });
}
