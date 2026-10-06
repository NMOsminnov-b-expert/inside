// Сохранение введённых данных между перезагрузками страницы — на весь проект.
//
// Требования пользователя 09.09.2026: «те данные, что вбились, не должны
// пропадать после перезагрузки», «сохранение сделай глобальным… по всему
// проекту». До этого всё жило в памяти вкладки, и любое обновление страницы
// возвращало засев — проверить работу на своих данных было нельзя.
//
// Карточки — общие для всех копий макета (решение пользователя 06.10.2026):
// «на гит попадают и сохранённые у меня локально карточки», «не только я с
// макетом работаю. Так что записи каждого сотрудника в отдельном файле. В
// системе показываем уже сбор со всех таких записей. При этом в каждой копии
// макета своё название файла, в который пишет система».
//
// Устройство.
//
//   * Записи ОЦ (части снимка «records.*») собираются так: засев из кода, на
//     него — правки из файлов всех сотрудников data/local/<имя>.json, на них —
//     свои несохранённые в файл правки из браузера. Правка — запись целиком
//     или отметка об удалении, с временем; из нескольких правок одной записи
//     действует последняя по времени.
//   * Свой файл хранит только свои правки: записи, которые в этой копии
//     заведены или изменены относительно собранного при открытии. Пишет его
//     локальный сервер макета (tools/serve.py) — у браузера доступа к диску нет.
//     Имя файла — своё в каждой копии (tools/serve.py, .inside-local.json).
//   * Состояние экрана (части «ui.*»: свёрнутое меню, фильтры) — личное,
//     остаётся в браузере и в git не идёт.
//
// Без сервера макета (Live Server, автопроверки) файлы сотрудников читаются,
// если доступны, а свои правки живут только в браузере. Автопроверки работают
// на одном засеве: чужие записи меняли бы то, что они проверяют.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: здесь общие данные — файлы в git, а слияние идёт в
// браузере по времени правки (последняя побеждает, одновременные правки одной
// записи разными людьми не сводятся). На сервере это обычное хранилище с
// правами доступа и правкой по каждому полю отдельным запросом; файлы и
// слияние снимков повторять не нужно.

import { restoreLocalFiles } from './localFiles.js';

const KEY = 'inside:data:v1';

// Ключ прежнего, помодульного сохранения. Больше не читается: вместе со
// сменой версии снимка он удаляется (см. VERSION).
const LEGACY_CIVIL = 'inside:civil:records:v1';

// Версия 2 — 23.09.2026, указание пользователя «то, что помимо сидов создано,
// грохни»: заведённое в браузере до этого дня отбрасывается. Версия 3 —
// 06.10.2026: в браузере хранятся не записи целиком, а свои правки к засеву и
// файлам сотрудников. Снимок версии 2 переводится в правки при первом
// открытии; другой версии — не читается и удаляется.
const VERSION = 3;
const LEGACY_VERSION = 2;

// Больше этого в localStorage не кладём: браузер даёт около 5 МБ на источник, и
// при переполнении запись падает целиком. Молча терять данные нельзя, поэтому
// говорим об этом в консоль — в макете это единственный канал.
const MAX_BYTES = 4 * 1024 * 1024;

// Общие части снимка — записи ОЦ, контакты узлов учреждений
// (kernel/contacts.js) и свои шаблоны машин (modules/vehicle/templates.js). «records.production» — только перенос записей
// прежнего типа, своих данных у него нет.
const isShared = (name) => /^(records|contacts|templates)\./.test(name) && name !== 'records.production';

const sources = new Map();

let loaded = null;      // прочитанное из браузера: { local: {имя: данные}, mine, legacy }
let timer = null;
let listening = false;
let warned = false;

// --- файлы сотрудников ---------------------------------------------------------

// Читаются до первой регистрации источника: модуль ждёт этого на импорте
// (await верхнего уровня), поэтому восстановление ниже остаётся синхронным.
async function loadShared() {
  const none = { me: '', files: {} };
  if (typeof navigator !== 'undefined' && navigator.webdriver) return none;
  try {
    // Сервер макета: своё имя файла и все файлы разом.
    const res = await fetch('./__persist', { cache: 'no-store' });
    if (res.ok) {
      const got = await res.json();
      if (got && typeof got.files === 'object') return { me: String(got.me || ''), files: got.files };
    }
  } catch (e) { /* сервера макета нет — читаем файлы как есть */ }
  try {
    const res = await fetch('./data/local/manifest.json', { cache: 'no-store' });
    if (!res.ok) return none;
    const { files = [] } = await res.json();
    const out = {};
    await Promise.all(files.map(async (file) => {
      try {
        const r = await fetch('./data/local/' + encodeURIComponent(file), { cache: 'no-store' });
        if (r.ok) out[file.replace(/\.json$/, '')] = await r.json();
      } catch (e) { /* файл недоступен — без него */ }
    }));
    return { me: '', files: out };
  } catch (e) {
    return none;
  }
}

