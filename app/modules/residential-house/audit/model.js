// Лог действий (CRUD) по записи ОЦ — пока только в этом модуле: логи
// у разных ОЦ могут выглядеть по-разному, поэтому механизм обкатывается
// здесь и переносится в kernel только когда появится реальная общая форма
// (см. граф знаний). Работает через снимок-и-сравнение: модуль снимает
// снимок записи при входе в карточку (takeSnapshot), при выходе (переход
// на другой маршрут/запись, размонтирование) сравнивает с текущим
// состоянием (recordChanges) — так фиксируется любое поле любой карточки
// без ручной расстановки логирования по каждому onchange. Несколько правок
// одного поля между двумя переходами схлопываются в одну запись (значение
// на входе → значение на выходе) — читаемый лог, а не поток по клавише.
//
// Записи делятся на 4 категории (см. audit/categories.js): 'oi' (Литеры —
// правки полей ОИ, создание/удаление литеры), 'oc' (правки записи ОЦ),
// 'docs' (документы — вложения к ОЦ, включая постраничные действия),
// 'photos' (счётчики фото по категориям внутри литеры). Один флаш может
// дать НЕСКОЛЬКО записей лога — по одной на каждую задетую категорию.
import { session } from '../../../kernel/session.js';
import { nextEniScoped } from '../data/store.js';

const IGNORED_KEYS = new Set(['auditLog', 'updatedAt']);

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function nowStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function nextLogId(rec) {
  return nextEniScoped(rec, (rec.auditLog || []).map((e) => e.id));
}

