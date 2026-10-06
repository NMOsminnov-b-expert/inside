// Поле со свободной записью и своим списком подсказок — вместо <datalist>.
//
// Указание пользователя 06.10.2026 по «Тип ТС, вид кузова»: «заменить выпадающий
// блок на аналогичный категории по техпаспорту, что бы не уезжал и не оставался
// вечно открытым». Список подсказок <datalist> рисует браузер: при прокрутке
// он отрывается от поля, а закрывается не всегда. Здесь — тот же вид и то же
// поведение, что у своих выпадающих списков (kernel/dropdown.js, классы pick-):
// список в <body> с position:fixed у поля, вниз или вверх — где хватает места,
// закрывается уходом из поля, Esc, прокруткой страницы и сменой размера окна.
// Запись остаётся свободной: подсказка лишь подставляет текст.
//
// Разметка: <input data-suggest='["вариант", …]'> — варианты в JSON.
// installSuggest(root) подключает все такие поля внутри root; выбор подсказки
// ставит значение и шлёт input и change, как ручной ввод.
import { esc } from './dom.js';

const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');

let current = null; // { menu, input, off: [] }

function close() {
  if (!current) return;
  current.off.forEach((fn) => fn());
  current.menu.remove();
  current.input.setAttribute('aria-expanded', 'false');
  current = null;
}

function place(menu, input) {
  const r = input.getBoundingClientRect();
  const gap = 4;
  menu.style.minWidth = r.width + 'px';
  menu.style.maxWidth = Math.max(r.width, 260) + 'px';
  menu.style.left = Math.max(8, Math.min(r.left, innerWidth - r.width - 8)) + 'px';
  const h = menu.offsetHeight;
  const below = innerHeight - r.bottom - gap;
  menu.style.top = (h <= below || below >= r.top ? r.bottom + gap : Math.max(8, r.top - gap - h)) + 'px';
}

function open(input) {
  const all = JSON.parse(input.dataset.suggest || '[]');
  const q = norm(input.value).trim();
  // Пока поле пустое или запись совпадает с подсказкой — весь список; при
  // наборе — подсказки, где есть набранное, первыми те, что с него начинаются.
  const exact = all.some((o) => norm(o) === q);
  const list = !q || exact ? all
    : all.filter((o) => norm(o).includes(q)).sort((a, b) => norm(b).startsWith(q) - norm(a).startsWith(q));
  if (!list.length) { close(); return; }

  if (!current || current.input !== input) {
    close();
    const menu = document.createElement('div');
    menu.className = 'pick-menu';
    menu.setAttribute('role', 'listbox');
    document.body.appendChild(menu);
    const onDown = (e) => { if (!menu.contains(e.target) && e.target !== input) close(); };
    const onScroll = (e) => { if (!menu.contains(e.target)) close(); };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    current = { menu, input, cursor: -1, off: [
      () => document.removeEventListener('mousedown', onDown, true),
      () => document.removeEventListener('scroll', onScroll, true),
      () => window.removeEventListener('resize', close),
    ] };
    // Выбор мышью: mousedown, чтобы поле не потеряло фокус раньше выбора.
    menu.addEventListener('mousedown', (e) => {
      const el = e.target.closest('[data-sg-i]');
      if (!el) return;
      e.preventDefault();
      pick(current.items[+el.dataset.sgI]);
    });
  }
  current.items = list;
  current.cursor = -1;
  current.menu.innerHTML = `<div class="pick-list">${list.map((o, i) => `<div class="pick-opt ${norm(o) === q ? 'on' : ''}"
    role="option" data-sg-i="${i}">${esc(o)}</div>`).join('')}</div>`;
  input.setAttribute('aria-expanded', 'true');
  place(current.menu, input);
}

function pick(value) {
  if (!current) return;
  const input = current.input;
  close();
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function move(step) {
  if (!current) return;
  const opts = current.menu.querySelectorAll('.pick-opt');
  if (!opts.length) return;
  current.cursor = (current.cursor + step + opts.length) % opts.length;
  opts.forEach((el, i) => el.classList.toggle('cursor', i === current.cursor));
  opts[current.cursor].scrollIntoView({ block: 'nearest' });
}

export function installSuggest(root) {
  (root || document).querySelectorAll('input[data-suggest]').forEach((input) => {
    if (input.dataset.sgDone) return;
    input.dataset.sgDone = '1';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('autocomplete', 'off');
    input.addEventListener('focus', () => open(input));
    input.addEventListener('click', () => { if (!current) open(input); });
    input.addEventListener('input', () => { if (document.activeElement === input) open(input); });
    input.addEventListener('blur', () => { if (current && current.input === input) close(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!current) open(input);
        move(e.key === 'ArrowDown' ? 1 : -1);
      } else if (e.key === 'Enter' && current && current.cursor >= 0) {
        e.preventDefault();
        pick(current.items[current.cursor]);
      } else if (e.key === 'Escape' && current) {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    });
  });
}
