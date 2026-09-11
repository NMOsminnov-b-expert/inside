// Комментарий к площадям и мягкое предупреждение о расхождении.
//
// Площади по правоустанавливающим документам и по факту сходятся не всегда, и
// расхождение — не ошибка ввода, а факт, который оценщик обязан объяснить.
// Поэтому здесь именно ПРОСЬБА, а не запрет (решение пользователя 11.09.2026):
// комментарий желателен, сохранению он не мешает, поле лишь подсвечивается.
//
// Почему в ядре: поле комментария есть у литеры, у квартиры и у участка — в
// семи файлах пяти модулей. Держать в каждом свою разметку и свой текст значит
// получить семь разных формулировок одного и того же.
import { num, fmtNum } from './fmt.js';

// Расхождение считаем только когда заполнены ОБА поля: пустое поле — это «ещё
// не мерили», а не «ноль», и предупреждать по нему не о чем.
export function areasMismatch(a, b) {
  const x = String(a == null ? '' : a).trim();
  const y = String(b == null ? '' : b).trim();
  if (!x || !y) return null;

  const diff = Math.round((num(x) - num(y)) * 100) / 100;
  return Math.abs(diff) < 0.01 ? null : diff;
}

// Текст предупреждения. Говорит величину и что с ней делать: «расходятся» без
// числа человек всё равно идёт считать сам.
export function areasWarnText(diff, labelA, labelB) {
  const more = diff > 0 ? labelA : labelB;
  const less = diff > 0 ? labelB : labelA;
  return `${more} больше, чем ${less}, на ${fmtNum(Math.abs(diff))} м². `
    + 'Опишите расхождение в комментарии — это не обязательно, но помогает проверяющему.';
}

// Разметка поля комментария вместе с предупреждением.
//
// `holder` — объект, где лежит areasNote; `pair` — какие две площади сверяем.
export function areasNoteHTML(holder, pair) {
  const diff = pair ? areasMismatch(pair.a, pair.b) : null;
  const id = 'areas-warn';
  const asked = !!diff && !String((holder && holder.areasNote) || '').trim();

  return `<div class="areas-note${asked ? ' warn' : ''}" data-areas-note-box>
<p class="areas-warn" id="${id}" data-areas-warn ${diff ? '' : 'hidden'}>${
    diff ? areasWarnText(diff, pair.labelA, pair.labelB) : ''}</p>
<div class="field">
<label for="areas-note-input">Комментарий к площадям</label>
<textarea class="input areas-note-input" id="areas-note-input" data-areas-note rows="2"
  aria-describedby="${id}"
  placeholder="Чем объясняется расхождение площадей, что уточнить при осмотре">${
    String(holder && holder.areasNote || '').replace(/[&<>]/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</textarea>
</div>
</div>`;
}

// Высота поля по содержимому — и вверх, и вниз (требование пользователя
// 11.09.2026). Считаем от scrollHeight, предварительно сбросив высоту: без
// сброса поле умеет только расти, потому что scrollHeight никогда не станет
// меньше текущей высоты.
export function autoGrow(el) {
  if (!el) return;
  const cs = getComputedStyle(el);

  // line-height часто вычисляется как «normal» — из него число не достать.
  // Тогда берём полтора кегля: это и есть обычная строка текста.
  const line = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5 || 18;
  const pads = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
    + (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);

  // Сброс обязателен: scrollHeight никогда не меньше текущей высоты, и без
  // сброса поле умело бы только расти.
  el.style.height = 'auto';

  // Минимум — две строки, как было у поля с rows="2": пустое поле не должно
  // схлопываться в одну строчку и прыгать при первом же символе.
  el.style.height = Math.max(line * 2 + pads, el.scrollHeight) + 'px';
}

// Обновить предупреждение без перерисовки блока: человек как раз вводит
// площади, и перерисовка сбила бы курсор.
export function updateAreasNote(scope, pair) {
  const box = scope.$('[data-areas-note-box]');
  const warn = scope.$('[data-areas-warn]');
  const el = scope.$('[data-areas-note]');
  if (!box || !warn) return;

  const diff = pair ? areasMismatch(pair.a, pair.b) : null;

  // Само расхождение показываем всегда: оно никуда не делось оттого, что его
  // описали. А подсветку поля снимаем, как только комментарий написан —
  // просьба выполнена, и держать поле янтарным незачем.
  const asked = !!diff && !String((el && el.value) || '').trim();
  box.classList.toggle('warn', asked);
  warn.hidden = !diff;
  warn.textContent = diff ? areasWarnText(diff, pair.labelA, pair.labelB) : '';
}

// Привязка поля: авторазмер, запись значения и снятие подсветки, как только
// комментарий появился, — просьба выполнена, держать поле подсвеченным незачем.
export function bindAreasNote(scope, holder, getPair) {
  const el = scope.$('[data-areas-note]');
  if (!el) return;

  autoGrow(el);
  el.addEventListener('input', () => {
    autoGrow(el);
    // Подсветку снимаем сразу, как только человек начал писать: держать её до
    // потери фокуса значит подсвечивать поле, в котором уже пишут.
    updateAreasNote(scope, getPair ? getPair() : null);
  });
  el.onchange = () => {
    holder.areasNote = el.value;
    updateAreasNote(scope, getPair ? getPair() : null);
  };
}
