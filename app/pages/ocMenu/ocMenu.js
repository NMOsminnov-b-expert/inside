import { esc } from '../../kernel/dom.js';
import { sortedTypes, getType } from '../../kernel/registry.js';
import { build, MENU_HREF } from '../../kernel/router.js';
import { formDialog, selectDialog, promptDialog } from '../../kernel/dialog.js';
import {
  createState, applyQueryToState, hashFor, emptyFilter, isFilterEmpty,
  ROLES, COLUMNS,
} from './state.js';
import {
  queryAll, countAll, facetsAll, setBulkTotal, bulkTotal, totalObjects, mutate, recordOf,
} from './query.js';
import { locatorHTML, locatorDropHTML, locatorSingle } from './locator.js';
import { slicesHTML, sliceDefs, filterForSlice, invalidateSliceCounts } from './slices.js';
import {
  facetsHTML, toggleSection, toggleExpanded, setSearch,
} from './facets.js';
import { ROW_H, tableShellHTML, rowsHTML, columnsMenuHTML, activeColumns, csvOf } from './table.js';
import { previewHTML } from './preview.js';

// Состояние переживает уход в карточку и возврат: фильтр не сбрасывается.
const state = createState();
let dataVersion = 0;      // растёт при изменении данных — сбрасывает кэш срезов
let cursor = -1;

