import { esc } from '../../kernel/dom.js';
import { sortedTypes, getType } from '../../kernel/registry.js';
import { build, MENU_HREF } from '../../kernel/router.js';
import { selectDialog } from '../../kernel/dialog.js';
import {
  createState, applyQueryToState, hashFor, emptyFilter, isFilterEmpty,
  ROLES, COLUMNS, rolePerms, roleHint,
} from './state.js';
import {
  queryAll, countAll, facetsAll, setBulkTotal, bulkTotal, totalObjects, mutate,
} from './query.js';
import { locatorHTML, locatorSingle } from './locator.js';
import { slicesHTML, sliceDefs, filterForSlice, invalidateSliceCounts } from './slices.js';
import {
  facetsHTML, toggleSection, toggleExpanded, setSearch,
} from './facets.js';
import { ROW_H, tableHeadHTML, rowsHTML, columnsMenuHTML, csvOf } from './table.js';
import { previewHTML } from './preview.js';

// Состояние переживает уход в карточку и возврат: фильтр не сбрасывается.
const state = createState();
let dataVersion = 0;      // растёт при изменении данных — сбрасывает кэш срезов
let cursor = -1;

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
  let alive = true;   // после уxода со страницы отложенные рендеры не выполняются
  let lastFacets = { status: {}, city: {}, institution: {}, insp: {}, typeId: {}, flags: {} };

  // --- Адрес --------------------------------------------------------------
  function syncHash() {
    if (!alive) return;
    const h = hashFor(state);
    if (location.hash !== h) history.replaceState(null, '', h);
  }

  function plural(n) {
    const a = n % 10, b = n % 100;
    if (a === 1 && b !== 11) return 'объект';
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return 'объекта';
    return 'объектов';
  }

  function shorten(s) {
    return s.length > 26 ? s.slice(0, 25) + '…' : s;
  }

  // --- Фрагменты разметки ---------------------------------------------------
  // Каждый фрагмент рендерится в свой контейнер (data-region-*), поэтому
  // ввод в поиске/фильтре не задевает локатор, роль и остальную страницу —
  // только те куски, которые от него реально зависят.

  // Роль/аккаунт — рядом с локатором: там всё равно остаётся свободное
  // место (локатор не тянется на весь экран), новая строка ради одной
  // маленькой панели не нужна.
  function whoHTML() {
    // «Мои учреждения» — тестовый переключатель для ролей, не видящих всё
    // (сотрудник в логе действий видит только свои учреждения; admin/«любая
    // роль» — все). Реальных учётных записей пока нет, поэтому это ручной
    // ввод, а не выбор из профиля.
    const showInst = state.role !== 'admin' && state.role !== 'any';

    return `<div class="reg-who" title="${esc(roleHint(state.role))}">
      <span class="muted">я:</span>
      <b>${esc(state.person)}</b>
      <select class="select" data-role>
        ${ROLES.map((r) => `<option value="${r.key}" ${state.role === r.key ? 'selected' : ''}>${r.label}</option>`).join('')}
      </select>
      ${showInst ? `<input class="input" data-institutions style="width:180px" placeholder="мои учреждения, через запятую" value="${esc((state.institutions || []).join(', '))}" title="Для лога действий: сотрудник видит только объекты этих учреждений">` : ''}
    </div>`;
  }

  // Кнопка создания — действие уровня таблицы (как экспорт/столбцы), поэтому
  // стоит в панели инструментов над таблицей, а не отдельной строкой сверху.
  function createDdHTML() {
    const perms = rolePerms(state.role);
    const types = sortedTypes();
    const role = ROLES.find((r) => r.key === state.role);

    return `<div class="dd">
      <button class="btn btn-primary" data-dd-toggle ${perms.create ? '' : 'disabled'}
        title="${perms.create ? '' : `Роль «${esc(role ? role.label : '')}» новые ОЦ не создаёт`}">+ Создать ОЦ ▾</button>
      <div class="dd-menu reg-create-menu">
        <div class="dd-group">Тип нового объекта</div>
        ${types.map((t) => `<button data-create="${esc(t.manifest.id)}">${esc(t.manifest.icon)} ${esc(t.manifest.label)}</button>`).join('')}
      </div>
    </div>`;
  }

  // «Срезы» и «Недавние» — видимые секции с заголовком и рамкой (как у
  // фасетов), а не голый ряд кнопок без подписи. Обе сворачиваются, но не
  // через renderData()/renderShell() — сворачивание не должно требовать
  // рендера, это просто toggle класса (см. bindData: data-bar-toggle).
  function barSectionHTML(key, label, bodyHTML) {
    return `<div class="reg-section ${state.barOpen[key] ? 'open' : ''}">
      <button class="reg-section-h" data-bar-toggle="${key}">
        <span class="chev">▾</span>${esc(label)}
      </button>
      <div class="reg-section-body">${bodyHTML}</div>
    </div>`;
  }

  function barHTML() {
    const recent = state.recent.length ? barSectionHTML('recent', 'Недавние', `<div class="reg-recent">
      ${state.recent.map((r) => `<button class="reg-chip" data-row="${esc(r.typeId)}|${esc(r.id)}" title="${esc(r.title)}">${esc(r.typeIcon)} ${esc(shorten(r.title))}</button>`).join('')}
    </div>`) : '';

    return `${barSectionHTML('slices', 'Срезы', slicesHTML(state, dataVersion))}${recent}`;
  }

  function toolbarHTML(total) {
    const perms = rolePerms(state.role);
    const sel = state.selected.size;

    return `<div class="reg-count">
        <b>${total.toLocaleString('ru')}</b>
        <span>${plural(total)}</span>
        ${isFilterEmpty(state.filter) ? '' : '<button class="btn btn-ghost btn-sm" data-reset-filters>сбросить фильтр</button>'}
      </div>

      ${sel ? `<div class="reg-bulk">
        <span>выбрано <b>${sel}</b></span>
        ${perms.assignInsp ? '<button class="btn btn-ghost btn-sm" data-bulk="insp">Назначить осмотрщика</button>' : ''}
        ${perms.setStatus ? '<button class="btn btn-ghost btn-sm" data-bulk="status">Сменить статус</button>' : ''}
        <button class="btn btn-ghost btn-sm" data-bulk="clear">Снять выбор</button>
      </div>` : ''}

      <div class="reg-tools">
        <button class="btn btn-ghost btn-sm" data-export title="Выгрузить текущую выборку в CSV для Excel">Экспорт CSV</button>
        <div class="dd">
          <button class="reg-icon-btn" data-dd-toggle title="Столбцы">⋮⋮</button>
          <div class="dd-menu reg-cols">${columnsMenuHTML(state)}</div>
        </div>
        ${createDdHTML()}
      </div>`;
  }

  function emptyHTML() {
    return `<div class="reg-empty">
      <b>Ничего не найдено</b>
      <span>Уточните запрос или снимите часть фильтров.</span>
      <button class="btn btn-ghost btn-sm" data-reset-filters>Сбросить фильтр</button>
    </div>`;
  }

  function footHTML() {
    return `<span class="muted">демо-объём (только макет):</span>
      <select class="select" data-bulk-count>
        ${[0, 1000, 5000, 20000].map((n) => `<option value="${n}" ${bulkTotal() === n ? 'selected' : ''}>${n ? n.toLocaleString('ru') + ' синтетических' : 'только сид'}</option>`).join('')}
      </select>
      <span class="muted">всего в реестре: ${totalObjects().toLocaleString('ru')}</span>
      <span class="muted" style="margin-left:auto">/ — поиск · j k — по списку · Enter — карточка · Space — превью</span>`;
  }

  // Вкладка панели фильтров: стрелка и подпись — отдельные элементы, а не
  // смешанный текст внутри вертикального writing-mode (из-за этого подпись
  // вылезала за пределы кнопки). Подпись видна всегда; стрелка тоже видна
  // всегда и просто разворачивается на 180° — как шевроны у секций фильтров
  // ниже, а не исчезает.
  function facetsTabInnerHTML(open) {
    return `<span class="reg-facets-tab-arrow ${open ? '' : 'closed'}">◂</span><span class="reg-facets-tab-label">Фильтры</span>`;
  }

  // --- Полный рендер: каркас страницы --------------------------------------
  // Вызывается только при заходе на страницу/возврате в неё (onRoute) —
  // единственные случаи, когда состав данных может быть совсем другим.
  // Любое взаимодействие внутри страницы (поиск, фильтры, роль, срезы,
  // сортировка, превью, сворачивание панели, объём демо-данных) идёт через
  // renderData() или прямые точечные правки DOM — без setHTML() всего блока,
  // поэтому не теряются ни фокус в поле поиска, ни скролл внутри фильтров,
  // ни позиция самой панели.
  function renderShell() {
    if (!alive) return;

    // Уход в карточку и возврат — самый частый повод для renderShell (onRoute).
    // Позицию в списке (иногда на десятках тысяч строк) в этот момент терять
    // нельзя, поэтому сохраняем и восстанавливаем скролл явно.
    const vpOld = scope.$('[data-viewport]');
    const scrollTop = vpOld ? vpOld.scrollTop : 0;

    lastFacets = facetsAll(state.filter);
    const total = countAll(state.filter);
    lastTotal = total;

    scope.setHTML(`
      <div class="reg">
        <div class="reg-search-row">
          ${locatorHTML(state)}
          <div data-region-who>${whoHTML()}</div>
        </div>

        <div class="reg-bar" data-region-bar>${barHTML()}</div>

        <div class="reg-main">
          <button class="reg-facets-tab" data-facets-toggle
            title="${state.facetsOpen ? 'Скрыть фильтры' : 'Показать фильтры'}">${facetsTabInnerHTML(state.facetsOpen)}</button>

          <aside class="reg-facets-wrap ${state.facetsOpen ? '' : 'closed'}" data-facets-wrap>
            <div class="reg-facets" data-region-facets>${facetsHTML(state, lastFacets)}</div>
          </aside>

          <section class="reg-body">
            <div class="reg-toolbar" data-region-toolbar>${toolbarHTML(total)}</div>
            <div class="reg-view-box">
              <div data-region-thead>${tableHeadHTML(state)}</div>
              <div class="reg-viewport" data-viewport>
                <div class="reg-spacer" data-spacer></div>
                <div class="reg-rows" data-rows></div>
              </div>
            </div>
          </section>

          <aside class="reg-preview ${state.previewId ? '' : 'hidden'}" data-region-preview>${previewHTML(state)}</aside>
        </div>

        <div class="reg-foot" data-region-foot>${footHTML()}</div>
      </div>`);

    bindShell();
    bindData();
    bindPreview();

    const vp = scope.$('[data-viewport]');
    if (vp) vp.scrollTop = scrollTop;
    updateRows();
    syncHash();
  }

  // --- Частичный рендер: всё, что зависит от фильтра/поиска/данных --------
  // Локатор, панель фильтров (как контейнер) и превью не пересобираются —
  // фокус, скролл и позиция панели не теряются.
  function renderData() {
    if (!alive) return;

    lastFacets = facetsAll(state.filter);
    const total = countAll(state.filter);
    lastTotal = total;

    const who = scope.$('[data-region-who]');
    if (who) who.innerHTML = whoHTML();

    const bar = scope.$('[data-region-bar]');
    if (bar) bar.innerHTML = barHTML();

    const facetsBox = scope.$('[data-region-facets]');
    if (facetsBox) {
      const facetsScroll = facetsBox.scrollTop;
      facetsBox.innerHTML = facetsHTML(state, lastFacets);
      facetsBox.scrollTop = facetsScroll;
    }

    const toolbar = scope.$('[data-region-toolbar]');
    if (toolbar) toolbar.innerHTML = toolbarHTML(total);

    const thead = scope.$('[data-region-thead]');
    if (thead) thead.innerHTML = tableHeadHTML(state);

    const foot = scope.$('[data-region-foot]');
    if (foot) foot.innerHTML = footHTML();

    bindData();
    updateRows();
    syncHash();
  }

  // --- Виртуализация --------------------------------------------------------
  function updateRows() {
    const vp = scope.$('[data-viewport]');
    const spacer = scope.$('[data-spacer]');
    const rowsEl = scope.$('[data-rows]');
    if (!vp || !spacer || !rowsEl) return;

    spacer.style.height = (lastTotal * ROW_H) + 'px';

    if (!lastTotal) {
      rowsEl.innerHTML = `<div class="reg-empty-row">${emptyHTML()}</div>`;
      rowsEl.style.transform = 'translateY(0)';
      bindRows();
      return;
    }

    const visible = Math.ceil(vp.clientHeight / ROW_H) + 8;
    const offset = Math.max(0, Math.floor(vp.scrollTop / ROW_H) - 4);
    const res = queryAll({ filter: state.filter, sort: state.sort, offset, limit: visible });

    rowsEl.style.transform = `translateY(${offset * ROW_H}px)`;
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

  // Превью — постоянный контейнер в разметке (data-region-preview), просто
  // прячется классом hidden: не нужно пересобирать всю страницу, чтобы
  // открыть/закрыть узкую панель справа.
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
    renderData();
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

  const EXPORT_LIMIT = 20000;

  function exportCsv() {
    const sel = [...state.selected.keys()];
    const rows = sel.length
      ? queryAll({ filter: state.filter, sort: state.sort, offset: 0, limit: EXPORT_LIMIT })
        .rows.filter((r) => state.selected.has(r.id))
      : queryAll({ filter: state.filter, sort: state.sort, offset: 0, limit: EXPORT_LIMIT }).rows;

    const csv = csvOf(state, rows);
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `oc-reestr-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);

    host.toast(`Выгружено строк: ${rows.length}${lastTotal > EXPORT_LIMIT ? ' (ограничение ' + EXPORT_LIMIT + ')' : ''}`, 'ok');
  }

  // Вешается один раз при построении каркаса (renderShell) — элементы,
  // которые сама renderData() никогда не пересобирает: локатор, вкладка
  // панели фильтров, вьюпорт таблицы (его скролл-слушатель нельзя навешивать
  // повторно — узел переживает renderData, и addEventListener задвоился бы).
  function bindShell() {
    const s = scope;

    const loc = s.$('[data-locator]');
    const clear = s.$('[data-locator-clear]');
    if (loc) {
      loc.oninput = () => {
        state.filter.q = loc.value.trim().toLowerCase();
        if (clear) clear.classList.toggle('hidden', !state.filter.q);
        clearTimeout(locatorTimer);
        locatorTimer = setTimeout(() => renderData(), 170);
      };
      loc.onkeydown = (e) => {
        if (e.key === 'Enter') {
          const single = locatorSingle(state.filter.q);
          if (single) openRow(single.typeId, single.id);
        }
      };
    }
    if (clear) clear.onclick = () => {
      state.filter.q = '';
      if (loc) { loc.value = ''; loc.focus(); }
      clear.classList.add('hidden');
      renderData();
    };

    // Панель фильтров сворачивается точечной правкой DOM — без единого
    // renderShell()/renderData(), поэтому позиция внутри неё (открытые
    // секции, скролл списка учреждений) никогда не сбивается.
    const facetsToggle = s.$('[data-facets-toggle]');
    const facetsWrap = s.$('[data-facets-wrap]');
    if (facetsToggle) facetsToggle.onclick = () => {
      state.facetsOpen = !state.facetsOpen;
      if (facetsWrap) facetsWrap.classList.toggle('closed', !state.facetsOpen);
      facetsToggle.title = state.facetsOpen ? 'Скрыть фильтры' : 'Показать фильтры';
      facetsToggle.innerHTML = facetsTabInnerHTML(state.facetsOpen);
    };

    const vp = s.$('[data-viewport]');
    if (vp) vp.addEventListener('scroll', () => updateRows());
  }

  // Переключатели внутри регионов, которые пересобираются при каждом
  // изменении фильтра/поиска — навешиваются заново после каждой замены их
  // innerHTML.
  function bindData() {
    const s = scope;

    const role = s.$('[data-role]');
    if (role) role.onchange = () => {
      state.role = role.value;
      const perms = rolePerms(state.role);

      // «Мои…» срезы относятся к роли: при смене роли старый личный срез
      // может стать недоступным — тогда сбрасываем фильтр, а не оставляем
      // невидимый активный срез.
      if (state.sliceKey && state.sliceKey.startsWith('my-') && !perms.slices.includes(state.sliceKey)) {
        state.filter = emptyFilter();
        state.sliceKey = null;
        state.selected.clear();
        cursor = -1;
      } else if (state.filter.mine) {
        state.filter.mine = { role: state.role, person: state.person };
      }

      invalidateSliceCounts();
      renderData();
    };

    const inst = s.$('[data-institutions]');
    if (inst) inst.onchange = () => {
      state.institutions = inst.value.split(',').map((x) => x.trim()).filter(Boolean);
    };

    const bulk = s.$('[data-bulk-count]');
    if (bulk) bulk.onchange = () => {
      setBulkTotal(+bulk.value);
      dataVersion++;
      invalidateSliceCounts();
      state.selected.clear();
      cursor = -1;
      host.toast(+bulk.value ? `Загружено ${(+bulk.value).toLocaleString('ru')} синтетических записей` : 'Синтетические записи выключены', 'ok');
      renderData();
    };

    // Создание ОЦ подхватывается из самого модуля: никакого отдельного
    // диалога/формы создания на уровне меню — модуль сразу отдаёт пустую
    // запись, и мы ведём прямо на её форму редактирования (пока что это
    // и есть форма создания — та же форма, тот же экран).
    s.$$('[data-create]').forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      document.querySelectorAll('.dd.open').forEach((d) => d.classList.remove('open'));

      if (!rolePerms(state.role).create) return;

      const type = getType(b.dataset.create);
      if (!type || !type.records.createRecord) return;

      const rec = type.records.createRecord();
      dataVersion++;
      invalidateSliceCounts();
      host.toast('Объект оценки создан — заполните форму', 'ok');
      openRow(type.manifest.id, rec.id, ['create']);
    });

    s.$$('[data-bar-toggle]').forEach((b) => b.onclick = () => {
      const key = b.dataset.barToggle;
      state.barOpen[key] = !state.barOpen[key];
      const section = b.closest('.reg-section');
      if (section) section.classList.toggle('open', state.barOpen[key]);
    });

    s.$$('[data-slice]').forEach((b) => b.onclick = () => {
      const def = sliceDefs().find((d) => d.key === b.dataset.slice);
      if (!def) return;
      if (state.sliceKey === def.key) { resetFilters(); return; }
      state.filter = filterForSlice(def, state.person);
      state.sliceKey = def.key;
      state.selected.clear();
      renderData();
    });

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
    if (stale) stale.onchange = () => { state.filter.staleDays = stale.checked ? 30 : 0; renderData(); };

    s.$$('[data-reset-filters]').forEach((b) => b.onclick = resetFilters);

    const selPage = s.$('[data-select-page]');
    if (selPage) selPage.onchange = () => {
      const res = queryAll({ filter: state.filter, sort: state.sort, offset: 0, limit: 200 });
      if (selPage.checked) res.rows.forEach((r) => state.selected.set(r.id, r.typeId));
      else res.rows.forEach((r) => state.selected.delete(r.id));
      renderData();
    };

    s.$$('[data-bulk]').forEach((b) => b.onclick = () => bulkAction(b.dataset.bulk));

    s.$$('[data-column]').forEach((cb) => cb.onchange = (e) => {
      e.stopPropagation();
      const key = cb.dataset.column;
      state.columns = cb.checked
        ? COLUMNS.filter((c) => state.columns.includes(c.key) || c.key === key).map((c) => c.key)
        : state.columns.filter((k) => k !== key);
      renderData();
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
      renderData();
    });

    const exportBtn = s.$('[data-export]');
    if (exportBtn) exportBtn.onclick = () => exportCsv();

    bindRows();
  }

  // Закрытие дропдаунов по клику вне них — регистрируется один раз на весь
  // срок жизни страницы. scope.onDocument добавляет слушатель без снятия
  // старого, поэтому вешать его на каждый renderShell()/renderData() нельзя:
  // слушатели накапливались бы с каждым действием пользователя.
  scope.onDocument('click', (e) => {
    if (!e.target.closest('.dd')) document.querySelectorAll('.dd.open').forEach((d) => d.classList.remove('open'));
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

    cursor = Math.max(0, Math.min(lastTotal - 1, (cursor < 0 ? -1 : cursor) + delta));

    const vp = scope.$('[data-viewport]');
    if (vp) {
      const top = cursor * ROW_H;
      if (top < vp.scrollTop) vp.scrollTop = top;
      else if (top + ROW_H > vp.scrollTop + vp.clientHeight) vp.scrollTop = top + ROW_H - vp.clientHeight;
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
    },
  };
}
