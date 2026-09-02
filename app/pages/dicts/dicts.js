// Раздел «Справочники» — перечни значений для полей карточек.
// ТЗ: docs/tz/10-spravochniki.md.
//
// Устройство (решения пользователя 02.09.2026):
//   * одно поле — один справочник, всегда: у каждого типа ОИ на каждое поле
//     свой уникальный перечень;
//   * справочники одноимённых полей связаны: правку значения можно применить
//     сразу ко всем выбранным (аккордеон «Связанные справочники»);
//   * слева дерево каталогов «тип ОЦ → тип ОИ»: справочник лежит там, где
//     применяется, и искать его больше негде;
//   * перенос в другой каталог перевешивает привязку на одноимённое поле, а
//     если такого нет — спрашивает, ничего не меняя до ответа;
//   * поля в таблицах невидимы до нажатия: сорок рамок подряд рябят в глазах;
//   * системные перечни отделены разделом, а не подписью;
//   * правят администратор и роль «любая».
import { esc } from '../../kernel/dom.js';
import { fmtEni, plural } from '../../kernel/fmt.js';
import { setCrumbs, setActiveNav } from '../../shell/shell.js';
import { session, roleLabel } from '../../kernel/session.js';
import { sortedTypes } from '../../kernel/registry.js';
import {
  allDicts, getDict, CARD_LABEL, canEditDicts, usageOf, dictUsage,
  catalogTree, catalogKey, dictCatalog, createDict, copyDict, removeDict,
  renameDict, setDictNote, addItem, renameItem, removeItem, hasValue, moveItem,
  bindSlot, unbindSlot, freeSlots, moveToCatalog, setFolder, foldersOf, mainSlot,
  slotsWithOwners, linkedDicts, diffWith, addItemTo, removeItemFrom, renameItemIn,
} from '../../kernel/dicts.js';

// Вид навигации. По умолчанию «столбцы»: они не требуют опыта с деревом —
// три списка рядом, выбрал слева — справа появилось следующее, и ничего не
// перестраивается. Плитки, плоская таблица и группировка по полям пробовались
// и убраны 02.09.2026: три способа делать одно и то же только запутывали.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: выбранный вид — личная настройка, ей место в профиле
// пользователя. Здесь он живёт в памяти вкладки.
const VIEWS = [
  { key: 'steps', label: 'Столбцы', hint: 'тип ОЦ → справочник → значения, три столбца рядом' },
  { key: 'tree', label: 'Дерево', hint: 'вложенные списки' },
];

const state = {
  view: 'steps',
  viewMenuOpen: false, // раскрыто ли меню выбора вида
  stepType: null,      // выбранный тип ОЦ (первый столбец)
  stepCard: null,      // выбранный тип ОИ (второй столбец)
  selected: null,
  q: '',
  itemQ: '',
  showSystem: true,
  // Раскрытые узлы дерева. По умолчанию свёрнуто всё: 130 справочников разом
  // никому не нужны, а сворачивать их вручную при каждом заходе — работа
  // впустую (требование пользователя 02.09.2026).
  open: {},
  creating: false,     // строка ввода названия нового справочника
  removing: null,      // значение, для которого открыт диалог замены
  replaceMode: 'existing',
  dragItem: null,
  moveOpen: false,     // открыт выбор каталога для переноса
  folderOpen: false,   // открыт выбор папки внутри каталога
  // Аккордеон связанных справочников: раскрыт ли он и какие из них выбраны.
  // По умолчанию выбраны ВСЕ связанные — так просил пользователь; выбор живёт
  // на время работы с этим справочником.
  linkedOff: {},       // id справочников, с которых галочку сняли
  movePick: null,      // автопривязка не сработала — спрашиваем поле
};

const ICON_LOCK = `<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
  <path d="M3.2 5.4V4a2.8 2.8 0 0 1 5.6 0v1.4M2.6 5.4h6.8v5H2.6z"
    fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>`;

const ICON_GRIP = `<svg viewBox="0 0 10 14" width="10" height="14" aria-hidden="true">
  <circle cx="3" cy="3" r="1.1"/><circle cx="7" cy="3" r="1.1"/>
  <circle cx="3" cy="7" r="1.1"/><circle cx="7" cy="7" r="1.1"/>
  <circle cx="3" cy="11" r="1.1"/><circle cx="7" cy="11" r="1.1"/></svg>`;

const ICON_FOLDER = `<svg viewBox="0 0 14 12" width="12" height="11" aria-hidden="true">
  <path d="M1.4 3V2.1h4l1 1.3h6.2v7.5H1.4z" fill="none" stroke="currentColor"
    stroke-width="1.1" stroke-linejoin="round"/></svg>`;

const ICON_SEARCH = `<svg class="dc-field-ico" viewBox="0 0 14 14" width="13" height="13" aria-hidden="true">
  <circle cx="6" cy="6" r="4.1" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <path d="M9.2 9.2 12.4 12.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;

const ICON_GEAR = `<svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true">
  <path d="M1.6 3.6h10.8M1.6 7h10.8M1.6 10.4h10.8" stroke="currentColor" stroke-width="1.2"
    stroke-linecap="round"/>
  <circle cx="4.6" cy="3.6" r="1.5" fill="#fff" stroke="currentColor" stroke-width="1.2"/>
  <circle cx="9.2" cy="7" r="1.5" fill="#fff" stroke="currentColor" stroke-width="1.2"/>
  <circle cx="5.4" cy="10.4" r="1.5" fill="#fff" stroke="currentColor" stroke-width="1.2"/></svg>`;

const ICON_CHEV = `<svg class="dc-tree-chev" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
  <path d="M4.4 2.6 7.8 6l-3.4 3.4" fill="none" stroke="currentColor" stroke-width="1.6"
    stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// --- дерево каталогов ------------------------------------------------------

