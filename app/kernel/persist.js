// Сохранение введённых данных между перезагрузками страницы.
//
// Требование пользователя 09.09.2026: «те данные, что вбились, не должны
// пропадать после перезагрузки». До этого всё жило в памяти вкладки, и любое
// обновление страницы возвращало засев — проверить работу на своих данных было
// нельзя.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: здесь данные лежат в localStorage браузера, то есть у
// каждого свои и только на этой машине. На сервере это обычное хранилище с
// правами доступа, а сохранение идёт по каждой правке отдельным запросом, а не
// целым снимком. Разработчику серверной части: снимок здесь — компромисс
// макета, повторять его не нужно.

// Что не переживает перезагрузку. Файлы прикрепляются через
// URL.createObjectURL — такая ссылка живёт, пока жива вкладка, и сохранять её
// бессмысленно: после перезагрузки она указывает в никуда. Поэтому ссылки на
// файлы из снимка убираются, а сам факт вложения остаётся: человек видит имя
// документа и то, что файл нужно приложить заново.
function stripBlobs(value) {
  if (Array.isArray(value)) return value.map(stripBlobs);
  if (!value || typeof value !== 'object') return value;

  const out = {};
  Object.entries(value).forEach(([key, v]) => {
    if (typeof v === 'string' && v.startsWith('blob:')) {
      out.fileLost = true;
      return;
    }
    out[key] = stripBlobs(v);
  });
  return out;
}

// Больше этого в localStorage не кладём: браузер даёт около 5 МБ на источник, и
// при переполнении запись падает целиком. Молча терять данные нельзя, поэтому
// говорим об этом в консоль — в макете это единственный канал.
const MAX_BYTES = 3 * 1024 * 1024;

let warned = false;

export function attachPersist({ key, snapshot, restore, debounceMs = 400 }) {
  if (!key || typeof snapshot !== 'function' || typeof restore !== 'function') return;

  // --- чтение при старте --------------------------------------------------
  try {
    const raw = localStorage.getItem(key);
    if (raw) restore(JSON.parse(raw));
  } catch (e) {
    // Сохранённое не читается (испортилось, сменился формат) — начинаем с
    // засева, но не молча: иначе непонятно, почему пропали данные.
    console.warn('[persist] не удалось прочитать сохранённое:', key, e);
  }

  // --- запись -------------------------------------------------------------
  let timer = null;

  const save = () => {
    timer = null;
    try {
      const text = JSON.stringify(stripBlobs(snapshot()));
      if (text.length > MAX_BYTES) {
        if (!warned) {
          warned = true;
          console.warn('[persist] снимок больше %d МБ — не сохраняем', MAX_BYTES / 1024 / 1024);
        }
        return;
      }
      localStorage.setItem(key, text);
    } catch (e) {
      if (!warned) {
        warned = true;
        console.warn('[persist] не удалось сохранить:', key, e);
      }
    }
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, debounceMs);
  };

  // Правки приходят разными путями — ввод в поле, выбор в списке, нажатие
  // кнопки, — поэтому слушаем событие, а не расставляем вызовы по коду: иначе
  // одно забытое место тихо теряет данные.
  ['change', 'input', 'click'].forEach((type) => {
    document.addEventListener(type, schedule, true);
  });

  // Уход со страницы: отложенная запись могла не успеть.
  window.addEventListener('beforeunload', () => {
    if (timer) { clearTimeout(timer); save(); }
  });

  return { save, schedule };
}

// Забыть сохранённое — на случай, когда данные испортились и проще начать с
// засева. Зовётся из консоли: кнопки для этого в макете нет.
export function clearPersisted(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.warn('[persist] не удалось очистить:', key, e);
  }
}
