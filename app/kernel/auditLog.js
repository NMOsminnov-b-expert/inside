// Лог изменений записи ОЦ — общий механизм для всех модулей.
// Работает через снимок-и-сравнение, а не перехват каждого поля: на входе
// в карточку ОЦ/ОИ модуль снимает снимок записи (takeSnapshot), при выходе
// (переход на другой маршрут/запись, размонтирование) сравнивает снимок с
// текущим состоянием (logDiff) и дописывает найденные изменения в
// rec.auditLog — так фиксируется абсолютно любое поле в любой карточке,
// без ручной расстановки логирования по сотням обработчиков onchange.
// Несколько правок одного поля между двумя переходами схлопываются в одну
// запись (значение на входе → значение на выходе) — осознанный выбор в
// пользу читаемого лога, а не потока записей по каждому нажатию клавиши.
import { session } from './session.js';

const IGNORED_KEYS = new Set(['auditLog', 'updatedAt']);

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function nowStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

let seq = 0;
function nextLogId() {
  seq += 1;
  return `log-${Date.now().toString(36)}-${seq}`;
}

export function takeSnapshot(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function displayValue(v) {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'да' : 'нет';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// Массивы объектов с id матчатся по id: добавление/удаление — одна строка
// в логе, без разворачивания в дифф по каждому полю нового объекта.
// Изменение существующего элемента — обычный дифф, но с новым «target»
// (например, конкретная литера ОИ), а не общей записью ОЦ.
function diffArrays(before, after, path, out, target, labelOf) {
  const beforeHasIds = before.length && before.every((x) => isPlainObject(x) && x.id !== undefined);
  const afterHasIds = after.length && after.every((x) => isPlainObject(x) && x.id !== undefined);

  if (beforeHasIds || afterHasIds) {
    const beforeMap = new Map(before.map((x) => [x.id, x]));
    const afterMap = new Map(after.map((x) => [x.id, x]));

    afterMap.forEach((item, id) => {
      if (!beforeMap.has(id)) {
        out.push({ target, field: path.join('.') || '(добавлено)', before: '—', after: labelOf(item) });
      } else {
        diffValues(beforeMap.get(id), item, [], out, labelOf(item) || target, labelOf);
      }
    });

    beforeMap.forEach((item, id) => {
      if (!afterMap.has(id)) {
        out.push({ target, field: path.join('.') || '(удалено)', before: labelOf(item), after: '—' });
      }
    });

    return;
  }

  const a = JSON.stringify(before);
  const b = JSON.stringify(after);
  if (a !== b) out.push({ target, field: path.join('.'), before: displayValue(before), after: displayValue(after) });
}

function diffValues(before, after, path, out, target, labelOf) {
  if (before === after) return;

  if (Array.isArray(before) && Array.isArray(after)) {
    diffArrays(before, after, path, out, target, labelOf);
    return;
  }

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    keys.forEach((k) => {
      if (path.length === 0 && IGNORED_KEYS.has(k)) return;
      diffValues(before[k], after[k], path.concat(k), out, target, labelOf);
    });
    return;
  }

  // Шум ленивой инициализации (поле появилось пустым при первом открытии
  // карточки — oi.plans = [], oi.apartment = {...} и т.п.) — не настоящее
  // изменение, в лог не пишем.
  if (before === undefined && (after === '' || (Array.isArray(after) && !after.length))) return;

  out.push({ target, field: path.join('.'), before: displayValue(before), after: displayValue(after) });
}

// targetLabel — подпись записи ОЦ целиком (например, адрес/ЕНИ);
// labelOf — как подписать элемент массива ОИ (по умолчанию — литера/имя/id).
export function logDiff(rec, targetLabel, before, after, labelOf = (x) => x.name || x.letter || x.id) {
  if (!rec || !before || !after) return;

  const out = [];
  diffValues(before, after, [], out, targetLabel, labelOf);
  if (!out.length) return;

  rec.auditLog = rec.auditLog || [];
  const at = nowStr();
  const { person, role } = session.state;

  out.forEach((entry) => {
    rec.auditLog.push({
      id: nextLogId(),
      at,
      person,
      role,
      target: entry.target,
      field: entry.field || '(объект целиком)',
      before: entry.before,
      after: entry.after,
    });
  });
}