function matchesDict(d) {
  if (!state.showSystem && d.system) return false;
  if (!state.q) return true;
  const hay = [d.name, d.note, ...d.items.map((i) => i.value)].join(' ').toLowerCase();
  return state.q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

function dictRowHTML(d) {
  return `<button class="dc-row ${state.selected === d.id ? 'on' : ''} ${d.system ? 'sys' : ''}"
      data-dict="${esc(d.id)}" title="${esc(d.note || d.name)}">
      <span class="dc-row-name">${d.system ? `<span class="dc-lock">${ICON_LOCK}</span>` : ''}${esc(d.name)}</span>
      <span class="dc-row-n" title="значений в перечне">${d.items.length}</span>
    </button>`;
}

function treeHTML() {
  const tree = catalogTree();
  const searching = !!state.q.trim();

  const nodes = tree.map((type) => {
    const cards = type.cards
      .map((c) => ({ ...c, dicts: c.dicts.filter(matchesDict) }))
      .filter((c) => c.dicts.length || !searching);

    const shown = cards.reduce((n, c) => n + c.dicts.length, 0);
    if (searching && !shown) return '';

    // При поиске узлы раскрыты: иначе результат не увидеть без щелчков.
    const openType = searching || state.open['t|' + type.typeId] === true;

    return `<div class="dc-tree-type ${openType ? 'open' : ''} ${type.typeId ? '' : 'unbound'}">
      <button class="dc-tree-head" data-tree-type="${esc(type.typeId)}">
        ${ICON_CHEV}<span>${esc(type.label)}</span><b>${shown}</b>
      </button>
      <div class="dc-tree-body">
        ${cards.map((c) => {
          const openCard = searching || state.open['c|' + c.key] === true;
          const folders = (c.folders || [])
            .map((f) => ({ ...f, dicts: f.dicts.filter(matchesDict) }))
            .filter((f) => f.dicts.length || !searching);

          return `<div class="dc-tree-card ${openCard ? 'open' : ''}">
            <button class="dc-tree-sub" data-tree-card="${esc(c.key)}">
              ${ICON_CHEV}<span>${esc(c.label)}</span><b>${c.dicts.length + folders.reduce((n, f) => n + f.dicts.length, 0)}</b>
            </button>
            <div class="dc-tree-list">
              ${folders.map((f) => {
                const openFolder = searching || state.open['f|' + f.key] === true;
                return `<div class="dc-tree-folder ${openFolder ? 'open' : ''}">
                  <button class="dc-tree-fold" data-tree-folder="${esc(f.key)}">
                    ${ICON_CHEV}${ICON_FOLDER}<span>${esc(f.name)}</span><b>${f.dicts.length}</b>
                  </button>
                  <div class="dc-tree-list">${f.dicts.map(dictRowHTML).join('')}</div>
                </div>`;
              }).join('')}
              ${c.dicts.length ? c.dicts.map(dictRowHTML).join('')
                : (folders.length ? '' : '<div class="dc-tree-empty">Пусто — сюда можно перенести справочник</div>')}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');

  return `<div class="dc-tree">
      ${nodes || '<div class="dc-tree-empty">Ничего не найдено</div>'}
    </div>`;
}

// --- выбор вида: настройка, а не пять вкладок -------------------------------
//
// Вид меняют один раз «под себя» и дальше работают — держать пять кнопок в
// шапке значит отнимать место у поиска и фильтров ради того, чем пользуются
// изредка. Поэтому это настройка в выпадающем меню (решение пользователя
// 02.09.2026: «Все 4 формата. Но выбираем между ними через настройки»).

function viewSwitchHTML() {
  const cur = VIEWS.find((v) => v.key === state.view) || VIEWS[0];

  return `<div class="dd dc-views ${state.viewMenuOpen ? 'open' : ''}" data-view-dd>
    <button class="dc-views-btn" data-view-toggle title="Как показывать справочники">
      ${ICON_GEAR}
      <span>Вид: <b>${esc(cur.label)}</b></span>
      <i class="dc-views-caret">▾</i>
    </button>

    <div class="dd-menu dc-views-menu">
      <div class="dd-group">Навигация по справочникам</div>
      ${VIEWS.map((v) => `<button class="dc-view-opt ${v.key === state.view ? 'on' : ''}"
        data-view="${v.key}">
        <b>${esc(v.label)}</b>
        <span>${esc(v.hint)}</span>
      </button>`).join('')}
    </div>
  </div>`;
}

// Общая часть всех видов: поиск и тумблер системных.
function filtersHTML() {
  return `<div class="dc-field dc-field-search">
      ${ICON_SEARCH}
      <input data-dc-q value="${esc(state.q)}" autocomplete="off"
        placeholder="Поиск по названию и значениям…">
      ${state.q ? '<button class="dc-field-clear" data-dc-q-clear title="Очистить">×</button>' : ''}
    </div>

    <label class="dc-switch ${state.showSystem ? 'on' : ''}"
      title="Системные перечни управляют логикой карточек и правке не подлежат">
      <input type="checkbox" data-dc-sys ${state.showSystem ? 'checked' : ''}>
      <span class="dc-switch-track"><i></i></span>
      <span class="dc-switch-text">${ICON_LOCK} Системные</span>
      <b>${allDicts().filter((x) => x.system).length}</b>
    </label>`;
}

function newDictHTML() {
  if (!canEditDicts()) return '';
  return state.creating
    ? `<div class="dc-field dc-field-new">
         <input data-dc-new-name autocomplete="off" placeholder="Название справочника — Enter">
         <button class="dc-field-clear" data-dc-new-cancel title="Отмена">×</button>
       </div>`
    : '<button class="btn btn-primary dc-add" data-dc-new>+ Справочник</button>';
}

// --- вид «шаги»: три списка рядом ------------------------------------------
//
// Самый понятный без опыта: выбрал в первом — появилось во втором. Ничего не
// раскрывается и не сворачивается, путь виден целиком.

function stepsHTML() {
  const tree = catalogTree();
  const type = tree.find((t) => t.typeId === state.stepType) || null;
  const cards = type ? type.cards : [];
  const card = cards.find((c) => c.key === state.stepCard) || null;
  const d = state.selected ? getDict(state.selected) : null;

  return `<div class="dc-steps">
    ${typeColHTML(tree)}
    ${cardColHTML(type, cards)}
    ${d ? valueColHTML(d) : dictColHTML(card)}
  </div>`;
}

// Шаг 1 — типы ОЦ.
function typeColHTML(tree) {
  return `<div class="dc-step">
    <div class="dc-step-head">Шаг 1 · Тип ОЦ</div>
    <div class="dc-step-body">
      ${tree.map((t) => `<button class="dc-step-row ${t.typeId === state.stepType ? 'on' : ''}
        ${t.typeId ? '' : 'unbound'}" data-step-type="${esc(t.typeId)}">
        <span>${esc(t.label)}</span><b>${t.count}</b>
      </button>`).join('')}
    </div>
  </div>`;
}

// Шаг 2 — типы ОИ выбранного типа ОЦ.
function cardColHTML(type, cards) {
  return `<div class="dc-step">
    <div class="dc-step-head">Шаг 2 · Тип ОИ</div>
    <div class="dc-step-body">
      ${type ? cards.map((c) => `<button class="dc-step-row ${c.key === state.stepCard ? 'on' : ''}"
          data-step-card="${esc(c.key)}">
          <span>${esc(c.label)}</span><b>${c.total}</b>
        </button>`).join('')
        : '<div class="dc-step-empty">Выберите тип объекта оценки</div>'}
    </div>
  </div>`;
}

// Шаг 3, первое состояние — перечисления (поля) выбранного типа ОИ списком.
// Папка остаётся пометкой у поля: отдельным уровнем она превратила бы столбец
// обратно в дерево. Клик по полю открывает связанный с ним справочник — второе
// состояние этого же столбца.
function dictColHTML(card) {
  const rowOf = (d, folder) => `<button class="dc-step-row dict ${d.system ? 'sys' : ''}"
    data-dict="${esc(d.id)}">
    <span>${d.system ? `<i class="dc-lock">${ICON_LOCK}</i>` : ''}${esc(d.name)}
      ${folder ? `<i class="dc-step-folder">${esc(folder)}</i>` : ''}</span>
    <b>${d.items.length}</b>
  </button>`;

  const own = card ? card.dicts.filter(matchesDict) : [];
  const inFolders = card ? (card.folders || []).map((f) => ({
    name: f.name, dicts: f.dicts.filter(matchesDict),
  })).filter((f) => f.dicts.length) : [];

  const n = own.length + inFolders.reduce((k, f) => k + f.dicts.length, 0);

  return `<div class="dc-step wide">
    <div class="dc-step-head">Шаг 3 · Значения${n ? `<b>${n}</b>` : ''}</div>
    <div class="dc-step-body">
      ${!card ? '<div class="dc-step-empty">Выберите тип объекта имущества</div>'
        : n ? `${card.key === 'unbound' ? `<div class="dc-step-hint">Эти справочники ни к чему
              не привязаны — карточки их не видят. Откройте любой и нажмите
              «Привязать к полю».</div>` : ''}
            ${inFolders.map((f) => f.dicts.map((d) => rowOf(d, f.name)).join('')).join('')}
            ${own.map((d) => rowOf(d, '')).join('')}`
          : '<div class="dc-step-empty">Здесь пока нет справочников</div>'}
    </div>
  </div>`;
}

// Шаг 3, второе состояние — открытый справочник. Внутри столбца те же блоки
// 01–04, что и в дереве: общие сведения, значения, где применяется,
// использование (требование пользователя 02.09.2026 — «подобное обязано быть в
// режиме столбцов»). Отличие только в том, что прокручивается сам столбец, а
// первые два остаются на месте и не меняют ширину.
function valueColHTML(d) {
  const main = mainSlot(d);

  return `<div class="dc-step wide">
    <div class="dc-step-head">
      <button class="dc-step-back" data-dc-back title="К списку значений">←</button>
      Справочник<b>${d.items.length}</b>
      ${d.system ? `<span class="dc-badge sys">${ICON_LOCK} системный</span>` : ''}
      ${!main ? '<span class="dc-badge warn">не привязан к полю</span>' : ''}
    </div>

    <div class="dc-step-body cards">
      ${generalHTML(d)}
      ${itemsHTML(d)}
      ${whereHTML(d)}
      ${usageHTML(d)}
    </div>
  </div>`;
}




// --- блок 01: общие сведения ----------------------------------------------

function generalHTML(d) {
  const used = dictUsage(d);
  const edit = canEditDicts() && !d.system;
  const main = mainSlot(d);

  return `<section class="card dc-card">
    <header class="dc-card-head">
      <span class="card-idx">01</span>
      <h3>Общие сведения</h3>
      ${d.system ? `<span class="dc-badge sys">${ICON_LOCK} системный</span>` : ''}
      ${!main ? '<span class="dc-badge warn">не привязан к полю</span>' : ''}
      ${canEditDicts() ? `<span class="dc-card-tools">
        <button class="btn btn-ghost btn-sm" data-dc-copy
          title="Копия со всеми значениями. Копия не привязана — её отдают другому полю">Копировать</button>
        ${!d.system && !main ? `<button class="btn btn-danger btn-sm" data-dc-del
          title="Удалить справочник">Удалить</button>` : ''}
      </span>` : ''}
    </header>

    <div class="dc-card-body">
      <div class="dc-title-row">
        <div class="dc-title-box">
          <input class="dc-title ${edit ? '' : 'ro'}" data-dc-name value="${esc(d.name)}"
            ${edit ? '' : 'readonly'} aria-label="Название справочника">
          <input class="dc-subtitle ${edit ? '' : 'ro'}" data-dc-note value="${esc(d.note)}"
            ${edit ? '' : 'readonly'} aria-label="Пояснение"
            placeholder="${edit ? 'Пояснение — когда применять этот справочник' : 'без пояснения'}">
        </div>

        <div class="dc-metrics">
          <div class="dc-metric"><b>${d.items.length}</b><span>значений</span></div>
          <div class="dc-metric"><b>${used}</b><span>вхождений</span></div>
        </div>
      </div>

      <div class="dc-meta-row">
        ${main ? `<span><i>Папка</i> ${d.folder ? esc(d.folder) : 'без папки'}</span>` : ''}
        <span><i>Создан</i> ${esc(d.createdBy)}${d.createdAt !== '—' ? ' · ' + esc(d.createdAt) : ''}</span>
        <span><i>Изменён</i> ${d.updatedAt ? esc(d.updatedBy) + ' · ' + esc(d.updatedAt) : 'не менялся'}</span>
        <span><i>Вид</i> ${d.kind === 'group' ? 'с разделами' : 'плоский перечень'}</span>
      </div>
    </div>
  </section>`;
}

// --- блок 02: значения -----------------------------------------------------

// Таблица значений — одна на оба вида: в столбце она идёт как есть, в дереве
// заворачивается в карточку блока 02. Обработчики привязаны к data-атрибутам
// строк, поэтому оба места работают одинаково.
function itemsTableHTML(d) {
  const edit = canEditDicts() && !d.system;
  const q = state.itemQ.trim().toLowerCase();
  const shown = d.items.filter((it) => !q || it.value.toLowerCase().includes(q)
    || (it.note || '').toLowerCase().includes(q));

  const rowFor = (it, idx) => {
    const { count } = usageOf(d, it.value);
    return `<tr data-item="${esc(it.id)}" ${edit ? 'draggable="true"' : ''}
        class="${state.dragItem === it.id ? 'dragging' : ''}">
      <td class="dc-grip">${edit
        ? `<span class="dc-grip-h" title="Перетащите, чтобы изменить порядок">${ICON_GRIP}</span>`
        : `<span class="dc-num">${idx + 1}</span>`}</td>
      <td>${edit
        ? `<input class="dc-cell" data-item-value="${esc(it.id)}" value="${esc(it.value)}">`
        : `<span class="dc-cell-ro">${esc(it.value)}</span>`}</td>
      <td>${edit
        ? `<input class="dc-cell muted" data-item-note="${esc(it.id)}" value="${esc(it.note || '')}"
             placeholder="пояснение">`
        : `<span class="dc-cell-ro muted">${esc(it.note || '')}</span>`}</td>
      <td class="dc-usage">${count
        ? `<button class="dc-usage-btn" data-item-usage="${esc(it.id)}"
             title="Показать объекты">${count}</button>`
        : '<span class="dc-usage-zero" title="Значение ни разу не выбрано">—</span>'}</td>
      <td class="dc-act">${edit
        ? `<button class="dc-x" data-item-del="${esc(it.id)}"
             title="${count ? 'Значение используется — потребуется замена' : 'Удалить значение'}">×</button>`
        : ''}</td>
    </tr>`;
  };

  const groups = new Map();
  shown.forEach((it) => {
    const key = it.group || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  });

  let n = 0;
  const body = [...groups.entries()].map(([group, items]) => `
    ${group ? `<tr class="dc-group-row"><td colspan="5">${esc(group)}</td></tr>` : ''}
    ${items.map((it) => rowFor(it, n++)).join('')}`).join('');

  const addRow = edit ? `<tr class="dc-add-row">
      <td class="dc-grip"><span class="dc-plus">+</span></td>
      <td colspan="2"><input class="dc-cell dc-new" data-item-new
        placeholder="Новое значение — введите и нажмите Enter"></td>
      <td colspan="2"></td>
    </tr>` : '';

  if (!d.items.length && !edit) return '<div class="dc-empty">Ни одного значения.</div>';

  return `<table class="dc-tbl">
    <thead><tr>
      <th class="dc-grip"></th>
      <th>Значение</th>
      <th>Пояснение</th>
      <th class="dc-usage">Объектов</th>
      <th class="dc-act"></th>
    </tr></thead>
    <tbody>${body}${addRow}</tbody>
  </table>`;
}

function itemsHTML(d) {
  const edit = canEditDicts() && !d.system;
  const q = state.itemQ.trim().toLowerCase();
  const shown = d.items.filter((it) => !q || it.value.toLowerCase().includes(q)
    || (it.note || '').toLowerCase().includes(q));

  return `<section class="card dc-card">
    <header class="dc-card-head">
      <span class="card-idx">02</span>
      <h3>Значения</h3>
      <span class="dc-count">${q ? `${shown.length} из ${d.items.length}` : d.items.length}</span>
      <span class="dc-card-tools">
        ${d.items.length > 8 ? `<input class="input dc-item-q" data-dc-item-q value="${esc(state.itemQ)}"
          placeholder="Поиск по значениям…" autocomplete="off">` : ''}
        ${edit ? '<button class="btn btn-ghost btn-sm" data-item-add>+ Значение</button>' : ''}
      </span>
    </header>

    <div class="dc-card-body flush">${itemsTableHTML(d)}</div>
  </section>`;
}

// --- блок 03: где применяется ---------------------------------------------

function whereHTML(d) {
  const edit = canEditDicts() && !d.system;
  const slot = mainSlot(d);

  return `<section class="card dc-card">
    <header class="dc-card-head">
      <span class="card-idx">03</span>
      <h3>Где применяется</h3>
      ${edit ? `<span class="dc-card-tools">
        ${slot ? `<button class="btn btn-ghost btn-sm" data-folder-open>Папка</button>
               <button class="btn btn-ghost btn-sm" data-move-open>Перенести в другой каталог</button>
               <button class="btn btn-ghost btn-sm" data-unbind>Отвязать</button>`
             : '<button class="btn btn-primary btn-sm" data-move-open>Привязать к полю</button>'}
      </span>` : ''}
    </header>

    <div class="dc-card-body">
      ${slot ? `<div class="dc-where">
          <div class="dc-where-step">
            <i>Тип объекта оценки</i><b>${esc(slot.typeLabel)}</b>
          </div>
          <span class="dc-where-arrow">→</span>
          <div class="dc-where-step">
            <i>Тип объекта имущества</i><b>${esc(CARD_LABEL[slot.card] || slot.card)}</b>
          </div>
          <span class="dc-where-arrow">→</span>
          <div class="dc-where-step field">
            <i>Поле карточки</i><b>${esc(slot.label)}</b>
          </div>
        </div>
        ${folderRowHTML(d)}`
      : `<div class="dc-empty">Справочник ни к чему не привязан — карточки его не видят.
         ${edit ? 'Нажмите «Привязать к полю».' : ''}</div>`}

      ${state.folderOpen && edit ? folderPickerHTML(d) : ''}
      ${state.moveOpen && edit ? movePickerHTML(d) : ''}
      ${state.movePick && edit ? moveChoiceHTML(d) : ''}
    </div>
  </section>`;
}

// Папка справочника внутри каталога — строкой под цепочкой привязки.
function folderRowHTML(d) {
  if (!d.folder) return '';
  return `<div class="dc-folder-row">
    ${ICON_FOLDER}<span>Лежит в папке <b>${esc(d.folder)}</b></span>
  </div>`;
}

// Выбор папки внутри того же каталога: существующая, новая или без папки.
// Пользователь: «раз есть папки, можно перемещать в эту папку справочник
// внутри ОИ».
function folderPickerHTML(d) {
  const main = mainSlot(d);
  const list = main ? foldersOf(main.typeId, main.card) : [];

  return `<div class="dc-picker">
    <div class="dc-picker-head">Папка внутри каталога
      <button class="btn btn-ghost btn-sm" data-folder-close style="margin-left:auto">Закрыть</button></div>
    <div class="dc-picker-note">Папки группируют справочники одного типа ОИ — например,
      разделы конструктивного состава. Привязка к полю от папки не зависит.</div>
    <div class="dc-picker-slots">
      <button class="dc-slot ${d.folder ? '' : 'here'}" data-folder-set=""
        ${d.folder ? '' : 'disabled'}><b>Без папки</b><span>прямо в каталоге</span></button>
      ${list.map((f) => `<button class="dc-slot ${f === d.folder ? 'here' : ''}"
        data-folder-set="${esc(f)}" ${f === d.folder ? 'disabled' : ''}>
        <b>${esc(f)}</b><span>${f === d.folder ? 'здесь сейчас' : 'перенести сюда'}</span></button>`).join('')}
    </div>
    <div class="dc-field dc-field-folder">
      <input data-folder-new autocomplete="off" placeholder="Новая папка — введите название и нажмите Enter">
    </div>
  </div>`;
}

// Выбор каталога для переноса: тип ОЦ → тип ОИ. Поле подбирается по ключу.
function movePickerHTML(d) {
  const tree = catalogTree().filter((t) => t.typeId);
  const here = dictCatalog(d);
  const main = mainSlot(d);

  return `<div class="dc-picker">
    <div class="dc-picker-head">${main ? 'Куда перенести' : 'Куда привязать'}
      <button class="btn btn-ghost btn-sm" data-move-close style="margin-left:auto">Закрыть</button></div>
    <div class="dc-picker-note">${main
      ? 'Привязка перейдёт на одноимённое поле выбранного каталога. Если такого поля там нет — спросим, к какому привязать.'
      : 'Выберите каталог — дальше покажем свободные поля в нём.'}</div>
    ${tree.map((t) => `<div class="dc-picker-type">${esc(t.label)}</div>
      <div class="dc-picker-slots">
        ${t.cards.map((c) => `<button class="dc-slot ${c.key === here ? 'here' : ''}"
          data-move-to="${esc(c.typeId)}|${esc(c.card)}" ${c.key === here ? 'disabled' : ''}>
          <b>${esc(c.label)}</b><span>${c.key === here ? 'здесь сейчас'
            : `${c.dicts.length} ${plural(c.dicts.length, 'справочник', 'справочника', 'справочников')}`}</span>
        </button>`).join('')}
      </div>`).join('')}
  </div>`;
}

// Одноимённого поля не нашлось (или оно занято) — спрашиваем, ничего не меняя.
function moveChoiceHTML() {
  const { options, targetLabel, taken, busySlots } = state.movePick;
  const busy = busySlots || [];

  const slotBtn = (s, byName) => `<button class="dc-slot ${byName ? 'busy' : ''}"
    data-bind-slot="${esc(s.typeId)}|${esc(s.card)}|${esc(s.field)}|${esc(s.label)}"
    ${byName ? `data-bind-busy="${esc(byName)}"` : ''}>
    <b>${esc(s.label)}</b>
    <span>${byName ? `занято: ${esc(byName)}` : esc(CARD_LABEL[s.card] || s.card)}</span>
  </button>`;

  return `<div class="dc-picker warn">
    <div class="dc-picker-head">${taken
      ? `Одноимённое поле занято справочником «${esc(taken)}»`
      : `В каталоге «${esc(targetLabel)}» нет поля с тем же названием`}
      <button class="btn btn-ghost btn-sm" data-move-cancel style="margin-left:auto">Отмена</button></div>
    <div class="dc-picker-note">Выберите поле, к которому привязать справочник.
      Пока не выберете — ничего не изменится.</div>

    ${options.length ? `<div class="dc-picker-sub">Свободные поля</div>
      <div class="dc-picker-slots">${options.map((s) => slotBtn(s, '')).join('')}</div>` : ''}

    ${busy.length ? `<div class="dc-picker-sub">Занятые поля — можно заменить</div>
      <div class="dc-picker-note">У поля уже есть справочник. Если выбрать его,
        прежний перечень отвяжется и уйдёт в «Не привязаны» — значения при этом
        сохранятся.</div>
      <div class="dc-picker-slots">${busy.map((s) => slotBtn(s, s.byName)).join('')}</div>` : ''}

    ${!options.length && !busy.length
      ? '<div class="dc-empty">В этом каталоге нет ни одного поля.</div>' : ''}
  </div>`;
}

// --- блок 04: использование ------------------------------------------------

function usageHTML(d) {
  let total = 0;
  const unused = [];
  const byStatus = new Map();

  d.items.forEach((it) => {
    const { count, places } = usageOf(d, it.value);
    total += count;
    if (!count) unused.push(it.value);
    places.forEach((p) => byStatus.set(p.status || '—', (byStatus.get(p.status || '—') || 0) + 1));
  });

  const inUse = d.items.length - unused.length;

  return `<section class="card dc-card">
    <header class="dc-card-head">
      <span class="card-idx">04</span>
      <h3>Использование</h3>
      <span class="dc-hint">по объектам, открытым в этой сессии</span>
    </header>

    <div class="dc-card-body">
      <div class="dc-metrics wide">
        <div class="dc-metric"><b>${total}</b><span>вхождений всего</span></div>
        <div class="dc-metric"><b>${inUse} из ${d.items.length}</b><span>значений в деле</span></div>
        <div class="dc-metric ${unused.length ? 'idle' : ''}">
          <b>${unused.length}</b><span>ни разу не выбраны</span></div>
      </div>

      ${byStatus.size ? `<div class="dc-sub">По статусу объектов</div>
        <div class="dc-chips">${[...byStatus.entries()].sort((a, b) => b[1] - a[1])
          .map(([st, n]) => `<span class="dc-chip">${esc(st)}<b>${n}</b></span>`).join('')}</div>` : ''}

      ${unused.length ? `<div class="dc-sub">Не встречаются ни в одном объекте</div>
        <div class="dc-chips">${unused.map((v) => `<span class="dc-chip idle">${esc(v)}</span>`).join('')}</div>`
      : ''}
    </div>
  </section>`;
}

// --- блок 05: связанные справочники ---------------------------------------
//
// Связаны те, что привязаны к одноимённым полям: «Фундамент» у гражданского,
// производственного и жилого зданий. Общего перечня нет — каждый живёт сам,
// но правку значения можно применить ко всем отмеченным разом. Отмечены по
// умолчанию все (решение пользователя 02.09.2026).

function linkedTargets(d) {
  return linkedDicts(d).filter((x) => !state.linkedOff[x.id]);
}

function linkedHTML(d) {
  const linked = d && !d.system ? linkedDicts(d) : [];

  // Столбец рисуется всегда, даже пустой: если он появлялся только у части
  // справочников, соседние столбцы прыгали в ширине на каждый выбор — ровно то,
  // от чего уходили (пользователь 02.09.2026).
  if (!linked.length) {
    return `<aside class="dc-side empty">
      <div class="dc-side-head"><b>Связанные справочники</b></div>
      <div class="dc-side-empty">${!d
        ? 'Выберите справочник — здесь появятся перечни того же поля у других типов объектов.'
        : d.system
          ? 'Системный перечень правится только вместе с кодом, связывать его не с чем.'
          : 'У этого поля нет одноимённых в других типах объектов.'}</div>
    </aside>`;
  }

  const chosen = linkedTargets(d);

  return `<aside class="dc-side">
    <div class="dc-side-head">
      <b>Связанные справочники</b>
      <span>${chosen.length} из ${linked.length}</span>
    </div>

    <div class="dc-side-note">Перечни того же поля «${esc(mainSlot(d).label)}» у других
      типов объектов. Отмеченные меняются вместе с этим: значение добавится,
      переименуется и удалится и у них.
      <button class="dc-linked-all" data-linked-all="${chosen.length === linked.length ? 'off' : 'on'}">
        ${chosen.length === linked.length ? 'снять все' : 'выбрать все'}</button>
    </div>

    <div class="dc-side-body">
      ${linked.map((x) => {
        const on = !state.linkedOff[x.id];
        const diff = diffWith(d, x);
        const same = !diff.onlyMine.length && !diff.onlyTheirs.length;
        return `<label class="dc-linked-row ${on ? 'on' : ''}">
          <input type="checkbox" data-linked="${esc(x.id)}" ${on ? 'checked' : ''}>
          <span class="dc-linked-main">
            <b>${esc(x.slot.typeLabel)}</b>
            <span>${esc(CARD_LABEL[x.slot.card] || x.slot.card)} · ${x.items.length}
              ${plural(x.items.length, 'значение', 'значения', 'значений')}</span>
          </span>
          <span class="dc-linked-diff ${same ? 'same' : ''}">${same
            ? 'состав совпадает'
            : `${diff.onlyMine.length ? `нет ${diff.onlyMine.length}` : ''}${
                diff.onlyMine.length && diff.onlyTheirs.length ? ' · ' : ''}${
                diff.onlyTheirs.length ? `лишних ${diff.onlyTheirs.length}` : ''}`}</span>
        </label>`;
      }).join('')}
    </div>

    ${canEditDicts() ? `<div class="dc-side-foot">
      <button class="btn btn-ghost btn-sm" data-linked-sync
        title="Добавить отмеченным справочникам значения, которых у них нет">
        Догрузить недостающие</button>
    </div>` : ''}
  </aside>`;
}

// --- диалог удаления значения ---------------------------------------------
//
// Пользователь 02.09.2026: «текущее окно удаления значения при использовании в
// ОИ/ОЦ не проработано по дизайну». Переделано: сверху — что произойдёт и со
// сколькими объектами, дальше выбор замены крупными карточками, внизу таблица
// затронутых объектов со статусами. Кнопка называет действие, а не «ОК».

function removeDialogHTML(d) {
  const it = state.removing;
  if (!it) return '';
  const { count, places } = usageOf(d, it.value);
  const others = d.items.filter((x) => x.id !== it.id);
  const replaceTo = others[0] ? others[0].value : '';

  return `<div class="dc-modal-back" data-rm-back>
    <div class="dc-modal wide" role="dialog" aria-label="Удаление значения">
      <div class="dc-modal-head">
        <span class="dc-modal-kicker">Удаление значения справочника</span>
        <b>${esc(it.value)}</b>
      </div>

      <div class="dc-modal-body">
        <div class="dc-warn-box">
          <span class="dc-warn-n">${count}</span>
          <span class="dc-warn-text">
            ${plural(count, 'объект использует', 'объекта используют', 'объектов используют')}
            это значение в поле «${esc(mainSlot(d) ? mainSlot(d).label : d.name)}».
            <i>Просто удалить нельзя: в карточках осталось бы значение, которого нет
            в справочнике. Выберите, на что заменить.</i>
          </span>
        </div>

        <div class="dc-choices">
          <label class="dc-choice ${state.replaceMode === 'existing' ? 'on' : ''}">
            <input type="radio" name="rm-mode" data-rm-mode="existing"
              ${state.replaceMode === 'existing' ? 'checked' : ''}>
            <span class="dc-choice-body">
              <b>Заменить существующим значением</b>
              <i>Объекты перейдут на выбранное, «${esc(it.value)}» исчезнет из перечня.</i>
              <select class="select" data-rm-existing ${state.replaceMode === 'existing' ? '' : 'disabled'}>
                ${others.length ? others.map((x) => `<option>${esc(x.value)}</option>`).join('')
                  : '<option value="">других значений нет</option>'}
              </select>
            </span>
          </label>

          <label class="dc-choice ${state.replaceMode === 'new' ? 'on' : ''}">
            <input type="radio" name="rm-mode" data-rm-mode="new"
              ${state.replaceMode === 'new' ? 'checked' : ''}>
            <span class="dc-choice-body">
              <b>Переименовать</b>
              <i>Новое название встанет и в перечне, и во всех ${count}
                ${plural(count, 'объекте', 'объектах', 'объектах')}.</i>
              <input class="input" data-rm-new placeholder="Новое название"
                ${state.replaceMode === 'new' ? '' : 'disabled'}>
            </span>
          </label>
        </div>

        ${places.length ? `<div class="dc-sub">Затронутые объекты
            <span class="dc-count">${count}</span></div>
          <div class="dc-places">
            <div class="dc-place head">
              <span>Код ЕНИ</span><span>Адрес</span><span>Карточка</span><span>Статус</span>
            </div>
            ${places.slice(0, 10).map((p) => `<div class="dc-place">
              <span class="mono">${esc(fmtEni(p.eni))}</span>
              <span class="ell" title="${esc(p.title)}">${esc(p.title)}</span>
              <span class="ell muted">${esc(p.card)}${p.oiName ? ' · ' + esc(p.oiName) : ''}</span>
              <span class="ell muted">${esc(p.status || '—')}</span>
            </div>`).join('')}
            ${count > 10 ? `<div class="dc-place more">…и ещё ${count - 10}
              ${plural(count - 10, 'объект', 'объекта', 'объектов')}</div>` : ''}
          </div>` : ''}
      </div>

      <div class="dc-modal-foot">
        <span class="dc-modal-hint">${state.replaceMode === 'new'
          ? 'Значение будет переименовано во всех объектах'
          : (replaceTo ? `Объекты перейдут на «${esc(replaceTo)}»` : 'Выберите замену')}</span>
        <button class="btn btn-ghost" data-rm-cancel>Отмена</button>
        <button class="btn btn-primary" data-rm-ok>${state.replaceMode === 'new'
          ? 'Переименовать' : 'Заменить и удалить'}</button>
      </div>
    </div>
  </div>`;
}

// --- сборка ----------------------------------------------------------------

function viewHTML() {
  const d = state.selected ? getDict(state.selected) : null;

  const notice = canEditDicts() ? '' : `<div class="dc-notice">
    Справочники правят администратор и роль «любая». Ваша роль —
    «${esc(roleLabel(session.state.role))}»: состав и привязки видны, изменения недоступны.</div>`;

  const head = `<div class="dc-head">
    ${viewSwitchHTML()}
    <div class="dc-head-filters">${filtersHTML()}</div>
    ${newDictHTML()}
  </div>`;

  // Столбец связанных справочников общий для обоих видов: он едет вместе с
  // интерфейсом и виден, пока правишь значения (решение пользователя 02.09.2026).
  const side = linkedHTML(d);

  if (state.view === 'steps') {
    return `<div class="dc dc-wide">
      ${head}
      ${notice}
      <div class="dc-cols">
        <div class="dc-browser">${stepsHTML()}</div>
        ${side}
      </div>
      ${d ? removeDialogHTML(d) : ''}
    </div>`;
  }

  const card = d
    ? `${generalHTML(d)}${itemsHTML(d)}${whereHTML(d)}${usageHTML(d)}`
    : `<div class="dc-choose">
         <b>Выберите справочник</b>
         <span>У каждого типа объекта имущества на каждое поле — свой перечень.</span>
       </div>`;

  return `<div class="dc">
    <aside class="dc-list">
      <div class="dc-list-head">
        ${viewSwitchHTML()}
        ${filtersHTML()}
      </div>
      <div class="dc-panel">${treeHTML()}</div>
      ${canEditDicts() ? `<div class="dc-list-foot">${newDictHTML()}</div>` : ''}
    </aside>
    <div class="dc-main">
      ${notice}
      ${card}
    </div>
    ${side}
    ${d ? removeDialogHTML(d) : ''}
  </div>`;
}

export function mountDicts(host) {
  const scope = host.scope;
  document.body.dataset.page = 'dicts';
  setActiveNav('dict');
  setCrumbs([{ label: 'Главная', to: '#/' }, { label: 'Справочники', current: true }]);

  function render() {
    scope.setHTML(viewHTML());
    bind();
  }

  // Меню вида закрывается кликом мимо — как все выпадающие меню проекта.
  // Слушатель на документе снимается вместе с областью модуля (kernel/scope.js).
  scope.onDocument('click', (e) => {
    if (!state.viewMenuOpen) return;
    if (e.target.closest('[data-view-dd]')) return;
    state.viewMenuOpen = false;
    render();
  });

  // Перерисовка не должна выбивать курсор: таблица обновляется на каждое
  // изменение, а человек в это время печатает.
  function renderKeepFocus() {
    const el = document.activeElement;
    const attr = el && el.attributes
      ? [...el.attributes].find((a) => a.name.startsWith('data-'))
      : null;
    const sel = attr ? `[${attr.name}${attr.value ? `="${attr.value}"` : ''}]` : null;
    const pos = el && el.selectionStart;

    render();

    if (!sel) return;
    const again = scope.$(sel);
    if (again && again.focus) {
      again.focus();
      if (pos != null && again.setSelectionRange) {
        try { again.setSelectionRange(pos, pos); } catch (e) { /* не текстовое поле */ }
      }
    }
  }

  function bind() {
    // --- выбор вида ---
    const viewToggle = scope.$('[data-view-toggle]');
    if (viewToggle) viewToggle.onclick = (e) => {
      e.stopPropagation();
      state.viewMenuOpen = !state.viewMenuOpen;
      render();
    };

    scope.$$('[data-view]').forEach((b) => b.onclick = () => {
      state.view = b.dataset.view;
      state.viewMenuOpen = false;
      // Шаги и плитки ведут по уровням: начинаем с того, где лежит выбранный
      // справочник, иначе человек теряет место после переключения вида.
      const cur = state.selected ? getDict(state.selected) : null;
      const slot = cur ? mainSlot(cur) : null;
      if (slot) {
        state.stepType = slot.typeId;
        state.stepCard = catalogKey(slot.typeId, slot.card);
      }
      render();
    });

    // --- столбцы ---
    scope.$$('[data-step-type]').forEach((b) => b.onclick = () => {
      state.stepType = b.dataset.stepType;
      state.stepCard = null;
      state.selected = null;
      render();
    });

    scope.$$('[data-step-card]').forEach((b) => b.onclick = () => {
      state.stepCard = b.dataset.stepCard;
      state.selected = null;
      render();
    });

    const toList = scope.$('[data-dc-back]');
    if (toList) toList.onclick = () => { state.selected = null; render(); };

    // --- дерево ---
    scope.$$('[data-tree-type]').forEach((b) => b.onclick = () => {
      const key = 't|' + b.dataset.treeType;
      state.open[key] = !state.open[key];
      render();
    });

    scope.$$('[data-tree-folder]').forEach((b) => b.onclick = () => {
      const key = 'f|' + b.dataset.treeFolder;
      state.open[key] = !state.open[key];
      render();
    });

    scope.$$('[data-tree-card]').forEach((b) => b.onclick = () => {
      const key = 'c|' + b.dataset.treeCard;
      state.open[key] = !state.open[key];
      render();
    });

    scope.$$('[data-dict]').forEach((b) => b.onclick = () => {
      state.selected = b.dataset.dict;
      state.itemQ = '';
      state.moveOpen = false;
      state.folderOpen = false;
      state.movePick = null;
      // Выбор связанных относится к конкретному справочнику: у нового своя
      // компания, и переносить снятые галочки было бы неверно.
      state.linkedOff = {};
      // Столбцы и дерево показывают одно и то же: выбрал в дереве — столбцы
      // встают на тот же путь, и наоборот.
      const picked = getDict(state.selected);
      const pickedSlot = picked ? mainSlot(picked) : null;
      if (pickedSlot) {
        state.stepType = pickedSlot.typeId;
        state.stepCard = catalogKey(pickedSlot.typeId, pickedSlot.card);
      } else {
        // Непривязанный лежит в своей ветке первого столбца — туда и встаём,
        // иначе столбцы показывают путь, которого у справочника нет.
        state.stepType = '';
        state.stepCard = 'unbound';
      }
      render();
    });

    const q = scope.$('[data-dc-q]');
    if (q) q.oninput = () => { state.q = q.value; renderKeepFocus(); };

    const qClear = scope.$('[data-dc-q-clear]');
    if (qClear) qClear.onclick = () => { state.q = ''; render(); scope.$('[data-dc-q]').focus(); };

    const sys = scope.$('[data-dc-sys]');
    if (sys) sys.onchange = () => { state.showSystem = sys.checked; render(); };

    // --- создание строкой, без отдельного окна ---
    const add = scope.$('[data-dc-new]');
    if (add) add.onclick = () => {
      state.creating = true;
      render();
      const field = scope.$('[data-dc-new-name]');
      if (field) field.focus();
    };

    const newName = scope.$('[data-dc-new-name]');
    if (newName) {
      // Enter уводит фокус, а blur снова зовёт commit — второй вызов рвал DOM.
      let committed = false;
      const commit = () => {
        if (committed) return;
        committed = true;

        const name = (newName.value || '').trim();
        if (!name) { state.creating = false; render(); return; }
        const d = createDict(name);
        state.creating = false;
        if (!d) { render(); return; }

        state.selected = d.id;
        // Новый справочник ни к чему не привязан, поэтому столбцы встают на
        // ветку «Не привязаны» — там его потом и искать.
        state.stepType = '';
        state.stepCard = 'unbound';
        render();
        host.toast('Справочник создан — привяжите его к полю', 'ok');
        const first = scope.$('[data-item-new]');
        if (first) first.focus();
      };

      newName.onkeydown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { state.creating = false; render(); }
      };
      newName.onblur = () => { if ((newName.value || '').trim()) commit(); };
    }

    const newCancel = scope.$('[data-dc-new-cancel]');
    if (newCancel) newCancel.onmousedown = (e) => {
      // mousedown, а не click: blur поля успел бы создать справочник раньше.
      e.preventDefault();
      state.creating = false;
      render();
    };

    const d = state.selected ? getDict(state.selected) : null;
    if (!d) return;

    // --- блок 01 ---
    const nm = scope.$('[data-dc-name]');
    if (nm) nm.onchange = () => { renameDict(d, nm.value); render(); };

    const note = scope.$('[data-dc-note]');
    if (note) note.onchange = () => { setDictNote(d, note.value); };

    const copy = scope.$('[data-dc-copy]');
    if (copy) copy.onclick = () => {
      const c = copyDict(d);
      if (c) {
        state.selected = c.id;
        render();
        host.toast('Создана копия — привяжите её к полю', 'ok');
      }
    };

    const del = scope.$('[data-dc-del]');
    if (del) del.onclick = async () => {
      const ok = await host.confirm({
        title: 'Удалить справочник', okLabel: 'Удалить', danger: true,
        text: `Удалить «${d.name}»? Значения будут потеряны.`,
      });
      if (!ok) return;
      if (removeDict(d)) { state.selected = null; render(); host.toast('Справочник удалён', 'ok'); }
    };

    // --- блок 02 ---
    const iq = scope.$('[data-dc-item-q]');
    if (iq) iq.oninput = () => { state.itemQ = iq.value; renderKeepFocus(); };

    const nw = scope.$('[data-item-new]');
    const commitNew = () => {
      const value = (nw.value || '').trim();
      if (!value) return;
      if (hasValue(d, value)) {
        host.toast('Такое значение уже есть в справочнике', 'warn');
        return;
      }
      addItem(d, value);

      // Те же значения — в отмеченные связанные справочники: перечни
      // одноимённых полей должны держаться вместе (синхронизация).
      const targets = linkedTargets(d);
      const alsoIn = addItemTo(targets, value);

      nw.value = '';
      render();
      const again = scope.$('[data-item-new]');
      if (again) again.focus();

      if (alsoIn) {
        host.toast(`Добавлено здесь и ещё в ${alsoIn} `
          + `${plural(alsoIn, 'справочник', 'справочника', 'справочников')}`, 'ok');
      }
    };

    if (nw) {
      nw.onkeydown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commitNew(); }
        if (e.key === 'Escape') { nw.value = ''; nw.blur(); }
      };
      nw.onblur = () => { if ((nw.value || '').trim()) commitNew(); };
    }

    const iadd = scope.$('[data-item-add]');
    if (iadd) iadd.onclick = () => {
      const field = scope.$('[data-item-new]');
      if (field) { field.scrollIntoView({ block: 'nearest' }); field.focus(); }
    };

    scope.$$('[data-item-value]').forEach((input) => {
      input.onchange = () => {
        const it = d.items.find((x) => x.id === input.dataset.itemValue);
        if (!it || input.value.trim() === it.value) return;

        const was = it.value;
        const to = input.value.trim();
        if (!renameItem(d, it, to)) {
          host.toast('Такое значение уже есть — переименование отменено', 'warn');
          render();
          return;
        }

        // Переименование в связанных: иначе перечни расходятся с первой опечатки.
        const res = renameItemIn(linkedTargets(d), was, to);
        render();
        if (res.dicts) {
          host.toast(`Переименовано здесь и ещё в ${res.dicts} `
            + `${plural(res.dicts, 'справочнике', 'справочниках', 'справочниках')}`
            + (res.objects ? `, объектов затронуто ${res.objects}` : ''), 'ok');
        }
      };
      input.onkeydown = (e) => { if (e.key === 'Enter') input.blur(); };
    });

    scope.$$('[data-item-note]').forEach((input) => {
      input.onchange = () => {
        const it = d.items.find((x) => x.id === input.dataset.itemNote);
        if (it) it.note = input.value;
      };
      input.onkeydown = (e) => { if (e.key === 'Enter') input.blur(); };
    });

    scope.$$('[data-item-del]').forEach((b) => b.onclick = async () => {
      const it = d.items.find((x) => x.id === b.dataset.itemDel);
      if (!it) return;
      const { count } = usageOf(d, it.value);

      // Гибридное правило: не используется — убираем сразу.
      if (!count) {
        const ok = await host.confirm({
          title: 'Удалить значение', okLabel: 'Удалить', danger: true,
          text: `Удалить «${it.value}»? Значение нигде не используется.`,
        });
        if (!ok) return;
        removeItem(d, it, null);
        const alsoDel = removeItemFrom(linkedTargets(d), it.value, null);
        render();
        host.toast(alsoDel.dicts
          ? `Удалено здесь и ещё в ${alsoDel.dicts} `
            + plural(alsoDel.dicts, 'справочнике', 'справочниках', 'справочниках')
          : 'Значение удалено', 'ok');
        return;
      }

      state.removing = it;
      state.replaceMode = 'existing';
      render();
    });

    scope.$$('[data-item-usage]').forEach((b) => b.onclick = () => {
      const it = d.items.find((x) => x.id === b.dataset.itemUsage);
      if (!it) return;
      const { places, count } = usageOf(d, it.value);
      host.select({
        title: `«${it.value}» — ${count} ${plural(count, 'объект', 'объекта', 'объектов')}`,
        options: places.slice(0, 25).map((p) => `${fmtEni(p.eni)} · ${p.title} · ${p.card}${p.oiName ? ' «' + p.oiName + '»' : ''}`),
      });
    });

    scope.$$('tr[data-item][draggable="true"]').forEach((tr) => {
      tr.addEventListener('dragstart', () => {
        state.dragItem = tr.dataset.item;
        tr.classList.add('dragging');
      });
      tr.addEventListener('dragend', () => {
        state.dragItem = null;
        scope.$$('tr[data-item]').forEach((x) => x.classList.remove('drop-over'));
        render();
      });
      tr.addEventListener('dragover', (e) => {
        if (!state.dragItem || state.dragItem === tr.dataset.item) return;
        e.preventDefault();
        scope.$$('tr[data-item]').forEach((x) => x.classList.toggle('drop-over', x === tr));
      });
      tr.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!state.dragItem) return;
        moveItem(d, state.dragItem, tr.dataset.item);
        state.dragItem = null;
        render();
      });
    });

    // --- блок 03: привязка и перенос ---
    // --- связанные справочники ---
    scope.$$('[data-linked]').forEach((cb) => cb.onchange = () => {
      const id = cb.dataset.linked;
      if (cb.checked) delete state.linkedOff[id];
      else state.linkedOff[id] = true;
      render();
    });

    const linkedAll = scope.$('[data-linked-all]');
    if (linkedAll) linkedAll.onclick = (e) => {
      e.stopPropagation();
      const on = linkedAll.dataset.linkedAll === 'on';
      linkedDicts(d).forEach((x) => {
        if (on) delete state.linkedOff[x.id];
        else state.linkedOff[x.id] = true;
      });
      render();
    };

    // Догрузить связанным то, чего у них нет: самый частый случай
    // синхронизации — «добавили материал здесь, нужен и там».
    const linkedSync = scope.$('[data-linked-sync]');
    if (linkedSync) linkedSync.onclick = async () => {
      const targets = linkedTargets(d);
      if (!targets.length) { host.toast('Не выбран ни один связанный справочник', 'warn'); return; }

      const missing = targets.reduce((n, x) => n + diffWith(d, x).onlyMine.length, 0);
      if (!missing) { host.toast('У выбранных справочников всё уже есть', 'ok'); return; }

      const ok = await host.confirm({
        title: 'Догрузить значения',
        okLabel: 'Догрузить',
        text: `Выбранным справочникам (${targets.length}) будет добавлено ${missing} `
          + `${plural(missing, 'значение', 'значения', 'значений')}, которых у них нет.`,
      });
      if (!ok) return;

      let added = 0;
      d.items.forEach((it) => { added += addItemTo(targets, it.value, it.group); });
      render();
      host.toast(`Добавлено значений: ${added}`, 'ok');
    };

    // --- папка внутри каталога ---
    const folderOpen = scope.$('[data-folder-open]');
    if (folderOpen) folderOpen.onclick = () => {
      state.folderOpen = true;
      state.moveOpen = false;
      render();
    };

    const folderClose = scope.$('[data-folder-close]');
    if (folderClose) folderClose.onclick = () => { state.folderOpen = false; render(); };

    scope.$$('[data-folder-set]').forEach((b) => b.onclick = () => {
      setFolder(d, b.dataset.folderSet);
      state.folderOpen = false;
      render();
      host.toast(b.dataset.folderSet
        ? `Перенесён в папку «${b.dataset.folderSet}»`
        : 'Вынесен из папки', 'ok');
    });

    const folderNew = scope.$('[data-folder-new]');
    if (folderNew) folderNew.onkeydown = (e) => {
      if (e.key === 'Escape') { state.folderOpen = false; render(); return; }
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const name = (folderNew.value || '').trim();
      if (!name) return;
      setFolder(d, name);
      state.folderOpen = false;
      render();
      host.toast(`Создана папка «${name}»`, 'ok');
    };

    const moveOpen = scope.$('[data-move-open]');
    if (moveOpen) moveOpen.onclick = () => {
      state.moveOpen = true;
      state.movePick = null;
      render();
    };

    const moveClose = scope.$('[data-move-close]');
    if (moveClose) moveClose.onclick = () => { state.moveOpen = false; render(); };

    const moveCancel = scope.$('[data-move-cancel]');
    if (moveCancel) moveCancel.onclick = () => { state.movePick = null; render(); };

    scope.$$('[data-move-to]').forEach((b) => b.onclick = () => {
      const [typeId, card] = b.dataset.moveTo.split('|');

      // Непривязанный справочник переносить нечего — сразу выбираем поле.
      // У непривязанного переносить нечего — сразу показываем поля каталога:
      // свободные и занятые (занятые можно заменить, спросив подтверждение).
      const cat = catalogKey(typeId, card);
      const res = mainSlot(d)
        ? moveToCatalog(d, typeId, card)
        : {
          ok: false,
          reason: 'выбор',
          options: freeSlots(cat),
          busySlots: slotsWithOwners(cat)
            .filter((x) => x.owner && x.owner !== d)
            .map((x) => ({ ...x, byName: x.owner.name })),
        };

      if (res.ok) {
        // Папка принадлежит каталогу: в новом каталоге её может не быть.
        setFolder(d, '');
        state.moveOpen = false;
        state.movePick = null;
        render();
        host.toast(`Перенесён: ${res.slot.typeLabel} · ${CARD_LABEL[res.slot.card]} · ${res.slot.label}`, 'ok');
        return;
      }

      // Автопривязка не сработала — спрашиваем, ничего не меняя.
      state.moveOpen = false;
      state.movePick = {
        options: res.options || [],
        targetLabel: CARD_LABEL[card] || card,
        taken: res.by ? res.by.name : '',
        busySlots: res.busySlots || [],
      };
      render();
    });

    scope.$$('[data-bind-slot]').forEach((b) => b.onclick = async () => {
      const [typeId, card, field, label] = b.dataset.bindSlot.split('|');
      const busyBy = b.dataset.bindBusy || '';

      // Замена — потеря привязки у чужого справочника, поэтому спрашиваем.
      if (busyBy) {
        const ok = await host.confirm({
          title: 'Заменить справочник у поля',
          okLabel: 'Заменить',
          text: `Поле «${label}» сейчас использует справочник «${busyBy}». `
            + 'Он отвяжется и уйдёт в «Не привязаны» — значения сохранятся.',
        });
        if (!ok) return;
      }

      const type = sortedTypes().find((t) => t.manifest.id === typeId);
      bindSlot(d, { typeId, typeLabel: type ? type.manifest.label : typeId, card, field, label });
      state.movePick = null;
      state.moveOpen = false;
      render();
      host.toast(busyBy ? `Поле «${label}» теперь берёт значения отсюда`
        : `Привязан к полю «${label}»`, 'ok');
    });

    const unbind = scope.$('[data-unbind]');
    if (unbind) unbind.onclick = async () => {
      const ok = await host.confirm({
        title: 'Отвязать справочник',
        okLabel: 'Отвязать',
        text: `Поле «${mainSlot(d).label}» вернётся к встроенному перечню.`
          + ' Справочник останется в разделе «Не привязаны».',
      });
      if (!ok) return;
      unbindSlot(d);
      render();
      host.toast('Справочник отвязан', 'ok');
    };

    // --- диалог удаления значения ---
    scope.$$('[data-rm-mode]').forEach((r) => r.onchange = () => {
      state.replaceMode = r.dataset.rmMode;
      render();
      const field = state.replaceMode === 'new' ? scope.$('[data-rm-new]') : scope.$('[data-rm-existing]');
      if (field) field.focus();
    });

    const cancel = scope.$('[data-rm-cancel]');
    if (cancel) cancel.onclick = () => { state.removing = null; render(); };

    const back = scope.$('[data-rm-back]');
    if (back) back.onclick = (e) => {
      if (e.target === back) { state.removing = null; render(); }
    };

    const rmOk = scope.$('[data-rm-ok]');
    if (rmOk) rmOk.onclick = () => {
      const it = state.removing;
      if (!it) return;
      const replacement = state.replaceMode === 'new'
        ? (scope.$('[data-rm-new]').value || '').trim()
        : (scope.$('[data-rm-existing]').value || '');

      if (!replacement) {
        host.toast('Укажите, чем заменить значение', 'warn');
        return;
      }

      const res = removeItem(d, it, replacement);
      // Та же замена — в отмеченных связанных справочниках: где значение
      // используется, объекты переедут на замену; где нет — просто исчезнет.
      const also = removeItemFrom(linkedTargets(d), it.value, replacement);

      state.removing = null;
      render();
      if (res) {
        const objects = res.touched + also.objects;
        host.toast(`Заменено в ${objects} ${plural(objects, 'объекте', 'объектах', 'объектах')}`
          + (also.dicts ? `, справочников затронуто ${also.dicts + 1}` : ''), 'ok');
      }
    };
  }

  render();
  const off = session.subscribe(() => render());

  return {
    onRoute() { render(); },
    destroy() { if (off) off(); },
  };
}
