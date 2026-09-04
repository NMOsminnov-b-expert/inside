// Раздел «Учреждения»: дерево слева, карточка учреждения справа.
//
// Учреждение вкладывается в учреждение на любую глубину (kernel/institutions.js),
// поэтому слева именно дерево, а не список: у узла видно и своих объектов, и
// счётчик по всей ветке. Справа — то, ради чего раздел открывают: объекты
// оценки этого учреждения и его документы, плюс правка самого учреждения.
//
// Раскладка повторяет карточку ОЦ: панель слева, содержимое справа, вкладки над
// таблицей, ширины столбцов тянутся перегородками (kernel/columns.js).
import { esc } from '../../kernel/dom.js';
import { fmtEni, eniRegion } from '../../kernel/fmt.js';
import { setCrumbs, setActiveNav } from '../../shell/shell.js';
import { MENU_HREF, DOCS_HREF, build } from '../../kernel/router.js';
import {
  colGroupHTML, headAttrs, colLabelHTML, resizeGripHTML, columnVarsStyle, bindColumnResize,
  applyFit,
} from '../../kernel/columns.js';
import { session, myInstitutions } from '../../kernel/session.js';
import {
  allNodes, getNode, childrenOf, pathOf, levelOf, subtreeOf, ocCount, docCount, totalCount,
  ocRowsOf, subtreeRowsOf, docRowsOf, createNode, updateNode, moveNode, removeNode, attachRecords,
  detachRecords, candidates, isFavorite, toggleFavorite, favoriteNodes, searchNodes, regionOf,
  canAssignStaff, staffList, staffOf, staffFilled, STAFF_ROLES,
} from '../../kernel/institutions.js';
import {
  ALL_COLUMNS, emptyAllFilter, allPaneHTML, bindAllPane,
} from './allObjects.js';
import {
  regionTree, searchRegions, splitRegion, areaOf, districtOf, areaFromEniRegion, SEP,
} from '../../kernel/regions.js';
import {
  DOC_TYPES, DOC_STATUSES, statusTone, createDocument, updateDocument, removeDocument,
  getDocument, queryDocuments, addFile, detectAutoStatus,
} from '../../kernel/documentsRegistry.js';
import { pickFile, attachedFileFrom, isFileTooLarge, MAX_DOC_FILE_MB } from '../../kernel/fileUpload.js';
import { archiveRegistryDoc } from '../../kernel/archive.js';
import { viewerHTML, bindViewer } from '../../kernel/docViewer.js';

const state = {
  mode: 'tree',        // 'tree' — по иерархии, 'region' — по регионам
  q: '',               // поиск по дереву
  open: {},            // раскрытые узлы: { id: true }
  selected: null,      // выбранный узел
  tab: 'oc',           // вкладка справа: 'oc' | 'all' | 'docs'
  rowQ: '',            // поиск внутри таблицы
  attach: null,        // открыт диалог привязки: { q }
  edit: null,          // правка узла: { id | 'new', parentId, name, note, region }
  onlyMine: false,     // показывать только свои учреждения
  panel: true,         // раскрыта ли панель дерева
  regionPick: null,    // открыт выбор региона в форме: { q }
  attachPicked: {},    // отмеченные объекты в окне привязки
  attachType: '',      // фильтр привязки по типу ОЦ
  openRegion: {},      // раскрытые узлы в виде «по регионам»

  // Документы учреждения: что открыто в просмотрщике, что создаётся строкой,
  // открыта ли панель прикрепления и что в ней выбрано для предпросмотра.
  docOpen: null,       // id документа, показанного в просмотрщике
  docFile: null,       // активный файл внутри документа
  docNew: null,        // черновик нового документа: { type, number, date, files }
  docAttach: null,     // панель прикрепления: { q, preview }
  docList: true,       // показан ли список документов рядом с просмотрщиком

  // Сводная вкладка: фильтры по объектам всего поддерева (allObjects.js).
  all: emptyAllFilter(),
};

// Ширина панели дерева. Тянется перегородкой — как столбцы справочников и
// таблиц (kernel/columns.js): человеку нужно то шире дерево, то шире карточка.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: это личная настройка показа, здесь живёт в памяти
// вкладки.
// Те же соображения, что и у перегородки документов: пределы не должны
// упираться раньше, чем этого захочет человек.
const PANEL_MIN = 180;
const PANEL_MAX_SHARE = 0.55;   // не больше половины с небольшим от ширины окна
let panelWidth = 320;

// Ширина списка документов рядом с просмотрщиком. Тянется перегородкой — тот
// же приём, что у просмотрщика в карточках ОЦ (modules/*/parts/viewer/shell.js).
// Пределы намеренно широкие (пользователь 03.09.2026: «не даёт радикально
// увеличивать/уменьшать»): нижний — чтобы в строке осталось видно тип и дату,
// верхний считается от самой рамки, а не константой — просмотрщику достаточно
// оставить DOC_VIEW_MIN, всё остальное список может забрать.
const DOC_LIST_MIN = 150;
const DOC_VIEW_MIN = 220;
let docListWidth = 340;

// Максимум зависит от ширины блока: на широком экране список тянется почти во
// всю рамку, на узком — не съедает просмотрщик целиком.
function docListMax(box) {
  const total = box ? box.getBoundingClientRect().width : 0;
  return Math.max(DOC_LIST_MIN, total - DOC_VIEW_MIN);
}

const allWidths = {};

const OC_COLUMNS = [
  { key: 'eni', label: 'ЕНИ', width: 170, minWidth: 120 },
  { key: 'address', label: 'Адрес', width: 0, minWidth: 160 },
  { key: 'region', label: 'Регион', width: 120, minWidth: 90 },
  { key: 'status', label: 'Статус', width: 130, minWidth: 100 },
  { key: 'type', label: 'Тип ОЦ', width: 190, minWidth: 120 },
  { key: 'oi', label: 'ОИ', width: 74, minWidth: 60 },
  { key: 'act', label: '', width: 46, fixed: true },
];

const DOC_COLUMNS = [
  { key: 'type', label: 'Тип', width: 190, minWidth: 120 },
  { key: 'name', label: 'Наименование', width: 0, minWidth: 160 },
  { key: 'date', label: 'Дата документа', width: 150, minWidth: 110 },
  { key: 'status', label: 'Статус', width: 140, minWidth: 100 },
];

const ocWidths = {};
const docWidths = {};


// Свои учреждения — те, за которыми закреплён сотрудник (kernel/session.js).
// Ветка считается своей, если своё само учреждение или что-то под ним: иначе
// фильтр «мои» прятал бы родителя и до подведомственного было бы не добраться.
function isMine(node) {
  return myInstitutions().includes(node.name);
}

function hasMineInside(node) {
  return subtreeOf(node.id).some(isMine);
}

function toggleMine(node) {
  const list = (session.state.institutions || []).slice();
  const i = list.indexOf(node.name);
  if (i < 0) list.push(node.name);
  else list.splice(i, 1);
  session.set({ institutions: list });
  return i < 0;
}

// Значки узлов: папка у учреждения с подведомственными (раскрытая — когда узел
// развёрнут) и лист у конечного. Заливка, а не контур: контурные значки
// сливались с текстом (пользователь 03.09.2026).
const ICON_FOLDER = `<svg class="itree-svg folder" viewBox="0 0 16 14" width="15" height="13" aria-hidden="true">
  <path d="M1.2 3.2A1.2 1.2 0 0 1 2.4 2h3.3l1.4 1.6h5.5a1.2 1.2 0 0 1 1.2 1.2v6A1.2 1.2 0 0 1 12.6 12H2.4a1.2 1.2 0 0 1-1.2-1.2z"/>
</svg>`;

const ICON_FOLDER_OPEN = `<svg class="itree-svg folder open" viewBox="0 0 16 14" width="15" height="13" aria-hidden="true">
  <path d="M1.2 3.2A1.2 1.2 0 0 1 2.4 2h3.3l1.4 1.6h5.5a1.2 1.2 0 0 1 1.2 1.2v1H1.2z"/>
  <path d="M1.2 6.2h13.3l-1.6 5a1.2 1.2 0 0 1-1.14.8H2.4a1.2 1.2 0 0 1-1.2-1.2z" opacity=".72"/>
</svg>`;

const ICON_LEAF = `<svg class="itree-svg leaf" viewBox="0 0 12 14" width="12" height="13" aria-hidden="true">
  <path d="M2 1.6h4.6L10 5v7.4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2.6a1 1 0 0 1 1-1z" opacity=".2"/>
  <path d="M2.6 1.4h4.2l3.2 3.2v7.6a1.2 1.2 0 0 1-1.2 1.2H2.6a1.2 1.2 0 0 1-1.2-1.2V2.6a1.2 1.2 0 0 1 1.2-1.2z"
    fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
  <path d="M6.8 1.4v3.4h3.2" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
</svg>`;

