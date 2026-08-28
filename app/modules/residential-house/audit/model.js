// Лог действий (CRUD) по записи ОЦ. Механизм обкатан на гражданских зданиях и
// теперь есть во всех пяти модулях — СВОЕЙ копией в каждом, а не общим кодом в
// kernel: набор полей и их подписи у разных типов ОЦ разные (см. fieldLabels.js
// рядом), а ядро не должно знать ни одного типа ОЦ. В kernel это переедет только
// если у всех пяти копий совпадёт форма (см. граф знаний).
// Работает через снимок-и-сравнение: модуль снимает
// снимок записи при входе в карточку (takeSnapshot), при выходе (переход
// на другой маршрут/запись, размонтирование) сравнивает с текущим
// состоянием (recordChanges) — так фиксируется любое поле любой карточки
// без ручной расстановки логирования по каждому onchange. Несколько правок
// одного поля между двумя переходами схлопываются в одну строку (значение
// на входе → значение на выходе) — читаемый лог, а не поток по клавише.
//
// rec.auditLog — ПЛОСКИЙ список строк (не сгруппированных по времени
// записей): каждая строка — одно изменение, с собственными id/at/person/role.
// Группировка «одна карточка на объект (литеру/ОЦ), внутри — вся его
// история» строится на этапе отображения (audit/view.js), не хранения —
// см. граф знаний, решение про группировку по объекту (2026-08-26).
//
// 4 категории (см. audit/categories.js): 'oi' (Литеры — правки полей ОИ,
// создание/удаление литеры), 'oc' (правки записи ОЦ), 'docs' (документы —
// вложения к ОЦ, включая постраничные действия), 'photos' (счётчики фото по
// категориям внутри литеры).
import { session } from '../../../kernel/session.js';
import { nextEniScoped } from '../data/store.js';

// Служебные поля, которые пользователю не показываются никогда, поэтому не
// логируются — в том числе при каскаде удаления литеры: auditLog/updatedAt/
// ocOrphanPhotos — служебные поля записи ОЦ; id/card — служебные поля ОИ;
// notes — заметки логировать не просили (прямое указание пользователя).
// Проверяется на корне каждого вызова walk (path.length === 0), то есть и для
// полей записи ОЦ, и для полей литеры — оба обхода стартуют с пустого path.
const IGNORED_KEYS = new Set(['auditLog', 'updatedAt', 'ocOrphanPhotos', 'id', 'card', 'notes']);

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

function oiLabel(item) {
  return item.letter ? `Литера ${item.letter} · ${item.name}` : (item.name || item.id);
}

function docLabel(item) {
  return `«${item.type}» — ${item.name} (${item.id})`;
}

// --- Обход дерева записи с категоризацией по ключу -----------------------

function walk(beforeRaw, afterRaw, path, category, target, cardType, out) {
  if (beforeRaw === afterRaw) return;

  // Вложенная структура ИСЧЕЗЛА целиком (каскад удаления литеры: снимок
  // диффится против {}) — раскрываем её по полям, а не пишем сырым JSON
  // одной строкой (было «struct {"foundation":"Бетонный",...} → —»).
  const before = beforeRaw;
  let after = afterRaw;
  if (after === undefined && isPlainObject(before)) after = {};
  if (after === undefined && Array.isArray(before)) after = [];

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
      // литеры в target (по прямому указанию пользователя — документы
      // всегда живут в логе ОЦ, а не литеры, независимо от того, где
      // технически прикреплены).
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

  // Оба значения выглядят одинаково для пользователя (чаще всего «— → —»:
  // пустое поле «очистилось» при каскаде удаления литеры) — это не
  // изменение, в лог не пишем.
  const beforeStr = displayValue(before);
  const afterStr = displayValue(after);
  if (beforeStr === afterStr) return;

  out.push({ category, target, cardType, field: path.join('.'), action: 'update', before: beforeStr, after: afterStr });
}

