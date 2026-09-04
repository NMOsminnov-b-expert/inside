// Архив — отдельная вкладка системы (docs/tz/20-arhiv.md). Экран общий для
// всех видов записей (документ, объект оценки, литера, учреждение,
// справочник) и ни одного из них не знает сам — он только собирает архив
// через kernel/archive.js и рисует список.
//
// Раскладка — три зоны (§7.1), тот же приём, что в учреждениях и в реестре
// документов: слева сворачиваемые фильтры (app/pages/institutions/allObjects.js),
// в центре таблица со столбцами kernel/columns.js (тот же механизм, что в
// реестре ОЦ, app/pages/ocMenu), справа сворачиваемая панель содержимого
// (app/pages/docs/detail.js).
//
// Права: администратор и «любая роль» видят весь архив, остальные — только по
// своим учреждениям (kernel/session.js). Это то же правило, по которому
// открывается лог действий.
import { esc } from '../../kernel/dom.js';
import { fmtEni, plural } from '../../kernel/fmt.js';
import {
  queryArchive, archiveFacets, visibleEntries, findRecordOf, restoreEntry, canRestore,
  entryById, batchOf, docTypeOf,
} from '../../kernel/archive.js';
import { canSeeInstitution, seesEverything, myInstitutions, session } from '../../kernel/session.js';
import { sortedTypes } from '../../kernel/registry.js';
import { CARD_LABEL } from '../../kernel/dicts.js';
import { setCrumbs, setActiveNav } from '../../shell/shell.js';
import { viewerHTML, bindViewer } from '../../kernel/docViewer.js';
import {
  orderedColumns, normalizeOrder, toggleColumn, columnWidth, colGroupHTML, headAttrs,
  colLabelHTML, resizeGripHTML, applyFit, bindColumnResize, bindColumnReorder,
  columnsMenuHTML, bindColumnsMenu,
} from '../../kernel/columns.js';

// Вид записи: значок и подпись по-русски. Ключи (`oc`, `oi`, …) — внутренние,
// человеку они не показываются (ТЗ §8.3).
const KIND = {
  document: { icon: '📄', label: 'Документ' },
  oc: { icon: '🏢', label: 'Объект оценки' },
  oi: { icon: '🅰', label: 'Объект имущества' },
  institution: { icon: '🏛', label: 'Учреждение' },
  dict: { icon: '📚', label: 'Справочник' },
};
const KIND_LABEL = (kind) => (KIND[kind] || { label: 'Запись' }).label;
const KIND_PLURAL = {
  document: ['документ', 'документа', 'документов'],
  oc: ['объект оценки', 'объекта оценки', 'объектов оценки'],
  oi: ['объект имущества', 'объекта имущества', 'объектов имущества'],
  institution: ['учреждение', 'учреждения', 'учреждений'],
  dict: ['справочник', 'справочника', 'справочников'],
};

// --- столбцы (ТЗ §7.2) ------------------------------------------------------
// Первые семь показаны по умолчанию: kind/title/from/institution/archivedBy/
// archivedAt — движимые (порядок и видимость меняются) — плюс закреплённый
// «Действия» в хвосте. Флажок выбора — тоже закреплён, но ведущим столбцом:
// он не входит в перечень §7.2 (это не «данные», а служебный элемент §7.7),
// поэтому в меню столбцов не появляется — как и «Действия».
const COLUMNS = [
  { key: 'sel', label: '', width: 32, fixed: true },
  { key: 'kind', label: 'Вид', width: 118, sort: 'kind' },
  { key: 'title', label: 'Что убрано', width: 0, sort: 'title' },
  { key: 'from', label: 'Откуда', width: 230, sort: 'from' },
  { key: 'institution', label: 'Учреждение', width: 170, sort: 'institution' },
  { key: 'archivedBy', label: 'Убрал', width: 140, sort: 'archivedBy' },
  { key: 'archivedAt', label: 'Дата', width: 96, align: 'right', sort: 'archivedAt' },
  { key: 'docType', label: 'Тип документа', width: 160, sort: 'docType' },
  { key: 'typeLabel', label: 'Тип ОЦ', width: 160, sort: 'typeLabel' },
  { key: 'eni', label: 'ЕНИ', width: 140, sort: 'eni' },
  { key: 'size', label: 'Объём', width: 90, align: 'right', sort: 'size' },
  { key: 'restoredAt', label: 'Возвращено', width: 130, sort: 'restoredAt' },
  { key: 'act', label: 'Действия', width: 112, fixed: true },
];
const DEFAULT_COLUMNS = ['kind', 'title', 'from', 'institution', 'archivedBy', 'archivedAt'];

// --- состояние экрана --------------------------------------------------------
// Один экземпляр на сессию (ES-модуль) — тот же приём, что у остальных
// экранов с сохранением раскладки между заходами (allObjects.js, detail.js,
// ocMenu.js): пока вкладку не перезагрузили, фильтры, столбцы, раскрытая
// панель и ширины остаются как были.
const state = {
  q: '',
  kind: [],
  docType: [],
  institution: [],
  typeId: [],
  archivedBy: [],
  from: '',
  to: '',
  // По умолчанию выключено (§7.3, §7.6): возвращённые записи не мешают искать
  // то, что ещё в архиве.
  showRestored: false,
  mine: false,
  group: false,
  panel: true,          // раскрыта ли колонка фильтров (§7.1)
  columns: null,         // порядок и состав столбцов — заполняется при первом render
  colWidths: {},
  sort: { key: 'archivedAt', dir: 'desc' },
  selected: new Set(),   // id архивных записей — флажки (§7.7)
  openEntry: null,       // id записи, открытой в панели содержимого (§7.5)
  openFile: null,        // активный файл внутри просмотрщика документа
  contentOpen: true,     // раскрыта ли панель содержимого
  contentWidth: 420,
  accOpen: {},           // раскрытые группы (§7.4)
  cursor: null,          // id строки под клавиатурным курсором (§15)
};
// Открытость меню столбцов не хранится в state (это не настройка, а
// секундное состояние UI) — тот же приём, что в ocMenu.js: сама .dd открыта
// прямым переключением класса, а модульный флаг только переживает render(),
// которых на экране архива куда больше, чем в реестре.
let colsMenuOpen = false;
const CONTENT_MIN = 300;
const LIST_MIN = 360;

// Доступ к самому экрану: сотруднику без учреждений показывать нечего.
export function canViewArchive() {
  return seesEverything() || myInstitutions().length > 0;
}

// --- вспомогательные функции -------------------------------------------------

// Архивные документы бывают в двух формах — doc.files (реестр/учреждения,
// массив) и doc.file (карточка ОЦ, один объект без своего id). Нормализуем ко
// второй форме kernel/docViewer.js. Важно вернуть ОДИН И ТОТ ЖЕ объект файла
// при повторных вызовах для одного doc: viewerHTML() при рендере зовёт
// ensureFilePages(f), которая дописывает f.pages, а следом bindViewer() читает
// f.pages — если бы doc.file каждый раз оборачивался в НОВЫЙ объект (spread),
// разметка и биндинг работали бы с разными объектами, и bindViewer падал бы на
// f.pages.length (pages есть только у объекта, который видел рендер).
function docFilesOf(doc) {
  if (!doc) return [];
  if (Array.isArray(doc.files)) return doc.files;
  if (doc.file) {
    if (!doc.file.id) doc.file.id = doc.id;
    return [doc.file];
  }
  return [];
}

