// Модуль подключает свой CSS сам, один раз за сессию.
//
// Хранится обещание загрузки, а не отметка «уже подключён»: отметка ставилась
// до onload, и повторный вызов, пока файл грузится (быстрый переход A→B→A),
// разрешался сразу — разметка рисовалась без стилей (код-ревью 09.10.2026).
const loading = new Map();

export function ensureStyle(href) {
  if (loading.has(href)) return loading.get(href);

  const done = new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.moduleStyle = href;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
  loading.set(href, done);
  return done;
}
