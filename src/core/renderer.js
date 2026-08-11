// Реестр функции рендера: контроллеры вызывают render(),
// не импортируя app.js напрямую (снимает циклические зависимости).
let renderFn = null;

export function registerRenderer(fn) { renderFn = fn; }

export function render() { if (renderFn) renderFn(); }