// Простые массивы (owners, users, heating...) — сравниваются как значение
// целиком; для photos-объекта эта ветка не используется (это plain object,
// не массив).
function diffPlainArray(before, after, path, category, target, cardType, out) {
  if (JSON.stringify(before) === JSON.stringify(after)) return;

  const beforeStr = displayValue(before);
  const afterStr = displayValue(after);
  if (beforeStr === afterStr) return;

  out.push({ category, target, cardType, field: path.join('.'), action: 'update', before: beforeStr, after: afterStr });
}

// rec.oi — матчинг по id: добавление литеры — одна запись категории 'oi';
// у совпавших литер — обычный обход полей, target/cardType берутся из самой
// литеры (а не наследуются от записи ОЦ). Удаление обрабатывается ОТДЕЛЬНО
// через pushOiDeletionLog (см. ниже) — здесь ветки delete больше нет
// намеренно: deleteOi (index.js) сам решает, когда литера удаляется, и сам
// вызывает pushOiDeletionLog ДО rec.oi.splice — обычный снимок-и-сравнение
// на удаление уже не сработает (литеры к моменту следующего flush просто
// не станет в обоих снимках).
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

// --- Запись плоских строк в rec.auditLog ----------------------------------

// Каждый элемент плоского диффа становится СВОЕЙ строкой лога — свой id,
// общие at/atTs/person/role на весь вызов (один flush/одно действие).
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
      targetId: c.target ? c.target.id : null,
      targetLetter: c.target ? c.target.letter : null,
      targetName: c.target ? c.target.name : null,
      cardType: c.cardType,
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
  walk(before, after, [], 'oc', null, null, flat);
  return pushRows(rec, flat);
}

// Постраничные действия в документе (data-vdelpage и перетаскивание миниатюр,
// parts/viewer/ctrl.js) — диффом не поймать по-человечески: у страниц нет
// стабильных id, только позиция, а нужен точный текст «удалена страница 4»/
// «перенесена на № 7». Пишется явно в момент действия, в обход
// снимок-и-сравнение механизма — единственное намеренное исключение.
export function pushDocPageLog(rec, doc, action, pageNumber) {
  if (!rec || !doc) return null;
  const label = docLabel(doc);
  // Два вида правки страниц: удалили и переставили. Добавления больше нет —
  // вместе с кнопкой «+ Страница», которая вставляла нарисованный пустой лист.
  // У перестановки «было → стало» читается как новая позиция страницы — терять
  // её нельзя, порядок страниц в документе значим.
  const base = { field: 'pages', docId: doc.id, docLabel: label };
  const change = action === 'move'
    ? { ...base, action: 'move', before: 'порядок страниц', after: `перенесена на № ${pageNumber}` }
    : { ...base, action: 'delete', before: `№ ${pageNumber}`, after: '—' };

  const [row] = pushRows(rec, [{ category: 'docs', target: null, cardType: null, ...change }]);
  return row;
}

// Удаление литеры (index.js deleteOi, ДО rec.oi.splice): каждое непустое
// поле литеры каскадом даёт свою строку «было X → —» — переиспользуем walk,
// диффя снимок литеры против {}. photos сознательно исключены из снимка —
// они физически не удаляются (переезжают в rec.ocOrphanPhotos), поэтому для
// них отдельная явная строка «перенесено», а не «—» (было бы неверно читать
// как утрату данных). docs литеры каскадируют обычным порядком (сохранять
// их не просили — только фото).
export function pushOiDeletionLog(rec, oi, movedPhotos) {
  if (!rec || !oi) return [];

  const target = { id: oi.id, letter: oi.letter, name: oi.name };
  const snapshot = { ...oi };
  delete snapshot.photos;

  const flat = [];
  walk(snapshot, {}, [], 'oi', target, oi.card, flat);

  if (movedPhotos) {
    Object.entries(movedPhotos).forEach(([cat, count]) => {
      if (count > 0) {
        flat.push({
          category: 'photos', target, cardType: null, field: `photos.${cat}`,
          action: 'update', before: String(count), after: 'перенесено в «Фото без литеры»',
        });
      }
    });
  }

  return pushRows(rec, flat);
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
