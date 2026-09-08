// Лог действий (CRUD) по записи ОЦ. Механизм обкатан на гражданских зданиях и
// есть во всех пяти модулях — СВОЕЙ копией в каждом, а не общим кодом в
// kernel: набор полей и их подписи у разных типов ОЦ разные (см. fieldLabels.js
// рядом), а ядро не должно знать ни одного типа ОЦ. Работает через
// снимок-и-сравнение: модуль снимает снимок записи при входе в карточку
// (takeSnapshot), при выходе (переход на другой маршрут/запись,
// размонтирование) сравнивает с текущим состоянием (recordChanges) — так
// фиксируется любое поле любой карточки без ручной расстановки логирования
// по каждому onchange. Несколько правок одного поля между двумя переходами
// схлопываются в одну строку (значение на входе → значение на выходе) —
// читаемый лог, а не поток по клавише.
//
// rec.auditLog — ПЛОСКИЙ список строк: каждая строка — одно изменение, с
// собственными id/at/person/role.
//
// У этого модуля нет объектов имущества и нет фото по литерам (см. manifest.js,
// records.js), поэтому категорий здесь только две (audit/categories.js):
// 'oc' (правки записи ОЦ, включая rec.mechanisms) и 'docs' (документы). Категорий
// 'oi' и 'photos' и связанного с ними каскадного удаления литеры в этом
// модуле нет вовсе — удалять здесь нечего.
import { session } from '../../../kernel/session.js';
import { nextEniScoped } from '../data/store.js';

