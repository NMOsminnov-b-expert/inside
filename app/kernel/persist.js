// Сохранение введённых данных между перезагрузками страницы — на весь проект.
//
// Требования пользователя 09.09.2026: «те данные, что вбились, не должны
// пропадать после перезагрузки», «сохранение сделай глобальным… по всему
// проекту». До этого всё жило в памяти вкладки, и любое обновление страницы
// возвращало засев — проверить работу на своих данных было нельзя.
//
// Устройство. Снимок один на всё приложение, JSON под одним ключом:
//
//     { "v": 1, "data": { "records.civil": [...], "institutions": [...] } }
//
// Части снимка объявляют сами владельцы данных через registerPersisted:
// записи каждого типа ОЦ, дерево учреждений, справочники, архив, реестр
// документов. Общий ключ — потому что данные связаны: запись ссылается на
// учреждение, архив держит изъятые записи, документы ссылаются на объекты.
// Сохрани их по отдельности — и половина ссылок после перезагрузки повиснет.
//
// Почему источники регистрируются, а не перечислены здесь: модули типов ОЦ
// грузятся лениво, по открытию своего экрана. Снимок читается один раз и
// хранится, поэтому опоздавший источник получает своё при регистрации.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: здесь данные лежат в localStorage браузера — у каждого
// свои и только на этой машине. На сервере это обычное хранилище с правами
// доступа, а сохранение идёт по каждой правке отдельным запросом, а не целым
// снимком. Снимок здесь — компромисс макета, повторять его не нужно.

const KEY = 'inside:data:v1';

// Ключ прежнего, помодульного сохранения. Читаем его один раз, чтобы данные,
// введённые до перехода на общий снимок, не пропали.
const LEGACY_CIVIL = 'inside:civil:records:v1';

const VERSION = 1;

// Больше этого в localStorage не кладём: браузер даёт около 5 МБ на источник, и
// при переполнении запись падает целиком. Молча терять данные нельзя, поэтому
// говорим об этом в консоль — в макете это единственный канал.
const MAX_BYTES = 4 * 1024 * 1024;

const sources = new Map();

let loaded = null;      // прочитанный снимок: { имя: данные }
let timer = null;
let listening = false;
let warned = false;

// --- чтение ----------------------------------------------------------------

function readSnapshot() {
  if (loaded) return loaded;
  loaded = {};

  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Версия снимка своя, не привязана к ключу: ключ меняем, только когда
      // старые данные читать нечем, а версия позволяет их перечитать иначе.
      if (parsed && parsed.v === VERSION && parsed.data) loaded = parsed.data;
    }
  } catch (e) {
    // Сохранённое не читается (испортилось, сменился формат) — начинаем с
    // засева, но не молча: иначе непонятно, почему пропали данные.
    console.warn('[persist] не удалось прочитать снимок:', e);
  }

  try {
    const legacy = localStorage.getItem(LEGACY_CIVIL);
    if (legacy && loaded['records.civil'] === undefined) {
      loaded['records.civil'] = JSON.parse(legacy);
    }
  } catch (e) {
    console.warn('[persist] не удалось прочитать прежнее сохранение civil:', e);
  }

  return loaded;
}

// --- запись ----------------------------------------------------------------

// Что не переживает перезагрузку. Файлы прикрепляются через
// URL.createObjectURL — такая ссылка живёт, пока жива вкладка, и сохранять её
// бессмысленно: после перезагрузки она указывает в никуда. Поэтому ссылки на
// файлы из снимка убираются, а сам факт вложения остаётся: человек видит имя
// документа и то, что файл нужно приложить заново.
function stripBlobs(value, seen = new WeakSet()) {
  if (Array.isArray(value)) return value.map((v) => stripBlobs(v, seen));
  if (!value || typeof value !== 'object') return value;

  // Циклы в данных нам не нужны и в JSON всё равно не поместятся.
  if (seen.has(value)) return undefined;
  seen.add(value);

  const out = {};
  Object.entries(value).forEach(([key, v]) => {
    if (typeof v === 'string' && v.startsWith('blob:')) {
      out.fileLost = true;
      return;
    }
    const clean = stripBlobs(v, seen);
    if (clean !== undefined) out[key] = clean;
  });
  return out;
}

export function saveNow() {
  timer = null;

  const data = {};
  sources.forEach(({ snapshot }, name) => {
    try {
      data[name] = stripBlobs(snapshot());
    } catch (e) {
      console.warn('[persist] источник «%s» не отдал снимок:', name, e);
    }
  });

  try {
    const text = JSON.stringify({ v: VERSION, data });
    if (text.length > MAX_BYTES) {
      if (!warned) {
        warned = true;
        console.warn('[persist] снимок больше %d МБ — не сохраняем', MAX_BYTES / 1024 / 1024);
      }
      return false;
    }
    localStorage.setItem(KEY, text);
    return true;
  } catch (e) {
    if (!warned) {
      warned = true;
      console.warn('[persist] не удалось сохранить:', e);
    }
    return false;
  }
}

export function scheduleSave(delay = 400) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(saveNow, delay);
}

function listen() {
  if (listening) return;
  listening = true;

  // Правки приходят разными путями — ввод в поле, выбор в списке, нажатие
  // кнопки, перетаскивание, — поэтому слушаем события, а не расставляем вызовы
  // по коду: одно забытое место тихо теряло бы данные.
  ['change', 'input', 'click', 'drop'].forEach((type) => {
    document.addEventListener(type, () => scheduleSave(), true);
  });

  // Уход со страницы: отложенная запись могла не успеть.
  window.addEventListener('beforeunload', () => {
    if (timer) { clearTimeout(timer); saveNow(); }
  });
}

// --- источники -------------------------------------------------------------

// name — имя части снимка («records.civil», «institutions»). snapshot()
// возвращает то, что нужно сохранить; restore(data) принимает это обратно.
//
// Восстановление идёт СРАЗУ при регистрации: модуль мог загрузиться уже после
// того, как снимок прочитан, и ждать его отдельной команды некому.
export function registerPersisted(name, { snapshot, restore }) {
  if (!name || typeof snapshot !== 'function' || typeof restore !== 'function') return;

  sources.set(name, { snapshot, restore });

  const saved = readSnapshot()[name];
  if (saved !== undefined) {
    try {
      restore(saved);
    } catch (e) {
      console.warn('[persist] не удалось восстановить «%s»:', name, e);
    }
  }

  listen();
}

// Забыть сохранённое — на случай, когда данные испортились и проще начать с
// засева. Зовётся из консоли: кнопки для этого в макете нет.
export function clearPersisted() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(LEGACY_CIVIL);
  } catch (e) {
    console.warn('[persist] не удалось очистить:', e);
  }
}

// Что сейчас лежит в снимке — для проверок и разбора: какие части сохранены и
// сколько в них записей.
export function persistedNames() {
  return [...sources.keys()].sort();
}