// --- дерево ----------------------------------------------------------------

function nodeRowHTML(node, depth) {
  if (state.onlyMine && !hasMineInside(node)) return '';

  const kids = childrenOf(node.id);
  const open = !!state.open[node.id];
  const on = state.selected === node.id;
  const total = totalCount(node);

  return `<div class="itree-node">
    <div class="itree-row ${on ? 'on' : ''} ${isMine(node) ? 'mine' : ''}"
      data-inode="${esc(node.id)}" style="--depth:${depth}">
      ${kids.length
        ? `<button class="itree-chev ${open ? 'open' : ''}" data-inode-toggle="${esc(node.id)}"
             title="${open ? 'Свернуть' : 'Развернуть'}">›</button>`
        : '<span class="itree-dot">•</span>'}
      <span class="itree-ico">${kids.length ? (open ? ICON_FOLDER_OPEN : ICON_FOLDER) : ICON_LEAF}</span>
      <span class="itree-name">${esc(node.name)}</span>
      ${isMine(node) ? '<i class="itree-mine" title="Ваше учреждение">●</i>' : ''}
      ${total ? `<span class="itree-count">${total}</span>` : ''}
      <button class="itree-fav ${isFavorite(node.id) ? 'on' : ''}" data-inode-fav="${esc(node.id)}"
        title="${isFavorite(node.id) ? 'Убрать из избранного' : 'Закрепить в избранном'}">★</button>
    </div>
    ${open && kids.length ? `<div class="itree-kids">
      ${kids.map((k) => nodeRowHTML(k, depth + 1)).join('')}
    </div>` : ''}
  </div>`;
}

function treeHTML() {
  if (state.q) {
    const found = searchNodes(state.q);
    return `<div class="itree">
      ${found.length ? found.map((n) => `<div class="itree-row search ${state.selected === n.id ? 'on' : ''}"
          data-inode="${esc(n.id)}">
          <span class="itree-ico">${childrenOf(n.id).length ? ICON_FOLDER : ICON_LEAF}</span>
          <span class="itree-name">${esc(n.name)}</span>
          <span class="itree-path">${esc(pathOf(n.id).slice(0, -1).map((p) => p.name).join(' / '))}</span>
        </div>`).join('')
        : '<div class="itree-empty">Ничего не найдено</div>'}
    </div>`;
  }

  const roots = allNodes().filter((n) => !n.parentId);
  return `<div class="itree">${roots.map((r) => nodeRowHTML(r, 0)).join('')}</div>`;
}

// «По регионам»: то же деление, что в справочнике регионов — область → район →
// населённый пункт → учреждения (структура задана пользователем 03.09.2026).
// Регион у учреждения — либо заданный вручную, либо посчитанный по объектам:
// область там выводится из первой цифры ЕНИ, поэтому глубже области такие узлы
// не опускаются.
function regionGroups() {
  const groups = new Map();

  allNodes().filter((n) => n.parentId).forEach((node) => {
    if (state.onlyMine && !isMine(node)) return;
    if (state.q && !node.name.toLowerCase().includes(state.q.toLowerCase())) return;

    const raw = regionOf(node);
    const parts = splitRegion(raw);
    const area = parts.length ? areaFromEniRegion(parts[0]) : 'Регион не указан';
    const district = parts[1] || '';
    const place = parts[2] || '';

    if (!groups.has(area)) groups.set(area, { name: area, nodes: [], kids: new Map() });
    const areaBox = groups.get(area);

    if (!district) { areaBox.nodes.push(node); return; }

    if (!areaBox.kids.has(district)) {
      areaBox.kids.set(district, { name: district, nodes: [], kids: new Map() });
    }
    const districtBox = areaBox.kids.get(district);

    if (!place) { districtBox.nodes.push(node); return; }

    if (!districtBox.kids.has(place)) {
      districtBox.kids.set(place, { name: place, nodes: [], kids: new Map() });
    }
    districtBox.kids.get(place).nodes.push(node);
  });

  return groups;
}

function regionCount(box) {
  let n = box.nodes.length;
  box.kids.forEach((kid) => { n += regionCount(kid); });
  return n;
}

