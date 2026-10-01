import { esc } from '../../kernel/dom.js';
import { sortedTypes, getType } from '../../kernel/registry.js';
import { build, MENU_HREF } from '../../kernel/router.js';
import { selectDialog } from '../../kernel/dialog.js';
import { session } from '../../kernel/session.js';
import {
  createState, applyQueryToState, hashFor, emptyFilter, isFilterEmpty, rolePerms, ROLES, FLAG_LABELS,
  TABS, colDefs, colDefaults, colOrder, colWidths, setColOrder, resetCols, queryFilter,
} from './state.js';
import {
  queryAll, countAll, facetsAll, setBulkTotal, bulkTotal, totalObjects, mutate,
} from './query.js';
import { locatorHTML, locatorSingle } from './locator.js';
import { slicesHTML, sliceDefs, sliceLabel, filterForSlice, invalidateSliceCounts } from './slices.js';
import {
  facetsHTML, toggleSection, toggleExpanded, setSearch,
} from './facets.js';
import { rowH, tableHeadHTML, rowsHTML, columnsMenuHTML, csvOf, tableVarsStyle, activeColumns } from './table.js';
import { bindColumnResize, bindColumnReorder, bindColumnsMenu, normalizeOrder, applyFit } from '../../kernel/columns.js';
import { previewHTML } from './preview.js';
import { registerPersisted } from '../../kernel/persist.js';

// Главная — реестр объектов оценки (канва и решения 01.10.2026, задача графа
// glavnaya-vkladki-nedvizhimoe-dvizhimoe, практика reestr-vkladki-vidy-filtry):
//
//   заголовок · вкладки «Недвижимое / Движимое» · поиск · «+ Создать ОЦ»
//   строка видов: «Все», мои задачи, «Внимание» · «Фильтры» · «⋯»
//   применённые фильтры чипами (или полоса действий с выбранными)
//   [панель фильтров] таблица [превью]
//
// У вкладок свои срезы, фильтры и столбцы (пользователь: «По категориям
// свои»). Роль и демо-объём макета — в меню пользователя в шапке
// (shell.js, setUserMenuExtra), а не в рабочей зоне.

// Состояние переживает уход в карточку и возврат: фильтр не сбрасывается.
const state = createState();

// Что открыто и как разложены столбцы — переживает перезагрузку (замечание
// пользователя 09.09.2026). Сами ЗНАЧЕНИЯ фильтров сюда не входят: они живут в
// адресе, чтобы ссылку на подборку можно было переслать коллеге (state.js), и
// второй источник тех же значений разошёлся бы с адресом.
const UI_KEEP = ['facetsOpen', 'columns', 'colWidths', 'columnsMov', 'colWidthsMov', 'dense'];

registerPersisted('ui.registry', {
  snapshot: () => Object.fromEntries(UI_KEEP.map((k) => [k, state[k]])),
  restore: (saved) => {
    if (!saved || typeof saved !== 'object') return;
    UI_KEEP.forEach((k) => {
      if (saved[k] !== undefined) state[k] = saved[k];
    });
  },
});
let dataVersion = 0;      // растёт при изменении данных — сбрасывает кэш срезов
let cursor = -1;
// Меню «⋯» держим открытым между перерисовками: состав столбцов меняют сразу
// по нескольким, а строка видов перерисовывается на каждое изменение и иначе
// схлопывала бы меню после первого щелчка.
let moreMenuOpen = false;
let colsObserver = null;   // следит за шириной таблицы, см. fitColumns()

const EXPORT_LIMIT = 20000;

