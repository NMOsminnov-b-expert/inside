// Поле «число или интервал»: «7,5», «5-10», «5,5 – 10».
//
// Решение пользователя 30.09.2026 (пролёт и грузоподъёмность кранов): запись
// свободная, «которая уже сама сможет на сервере спарситься»; «минус в таких
// полях — обозначение интервала, а не вычисления… валидация есть, но она
// проверяет паттерны. Учитываем, что есть и запятые». Поэтому общее числовое
// поле (numField.js) здесь не годится: там «5-10» — выражение, и оно дало бы −5.
//
// Практика — «принимать разные форматы записи» (W3C WAI, Cognitive
// Accessibility, pattern «Accept different input formats») и «очистить, потом
// оформить» (M. Swensen, «Clean + Format»): человек пишет как привык — точка
// или запятая, дефис, тире или «..», с пробелами или без, — поле при уходе
// приводит запись к одному виду. Ошибку показываем по уходу с поля, а снимаем
// сразу, как только запись стала верной: посреди набора «5-» — не ошибка.
//
// В данных — машинный вид без пробелов: «5,5-10» или «7,5» (запятая, как у
// остальных чисел макета). На экране — «5,5 – 10».
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: хранить, скорее всего, двумя числами (от, до) рядом с
// исходной строкой — по ним отбирают аналоги («краны с пролётом от 8 м»).
// Разбор — тот же образец, что parseRange ниже; развилка — хранить ли точное
// значение как интервал «7,5-7,5» или отдельным видом.
import { setFieldError } from './fieldError.js';

// Число: цифры, разряды пробелами, дробная часть через запятую или точку.
const NUM = String.raw`\d[\d\s  ]*(?:[.,]\d+)?`;
// Разделитель интервала: дефис, минус, тире (короткое и длинное) или «..».
const SEP = String.raw`\s*(?:-|−|–|—|\.\.)\s*`;
const RANGE = new RegExp(`^(${NUM})(?:${SEP}(${NUM}))?$`);

const toNum = (s) => parseFloat(s.replace(/[\s  ]/g, '').replace(',', '.'));
const show = (n) => String(+n.toFixed(2)).replace('.', ',');

// Разобрать запись. null — не число и не интервал; пустая строка — {}.
export function parseRange(v) {
  const t = String(v ?? '').trim();
  if (!t) return {};
  const m = RANGE.exec(t);
  if (!m) return null;
  const from = toNum(m[1]);
  const to = m[2] === undefined ? from : toNum(m[2]);
  return { from, to, single: m[2] === undefined };
}

export function rangeError(v) {
  const r = parseRange(v);
  if (!r) return 'Число или интервал: 7,5 или 5-10';
  if (r.from > r.to) return 'Начало интервала больше конца';
  return '';
}

// Что показать и что записать. Неверная запись остаётся как набрана: стирать
// набранное человеком нельзя, он исправит её сам.
export function rangeText(v) {
  const r = parseRange(v);
  if (!r || r.from === undefined) return String(v ?? '').trim();
  return r.single ? show(r.from) : `${show(r.from)} – ${show(r.to)}`;
}

export function rangeEdit(v) {
  return rangeText(v).replace(/ – /, '-');
}

// Привязать поле. write получает машинный вид и только верную запись.
export function bindRangeField(el, write) {
  if (!el) return;
  el.setAttribute('inputmode', 'decimal');
  el.value = rangeText(el.value);

  el.addEventListener('input', () => {
    if (el.classList.contains('field-bad') && !rangeError(el.value)) setFieldError(el, '');
  });
  el.addEventListener('change', () => {
    if (setFieldError(el, rangeError(el.value))) return;
    el.value = rangeText(el.value);
    if (write) write(rangeEdit(el.value));
  });
}
