import { enhanceSelects } from './dropdown.js';

// Скоуп DOM: всё, что делает экран, ищется ТОЛЬКО внутри своего корня.
// Это то, что позволяет держать на странице несколько карточек одновременно
// и не ловить чужие элементы через document.querySelector.
export function createScope(root) {
  const off = [];

  const scope = {
    root,

    $: (sel) => root.querySelector(sel),
    $$: (sel) => Array.from(root.querySelectorAll(sel)),

    setHTML(html) {
      root.innerHTML = html;
      // Нативные списки заменяются своими сразу после отрисовки — одной точкой
      // на весь макет, поэтому разметку страниц менять не пришлось.
      enhanceSelects(root);
    },

    // Делегирование внутри корня.
    on(type, selector, handler) {
      const listener = (e) => {
        const target = e.target.closest(selector);
        if (target && root.contains(target)) handler(e, target);
      };
      root.addEventListener(type, listener);
      off.push(() => root.removeEventListener(type, listener));
      return scope;
    },

    // Слушатель на самом корне (например, клик вне элемента внутри экрана).
    onRoot(type, handler) {
      root.addEventListener(type, handler);
      off.push(() => root.removeEventListener(type, handler));
      return scope;
    },

    // Документный слушатель с автоснятием при размонтировании экрана.
    onDocument(type, handler, opts) {
      document.addEventListener(type, handler, opts);
      off.push(() => document.removeEventListener(type, handler, opts));
      return scope;
    },

    destroy() {
      off.splice(0).forEach((fn) => fn());
      root.innerHTML = '';
    },
  };

  return scope;
}
