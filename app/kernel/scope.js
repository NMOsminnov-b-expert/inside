import { enhanceSelects, unwrapSelects } from './dropdown.js';
import { enhanceMsDrops } from './msDrop.js';
import { morphInto } from './morph.js';

// Скоуп DOM: всё, что делает экран, ищется ТОЛЬКО внутри своего корня.
// Это то, что позволяет держать на странице несколько карточек одновременно
// и не ловить чужие элементы через document.querySelector.
//
// opts.morph — перерисовка сверкой дерева, а не заменой (kernel/morph.js):
// узлы, которые не изменились, остаются теми же, поле сохраняет фокус и
// каретку, блоки — прокрутку. Включено у экранов модулей (карточки ОЦ и ОИ,
// kernel/boot.js); остальные экраны пока рисуют заменой целиком.
export function createScope(rootEl, opts = {}) {
  let root = rootEl;
  const off = [];

  const scope = {
    root,

    $: (sel) => root.querySelector(sel),
    $$: (sel) => Array.from(root.querySelectorAll(sel)),

    setHTML(html) {
      if (opts.morph) morphInto(root, html, unwrapSelects);
      else root.innerHTML = html;
      // Нативные списки заменяются своими сразу после отрисовки — одной точкой
      // на весь макет, поэтому разметку страниц менять не пришлось.
      enhanceSelects(root);
      // Тем же одним касанием — всплытие открытых мультивыборов: иначе список
      // материалов обрезается ячейкой таблицы «Конструктив и износ» (см.
      // msDrop.js).
      enhanceMsDrops(root);
      // Отрисовка — повод сохранить: правка после выбора файла или по Enter не
      // даёт событий, которые слушает kernel/persist.js (код-ревью 09.10.2026).
      document.dispatchEvent(new Event('inside:rendered'));
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

    // После разбора область переключается на отсоединённый элемент. Экран
    // уходил, а его асинхронная отрисовка (модуль ждал загрузку карточки ОИ)
    // заканчивалась позже и рисовала старую карточку поверх нового экрана —
    // корень у всех экранов один (#content). Теперь запоздавший код рисует и
    // ищет в пустом отсоединённом узле и никого не задевает (найдено на
    // проверках 09.10.2026: переход из карточки литеры в «Учреждения»
    // показывал карточку литеры).
    destroy() {
      off.splice(0).forEach((fn) => fn());
      root.innerHTML = '';
      root = document.createElement('div');
      scope.root = root;
    },
  };

  return scope;
}
