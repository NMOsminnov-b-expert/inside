// Год и дата — единый компонент на весь проект (Л2.3, Л2.4).
//
// Почему в ядре: поле года есть во всех карточках ОИ всех пяти модулей, а
// требования к нему одинаковые и неочевидные — их легко потерять при копировании.
//
// Требования, ради которых компонент и заведён:
//   * ввод с клавиатуры, а не только выбор мышью;
//   * КОЛЁСИКО МЫШИ НЕ МЕНЯЕТ ЗНАЧЕНИЕ. Прямое требование: у обычного
//     <input type="number"> прокрутка страницы над полем незаметно правит год;
//   * валидация: только цифры, разумный диапазон, подсветка ошибки;
//   * годов может быть несколько — здание достраивали и перестраивали (Л2.4).
//
// Несколько годов пишутся ПЕРЕЧИСЛЕНИЕМ В ОДНОМ ПОЛЕ, через запятую (решение
// пользователя 2026-08-28). До этого каждый год был отдельной строкой с кнопкой
// «+» и крестиком: строки занимали высоту, а сравнить «1998, 2014» глазами было
// нельзя. В календаре тот же список — множественный выбор, отмеченные годы
// подсвечены, повторный клик снимает.
import { esc } from './dom.js';

const MIN_YEAR = 1800;

// Иконка календаря — тонкий контур в стиле макета, а не эмодзи: эмодзи
// рисуется цветным шрифтом системы и выбивается из оформления.
const CAL_ICON = `<svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true">
  <rect x="1.5" y="2.5" width="11" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/>
  <path d="M1.5 5.5h11M4.5 1.5v2M9.5 1.5v2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
</svg>`;

// Верхняя граница — текущий год: дом не может быть построен в будущем.
const maxYear = () => new Date().getFullYear();

// Год в данных может лежать одним значением (так было до Л2.4) или списком.
// Читаем всегда списком, чтобы старые записи не падали.
export function yearList(oi, key = 'year') {
  const v = oi && oi[key];
  if (Array.isArray(v)) return v.filter((x) => String(x).trim());
  return v ? [String(v)] : [];
}

// Значение для показа в одну строку — оно же содержимое самого поля.
export const yearSummary = (oi, key = 'year') => yearList(oi, key).join(', ');