function sizeOf(entry) {
  if (entry.kind !== 'document') return 0;
  const doc = entry.payload && entry.payload.doc;
  return docFilesOf(doc).reduce((a, f) => a + (f.size || 0), 0);
}

function fmtSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' Б';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' КБ';
  return (bytes / (1024 * 1024)).toFixed(1) + ' МБ';
}

// «Только мои» (§7.3): записи, где я назначен на объект/литеру или закреплён
// за учреждением источника — тот же состав, что смотрит canRestore, но без
// поправки на роль администратора: администратору фильтр тоже должен что-то
// оставлять по его личным назначениям, а не показывать «все — мои».
function isMine(entry) {
  const me = session.state.person;
  if (!me) return false;
  const staff = (entry.from && entry.from.staff) || (entry.payload && entry.payload.staff) || {};
  if (['gov', 'cod', 'appr', 'insp'].some((k) => staff[k] === me)) return true;
  return myInstitutions().includes((entry.from || {}).institution);
}

function sortKeyOf(entry, key) {
  const from = entry.from || {};
  switch (key) {
    case 'kind': return KIND_LABEL(entry.kind);
    case 'title': return entry.title || '';
    case 'from': return from.ocTitle || from.scopeLabel || '';
    case 'institution': return from.institution || '';
    case 'archivedBy': return entry.archivedBy || '';
    case 'archivedAt': return entry.archivedAt || '';
    case 'docType': return docTypeOf(entry);
    case 'typeLabel': return from.typeLabel || '';
    case 'eni': return from.eni || '';
    case 'size': return sizeOf(entry);
    case 'restoredAt': return entry.restoredAt || '';
    default: return '';
  }
}

function groupKeyOf(entry) {
  const from = entry.from || {};
  if (entry.kind === 'institution') return 'inst|' + from.nodeId;
  if (entry.kind === 'dict') return 'dict|' + (from.fieldKey || from.catalog || 'unbound');
  if (from.ocId) return 'oc|' + from.typeId + '|' + from.ocId;
  if (from.place === 'institution' && from.nodeId) return 'inst-doc|' + from.nodeId;
  return 'solo|' + entry.id;
}

// Записи одного пакета — вместе, дочерние — под корневой (§7.4): корень и его
// batchId-собратья первыми в исходном порядке добавления, остальное — по
// текущей сортировке.
function orderGroupRows(rows) {
  const root = rows.find((r) => r.kind === 'oc' || r.kind === 'institution') || rows[0];
  const rootBatch = root ? root.batchId : null;
  const mates = rootBatch ? rows.filter((r) => r.batchId === rootBatch && r !== root) : [];
  const rest = rows.filter((r) => r !== root && !mates.includes(r));
  applySort(rest);
  return root ? [root, ...mates, ...rest] : rest;
}

function applySort(rows) {
  const { key, dir } = state.sort;
  const mul = dir === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    const va = sortKeyOf(a, key);
    const vb = sortKeyOf(b, key);
    if (typeof va === 'number' || typeof vb === 'number') return ((va || 0) - (vb || 0)) * mul;
    return String(va).localeCompare(String(vb), 'ru') * mul;
  });
  return rows;
}

// --- фасеты с самоисключением (ТЗ §7.3, §11) --------------------------------
// Счётчик фасета не должен учитывать сам фасет: выбрано «документ» — счётчик
// у «объект оценки» показывает, сколько их станет видно, если переключиться,
// а не сколько их было бы без ВСЕХ фильтров разом (так исторически считал
// archiveFacets() — годится для пустого экрана, но не для самого фильтра).
function matchesAllBut(entry, exceptKey) {
  const from = entry.from || {};
  if (exceptKey !== 'kind' && state.kind.length && !state.kind.includes(entry.kind)) return false;
  if (exceptKey !== 'docType' && state.docType.length && !state.docType.includes(docTypeOf(entry))) return false;
  if (exceptKey !== 'typeId' && state.typeId.length && !state.typeId.includes(from.typeId)) return false;
  if (exceptKey !== 'institution' && state.institution.length && !state.institution.includes(from.institution)) return false;
  if (exceptKey !== 'archivedBy' && state.archivedBy.length && !state.archivedBy.includes(entry.archivedBy)) return false;
  if (state.from && String(entry.archivedAt) < state.from) return false;
  if (state.to && String(entry.archivedAt) > state.to) return false;
  if (!state.showRestored && entry.restoredAt) return false;
  if (state.mine && !isMine(entry)) return false;
  return true;
}

function computeFacets(all) {
  const dims = { kind: {}, docType: {}, typeId: {}, institution: {}, archivedBy: {} };
  all.forEach((entry) => {
    const from = entry.from || {};
    if (matchesAllBut(entry, 'kind')) dims.kind[entry.kind] = (dims.kind[entry.kind] || 0) + 1;
    const dt = docTypeOf(entry);
    if (dt && matchesAllBut(entry, 'docType')) dims.docType[dt] = (dims.docType[dt] || 0) + 1;
    if (from.typeId && matchesAllBut(entry, 'typeId')) dims.typeId[from.typeId] = (dims.typeId[from.typeId] || 0) + 1;
    if (matchesAllBut(entry, 'institution')) {
      const inst = from.institution || '—';
      dims.institution[inst] = (dims.institution[inst] || 0) + 1;
    }
    if (entry.archivedBy && matchesAllBut(entry, 'archivedBy')) {
      dims.archivedBy[entry.archivedBy] = (dims.archivedBy[entry.archivedBy] || 0) + 1;
    }
  });
  return dims;
}

// --- CSV-выгрузка (§7.7) -----------------------------------------------------