export function mountOcMenu(host) {
  const scope = host.scope;
  const ctx = { host, scope };

  host.setCrumbs([
    { label: 'Главная', to: MENU_HREF },
    { label: 'Объекты оценки', current: true },
  ]);
  host.setDrawer(null);
  host.ensureStyle('./app/pages/ocMenu/ocMenu.css');

  applyQueryToState(state, host.route.query || {});

  let locatorTimer = null;
  let lastTotal = 0;
  let alive = true;   // после уxода со страницы отложенные рендеры не выполняются

  // --- Адрес --------------------------------------------------------------
  function syncHash() {
    if (!alive) return;
    const h = hashFor(state);
    if (location.hash !== h) history.replaceState(null, '', h);
  }

  // --- Рендер -------------------------------------------------------------
  function toolbarHTML(total) {
    const people = Object.keys(lastFacets.insp || {}).filter(Boolean).sort();
    const sel = state.selected.size;

    return `<div class="reg-toolbar">
      <div class="reg-count">
        <b>${total.toLocaleString('ru')}</b>
        <span>${plural(total)}</span>
        ${isFilterEmpty(state.filter) ? '' : '<button class="btn btn-ghost btn-sm" data-reset-filters>сбросить фильтр</button>'}
      </div>

      ${sel ? `<div class="reg-bulk">
        <span>выбрано <b>${sel}</b></span>
        <button class="btn btn-ghost btn-sm" data-bulk="insp">Назначить осмотрщика</button>
        <button class="btn btn-ghost btn-sm" data-bulk="status">Сменить статус</button>
        <button class="btn btn-ghost btn-sm" data-bulk="clear">Снять выбор</button>
      </div>` : ''}

      <div class="reg-tools">
        <button class="btn btn-ghost btn-sm" data-export title="Выгрузить текущую выборку в CSV для Excel">Экспорт CSV</button>
        <div class="dd">
          <button class="reg-icon-btn" data-dd-toggle title="Столбцы">⋮⋮</button>
          <div class="dd-menu reg-cols">${columnsMenuHTML(state)}</div>
        </div>
        <button class="reg-icon-btn" data-density title="${state.density === 'compact' ? 'Плотные строки' : 'Обычные строки'}">${state.density === 'compact' ? '≡' : '☰'}</button>
      </div>
    </div>`;
  }

  function plural(n) {
    const a = n % 10, b = n % 100;
    if (a === 1 && b !== 11) return 'объект';
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return 'объекта';
    return 'объектов';
  }

  function viewHTML() {
    return tableShellHTML(state);
  }

  function emptyHTML() {
    return `<div class="reg-empty">
      <b>Ничего не найдено</b>
      <span>Уточните запрос или снимите часть фильтров.</span>
      <button class="btn btn-ghost btn-sm" data-reset-filters>Сбросить фильтр</button>
    </div>`;
  }

  let lastFacets = { status: {}, city: {}, institution: {}, insp: {}, typeId: {}, flags: {} };

  function render() {
    if (!alive) return;
    const active = document.activeElement;
    const wasLocator = active && active.hasAttribute && active.hasAttribute('data-locator');
    const caret = wasLocator ? active.selectionStart : null;
    const vpOld = scope.$('[data-viewport]');
    const scrollTop = vpOld ? vpOld.scrollTop : 0;

    lastFacets = facetsAll(state.filter);
    const total = countAll(state.filter);
    lastTotal = total;

    const types = sortedTypes();

    scope.setHTML(`
      <div class="reg">
        <div class="reg-head">
          ${locatorHTML(state)}

          <div class="reg-head-right">
            <div class="reg-who" title="От чьего имени работаем — влияет на срезы «мои»">
              <span class="muted">я:</span>
              <b>${esc(state.person)}</b>
              <select class="select" data-role>
                ${ROLES.map((r) => `<option value="${r.key}" ${state.role === r.key ? 'selected' : ''}>${r.label}</option>`).join('')}
              </select>
            </div>

            <div class="dd">
              <button class="btn btn-primary" data-dd-toggle>+ Создать ОЦ ▾</button>
              <div class="dd-menu">
                <div class="dd-group">Тип нового объекта</div>
                ${types.map((t) => `<button data-create="${esc(t.manifest.id)}">${esc(t.manifest.icon)} ${esc(t.manifest.label)}</button>`).join('')}
              </div>
            </div>
          </div>
        </div>

        <div class="reg-bar">
          ${slicesHTML(state, dataVersion)}
          ${state.recent.length ? `<div class="reg-recent">
            <span class="muted">недавние:</span>
            ${state.recent.map((r) => `<button class="reg-chip" data-row="${esc(r.typeId)}|${esc(r.id)}" title="${esc(r.title)}">${esc(r.typeIcon)} ${esc(shorten(r.title))}</button>`).join('')}
          </div>` : ''}
        </div>

        <div class="reg-main">
          <aside class="reg-facets">${facetsHTML(state, lastFacets)}</aside>

          <section class="reg-body">
            ${toolbarHTML(total)}
            <div class="reg-view-box is-table d-${state.density}">${viewHTML()}</div>
          </section>

          ${state.previewId ? `<aside class="reg-preview">${previewHTML(state)}</aside>` : ''}
        </div>

        <div class="reg-foot">
          <span class="muted">демо-объём (только макет):</span>
          <select class="select" data-bulk-count>
            ${[0, 1000, 5000, 20000].map((n) => `<option value="${n}" ${bulkTotal() === n ? 'selected' : ''}>${n ? n.toLocaleString('ru') + ' синтетических' : 'только сид'}</option>`).join('')}
          </select>
          <span class="muted">всего в реестре: ${totalObjects().toLocaleString('ru')}</span>
          <span class="muted" style="margin-left:auto">/ — поиск · j k — по списку · Enter — карточка · Space — превью</span>
        </div>
      </div>`);

    bind();

    const vp = scope.$('[data-viewport]');
    if (vp) vp.scrollTop = scrollTop;
    updateRows();

    if (wasLocator) {
      const inp = scope.$('[data-locator]');
      if (inp) { inp.focus(); if (caret != null) inp.setSelectionRange(caret, caret); }
      if (state.filter.q) showDrop();
    }

    syncHash();
  }

  function shorten(s) {
    return s.length > 26 ? s.slice(0, 25) + '…' : s;
  }

  // --- Виртуализация ------------------------------------------------------
  function updateRows() {
    const vp = scope.$('[data-viewport]');
    const spacer = scope.$('[data-spacer]');
    const rowsEl = scope.$('[data-rows]');
    if (!vp || !spacer || !rowsEl) return;

    const rowH = ROW_H[state.density];
    spacer.style.height = (lastTotal * rowH) + 'px';

    if (!lastTotal) {
      rowsEl.innerHTML = `<div class="reg-empty-row">${emptyHTML()}</div>`;
      rowsEl.style.transform = 'translateY(0)';
      bindRows();
      return;
    }

    const visible = Math.ceil(vp.clientHeight / rowH) + 8;
    const offset = Math.max(0, Math.floor(vp.scrollTop / rowH) - 4);
    const res = queryAll({ filter: state.filter, sort: state.sort, offset, limit: visible });

    rowsEl.style.transform = `translateY(${offset * rowH}px)`;
    rowsEl.innerHTML = rowsHTML(state, res.rows, offset);

    if (cursor >= 0) {
      const el = rowsEl.querySelector(`[data-index="${cursor}"]`);
      if (el) el.classList.add('cur');
    }

    bindRows();
  }

  // --- Обработчики --------------------------------------------------------
  function openRow(typeId, id) {
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

    location.hash = build({ typeId, ocId: id });
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
        render();
      };
    });

    // Перетаскивание карточек доски меняет статус.
    scope.$$('[data-card]').forEach((card) => {
      card.ondragstart = (e) => {
        e.dataTransfer.setData('text/plain', card.dataset.card);
        card.classList.add('drag');
      };
      card.ondragend = () => card.classList.remove('drag');
    });

    scope.$$('[data-stage-col]').forEach((col) => {
      col.ondragover = (e) => { e.preventDefault(); col.classList.add('over'); };
      col.ondragleave = () => col.classList.remove('over');
      col.ondrop = (e) => {
        e.preventDefault();
        col.classList.remove('over');
        const [typeId, id] = String(e.dataTransfer.getData('text/plain')).split('|');
        const stage = col.dataset.stageCol;
        mutate(typeId, id, (api) => api.setStatus(id, stage));
        dataVersion++;
        invalidateSliceCounts();
        host.toast('Статус изменён: ' + stage, 'ok');
        render();
      };
    });
  }

  function togglePreview(typeId, id) {
    if (state.previewId === id) { state.previewId = null; state.previewType = null; }
    else { state.previewId = id; state.previewType = typeId; }
    render();
  }

  function showDrop() {
    const drop = scope.$('[data-locator-drop]');
    if (!drop) return;
    drop.hidden = false;
    drop.innerHTML = locatorDropHTML(state.filter.q, lastTotal);

    drop.querySelectorAll('[data-goto]').forEach((b) => {
      b.onclick = () => {
        const [typeId, id] = b.dataset.goto.split('|');
        openRow(typeId, id);
      };
    });

    const all = drop.querySelector('[data-locator-all]');
    if (all) all.onclick = () => { drop.hidden = true; render(); };
  }

  function hideDrop() {
    const drop = scope.$('[data-locator-drop]');
    if (drop) drop.hidden = true;
  }

  function resetFilters() {
    state.filter = emptyFilter();
    state.sliceKey = null;
    state.selected.clear();
    cursor = -1;
    render();
  }

  async function bulkAction(kind) {
    const ids = [...state.selected.entries()];
    if (!ids.length) return;

    if (kind === 'clear') { state.selected.clear(); render(); return; }

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
    render();
  }

  const EXPORT_LIMIT = 20000;

  function exportCsv() {
    const sel = [...state.selected.keys()];
    const rows = sel.length
      ? queryAll({ filter: state.filter, sort: state.sort, offset: 0, limit: EXPORT_LIMIT })
        .rows.filter((r) => state.selected.has(r.id))
      : queryAll({ filter: state.filter, sort: state.sort, offset: 0, limit: EXPORT_LIMIT }).rows;

    const csv = csvOf(state, rows);
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `oc-reestr-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);

    host.toast(`Выгружено строк: ${rows.length}${lastTotal > EXPORT_LIMIT ? ' (ограничение ' + EXPORT_LIMIT + ')' : ''}`, 'ok');
  }

  function bind() {
    const s = scope;

    // Локатор
    const loc = s.$('[data-locator]');
    if (loc) {
      loc.oninput = () => {
        state.filter.q = loc.value.trim().toLowerCase();
        clearTimeout(locatorTimer);
        locatorTimer = setTimeout(() => render(), 170);
      };
      loc.onkeydown = (e) => {
        if (e.key === 'Enter') {
          const single = locatorSingle(state.filter.q);
          if (single) { openRow(single.typeId, single.id); return; }
          hideDrop();
        }
        if (e.key === 'Escape') { hideDrop(); loc.blur(); }
      };
      loc.onfocus = () => { if (state.filter.q) showDrop(); };
    }

    const clear = s.$('[data-locator-clear]');
    if (clear) clear.onclick = () => { state.filter.q = ''; hideDrop(); render(); };

    s.onDocument('click', (e) => {
      if (!e.target.closest('.reg-locator')) hideDrop();
      if (!e.target.closest('.dd')) document.querySelectorAll('.dd.open').forEach((d) => d.classList.remove('open'));
    });

    // Роль
    const role = s.$('[data-role]');
    if (role) role.onchange = () => {
      state.role = role.value;
      if (state.filter.mine) state.filter.mine = { role: state.role, person: state.person };
      invalidateSliceCounts();
      render();
    };

    // Срезы и воронка
    s.$$('[data-slice]').forEach((b) => b.onclick = () => {
      const def = sliceDefs().find((d) => d.key === b.dataset.slice);
      if (!def) return;
      if (state.sliceKey === def.key) { resetFilters(); return; }
      state.filter = filterForSlice(def, state.person);
      state.sliceKey = def.key;
      state.selected.clear();
      render();
    });

    s.$$('[data-stage]').forEach((b) => b.onclick = () => {
      const stage = b.dataset.stage;
      const list = state.filter.status;
      state.filter.status = list.includes(stage) ? list.filter((x) => x !== stage) : [...list, stage];
      state.sliceKey = null;
      render();
    });

    // Фасеты
    s.$$('[data-facet]').forEach((cb) => cb.onchange = () => {
      const key = cb.dataset.facet;
      const v = cb.value;
      const list = state.filter[key];
      state.filter[key] = cb.checked ? [...list, v] : list.filter((x) => x !== v);
      state.sliceKey = null;
      render();
    });

    s.$$('[data-facet-toggle]').forEach((b) => b.onclick = () => { toggleSection(b.dataset.facetToggle); render(); });
    s.$$('[data-facet-more]').forEach((b) => b.onclick = () => { toggleExpanded(b.dataset.facetMore); render(); });

    s.$$('[data-facet-search]').forEach((inp) => inp.oninput = () => {
      setSearch(inp.dataset.facetSearch, inp.value);
      clearTimeout(locatorTimer);
      locatorTimer = setTimeout(() => {
        render();
        const again = scope.$(`[data-facet-search="${inp.dataset.facetSearch}"]`);
        if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
      }, 170);
    });

    const stale = s.$('[data-stale]');
    if (stale) stale.onchange = () => { state.filter.staleDays = stale.checked ? 30 : 0; render(); };

    s.$$('[data-reset-filters]').forEach((b) => b.onclick = resetFilters);

    // Панель инструментов
    s.$$('[data-view]').forEach((b) => b.onclick = () => {
      state.view = b.dataset.view;
      // Доска сама является измерением «статус», поэтому фильтр по статусу
      // на ней снимается — иначе видна одна колонка из пяти.
      if (state.view === 'kanban' && state.filter.status.length) {
        state.filter.status = [];
        state.sliceKey = null;
      }
      cursor = -1;
      render();
    });

    const sortSel = s.$('[data-sort-sel]');
    if (sortSel) sortSel.onchange = () => { state.sort = { key: sortSel.value, dir: state.sort.dir }; render(); };

    const sortDir = s.$('[data-sort-dir]');
    if (sortDir) sortDir.onclick = () => {
      state.sort = { key: state.sort.key, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' };
      render();
    };

    const dens = s.$('[data-density]');
    if (dens) dens.onclick = () => { state.density = state.density === 'compact' ? 'normal' : 'compact'; render(); };

    s.$$('[data-column]').forEach((cb) => cb.onchange = (e) => {
      e.stopPropagation();
      const key = cb.dataset.column;
      state.columns = cb.checked
        ? COLUMNS.filter((c) => state.columns.includes(c.key) || c.key === key).map((c) => c.key)
        : state.columns.filter((k) => k !== key);
      render();
    });

    s.$$('[data-dd-toggle]').forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      const dd = b.closest('.dd');
      const wasOpen = dd.classList.contains('open');
      document.querySelectorAll('.dd.open').forEach((d) => d.classList.remove('open'));
      if (!wasOpen) dd.classList.add('open');
    });

    s.$$('[data-sort]').forEach((th) => th.onclick = () => {
      const key = th.dataset.sort;
      state.sort = (state.sort.key === key)
        ? { key, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'desc' };
      render();
    });

    const selPage = s.$('[data-select-page]');
    if (selPage) selPage.onchange = () => {
      const res = queryAll({ filter: state.filter, sort: state.sort, offset: 0, limit: 200 });
      if (selPage.checked) res.rows.forEach((r) => state.selected.set(r.id, r.typeId));
      else res.rows.forEach((r) => state.selected.delete(r.id));
      render();
    };

    s.$$('[data-bulk]').forEach((b) => b.onclick = () => bulkAction(b.dataset.bulk));

    // Виртуализация
    const vp = s.$('[data-viewport]');
    if (vp) vp.addEventListener('scroll', () => updateRows());

    // Экспорт в CSV — привычный выход в Excel.
    const exportBtn = s.$('[data-export]');
    if (exportBtn) exportBtn.onclick = () => exportCsv();

    // Превью
    const peekClose = s.$('[data-peek-close]');
    if (peekClose) peekClose.onclick = () => { state.previewId = null; render(); };

    const openPeek = s.$('[data-open-peek]');
    if (openPeek) openPeek.onclick = () => openRow(state.previewType, state.previewId);

    // Демо-объём
    const bulk = s.$('[data-bulk-count]');
    if (bulk) bulk.onchange = () => {
      setBulkTotal(+bulk.value);
      dataVersion++;
      invalidateSliceCounts();
      state.selected.clear();
      cursor = -1;
      host.toast(+bulk.value ? `Загружено ${(+bulk.value).toLocaleString('ru')} синтетических записей` : 'Синтетические записи выключены', 'ok');
      render();
    };

    // Создание ОЦ
    s.$$('[data-create]').forEach((b) => b.onclick = async (e) => {
      e.stopPropagation();
      document.querySelectorAll('.dd.open').forEach((d) => d.classList.remove('open'));

      const type = getType(b.dataset.create);
      if (!type || !type.records.createRecord) return;

      const form = type.records.createForm;
      const values = await formDialog({ title: form.title, fields: form.fields, okLabel: 'Создать' });
      if (!values) return;

      const rec = type.records.createRecord(values);
      dataVersion++;
      invalidateSliceCounts();
      host.toast('Объект оценки создан — заполните карточку', 'ok');
      openRow(type.manifest.id, rec.id);
    });

    bindRows();
  }

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
      if (state.previewId) { state.previewId = null; render(); }
    }
  });

  function moveCursor(delta) {
    if (!lastTotal) return;

    cursor = Math.max(0, Math.min(lastTotal - 1, (cursor < 0 ? -1 : cursor) + delta));

    const vp = scope.$('[data-viewport]');
    const rowH = ROW_H[state.density];
    if (vp) {
      const top = cursor * rowH;
      if (top < vp.scrollTop) vp.scrollTop = top;
      else if (top + rowH > vp.scrollTop + vp.clientHeight) vp.scrollTop = top + rowH - vp.clientHeight;
    }

    updateRows();
  }

  function actOnCursor(open) {
    const res = queryAll({ filter: state.filter, sort: state.sort, offset: cursor, limit: 1 });
    const s = res.rows[0];
    if (!s) return;
    if (open) openRow(s.typeId, s.id);
    else togglePreview(s.typeId, s.id);
  }

  render();

  return {
    onRoute(route) {
      alive = true;
      applyQueryToState(state, route.query || {});
      render();
    },
    destroy() {
      alive = false;
      clearTimeout(locatorTimer);
    },
  };
}
