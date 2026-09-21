import { VS } from './state.js';
import { ICON_FIT_WIDTH, ICON_FIT_PAGE, ICON_ROTATE } from './icons.js';

// Общие группы панели — одинаковые у документа и фото.

// Листание: «‹ n / N ›».
export function pagerHTML(page, total) {
  return `<div class="tool-group">
    <button class="tool-btn" data-vprev title="Предыдущая (←)" aria-label="Предыдущая">‹</button>
    <input class="page-input" data-vpage value="${page}" aria-label="Номер страницы"><span class="muted">/ ${total}</span>
    <button class="tool-btn" data-vnext title="Следующая (→)" aria-label="Следующая">›</button>
  </div>`;
}

// Масштаб: «−  100%  +» и два режима вписывания. 100% — это выбранный режим
// («по ширине» или «целиком»), поэтому, нажав режим, человек сразу видит лист
// так, как ему нужно, а «+» и «−» дальше увеличивают от этого.
export function zoomHTML(fitKey) {
  const fit = VS.fit[fitKey];
  return `<div class="tool-group">
    <button class="tool-btn" data-vzoom- title="Уменьшить (−)" aria-label="Уменьшить">−</button>
    <span class="zoom-label" data-zoomlabel title="Масштаб; 0 — вернуть 100%">${VS.zoom}%</span>
    <button class="tool-btn" data-vzoom+ title="Увеличить (+)" aria-label="Увеличить">+</button>
    <button class="tool-btn ${fit === 'width' ? 'on' : ''}" data-vfit="width" aria-pressed="${fit === 'width'}"
      title="По ширине (W)">${ICON_FIT_WIDTH}</button>
    <button class="tool-btn ${fit === 'page' ? 'on' : ''}" data-vfit="page" aria-pressed="${fit === 'page'}"
      title="Страница целиком (P)">${ICON_FIT_PAGE}</button>
  </div>`;
}

export function rotateHTML() {
  return `<div class="tool-group"><button class="tool-btn" data-vrot title="Повернуть (Ctrl+Alt+R)"
    aria-label="Повернуть">${ICON_ROTATE}</button></div>`;
}
