import { esc } from '../../../../kernel/dom.js';

// Контекстное меню просмотрщика (правая кнопка мыши, Shift+F10, клавиша меню).
//
// Практики (граф: practice:rabota-s-dokumentami-v-prosmotrshchike): в меню —
// второстепенные действия, сгруппированные по смыслу; у пункта подписана
// клавиша, так ей и учатся; меню полностью работает с клавиатуры — стрелки,
// Home/End, Enter, Esc и переход по первой букве; фокус возвращается туда,
// откуда меню открыли (NN/g, Height, UXPin).
//
// Меню рисуется в документе того окна, где по нему щёлкнули: просмотрщик
// бывает и в отдельном окне (popout.js).
//
// items: [{ label, keys?, action?, disabled?, danger?, checked? } | { sep: true }]

let open = null;

export function closeMenu() {
  if (!open) return;
  const { el, restore, doc, off } = open;
  open = null;
  off();
  el.remove();
  if (restore && restore.isConnected && doc.contains(restore)) restore.focus();
}

export function showMenu(doc, x, y, items, restoreFocus) {
  closeMenu();
  const list = items.filter((it, i, a) => !(it.sep && (i === 0 || i === a.length - 1 || a[i - 1].sep)));
  if (!list.some((it) => !it.sep)) return;

  const el = doc.createElement('div');
  el.className = 'vmenu';
  el.setAttribute('role', 'menu');
  el.innerHTML = list.map((it, i) => (it.sep
    ? '<div class="vmenu-sep" role="separator"></div>'
    : `<button type="button" role="menuitem" class="vmenu-item ${it.danger ? 'danger' : ''}" data-i="${i}"
        ${it.disabled ? 'aria-disabled="true" disabled' : ''} tabindex="-1">
        <span class="vmenu-check" aria-hidden="true">${it.checked ? '✓' : ''}</span>
        <span class="vmenu-label">${esc(it.label)}</span>
        ${it.keys ? `<kbd class="vmenu-keys">${esc(it.keys)}</kbd>` : ''}
      </button>`)).join('');
  doc.body.appendChild(el);

  // В границах окна: у правого и нижнего края меню разворачивается внутрь.
  const win = doc.defaultView;
  const r = el.getBoundingClientRect();
  el.style.left = Math.max(4, Math.min(x, win.innerWidth - r.width - 4)) + 'px';
  el.style.top = Math.max(4, Math.min(y, win.innerHeight - r.height - 4)) + 'px';

  const buttons = () => Array.from(el.querySelectorAll('.vmenu-item:not([disabled])'));
  const focusAt = (i) => { const b = buttons(); if (b.length) b[(i + b.length) % b.length].focus(); };

  const run = (btn) => {
    const it = list[+btn.dataset.i];
    closeMenu();
    if (it && it.action) it.action();
  };

  el.addEventListener('click', (e) => {
    const btn = e.target.closest('.vmenu-item');
    if (btn && !btn.disabled) run(btn);
  });

  el.addEventListener('keydown', (e) => {
    const b = buttons();
    const at = b.indexOf(doc.activeElement);
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); focusAt(at + 1); break;
      case 'ArrowUp': e.preventDefault(); focusAt(at - 1); break;
      case 'Home': e.preventDefault(); focusAt(0); break;
      case 'End': e.preventDefault(); focusAt(b.length - 1); break;
      case 'Escape': case 'Tab': e.preventDefault(); closeMenu(); break;
      case 'Enter': case ' ':
        e.preventDefault();
        if (at >= 0) run(b[at]);
        break;
      default:
        // Переход по первой букве пункта.
        if (e.key.length === 1) {
          const ch = e.key.toLowerCase();
          const from = at + 1;
          const hit = b.slice(from).concat(b.slice(0, from))
            .find((x) => x.querySelector('.vmenu-label').textContent.trim().toLowerCase().startsWith(ch));
          if (hit) hit.focus();
        }
    }
    e.stopPropagation();
  });

  const outside = (e) => { if (!el.contains(e.target)) closeMenu(); };
  // Закрывается щелчком мимо, Esc и сменой размера окна. По уходу фокуса с
  // окна — нет: окно теряет фокус и без действий человека (второй монитор,
  // всплывшее уведомление), и меню пропадало бы из-под курсора.
  const onResize = () => closeMenu();
  doc.addEventListener('mousedown', outside, true);
  win.addEventListener('resize', onResize);
  const off = () => {
    doc.removeEventListener('mousedown', outside, true);
    win.removeEventListener('resize', onResize);
  };

  open = { el, restore: restoreFocus || doc.activeElement, doc, off };
  focusAt(0);
}
