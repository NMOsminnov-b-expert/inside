// Свой выпадающий список вместо нативного <select>.
//
// Зачем: раскрытый список нативного селекта рисует САМ БРАУЗЕР — ни шрифт, ни
// цвета, ни радиусы макета к нему не применяются, и на разных машинах он
// выглядит по-разному. Свёрнутое поле стилизовать можно (appearance:none и
// стрелка фоном, tokens.css), а раскрытое — нет. Решение пользователя
// 03.09.2026: «селекторы пишем свои и применяем».
//
// Как устроено, и почему именно так: разметку страниц НЕ переписываем. Каждый
// <select class="select"> остаётся в DOM как есть — он становится источником
// правды (значение, опции, disabled) и по-прежнему получает событие change.
// Рядом появляется кнопка с тем же набором классов (поэтому все размеры и
// отступы, заданные страницами для .select, работают без правок) и всплывающий
// список. Отсюда два важных следствия:
//   * весь существующий код (onchange, .value, программная установка значения)
//     продолжает работать, менять пришлось ноль обработчиков;
//   * автопроверки, которые выбирают значение через select_option, тоже
//     продолжают работать — они говорят с настоящим селектом.
//
// Классы с префиксом pick-: имя .dd в макете уже занято меню-кнопками
// (dicts.css), и раскрытый список молча получал от них display:none.
//
// Список рисуется в <body> с position:fixed: поля живут внутри прокручиваемых
// панелей и таблиц, и вложенный список обрезался бы их границами.
import { esc } from './dom.js';

const DONE = 'ddDone';           // dataset-метка: этот select уже обработан
const SEARCH_FROM = 8;           // с какого числа пунктов показывать поиск
let openState = null;            // { menu, btn, native, onDocClick, ... }

// --- построение ------------------------------------------------------------

function optionsOf(select) {
  const out = [];
  Array.from(select.children).forEach((node) => {
    if (node.tagName === 'OPTGROUP') {
      out.push({ group: node.label });
      Array.from(node.children).forEach((o) => out.push(optionOf(o)));
      return;
    }
    if (node.tagName === 'OPTION') out.push(optionOf(node));
  });
  return out;
}

const optionOf = (o) => ({
  value: o.value,
  label: o.textContent.trim(),
  disabled: o.disabled,
});

function labelOf(select) {
  const o = select.options[select.selectedIndex];
  return o ? o.textContent.trim() : '';
}

// Кнопка повторяет классы селекта: страницы задают размеры правилами вида
// `.iall-stale .select` или `.tbl .select`, и они должны действовать на то,
// что человек видит.
function makeButton(select) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = select.className + ' pick-btn';
  btn.setAttribute('data-pick-btn', '');
  btn.disabled = select.disabled;
  if (select.title) btn.title = select.title;
  btn.innerHTML = `<span class="pick-btn-text"></span>`;
  return btn;
}

function syncButton(btn, select) {
  const text = labelOf(select);
  const el = btn.querySelector('.pick-btn-text');
  el.textContent = text || '';
  el.classList.toggle('empty', !select.value && !text);
  btn.disabled = select.disabled;

  // Свою подсказку ставим только если она была у селекта. Дублировать текстом
  // выбранного значения нельзя: подсказка (kernel/overflowTip.js) всплывала бы
  // поверх раскрытого списка и закрывала его первый пункт. Обрезанное значение
  // подсказка и так подхватит сама — по переполнению.
  if (select.title) btn.title = select.title;
  else btn.removeAttribute('title');
}

// --- всплывающий список ----------------------------------------------------

function closeMenu() {
  if (!openState) return;
  const { menu, btn, off } = openState;
  off.forEach((fn) => fn());
  menu.remove();
  btn.classList.remove('pick-open');
  openState = null;
}

export function closeDropdowns() { closeMenu(); }

function place(menu, btn) {
  const r = btn.getBoundingClientRect();
  const gap = 4;
  menu.style.minWidth = r.width + 'px';
  menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8)) + 'px';

  // Вниз, если снизу хватает места; иначе вверх — иначе список у нижнего края
  // экрана открывался бы за пределы окна.
  const h = menu.offsetHeight;
  const below = window.innerHeight - r.bottom - gap;
  if (h <= below || below >= r.top) {
    menu.style.top = (r.bottom + gap) + 'px';
  } else {
    menu.style.top = Math.max(8, r.top - gap - h) + 'px';
  }
}