export function mountOcMenu(host) {
  const scope = host.scope;

  host.setCrumbs([
    { label: 'Главная', to: MENU_HREF },
    { label: 'Объекты оценки', current: true },
  ]);
  host.setDrawer(null);
  host.ensureStyle('./app/pages/ocMenu/ocMenu.css');

  applyQueryToState(state, host.route.query || {});

  let locatorTimer = null;
  let lastTotal = 0;
  let alive = true;   // после ухода со страницы отложенные рендеры не выполняются
  let lastFacets = { status: {}, region: {}, city: {}, institution: {}, insp: {}, typeId: {}, flags: {} };

  const F = () => queryFilter(state);
  const ROW = () => rowH(state);

  // --- Адрес --------------------------------------------------------------
  function syncHash() {
    if (!alive) return;
    const h = hashFor(state);
    if (location.hash !== h) history.replaceState(null, '', h);
  }

  function plural(n, forms = ['объект', 'объекта', 'объектов']) {
    const a = n % 10, b = n % 100;
    if (a === 1 && b !== 11) return forms[0];
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return forms[1];
    return forms[2];
  }

  // --- Меню пользователя: демо-объём и клавиши --------------------------------
  // Роль — в общем меню оболочки (она действует и в карточках); здесь — то,
  // что относится только к реестру.
  host.setUserMenuExtra && host.setUserMenuExtra({
    html: () => `<div class="um-h">Демо-объём реестра</div>
      <div class="um-pad um-seg" role="group" aria-label="Демо-объём реестра">
        ${[0, 1000, 5000, 20000].map((n) => `<button class="um-seg-b ${bulkTotal() === n ? 'on' : ''}" data-um-bulk="${n}">${n ? n.toLocaleString('ru') : 'Сид'}</button>`).join('')}
      </div>
      <div class="um-h">Клавиши реестра</div>
      <div class="um-pad um-keys"><kbd>/</kbd> поиск · <kbd>j</kbd> <kbd>k</kbd> по списку · <kbd>Enter</kbd> карточка · <kbd>Space</kbd> превью · <kbd>Esc</kbd> закрыть</div>`,
    bind: (box) => {
      box.querySelectorAll('[data-um-bulk]').forEach((b) => b.onclick = (e) => {
        e.stopPropagation();
        const n = +b.dataset.umBulk;
        setBulkTotal(n);
        dataVersion++;
        invalidateSliceCounts();
        state.selected.clear();
        cursor = -1;
        host.toast(n ? `Загружено ${n.toLocaleString('ru')} синтетических записей` : 'Синтетические записи выключены', 'ok');
        box.querySelectorAll('[data-um-bulk]').forEach((x) => x.classList.toggle('on', x === b));
        if (alive) renderShell();
      });
    },
  });

  // Роль сменили в меню пользователя: «мои…» срезы зависят от неё.
  const unsubscribe = session.subscribe(() => {
    if (!alive) return;
    const perms = rolePerms(state.role);
    if (state.sliceKey && state.sliceKey.startsWith('my-') && !perms.slices.includes(state.sliceKey)) {
      state.filter = emptyFilter();
      state.sliceKey = null;
      state.selected.clear();
      cursor = -1;
    } else if (state.filter.mine) {
      state.filter.mine = { role: state.filter.mine.role, person: state.person };
    }
    invalidateSliceCounts();
    renderData();
  });

  // --- Фрагменты разметки ---------------------------------------------------
  // Каждый фрагмент рендерится в свой контейнер (data-region-*), поэтому
  // ввод в поиске/фильтре не задевает остальную страницу.

  function createDdHTML() {
    const perms = rolePerms(state.role);
    const types = sortedTypes();
    const role = ROLES.find((r) => r.key === state.role);
    const mov = state.tab === 'movable';
    const group = (m) => types.filter((t) => (t.manifest.assetKind === 'movable') === m)
      .map((t) => `<button data-create="${esc(t.manifest.id)}">${esc(t.manifest.icon)} ${esc(t.manifest.label)}</button>`).join('');

    // Сначала — типы текущей вкладки.
    return `<div class="dd reg-create">
      <button class="btn btn-primary" data-dd-toggle ${perms.create ? '' : 'disabled'}
        title="${perms.create ? '' : `Роль «${esc(role ? role.label : '')}» новые ОЦ не создаёт`}">+ Создать ОЦ ▾</button>
      <div class="dd-menu reg-create-menu">
        <div class="dd-group">${mov ? 'Движимое имущество' : 'Недвижимое имущество'}</div>${group(mov)}
        <div class="dd-group">${mov ? 'Недвижимое имущество' : 'Движимое имущество'}</div>${group(!mov)}
      </div>
    </div>`;
  }

  // Вкладки — сегментом рядом с заголовком; число — все записи категории.
  function tabsHTML() {
    return `<div class="reg-tabs" role="tablist" aria-label="Категория имущества">
      ${TABS.map((t) => `<button class="reg-tab ${state.tab === t.key ? 'on' : ''}" role="tab"
        aria-selected="${state.tab === t.key}" data-tab="${t.key}">${esc(t.label)}
        <span>${totalObjects(t.key).toLocaleString('ru')}</span></button>`).join('')}
    </div>`;
  }

  function filterCount() {
    const f = state.filter;
    return ['status', 'typeId', 'region', 'city', 'institution', 'insp', 'flags'].reduce((n, k) => n + (f[k] || []).length, 0)
      + (f.staleDays ? 1 : 0) + (f.mine ? 1 : 0);
  }

  // «⋯» — столбцы, плотность строк и экспорт одним меню.
  function moreMenuHTML() {
    return `<div class="dd reg-more ${moreMenuOpen ? 'open' : ''}" data-more-dd>
      <button class="reg-icon-btn" data-dd-toggle title="Вид таблицы: столбцы, плотность, экспорт" aria-label="Вид таблицы" aria-haspopup="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="19" cy="12" r="2"></circle></svg>
      </button>
      <div class="dd-menu reg-more-menu">
        <div class="dd-group">Строки</div>
        <div class="reg-seg" role="group" aria-label="Плотность строк">
          <button class="${state.dense ? '' : 'on'}" data-dense="0">Обычные</button>
          <button class="${state.dense ? 'on' : ''}" data-dense="1">Плотные</button>
        </div>
        <button class="reg-more-item" data-export title="Выгрузить текущую выборку в CSV для Excel">Экспорт в CSV${state.selected.size ? ` — выбранные (${state.selected.size})` : ''}</button>
        <div class="reg-cols">${columnsMenuHTML(state)}</div>
      </div>
    </div>`;
  }

  // Недавно открытые объекты — меню в строке видов (раньше — отдельная
  // секция «Недавние» под срезами).
  function recentHTML() {
    const list = state.recent.filter((r) => {
      const t = getType(r.typeId);
      return t && ((t.manifest.assetKind === 'movable') === (state.tab === 'movable'));
    });
    if (!list.length) return '';
    return `<div class="dd reg-recent-dd">
      <button class="btn btn-ghost" data-dd-toggle aria-haspopup="true" title="Недавно открытые объекты">Недавние ▾</button>
      <div class="dd-menu reg-recent-menu">
        ${list.map((r) => `<button class="reg-recent-item" data-row="${esc(r.typeId)}|${esc(r.id)}" title="${esc(r.title)}">
          <span aria-hidden="true">${esc(r.typeIcon)}</span><span class="ell">${esc(r.title)}</span></button>`).join('')}
      </div>
    </div>`;
  }

  function barHTML() {
    const n = filterCount();
    return `${slicesHTML(state, dataVersion)}
      <span class="reg-grow"></span>
      ${recentHTML()}
      <button class="btn btn-ghost reg-filter-btn ${state.facetsOpen ? 'on' : ''}" data-facets-toggle aria-expanded="${state.facetsOpen}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 5h18M6 12h12M10 19h4"></path></svg>
        Фильтры${n ? ` <b>${n}</b>` : ''}
      </button>
      ${moreMenuHTML()}`;
  }

  // Подписи применённых фильтров — чипами с крестиком.
  function chipList() {
    const f = state.filter;
    const out = [];
    if (state.sliceKey) out.push({ key: 'slice', value: '', label: `Срез: ${sliceLabel(state.tab, state.sliceKey)}` });
    if (f.q) out.push({ key: 'q', value: '', label: `Поиск: «${f.q}»` });
    const names = { status: 'Статус', typeId: 'Тип', region: 'Область', city: 'Город', institution: 'Учреждение', insp: 'Осмотрщик' };
    Object.keys(names).forEach((k) => (f[k] || []).forEach((v) => {
      const t = k === 'typeId' ? (getType(String(v).split(':')[0]) || {}).manifest : null;
      const label = k === 'typeId' ? (String(v).includes(':') ? String(v).split(':')[1] : (t ? t.label : v)) : v;
      out.push({ key: k, value: v, label: `${names[k]}: ${label}` });
    }));
    if (!state.sliceKey) {
      (f.flags || []).forEach((v) => out.push({ key: 'flags', value: v, label: FLAG_LABELS[v] || v }));
      if (f.staleDays) out.push({ key: 'stale', value: '', label: `Без движения ${f.staleDays}+ дней` });
      if (f.mine) out.push({ key: 'mine', value: '', label: 'Мои объекты' });
    }
    return out;
  }

  function chipsHTML(total) {
    const perms = rolePerms(state.role);
    const sel = state.selected.size;

    if (sel) {
      return `<div class="reg-bulkbar" role="toolbar" aria-label="Действия с выбранными">
        <b>Выбрано ${sel.toLocaleString('ru')}</b><span class="reg-bulk-of">из ${total.toLocaleString('ru')}</span>
        ${sel < total && total <= EXPORT_LIMIT ? `<button class="reg-bulk-link" data-select-all>выбрать все ${total.toLocaleString('ru')}</button>` : ''}
        <span class="reg-bulk-sep"></span>
        ${perms.assignInsp ? '<button class="btn btn-sm" data-bulk="insp">Назначить осмотрщика</button>' : ''}
        ${perms.setStatus ? '<button class="btn btn-sm" data-bulk="status">Сменить статус</button>' : ''}
        <button class="btn btn-sm" data-export>Экспорт выбранных</button>
        <span class="reg-grow"></span>
        <button class="btn btn-sm" data-bulk="clear">Снять выбор</button>
      </div>`;
    }

    if (isFilterEmpty(state.filter) && !state.sliceKey) return '';
    const all = totalObjects(state.tab);
    return `<div class="reg-chips">
      ${chipList().map((c) => `<span class="reg-chip-f">${esc(c.label)}<button data-chip-remove="${esc(c.key)}|${esc(c.value)}"
        aria-label="Снять: ${esc(c.label)}" title="Снять">×</button></span>`).join('')}
      <button class="reg-chips-reset" data-reset-filters>Сбросить всё</button>
      <span class="reg-chips-n">найдено <b>${total.toLocaleString('ru')}</b> из ${all.toLocaleString('ru')}</span>
    </div>`;
  }

  // Пустая таблица: категория пустая — предложить создать; отбор пустой —
  // сказать, что смягчить (практика APCS tri-sostoyaniya-ozhidanie-pustota-otkaz).
  function emptyHTML() {
    if (!totalObjects(state.tab)) {
      const mov = state.tab === 'movable';
      const types = sortedTypes().filter((t) => (t.manifest.assetKind === 'movable') === mov);
      return `<div class="reg-empty">
        <b>${mov ? 'Движимого пока нет' : 'Недвижимого пока нет'}</b>
        <span>${mov ? 'Транспортные средства и механизмы появятся здесь, когда их заведут объектами оценки.' : 'Объекты появятся здесь после создания.'}</span>
        <div class="reg-empty-acts">${rolePerms(state.role).create ? types.map((t, i) => `<button class="btn ${i ? 'btn-ghost' : 'btn-primary'} btn-sm" data-create="${esc(t.manifest.id)}">+ ${esc(t.manifest.label)}</button>`).join('') : ''}</div>
      </div>`;
    }
    const chips = chipList();
    const first = chips[chips.length - 1];
    return `<div class="reg-empty">
      <b>По условиям ничего не найдено</b>
      <span>Смягчите условия: снимите последний фильтр или сбросьте все.</span>
      <div class="reg-empty-acts">
        ${first ? `<button class="btn btn-primary btn-sm" data-chip-remove="${esc(first.key)}|${esc(first.value)}">Снять «${esc(first.label)}»</button>` : ''}
        <button class="btn btn-ghost btn-sm" data-reset-filters>Сбросить всё</button>
      </div>
    </div>`;
  }

  // --- Полный рендер: каркас страницы --------------------------------------
  // Вызывается при заходе на страницу, смене вкладки и демо-объёма. Любое
  // взаимодействие внутри (поиск, фильтры, срезы, сортировка, превью) идёт
  // через renderData() — без пересборки всего блока, поэтому не теряются
  // фокус в поиске и скролл в фильтрах.
  function disposeColsObserver() {
    if (colsObserver) { colsObserver.disconnect(); colsObserver = null; }
  }

  function renderShell() {
    if (!alive) return;

    // Уход в карточку и возврат — самый частый повод для renderShell.
    // Позицию в списке терять нельзя: сохраняем и восстанавливаем скролл.
    const vpOld = scope.$('[data-viewport]');
    const scrollTop = vpOld ? vpOld.scrollTop : 0;

    lastFacets = facetsAll(F());
    const total = countAll(F());
    lastTotal = total;

    disposeColsObserver();

    scope.setHTML(`
      <div class="reg ${state.dense ? 'dense' : ''}" style="--reg-row-h:${ROW()}px">
        <div class="reg-head">
          <h1 class="reg-h1">Объекты оценки</h1>
          <div data-region-tabs>${tabsHTML()}</div>
          <span class="reg-grow"></span>
          ${locatorHTML(state)}
          <div data-region-create>${createDdHTML()}</div>
        </div>

        <div class="reg-bar" data-region-bar>${barHTML()}</div>
        <div data-region-chips>${chipsHTML(total)}</div>

        <div class="reg-main">
          <aside class="reg-facets-wrap ${state.facetsOpen ? '' : 'closed'}" data-facets-wrap aria-label="Фильтры">
            <div class="reg-facets" data-region-facets>${facetsHTML(state, lastFacets)}</div>
          </aside>

          <section class="reg-body" aria-label="Объекты оценки">
            <div class="reg-view-box" data-cols-box style="${tableVarsStyle(state)}">
              <div data-region-thead>${tableHeadHTML(state, allSelected(total))}</div>
              <div class="reg-viewport" data-viewport>
                <div class="reg-spacer" data-spacer></div>
                <div class="reg-rows" data-rows></div>
              </div>
            </div>
          </section>

          <aside class="reg-preview ${state.previewId ? '' : 'hidden'}" data-region-preview aria-label="Превью объекта">${previewHTML(state)}</aside>
        </div>
      </div>`);

    bindShell();
    bindData();
    bindPreview();

    const vp = scope.$('[data-viewport]');
    if (vp) vp.scrollTop = scrollTop;
    fitColumns();
    updateRows();
    syncHash();
  }

  function allSelected(total) {
    return total > 0 && state.selected.size >= total;
  }

  // --- Частичный рендер: всё, что зависит от фильтра/поиска/данных --------
  function renderData() {
    if (!alive) return;

    lastFacets = facetsAll(F());
    const total = countAll(F());
    lastTotal = total;

    const tabs = scope.$('[data-region-tabs]');
    if (tabs) tabs.innerHTML = tabsHTML();

    const create = scope.$('[data-region-create]');
    if (create) create.innerHTML = createDdHTML();

    const bar = scope.$('[data-region-bar]');
    if (bar) bar.innerHTML = barHTML();

    const chips = scope.$('[data-region-chips]');
    if (chips) chips.innerHTML = chipsHTML(total);

    const facetsBox = scope.$('[data-region-facets]');
    if (facetsBox) {
      const facetsScroll = facetsBox.scrollTop;
      facetsBox.innerHTML = facetsHTML(state, lastFacets);
      facetsBox.scrollTop = facetsScroll;
    }

    const thead = scope.$('[data-region-thead]');
    if (thead) thead.innerHTML = tableHeadHTML(state, allSelected(total));

    // Переменные ширины переобъявляем вместе с шапкой: состав столбцов мог
    // измениться, а растягивание пишет их напрямую в style контейнера.
    const colsBox = scope.$('[data-cols-box]');
    if (colsBox) colsBox.setAttribute('style', tableVarsStyle(state));

    bindData();
    fitColumns();
    updateRows();
    syncHash();
  }

  // Раскладка столбцов: ширины точные, их сумма подгоняется под ширину
  // таблицы (kernel/columns.js, fitWidths). Мерить можно только по факту, из
  // DOM, поэтому это отдельный проход после отрисовки шапки.
  const CHECK_COL_W = 34;   // служебный столбец с флажком, в механике не участвует
  let fitting = false;

  function fitColumns() {
    const box = scope.$('[data-cols-box]');
    if (!box || fitting) return;
    fitting = true;
    // Результат подгонки НЕ сохраняем: в состоянии лежит исходная раскладка.
    applyFit(box, activeColumns(state), colWidths(state), CHECK_COL_W);
    fitting = false;
  }

  // --- Виртуализация --------------------------------------------------------
  function updateRows() {
    const vp = scope.$('[data-viewport]');
    const spacer = scope.$('[data-spacer]');
    const rowsEl = scope.$('[data-rows]');
    if (!vp || !spacer || !rowsEl) return;
    const h = ROW();

    spacer.style.height = (lastTotal * h) + 'px';

    if (!lastTotal) {
      rowsEl.innerHTML = `<div class="reg-empty-row">${emptyHTML()}</div>`;
      rowsEl.style.transform = 'translateY(0)';
      bindEmpty();
      return;
    }

    const visible = Math.ceil(vp.clientHeight / h) + 8;
    const offset = Math.max(0, Math.floor(vp.scrollTop / h) - 4);
    const res = queryAll({ filter: F(), sort: state.sort, offset, limit: visible });

    rowsEl.style.transform = `translateY(${offset * h}px)`;
    rowsEl.innerHTML = rowsHTML(state, res.rows, offset);

    if (cursor >= 0) {
      const el = rowsEl.querySelector(`[data-index="${cursor}"]`);
      if (el) el.classList.add('cur');
    }

    bindRows();
  }

  // --- Обработчики --------------------------------------------------------
  function openRow(typeId, id, rest = []) {
    // Уходим со страницы: снимаем отложенный рендер, иначе он перепишет адрес.
    clearTimeout(locatorTimer);
    alive = false;

    const t = getType(typeId);
    const summary = t ? t.records.getSummary(id) : null;

    if (summary) {
      state.recent = [{ typeId, id, title: summary.title, typeIcon: summary.typeIcon }]
        .concat(state.recent.filter((r) => r.id !== id))
        .slice(0, 6);
    }

    location.hash = build({ typeId, ocId: id, rest });
  }

  function bindRows() {
    scope.$$('[data-row]').forEach((el) => {
      el.onclick = (e) => {
        if (e.target.closest('input')) return;
        const [typeId, id] = el.dataset.row.split('|');
        if (e.metaKey || e.ctrlKey) { togglePreview(typeId, id); return; }
        openRow(typeId, id);
      };
    });

    scope.$$('[data-select]').forEach((cb) => {
      cb.onclick = (e) => e.stopPropagation();
      cb.onchange = () => {
        const row = cb.closest('[data-row]');
        const [typeId, id] = row.dataset.row.split('|');
        if (cb.checked) state.selected.set(id, typeId);
        else state.selected.delete(id);
        renderData();
      };
    });
  }

  function bindEmpty() {
    scope.$$('[data-rows] [data-reset-filters]').forEach((b) => b.onclick = resetFilters);
    scope.$$('[data-rows] [data-chip-remove]').forEach((b) => b.onclick = () => removeChip(b.dataset.chipRemove));
    scope.$$('[data-rows] [data-create]').forEach((b) => b.onclick = (e) => createOc(e, b.dataset.create));
  }

  // Превью — постоянный контейнер в разметке (data-region-preview), просто
  // прячется классом hidden.
  function updatePreview() {
    const box = scope.$('[data-region-preview]');
    if (!box) return;
    box.classList.toggle('hidden', !state.previewId);
    box.innerHTML = previewHTML(state);
    bindPreview();
  }

  function bindPreview() {
    const peekClose = scope.$('[data-peek-close]');
    if (peekClose) peekClose.onclick = closePreview;

    const openPeek = scope.$('[data-open-peek]');
    if (openPeek) openPeek.onclick = () => openRow(state.previewType, state.previewId);
  }

  function closePreview() {
    state.previewId = null;
    state.previewType = null;
    updatePreview();
  }

  function togglePreview(typeId, id) {
    if (state.previewId === id) { state.previewId = null; state.previewType = null; }
    else { state.previewId = id; state.previewType = typeId; }
    updatePreview();
  }

  function resetFilters() {
    state.filter = emptyFilter();
    state.sliceKey = null;
    state.selected.clear();
    cursor = -1;
    const loc = scope.$('[data-locator]');
    if (loc) loc.value = '';
    renderData();
  }

  function removeChip(spec) {
    const [key, value] = String(spec).split('|');
    const f = state.filter;
    if (key === 'slice') { resetFilters(); return; }
    if (key === 'q') {
      f.q = '';
      const loc = scope.$('[data-locator]');
      if (loc) loc.value = '';
    } else if (key === 'stale') f.staleDays = 0;
    else if (key === 'mine') f.mine = null;
    else if (Array.isArray(f[key])) f[key] = f[key].filter((x) => x !== value);
    state.sliceKey = null;
    cursor = -1;
    renderData();
  }

  function switchTab(key) {
    if (state.tab === key) return;
    state.tab = key;
    state.filter = emptyFilter();
    state.sliceKey = null;
    state.selected.clear();
    state.previewId = null;
    state.previewType = null;
    cursor = -1;
    // Столбцы у вкладок разные — каркас таблицы пересобирается целиком.
    renderShell();
  }

  function createOc(e, typeId) {
    e.stopPropagation();
    document.querySelectorAll('.dd.open').forEach((d) => d.classList.remove('open'));
    moreMenuOpen = false;

    if (!rolePerms(state.role).create) return;

    const type = getType(typeId);
    if (!type || !type.records.createRecord) {
      host.toast('Раздел находится в разработке', 'warn');
      return;
    }

    const rec = type.records.createRecord();
    dataVersion++;
    invalidateSliceCounts();
    host.toast('Объект оценки создан — заполните форму', 'ok');
    openRow(type.manifest.id, rec.id, ['create']);
  }

  async function bulkAction(kind) {
    const perms = rolePerms(state.role);
    const ids = [...state.selected.entries()];
    if (!ids.length) return;

    if (kind === 'clear') { state.selected.clear(); renderData(); return; }
    if (kind === 'insp' && !perms.assignInsp) return;
    if (kind === 'status' && !perms.setStatus) return;

    if (kind === 'insp') {
      const people = Object.keys(lastFacets.insp || {}).filter(Boolean).sort();
      const person = await selectDialog({ title: `Назначить осмотрщика (${ids.length})`, options: people });
      if (!person) return;
      ids.forEach(([id, typeId]) => mutate(typeId, id, (api) => api.assignResponsible(id, 'insp', person)));
      host.toast(`Осмотрщик назначен: ${person} (${ids.length})`, 'ok');
    }

    if (kind === 'status') {
      const stages = Object.keys(lastFacets.status || {});
      const stage = await selectDialog({ title: `Сменить статус (${ids.length})`, options: stages });
      if (!stage) return;
      ids.forEach(([id, typeId]) => mutate(typeId, id, (api) => api.setStatus(id, stage)));
      host.toast(`Статус изменён: ${stage} (${ids.length})`, 'ok');
    }

    state.selected.clear();
    dataVersion++;
    invalidateSliceCounts();
    renderData();
  }

  function exportCsv() {
    const all = queryAll({ filter: F(), sort: state.sort, offset: 0, limit: EXPORT_LIMIT }).rows;
    const rows = state.selected.size ? all.filter((r) => state.selected.has(r.id)) : all;

    const csv = csvOf(state, rows);
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `oc-reestr-${state.tab === 'movable' ? 'dvizhimoe' : 'nedvizhimoe'}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);

    host.toast(`Выгружено строк: ${rows.length}${lastTotal > EXPORT_LIMIT ? ' (ограничение ' + EXPORT_LIMIT + ')' : ''}`, 'ok');
  }

  // «Выбрать все» — вся выборка (до предела выгрузки), а не первые 200 строк,
  // как было раньше (обход главной 01.10.2026).
  function selectAll(on) {
    const rows = queryAll({ filter: F(), sort: state.sort, offset: 0, limit: EXPORT_LIMIT }).rows;
    if (on) rows.forEach((r) => state.selected.set(r.id, r.typeId));
    else state.selected.clear();
    renderData();
  }

  // Вешается один раз при построении каркаса (renderShell) — элементы,
  // которые renderData() не пересобирает: поиск, вьюпорт таблицы.
  function bindShell() {
    const s = scope;

    const loc = s.$('[data-locator]');
    const clear = s.$('[data-locator-clear]');
    const kbd = s.$('.reg-kbd');
    if (loc) {
      loc.oninput = () => {
        state.filter.q = loc.value.trim().toLowerCase();
        if (clear) clear.classList.toggle('hidden', !state.filter.q);
        if (kbd) kbd.classList.toggle('hidden', !!state.filter.q);
        clearTimeout(locatorTimer);
        locatorTimer = setTimeout(() => renderData(), 170);
      };
      loc.onkeydown = (e) => {
        if (e.key === 'Enter') {
          const single = locatorSingle(state.filter.q, state.tab);
          if (single) openRow(single.typeId, single.id);
        }
        if (e.key === 'Escape' && loc.value) { e.stopPropagation(); clear && clear.click(); }
      };
    }
    if (clear) clear.onclick = () => {
      state.filter.q = '';
      if (loc) { loc.value = ''; loc.focus(); }
      clear.classList.add('hidden');
      if (kbd) kbd.classList.remove('hidden');
      renderData();
    };

    const vp = s.$('[data-viewport]');
    if (vp) vp.addEventListener('scroll', () => updateRows());

    // Ширина таблицы меняется и от окна, и от панели фильтров и превью —
    // следим за самим блоком, а не за окном.
    const colsBox = scope.$('[data-cols-box]');
    if (colsBox && typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(() => fitColumns());
      ro.observe(colsBox);
      colsObserver = ro;
    }
  }

  function setFacetsOpen(open) {
    state.facetsOpen = open;
    const wrap = scope.$('[data-facets-wrap]');
    if (wrap) wrap.classList.toggle('closed', !open);
    const btn = scope.$('[data-facets-toggle]');
    if (btn) { btn.classList.toggle('on', open); btn.setAttribute('aria-expanded', String(open)); }
  }

  // Переключатели внутри регионов, которые пересобираются при каждом
  // изменении фильтра/поиска — навешиваются заново после каждой замены.
  function bindData() {
    const s = scope;

    s.$$('[data-tab]').forEach((b) => b.onclick = () => switchTab(b.dataset.tab));
    s.$$('[data-create]').forEach((b) => b.onclick = (e) => createOc(e, b.dataset.create));

    const viewAll = s.$('[data-view-all]');
    if (viewAll) viewAll.onclick = resetFilters;

    s.$$('[data-slice]').forEach((b) => b.onclick = () => {
      const def = sliceDefs(state.tab).find((d) => d.key === b.dataset.slice);
      if (!def) return;
      if (state.sliceKey === def.key) { resetFilters(); return; }
      state.filter = filterForSlice(def, state.person);
      state.sliceKey = def.key;
      state.selected.clear();
      cursor = -1;
      renderData();
    });

    const facetsToggle = s.$('[data-facets-toggle]');
    if (facetsToggle) facetsToggle.onclick = () => setFacetsOpen(!state.facetsOpen);
    const facetsClose = s.$('[data-facets-close]');
    if (facetsClose) facetsClose.onclick = () => setFacetsOpen(false);

    s.$$('[data-facet]').forEach((cb) => cb.onchange = () => {
      const key = cb.dataset.facet;
      const v = cb.value;
      const list = state.filter[key];
      state.filter[key] = cb.checked ? [...list, v] : list.filter((x) => x !== v);
      state.sliceKey = null;
      renderData();
    });

    s.$$('[data-facet-toggle]').forEach((b) => b.onclick = () => { toggleSection(b.dataset.facetToggle); renderData(); });
    s.$$('[data-facet-more]').forEach((b) => b.onclick = () => { toggleExpanded(b.dataset.facetMore); renderData(); });

    s.$$('[data-facet-search]').forEach((inp) => inp.oninput = () => {
      setSearch(inp.dataset.facetSearch, inp.value);
      clearTimeout(locatorTimer);
      locatorTimer = setTimeout(() => {
        renderData();
        const again = scope.$(`[data-facet-search="${inp.dataset.facetSearch}"]`);
        if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
      }, 170);
    });

    const stale = s.$('[data-stale]');
    if (stale) stale.onchange = () => { state.filter.staleDays = stale.checked ? 30 : 0; state.sliceKey = null; renderData(); };

    s.$$('[data-reset-filters]').forEach((b) => b.onclick = resetFilters);
    s.$$('[data-chip-remove]').forEach((b) => b.onclick = () => removeChip(b.dataset.chipRemove));

    const selPage = s.$('[data-select-page]');
    if (selPage) selPage.onchange = () => selectAll(selPage.checked);
    const selAllBtn = s.$('[data-select-all]');
    if (selAllBtn) selAllBtn.onclick = () => selectAll(true);

    s.$$('[data-bulk]').forEach((b) => b.onclick = () => bulkAction(b.dataset.bulk));

    // Плотность строк: высота строки — переменная на корне страницы.
    s.$$('[data-dense]').forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      state.dense = b.dataset.dense === '1';
      const root = s.$('.reg');
      if (root) { root.classList.toggle('dense', state.dense); root.style.setProperty('--reg-row-h', ROW() + 'px'); }
      renderData();
    });

    // Состав, порядок и ширина столбцов — общим механизмом ядра
    // (kernel/columns.js), отдельно для каждой вкладки.
    const applyOrder = (order) => {
      setColOrder(state, normalizeOrder(colDefs(state), order, colDefaults(state)));
      renderData();
    };

    bindColumnsMenu(s, {
      defs: colDefs(state),
      order: colOrder(state),
      onOrder: applyOrder,
      onReset() {
        resetCols(state);
        renderData();
      },
    });

    bindColumnReorder(s, { headSel: '[data-region-thead]', order: colOrder(state), onCommit: applyOrder });

    bindColumnResize(s, {
      rootSel: '[data-cols-box]',
      cols: activeColumns(state),
      widths: colWidths(state),
      onCommit(patch) {
        // Перерисовка не нужна: ширины уже показали переменные на контейнере.
        // Пишем, чтобы они уцелели при следующей перерисовке.
        Object.assign(colWidths(state), patch);
      },
    });

    s.$$('[data-dd-toggle]').forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      const dd = b.closest('.dd');
      const wasOpen = dd.classList.contains('open');
      document.querySelectorAll('.dd.open').forEach((d) => d.classList.remove('open'));
      if (!wasOpen) dd.classList.add('open');
      moreMenuOpen = dd.hasAttribute('data-more-dd') && !wasOpen;
    });

    s.$$('[data-sort]').forEach((th) => th.onclick = (e) => {
      // Ручка изменения ширины живёт внутри ячейки шапки — клик по ней
      // сортировкой не является.
      if (e.target.closest('[data-col-grip]')) return;
      const key = th.dataset.sort;
      state.sort = (state.sort.key === key)
        ? { key, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'desc' };
      renderData();
    });

    s.$$('[data-export]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); exportCsv(); });

    bindRows();
  }

  // Закрытие выпадающих меню по клику вне них — один раз на срок жизни
  // страницы (scope.onDocument копил бы слушатели при каждом рендере).
  scope.onDocument('click', (e) => {
    if (e.target.closest('.dd')) return;
    document.querySelectorAll('.dd.open').forEach((d) => d.classList.remove('open'));
    moreMenuOpen = false;
  });

  // --- Клавиатура ---------------------------------------------------------
  scope.onDocument('keydown', (e) => {
    const inField = e.target.matches('input, select, textarea');

    if (e.key === '/' && !inField) {
      e.preventDefault();
      const inp = scope.$('[data-locator]');
      if (inp) inp.focus();
      return;
    }

    if (inField) return;

    if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); moveCursor(1); }
    else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); moveCursor(-1); }
    else if (e.key === 'Enter' && cursor >= 0) { e.preventDefault(); actOnCursor(true); }
    else if (e.key === ' ' && cursor >= 0) { e.preventDefault(); actOnCursor(false); }
    else if (e.key === 'Escape') {
      if (state.previewId) closePreview();
    }
  });

  function moveCursor(delta) {
    if (!lastTotal) return;
    const h = ROW();

    cursor = Math.max(0, Math.min(lastTotal - 1, (cursor < 0 ? -1 : cursor) + delta));

    const vp = scope.$('[data-viewport]');
    if (vp) {
      const top = cursor * h;
      if (top < vp.scrollTop) vp.scrollTop = top;
      else if (top + h > vp.scrollTop + vp.clientHeight) vp.scrollTop = top + h - vp.clientHeight;
    }

    updateRows();
  }

  function actOnCursor(open) {
    const res = queryAll({ filter: F(), sort: state.sort, offset: cursor, limit: 1 });
    const s = res.rows[0];
    if (!s) return;
    if (open) openRow(s.typeId, s.id);
    else togglePreview(s.typeId, s.id);
  }

  renderShell();

  return {
    onRoute(route) {
      alive = true;
      applyQueryToState(state, route.query || {});
      renderShell();
    },
    destroy() {
      alive = false;
      clearTimeout(locatorTimer);
      unsubscribe();
    },
  };
}
