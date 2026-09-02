// Раздел «Справочники» — перечни значений для полей карточек.
// ТЗ: docs/tz/10-spravochniki.md.
//
// Устройство (решения пользователя 02.09.2026):
//   * один справочник — одно поле; общих перечней на несколько полей нет;
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
  slotsWithOwners,
} from '../../kernel/dicts.js';

const state = {
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
  refOpen: false,      // открыт выбор поля для дополнительной ссылки
  refQ: '',            // поиск в этом выборе: полей больше сотни
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

  return `<aside class="dc-list">
    <div class="dc-list-head">
      <div class="dc-field dc-field-search">
        ${ICON_SEARCH}
        <input data-dc-q value="${esc(state.q)}" autocomplete="off"
          placeholder="Поиск по названию и значениям…">
        ${state.q ? '<button class="dc-field-clear" data-dc-q-clear title="Очистить">×</button>' : ''}
      </div>

      <label class="dc-switch ${state.showSystem ? 'on' : ''}"
        title="Системные перечни управляют логикой карточек и правке не подлежат">
        <input type="checkbox" data-dc-sys ${state.showSystem ? 'checked' : ''}>
        <span class="dc-switch-track"><i></i></span>
        <span class="dc-switch-text">${ICON_LOCK} Системные перечни</span>
        <b>${allDicts().filter((x) => x.system).length}</b>
      </label>
    </div>

    <div class="dc-tree">
      ${nodes || '<div class="dc-tree-empty">Ничего не найдено</div>'}
    </div>

    ${canEditDicts() ? `<div class="dc-list-foot">
      ${state.creating
        ? `<div class="dc-field dc-field-new">
             <input data-dc-new-name autocomplete="off" placeholder="Название справочника — Enter">
             <button class="dc-field-clear" data-dc-new-cancel title="Отмена">×</button>
           </div>`
        : '<button class="btn btn-primary dc-add" data-dc-new>+ Справочник</button>'}
    </div>` : ''}
  </aside>`;
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
      ${d.slots.length > 1 ? `<span class="dc-badge multi">ссылок: ${d.slots.length}</span>` : ''}
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

function itemsHTML(d) {
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

    <div class="dc-card-body flush">
      ${d.items.length || edit ? `<table class="dc-tbl">
        <thead><tr>
          <th class="dc-grip"></th>
          <th>Значение</th>
          <th>Пояснение</th>
          <th class="dc-usage">Объектов</th>
          <th class="dc-act"></th>
        </tr></thead>
        <tbody>${body}${addRow}</tbody>
      </table>` : '<div class="dc-empty">Ни одного значения.</div>'}
    </div>
  </section>`;
}

// --- блок 03: где применяется ---------------------------------------------

function whereHTML(d) {
  const edit = canEditDicts() && !d.system;
  const main = mainSlot(d);
  const extra = (d.slots || []).slice(1);

  const chain = (s, i) => `<div class="dc-where ${i ? 'extra' : ''}">
      ${i ? '<span class="dc-where-tag">ещё поле</span>' : ''}
      <div class="dc-where-step">
        <i>Тип объекта оценки</i><b>${esc(s.typeLabel)}</b>
      </div>
      <span class="dc-where-arrow">→</span>
      <div class="dc-where-step">
        <i>Тип объекта имущества</i><b>${esc(CARD_LABEL[s.card] || s.card)}</b>
      </div>
      <span class="dc-where-arrow">→</span>
      <div class="dc-where-step field">
        <i>Поле карточки</i><b>${esc(s.label)}</b>
      </div>
      ${edit && i ? `<button class="dc-x" data-ref-del="${i}"
        title="Убрать ссылку — поле вернётся к встроенному перечню">×</button>` : ''}
    </div>`;

  return `<section class="card dc-card">
    <header class="dc-card-head">
      <span class="card-idx">03</span>
      <h3>Где применяется</h3>
      ${d.slots.length > 1 ? `<span class="dc-count">${d.slots.length}</span>` : ''}
      ${edit ? `<span class="dc-card-tools">
        ${main ? `<button class="btn btn-ghost btn-sm" data-ref-add>+ Ещё поле</button>
               <button class="btn btn-ghost btn-sm" data-folder-open>Папка</button>
               <button class="btn btn-ghost btn-sm" data-move-open>Перенести в другой каталог</button>
               <button class="btn btn-ghost btn-sm" data-unbind>Отвязать</button>`
             : '<button class="btn btn-primary btn-sm" data-move-open>Привязать к полю</button>'}
      </span>` : ''}
    </header>

    <div class="dc-card-body">
      ${main ? `${chain(main, 0)}
        ${extra.map((x, i) => chain(x, i + 1)).join('')}
        ${extra.length ? `<div class="dc-where-note">Все эти поля читают один перечень:
          правка значения меняет их разом.</div>` : ''}
        ${folderRowHTML(d)}`
      : `<div class="dc-empty">Справочник ни к чему не привязан — карточки его не видят.
         ${edit ? 'Нажмите «Привязать к полю».' : ''}</div>`}

      ${state.refOpen && edit ? refPickerHTML(d) : ''}

      ${state.folderOpen && edit ? folderPickerHTML(d) : ''}
      ${state.moveOpen && edit ? movePickerHTML(d) : ''}
      ${state.movePick && edit ? moveChoiceHTML(d) : ''}
    </div>
  </section>`;
}

// Выбор поля для дополнительной ссылки. Свободные точки по всем каталогам:
// перечень может понадобиться и в другом типе ОЦ (наружные и внутренние стены —
// внутри одного, а вот «Права на строение» встречаются у нескольких).
function refPickerHTML(d) {
  const mine = new Set((d.slots || []).map((x) => `${x.typeId}|${x.card}|${x.field}`));
  const q = (state.refQ || '').trim().toLowerCase();

  const all = slotsWithOwners().filter((s) => {
    if (mine.has(`${s.typeId}|${s.card}|${s.field}`)) return false;
    if (!q) return true;
    return `${s.label} ${s.typeLabel} ${CARD_LABEL[s.card] || s.card}`.toLowerCase().includes(q);
  });

  const byType = new Map();
  all.forEach((s) => {
    if (!byType.has(s.typeLabel)) byType.set(s.typeLabel, []);
    byType.get(s.typeLabel).push(s);
  });

  return `<div class="dc-picker">
    <div class="dc-picker-head">Ещё одно поле для этого перечня
      <button class="btn btn-ghost btn-sm" data-ref-close style="margin-left:auto">Закрыть</button></div>
    <div class="dc-picker-note">Поле начнёт читать значения этого справочника — например у
      наружных и внутренних стен перечень материалов один и тот же. Поля, у которых уже есть
      свой справочник, помечены: выбор отберёт поле у него.</div>

    <div class="dc-field dc-field-refq">
      ${ICON_SEARCH}
      <input data-ref-q value="${esc(state.refQ || '')}" autocomplete="off"
        placeholder="Поиск по полям и типам…">
    </div>

    ${all.length ? [...byType.entries()].map(([type, slots]) => `
      <div class="dc-picker-type">${esc(type)}</div>
      <div class="dc-picker-slots">
        ${slots.map((s) => `<button class="dc-slot ${s.owner ? 'taken' : ''}"
          data-ref-slot="${esc(s.typeId)}|${esc(s.card)}|${esc(s.field)}|${esc(s.label)}"
          ${s.owner ? `data-ref-owner="${esc(s.owner.name)}"` : ''}>
          <b>${esc(s.label)}</b>
          <span>${esc(CARD_LABEL[s.card] || s.card)}${s.owner
            ? ` · сейчас «${esc(s.owner.name)}»` : ' · свободно'}</span>
        </button>`).join('')}
      </div>`).join('')
      : '<div class="dc-empty">Ничего не нашлось.</div>'}
  </div>`;
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
  const { options, targetLabel, taken } = state.movePick;

  return `<div class="dc-picker warn">
    <div class="dc-picker-head">${taken
      ? `Одноимённое поле занято справочником «${esc(taken)}»`
      : `В каталоге «${esc(targetLabel)}» нет поля с тем же названием`}
      <button class="btn btn-ghost btn-sm" data-move-cancel style="margin-left:auto">Отмена</button></div>
    <div class="dc-picker-note">Выберите поле, к которому привязать справочник.
      Пока не выберете — ничего не изменится.</div>
    <div class="dc-picker-slots">
      ${options.length ? options.map((s) => `<button class="dc-slot"
        data-bind-slot="${esc(s.typeId)}|${esc(s.card)}|${esc(s.field)}|${esc(s.label)}">
        <b>${esc(s.label)}</b><span>${esc(CARD_LABEL[s.card] || s.card)}</span></button>`).join('')
        : '<div class="dc-empty">Свободных полей в этом каталоге нет.</div>'}
    </div>
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
            это значение ${d.slots.length > 1
              ? `в полях ${d.slots.map((x) => '«' + esc(x.label) + '»').join(', ')}`
              : `в поле «${esc(mainSlot(d) ? mainSlot(d).label : d.name)}»`}.
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
  const all = allDicts();
  const d = state.selected ? getDict(state.selected) : null;

  const notice = canEditDicts() ? '' : `<div class="dc-notice">
    Справочники правят администратор и роль «любая». Ваша роль —
    «${esc(roleLabel(session.state.role))}»: состав и привязки видны, изменения недоступны.</div>`;

  return `<div class="dc">
    ${treeHTML()}
    <div class="dc-main">
      ${notice}
      ${d ? `${generalHTML(d)}${itemsHTML(d)}${whereHTML(d)}${usageHTML(d)}`
        : `<div class="dc-choose">
             <b>Выберите справочник в каталоге слева</b>
             <span>Каталоги повторяют структуру системы: тип объекта оценки → тип объекта
               имущества. Всего справочников ${all.length}, из них системных
               ${all.filter((x) => x.system).length}.</span>
           </div>`}
    </div>
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
      state.refOpen = false;
      state.movePick = null;
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
      nw.value = '';
      render();
      const again = scope.$('[data-item-new]');
      if (again) again.focus();
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
        if (!renameItem(d, it, input.value)) {
          host.toast('Такое значение уже есть — переименование отменено', 'warn');
        }
        render();
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
        render();
        host.toast('Значение удалено', 'ok');
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
    // --- дополнительные ссылки на поля ---
    const refAdd = scope.$('[data-ref-add]');
    if (refAdd) refAdd.onclick = () => {
      state.refOpen = true;
      state.moveOpen = false;
      state.folderOpen = false;
      render();
    };

    const refClose = scope.$('[data-ref-close]');
    if (refClose) refClose.onclick = () => { state.refOpen = false; render(); };

    const refQ = scope.$('[data-ref-q]');
    if (refQ) refQ.oninput = () => { state.refQ = refQ.value; renderKeepFocus(); };

    scope.$$('[data-ref-slot]').forEach((b) => b.onclick = async () => {
      const [typeId, card, field, label] = b.dataset.refSlot.split('|');
      const owner = b.dataset.refOwner;

      // Поле уже читает другой справочник — это не мелочь: у того справочника
      // может не остаться ни одной ссылки, и он уйдёт в «Не привязаны».
      if (owner) {
        const ok = await host.confirm({
          title: 'Поле занято другим справочником',
          okLabel: 'Переключить',
          text: `Поле «${label}» сейчас читает «${owner}». Переключить его на этот перечень?`,
        });
        if (!ok) return;
      }

      const type = sortedTypes().find((t) => t.manifest.id === typeId);
      bindSlot(d, { typeId, typeLabel: type ? type.manifest.label : typeId, card, field, label });
      state.refOpen = false;
      state.refQ = '';
      render();
      host.toast(`Поле «${label}» теперь читает этот перечень`, 'ok');
    });

    scope.$$('[data-ref-del]').forEach((b) => b.onclick = () => {
      const slot = d.slots[+b.dataset.refDel];
      if (!slot) return;
      unbindSlot(d, slot);
      render();
      host.toast(`Ссылка на «${slot.label}» убрана`, 'ok');
    });

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
      const res = mainSlot(d)
        ? moveToCatalog(d, typeId, card)
        : { ok: false, reason: 'выбор', options: freeSlots(catalogKey(typeId, card)) };

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
      };
      render();
    });

    scope.$$('[data-bind-slot]').forEach((b) => b.onclick = () => {
      const [typeId, card, field, label] = b.dataset.bindSlot.split('|');
      const type = sortedTypes().find((t) => t.manifest.id === typeId);
      bindSlot(d, { typeId, typeLabel: type ? type.manifest.label : typeId, card, field, label });
      state.movePick = null;
      state.moveOpen = false;
      render();
      host.toast(`Привязан к полю «${label}»`, 'ok');
    });

    const unbind = scope.$('[data-unbind]');
    if (unbind) unbind.onclick = async () => {
      const ok = await host.confirm({
        title: 'Отвязать справочник',
        okLabel: 'Отвязать',
        text: (d.slots.length > 1
          ? `Все ${d.slots.length} поля вернутся к встроенным перечням.`
          : `Поле «${mainSlot(d).label}» вернётся к встроенному перечню.`)
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
      state.removing = null;
      render();
      if (res) {
        host.toast(`Заменено в ${res.touched} ${plural(res.touched, 'объекте', 'объектах', 'объектах')}`, 'ok');
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