// Разбор введённой строки: «1998, 2014» → ['1998', '2014']. Пустые куски
// отбрасываем — иначе висящая запятая давала бы пустой год.
export function parseYears(text) {
  return String(text || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

// Ошибка по всему полю: сообщаем про первый непорядок, а не про каждый год —
// иначе под полем вырастает список.
export function yearsError(text) {
  const list = parseYears(text);
  for (const y of list) {
    if (!/^\d{4}$/.test(y)) return `«${y}» — год должен быть из четырёх цифр`;
    const n = +y;
    if (n < MIN_YEAR) return `${y} — не раньше ${MIN_YEAR}`;
    if (n > maxYear()) return `${y} — не позже ${maxYear()}`;
  }
  const dup = list.find((y, i) => list.indexOf(y) !== i);
  return dup ? `${dup} указан дважды` : '';
}

// Выбор года мышью — страницами по 12 лет, а не одним списком: годов от 1800
// до текущего больше двухсот, и прокручивать их — мучение. Страница
// открывается на десятилетии последнего указанного года.
const PAGE = 12;

const pageStart = (list) => {
  const last = list.length ? list[list.length - 1] : '';
  const base = /^\d{4}$/.test(String(last)) ? +last : maxYear();
  return Math.floor(base / PAGE) * PAGE;
};

export function pickBodyHTML(key, list, from) {
  const years = [];
  for (let y = from; y < from + PAGE; y++) {
    if (y >= MIN_YEAR && y <= maxYear()) years.push(y);
  }

  return `<div class="yf-pick-head">
      <button class="yf-pick-nav" data-year-page="${esc(key)}|${from - PAGE}"
        ${from - PAGE < MIN_YEAR ? 'disabled' : ''} title="Раньше">‹</button>
      <span class="yf-pick-range">${from}—${Math.min(from + PAGE - 1, maxYear())}</span>
      <button class="yf-pick-nav" data-year-page="${esc(key)}|${from + PAGE}"
        ${from + PAGE > maxYear() ? 'disabled' : ''} title="Позже">›</button>
    </div>
    <div class="yf-pick-grid">
      ${years.map((y) => `<button class="yf-pick-y ${list.includes(String(y)) ? 'on' : ''}"
        data-year-set="${esc(key)}|${y}" title="${list.includes(String(y)) ? 'Убрать год' : 'Добавить год'}">${y}</button>`).join('')}
    </div>
    <div class="yf-pick-foot">Отмечайте несколько лет — они попадут в поле через запятую.</div>`;
}

// label — подпись поля; key — имя поля записи (обычно 'year').
export function yearFieldHTML(oi, label, key = 'year') {
  const list = yearList(oi, key);
  const text = list.join(', ');
  const err = yearsError(text);

  return `<div class="field yf" data-year-field="${esc(key)}">
    <label>${label}</label>
    <span class="yf-ctl">
      <input class="input yf-input ${err ? 'yf-bad' : ''}" data-year-input="${esc(key)}"
        value="${esc(text)}" inputmode="numeric"
        placeholder="ГГГГ, ГГГГ"
        title="Несколько лет — через запятую: здание могли достраивать">
      <button class="yf-cal" data-year-cal="${esc(key)}" title="Выбрать годы в календаре">${CAL_ICON}</button>
      <div class="yf-pick" data-year-pick="${esc(key)}" hidden>${pickBodyHTML(key, list, pageStart(list))}</div>
    </span>
    <span class="yf-err" data-year-err>${esc(err)}</span>
  </div>`;
}

// Слушатели вешаются ПРЯМО на элементы, а не делегированием на скоуп: карточка
// перепривязывается на каждой отрисовке, и делегированные слушатели копились бы
// (этим уже отличились заметки, состав и отопление).
export function bindYearField(ctx, oi, key = 'year') {
  const box = ctx.scope.$(`[data-year-field="${key}"]`);
  if (!box) return;

  const input = box.querySelector('[data-year-input]');
  const pick = box.querySelector('[data-year-pick]');
  const errEl = box.querySelector('[data-year-err]');

  // Список годов закрывается кликом мимо. Вешается один раз на скоуп: карточка
  // перепривязывается на каждой отрисовке, а документные слушатели снимаются
  // только при уходе с экрана — иначе копились бы.
  if (!ctx.scope.root.dataset.yearPickBound) {
    ctx.scope.root.dataset.yearPickBound = '1';
    ctx.scope.onDocument('click', (e) => {
      if (e.target.closest('.yf-ctl')) return;
      ctx.scope.$$('[data-year-pick]').forEach((x) => { x.hidden = true; });
    });
  }

  // Единственный источник правды — текст поля: и клавиатура, и календарь
  // пишут в него, а уже из него значение разбирается в данные.
  const commit = (text) => {
    const err = yearsError(text);
    if (errEl) errEl.textContent = err;
    if (input) input.classList.toggle('yf-bad', !!err);
    // В данные кладём даже с ошибкой: иначе набранное пропадало бы при уходе
    // с поля, а исправлять было бы нечего.
    oi[key] = parseYears(text);
  };

  if (input) {
    // Только цифры, запятые и пробелы — правим по ходу набора, чтобы поле
    // нельзя было довести до заведомо неверного вида.
    input.oninput = () => {
      const clean = input.value.replace(/[^\d,\s]/g, '');
      if (clean !== input.value) {
        const pos = input.selectionStart;
        input.value = clean;
        input.setSelectionRange(pos - 1, pos - 1);
      }
      commit(input.value);
      repaintPick();
    };

    // Колёсико над полем не меняет год — оно прокручивает страницу.
    input.onwheel = () => { if (document.activeElement === input) input.blur(); };
    // Стрелками вверх-вниз год тоже не крутим: значение вводят, а не подбирают.
    input.onkeydown = (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); };
  }

  function repaintPick(from) {
    if (!pick) return;
    const list = parseYears(input ? input.value : '');
    const start = from != null ? from : pageStart(list);
    pick.innerHTML = pickBodyHTML(key, list, start);
    bindPick();
  }

  function bindPick() {
    if (!pick) return;

    pick.querySelectorAll('[data-year-page]').forEach((nav) => {
      nav.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        repaintPick(+nav.dataset.yearPage.split('|')[1]);
      };
    });

    // Множественный выбор: клик добавляет год, повторный — убирает. Полного
    // render() здесь нет намеренно — он закрыл бы календарь на первом же клике,
    // а отметить нужно несколько лет подряд.
    pick.querySelectorAll('[data-year-set]').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const y = btn.dataset.yearSet.split('|')[1];
        const list = parseYears(input ? input.value : '');
        const i = list.indexOf(y);
        if (i >= 0) list.splice(i, 1); else list.push(y);
        list.sort((a, b) => +a - +b);

        if (input) input.value = list.join(', ');
        commit(list.join(', '));
        repaintPick(+btn.closest('.yf-pick').querySelector('.yf-pick-range').textContent.split('—')[0]);
      };
    });
  }

  bindPick();

  const cal = box.querySelector('[data-year-cal]');
  if (cal) cal.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    ctx.scope.$$('[data-year-pick]').forEach((x) => { if (x !== pick) x.hidden = true; });
    if (!pick) return;
    if (pick.hidden) repaintPick();
    pick.hidden = !pick.hidden;
  };
}
