// Прикреплённые файлы переживают перезагрузку страницы — чтобы макет можно
// было проверять на своих документах (задача пользователя 25.09.2026:
// «добавляем сохранение доков локально, для удобства тестирования… не должно
// улетать в сеть»).
//
// Устройство. Записи сохраняет kernel/persist.js в localStorage, но файл там
// не помещается: у файла только blob-ссылка, живущая до закрытия вкладки,
// поэтому после перезагрузки документ оставался без файла (fileLost). Теперь
// сам файл кладётся в IndexedDB браузера под ключом f.localKey, а после чтения
// снимка ссылки на файлы создаются заново из сохранённого.
//
// Дополнительно файлы можно копировать в папку на диске (File System Access
// API): выбирается один раз, обычно local-docs/ в корне репозитория. Папка в
// .gitignore — документы реальные, в репозиторий и в сеть они не попадают;
// копии нужны, чтобы по ним можно было пройтись и собрать примеры для разбора.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: файлы хранятся в браузере одной машины, без прав и без
// чистки. На сервере это загрузка в файловое хранилище с постоянным адресом,
// проверкой типа и размера и удалением вместе с документом (или по сроку
// архива). Решать, где хранить и сколько, — разработчикам сервера.

const DB_NAME = 'inside-files';
const STORE = 'files';
const DIR_KEY = '__dir';

let dbPromise = null;
let dir = null;           // папка для копий, если подключена и разрешена
let restoring = null;

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function run(mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

const get = (key) => run('readonly', (s) => s.get(key));
const put = (key, value) => run('readwrite', (s) => s.put(value, key));

// --- сохранение ---------------------------------------------------------------

// Вызывается при прикреплении файла (attachedFileFrom в kernel/fileUpload.js
// и в parts/docs/model.js модулей): запоминает ключ в описании файла и кладёт
// сам файл в хранилище. Ошибка хранилища не мешает прикреплению — файл просто
// не переживёт перезагрузку, как раньше.
export function keepFileLocally(file, f) {
  if (!file || !f || typeof indexedDB === 'undefined') return;
  const key = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  f.localKey = key;
  const rec = { blob: file, name: file.name, type: file.type || '', at: Date.now(), copied: '' };
  put(key, rec)
    .then(() => copyToFolder(key, rec))
    .catch((e) => console.warn('[localFiles] файл не сохранён:', e));
}

// --- восстановление -----------------------------------------------------------

// Описания файлов в данных: объект с localKey и без живой ссылки. Проход по
// всему снимку, а не по известным местам: файлы есть у документов ОЦ и литер,
// у фото, у документов учреждений — одно забытое место тихо теряло бы файлы.
function lostFiles(root, out = [], seen = new WeakSet()) {
  if (!root || typeof root !== 'object' || seen.has(root)) return out;
  seen.add(root);
  if (Array.isArray(root)) {
    root.forEach((v) => lostFiles(v, out, seen));
    return out;
  }
  if (typeof root.localKey === 'string' && (root.fileLost || !root.dataUrl)) out.push(root);
  Object.values(root).forEach((v) => lostFiles(v, out, seen));
  return out;
}

// Вызывается из kernel/persist.js после восстановления каждой части снимка.
// Ссылки создаются заново, затем экран перерисовывается один раз.
export function restoreLocalFiles(data) {
  const list = lostFiles(data);
  if (!list.length || typeof indexedDB === 'undefined') return;
  const jobs = list.map((f) => get(f.localKey).then((rec) => {
    if (!rec || !rec.blob) return false;
    f.dataUrl = URL.createObjectURL(rec.blob);
    delete f.fileLost;
    return true;
  }).catch(() => false));
  const batch = Promise.all(jobs);
  restoring = (restoring || Promise.resolve()).then(() => batch);
  batch.then((res) => {
    if (res.some(Boolean)) scheduleRedraw();
  });
}

let redrawTimer = null;
function scheduleRedraw() {
  clearTimeout(redrawTimer);
  // Перерисовку делает каркас (kernel/boot.js, событие inside:redraw) — уже
  // смонтированному экрану. Раньше здесь был поддельный hashchange: если он
  // приходил, пока карточка ещё грузилась, она монтировалась дважды, у кнопок
  // оказывалось по два обработчика, и меню «+» открывалось и тут же
  // закрывалось (замечание пользователя 25.09.2026).
  redrawTimer = setTimeout(() => window.dispatchEvent(new CustomEvent('inside:redraw')), 30);
}

// --- копии в папку на диске ---------------------------------------------------

export const folderSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;
// У папки без имени (внутренняя файловая система браузера) — общее название.
export const folderName = () => (dir ? dir.name || 'выбранная папка' : '');

// Имя копии: дата прикрепления и исходное имя; повтор имени — с хвостом ключа.
function copyName(key, rec) {
  const d = new Date(rec.at || Date.now());
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const safe = String(rec.name || key).replace(/[\\/:*?"<>|]+/g, '_');
  return `${day} ${safe}`;
}

async function exists(name) {
  try { await dir.getFileHandle(name); return true; } catch (e) { return false; }
}

async function copyToFolder(key, rec) {
  if (!dir || rec.copied) return;
  let name = copyName(key, rec);
  if (await exists(name)) name = name.replace(/(\.[^.]*)?$/, (ext) => ` (${key.slice(-4)})${ext || ''}`);
  const h = await dir.getFileHandle(name, { create: true });
  const w = await h.createWritable();
  await w.write(rec.blob);
  await w.close();
  rec.copied = name;
  await put(key, rec);
}

// Всё, что ещё не скопировано, — в папку. Возвращает число скопированных.
async function copyAll() {
  const keys = await run('readonly', (s) => s.getAllKeys());
  let n = 0;
  for (const key of keys) {
    if (key === DIR_KEY) continue;
    const rec = await get(key);
    if (rec && rec.blob && !rec.copied) {
      await copyToFolder(key, rec);
      n += 1;
    }
  }
  return n;
}

// Выбор папки — только по действию человека (так требует браузер). Папка
// запоминается; при следующем открытии страницы браузер может снова спросить
// разрешение — тогда достаточно выбрать пункт ещё раз.
export async function connectFolder() {
  if (!folderSupported()) throw new Error('Браузер не даёт писать в папку — нужен Chrome или Edge');
  let h = await get(DIR_KEY).catch(() => null);
  if (h && (await h.requestPermission({ mode: 'readwrite' })) !== 'granted') h = null;
  if (!h) h = await window.showDirectoryPicker({ id: 'inside-local-docs', mode: 'readwrite' });
  dir = h;
  await put(DIR_KEY, h);
  const n = await copyAll();
  return { name: folderName(), copied: n };
}

// Папка, выбранная раньше, подхватывается без вопросов, если разрешение ещё
// действует.
async function resumeFolder() {
  if (!folderSupported() || typeof indexedDB === 'undefined') return;
  try {
    const h = await get(DIR_KEY);
    if (h && (await h.queryPermission({ mode: 'readwrite' })) === 'granted') {
      dir = h;
      copyAll().catch(() => {});
    }
  } catch (e) { /* хранилище недоступно — копий просто не будет */ }
}
resumeFolder();
