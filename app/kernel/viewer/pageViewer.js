import { ensureFilePages } from '../fileUpload.js';
import { setViewerDeps } from './deps.js';
import { viewerHTML } from './shell.js';
import { bindViewer, viewerKeydown } from './ctrl.js';
import { VS, tabKey } from './state.js';

// Просмотрщик на страницах «Документы» и «Учреждения».
//
// Решение пользователя 21.09.2026: «просмотрщик меняем везде, вносим его в
// ядро». Раньше у страниц был свой, урезанный (kernel/docViewer.js): без
// вкладок с меню и перетаскиванием, без режимов вписывания «по ширине/страница
// целиком», без показа во весь экран, без панели горячих клавиш. Теперь они
// показывают тот же просмотрщик, что и карточки ОЦ.
//
// Разница в данных: у карточки документы принадлежат записи, а у страницы
// документ сам является записью и состоит из ФАЙЛОВ. Здесь файлы и становятся
// вкладками просмотрщика, а лишнее для страниц выключено (CAN ниже): фото,
// сравнение, прикрепление (у страниц свои формы загрузки), архив, правка
// страниц и документа, закрытие вкладок, сайдбар выбора по записи, раскрытие
// (сдвигать на странице нечего) и отдельное окно.

const CAN = {
  photo: false, compare: false, attach: false, archive: false,
  editPages: false, editDoc: false, closeTabs: false, sidebar: false,
  dock: false, popout: false,
};

// Область вкладок у страниц своя — 'page' (state.js, scopesOf): вкладки
// карточки ОЦ живут в том же VS и смешиваться с файлами документа не должны.
const SC = 'page';

// Состояние просмотрщика живёт столько же, сколько страница: открытый файл,
// масштаб, прокрутка. Ключ — идентификатор документа.
const uiByDoc = new Map();

const uiFor = (docId) => {
  if (!uiByDoc.has(docId)) uiByDoc.set(docId, { viewer: { mode: 'doc' } });
  return uiByDoc.get(docId);
};

// Файл документа → «документ» в понимании просмотрщика: вид берём у документа,
// название — у файла, страницы считает ядро (kernel/fileUpload.js).
const asDoc = (doc, f) => ({ id: f.id, type: doc.type || 'Файл', name: f.name, file: f, pages: f.pages });

function depsFor(doc) {
  const list = () => (doc.files || []).map((f) => { ensureFilePages(f); return asDoc(doc, f); });
  return {
    typeId: 'doc',
    typeLabel: 'Документ',
    can: CAN,

    docListFor: () => list(),
    ensureDocPages: (d) => { ensureFilePages(d.file); d.pages = d.file.pages; },
    attachedFileFrom: (f) => f,
    isFileTooLarge: () => false,
    maxFileMb: 15,
    scopeLabel: () => 'Файл',
    nextDocId: () => String(Date.now()),
    docTypes: () => [],

    photoPages: () => [],
    photoGroups: () => [],
    photoFileAt: () => null,
    catLabel: (oi, cat) => cat,

    pushDocPageLog: () => {},
  };
}

// Вкладки — ровно файлы этого документа. Порядок, заданный перетаскиванием,
// сохраняем, пока показывают тот же документ; при смене документа — заново.
function syncTabs(files) {
  const ids = files.map((f) => f.id);
  const open = VS.openTabs[SC] || [];
  const same = open.length === ids.length && ids.every((id) => open.includes(id));
  if (same) return;

  VS.openTabs[SC] = ids.slice();
  VS.tabOrder = VS.tabOrder.filter((k) => !k.startsWith(SC + '|')).concat(ids.map((id) => tabKey(SC, id)));
}

function ctxFor(doc, { scope, host, activeFileId, onChange }) {
  const ui = uiFor(doc.id);
  const files = doc.files || [];
  syncTabs(files);

  const active = files.find((f) => f.id === activeFileId) || files[0];
  if (active) ui.viewerDoc = { scope: SC, id: active.id };

  return {
    ui,
    // Записи ОЦ у страницы нет: документ сам себе запись, литер и фото не бывает.
    rec: { docs: [], oi: [] },
    oi: null,
    view: 'page',
    isPage: true,
    scope,
    host,
    toast: (host && host.toast) || (() => {}),
    today: '',
    // Просмотрщик перерисовывает экран через ctx.render(); странице при этом
    // надо знать, какой файл открыт, — она подсвечивает его в своём списке.
    render: () => onChange((ui.viewerDoc || {}).id || null),
  };
}

let current = null;   // последний собранный ctx — для горячих клавиш страницы

// Свой корень для просмотрщика. Просмотрщик ищет элементы через scope, а на
// одном экране их бывает два: в учреждениях это документы вкладки и
// предпросмотр в панели прикрепления. С общим скоупом оба цеплялись к первому
// найденному. Слушатели документа здесь не нужны: клавиши навешиваются
// отдельно и один раз (bindPageViewerKeys), перетаскивания файлов на страницах
// нет (прикрепление выключено).
export function elementScope(el) {
  return {
    root: el,
    $: (sel) => el.querySelector(sel),
    $$: (sel) => Array.from(el.querySelectorAll(sel)),
    on() {}, onRoot() {}, onDocument() {},
  };
}

// Разметка просмотрщика. opts: { host, activeFileId, onChange }.
export function pageViewerHTML(doc, opts = {}) {
  if (!doc || !(doc.files || []).length) return '';
  setViewerDeps(depsFor(doc));
  return viewerHTML(ctxFor(doc, opts));
}

// Обработчики — после каждой отрисовки страницы, как и в карточке ОЦ.
// opts.within — селектор корня, если просмотрщиков на экране несколько;
// opts.keys: false — этот просмотрщик не слушает горячие клавиши страницы.
export function bindPageViewer(scope, doc, opts = {}) {
  if (!doc || !(doc.files || []).length) return null;
  const root = opts.within ? scope.$(opts.within) : null;
  if (opts.within && !root) return null;

  setViewerDeps(depsFor(doc));
  const ctx = ctxFor(doc, { ...opts, scope: root ? elementScope(root) : scope });
  if (opts.keys !== false) current = ctx;
  bindViewer(ctx);
  return ctx;
}

// Горячие клавиши — ОДИН раз за монтирование страницы, а не на каждую
// отрисовку: scope.onDocument только добавляет слушатель, и накопленные
// обработчики множили бы каждый шаг зума и поворота (та же причина, что у
// bindViewerHotkeys в ctrl.js). Слушатель снимается сам при уходе со страницы.
export function bindPageViewerKeys(scope) {
  scope.onDocument('keydown', (e) => { if (current) viewerKeydown(current, e); });
  scope.onDocument('keyup', (e) => { if (current && e.code === 'Space') viewerKeydown(current, e); });
}

// Страница ушла или документ удалён — состояние и вкладки не переносим.
export function forgetPageViewer(docId) {
  if (docId) uiByDoc.delete(docId); else uiByDoc.clear();
  VS.openTabs[SC] = [];
  VS.tabOrder = VS.tabOrder.filter((k) => !k.startsWith(SC + '|'));
  current = null;
}