export function takeSnapshot(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function displayValue(v) {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'да' : 'нет';
  if (Array.isArray(v)) {
    if (!v.length) return '—';
    return v.every((x) => x === null || typeof x !== 'object')
      ? v.join(', ')
      : `${v.length} шт.`;
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function oiLabel(item) {
  return item.letter ? `Литера ${item.letter} · ${item.name}` : (item.name || item.id);
}

function docLabel(item) {
  return `«${item.type}» — ${item.name} (${item.id})`;
}

// --- Обход дерева записи с категоризацией по ключу -----------------------

function walk(before, after, path, category, target, cardType, out) {
  if (before === after) return;

  if (Array.isArray(before) && Array.isArray(after)) {
    diffPlainArray(before, after, path, category, target, cardType, out);
    return;
  }

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    keys.forEach((k) => {
      if (path.length === 0 && IGNORED_KEYS.has(k)) return;

      // rec.oi — массив литер, категория 'oi', свой обход (нужен letter/name).
      if (path.length === 0 && k === 'oi') {
        diffOiArray(before.oi || [], after.oi || [], out);
        return;
      }
      // docs — что на уровне ОЦ, что внутри литеры: категория 'docs', без
      // литеры в target (по прямому указанию пользователя).
      if (k === 'docs') {
        diffDocsArray(before.docs || [], after.docs || [], out);
        return;
      }
      // photos — только внутри литеры: категория 'photos', target (литера)
      // наследуется от родителя.
      if (k === 'photos') {
        walk(before.photos || {}, after.photos || {}, ['photos'], 'photos', target, cardType, out);
        return;
      }

      walk(before[k], after[k], path.concat(k), category, target, cardType, out);
    });
    return;
  }

  // Шум ленивой инициализации (поле только что появилось — построена
  // поэтажная развёртка, создан вложенный объект и т.п.) — не настоящее
  // изменение пользователя, в лог не пишем. Значимые скалярные значения
  // (строка/число/булево), появившиеся из undefined, всё ещё логируются.
  if (before === undefined && (after === '' || typeof after === 'object')) return;

  out.push({ category, target, cardType, field: path.join('.'), action: 'update', before: displayValue(before), after: displayValue(after) });
}

// Простые массивы (owners, users, heating...) — сравниваются как значение
// целиком; для photos-объекта эта ветка не используется (это plain object,
// не массив).
function diffPlainArray(before, after, path, category, target, cardType, out) {
  const a = JSON.stringify(before);
  const b = JSON.stringify(after);
  if (a !== b) out.push({ category, target, cardType, field: path.join('.'), action: 'update', before: displayValue(before), after: displayValue(after) });
}

// rec.oi — матчинг по id: добавление/удаление литеры целиком — одна запись
// категории 'oi'; у совпавших литер — обычный обход полей, target/cardType
// берутся из самой литеры (а не наследуются от записи ОЦ).
function diffOiArray(before, after, out) {
  const beforeMap = new Map(before.map((x) => [x.id, x]));
  const afterMap = new Map(after.map((x) => [x.id, x]));

  afterMap.forEach((item, id) => {
    const target = { id: item.id, letter: item.letter, name: item.name };
    if (!beforeMap.has(id)) {
      out.push({ category: 'oi', target, cardType: item.card, field: '(объект)', action: 'create', before: '—', after: oiLabel(item) });
    } else {
      walk(beforeMap.get(id), item, [], 'oi', target, item.card, out);
    }
  });

  beforeMap.forEach((item, id) => {
    if (!afterMap.has(id)) {
      out.push({ category: 'oi', target: { id: item.id, letter: item.letter, name: item.name }, cardType: item.card, field: '(объект)', action: 'delete', before: oiLabel(item), after: '—' });
    }
  });
}

// docs — только факт добавления/удаления: переименования, смены типа или
// замены файла в системе нет (см. план), поэтому полей совпавших документов
// не диффим. docId — чтобы в логе можно было дать кнопку перехода к документу.
// docLabel — название+тип+id документа, снимается в момент действия, поэтому
// не теряется даже если документ потом удалят (в отличие от resolveDocRef,
// который ищет его в текущем состоянии записи и вернёт null).
function diffDocsArray(before, after, out) {
  const beforeMap = new Map(before.map((x) => [x.id, x]));
  const afterMap = new Map(after.map((x) => [x.id, x]));

  afterMap.forEach((item, id) => {
    if (!beforeMap.has(id)) {
      out.push({ category: 'docs', target: null, cardType: null, field: '(объект)', action: 'create', before: '—', after: 'прикреплён', docId: id, docLabel: docLabel(item) });
    }
  });

  beforeMap.forEach((item, id) => {
    if (!afterMap.has(id)) {
      out.push({ category: 'docs', target: null, cardType: null, field: '(объект)', action: 'delete', before: 'прикреплён', after: '—', docId: id, docLabel: docLabel(item) });
    }
  });
}

// --- Группировка плоского диффа в записи лога -----------------------------

function groupKey(c) {
  return c.category + '|' + (c.target ? c.target.letter || c.target.name : '');
}

function pushEntries(rec, flat) {
  if (!flat.length) return [];

  const groups = new Map();
  const order = [];
  flat.forEach((c) => {
    const key = groupKey(c);
    if (!groups.has(key)) { groups.set(key, []); order.push(key); }
    groups.get(key).push(c);
  });

  const at = nowStr();
  const { person, role } = session.state;
  rec.auditLog = rec.auditLog || [];

  const created = order.map((key) => {
    const changes = groups.get(key);
    const first = changes[0];
    const entry = {
      id: nextLogId(rec),
      at, person, role,
      category: first.category,
      target: first.target,
      cardType: first.cardType,
      changes: changes.map(({ field, action, before, after, docId, docLabel }) => ({ field, action, before, after, docId, docLabel })),
    };
    rec.auditLog.push(entry);
    return entry;
  });

  return created;
}

// target записей больше не передаётся снаружи — каждая категория строит его
// сама при обходе (литера — для 'oi'/'photos', ничего — для 'oc'/'docs').
export function recordChanges(rec, before, after) {
  if (!rec || !before || !after) return [];
  const flat = [];
  walk(before, after, [], 'oc', null, null, flat);
  return pushEntries(rec, flat);
}

// Постраничные действия в документе (data-vaddpage/data-vdelpage,
// parts/viewer/ctrl.js) — диффом не поймать по-человечески: у страниц нет
// стабильных id, только позиция, а нужен точный текст «удалена страница 4»/
// «добавлена страница, сейчас № 7». Пишется явно в момент клика, в обход
// снимок-и-сравнение механизма — единственное намеренное исключение.
export function pushDocPageLog(rec, doc, action, pageNumber) {
  if (!rec || !doc) return null;
  const label = docLabel(doc);
  const change = action === 'create'
    ? { field: 'pages', action: 'create', before: '—', after: `№ ${pageNumber}`, docId: doc.id, docLabel: label }
    : { field: 'pages', action: 'delete', before: `№ ${pageNumber}`, after: '—', docId: doc.id, docLabel: label };

  const [entry] = pushEntries(rec, [{ category: 'docs', target: null, cardType: null, ...change }]);
  return entry;
}

// Ищет документ по id среди rec.docs и docs каждой литеры — для кнопки
// «перейти к документу» в развёрнутой записи лога. null, если документ с
// таким id больше не существует (удалён) — кнопка тогда не показывается.
export function resolveDocRef(rec, docId) {
  if (!rec || !docId) return null;
  const own = (rec.docs || []).find((d) => d.id === docId);
  if (own) return { scope: 'oc', doc: own };

  for (const oi of rec.oi || []) {
    const found = (oi.docs || []).find((d) => d.id === docId);
    if (found) return { scope: oi.id, doc: found };
  }
  return null;
}