function openMenu(btn, select) {
  closeMenu();

  const items = optionsOf(select);

  // Поиск появляется у длинных списков: постройки, справочники, люди — там
  // прокручивать десятки пунктов дольше, чем набрать две буквы. У коротких
  // списков строка поиска только мешала бы.
  const searchable = items.filter((it) => it.group === undefined).length > SEARCH_FROM;

  const menu = document.createElement('div');
  menu.className = 'pick-menu';
  menu.setAttribute('role', 'listbox');

  const optionsHTML = (q) => items.map((it, i) => {
    if (it.group !== undefined) return `<div class="pick-group">${esc(it.group)}</div>`;
    if (q && !it.label.toLowerCase().includes(q)) return '';
    const on = it.value === select.value;
    return `<div class="pick-opt ${on ? 'on' : ''} ${it.disabled ? 'off' : ''}"
      role="option" data-pick-i="${i}" title="${esc(it.label)}">${esc(it.label) || '&nbsp;'}</div>`;
  }).join('');

  menu.innerHTML = (searchable
    ? '<input class="pick-search" data-pick-search placeholder="Найти…" autocomplete="off">'
    : '') + `<div class="pick-list" data-pick-list>${optionsHTML('')}</div>`;

  document.body.appendChild(menu);
  place(menu, btn);
  btn.classList.add('pick-open');
  // Подсказка, всплывшая от наведения на кнопку, перекрыла бы первый пункт.
  document.querySelectorAll('.ov-tip').forEach((t) => t.remove());

  let opts = Array.from(menu.querySelectorAll('.pick-opt:not(.off)'));
  let cursor = opts.findIndex((el) => el.classList.contains('on'));
  if (cursor < 0) cursor = 0;

  const mark = () => {
    opts.forEach((el, i) => el.classList.toggle('cursor', i === cursor));
    const el = opts[cursor];
    if (el) el.scrollIntoView({ block: 'nearest' });
  };
  mark();

  const search = menu.querySelector('[data-pick-search]');
  if (search) {
    search.oninput = () => {
      const list = menu.querySelector('[data-pick-list]');
      list.innerHTML = optionsHTML(search.value.trim().toLowerCase());
      opts = Array.from(menu.querySelectorAll('.pick-opt:not(.off)'));
      cursor = 0;
      mark();
    };
    // Фокус в поиск сразу: список открывают, чтобы найти нужное.
    setTimeout(() => search.focus(), 0);
  }

  const pick = (el) => {
    const it = items[+el.dataset.pickI];
    if (!it || it.disabled) return;
    if (select.value !== it.value) {
      select.value = it.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    closeMenu();
    btn.focus();
  };

  menu.addEventListener('mousedown', (e) => {
    const el = e.target.closest('.pick-opt');
    if (!el || el.classList.contains('off')) return;
    e.preventDefault();
    pick(el);
  });

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(); btn.focus(); return; }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (opts[cursor]) pick(opts[cursor]);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      cursor = Math.max(0, Math.min(opts.length - 1, cursor + (e.key === 'ArrowDown' ? 1 : -1)));
      mark();
      return;
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      cursor = e.key === 'Home' ? 0 : opts.length - 1;
      mark();
      return;
    }
    // Пока фокус в поиске, буквы набираются в него, а не листают список.
    if (search && document.activeElement === search) return;

    // Набор букв — переход к первому подходящему пункту, как в нативном списке.
    if (e.key.length === 1) {
      const q = e.key.toLowerCase();
      const from = (cursor + 1) % opts.length;
      for (let k = 0; k < opts.length; k++) {
        const i = (from + k) % opts.length;
        if (opts[i].textContent.trim().toLowerCase().startsWith(q)) { cursor = i; mark(); break; }
      }
    }
  };

  const onDocDown = (e) => {
    if (menu.contains(e.target) || btn.contains(e.target)) return;
    closeMenu();
  };
  const onScroll = (e) => {
    // Прокрутка внутри самого списка его не закрывает.
    if (menu.contains(e.target)) return;
    closeMenu();
  };
  const onResize = () => closeMenu();

  document.addEventListener('keydown', onKey, true);
  document.addEventListener('mousedown', onDocDown, true);
  document.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onResize);

  openState = {
    menu, btn, native: select,
    off: [
      () => document.removeEventListener('keydown', onKey, true),
      () => document.removeEventListener('mousedown', onDocDown, true),
      () => document.removeEventListener('scroll', onScroll, true),
      () => window.removeEventListener('resize', onResize),
    ],
  };
}

// --- прокачка --------------------------------------------------------------

function upgrade(select) {
  select.dataset[DONE] = '1';

  const wrap = document.createElement('span');
  wrap.className = 'pick';
  select.parentNode.insertBefore(wrap, select);

  const btn = makeButton(select);
  // Настоящий селект остаётся в DOM — он источник значения и получатель
  // change. Класс .select с него снимаем: оформление теперь на кнопке.
  select.className = 'pick-native';
  wrap.appendChild(select);
  wrap.appendChild(btn);
  syncButton(btn, select);

  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (btn.disabled) return;
    if (openState && openState.btn === btn) closeMenu();
    else openMenu(btn, select);
  });

  btn.addEventListener('keydown', (e) => {
    if (btn.disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openMenu(btn, select);
    }
  });

  // Значение могли поменять и мимо списка — программно или через
  // select_option в автопроверках. Подпись обязана это увидеть.
  select.addEventListener('change', () => syncButton(btn, select));
}

// Прокачать все нативные списки внутри корня. Зовётся из scope.setHTML и из
// модальных окон — то есть после каждой отрисовки, автоматически.
export function enhanceSelects(root) {
  if (!root || !root.querySelectorAll) return;
  closeMenu();
  root.querySelectorAll('select.select').forEach((s) => {
    if (!s.dataset[DONE]) upgrade(s);
  });
}

// Частичные перерисовки (модальные окна, обновление одной таблицы внутри
// карточки) не проходят через scope.setHTML, поэтому за появлением новых
// списков следит наблюдатель. Обработка отложена в микрозадачу: за одну
// перерисовку добавляются десятки узлов, а пройтись достаточно один раз.
let watching = false;

export function installSelectWatcher() {
  if (watching || typeof MutationObserver !== 'function') return;
  watching = true;

  let queued = false;
  const observer = new MutationObserver((records) => {
    if (queued) return;
    const touched = records.some((r) => r.addedNodes.length);
    if (!touched) return;
    queued = true;
    Promise.resolve().then(() => {
      queued = false;
      document.querySelectorAll('select.select').forEach((s) => {
        if (!s.dataset[DONE]) upgrade(s);
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
}
