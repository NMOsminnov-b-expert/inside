// Модуль подключает свой CSS сам, один раз за сессию.
const loaded = new Set();

export function ensureStyle(href) {
  if (loaded.has(href)) return Promise.resolve();
  loaded.add(href);

  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.moduleStyle = href;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
}