const shared = await loadShared();

// Метка копии в идентификаторах новых записей: счётчики в разных копиях
// выдают одни и те же номера, и записи двух сотрудников слились бы в одну.
// Без сервера макета метки нет — записи живут только в этом браузере.
export const copyTag = () => shared.me.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 16);

// --- чтение ----------------------------------------------------------------

// Правки части снимка: { id: { at, item } | { at, removed: true } }.
const newer = (a, b) => (!a ? b : !b ? a : (b.at > a.at ? b : a));

function readSnapshot() {
  if (loaded) return loaded;
  loaded = { local: {}, mine: {}, legacy: {} };

  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.v === VERSION && parsed.data) {
        loaded.local = parsed.data;
        loaded.mine = parsed.mine || {};
        loaded.legacy = parsed.legacy || {};
      } else if (parsed && parsed.v === LEGACY_VERSION && parsed.data) {
        // Прежний снимок: записи целиком. Свои правки из них считаются при
        // регистрации части — сравнением с засевом.
        Object.entries(parsed.data).forEach(([name, data]) => {
          if (isShared(name)) loaded.legacy[name] = data;
          else loaded.local[name] = data;
        });
      } else {
        localStorage.removeItem(KEY);
      }
    }
  } catch (e) {
    // Сохранённое не читается (испортилось, сменился формат) — начинаем с
    // засева, но не молча: иначе непонятно, почему пропали данные.
    console.warn('[persist] не удалось прочитать снимок:', e);
  }

  try { localStorage.removeItem(LEGACY_CIVIL); } catch (e) { /* хранилище недоступно */ }

  // Свой файл — тоже свои правки: браузер мог быть очищен, а файл остался.
  const own = shared.me && shared.files[shared.me];
  if (own && own.sources) {
    Object.entries(own.sources).forEach(([name, edits]) => {
      const m = loaded.mine[name] || (loaded.mine[name] = {});
      Object.entries(edits || {}).forEach(([id, e]) => { m[id] = newer(m[id], e); });
    });
  }

  return loaded;
}

// Свои правки и строки записей, с которыми они сравниваются при записи.
const mine = () => readSnapshot().mine;
const baseline = new Map();     // имя → Map(id → JSON записи после сборки)

// Правки всех сотрудников и свои — по последней на запись.
function editsFor(name) {
  const out = new Map();
  Object.entries(shared.files).forEach(([who, file]) => {
    if (who === shared.me) return;
    Object.entries((file && file.sources && file.sources[name]) || {}).forEach(([id, e]) => {
      out.set(id, newer(out.get(id), e));
    });
  });
  Object.entries(mine()[name] || {}).forEach(([id, e]) => out.set(id, newer(out.get(id), e)));
  return out;
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

// Запись для сравнения — без пустых значений: экран при показе дописывает
// записям пустые значения по умолчанию (capSigns: null → {}), и такая запись
// без правок пользователя считалась бы изменённой и уходила в файл.
function canon(value) {
  if (Array.isArray(value)) {
    const out = value.map(canon).filter((v) => v !== undefined);
    return out.length ? out : undefined;
  }
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value !== 'object') return value;
  const out = {};
  Object.keys(value).forEach((k) => {
    const v = canon(value[k]);
    if (v !== undefined) out[k] = v;
  });
  return Object.keys(out).length ? out : undefined;
}
const textOf = (it) => JSON.stringify(canon(stripBlobs(it)) || {});

const rowsOf = (list) => new Map(list.filter((it) => it && it.id != null).map((it) => [String(it.id), textOf(it)]));

// Свои правки части: всё, что отличается от собранного при открытии, и всё,
// что уже было своей правкой. Время ставится, только когда запись изменилась.
function collectEdits(name, list) {
  const base = baseline.get(name) || new Map();
  const items = new Map(list.filter((it) => it && it.id != null).map((it) => [String(it.id), it]));
  const cur = new Map([...items].map(([id, it]) => [id, textOf(it)]));
  const m = mine()[name] || (mine()[name] = {});
  const now = new Date().toISOString();
  cur.forEach((text, id) => {
    const prev = m[id];
    if (base.get(id) === text && !prev) return;
    if (prev && !prev.removed && textOf(prev.item) === text) return;
    m[id] = { at: now, item: stripBlobs(items.get(id)) };
  });
  base.forEach((_, id) => { if (!cur.has(id) && !(m[id] && m[id].removed)) m[id] = { at: now, removed: true }; });
  Object.keys(m).forEach((id) => { if (!cur.has(id) && !m[id].removed) m[id] = { at: now, removed: true }; });
  if (!Object.keys(m).length) delete mine()[name];
}

// Свой файл — с записями по порядку id: в git видно, что именно поменялось.
function ownFile() {
  const out = {};
  Object.keys(mine()).sort().forEach((name) => {
    const m = mine()[name];
    out[name] = Object.fromEntries(Object.keys(m).sort().map((id) => [id, m[id]]));
  });
  return { v: 1, author: shared.me, sources: out };
}