// Служебные поля, которые пользователю не показываются никогда, поэтому не
// логируются. notes — заметки логировать не просили (прямое указание
// пользователя, как и в остальных модулях).
const IGNORED_KEYS = new Set(['auditLog', 'updatedAt', 'id', 'notes']);

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function nowStr(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function nextLogId(rec) {
  return nextEniScoped(rec, (rec.auditLog || []).map((r) => r.id));
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

function docLabel(item) {
  return `«${item.type}» — ${item.name} (${item.id})`;
}

// --- Обход дерева записи с категоризацией по ключу -----------------------

function walk(beforeRaw, afterRaw, path, out) {
  if (beforeRaw === afterRaw) return;

  const before = beforeRaw;
  let after = afterRaw;
  if (after === undefined && isPlainObject(before)) after = {};
  if (after === undefined && Array.isArray(before)) after = [];

  if (Array.isArray(before) && Array.isArray(after)) {
    diffPlainArray(before, after, path, out);
    return;
  }

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    keys.forEach((k) => {
      if (path.length === 0 && IGNORED_KEYS.has(k)) return;

      // docs — категория 'docs': только факт добавления/удаления документа.
      if (k === 'docs') {
        diffDocsArray(before.docs || [], after.docs || [], out);
        return;
      }

      // mechanisms — состав механизмов записи (массив, см. records.js):
      // матчинг по id (не по индексу — запись может быть убрана из
      // середины списка), поэтому диффится ОТДЕЛЬНО от обычных массивов
      // («N шт.») — см. diffMechanismsArray.
      if (path.length === 0 && k === 'mechanisms') {
        diffMechanismsArray(before.mechanisms || [], after.mechanisms || [], out);
        return;
      }

      walk(before[k], after[k], path.concat(k), out);
    });
    return;
  }

  // Шум ленивой инициализации — не настоящее изменение пользователя.
  if (before === undefined && (after === '' || typeof after === 'object')) return;

  const beforeStr = displayValue(before);
  const afterStr = displayValue(after);
  if (beforeStr === afterStr) return;

  out.push({ category: 'oc', field: path.join('.'), action: 'update', before: beforeStr, after: afterStr });
}

function diffPlainArray(before, after, path, out) {
  if (JSON.stringify(before) === JSON.stringify(after)) return;

  const beforeStr = displayValue(before);
  const afterStr = displayValue(after);
  if (beforeStr === afterStr) return;

  out.push({ category: 'oc', field: path.join('.'), action: 'update', before: beforeStr, after: afterStr });
}

// Поля конструктора одной записи механизма (mechanisms[].fields) — матчинг
// по id, подпись берётся у самого поля (label фиксируется при создании и
// дальше не редактируется — см. parts/mechConstructor.js), поэтому её
// достаточно снять один раз с актуальной стороны диффа (при удалении — со
// снимка «до»). entryLabel — название/id той записи механизма, которой
// принадлежат эти поля (запись теперь не одна на ОЦ, поэтому строка лога
// должна называть, о каком именно механизме речь).
function diffMechFieldsArray(before, after, entryLabel, out) {
  const beforeMap = new Map(before.map((x) => [x.id, x]));
  const afterMap = new Map(after.map((x) => [x.id, x]));
  const prefix = `Механизм «${entryLabel}»:`;

  afterMap.forEach((item, id) => {
    const field = `${prefix} ${item.label}`;
    if (!beforeMap.has(id)) {
      out.push({ category: 'oc', field, action: 'create', before: '—', after: displayValue(item.value) });
      return;
    }
    const b = beforeMap.get(id);
    const beforeStr = displayValue(b.value);
    const afterStr = displayValue(item.value);
    if (beforeStr !== afterStr) {
      out.push({ category: 'oc', field, action: 'update', before: beforeStr, after: afterStr });
    }
  });

  beforeMap.forEach((item, id) => {
    if (!afterMap.has(id)) {
      out.push({ category: 'oc', field: `${prefix} ${item.label}`, action: 'delete', before: displayValue(item.value), after: '—' });
    }
  });
}

// Имя, которым запись механизма называется в логе: собственное название,
// если оно есть, иначе её id (запись без названия — например, только что
// добавленная и ещё не заполненная).
function mechEntryLabel(entry) {
  return (entry && entry.name) ? entry.name : ((entry && entry.id) || '');
}

// rec.mechanisms — массив записей механизма (см. records.js): матчинг по
// id, как и у docs (diffDocsArray) и полей конструктора внутри записи
// (diffMechFieldsArray). Для записи, оставшейся в обеих версиях, — обычный
// дифф её name/qty плюс дифф её собственных fields; для добавленной/убранной
// целиком записи — одна сводная строка (тот же приём, что и diffDocsArray,
// а не построчный дамп её полей).
function diffMechanismsArray(before, after, out) {
  const beforeMap = new Map(before.map((x) => [x.id, x]));
  const afterMap = new Map(after.map((x) => [x.id, x]));

  afterMap.forEach((item, id) => {
    if (!beforeMap.has(id)) {
      const label = mechEntryLabel(item) || '—';
      out.push({ category: 'oc', field: 'Механизмы (состав)', action: 'create', before: '—', after: `добавлен механизм «${label}»` });
      return;
    }

    const b = beforeMap.get(id);
    // Название после правки полезнее для будущих строк того же дифф-прохода
    // (переименование и правка полей одной записи за один заход), а до
    // первого названия — берём то, что было, иначе — id.
    const label = mechEntryLabel(item) || mechEntryLabel(b) || id;

    const beforeName = displayValue(b.name);
    const afterName = displayValue(item.name);
    if (beforeName !== afterName) {
      out.push({ category: 'oc', field: `Механизм «${label}»: Название`, action: 'update', before: beforeName, after: afterName });
    }

    const beforeQty = displayValue(b.qty);
    const afterQty = displayValue(item.qty);
    if (beforeQty !== afterQty) {
      out.push({ category: 'oc', field: `Механизм «${label}»: Количество`, action: 'update', before: beforeQty, after: afterQty });
    }

    const beforeCost = displayValue(b.cost);
    const afterCost = displayValue(item.cost);
    if (beforeCost !== afterCost) {
      out.push({ category: 'oc', field: `Механизм «${label}»: Стоимость`, action: 'update', before: beforeCost, after: afterCost });
    }

    diffMechFieldsArray(b.fields || [], item.fields || [], label, out);
  });

  beforeMap.forEach((item, id) => {
    if (!afterMap.has(id)) {
      const label = mechEntryLabel(item) || '—';
      out.push({ category: 'oc', field: 'Механизмы (состав)', action: 'delete', before: `удалён механизм «${label}»`, after: '—' });
    }
  });
}

// docs — только факт добавления/удаления: переименования, смены типа или
// замены файла в системе нет, поэтому полей совпавших документов не диффим.
function diffDocsArray(before, after, out) {
  const beforeMap = new Map(before.map((x) => [x.id, x]));
  const afterMap = new Map(after.map((x) => [x.id, x]));

  afterMap.forEach((item, id) => {
    if (!beforeMap.has(id)) {
      out.push({ category: 'docs', field: '(объект)', action: 'create', before: '—', after: 'прикреплён', docId: id, docLabel: docLabel(item) });
    }
  });

  beforeMap.forEach((item, id) => {
    if (!afterMap.has(id)) {
      out.push({ category: 'docs', field: '(объект)', action: 'delete', before: 'прикреплён', after: '—', docId: id, docLabel: docLabel(item) });
    }
  });
}

// --- Запись плоских строк в rec.auditLog ----------------------------------

function pushRows(rec, flat) {
  if (!flat.length) return [];

  const now = new Date();
  const at = nowStr(now);
  const atTs = now.getTime();
  const { person, role } = session.state;
  rec.auditLog = rec.auditLog || [];

  return flat.map((c) => {
    const row = {
      id: nextLogId(rec),
      at, atTs, person, role,
      category: c.category,
      field: c.field,
      action: c.action,
      before: c.before,
      after: c.after,
      docId: c.docId,
      docLabel: c.docLabel,
    };
    rec.auditLog.push(row);
    return row;
  });
}

export function recordChanges(rec, before, after) {
  if (!rec || !before || !after) return [];
  const flat = [];
  walk(before, after, [], flat);
  return pushRows(rec, flat);
}

// Постраничные действия в документе (data-vdelpage и перетаскивание миниатюр,
// parts/viewer/ctrl.js) — диффом не поймать по-человечески: у страниц нет
// стабильных id, только позиция. Пишется явно в момент действия, в обход
// снимок-и-сравнение механизма — единственное намеренное исключение (как и
// в остальных модулях).
export function pushDocPageLog(rec, doc, action, pageNumber) {
  if (!rec || !doc) return null;
  const label = docLabel(doc);
  const base = { field: 'pages', docId: doc.id, docLabel: label };
  const change = action === 'move'
    ? { ...base, action: 'move', before: 'порядок страниц', after: `перенесена на № ${pageNumber}` }
    : { ...base, action: 'delete', before: `№ ${pageNumber}`, after: '—' };

  const [row] = pushRows(rec, [{ category: 'docs', ...change }]);
  return row;
}

// Ищет документ по id среди rec.docs — для кнопки «перейти к документу» в
// развёрнутой записи лога. У этого модуля документы есть только на уровне
// ОЦ (нет литер, у которых могли бы быть свои), поэтому обход проще, чем в
// остальных модулях.
export function resolveDocRef(rec, docId) {
  if (!rec || !docId) return null;
  const own = (rec.docs || []).find((d) => d.id === docId);
  return own ? { scope: 'oc', doc: own } : null;
}