function csvCell(v) {
  const s = String(v ?? '');
  return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function csvValue(entry, key) {
  const from = entry.from || {};
  switch (key) {
    case 'kind': return KIND_LABEL(entry.kind);
    case 'title': return entry.title || '';
    case 'from': return [from.ocTitle, from.scopeLabel].filter(Boolean).join(' · ');
    case 'institution': return from.institution || '';
    case 'archivedBy': return entry.archivedBy || '';
    case 'archivedAt': return entry.archivedAt || '';
    case 'docType': return docTypeOf(entry);
    case 'typeLabel': return from.typeLabel || '';
    case 'eni': return from.eni ? fmtEni(from.eni) : '';
    case 'size': return sizeOf(entry) ? fmtSize(sizeOf(entry)) : '';
    case 'restoredAt': return entry.restoredAt || '';
    default: return '';
  }
}

function exportCsv(cols, rows) {
  const shown = cols.filter((c) => !c.fixed);
  const head = shown.map((c) => csvCell(c.label)).join(';');
  const body = rows.map((e) => shown.map((c) => csvCell(csvValue(e, c.key))).join(';'));
  const csv = [head, ...body].join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `arhiv-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// --- разметка: фильтры (§7.1, §7.3) -----------------------------------------

function msRow(label, value, count, on, dataAttr) {
  return `<label class="arc-f-opt ${on ? 'on' : ''}">
    <input type="checkbox" data-${dataAttr}="${esc(value)}" ${on ? 'checked' : ''}>
    <span class="ell">${esc(label)}</span><span class="arc-f-n">${count}</span>
  </label>`;
}

function facetGroupHTML(title, uiKey, entries, selected, dataAttr, labelOf) {
  if (!entries.length) return '';
  const open = state.accOpen[uiKey] !== false;
  const sorted = entries.slice().sort((a, b) => b[1] - a[1]);
  return `<div class="arc-f-group ${open ? 'open' : ''}">
    <div class="arc-f-head" data-acc-toggle="${uiKey}">
      <span class="chev">▾</span><b>${esc(title)}</b>
      ${selected.length ? `<span class="tag-mini">${selected.length}</span>` : ''}
    </div>
    <div class="arc-f-body">${sorted.map(([v, n]) => msRow(labelOf ? labelOf(v) : v, v, n, selected.includes(v), dataAttr)).join('')}</div>
  </div>`;
}

function filtersHTML(dims, typeNames) {
  const active = state.kind.length + state.docType.length + state.typeId.length + state.institution.length
    + state.archivedBy.length + (state.from ? 1 : 0) + (state.to ? 1 : 0) + (state.mine ? 1 : 0);

  return `<div class="arc-filters">
    <div class="arc-filters-head">
      <b>Фильтры</b>${active ? `<span class="tag-mini">${active}</span>` : ''}
      <button class="reg-icon-btn" data-arc-panel-close title="Свернуть фильтры">‹</button>
    </div>
    <div class="arc-filters-body">
      ${facetGroupHTML('Вид записи', 'fKind', Object.entries(dims.kind), state.kind, 'arc-f-kind', KIND_LABEL)}
      ${facetGroupHTML('Тип документа', 'fDocType', Object.entries(dims.docType), state.docType, 'arc-f-doctype')}
      ${facetGroupHTML('Тип ОЦ', 'fTypeId', Object.entries(dims.typeId), state.typeId, 'arc-f-typeid', (id) => typeNames[id] || id)}
      ${facetGroupHTML('Учреждение', 'fInst', Object.entries(dims.institution), state.institution, 'arc-f-inst')}
      ${facetGroupHTML('Кто убрал', 'fBy', Object.entries(dims.archivedBy), state.archivedBy, 'arc-f-by')}
      <div class="arc-f-group open">
        <div class="arc-f-head"><b>Период «убрано»</b></div>
        <div class="arc-f-body arc-f-dates">
          <input class="input" type="date" data-arc-from value="${esc(state.from)}" title="С этой даты">
          <input class="input" type="date" data-arc-to value="${esc(state.to)}" title="По эту дату">
        </div>
      </div>
      <label class="arc-f-check">
        <input type="checkbox" data-arc-mine ${state.mine ? 'checked' : ''}>
        Только мои
      </label>
      <label class="arc-f-check">
        <input type="checkbox" data-arc-show-restored ${state.showRestored ? 'checked' : ''}>
        Показывать возвращённые
      </label>
    </div>
  </div>`;
}

function filtersTabHTML() {
  const active = state.kind.length + state.docType.length + state.typeId.length + state.institution.length
    + state.archivedBy.length + (state.from ? 1 : 0) + (state.to ? 1 : 0) + (state.mine ? 1 : 0);
  return `<button class="arc-filters-tab" data-arc-panel-open title="Показать фильтры">
    <span>Фильтры${active ? ' · ' + active : ''}</span>
  </button>`;
}

// --- разметка: чипы выбранных фильтров --------------------------------------

function chipsHTML(typeNames) {
  const chips = [];
  state.kind.forEach((k) => chips.push(['kind', k, KIND_LABEL(k)]));
  state.docType.forEach((v) => chips.push(['docType', v, v]));
  state.typeId.forEach((v) => chips.push(['typeId', v, typeNames[v] || v]));
  state.institution.forEach((v) => chips.push(['institution', v, v]));
  state.archivedBy.forEach((v) => chips.push(['archivedBy', v, v]));
  if (state.mine) chips.push(['mine', '1', 'Только мои']);
  if (state.from) chips.push(['from', state.from, 'С ' + state.from]);
  if (state.to) chips.push(['to', state.to, 'По ' + state.to]);
  if (!chips.length) return '';

  return `<div class="arc-chips-row">
    ${chips.map(([dim, v, label]) => `<span class="arc-chip">${esc(label)}
      <button data-arc-unchip="${dim}|${esc(v)}" title="Убрать фильтр">×</button></span>`).join('')}
    <button class="btn btn-ghost btn-sm" data-arc-reset>Сбросить всё</button>
  </div>`;
}

// --- разметка: таблица (§7.2) -----------------------------------------------

function activeColumns() {
  return orderedColumns(COLUMNS, state.columns || DEFAULT_COLUMNS);
}

function theadHTML(rows) {
  const cols = activeColumns();
  const allSelected = rows.length > 0 && rows.every((r) => state.selected.has(r.id));
  return `<thead><tr>
    ${cols.map((c, i) => {
      if (c.key === 'sel') {
        return `<th data-col="sel" style="${cellW(c)}"><input type="checkbox" data-arc-select-all
          ${allSelected ? 'checked' : ''} title="Выбрать все видимые"></th>`;
      }
      return `<th class="${c.align === 'right' ? 'right' : ''} ${c.sort ? 'sortable' : ''}"
        style="${cellW(c)}" ${headAttrs(c)} ${c.sort ? `data-sort="${c.sort}"` : ''}
        title="${esc(c.label)}${c.sort ? ' — клик сортирует' : ''}">
        ${colLabelHTML(c)}
        ${state.sort.key === c.sort ? `<span class="reg-sort">${state.sort.dir === 'asc' ? '▲' : '▼'}</span>` : ''}
        ${resizeGripHTML(c, i === cols.length - 1)}
      </th>`;
    }).join('')}
  </tr></thead>`;
}

function cellW(c) {
  const w = columnWidth(c, state.colWidths);
  return w > 0 ? `width:var(${'--cw-' + c.key},${w}px)` : '';
}

function cellHTML(entry, key, typeNames) {
  const from = entry.from || {};
  const may = canRestore(entry);
  const restored = !!entry.restoredAt;

  switch (key) {
    case 'sel':
      return `<td><input type="checkbox" data-arc-select="${esc(entry.id)}" ${state.selected.has(entry.id) ? 'checked' : ''}></td>`;
    case 'kind': {
      const k = KIND[entry.kind] || { icon: '•', label: 'Запись' };
      return `<td><div class="arc-kind" title="${esc(k.label)}"><span class="arc-kind-ico">${k.icon}</span><span class="ell">${esc(k.label)}</span></div></td>`;
    }
    case 'title':
      return `<td><div class="arc-doc"><b class="ell" title="${esc(entry.title || '')}">${esc(entry.title || KIND_LABEL(entry.kind))}</b>
        ${entry.subtitle ? `<span class="arc-sub ell" title="${esc(entry.subtitle)}">${esc(entry.subtitle)}</span>` : ''}</div></td>`;
    case 'from':
      return `<td><div class="arc-from">
        ${from.eni ? `<span class="mono">${esc(fmtEni(from.eni))}</span>` : ''}
        ${from.ocTitle ? `<span class="ell" title="${esc(from.ocTitle)}">${esc(from.ocTitle)}</span>` : ''}
        <span class="arc-scope ell" title="${esc(from.scopeLabel || '')}">${esc(from.scopeLabel || '—')}</span>
      </div></td>`;
    case 'institution':
      return `<td><span class="ell" title="${esc(from.institution || '')}">${esc(from.institution || '—')}</span></td>`;
    case 'archivedBy':
      return `<td><span class="ell">${esc(entry.archivedBy || '—')}</span></td>`;
    case 'archivedAt':
      return `<td class="mono right">${esc(entry.archivedAt || '—')}</td>`;
    case 'docType':
      return `<td><span class="ell">${esc(docTypeOf(entry) || '—')}</span></td>`;
    case 'typeLabel':
      return `<td><span class="ell">${esc(from.typeLabel || '—')}</span></td>`;
    case 'eni':
      return `<td class="mono">${from.eni ? esc(fmtEni(from.eni)) : '—'}</td>`;
    case 'size':
      return `<td class="mono right">${esc(fmtSize(sizeOf(entry)))}</td>`;
    case 'restoredAt':
      return `<td>${restored
        ? `<span class="arc-restored-note" title="${esc(entry.restoredBy || '')}">${esc(entry.restoredAt)}</span>`
        : '<span class="muted">—</span>'}</td>`;
    case 'act':
      return `<td class="arc-act">${restored
        ? '<span class="tag-mini">возвращено</span>'
        : (may
          ? `<button class="btn btn-primary btn-sm" data-arc-restore="${esc(entry.id)}" title="Вернуть запись туда, откуда она была убрана">Вернуть</button>`
          : `<button class="btn btn-primary btn-sm" disabled title="Вернуть может администратор или сотрудник этого объекта">Вернуть</button>`)}</td>`;
    default:
      return '<td></td>';
  }
}

function rowHTML(entry, opts = {}) {
  const cols = activeColumns();
  const restored = !!entry.restoredAt;
  const cls = ['arc-tr'];
  if (restored) cls.push('arc-restored');
  if (state.openEntry === entry.id) cls.push('open');
  if (state.cursor === entry.id) cls.push('cur');
  if (opts.child) cls.push('arc-child');
  return `<tr class="${cls.join(' ')}" data-arc-row="${esc(entry.id)}" data-arc-kind="${esc(entry.kind)}">
    ${cols.map((c) => cellHTML(entry, c.key)).join('')}
  </tr>`;
}

function groupHeaderHTML(key, rows) {
  const first = rows[0];
  const from = first.from || {};
  const open = state.accOpen['grp|' + key] !== false;
  const isInst = first.kind === 'institution' || (first.from && first.from.place === 'institution');
  const title = isInst ? (from.institution || first.title) : (from.ocTitle || first.title);
  const last = rows.reduce((a, r) => (String(r.archivedAt) > a ? r.archivedAt : a), '');

  const counts = {};
  rows.forEach((r) => { counts[r.kind] = (counts[r.kind] || 0) + 1; });
  const summary = Object.entries(counts)
    .map(([k, n]) => `${n} ${plural(n, ...(KIND_PLURAL[k] || [KIND_LABEL(k), KIND_LABEL(k), KIND_LABEL(k)]))}`)
    .join(', ');

  return `<tr class="arc-group-head ${open ? '' : 'collapsed'}" data-arc-group-toggle="${esc(key)}">
    <td colspan="${activeColumns().length}"><div class="arc-group-row">
      <span class="chev">▾</span>
      <b class="ell">${esc(title || '—')}</b>
      ${from.eni ? `<span class="mono">${esc(fmtEni(from.eni))}</span>` : ''}
      ${from.institution && !isInst ? `<span class="arc-scope">${esc(from.institution)}</span>` : ''}
      <span class="muted">${esc(summary)}</span>
      <span class="muted">· ${esc(last || '—')}</span>
      ${!open ? `<span class="arc-group-collapsed">свёрнуто</span>` : ''}
    </div></td>
  </tr>${open ? rows.map((r, i) => rowHTML(r, { child: i > 0 })).join('') : ''}`;
}

function tableBodyHTML(rows) {
  if (!state.group) return rows.map((r) => rowHTML(r)).join('');

  const groups = new Map();
  rows.forEach((r) => {
    const key = groupKeyOf(r);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  });

  return Array.from(groups.entries()).map(([key, list]) => {
    if (list.length === 1 && key.startsWith('solo|')) return rowHTML(list[0]);
    return groupHeaderHTML(key, orderGroupRows(list));
  }).join('');
}

// --- разметка: панель содержимого (§7.5) ------------------------------------

function restoreFooterHTML(entry) {
  if (entry.restoredAt) {
    return `<div class="arc-panel-foot"><span class="arc-restored-note">возвращено ${esc(entry.restoredAt)}${entry.restoredBy ? ', ' + esc(entry.restoredBy) : ''}</span></div>`;
  }
  const may = canRestore(entry);
  return `<div class="arc-panel-foot">
    ${may
      ? `<button class="btn btn-primary" data-arc-restore="${esc(entry.id)}">Вернуть</button>`
      : `<button class="btn btn-primary" disabled title="Вернуть может администратор или сотрудник этого объекта">Вернуть</button>
         <span class="muted">Вернуть может администратор или сотрудник этого объекта</span>`}
  </div>`;
}

function docPanelHTML(entry) {
  const doc = (entry.payload && entry.payload.doc) || {};
  const files = docFilesOf(doc);
  const from = entry.from || {};

  const viewer = files.length ? viewerHTML({ ...doc, files }, state.openFile) : `<div class="arc-panel-empty">Файл недоступен.</div>`;

  return `<div class="arc-panel-body arc-panel-doc">
    <div class="arc-panel-viewer">${viewer}</div>
    <div class="arc-panel-meta">
      <div class="arc-panel-row"><span>Тип</span><b>${esc(doc.type || '—')}</b></div>
      <div class="arc-panel-row"><span>Номер</span><b>${esc(doc.number || '—')}</b></div>
      <div class="arc-panel-row"><span>Дата документа</span><b>${esc(doc.date || '—')}</b></div>
      <div class="arc-panel-row"><span>Откуда</span><b>${esc(from.scopeLabel || '—')}</b></div>
      <div class="arc-panel-row"><span>Объект</span><b>${esc(from.ocTitle || '—')}</b></div>
      <div class="arc-panel-row"><span>Учреждение</span><b>${esc(from.institution || '—')}</b></div>
      <div class="arc-panel-row"><span>Убрал</span><b>${esc(entry.archivedBy || '—')} · ${esc(entry.archivedAt || '—')}</b></div>
    </div>
  </div>${restoreFooterHTML(entry)}`;
}

function ocPanelHTML(entry) {
  const rec = (entry.payload && entry.payload.rec) || {};
  const resp = rec.resp || {};
  const oiList = rec.oi || [];
  // buildOcEntries изымает документы из снимка объекта при архивировании
  // (решение пользователя 04.09.2026 — возврат документа не должен тащить за
  // собой все остальные документы объекта, см. kernel/archive.js), поэтому
  // rec.docs/oi.docs у ещё-не-возвращённого объекта пусты — число документов
  // считаем по дочерним записям пакета (batchOf), это и есть исходный состав,
  // независимо от того, сколько из них уже вернули по отдельности.
  const docsN = entry.batchId
    ? batchOf(entry.batchId).filter((e) => e.kind === 'document' && e.from && e.from.ocId === rec.id).length
    : 0;

  return `<div class="arc-panel-body">
    <div class="arc-panel-row"><span>Адрес</span><b class="ell">${esc(rec.address || rec.title || '—')}</b></div>
    <div class="arc-panel-row"><span>ЕНИ</span><b class="mono">${rec.eni ? esc(fmtEni(rec.eni)) : '—'}</b></div>
    <div class="arc-panel-row"><span>Учреждение</span><b class="ell">${esc(rec.institution || '—')}</b></div>
    ${rec.podved ? `<div class="arc-panel-row"><span>Подведомственная</span><b class="ell">${esc(rec.podved)}</b></div>` : ''}
    <div class="arc-panel-row"><span>Статус</span><b>${esc(rec.status || '—')}</b></div>
    <div class="arc-panel-row"><span>Литер</span><b>${oiList.length}</b></div>
    <div class="arc-panel-row"><span>Документов</span><b>${docsN}</b></div>
    <div class="arc-panel-row"><span>Гособрегистратор</span><b>${esc(resp.gov || '—')}</b></div>
    <div class="arc-panel-row"><span>ЦОД</span><b>${esc(resp.cod || '—')}</b></div>
    <div class="arc-panel-row"><span>Оценщик</span><b>${esc(resp.appr || '—')}</b></div>
    <div class="arc-panel-row"><span>Осмотрщик</span><b>${esc(resp.insp || '—')}</b></div>
    ${oiList.length ? `<div class="arc-panel-sub">Литеры на момент архивирования</div>
      <ul class="arc-panel-list">${oiList.map((oi) => `<li>${esc(oi.letter ? 'Литера ' + oi.letter : (CARD_LABEL[oi.card] || oi.card))} · ${esc(oi.name || '')}</li>`).join('')}</ul>` : ''}
  </div>${restoreFooterHTML(entry)}`;
}

function oiPanelHTML(entry) {
  const oi = (entry.payload && entry.payload.oi) || {};
  const from = entry.from || {};
  const docsN = (oi.docs || []).length;
  const photoN = Object.values(oi.photos || {}).reduce((a, n) => a + (n || 0), 0);
  const moved = entry.payload && entry.payload.movedPhotos;

  return `<div class="arc-panel-body">
    <div class="arc-panel-row"><span>Вид</span><b>${esc(CARD_LABEL[oi.card] || oi.card || '—')}</b></div>
    <div class="arc-panel-row"><span>Литера</span><b>${esc(oi.letter || '—')}</b></div>
    <div class="arc-panel-row"><span>Наименование</span><b class="ell">${esc(oi.name || '—')}</b></div>
    <div class="arc-panel-row"><span>Объект</span><b class="ell">${esc(from.ocTitle || '—')}</b></div>
    <div class="arc-panel-row"><span>Документов</span><b>${docsN}</b></div>
    <div class="arc-panel-row"><span>Фото</span><b>${photoN}${moved ? ' (перенесены в «Фото без литеры»)' : ''}</b></div>
    ${from.ocId && !findRecordOf(entry)
      ? `<div class="arc-panel-warn">Сначала верните объект оценки — литеру некуда положить.</div>` : ''}
  </div>${restoreFooterHTML(entry)}`;
}

function instPanelHTML(entry) {
  const node = (entry.payload && entry.payload.node) || {};
  const staff = (entry.payload && entry.payload.staff) || {};
  const siblings = entry.batchId ? batchOf(entry.batchId) : [entry];
  const nodes = siblings.filter((s) => s.kind === 'institution');
  const ocs = siblings.filter((s) => s.kind === 'oc');
  const docs = siblings.filter((s) => s.kind === 'document');

  return `<div class="arc-panel-body">
    <div class="arc-panel-row"><span>Название</span><b class="ell">${esc(node.name || '—')}</b></div>
    ${node.note ? `<div class="arc-panel-row"><span>Пояснение</span><b class="ell">${esc(node.note)}</b></div>` : ''}
    <div class="arc-panel-row"><span>Регион</span><b>${esc(node.region || '—')}</b></div>
    <div class="arc-panel-row"><span>Гособрегистратор</span><b>${esc(staff.gov || '—')}</b></div>
    <div class="arc-panel-row"><span>ЦОД</span><b>${esc(staff.cod || '—')}</b></div>
    <div class="arc-panel-row"><span>Оценщик</span><b>${esc(staff.appr || '—')}</b></div>
    <div class="arc-panel-row"><span>Осмотрщик</span><b>${esc(staff.insp || '—')}</b></div>
    <div class="arc-panel-sub">В пакете (${esc(entry.archivedAt || '—')})</div>
    <div class="arc-panel-row"><span>Учреждений</span><b>${nodes.length}</b></div>
    <div class="arc-panel-row"><span>Объектов оценки</span><b>${ocs.length}</b></div>
    <div class="arc-panel-row"><span>Документов</span><b>${docs.length}</b></div>
  </div>${restoreFooterHTML(entry)}`;
}

function dictPanelHTML(entry) {
  const dict = (entry.payload && entry.payload.dict) || {};
  const items = dict.items || [];

  return `<div class="arc-panel-body">
    <div class="arc-panel-row"><span>Название</span><b class="ell">${esc(dict.name || '—')}</b></div>
    <div class="arc-panel-row"><span>Привязка</span><b class="ell">${esc(entry.subtitle || 'Не привязан')}</b></div>
    ${dict.folder ? `<div class="arc-panel-row"><span>Папка</span><b>${esc(dict.folder)}</b></div>` : ''}
    <div class="arc-panel-row"><span>Позиций</span><b>${items.length}</b></div>
    ${items.length ? `<ul class="arc-panel-list">${items.slice(0, 200).map((it) => `<li>${esc(it.value != null ? it.value : (it.name || ''))}</li>`).join('')}</ul>` : ''}
  </div>${restoreFooterHTML(entry)}`;
}

function panelBodyHTML(entry) {
  if (entry.kind === 'document') return docPanelHTML(entry);
  if (entry.kind === 'oc') return ocPanelHTML(entry);
  if (entry.kind === 'oi') return oiPanelHTML(entry);
  if (entry.kind === 'institution') return instPanelHTML(entry);
  if (entry.kind === 'dict') return dictPanelHTML(entry);
  return '<div class="arc-panel-empty">Нет данных.</div>';
}

function contentPanelHTML() {
  const entry = state.openEntry ? entryById(state.openEntry) : null;
  const k = entry ? (KIND[entry.kind] || { icon: '•', label: 'Запись' }) : null;

  return `<div class="arc-content" style="--arc-content-w:${state.contentWidth}px">
    <div class="arc-split" data-arc-split title="Потяните, чтобы изменить ширину"></div>
    <div class="arc-content-head">
      <b>Содержимое</b>
      <button class="reg-icon-btn" data-arc-content-close title="Свернуть панель">›</button>
    </div>
    ${entry
      ? `<div class="arc-content-title"><span class="arc-kind-ico">${k.icon}</span>
          <div><b class="ell">${esc(entry.title || k.label)}</b><span class="muted">${esc(entry.archivedAt || '')} · ${esc(entry.archivedBy || '')}</span></div></div>
        ${panelBodyHTML(entry)}`
      : `<div class="arc-panel-empty">Выберите запись слева — здесь откроется её содержимое.</div>`}
  </div>`;
}

function contentTabHTML() {
  return `<button class="arc-content-tab" data-arc-content-open title="Показать панель содержимого"><span>Содержимое</span></button>`;
}

// --- сборка экрана ------------------------------------------------------------

function emptyStateHTML(hasAny) {
  return hasAny
    ? `<div class="arc-empty">Ничего не найдено. Снимите часть условий — счётчики у фильтров показывают, что останется.</div>`
    : `<div class="arc-empty">В архиве пока ничего нет.<br>Сюда попадает всё, что убирают из работы: документы, объекты оценки,
        литеры, учреждения, справочники. Ничего не удаляется безвозвратно.</div>`;
}

function viewHTML() {
  if (!state.columns) state.columns = normalizeOrder(COLUMNS, DEFAULT_COLUMNS, DEFAULT_COLUMNS);

  const all = visibleEntries(canSeeInstitution);
  const rows = queryArchive(state, canSeeInstitution);
  applySort(rows);
  const dims = computeFacets(all);
  const facets = archiveFacets(canSeeInstitution);

  const typeNames = {};
  sortedTypes().forEach((t) => { typeNames[t.manifest.id] = t.manifest.label || t.manifest.id; });

  const scopeNote = seesEverything()
    ? 'Виден архив по всем учреждениям.'
    : `Виден архив учреждений: ${esc(myInstitutions().join(', '))}.`;

  const sel = state.selected.size;
  const cols = activeColumns();

  return `<div class="arc arc3">
    <div class="arc-head">
      <div>
        <h2>Архив</h2>
        <div class="arc-note">${scopeNote} Всего в архиве: <b>${facets.total}</b>.</div>
      </div>
      <div class="arc-search">
        <input class="input" data-arc-q value="${esc(state.q)}" autocomplete="off"
          placeholder="Поиск: название, тип, объект, ЕНИ, учреждение, кто убрал, имя файла…">
      </div>
      <label class="arc-group-toggle">
        <input type="checkbox" data-arc-group ${state.group ? 'checked' : ''}>
        По объекту
      </label>
    </div>

    ${chipsHTML(typeNames)}

    <div class="arc-main">
      ${state.panel ? filtersHTML(dims, typeNames) : filtersTabHTML()}

      <div class="arc-center">
        <div class="arc-toolbar">
          ${sel ? `<div class="arc-bulk">
            <span>выбрано <b>${sel}</b></span>
            <button class="btn btn-ghost btn-sm" data-arc-bulk="restore">Вернуть выбранное</button>
            <button class="btn btn-ghost btn-sm" data-arc-bulk="export">Выгрузить список</button>
            <button class="btn btn-ghost btn-sm" data-arc-bulk="clear">Снять выделение</button>
          </div>` : `<div class="arc-toolbar-tools">
            <button class="btn btn-ghost btn-sm" data-arc-export title="Выгрузить видимые записи в CSV">Экспорт CSV</button>
          </div>`}
          <div class="dd arc-cols-dd ${colsMenuOpen ? 'open' : ''}" data-cols-dd>
            <button class="reg-icon-btn" data-dd-toggle title="Столбцы">⋮⋮</button>
            <div class="dd-menu reg-cols">${columnsMenuHTML(COLUMNS, state.columns)}</div>
          </div>
        </div>

        <div class="arc-list" data-arc-cols-box>
          ${rows.length ? `<table class="tbl arc-tbl">
            ${colGroupHTML(cols, state.colWidths)}
            ${theadHTML(rows)}
            <tbody data-arc-tbody>${tableBodyHTML(rows)}</tbody>
          </table>` : emptyStateHTML(facets.total > 0)}
        </div>
        ${rows.length ? `<div class="arc-count">Показано: <b>${rows.length}</b> из ${facets.total}</div>` : ''}
      </div>

      ${state.contentOpen ? contentPanelHTML() : contentTabHTML()}
    </div>
  </div>`;
}

// --- монтирование --------------------------------------------------------------

export function mountArchive(host) {
  const scope = host.scope;
  document.body.dataset.page = 'archive';
  setActiveNav('archive');
  setCrumbs([{ label: 'Главная', to: '#/' }, { label: 'Архив', current: true }]);
  host.ensureStyle('./app/kernel/docViewer.css');

  let fitting = false;
  function fitCols() {
    const box = scope.$('[data-arc-cols-box]');
    if (!box || fitting) return;
    fitting = true;
    applyFit(box, activeColumns(), state.colWidths, 0);
    fitting = false;
  }

  function visibleRows() {
    const rows = queryArchive(state, canSeeInstitution);
    applySort(rows);
    return rows;
  }

  // Плоский порядок строк, видимых на экране прямо сейчас, — для клавиатуры
  // (§15): в режиме группировки в него входят только раскрытые строки, а
  // свёрнутые группы клавишами не листаются построчно.
  function cursorRows() {
    const rows = visibleRows();
    if (!state.group) return rows;
    const groups = new Map();
    rows.forEach((r) => {
      const key = groupKeyOf(r);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });
    const out = [];
    groups.forEach((list, key) => {
      if (list.length === 1 && key.startsWith('solo|')) { out.push(list[0]); return; }
      if (state.accOpen['grp|' + key] === false) return;
      out.push(...orderGroupRows(list));
    });
    return out;
  }

  function render() {
    scope.setHTML(viewHTML());
    bind();
    fitCols();
  }

  async function doRestore(id) {
    const entry = entryById(id);
    if (!entry) return null;

    if (!canRestore(entry)) {
      host.toast('Вернуть может администратор или сотрудник этого объекта', 'warn');
      return null;
    }
    // Объект/литеру/учреждение объекта, если те ещё в архиве, поднимают сами
    // restoreDoc/restoreRecordEntry/restoreInstitutionBranchByName (решение
    // пользователя 04.09.2026) — отдельной блокирующей проверки здесь больше
    // не нужно; для ОИ, чей ОЦ не нашёлся вовсе, restoreOiEntry вернёт
    // {blocked:'oc'} — обработано ниже тем же сообщением, что и раньше.

    const res = await restoreEntry(entry.id);
    if (!res) {
      host.toast('Вернуть эту запись пока нельзя', 'warn');
      return null;
    }
    if (res.blocked === 'oc') { host.toast('Сначала верните объект оценки — литеру некуда положить', 'warn'); return res; }
    if (res.blocked === 'eni') { host.toast('Код ЕНИ занят живой записью — возврат запрещён настройкой уникальности кода', 'warn'); return res; }

    if (entry.kind === 'oc') {
      host.toast(res.lostInstitution
        ? 'Объект возвращён нераспределённым: его учреждение в архиве'
        : `Объект оценки возвращён: ${res.oiCount} ОИ, ${res.docs} документов`, 'ok');
    } else if (entry.kind === 'oi') {
      host.toast(`Объект имущества возвращён: ${res.restoredTo || 'объект оценки'}`, 'ok');
    } else if (entry.kind === 'institution') {
      host.toast(res.single
        ? `Учреждение возвращено: ${res.node ? res.node.name : entry.title}`
        : `Возвращено: ${res.nodes} ${plural(res.nodes, 'учреждение', 'учреждения', 'учреждений')}`
          + `, ${res.oc} ${plural(res.oc, 'объект оценки', 'объекта оценки', 'объектов оценки')}`
          + (res.docs ? `, ${res.docs} ${plural(res.docs, 'документ', 'документа', 'документов')}` : ''), 'ok');
    } else if (entry.kind === 'dict') {
      const slot = entry.payload && entry.payload.dict && entry.payload.dict.slot;
      if (res.catalogGone) host.toast('Справочник возвращён нераспределённым: каталог, к которому он был привязан, больше не существует', 'warn');
      else if (res.conflict) host.toast(`Справочник возвращён без привязки: поле «${slot ? slot.label : ''}» уже занято справочником «${res.conflict.name}»`, 'warn');
      else if (slot) host.toast(`Справочник возвращён: снова привязан к полю «${slot.label}»`, 'ok');
      else host.toast('Справочник возвращён', 'ok');
    } else if (res.movedToOc) {
      host.toast('Литеры уже нет — документ возвращён в документы объекта оценки', 'ok');
    } else if (res.lostLinks && res.lostLinks.length) {
      host.toast(`Документ возвращён в реестр. Не восстановлены привязки: ${res.lostLinks.join(', ')}`, 'warn');
    } else {
      host.toast(`Документ возвращён: ${res.restoredTo}`, 'ok');
    }
    return res;
  }

  function bind() {
    const q = scope.$('[data-arc-q]');
    if (q) {
      q.oninput = () => {
        state.q = q.value;
        const pos = q.selectionStart;
        render();
        const again = scope.$('[data-arc-q]');
        if (again) { again.focus(); again.setSelectionRange(pos, pos); }
      };
    }

    // --- фильтры ---
    scope.$$('[data-arc-f-kind]').forEach((cb) => cb.onchange = () => toggleFacet('kind', cb.dataset.arcFKind, cb.checked));
    scope.$$('[data-arc-f-doctype]').forEach((cb) => cb.onchange = () => toggleFacet('docType', cb.dataset.arcFDoctype, cb.checked));
    scope.$$('[data-arc-f-typeid]').forEach((cb) => cb.onchange = () => toggleFacet('typeId', cb.dataset.arcFTypeid, cb.checked));
    scope.$$('[data-arc-f-inst]').forEach((cb) => cb.onchange = () => toggleFacet('institution', cb.dataset.arcFInst, cb.checked));
    scope.$$('[data-arc-f-by]').forEach((cb) => cb.onchange = () => toggleFacet('archivedBy', cb.dataset.arcFBy, cb.checked));

    scope.$$('[data-acc-toggle]').forEach((h) => h.onclick = () => {
      const key = h.dataset.accToggle;
      state.accOpen[key] = state.accOpen[key] === false;
      render();
    });

    const from = scope.$('[data-arc-from]');
    if (from) from.onchange = () => { state.from = from.value; render(); };
    const to = scope.$('[data-arc-to]');
    if (to) to.onchange = () => { state.to = to.value; render(); };

    const mine = scope.$('[data-arc-mine]');
    if (mine) mine.onchange = () => { state.mine = mine.checked; render(); };
    const showRestored = scope.$('[data-arc-show-restored]');
    if (showRestored) showRestored.onchange = () => { state.showRestored = showRestored.checked; render(); };

    scope.$$('[data-arc-unchip]').forEach((b) => b.onclick = () => {
      const [dim, v] = b.dataset.arcUnchip.split('|');
      if (dim === 'mine') state.mine = false;
      else if (dim === 'from') state.from = '';
      else if (dim === 'to') state.to = '';
      else { const i = state[dim].indexOf(v); if (i >= 0) state[dim].splice(i, 1); }
      render();
    });

    const reset = scope.$('[data-arc-reset]');
    if (reset) reset.onclick = () => {
      state.q = ''; state.kind = []; state.docType = []; state.institution = [];
      state.typeId = []; state.archivedBy = []; state.from = ''; state.to = '';
      state.showRestored = false; state.mine = false;
      render();
    };

    const panelClose = scope.$('[data-arc-panel-close]');
    if (panelClose) panelClose.onclick = () => { state.panel = false; render(); };
    const panelOpen = scope.$('[data-arc-panel-open]');
    if (panelOpen) panelOpen.onclick = () => { state.panel = true; render(); };

    const groupToggle = scope.$('[data-arc-group]');
    if (groupToggle) groupToggle.onchange = () => { state.group = groupToggle.checked; render(); };

    scope.$$('[data-arc-group-toggle]').forEach((h) => h.onclick = () => {
      const key = 'grp|' + h.dataset.arcGroupToggle;
      state.accOpen[key] = state.accOpen[key] === false;
      render();
    });

    // --- выбор строк и групповые действия (§7.7) ---
    scope.$$('[data-arc-select]').forEach((cb) => {
      cb.onclick = (e) => e.stopPropagation();
      cb.onchange = () => {
        if (cb.checked) state.selected.add(cb.dataset.arcSelect);
        else state.selected.delete(cb.dataset.arcSelect);
        render();
      };
    });
    const selectAll = scope.$('[data-arc-select-all]');
    if (selectAll) selectAll.onchange = () => {
      const rows = visibleRows();
      if (selectAll.checked) rows.forEach((r) => state.selected.add(r.id));
      else rows.forEach((r) => state.selected.delete(r.id));
      render();
    };

    scope.$$('[data-arc-bulk]').forEach((b) => b.onclick = async () => {
      const kind = b.dataset.arcBulk;
      if (kind === 'clear') { state.selected.clear(); render(); return; }
      if (kind === 'export') {
        const ids = new Set(state.selected);
        exportCsv(activeColumns(), visibleRows().filter((r) => ids.has(r.id)));
        return;
      }
      if (kind === 'restore') {
        const ids = Array.from(state.selected);
        let ok = 0; let fail = 0;
        for (const id of ids) {
          const res = await doRestoreSilently(id);
          if (res && !res.blocked) ok++; else fail++;
        }
        state.selected.clear();
        render();
        host.toast(fail
          ? `Возвращено: ${ok}. Не удалось: ${fail} — записи остались в архиве`
          : `Возвращено: ${ok}`, fail ? 'warn' : 'ok');
      }
    });

    const exportBtn = scope.$('[data-arc-export]');
    if (exportBtn) exportBtn.onclick = () => exportCsv(activeColumns(), visibleRows());

    // --- строки: открыть содержимое кликом (§7.5) ---
    scope.$$('[data-arc-row]').forEach((tr) => tr.onclick = (e) => {
      if (e.target.closest('button, input, a')) return;
      const id = tr.dataset.arcRow;
      state.openEntry = state.openEntry === id ? state.openEntry : id;
      state.openFile = null;
      state.contentOpen = true;
      state.cursor = id;
      render();
    });

    scope.$$('[data-arc-restore]').forEach((b) => b.onclick = async () => {
      await doRestore(b.dataset.arcRestore);
      render();
    });

    // --- панель содержимого ---
    const contentClose = scope.$('[data-arc-content-close]');
    if (contentClose) contentClose.onclick = () => { state.contentOpen = false; render(); };
    const contentOpen = scope.$('[data-arc-content-open]');
    if (contentOpen) contentOpen.onclick = () => { state.contentOpen = true; render(); };

    const openEntry = state.openEntry ? entryById(state.openEntry) : null;
    if (openEntry && openEntry.kind === 'document') {
      const doc = openEntry.payload && openEntry.payload.doc;
      const files = docFilesOf(doc);
      if (files.length) {
        bindViewer(scope, {
          doc: { ...doc, files },
          activeFileId: state.openFile,
          onFileChange: (id) => { state.openFile = id; render(); },
        });
      }
    }

    const split = scope.$('[data-arc-split]');
    if (split) split.onpointerdown = (e) => {
      e.preventDefault();
      const main = scope.$('.arc-main');
      if (!main) return;
      const x0 = e.clientX;
      const w0 = state.contentWidth;
      const max = Math.max(CONTENT_MIN, main.getBoundingClientRect().width - LIST_MIN);

      split.setPointerCapture(e.pointerId);
      split.classList.add('active');
      document.body.classList.add('col-resizing');

      const move = (ev) => {
        state.contentWidth = Math.max(CONTENT_MIN, Math.min(max, w0 - Math.round(ev.clientX - x0)));
        const box = scope.$('.arc-content');
        if (box) box.style.setProperty('--arc-content-w', state.contentWidth + 'px');
      };
      const up = () => {
        split.releasePointerCapture(e.pointerId);
        split.removeEventListener('pointermove', move);
        split.removeEventListener('pointerup', up);
        split.classList.remove('active');
        document.body.classList.remove('col-resizing');
        fitCols();
      };
      split.addEventListener('pointermove', move);
      split.addEventListener('pointerup', up);
    };

    // --- столбцы (kernel/columns.js) ---
    const applyOrder = (order) => { state.columns = normalizeOrder(COLUMNS, order, DEFAULT_COLUMNS); render(); };
    bindColumnsMenu(scope, {
      defs: COLUMNS, order: state.columns,
      onOrder: applyOrder,
      onReset() { state.columns = DEFAULT_COLUMNS.slice(); state.colWidths = {}; render(); },
    });
    bindColumnReorder(scope, { headSel: '[data-arc-cols-box] thead tr', order: state.columns, onCommit: applyOrder });
    bindColumnResize(scope, {
      rootSel: '[data-arc-cols-box]',
      cols: activeColumns(),
      widths: state.colWidths,
      onCommit(patch) { Object.assign(state.colWidths, patch); render(); },
    });

    scope.$$('[data-sort]').forEach((th) => th.onclick = (e) => {
      if (e.target.closest('[data-col-grip]')) return;
      const key = th.dataset.sort;
      state.sort = state.sort.key === key ? { key, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' };
      render();
    });

    scope.$$('[data-dd-toggle]').forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      const dd = b.closest('.dd');
      const wasOpen = dd.classList.contains('open');
      document.querySelectorAll('.dd.open').forEach((d) => d.classList.remove('open'));
      if (!wasOpen) dd.classList.add('open');
      colsMenuOpen = dd.hasAttribute('data-cols-dd') && !wasOpen;
    });
  }

  // Групповой возврат идёт «тихо» — общий тост печатается один раз в конце
  // (§5.2 «возврат не молчит», но не построчно на 50 записей).
  async function doRestoreSilently(id) {
    const entry = entryById(id);
    if (!entry || !canRestore(entry)) return null;
    return restoreEntry(entry.id);
  }

  // --- клавиатура (§15): ↑/↓ по строкам, Enter — открыть, Space — флажок, Esc — снять выбор ---
  scope.onDocument('keydown', (e) => {
    if (document.body.dataset.page !== 'archive') return;
    const t = e.target;
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable="true"], .modal, .viewer')) return;

    if (e.key === 'Escape') {
      if (state.selected.size) { state.selected.clear(); render(); }
      return;
    }
    const rows = cursorRows();
    if (!rows.length) return;
    const idx = rows.findIndex((r) => r.id === state.cursor);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      state.cursor = rows[Math.min(rows.length - 1, idx + 1)].id;
      render();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.cursor = rows[Math.max(0, idx - 1)].id;
      render();
    } else if (e.key === 'Enter' && state.cursor) {
      e.preventDefault();
      state.openEntry = state.cursor;
      state.openFile = null;
      state.contentOpen = true;
      render();
    } else if (e.key === ' ' && state.cursor) {
      e.preventDefault();
      if (state.selected.has(state.cursor)) state.selected.delete(state.cursor);
      else state.selected.add(state.cursor);
      render();
    }
  });

  // Закрытие дропдауна столбцов по клику вне него — регистрируется один раз
  // на весь срок жизни страницы (см. ocMenu.js: тот же приём).
  scope.onDocument('click', (e) => {
    if (e.target.closest('.dd')) return;
    document.querySelectorAll('.dd.open').forEach((d) => d.classList.remove('open'));
    colsMenuOpen = false;
  });

  render();

  const roBox = scope.$('[data-arc-cols-box]');
  let ro = null;
  if (typeof ResizeObserver === 'function' && roBox) {
    ro = new ResizeObserver(() => fitCols());
    ro.observe(roBox);
  }

  // Смена роли или списка учреждений меняет видимый архив — перерисовываем.
  const off = session.subscribe(() => render());

  return {
    onRoute() { render(); },
    destroy() { if (off) off(); if (ro) ro.disconnect(); },
  };
}

function toggleFacet(key, value, on) {
  const list = state[key];
  const i = list.indexOf(value);
  if (on && i < 0) list.push(value);
  if (!on && i >= 0) list.splice(i, 1);
}
