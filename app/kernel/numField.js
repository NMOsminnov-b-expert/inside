// Числовое поле ввода: на экране «1 000 000,00», в данных «1000000,00».
//
// Показ и хранение расходятся намеренно (см. политику в fmt.js): разряды нужны
// глазу — без них «1840.50» и «18405.0» отличаются одной точкой, и ошибку в
// разряде замечают уже в отчёте. В данные разряды не идут: там машинное
// представление, от которого зависит round-trip через num().
//
// Разряды расставляются ПО ХОДУ ввода, как маска кода ЕНИ (требование
// пользователя 11.09.2026). Раньше поле в фокусе показывало число сплошняком и
// переодевалось только при потере фокуса — проверить набранное по документу до
// этого было нельзя, а в разряде ошибаются именно при наборе.
//
// Требование пользователя 09.09.2026: «в карточке поправь разделение формата
// чисел (условно 1 000 000,00)».
//
// Поле принимает не только число, но и простое выражение: «7*6» даёт 42, «2/3»
// — 0,67. Считать площадь или стоимость в стороннем калькуляторе и переносить
// результат руками — лишний шаг и лишняя описка (требование пользователя
// 17.09.2026; та же практика в числовых полях Photoshop и Figma, см. David
// Luhr, «A deep dive on the UX of number inputs»). Выражение вычисляется по
// уходу фокуса и по Enter, а не по ходу набора: иначе поле правило бы человека
// посреди набора.
import { num, fmt, fmtNum, fmtInt, round2 } from './fmt.js';

// --- выражение --------------------------------------------------------------

// Разбор свой, без eval: в поле попадает что угодно, и выполнять это как код
// нельзя. Рекурсивный спуск сам расставляет приоритет операций, поэтому
// «2+2*2» даёт 6, а не 8.
function evalExpr(src) {
  let i = 0;
  const skip = () => { while (src[i] === ' ') i += 1; };

  function number() {
    const start = i;
    while (i < src.length && /[\d.]/.test(src[i])) i += 1;
    return i === start ? NaN : parseFloat(src.slice(start, i));
  }

  function factor() {
    skip();
    if (src[i] === '+') { i += 1; return factor(); }
    if (src[i] === '-') { i += 1; const v = factor(); return isNaN(v) ? NaN : -v; }
    if (src[i] === '(') {
      i += 1;
      const v = sum();
      skip();
      if (src[i] !== ')') return NaN;
      i += 1;
      return v;
    }
    return number();
  }

  function product() {
    let v = factor();
    for (;;) {
      skip();
      const op = src[i];
      if (op !== '*' && op !== '/' && op !== '×' && op !== ':') return v;
      i += 1;
      const r = factor();
      if (isNaN(v) || isNaN(r)) return NaN;
      // Деление на ноль — не «бесконечность», а нечитаемое выражение: показать
      // в поле нечего, оставляем набранное человеку на правку.
      if ((op === '/' || op === ':') && r === 0) return NaN;
      v = (op === '*' || op === '×') ? v * r : v / r;
    }
  }

  function sum() {
    let v = product();
    for (;;) {
      skip();
      const op = src[i];
      if (op !== '+' && op !== '-') return v;
      i += 1;
      const r = product();
      if (isNaN(v) || isNaN(r)) return NaN;
      v = op === '+' ? v + r : v - r;
    }
  }

  const value = sum();
  skip();
  // Разобрано не до конца («12 кг») — это не выражение.
  return i === src.length ? value : NaN;
}

// Похоже ли набранное на выражение. Ведущий минус не в счёт — «-5» это число,
// а не вычитание.
const OPS = /[+*/():×]/;
export function isExpr(v) {
  const t = String(v ?? '').trim().replace(/^-/, '');
  return OPS.test(t) || /\d\s*-/.test(t);
}

// Число из набранного: выражение вычисляется, обычное число разбирается как
// прежде. NaN — набрано не число.
export function numOf(v) {
  const src = String(v ?? '').replace(/[\s  ]/g, '').replace(/,/g, '.');
  if (!src) return NaN;
  if (!isExpr(v)) return num(v);
  const r = evalExpr(src);
  return isNaN(r) ? NaN : round2(r);
}

// Есть ли в строке хоть одна цифра. Набор без цифр — «абв», «—», случайный
// символ — это не число и не ноль: приводить его к «0,00» значит подставить
// человеку измеренное значение, которого он не вводил (замечание пользователя
// 11.09.2026 по карточке участка).
const hasDigit = (v) => /\d/.test(String(v ?? ''));

