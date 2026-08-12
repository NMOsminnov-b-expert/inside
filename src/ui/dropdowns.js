import { appState } from '../core/state.js';

// Глобальное закрытие выпадающих списков при клике вне них.
export function initDropdownGlobals() {
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dd')) {
      document.querySelectorAll('.dd.open').forEach((d) => d.classList.remove('open'));
    }

    if (!e.target.closest('.ms')) {
      document.querySelectorAll('.ms-drop').forEach((d) => d.hidden = true);
      appState.heatOpen = false;
    }
  });
}

// Перерендериваемые toggle-кнопки дропдаунов.
export function bindDropdownToggles() {
  document.querySelectorAll('[data-dd-toggle]').forEach((b) => {
    b.onclick = () => {
      const dd = b.closest('.dd');

      if (!dd) {
        return;
      }

      const wasOpen = dd.classList.contains('open');

      document.querySelectorAll('.dd.open').forEach((d) => d.classList.remove('open'));

      if (!wasOpen) {
        dd.classList.add('open');
      }
    };
  });
}