let lastSent = '';
function sendOwnFile() {
  if (!shared.me) return;
  const body = JSON.stringify(ownFile());
  if (body === lastSent) return;
  lastSent = body;
  fetch('./__persist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
    .catch((e) => {
      lastSent = '';
      if (!warned) { warned = true; console.warn('[persist] сервер макета не принял правки:', e); }
    });
}

// Когда снимок последний раз лёг в хранилище — для строки «Сохранено · 13:42»
// в шапке карточки. Событие «inside:saved» на документе — чтобы шапка
// обновлялась без перерисовки.
let lastSaved = null;
export const lastSavedAt = () => lastSaved;

export function saveNow() {
  timer = null;

  // Части модулей, которые ещё не загружались, переписываются как были: иначе
  // первое же сохранение до открытия модуля стёрло бы их.
  const data = {};
  Object.entries(readSnapshot().local).forEach(([name, v]) => { if (!sources.has(name)) data[name] = v; });
  sources.forEach(({ snapshot }, name) => {
    try {
      if (isShared(name)) collectEdits(name, snapshot());
      else data[name] = stripBlobs(snapshot());
    } catch (e) {
      console.warn('[persist] источник «%s» не отдал снимок:', name, e);
    }
  });

  sendOwnFile();

  try {
    const legacy = readSnapshot().legacy;
    const text = JSON.stringify({ v: VERSION, data, mine: mine(), ...(Object.keys(legacy).length ? { legacy } : {}) });
    if (text.length > MAX_BYTES) {
      if (!warned) {
        warned = true;
        console.warn('[persist] снимок больше %d МБ — не сохраняем', MAX_BYTES / 1024 / 1024);
      }
      return false;
    }
    localStorage.setItem(KEY, text);
    lastSaved = new Date();
    document.dispatchEvent(new CustomEvent('inside:saved', { detail: lastSaved }));
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

// Собрать общую часть: засев, на него — правки сотрудников и свои.
function assemble(name, seed) {
  const snap = readSnapshot();

  // Прежний снимок (версия 2) — записи целиком: своё в нём — то, что
  // отличается от засева. Переводится в правки один раз. Записи засева,
  // которых в снимке нет, удалёнными не считаются: засев с тех пор
  // пополнялся, и новые демо-записи пропали бы.
  const legacy = snap.legacy[name];
  if (Array.isArray(legacy)) {
    const seedRows = rowsOf(seed);
    const m = snap.mine[name] || (snap.mine[name] = {});
    const now = new Date().toISOString();
    legacy.forEach((it) => {
      if (!it || it.id == null) return;
      const id = String(it.id);
      if (seedRows.get(id) !== textOf(it)) m[id] = newer(m[id], { at: now, item: it });
    });
    if (!Object.keys(m).length) delete snap.mine[name];
    delete snap.legacy[name];
  }

  const edits = editsFor(name);
  if (!edits.size) return null;
  const out = seed.slice();
  const at = new Map(out.map((it, i) => [String(it && it.id), i]));
  edits.forEach((e, id) => {
    if (e.removed) {
      if (at.has(id)) out[at.get(id)] = null;
    } else if (at.has(id)) {
      out[at.get(id)] = e.item;
    } else {
      out.push(e.item);
    }
  });
  return out.filter(Boolean);
}

// name — имя части снимка («records.civil», «ui.shell»). snapshot()
// возвращает то, что нужно сохранить; restore(data) принимает это обратно.
//
// Восстановление идёт СРАЗУ при регистрации: модуль мог загрузиться уже после
// того, как снимок прочитан, и ждать его отдельной команды некому.
export function registerPersisted(name, { snapshot, restore }) {
  if (!name || typeof snapshot !== 'function' || typeof restore !== 'function') return;

  sources.set(name, { snapshot, restore });

  try {
    if (isShared(name)) {
      const seed = snapshot();
      const full = Array.isArray(seed) ? assemble(name, seed) : null;
      if (full) {
        // Правки читаются из JSON — записи свежие, засев остаётся нетронутым.
        const own = new Set(seed);
        restore(full.map((it) => (own.has(it) ? it : JSON.parse(JSON.stringify(it)))));
        restoreLocalFiles(snapshot());
      }
      baseline.set(name, rowsOf(snapshot()));
      // Свои правки, которых ещё нет в своём файле (перевод прежнего снимка,
      // правки без сервера макета), уходят в файл сразу, а не по первому щелчку.
      if (mine()[name]) scheduleSave();
    } else {
      const saved = readSnapshot().local[name];
      if (saved !== undefined) {
        restore(saved);
        // Ссылки на файлы в снимок не попадают (stripBlobs) — сами файлы лежат в
        // хранилище браузера и возвращаются отдельно (localFiles.js).
        restoreLocalFiles(snapshot());
      }
    }
  } catch (e) {
    console.warn('[persist] не удалось восстановить «%s»:', name, e);
  }

  listen();
}