// Что показывать, когда поле не в работе. Пустое остаётся пустым: ноль вместо
// пустоты соврал бы — «не заполнено» и «ноль» это разные вещи.
// Целая величина (количество штук, портов, полок) — без дробной части: «2,00»
// процессора не бывает.
export function numText(v, kind) {
  if (!hasDigit(v)) return '';
  const n = numOf(v);
  if (isNaN(n)) return String(v);
  return kind === 'int' ? fmtInt(n) : fmtNum(n);
}

// Что уходит в данные: машинное представление без разрядов.
export function numEdit(v, kind) {
  if (!hasDigit(v)) return '';
  const n = numOf(v);
  if (isNaN(n)) return String(v);
  return kind === 'int' ? String(Math.round(n)) : fmt(n);
}

// Показ по ходу набора. От numText отличается тем, что НЕ округляет и не
// добивает нулями: пока человек печатает «12,5», дописать «12,55» он должен
// мочь — а «12,50» из-под пальцев этого уже не даст. Поэтому группируем только
// целую часть, дробную оставляем как набрана.
const GROUP = /\B(?=(\d{3})+(?!\d))/g;

export function numLive(raw) {
  const src = String(raw ?? '');
  // Набирается выражение — маску не применяем вовсе: разряды посреди «7*600»
  // не дают его дочитать, а запятая вместо точки ломает сам набор. Лишние
  // символы всё равно отбрасываем — считать нечего, кроме цифр и знаков.
  if (isExpr(src)) return src.replace(/[^\d.,+\-*/():× ]/g, '');

  // Цифр ещё нет — человек только начал: набранный минус или запятую оставляем,
  // остальное отбрасываем, иначе поле «съедало» бы первый символ.
  if (!hasDigit(src)) return src.replace(/[^\d,.-]/g, '').replace(/\./g, ',');

  // Всё, кроме цифр, запятой, точки и минуса, — мусор: в число он не попадёт,
  // и показывать его в поле незачем.
  const clean = src.replace(/[^\d,.-]/g, '').replace(/\./g, ',');
  const minus = clean.startsWith('-') ? '-' : '';
  const [intPart, ...rest] = clean.replace('-', '').split(',');
  const frac = rest.length ? ',' + rest.join('').slice(0, 2) : '';

  return minus + (intPart.replace(GROUP, ' ') || '0') + frac;
}

// Позиция курсора после перестановки разрядов: считаем цифры и запятые слева
// от него — разделители разрядов ставит маска, и они не в счёт.
function caretAfterDigits(text, count) {
  if (!count) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (/[\d,-]/.test(text[i])) seen++;
    if (seen >= count) return i + 1;
  }
  return text.length;
}

// Привязать поле: форматирование при потере фокуса, машинное значение — в
// запись. write получает уже нормализованную строку.
//
// Порядок событий: change приходит раньше blur, поэтому в запись значение
// уходит до того, как поле переоделось в разряды.
export function bindNumField(el, write, kind) {
  if (!el) return;

  // inputmode, а не <input type="number">: с числовым полем нельзя ввести
  // выражение, а колесо мыши молча меняет значение.
  el.setAttribute('inputmode', kind === 'int' ? 'numeric' : 'decimal');
  el.value = numText(el.value, kind);

  el.addEventListener('focus', () => {
    // Выделяем целиком: чаще значение заменяют, чем дописывают. Переодевать
    // поле на входе больше не нужно — разряды стоят и во время правки.
    if (el.select) el.select();
  });

  el.addEventListener('input', () => {
    // Пока набирают выражение, курсор не трогаем: маска его не двигает.
    if (isExpr(el.value)) {
      const next = numLive(el.value);
      if (next !== el.value) el.value = next;
      return;
    }

    const caret = el.selectionStart || 0;
    // Точку считаем наравне с запятой: маска её в запятую и превращает, но
    // если не учесть её здесь, курсор встанет ПЕРЕД разделителем — и «152.3»
    // набиралось как «1523» (замечание пользователя 11.09.2026).
    const typedBefore = (el.value.slice(0, caret).match(/[\d.,-]/g) || []).length;

    const next = numLive(el.value);
    if (next !== el.value) {
      el.value = next;
      const pos = caretAfterDigits(next, typedBefore);
      el.setSelectionRange(pos, pos);
    }
  });

  el.addEventListener('change', () => {
    if (write) write(numEdit(el.value, kind));
  });

  el.addEventListener('blur', () => {
    // На выходе округляем до сотых и добиваем нулями: «12,5» в документе
    // читается как «12,50», и в отчёт должно уйти одно и то же.
    el.value = numText(el.value, kind);
  });

  // Enter — посчитать не сходя с поля: набрали «7*6», увидели 42, набираете
  // дальше. Без этого результат показался бы только после ухода фокуса.
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !isExpr(el.value)) return;
    e.preventDefault();
    const shown = numText(el.value, kind);
    if (!shown) return;
    el.value = shown;
    if (write) write(numEdit(shown, kind));
    el.select();
  });
}
