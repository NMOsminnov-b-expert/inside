// Выбор одного значения из длинного списка — с поиском.
//
// Замечание пользователя 05.09.2026: учреждение и подвед в формах объекта
// оценки были обычными текстовыми полями. Название приходилось помнить и
// набирать целиком; опечатка создавала «новое» учреждение, которого нет в
// дереве, и запись выпадала из фильтров и из раздела «Учреждения».
//
// Отличие от мультивыбора (kernel/multiSelect.js): здесь выбирается ровно одно
// значение, поэтому строки — кнопки, а не флажки, и список закрывается сразу
// после выбора. Поиск устроен так же — скрытием отрисованных строк, чтобы не
// терять фокус и набранный текст.
import { esc } from './dom.js';

// value — выбранное значение, options — перечень.
// Пустое значение показывается приглашением, а не пустотой: поле с выбором и
// пустое текстовое поле выглядят одинаково, и человек не понимает, где щёлкать.
export function pickSearchHTML({ key, value, options, placeholder = 'Не выбрано', search = 'Поиск…' }) {
  const list = (options || []).filter(Boolean);
  const cur = String(value == null ? '' : value);

  const row = (v) => `<button type="button" class="ps-opt ${v === cur ? 'on' : ''}"
    data-ps-opt="${esc(key)}" data-ps-value="${esc(v)}">${esc(v)}</button>`;

  return `<div class="ms ps" data-ps="${esc(key)}">
    <div class="ms-control" data-ps-toggle title="Открыть список">
      ${cur
    ? `<span class="ms-summary" title="${esc(cur)}">${esc(cur)}</span>`
    : `<span class="muted">${esc(placeholder)}</span>`}
      <span class="chev">▾</span>
    </div>
    <div class="ms-drop" hidden>
      <div class="ms-search-wrap">
        <input class="input ms-search" data-ps-search placeholder="${esc(search)}" autocomplete="off">
      </div>
      <div data-ps-list>
        ${list.length ? list.map(row).join('')
    : '<div class="muted" style="padding:4px 9px">Список пуст</div>'}
      </div>
      <div class="muted ps-nores" hidden style="padding:4px 9px">Ничего не найдено</div>
      ${cur ? `<button type="button" class="ps-clear" data-ps-clear="${esc(key)}">Очистить</button>` : ''}
    </div>
  </div>`;
}

// onPick(value) — выбранное значение или '' при очистке. Возврат false отменяет
// закрытие списка (нужно, когда выбор перерисовывает форму целиком).
export function bindPickSearch(scope, key, onPick) {
  const box = scope.$(`[data-ps="${key}"]`);
  if (!box) return;

  const drop = box.querySelector('.ms-drop');
  const toggle = box.querySelector('[data-ps-toggle]');
  const search = box.querySelector('[data-ps-search]');

  const close = () => { drop.hidden = true; };

  toggle.onclick = (e) => {
    e.stopPropagation();
    // Открытым может быть только один список: иначе они перекрывают друг друга.
    scope.$$('.ps .ms-drop').forEach((d) => { if (d !== drop) d.hidden = true; });
    drop.hidden = !drop.hidden;
    if (!drop.hidden && search) { search.value = ''; filter(''); search.focus(); }
  };

  // Клик мимо закрывает список. Слушатель живёт на документе через scope —
  // он снимается сам при уходе с экрана (kernel/scope.js).
  scope.onDocument('click', (e) => {
    if (!box.contains(e.target)) close();
  });

  function filter(q) {
    const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    box.querySelectorAll('[data-ps-opt]').forEach((el) => {
      const hay = el.textContent.toLowerCase();
      const ok = words.every((w) => hay.includes(w));
      el.hidden = !ok;
      if (ok) shown++;
    });
    const none = box.querySelector('.ps-nores');
    if (none) none.hidden = shown > 0;
  }

  if (search) search.oninput = () => filter(search.value);

  box.querySelectorAll('[data-ps-opt]').forEach((el) => el.onclick = (e) => {
    e.stopPropagation();
    if (onPick(el.dataset.psValue) !== false) close();
  });

  const clear = box.querySelector('[data-ps-clear]');
  if (clear) clear.onclick = (e) => {
    e.stopPropagation();
    if (onPick('') !== false) close();
  };
}
