// Числа и строки.
//
// ВАЖНО про разделение fmt / fmtNum: одна и та же функция раньше и печатала
// число на экран, и записывала его обратно в данные (floors.model.js:
// `f.area = fmt(a)`, генератор синтетики). Разряды нужны только на экране —
// если они попадут в значение поля, num() его уже не разберёт. Поэтому:
//   fmt     — «машинное» представление, ходит в данные и в value полей ввода;
//   fmtNum  — «человеческое», только для показа;
//   fmtInt  — целые величины (количества) с разрядами, но без десятых.
// Годы, коды и номера не форматируются вовсе — они не величины.

// Пробел-разделитель разрядов — неразрывный тонкий, чтобы число не переносилось
// по строке и не выглядело как два числа.
const GROUP_SEP = ' ';

export const num = (s) => {
  // Пробелы (в т.ч. неразрывные) выбрасываем: строка могла прийти из поля, куда
  // пользователь вставил уже отформатированное число.
  const n = parseFloat(String(s ?? '').replace(/[\s  ]/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
};

// Машинное представление: 2 знака, запятая, БЕЗ разрядов. Не менять — от него
// зависит round-trip значений через num().
export const fmt = (n) => n.toFixed(2).replace('.', ',');

function group(intPart) {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEP);
}

// Дробная величина для показа: «1 234,56».
export function fmtNum(n) {
  const v = typeof n === 'number' ? n : num(n);
  const [i, f] = v.toFixed(2).split('.');
  const sign = i.startsWith('-') ? '-' : '';
  return sign + group(i.replace('-', '')) + ',' + f;
}

// Целая величина для показа: «1 234». Десятых нет — количество этажей или фото
// с «,00» читается неверно.
export function fmtInt(n) {
  const v = typeof n === 'number' ? n : num(n);
  const i = Math.round(v);
  const sign = i < 0 ? '-' : '';
  return sign + group(String(Math.abs(i)));
}

// ЕНИ: в данных хранится голыми цифрами, тире расставляются только при показе.
// Маска X-XX-XX-XXXX-XXXX-NN-YYY (18 цифр).
//
// Разбиение идёт СЛЕВА НАПРАВО, и это принципиально: фильтр по областям (Л1.7)
// определяет регион по ПЕРВОЙ цифре кода, значит первая группа обязана остаться
// ровно одной цифрой. При разбиении справа налево у 12-значного кода первая
// группа склеивалась в «147», и признак региона терялся.
// Длина кода СТРОГАЯ: 18 цифр, другой быть не может (подтверждено пользователем
// 28.08.2026). Код другой длины — это ошибка данных, а не иной формат: показываем
// как есть и помечаем через eniError, а не подгоняем под маску молча.
const ENI_GROUPS = [1, 2, 2, 4, 4, 2, 3];
export const ENI_LENGTH = ENI_GROUPS.reduce((a, b) => a + b, 0);

export function fmtEni(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';

  const out = [];
  let rest = digits;
  for (const size of ENI_GROUPS) {
    if (!rest) break;
    out.push(rest.slice(0, size));
    rest = rest.slice(size);
  }
  // Цифр больше, чем в маске — хвост отдельной группой, а не молча обрезаем.
  if (rest) out.push(rest);
  return out.join('-');
}

// Пустой код — не ошибка (поле просто не заполнено). Ошибка — заполненный код,
// в котором цифр не ровно 18.
export function eniError(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length !== ENI_LENGTH) {
    // Склонение через общий plural: своя укороченная формула давала «3 цифр».
    return `В коде ЕНИ ${digits.length} ${plural(digits.length, 'цифра', 'цифры', 'цифр')} вместо ${ENI_LENGTH}`;
  }
  return '';
}

// Область по первой цифре ЕНИ (Л1.7). Справочник дан пользователем 28.08.2026.
export const ENI_REGIONS = {
  1: 'Бишкек',
  2: 'Иссык-Куль',
  3: 'Жалал-Абад',
  4: 'Нарын',
  5: 'Ош',
  6: 'Талас',
  7: 'Чуй',
  8: 'Баткен',
};

export const eniRegionCode = (value) => String(value ?? '').replace(/\D/g, '').charAt(0) || '';

// Название области или пустая строка, если первая цифра не из справочника.
export const eniRegion = (value) => ENI_REGIONS[eniRegionCode(value)] || '';

export const parseEni = (value) => String(value ?? '').replace(/\D/g, '');

export const round2 = (x) => Math.round(x * 100) / 100;
export const norm = (s) => (s || '').toLowerCase().replace(/ё/g, 'е');

// Слово по числу: 1 этаж, 2 этажа, 5 этажей. Русские правила счёта — часть
// показа величины, поэтому живут рядом с остальным форматированием.
export function plural(n, one, few, many) {
  const a = Math.abs(Math.round(n)) % 100;
  if (a > 10 && a < 20) return many;
  const b = a % 10;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}
