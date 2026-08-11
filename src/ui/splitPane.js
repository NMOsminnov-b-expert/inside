export function bindSplitPanes() {
  document.querySelectorAll('[data-vsplit]').forEach((sp) => {
    sp.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const split = sp.parentElement;
      const rect = split.getBoundingClientRect();
      const maxVW = Math.min(70, Math.max(25, ((rect.width - 620) / rect.width) * 100));
      const move = (ev) => {
        const pct = ((ev.clientX - rect.left) / rect.width) * 100;
        split.style.setProperty('--vw', Math.min(maxVW, Math.max(25, pct)) + '%');
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  });
}