function regionNodeHTML(box, key, depth) {
  const open = state.openRegion[key] !== false;
  const kids = [...box.kids.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  return `<div class="itree-node">
    <div class="itree-row region" data-iregion="${esc(key)}" style="--depth:${depth}">
      <button class="itree-chev ${open ? 'open' : ''}" data-iregion-toggle="${esc(key)}"
        title="${open ? 'Свернуть' : 'Развернуть'}">›</button>
      <span class="itree-ico">${open ? ICON_FOLDER_OPEN : ICON_FOLDER}</span>
      <span class="itree-name">${esc(box.name)}</span>
      <span class="itree-count">${regionCount(box)}</span>
    </div>

    ${open ? `<div class="itree-kids">
      ${kids.map((kid) => regionNodeHTML(kid, key + SEP + kid.name, depth + 1)).join('')}
      ${box.nodes.sort((a, b) => a.name.localeCompare(b.name, 'ru')).map((n) => `
        <div class="itree-row ${state.selected === n.id ? 'on' : ''} ${isMine(n) ? 'mine' : ''}"
          data-inode="${esc(n.id)}" style="--depth:${depth + 1}">
          <span class="itree-dot">•</span>
          <span class="itree-ico">${childrenOf(n.id).length ? ICON_FOLDER : ICON_LEAF}</span>
          <span class="itree-name">${esc(n.name)}</span>
          ${isMine(n) ? '<i class="itree-mine" title="Ваше учреждение">●</i>' : ''}
          ${totalCount(n) ? `<span class="itree-count">${totalCount(n)}</span>` : ''}
        </div>`).join('')}
    </div>` : ''}
  </div>`;
}

function regionTreeHTML() {
  const groups = regionGroups();

  const list = [...groups.values()].sort((a, b) => {
    if (a.name === 'Регион не указан') return 1;
    if (b.name === 'Регион не указан') return -1;
    return a.name.localeCompare(b.name, 'ru');
  });

  return `<div class="itree">
    ${list.length ? list.map((box) => regionNodeHTML(box, box.name, 0)).join('')
      : '<div class="itree-empty">Ничего не найдено</div>'}
  </div>`;
}

function panelHTML() {
  const favs = favoriteNodes();

  // Свёрнутая панель — не обрубок с кнопкой, а узкая полоса с вертикальной
  // подписью и счётчиком: видно, что это дерево учреждений и сколько их.
  if (!state.panel) {
    const total = allNodes().filter((n) => n.parentId).length;
    return `<aside class="ipanel collapsed" data-ipanel-open title="Развернуть дерево учреждений">
      <button class="ipanel-open" data-ipanel>›</button>
      <div class="ipanel-vertical">Учреждения<b>${total}</b></div>
    </aside>`;
  }

  return `<aside class="ipanel" style="--panel-w:${panelWidth}px">
    <div class="ipanel-head">
      <b>Учреждения</b>
      <button class="ipanel-toggle" data-ipanel title="Свернуть панель">‹</button>
    </div>

    <div class="ipanel-tabs">
      <button class="ipanel-tab ${state.mode === 'tree' ? 'on' : ''}" data-imode="tree">По иерархии</button>
      <button class="ipanel-tab ${state.mode === 'region' ? 'on' : ''}" data-imode="region">По регионам</button>
    </div>

    <div class="ipanel-search">
      <svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true">
        <circle cx="6" cy="6" r="4.1" fill="none" stroke="currentColor" stroke-width="1.4"/>
        <path d="M9.2 9.2 12.4 12.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
      <input data-iq value="${esc(state.q)}" autocomplete="off" placeholder="Поиск учреждения">
      ${state.q ? '<button class="ipanel-clear" data-iq-clear title="Очистить">×</button>' : ''}
    </div>

    <label class="ipanel-mine ${state.onlyMine ? 'on' : ''}" title="Учреждения, закреплённые за вами">
      <input type="checkbox" data-ionly ${state.onlyMine ? 'checked' : ''}>
      <span>Только мои</span>
      <b>${myInstitutions().length}</b>
    </label>

    <div class="ipanel-body">${state.mode === 'tree' ? treeHTML() : regionTreeHTML()}</div>

    <div class="ipanel-foot">
      <div class="ipanel-foot-head">★ Избранное</div>
      ${favs.length
        ? `<div class="ipanel-favs">${favs.map((n) => `<button class="ipanel-fav"
            data-inode="${esc(n.id)}" title="${esc(pathOf(n.id).map((x) => x.name).join(' / '))}">
            ${esc(n.name)}</button>`).join('')}</div>`
        : '<div class="ipanel-foot-hint">Закрепите часто открываемые узлы значком ★</div>'}
    </div>

    <div class="ipanel-grip" data-ipanel-grip title="Потянуть — изменить ширину"></div>
  </aside>`;
}

// --- карточка учреждения ---------------------------------------------------

function ocCellHTML(col, row) {
  if (col.key === 'eni') return `<td class="mono">${esc(fmtEni(row.eni))}</td>`;
  // Адрес лежит в title сводки, область считается по первой цифре ЕНИ
  // (kernel/fmt.js) — отдельного поля в записи нет.
  if (col.key === 'address') return `<td class="ell" title="${esc(row.title)}">${esc(row.title || '—')}</td>`;
  if (col.key === 'region') return `<td>${esc(eniRegion(row.eni) || '—')}</td>`;
  if (col.key === 'status') return `<td><span class="itag">${esc(row.status || '—')}</span></td>`;
  if (col.key === 'type') return `<td class="ell" title="${esc(row.typeLabel)}">${esc(row.typeLabel)}</td>`;
  if (col.key === 'oi') return `<td class="num">${row.metrics ? row.metrics.oiCount : '—'}</td>`;
  if (col.key === 'act') {
    return `<td><button class="idetach" data-detach="${esc(row.typeId)}|${esc(row.id)}"
      title="Открепить от учреждения">×</button></td>`;
  }
  return '<td></td>';
}

function ocTableHTML(node) {
  const rows = ocRowsOf(node, { q: state.rowQ });

  if (!rows.length) {
    return `<div class="iempty">
      <b>${state.rowQ ? 'Ничего не найдено' : 'Объектов оценки нет'}</b>
      <span>${state.rowQ ? 'Измените запрос или очистите поиск.'
        : 'Прикрепите существующий объект кнопкой «Прикрепить ОЦ».'}</span>
    </div>`;
  }

  return `<div class="icols" data-oc-cols-box style="${columnVarsStyle(OC_COLUMNS, ocWidths)}">
    <table class="itbl">
      ${colGroupHTML(OC_COLUMNS, ocWidths)}
      <thead><tr>${OC_COLUMNS.map((c, i) => `<th ${headAttrs(c)}>
        ${colLabelHTML(c)}${resizeGripHTML(c, i === OC_COLUMNS.length - 1)}
      </th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr data-oc-row="${esc(r.typeId)}|${esc(r.id)}">
        ${OC_COLUMNS.map((c) => ocCellHTML(c, r)).join('')}
      </tr>`).join('')}</tbody>
    </table>
  </div>`;
}

// Область просмотра документа. Просмотрщик рисуется только когда есть файлы —
// у документа их может не быть вовсе (в реестре есть записи без вложений).
// Тогда показываем пустое состояние, а администратору — сразу и кнопку
// прикрепления файла: иначе документ без файла остаётся тупиком.
function docViewHTML(doc, edit, emptyTitle, emptyHint) {
  if (!doc) {
    return `<div class="iempty small view">
      <b>${esc(emptyTitle || 'Выберите документ')}</b>
      <span>${esc(emptyHint || 'Содержимое откроется здесь — как в карточке объекта оценки.')}</span>
    </div>`;
  }

  const files = doc.files || [];
  if (files.length) return viewerHTML(doc, state.docFile);

  return `<div class="iempty small view">
    <b>${esc(doc.type || 'Документ')}: файлов нет</b>
    <span>Запись есть, вложений нет.${edit ? ' Прикрепите файл — он появится в просмотрщике.' : ''}</span>
    ${edit ? `<button class="btn btn-ghost btn-sm" data-idoc-addfile="${esc(doc.id)}"
      style="margin-top:10px">📎 Прикрепить файл</button>` : ''}
  </div>`;
}

// Документы учреждения. Таблица слева, просмотрщик справа — как в карточке ОЦ:
// открыл строку, видишь содержимое, не уходя со страницы.
function docTableHTML(node) {
  const rows = docRowsOf(node, { q: state.rowQ });
  const open = state.docOpen ? getDocument(state.docOpen) : null;
  const edit = canAssignStaff();

  // Поиск живёт над самим списком, а не отдельной полосой во всю ширину
  // (пользователь 03.09.2026): он относится к списку, и место сверху нужнее
  // просмотрщику.
  const listHead = `<div class="idoc-list-head">
      <b>Список</b>
      <span class="idocs-count">${rows.length}</span>
      <button class="idoc-list-hide" data-idoc-list-close title="Свернуть список — просмотрщику больше места">‹</button>
    </div>
    <div class="idoc-list-search">
      <span class="isearch">
        <svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true">
          <circle cx="6" cy="6" r="4.1" fill="none" stroke="currentColor" stroke-width="1.4"/>
          <path d="M9.2 9.2 12.4 12.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
        <input data-irowq value="${esc(state.rowQ)}" autocomplete="off"
          placeholder="Поиск по документам">
        ${state.rowQ ? '<button class="isearch-clear" data-irowq-clear title="Очистить">×</button>' : ''}
      </span>
    </div>`;

  const list = rows.length ? `${listHead}<div class="idoc-list">
      ${rows.map((d) => {
        const file = (d.files || [])[0];
        return `<div class="idoc-row ${state.docOpen === d.id ? 'on' : ''}" data-idoc="${esc(d.id)}">
          <span class="idoc-type">${esc(d.type || '—')}</span>
          <span class="idoc-name ell">${esc(file ? file.name : 'без файла')}</span>
          <span class="idoc-date">${esc(d.date || '—')}</span>
          <span class="docs-status ${statusTone(d.status)}">${esc(d.status)}</span>
          <span class="idoc-acts">
            <button class="idoc-act" data-idoc-goto="${esc(d.id)}"
              title="Открыть карточку документа целиком">↗</button>
            ${edit ? `<button class="idoc-act" data-idoc-detach="${esc(d.id)}"
                title="Открепить от учреждения: документ останется в реестре">⤴</button>
              <button class="idoc-act danger" data-idoc-del="${esc(d.id)}"
                title="Убрать документ в архив — оттуда его можно вернуть">×</button>` : ''}
          </span>
        </div>`;
      }).join('')}
    </div>`
    : `${listHead}<div class="iempty small">
        <b>${state.rowQ ? 'Ничего не найдено' : 'Документов нет'}</b>
        <span>${state.rowQ ? 'Измените запрос.'
          : 'Заведите новый документ или прикрепите существующий из реестра.'}</span>
      </div>`;

  // Действия вкладки — в полосе вкладок (tabActionsHTML), поэтому здесь
  // остаётся сам инструмент: список, перегородка, просмотрщик.
  return `<div class="idocs">
    ${state.docNew ? docNewHTML(node) : ''}
    ${state.docAttach ? docAttachHTML(node) : ''}

    <div class="idocs-frame">
    <div class="idocs-body ${state.docList ? '' : 'closed'}"
      style="--doc-list-w:${docListWidth}px">
      ${state.docList
        ? `<div class="idocs-left">${list}</div>
           <div class="idocs-split" data-idoc-split title="Потяните, чтобы изменить соотношение"></div>`
        : `<button class="idocs-tab" data-idoc-list-open title="Показать список документов">
             <span>Документы${rows.length ? ' · ' + rows.length : ''}</span>
           </button>`}
      <div class="idocs-view">${docViewHTML(open, edit)}</div>
    </div>
    </div>
  </div>`;
}

// Новый документ — строкой, без отдельного окна: тип, номер, дата и файл.
// Статус проставляется сам (kernel/documentsRegistry.js, detectAutoStatus).
function docNewHTML(node) {
  const d = state.docNew;
  const file = (d.files || [])[0];

  return `<div class="idoc-form">
    <div class="idoc-form-head">
      <b>Новый документ учреждения</b>
      <span>Учреждение подставится само: «${esc(node.name)}»</span>
      <button class="iattach-close" data-idoc-new-cancel title="Отмена">×</button>
    </div>

    <div class="idoc-form-grid">
      <label class="ifield">
        <span>Тип</span>
        <select class="select" data-idoc-type>
          ${DOC_TYPES.map((t) => `<option ${t === d.type ? 'selected' : ''}>${esc(t)}</option>`).join('')}
        </select>
      </label>
      <label class="ifield">
        <span>№ документа</span>
        <input class="input" data-idoc-number value="${esc(d.number)}" placeholder="как в документе">
      </label>
      <label class="ifield">
        <span>Дата документа</span>
        <input type="date" class="input" data-idoc-date value="${esc(d.date)}">
      </label>
      <div class="ifield">
        <span>Файл</span>
        ${file
          ? `<div class="idoc-file">
              <b class="ell" title="${esc(file.name)}">${esc(file.name)}</b>
              <button class="idoc-act danger" data-idoc-file-rm title="Убрать файл">×</button>
            </div>`
          : `<button class="btn btn-ghost btn-sm" data-idoc-file>📎 Выбрать файл (до ${MAX_DOC_FILE_MB} МБ)</button>`}
      </div>
    </div>

    ${d.error ? `<div class="iform-error">${esc(d.error)}</div>` : ''}

    <div class="iform-foot">
      <button class="btn btn-primary btn-sm" data-idoc-save>Создать документ</button>
      <button class="btn btn-ghost btn-sm" data-idoc-new-cancel>Отмена</button>
    </div>
  </div>`;
}

// Прикрепление существующего документа: слева список реестра с поиском, справа
// предпросмотр выбранного. Раньше документ приходилось прикреплять «слепо».
function docAttachHTML(node) {
  const a = state.docAttach;
  const { rows } = queryDocuments({ q: a.q, limit: 60 });
  const free = rows.filter((d) => d.institution !== node.name);
  const preview = a.preview ? getDocument(a.preview) : null;

  return `<div class="iattach idoc-attach">
    <div class="iattach-head">
      <b>Прикрепить документ к учреждению</b>
      <span>У документа сменится учреждение — сам документ и его файлы останутся
        в реестре «Документы».</span>
      <button class="iattach-close" data-idoc-attach-close title="Закрыть">×</button>
    </div>

    <div class="iattach-tools">
      <span class="iattach-search">
        <svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true">
          <circle cx="6" cy="6" r="4.1" fill="none" stroke="currentColor" stroke-width="1.4"/>
          <path d="M9.2 9.2 12.4 12.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
        <input data-idoc-attach-q value="${esc(a.q)}" autocomplete="off"
          placeholder="Тип, номер, дата или текущее учреждение">
      </span>
      <span class="iattach-count">${free.length} ${plural(free.length, 'документ', 'документа', 'документов')}</span>
    </div>

    <div class="idoc-attach-body">
      <div class="idoc-attach-list">
        ${free.length ? free.map((d) => {
          const file = (d.files || [])[0];
          return `<div class="idoc-attach-row ${a.preview === d.id ? 'on' : ''}"
            data-idoc-preview="${esc(d.id)}">
            <span class="idoc-type">${esc(d.type || '—')}</span>
            <span class="idoc-name ell">${esc(file ? file.name : 'без файла')}</span>
            <span class="idoc-date">${esc(d.date || '—')}</span>
            <span class="idoc-now ell" title="${esc(d.institution || 'без учреждения')}">
              ${esc(d.institution || 'без учреждения')}</span>
            <button class="btn btn-primary btn-sm" data-idoc-attach-apply="${esc(d.id)}">Прикрепить</button>
          </div>`;
        }).join('')
        : '<div class="iempty small">Свободных документов не нашлось.</div>'}
      </div>

      <div class="idoc-attach-view">${docViewHTML(preview, false, 'Предпросмотр',
        'Выберите документ в списке — покажем его содержимое до прикрепления.')}</div>
    </div>
  </div>`;
}

// Кто ведёт учреждение: те же роли, что у объекта оценки. В шапке показываем
// сводку, весь состав — в форме правки.
function staffHTML(node) {
  const filled = staffFilled(node);
  if (!filled) {
    return canAssignStaff()
      ? '<span class="istaff none">Сотрудники не назначены</span>'
      : '';
  }

  const staff = staffOf(node);
  const own = STAFF_ROLES.filter(({ key }) => staff[key] && !staff[key].from).length;

  const title = STAFF_ROLES
    .filter(({ key }) => staff[key])
    .map(({ key, label }) => `${label}: ${staff[key].name}${staff[key].from ? ' (от «' + staff[key].from.name + '»)' : ''}`)
    .join('\n');

  return `<span class="istaff ${own ? '' : 'inherited'}" title="${esc(title)}">
    Сотрудники: ${filled} из ${STAFF_ROLES.length}${own ? '' : ' · от родителя'}</span>`;
}

function editHTML() {
  const e = state.edit;
  if (!e) return '';

  const isNew = e.id === 'new';
  const parent = e.parentId ? getNode(e.parentId) : null;
  const node = isNew ? null : getNode(e.id);
  const inherited = parent ? staffOf(parent) : null;

  return `<div class="iform">
    <div class="iform-head">
      <b>${isNew ? 'Новое учреждение' : 'Правка учреждения'}</b>
      ${parent ? `<span>внутри «${esc(parent.name)}»</span>` : '<span>корневой узел</span>'}
    </div>

    <div class="iform-grid">
      <label class="ifield">
        <span>Название</span>
        <input class="input" data-iform-name value="${esc(e.name || '')}"
          placeholder="Например: Управление делами Президента КР">
      </label>

      <div class="ifield">
        <span>Регион</span>
        ${regionFieldHTML(e)}
      </div>

      <label class="ifield wide">
        <span>Пояснение</span>
        <input class="input" data-iform-note value="${esc(e.note || '')}"
          placeholder="Чем занимается учреждение, к чему относится">
      </label>
    </div>

    <div class="iform-staff">
      <div class="iform-staff-head">
        <b>Закреплённые сотрудники</b>
        <span>${canAssignStaff()
          ? 'Тот же состав, что у объектов оценки. Пустая роль наследуется от родителя.'
          : 'Назначает администратор — вам поле доступно только для чтения.'}</span>
      </div>

      <div class="iform-grid">
        ${STAFF_ROLES.map(({ key, label }) => {
          const own = (e.staff || {})[key] || '';
          const up = inherited && inherited[key] ? inherited[key] : null;
          const hint = up && !own ? `от «${up.from ? up.from.name : parent.name}»: ${up.name}` : '';

          return `<label class="ifield">
            <span>${esc(label)}</span>
            ${canAssignStaff()
              ? `<select class="select" data-iform-staff="${esc(key)}">
                  <option value="">${hint ? esc(hint) : 'не назначен'}</option>
                  ${staffList().map((person) => `<option ${person === own ? 'selected' : ''}>${esc(person)}</option>`).join('')}
                </select>`
              : `<input class="input" readonly value="${esc(own || (up ? up.name : 'не назначен'))}">`}
          </label>`;
        }).join('')}
      </div>
    </div>

    ${e.error ? `<div class="iform-error">${esc(e.error)}</div>` : ''}

    <div class="iform-foot">
      <button class="btn btn-primary btn-sm" data-iform-save>${isNew ? 'Создать' : 'Сохранить'}</button>
      <button class="btn btn-ghost btn-sm" data-iform-cancel>Отмена</button>
      ${node && node.region ? `<button class="btn btn-ghost btn-sm" data-iform-region-clear>
        Очистить регион</button>` : ''}
    </div>
  </div>`;
}

// Выбор региона: одно поле «область / район / населённый пункт» с поиском.
// Полного справочника населённых пунктов в макете нет, поэтому список — выборка
// по реальному делению (kernel/regions.js), а ввести можно и своё значение:
// иначе учреждение из отсутствующего в выборке села нельзя было бы завести.
function regionFieldHTML(e) {
  const open = !!state.regionPick;
  const parts = splitRegion(e.region || '');

  return `<div class="iregion ${open ? 'open' : ''}" data-iregion-field>
    <button class="iregion-value" data-iregion-open>
      ${parts.length
        ? `<span class="iregion-parts">${parts.map((x, i) => `<b class="lvl${i + 1}">${esc(x)}</b>`).join('<i>/</i>')}</span>`
        : '<span class="iregion-empty">Выбрать область, район, населённый пункт</span>'}
      <i class="iregion-chev">▾</i>
    </button>

    ${open ? `<div class="iregion-drop">
      <div class="iregion-search">
        <input class="input" data-iregion-q value="${esc(state.regionPick.q)}" autocomplete="off"
          placeholder="Область, район или населённый пункт">
      </div>

      <div class="iregion-list">
        ${searchRegions(state.regionPick.q).map((x) => `<button class="iregion-item lvl${x.level}"
          data-iregion-pick="${esc(x.path)}">
          ${splitRegion(x.path).map((part, i) => `<span class="lvl${i + 1}">${esc(part)}</span>`).join('<i>/</i>')}
        </button>`).join('') || '<div class="iregion-none">Ничего не нашлось — можно ввести своё значение</div>'}
      </div>

      <div class="iregion-foot">
        <input class="input" data-iregion-own value="${esc(e.region || '')}"
          placeholder="Своё значение: область / район / населённый пункт">
        <button class="btn btn-ghost btn-sm" data-iregion-apply>Применить</button>
      </div>
    </div>` : ''}
  </div>`;
}

// Прикрепление объектов оценки. Было неудобно: длинный список без счёта
// выбранного, без фильтра по типу ОЦ и без понимания, откуда объект переедет
// (пользователь 03.09.2026). Теперь видно и то, и другое.
function attachHTML(node) {
  const a = state.attach;
  if (!a) return '';

  const all = candidates(node, a.q, 200);
  const rows = state.attachType ? all.filter((r) => r.typeId === state.attachType) : all;
  const shown = rows.slice(0, 60);
  const picked = Object.keys(state.attachPicked).length;

  const types = [...new Set(all.map((r) => r.typeId))]
    .map((id) => ({ id, label: (all.find((r) => r.typeId === id) || {}).typeLabel || id }));

  return `<div class="iattach">
    <div class="iattach-head">
      <b>Прикрепить объекты оценки</b>
      <span>Объект переедет к «${esc(node.name)}»: у него сменятся учреждение и
        подведомственная организация. Данные объекта не меняются.</span>
      <button class="iattach-close" data-attach-close title="Закрыть">×</button>
    </div>

    <div class="iattach-tools">
      <span class="iattach-search">
        <svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true">
          <circle cx="6" cy="6" r="4.1" fill="none" stroke="currentColor" stroke-width="1.4"/>
          <path d="M9.2 9.2 12.4 12.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
        <input data-attach-q value="${esc(a.q)}" autocomplete="off"
          placeholder="ЕНИ, адрес или текущее учреждение">
        ${a.q ? '<button class="iattach-clear" data-attach-q-clear title="Очистить">×</button>' : ''}
      </span>

      <select class="select iattach-type" data-attach-type>
        <option value="">Тип ОЦ: все</option>
        ${types.map((t) => `<option value="${esc(t.id)}" ${state.attachType === t.id ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
      </select>

      <span class="iattach-count">${rows.length} ${plural(rows.length, 'объект', 'объекта', 'объектов')}${
        rows.length > shown.length ? ` · показаны первые ${shown.length}` : ''}</span>

      ${shown.length ? `<button class="btn btn-ghost btn-sm" data-attach-all>
        ${shown.every((r) => state.attachPicked[r.typeId + '|' + r.id]) ? 'Снять все' : 'Выбрать показанные'}</button>` : ''}
    </div>

    <div class="iattach-list">
      ${shown.length ? shown.map((r) => {
        const key = r.typeId + '|' + r.id;
        const on = !!state.attachPicked[key];
        return `<label class="iattach-row ${on ? 'on' : ''}">
          <input type="checkbox" data-attach-pick="${esc(key)}" ${on ? 'checked' : ''}>
          <span class="iattach-eni mono">${esc(fmtEni(r.eni))}</span>
          <span class="iattach-addr ell" title="${esc(r.title || '')}">${esc(r.title || 'без адреса')}</span>
          <span class="iattach-type-tag">${esc(r.typeLabel)}</span>
          <span class="iattach-now ell" title="${esc((r.institution || 'без учреждения') + (r.podved ? ' · ' + r.podved : ''))}">
            ${esc(r.institution || 'без учреждения')}${r.podved ? ' · ' + esc(r.podved) : ''}</span>
        </label>`;
      }).join('')
      : '<div class="iempty small">Подходящих объектов не нашлось. Измените запрос или снимите фильтр по типу.</div>'}
    </div>

    <div class="iattach-foot">
      <span class="iattach-picked">${picked
        ? `Выбрано: ${picked}`
        : 'Отметьте объекты галочками'}</span>
      ${picked ? '<button class="btn btn-ghost btn-sm" data-attach-none>Снять выбор</button>' : ''}
      <button class="btn btn-primary btn-sm" data-attach-apply ${picked ? '' : 'disabled'}>
        Прикрепить${picked ? ' · ' + picked : ''}</button>
    </div>
  </div>`;
}

// Склонение при числе — как в реестре документов.
function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

function contentHTML() {
  const node = state.selected ? getNode(state.selected) : null;

  if (!node) {
    return `<div class="imain">
      <div class="iempty big">
        <b>Выберите учреждение</b>
        <span>Слева — дерево: учреждение вкладывается в учреждение на любую глубину.
          У узла видно объекты оценки и документы, отсюда же их можно прикрепить.</span>
      </div>
    </div>`;
  }

  const path = pathOf(node.id);
  const own = ocCount(node);
  const docs = docCount(node);
  const isRoot = !node.parentId;

  return `<div class="imain">
    <div class="ihead">
      <div class="ihead-main">
        <div class="ititle">
          <h2>${esc(node.name)}</h2>
          <span class="ipath">${path.slice(0, -1).map((p) => `<button data-inode="${esc(p.id)}">${esc(p.name)}</button>`).join('<span>/</span>')}</span>
          ${regionOf(node) ? `<span class="iregion">${esc(regionOf(node))}</span>` : ''}
        </div>
        <div class="imeta">
          ${staffHTML(node)}
          ${node.note ? `<span class="inote">${esc(node.note)}</span>` : ''}
        </div>
      </div>

      <div class="ihead-actions">
        ${isRoot ? '' : `<button class="btn btn-ghost btn-sm ${isMine(node) ? 'on' : ''}" data-imine>
          ${isMine(node) ? '★ Моё учреждение' : '☆ Сделать моим'}</button>`}
        ${isRoot ? '' : '<button class="btn btn-ghost btn-sm" data-iedit>Редактировать</button>'}
        <button class="btn btn-ghost btn-sm" data-inew>+ Подведомственное</button>
        ${isRoot ? '' : '<button class="btn btn-danger btn-sm" data-idel>Удалить</button>'}
      </div>
    </div>

    ${state.edit ? editHTML() : ''}

    <div class="itabs">
      <button class="itab ${state.tab === 'oc' ? 'on' : ''}" data-itab="oc">Объекты оценки<b>${own}</b></button>
      <button class="itab ${state.tab === 'all' ? 'on' : ''}" data-itab="all"
        title="Объекты этого учреждения и всех подведомственных, с фильтрами">С подведомственными<b>${totalCount(node)}</b></button>
      <button class="itab ${state.tab === 'docs' ? 'on' : ''}" data-itab="docs">Документы<b>${docs}</b></button>
      <span class="itabs-acts">${tabActionsHTML(node, isRoot)}</span>
    </div>

    ${state.tab === 'oc' ? ocPaneHTML(node, isRoot)
      : state.tab === 'all' ? allPaneHTML(subtreeRowsOf(node), state.all, allWidths)
      : docTableHTML(node)}
  </div>`;
}

// Действия вкладки живут в её же строке, справа от закладок (пользователь
// 03.09.2026, рисунком поверх скриншота): полоса вкладок и так тянется во всю
// ширину пустой, а действия ниже отнимали у просмотрщика отдельную строку.
function tabActionsHTML(node, isRoot) {
  if (state.tab === 'all') return '';
  if (state.tab === 'oc') {
    return isRoot ? '' : '<button class="btn btn-primary btn-sm" data-attach-open>+ Прикрепить ОЦ</button>';
  }

  const edit = canAssignStaff();
  return `${edit ? `<button class="btn btn-primary btn-sm" data-idoc-new>+ Новый документ</button>
      <button class="btn btn-ghost btn-sm" data-idoc-attach-open>Прикрепить существующий</button>` : ''}
    <button class="btn btn-ghost btn-sm" data-idocs="${esc(node.name)}"
      title="Открыть эти документы в общем реестре">Открыть в «Документах»</button>`;
}

// Вкладка объектов: поиск и таблица.
function ocPaneHTML(node, isRoot) {
  return `<div class="ipane">
    <div class="itoolbar">
      <span class="isearch">
        <svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true">
          <circle cx="6" cy="6" r="4.1" fill="none" stroke="currentColor" stroke-width="1.4"/>
          <path d="M9.2 9.2 12.4 12.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
        <input data-irowq value="${esc(state.rowQ)}" autocomplete="off"
          placeholder="Поиск по ЕНИ, адресу и статусу">
        ${state.rowQ ? '<button class="isearch-clear" data-irowq-clear title="Очистить">×</button>' : ''}
      </span>

    </div>

    ${state.attach ? attachHTML(node) : ''}
    <div class="ibody">${ocTableHTML(node)}</div>
  </div>`;
}


function viewHTML() {
  return `<div class="inst-page">${panelHTML()}${contentHTML()}</div>`;
}

export function mountInstitutions(host) {
  const scope = host.scope;

  // Возврат из карточки ОЦ приходит с адресом #/institutions?node=<id>&name=<имя>
  // — открываем то учреждение, из которого уходили. Имя в адресе не лишнее:
  // идентификаторы узлов живут в памяти вкладки, и после перезагрузки страницы
  // ссылка по одному id никуда бы не привела.
  const q = (host.route && host.route.query) || {};
  if (q.node && getNode(q.node)) {
    state.selected = q.node;
  } else if (q.name) {
    const byName = allNodes().find((n) => n.name === q.name);
    if (byName) state.selected = byName.id;
  }
  if (state.selected) pathOf(state.selected).forEach((n) => { state.open[n.id] = true; });
  document.body.dataset.page = 'institutions';
  // Просмотрщик документов общий с реестром «Документы» (kernel/docViewer.js).
  host.ensureStyle('./app/kernel/docViewer.css');
  setActiveNav('inst');

  function crumbs() {
    const node = state.selected ? getNode(state.selected) : null;
    const base = [{ label: 'Главная', to: MENU_HREF }, { label: 'Учреждения', current: !node }];
    if (!node) return setCrumbs(base);

    const path = pathOf(node.id);
    setCrumbs([
      ...base.slice(0, 1),
      { label: 'Учреждения' },
      ...path.map((p, i) => ({ label: p.name, current: i === path.length - 1 })),
    ]);
  }

  // Ширины столбцов считаются от ФАКТИЧЕСКОЙ ширины таблицы, а не от суммы
  // умолчаний (пользователь 03.09.2026: «привязывайся к фактическому размеру
  // таблицы»). Место здесь меняется не только с окном: тянется панель дерева,
  // сворачивается колонка фильтров, прячется список документов — поэтому
  // подгонка идёт после каждой отрисовки и по ResizeObserver.
  const FIT_TABLES = [
    ['[data-oc-cols-box]', OC_COLUMNS, ocWidths],
    ['[data-doc-cols-box]', DOC_COLUMNS, docWidths],
    ['[data-all-cols-box]', ALL_COLUMNS, allWidths],
  ];

  function fitTables() {
    FIT_TABLES.forEach(([sel, cols, widths]) => {
      const box = scope.$(sel);
      if (box && box.clientWidth) applyFit(box, cols, widths);
    });
  }

  const fitObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => fitTables())
    : null;

  function render() {
    crumbs();
    scope.setHTML(viewHTML());
    bind();
    fitTables();

    if (fitObserver) {
      fitObserver.disconnect();
      FIT_TABLES.forEach(([sel]) => {
        const box = scope.$(sel);
        if (box) fitObserver.observe(box);
      });
    }
  }

  function selectNode(id) {
    state.selected = id;
    state.tab = 'oc';
    state.rowQ = '';
    // Выбранные значения фасетов относились к прежнему поддереву — в новом их
    // может не быть вовсе. Раскрытость самих фасетов и колонки сохраняем.
    Object.assign(state.all, emptyAllFilter(), {
      open: state.all.open, panel: state.all.panel,
    });
    state.attach = null;
    state.edit = null;
    state.docOpen = null;
    state.docFile = null;
    state.docNew = null;
    state.docAttach = null;

    // Раскрываем всю ветку до выбранного узла — иначе он выделен, а в дереве
    // его не видно.
    pathOf(id).forEach((p) => { state.open[p.id] = true; });
    render();
  }

  function bind() {
    const panelBtn = scope.$('[data-ipanel]');
    if (panelBtn) panelBtn.onclick = () => { state.panel = !state.panel; render(); };

    // Ширина панели тянется перегородкой у её правого края: меняется только
    // CSS-переменная, перерисовки на каждый пиксель нет — как в таблицах
    // (kernel/columns.js).
    const grip = scope.$('[data-ipanel-grip]');
    if (grip) grip.onpointerdown = (e) => {
      e.preventDefault();
      const panel = scope.$('.ipanel');
      if (!panel) return;

      const x0 = e.clientX;
      const w0 = panelWidth;

      grip.setPointerCapture(e.pointerId);
      grip.classList.add('active');
      document.body.classList.add('col-resizing');

      const move = (ev) => {
        const max = Math.max(PANEL_MIN, Math.round(window.innerWidth * PANEL_MAX_SHARE));
        panelWidth = Math.max(PANEL_MIN, Math.min(max, w0 + Math.round(ev.clientX - x0)));
        panel.style.setProperty('--panel-w', panelWidth + 'px');
      };
      const up = () => {
        grip.releasePointerCapture(e.pointerId);
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.classList.remove('active');
        document.body.classList.remove('col-resizing');
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
    };

    // Двойной щелчок по перегородке — ширина по умолчанию: удобно вернуть,
    // если растянул слишком сильно.
    if (grip) grip.ondblclick = () => { panelWidth = 320; render(); };

    scope.$$('[data-iregion-toggle]').forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      const key = b.dataset.iregionToggle;
      state.openRegion[key] = state.openRegion[key] === false;
      render();
    });

    scope.$$('[data-imode]').forEach((b) => b.onclick = () => {
      state.mode = b.dataset.imode;
      render();
    });

    const q = scope.$('[data-iq]');
    if (q) q.oninput = () => {
      const pos = q.selectionStart;
      state.q = q.value;
      render();
      const again = scope.$('[data-iq]');
      if (again) { again.focus(); again.setSelectionRange(pos, pos); }
    };

    const qClear = scope.$('[data-iq-clear]');
    if (qClear) qClear.onclick = () => { state.q = ''; render(); };

    const only = scope.$('[data-ionly]');
    if (only) only.onchange = () => {
      state.onlyMine = only.checked;
      // Свои учреждения бывают глубоко: раскрываем ветки, иначе включённый
      // фильтр показывал бы одни корни.
      if (state.onlyMine) {
        allNodes().filter((n) => hasMineInside(n)).forEach((n) => { state.open[n.id] = true; });
      }
      render();
    };

    const mineBtn = scope.$('[data-imine]');
    if (mineBtn) mineBtn.onclick = () => {
      const node = getNode(state.selected);
      const on = toggleMine(node);
      render();
      host.toast(on ? `«${node.name}» закреплено за вами` : `«${node.name}» откреплено`, 'ok');
    };

    scope.$$('[data-inode-toggle]').forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      const id = b.dataset.inodeToggle;
      state.open[id] = !state.open[id];
      render();
    });

    scope.$$('[data-inode-fav]').forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      const on = toggleFavorite(b.dataset.inodeFav);
      render();
      host.toast(on ? 'Закреплено в избранном' : 'Убрано из избранного', 'ok');
    });

    scope.$$('[data-inode]').forEach((el) => el.onclick = (e) => {
      if (e.target.closest('[data-inode-toggle], [data-inode-fav]')) return;
      selectNode(el.dataset.inode);
    });

    // --- вкладки и поиск по таблице ---
    scope.$$('[data-itab]').forEach((b) => b.onclick = () => {
      state.tab = b.dataset.itab;
      state.rowQ = '';
      render();
    });

    const rowQ = scope.$('[data-irowq]');
    if (rowQ) rowQ.oninput = () => {
      const pos = rowQ.selectionStart;
      state.rowQ = rowQ.value;
      render();
      const again = scope.$('[data-irowq]');
      if (again) { again.focus(); again.setSelectionRange(pos, pos); }
    };

    const rowQClear = scope.$('[data-irowq-clear]');
    if (rowQClear) rowQClear.onclick = () => { state.rowQ = ''; render(); };

    // --- переходы ---
    // Открывая объект отсюда, помечаем происхождение: карточка покажет путь
    // «Главная / Учреждения / <учреждение>», а возврат приведёт обратно сюда.
    scope.$$('[data-oc-row]').forEach((tr) => tr.onclick = (e) => {
      if (e.target.closest('[data-detach]')) return;
      const [typeId, id] = tr.dataset.ocRow.split('|');
      const node = getNode(state.selected);
      location.hash = build({
        typeId,
        ocId: id,
        query: { from: 'inst', node: node.id, name: node.name },
      });
    });

    // Как и с объектами оценки: помечаем, откуда открыли — путь и возврат
    // приведут обратно в это учреждение, а не в общий реестр документов.
    scope.$$('[data-doc-row]').forEach((tr) => tr.onclick = () => {
      const node = getNode(state.selected);
      const q = `?from=inst&node=${encodeURIComponent(node.id)}&name=${encodeURIComponent(node.name)}`;
      location.hash = DOCS_HREF + '/' + encodeURIComponent(tr.dataset.docRow) + q;
    });

    const toDocs = scope.$('[data-idocs]');
    if (toDocs) toDocs.onclick = () => {
      location.hash = DOCS_HREF + '?institution=' + encodeURIComponent(toDocs.dataset.idocs);
    };

    // --- правка дерева ---
    const editBtn = scope.$('[data-iedit]');
    if (editBtn) editBtn.onclick = () => {
      const node = getNode(state.selected);
      state.edit = {
        id: node.id,
        parentId: node.parentId,
        name: node.name,
        note: node.note || '',
        region: node.region || '',
        staff: { ...(node.staff || {}) },
      };
      render();
    };

    const newBtn = scope.$('[data-inew]');
    if (newBtn) newBtn.onclick = () => {
      // Новому подведомственному сразу предлагаем сотрудника родителя: чаще
      // всего его ведёт тот же человек.
      // Новому подведомственному регион родителя подставляем сразу, а
      // сотрудников — нет: пустая роль и так наследуется, а копия помешала бы
      // потом менять их в одном месте.
      const parent = state.selected ? getNode(state.selected) : null;
      state.edit = {
        id: 'new',
        parentId: state.selected,
        name: '',
        note: '',
        region: parent ? (parent.region || '') : '',
        staff: {},
      };
      render();
    };

    const cancel = scope.$('[data-iform-cancel]');
    if (cancel) cancel.onclick = () => { state.edit = null; render(); };

    // --- выбор региона ---
    const regionOpen = scope.$('[data-iregion-open]');
    if (regionOpen) regionOpen.onclick = (e) => {
      e.stopPropagation();
      state.regionPick = state.regionPick ? null : { q: '' };
      render();
      const field = scope.$('[data-iregion-q]');
      if (field) field.focus();
    };

    const regionQ = scope.$('[data-iregion-q]');
    if (regionQ) regionQ.oninput = () => {
      const pos = regionQ.selectionStart;
      state.regionPick.q = regionQ.value;
      render();
      const again = scope.$('[data-iregion-q]');
      if (again) { again.focus(); again.setSelectionRange(pos, pos); }
    };

    scope.$$('[data-iregion-pick]').forEach((b) => b.onclick = () => {
      state.edit.region = b.dataset.iregionPick;
      state.regionPick = null;
      render();
    });

    const regionApply = scope.$('[data-iregion-apply]');
    if (regionApply) regionApply.onclick = () => {
      state.edit.region = scope.$('[data-iregion-own]').value.trim();
      state.regionPick = null;
      render();
    };

    const regionClear = scope.$('[data-iform-region-clear]');
    if (regionClear) regionClear.onclick = () => {
      state.edit.region = '';
      state.regionPick = null;
      render();
    };

    const save = scope.$('[data-iform-save]');
    if (save) save.onclick = () => {
      const e = state.edit;
      e.name = scope.$('[data-iform-name]').value;
      e.note = scope.$('[data-iform-note]').value;

      // Роли сотрудников: пустое значение — «убрать назначение», тогда роль
      // снова наследуется от родителя.
      const staff = {};
      scope.$$('[data-iform-staff]').forEach((sel) => { staff[sel.dataset.iformStaff] = sel.value; });
      if (Object.keys(staff).length) e.staff = staff;

      const res = e.id === 'new'
        ? createNode(e.parentId, e)
        : updateNode(e.id, { name: e.name, note: e.note, region: e.region, staff: e.staff });

      if (!res.ok) {
        state.edit.error = res.reason;
        render();
        return;
      }

      const created = e.id === 'new';
      state.edit = null;
      if (created) {
        state.open[e.parentId] = true;
        selectNode(res.node.id);
      } else {
        render();
      }
      host.toast(created ? 'Учреждение создано' : 'Изменения сохранены', 'ok');
    };

    const del = scope.$('[data-idel]');
    if (del) del.onclick = async () => {
      const node = getNode(state.selected);
      const kids = childrenOf(node.id);

      const probe = removeNode(node.id, { withChildren: false });
      if (!probe.ok && probe.busy) {
        await host.confirm({
          title: 'Удалить нельзя',
          okLabel: 'Понятно',
          text: `${probe.reason}: ${probe.busy.map((b) => `${b.name} — ${b.oc}`).join('; ')}. `
            + 'Сначала перенесите или открепите объекты.',
        });
        return;
      }

      if (!probe.ok && probe.children) {
        const ok = await host.confirm({
          title: 'Удалить вместе с подведомственными',
          okLabel: `Удалить ${kids.length + 1}`,
          danger: true,
          text: `У «${node.name}» ${kids.length} подведомственных. Будет удалена вся ветка. `
            + 'Объектов оценки за ней не числится, поэтому данные не потеряются.',
        });
        if (!ok) return;

        const res = removeNode(node.id, { withChildren: true });
        if (!res.ok) { host.toast(res.reason, 'warn'); return; }
        state.selected = node.parentId;
        render();
        host.toast(`Удалено учреждений: ${res.removed}`, 'ok');
        return;
      }

      if (probe.ok) {
        state.selected = node.parentId;
        render();
        host.toast('Учреждение удалено', 'ok');
        return;
      }

      host.toast(probe.reason, 'warn');
    };

    // --- привязка объектов ---
    const attachOpen = scope.$('[data-attach-open]');
    if (attachOpen) attachOpen.onclick = () => {
      state.attach = { q: '' };
      state.attachPicked = {};
      state.attachType = '';
      render();
    };

    const attachClose = scope.$('[data-attach-close]');
    if (attachClose) attachClose.onclick = () => { state.attach = null; render(); };

    const attachQClear = scope.$('[data-attach-q-clear]');
    if (attachQClear) attachQClear.onclick = () => { state.attach.q = ''; render(); };

    const attachType = scope.$('[data-attach-type]');
    if (attachType) attachType.onchange = () => { state.attachType = attachType.value; render(); };

    // Отметки живут в состоянии, а не в разметке: список перерисовывается на
    // каждый поиск, и галочки иначе слетали бы.
    scope.$$('[data-attach-pick]').forEach((cb) => cb.onchange = () => {
      const key = cb.dataset.attachPick;
      if (cb.checked) state.attachPicked[key] = true;
      else delete state.attachPicked[key];
      render();
    });

    const attachAll = scope.$('[data-attach-all]');
    if (attachAll) attachAll.onclick = () => {
      const keys = scope.$$('[data-attach-pick]').map((cb) => cb.dataset.attachPick);
      const allOn = keys.every((k) => state.attachPicked[k]);
      keys.forEach((k) => {
        if (allOn) delete state.attachPicked[k];
        else state.attachPicked[k] = true;
      });
      render();
    };

    const attachNone = scope.$('[data-attach-none]');
    if (attachNone) attachNone.onclick = () => { state.attachPicked = {}; render(); };

    const attachQ = scope.$('[data-attach-q]');
    if (attachQ) attachQ.oninput = () => {
      const pos = attachQ.selectionStart;
      state.attach.q = attachQ.value;
      render();
      const again = scope.$('[data-attach-q]');
      if (again) { again.focus(); again.setSelectionRange(pos, pos); }
    };

    const apply = scope.$('[data-attach-apply]');
    if (apply) apply.onclick = () => {
      const refs = Object.keys(state.attachPicked).map((key) => {
        const [typeId, id] = key.split('|');
        return { typeId, id };
      });

      if (!refs.length) { host.toast('Отметьте объекты, которые нужно прикрепить', 'warn'); return; }

      const n = attachRecords(getNode(state.selected), refs);
      state.attach = null;
      state.attachPicked = {};
      render();
      host.toast(`Прикреплено ${n} ${plural(n, 'объект', 'объекта', 'объектов')}`, 'ok');
    };

    scope.$$('[data-detach]').forEach((b) => b.onclick = async (e) => {
      e.stopPropagation();
      const [typeId, id] = b.dataset.detach.split('|');
      const ok = await host.confirm({
        title: 'Открепить объект',
        okLabel: 'Открепить',
        text: 'У объекта оценки очистятся учреждение и подведомственная организация. '
          + 'Сам объект и его данные останутся на месте.',
      });
      if (!ok) return;

      detachRecords([{ typeId, id }]);
      render();
      host.toast('Объект откреплён', 'ok');
    });

    // --- документы учреждения ---
    //
    // Выбор документа открывает его в просмотрщике рядом — как в карточке ОЦ.
    scope.$$('[data-idoc]').forEach((row) => row.onclick = (e) => {
      if (e.target.closest('[data-idoc-detach], [data-idoc-del], [data-idoc-goto]')) return;
      const id = row.dataset.idoc;
      state.docOpen = state.docOpen === id ? null : id;
      state.docFile = null;
      render();
    });

    if (state.docOpen) {
      const doc = getDocument(state.docOpen);
      if (doc) {
        bindViewer(scope, {
          doc,
          activeFileId: state.docFile,
          onFileChange: (fileId) => { state.docFile = fileId; render(); },
        });
      }
    }

    // Открыть карточку документа целиком — с меткой происхождения, чтобы путь
    // шёл через учреждение и возврат приводил обратно.
    scope.$$('[data-idoc-goto]').forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      const node = getNode(state.selected);
      const q = `?from=inst&node=${encodeURIComponent(node.id)}&name=${encodeURIComponent(node.name)}`;
      location.hash = DOCS_HREF + '/' + encodeURIComponent(b.dataset.idocGoto) + q;
    });

    // Файл к уже существующему документу: та же операция, что в реестре, но
    // не уходя из учреждения.
    const addFileBtn = scope.$('[data-idoc-addfile]');
    if (addFileBtn) addFileBtn.onclick = async () => {
      const id = addFileBtn.dataset.idocAddfile;
      const file = await pickFile();
      if (!file) return;

      if (isFileTooLarge(file)) {
        host.toast(`Файл больше ${MAX_DOC_FILE_MB} МБ — выберите другой`, 'warn');
        return;
      }

      const attached = await attachedFileFrom(file);
      addFile(id, attached);
      updateDocument(id, { status: await detectAutoStatus(file) });
      state.docOpen = id;
      state.docFile = null;
      render();
      host.toast('Файл прикреплён', 'ok');
    };

    // Новый документ — строкой, без модального окна.
    const docNew = scope.$('[data-idoc-new]');
    if (docNew) docNew.onclick = () => {
      state.docNew = { type: DOC_TYPES[0], number: '', date: '', files: [], error: '' };
      state.docAttach = null;
      render();
    };

    scope.$$('[data-idoc-new-cancel]').forEach((b) => b.onclick = () => {
      state.docNew = null;
      render();
    });

    const docType = scope.$('[data-idoc-type]');
    if (docType) docType.onchange = () => { state.docNew.type = docType.value; };

    const docNumber = scope.$('[data-idoc-number]');
    if (docNumber) docNumber.oninput = () => { state.docNew.number = docNumber.value; };

    const docDate = scope.$('[data-idoc-date]');
    if (docDate) docDate.onchange = () => { state.docNew.date = docDate.value; };

    // Файл выбирается системным диалогом — единственное «окно», которого не
    // избежать, зато сам документ заводится строкой.
    const docFileBtn = scope.$('[data-idoc-file]');
    if (docFileBtn) docFileBtn.onclick = async () => {
      const file = await pickFile();
      if (!file) return;

      if (isFileTooLarge(file)) {
        state.docNew.error = `Файл больше ${MAX_DOC_FILE_MB} МБ — выберите другой.`;
        render();
        return;
      }

      const attached = await attachedFileFrom(file);
      state.docNew.files = [attached];
      state.docNew.status = await detectAutoStatus(file);
      state.docNew.error = '';
      render();
    };

    const docFileRm = scope.$('[data-idoc-file-rm]');
    if (docFileRm) docFileRm.onclick = () => { state.docNew.files = []; render(); };

    const docSave = scope.$('[data-idoc-save]');
    if (docSave) docSave.onclick = () => {
      const node = getNode(state.selected);
      const d = state.docNew;

      const doc = createDocument({
        type: d.type,
        number: d.number,
        date: d.date,
        status: d.status || DOC_STATUSES[0],
        files: d.files,
        institution: node.name,
      });

      state.docNew = null;
      state.docOpen = doc.id;
      state.docFile = null;
      render();
      host.toast('Документ создан и закреплён за учреждением', 'ok');
    };

    // Прикрепление существующего: список слева, предпросмотр справа.
    const attachDocOpen = scope.$('[data-idoc-attach-open]');
    if (attachDocOpen) attachDocOpen.onclick = () => {
      state.docAttach = { q: '', preview: null };
      state.docNew = null;
      render();
    };

    const attachDocClose = scope.$('[data-idoc-attach-close]');
    if (attachDocClose) attachDocClose.onclick = () => { state.docAttach = null; render(); };

    const attachDocQ = scope.$('[data-idoc-attach-q]');
    if (attachDocQ) attachDocQ.oninput = () => {
      const pos = attachDocQ.selectionStart;
      state.docAttach.q = attachDocQ.value;
      render();
      const again = scope.$('[data-idoc-attach-q]');
      if (again) { again.focus(); again.setSelectionRange(pos, pos); }
    };

    scope.$$('[data-idoc-preview]').forEach((row) => row.onclick = (e) => {
      if (e.target.closest('[data-idoc-attach-apply]')) return;
      state.docAttach.preview = row.dataset.idocPreview;
      render();
    });

    if (state.docAttach && state.docAttach.preview) {
      const doc = getDocument(state.docAttach.preview);
      if (doc) bindViewer(scope, { doc, activeFileId: null, onFileChange() {} });
    }

    scope.$$('[data-idoc-attach-apply]').forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      const node = getNode(state.selected);
      updateDocument(b.dataset.idocAttachApply, { institution: node.name });
      state.docAttach = null;
      state.docOpen = b.dataset.idocAttachApply;
      render();
      host.toast(`Документ прикреплён к «${node.name}»`, 'ok');
    });

    // Открепление: у документа снимается учреждение, сам он остаётся в реестре.
    scope.$$('[data-idoc-detach]').forEach((b) => b.onclick = async (e) => {
      e.stopPropagation();
      const id = b.dataset.idocDetach;
      const ok = await host.confirm({
        title: 'Открепить документ',
        okLabel: 'Открепить',
        text: 'У документа очистится учреждение. Сам документ и его файлы останутся '
          + 'в реестре «Документы».',
      });
      if (!ok) return;

      updateDocument(id, { institution: '' });
      if (state.docOpen === id) state.docOpen = null;
      render();
      host.toast('Документ откреплён', 'ok');
    });

    scope.$$('[data-idoc-del]').forEach((b) => b.onclick = async (e) => {
      e.stopPropagation();
      const id = b.dataset.idocDel;
      const doc = getDocument(id);
      // Не удаление: документ уезжает в архив, откуда его можно вернуть
      // (ТЗ docs/tz/20-arhiv.md, §4.1).
      const ok = await host.confirm({
        title: 'Убрать документ в архив?',
        okLabel: 'В архив',
        text: `«${doc ? doc.type : 'Документ'}» исчезнет из реестра, но останется `
          + 'в разделе «Архив» — оттуда его можно найти и вернуть.',
      });
      if (!ok) return;

      archiveRegistryDoc({ docId: id, place: 'institution', node: getNode(state.selected) });
      if (state.docOpen === id) state.docOpen = null;
      render();
      host.toast('Убрано в архив: документ', 'ok');
    });

    // --- список документов: свернуть, развернуть, потянуть ---
    const docListClose = scope.$('[data-idoc-list-close]');
    if (docListClose) docListClose.onclick = () => { state.docList = false; render(); };

    const docListOpen = scope.$('[data-idoc-list-open]');
    if (docListOpen) docListOpen.onclick = () => { state.docList = true; render(); };

    // Перегородка между списком и просмотрщиком — тот же приём, что в карточке
    // ОЦ: пока тянем, меняется только переменная ширины, без перерисовки.
    const docSplit = scope.$('[data-idoc-split]');
    if (docSplit) docSplit.onpointerdown = (e) => {
      e.preventDefault();
      const box = scope.$('.idocs-body');
      if (!box) return;

      const x0 = e.clientX;
      const w0 = docListWidth;

      docSplit.setPointerCapture(e.pointerId);
      docSplit.classList.add('active');
      document.body.classList.add('col-resizing');

      const max = docListMax(box);
      const move = (ev) => {
        docListWidth = Math.max(DOC_LIST_MIN,
          Math.min(max, w0 + Math.round(ev.clientX - x0)));
        box.style.setProperty('--doc-list-w', docListWidth + 'px');
      };
      const up = () => {
        docSplit.releasePointerCapture(e.pointerId);
        docSplit.removeEventListener('pointermove', move);
        docSplit.removeEventListener('pointerup', up);
        docSplit.classList.remove('active');
        document.body.classList.remove('col-resizing');
      };
      docSplit.addEventListener('pointermove', move);
      docSplit.addEventListener('pointerup', up);
    };

    // --- ширины столбцов ---
    bindColumnResize(scope, {
      rootSel: '[data-oc-cols-box]',
      cols: OC_COLUMNS,
      widths: ocWidths,
      onCommit(patch) { Object.assign(ocWidths, patch); },
    });

    bindColumnResize(scope, {
      rootSel: '[data-doc-cols-box]',
      cols: DOC_COLUMNS,
      widths: docWidths,
      onCommit(patch) { Object.assign(docWidths, patch); },
    });

    bindColumnResize(scope, {
      rootSel: '[data-all-cols-box]',
      cols: ALL_COLUMNS,
      widths: allWidths,
      onCommit(patch) { Object.assign(allWidths, patch); },
    });

    // Сводная вкладка: фильтры и переход в карточку. Объект открывается с той
    // же меткой происхождения, что и со «своей» вкладки, но возврат ведёт в
    // тот узел, откуда смотрели, а не в тот, за которым объект числится.
    if (state.tab === 'all') {
      const here = getNode(state.selected);
      bindAllPane(scope, {
        filter: state.all,
        render,
        openRow(typeId, id) {
          location.hash = build({
            typeId,
            ocId: id,
            query: { from: 'inst', node: here.id, name: here.name },
          });
        },
      });
    }
  }

  // Первый заход: раскрываем корни, чтобы дерево не выглядело пустым.
  if (!Object.keys(state.open).length) {
    allNodes().filter((n) => !n.parentId).forEach((n) => { state.open[n.id] = true; });
  }

  render();

  return {
    onRoute() { render(); },
    destroy() {},
  };
}
