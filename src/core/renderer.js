// Реестр функции рендера: контроллеры вызывают render(),
// не импортируя app.js напрямую (снимает циклические зависимости).
let renderFn = null;
export function registerRenderer(fn) { renderFn = fn; }
export function render() { if (renderFn) renderFn(); }

// Перерисовка при изменении определяющих полей без прыжка скролла.
export function renderKeepScroll() {
  const sc = document.getElementById('content');
  const top = sc ? sc.scrollTop : 0;
  // Полный рендер, чтобы правила из oiFieldRules и oiVerbal
  // пересчитались во всех местах: карточка, плашки, аккордеоны.
  render();
  if (sc) sc.scrollTop = top;
}