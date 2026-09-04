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
import { queryDocuments, documentInstitutions } from './documentsRegistry.js';
import { eniRegion } from './fmt.js';
import { seesEverything, session } from './session.js';

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

// Удаление. Узел с объектами не удаляем: сначала их надо перенести — иначе
// объекты потеряют учреждение молча.
export function removeNode(id, { withChildren = false } = {}) {
  const node = getNode(id);
  if (!node) return { ok: false, reason: 'Учреждение не найдено' };
  if (!node.parentId) return { ok: false, reason: 'Корневой узел удалить нельзя' };

  const sub = subtreeOf(id);
  const busy = sub.filter((n) => ocCount(n) > 0);
  if (busy.length) {
    return {
      ok: false,
      reason: `За ${busy.length === 1 ? 'учреждением' : 'учреждениями'} числятся объекты оценки`,
      busy: busy.map((n) => ({ name: n.name, oc: ocCount(n) })),
    };
  }

  const kids = childrenOf(id);
  if (kids.length && !withChildren) {
    return { ok: false, reason: 'У учреждения есть подведомственные', children: kids.length };
  }

  const ids = new Set(sub.map((n) => n.id));
  for (let i = nodes.length - 1; i >= 0; i--) if (ids.has(nodes[i].id)) nodes.splice(i, 1);
  return { ok: true, removed: ids.size };
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
