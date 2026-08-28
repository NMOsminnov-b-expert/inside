// Общая часть всех мультивыборов: поиск по значениям + деление на
// «Выбрано / Не выбрано».
//
// Мультивыборов в проекте уже четыре вида — конструктивный состав, отопление,
// инженерное оснащение участка, температурный режим, — и у каждого своя
// разметка опции (свой data-атрибут). Общим у них остаётся ровно две вещи:
// как выглядит тело выпадающего списка и как работает поиск. Их и держим здесь,
// чтобы поиск не пришлось четырежды чинить.
//
// Правило поиска задано пользователем 28.08.2026: ВЫБРАННЫЕ видны всегда все,
// фильтруются только невыбранные. Иначе, набрав запрос, человек теряет из виду
// то, что уже отметил, и не понимает, что у него в поле.
import { esc } from './dom.js';

// optAttr — имя data-атрибута опции без «data-» (например 'struct-opt').
// Значение атрибута собирает сам вызывающий: у состава это «ключ|значение».
export function msDropBodyHTML({ options, selected, optAttr, value }) {
  const sel = options.filter((o) => selected.includes(o));
  const rest = options.filter((o) => !selected.includes(o));

  const row = (v, checked) => `<label class="ms-opt" data-ms-row="${esc(v)}">
    <input type="checkbox" data-${optAttr}="${esc(value ? value(v) : v)}" ${checked ? 'checked' : ''}>${esc(v)}</label>`;

  return `<div class="ms-search-wrap">
    <input class="input ms-search" data-ms-search placeholder="Поиск по списку…" autocomplete="off">
  </div>
  <div class="dd-group">Выбрано${sel.length ? ` (${sel.length})` : ''}</div>
  ${sel.length ? sel.map((o) => row(o, true)).join('') : '<div class="muted" style="padding:4px 9px">Ничего не выбрано</div>'}
  <div class="dd-group" data-ms-rest-head>Не выбрано</div>
  <div data-ms-rest>${rest.length ? rest.map((o) => row(o, false)).join('') : '<div class="muted" style="padding:4px 9px">Выбрано всё</div>'}</div>
  <div class="muted ms-nores" hidden style="padding:4px 9px">Ничего не найдено</div>`;
}

// Поиск работает скрытием уже отрисованных строк, а не перерисовкой списка:
// перерисовка стёрла бы само поле ввода вместе с фокусом и набранным текстом.
export function bindMsSearch(dropEl) {
  if (!dropEl) return;
  const input = dropEl.querySelector('[data-ms-search]');
  if (!input) return;

  input.onclick = (e) => e.stopPropagation();

  input.oninput = () => {
    const q = input.value.trim().toLowerCase();
    const rest = dropEl.querySelector('[data-ms-rest]');
    if (!rest) return;

    let shown = 0;
    rest.querySelectorAll('[data-ms-row]').forEach((row) => {
      const hit = !q || row.dataset.msRow.toLowerCase().includes(q);
      row.hidden = !hit;
      if (hit) shown++;
    });

    const none = dropEl.querySelector('.ms-nores');
    if (none) none.hidden = !q || shown > 0;
  };
}
