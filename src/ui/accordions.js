import { appState } from '../core/state.js';

// Глобальные делегированные переключатели аккордеонов и сворачивания карточек.
export function initAccordions() {
  document.addEventListener('click', (e) => {
    const ah = e.target.closest('[data-acc-toggle]');

    if (
      ah
      && !e.target.closest('button')
      && !e.target.closest('input')
      && !e.target.closest('select')
      && !e.target.closest('.dd')
    ) {
      e.stopPropagation();

      const acc = ah.closest('.acc');

      if (acc) {
        acc.classList.toggle('open');
        appState.accOpen[ah.dataset.accToggle] = acc.classList.contains('open');
      }

      return;
    }

    const ch = e.target.closest('[data-card-toggle]');

    if (
      ch
      && !e.target.closest('button')
      && !e.target.closest('input')
      && !e.target.closest('select')
      && !e.target.closest('.dd')
    ) {
      e.stopPropagation();

      ch.closest('.card').classList.toggle('collapsed');
    }
  });
}