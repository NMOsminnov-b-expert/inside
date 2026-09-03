// Учреждения — общесистемный раздел (пункт сайдбара был кнопкой без экрана).
//
// Учреждение в макете не отдельная сущность со своей карточкой: это поле у
// объекта оценки и у документа. Поэтому раздел ничего не заводит и не хранит —
// он собирает картину из того, что уже есть: сколько у учреждения объектов
// оценки (в разрезе типов ОЦ) и сколько документов, и уводит в реестр или в
// документы с уже наложенным фильтром.
//
// Устроен как «Документы»: плитки сводки, панель фильтров, таблица со
// столбцами (ширины тянутся перегородками, сортировка по щелчку на заголовке).
// Отличие одно — строка раскрывается: разрез по типам ОЦ и действия видно на
// месте, без ухода на отдельную карточку.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: на сервере учреждение станет справочной записью со
// своим идентификатором, реквизитами и сотрудниками, а связь с объектами —
// по идентификатору, а не по названию. Тогда раздел превращается в настоящий
// реестр учреждений с карточкой; сейчас названия сравниваются как строки —
// так же, как это делают фасеты реестра объектов.
import { esc } from '../../kernel/dom.js';
import { facetsAll } from '../ocMenu/query.js';
import { emptyFilter } from '../ocMenu/state.js';
import { documentInstitutions, queryDocuments } from '../../kernel/documentsRegistry.js';
import { session, myInstitutions } from '../../kernel/session.js';
import { sortedTypes } from '../../kernel/registry.js';
import { setCrumbs, setActiveNav } from '../../shell/shell.js';
import { MENU_HREF, DOCS_HREF } from '../../kernel/router.js';
import {
  colGroupHTML, headAttrs, colLabelHTML, resizeGripHTML, columnVarsStyle, bindColumnResize,
} from '../../kernel/columns.js';

const state = { q: '', open: null, onlyMine: false, sort: 'oc', dir: 'desc' };

const INST_COLUMNS = [
  { key: 'name', label: 'Учреждение', width: 0, minWidth: 200 },
  { key: 'types', label: 'Типы объектов оценки', width: 300, minWidth: 160 },
  { key: 'oc', label: 'Объектов оценки', width: 150, minWidth: 110 },
  { key: 'docs', label: 'Документов', width: 130, minWidth: 100 },
  { key: 'mine', label: 'Моё', width: 74, minWidth: 60, fixed: true },
];

const instColWidths = {};

// Сводка по учреждениям: объекты оценки — из фасетов реестра (там же, откуда их
// берёт фильтр «Учреждение»), документы — из реестра документов.
function collect() {
  const byOc = facetsAll(emptyFilter());
  const names = new Set([...Object.keys(byOc.institution), ...documentInstitutions()]);
  const mine = myInstitutions();

  return [...names].map((name) => ({
    name,
    oc: byOc.institution[name] || 0,
    docs: queryDocuments({ institution: name, limit: 0 }).total,
    mine: mine.includes(name),
  }));
}

// Разрез по типам ОЦ для одного учреждения: тот же фасет, но с фильтром.
function byTypeFor(name) {
  const f = facetsAll({ ...emptyFilter(), institution: [name] });
  return sortedTypes()
    .map((t) => ({ label: t.manifest.label, n: f.typeId[t.manifest.id] || 0 }))
    .filter((x) => x.n);
}

const SORTERS = {
  name: (a, b) => a.name.localeCompare(b.name, 'ru'),
  types: (a, b) => a.oc - b.oc,
  oc: (a, b) => a.oc - b.oc,
  docs: (a, b) => a.docs - b.docs,
  mine: (a, b) => (a.mine === b.mine ? 0 : (a.mine ? 1 : -1)),
};

function sortRows(rows) {
  const cmp = SORTERS[state.sort] || SORTERS.oc;
  const sign = state.dir === 'asc' ? 1 : -1;
  // Вторым ключом всегда название: иначе учреждения с одинаковыми числами
  // перескакивают с места на место при каждой перерисовке.
  return rows.slice().sort((a, b) => sign * cmp(a, b) || a.name.localeCompare(b.name, 'ru'));
}

function matches(row) {
  if (state.onlyMine && !row.mine) return false;
  if (!state.q) return true;
  return row.name.toLowerCase().includes(state.q.toLowerCase());
}

function typesCellHTML(row) {
  if (!row.oc) return '<span class="inst-dim">—</span>';
  const list = byTypeFor(row.name);
  const shown = list.slice(0, 2);
  const rest = list.length - shown.length;

  return `${shown.map((t) => `<span class="inst-type">${esc(t.label)}<b>${t.n}</b></span>`).join('')}
    ${rest > 0 ? `<span class="inst-type more" title="${esc(list.slice(2).map((t) => t.label + ' — ' + t.n).join(', '))}">ещё ${rest}</span>` : ''}`;
}

function cellHTML(col, row) {
  if (col.key === 'name') {
    return `<td class="ell" title="${esc(row.name)}">
      <span class="inst-name">${row.mine ? '<i class="inst-mine-mark" title="Закреплено за вами">●</i>' : ''}
        <b>${esc(row.name)}</b></span>
    </td>`;
  }
  if (col.key === 'types') return `<td class="inst-types-cell">${typesCellHTML(row)}</td>`;
  if (col.key === 'oc') return `<td class="num">${row.oc || '<span class="inst-dim">0</span>'}</td>`;
  if (col.key === 'docs') return `<td class="num">${row.docs || '<span class="inst-dim">0</span>'}</td>`;
  if (col.key === 'mine') {
    return `<td class="inst-mine-cell">
      <label class="inst-check ${row.mine ? 'on' : ''}" title="Закрепить учреждение за собой">
        <input type="checkbox" data-inst-mine="${esc(row.name)}" ${row.mine ? 'checked' : ''}>
        <i>✓</i>
      </label>
    </td>`;
  }
  return '<td></td>';
}

function rowHTML(row) {
  const open = state.open === row.name;

  const details = `<tr class="inst-details-row">
    <td colspan="${INST_COLUMNS.length}">
      <div class="inst-details">
        ${row.oc ? `<div class="inst-types full">
            ${byTypeFor(row.name).map((t) => `<span class="inst-type">${esc(t.label)}<b>${t.n}</b></span>`).join('')}
          </div>`
        : '<span class="inst-dim">Объектов оценки нет — учреждение встречается только в документах.</span>'}

        <div class="inst-actions">
          <button class="btn btn-ghost btn-sm" data-inst-oc="${esc(row.name)}" ${row.oc ? '' : 'disabled'}>
            Показать объекты оценки${row.oc ? ` · ${row.oc}` : ''}</button>
          <button class="btn btn-ghost btn-sm" data-inst-docs="${esc(row.name)}" ${row.docs ? '' : 'disabled'}>
            Показать документы${row.docs ? ` · ${row.docs}` : ''}</button>
        </div>
      </div>
    </td>
  </tr>`;

  return `<tr class="inst-row ${open ? 'open' : ''} ${row.mine ? 'mine' : ''}"
      data-inst-row="${esc(row.name)}">
      ${INST_COLUMNS.map((c) => cellHTML(c, row)).join('')}
    </tr>
    ${open ? details : ''}`;
}

function viewHTML() {
  const rows = collect();
  const shown = sortRows(rows.filter(matches));
  const mineCount = rows.filter((r) => r.mine).length;
  const totalOc = rows.reduce((n, r) => n + r.oc, 0);
  const totalDocs = rows.reduce((n, r) => n + r.docs, 0);

  return `<div class="inst">
    <div class="inst-head"><h2>Учреждения</h2></div>

    <div class="inst-stats">
      <div class="inst-stat"><b>${rows.length}</b><span>Учреждений</span></div>
      <div class="inst-stat"><b>${totalOc}</b><span>Объектов оценки</span></div>
      <div class="inst-stat"><b>${totalDocs}</b><span>Документов</span></div>
      <div class="inst-stat ${mineCount ? 'mine' : ''}"><b>${mineCount}</b><span>Закреплено за вами</span></div>
    </div>

    <div class="inst-toolbar">
      <span class="inst-search">
        <svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true">
          <circle cx="6" cy="6" r="4.1" fill="none" stroke="currentColor" stroke-width="1.4"/>
          <path d="M9.2 9.2 12.4 12.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
        <input data-inst-q value="${esc(state.q)}" autocomplete="off"
          placeholder="Поиск по названию учреждения">
        ${state.q ? '<button class="inst-search-clear" data-inst-q-clear title="Очистить">×</button>' : ''}
      </span>

      <label class="inst-only">
        <input type="checkbox" data-inst-only ${state.onlyMine ? 'checked' : ''}>
        <span>Только мои</span>
      </label>

      <span class="inst-count">${shown.length} из ${rows.length}</span>
    </div>

    <div class="inst-body">
      ${shown.length ? `<div class="inst-cols" data-inst-cols-box
          style="${columnVarsStyle(INST_COLUMNS, instColWidths)}">
        <table class="inst-tbl">
          ${colGroupHTML(INST_COLUMNS, instColWidths)}
          <thead><tr>${INST_COLUMNS.map((c, i) => `<th ${headAttrs(c)}
            data-inst-sort="${c.key}" class="${state.sort === c.key ? 'sorted ' + state.dir : ''}">
            ${colLabelHTML(c)}<span class="inst-sort-mark">${
              state.sort === c.key ? (state.dir === 'asc' ? '▲' : '▼') : ''}</span>
            ${resizeGripHTML(c, i === INST_COLUMNS.length - 1)}
          </th>`).join('')}</tr></thead>
          <tbody>${shown.map(rowHTML).join('')}</tbody>
        </table>
      </div>` : '<div class="inst-empty">Ничего не найдено. Измените запрос или снимите «Только мои».</div>'}
    </div>
  </div>`;
}

export function mountInstitutions(host) {
  const scope = host.scope;
  document.body.dataset.page = 'institutions';
  setActiveNav('inst');
  setCrumbs([{ label: 'Главная', to: MENU_HREF }, { label: 'Учреждения', current: true }]);

  function render() {
    scope.setHTML(viewHTML());
    bind();
  }

  function bind() {
    const q = scope.$('[data-inst-q]');
    if (q) q.oninput = () => {
      const pos = q.selectionStart;
      state.q = q.value;
      render();
      const again = scope.$('[data-inst-q]');
      if (again) { again.focus(); again.setSelectionRange(pos, pos); }
    };

    const clear = scope.$('[data-inst-q-clear]');
    if (clear) clear.onclick = () => { state.q = ''; render(); };

    const only = scope.$('[data-inst-only]');
    if (only) only.onchange = () => { state.onlyMine = only.checked; render(); };

    // Щелчок по строке раскрывает разрез по типам ОЦ и действия. Клик по
    // флажку «Моё» до строки не доходит — иначе закрепление ещё и раскрывало бы.
    scope.$$('[data-inst-row]').forEach((tr) => tr.onclick = (e) => {
      if (e.target.closest('.inst-check')) return;
      const name = tr.dataset.instRow;
      state.open = state.open === name ? null : name;
      render();
    });

    // Сортировка: первый щелчок по столбцу — по возрастанию, второй разворачивает.
    scope.$$('[data-inst-sort]').forEach((th) => th.onclick = (e) => {
      if (e.target.closest('[data-col-grip]')) return;
      const key = th.dataset.instSort;
      if (state.sort === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
      else { state.sort = key; state.dir = key === 'name' ? 'asc' : 'desc'; }
      render();
    });

    // Реестр объектов оценки читает фильтр из адреса (pages/ocMenu/state.js,
    // applyQueryToState), реестр документов — тоже, поэтому переход это ссылка.
    scope.$$('[data-inst-oc]').forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      location.hash = MENU_HREF + '?institution=' + encodeURIComponent(b.dataset.instOc);
    });

    scope.$$('[data-inst-docs]').forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      location.hash = DOCS_HREF + '?institution=' + encodeURIComponent(b.dataset.instDocs);
    });

    // Закрепление сотрудника за учреждением. Раньше это был ввод строкой через
    // запятую в шапке реестра — здесь оно на своём месте, рядом с учреждением.
    scope.$$('[data-inst-mine]').forEach((cb) => cb.onchange = () => {
      const name = cb.dataset.instMine;
      const list = (session.state.institutions || []).slice();
      const i = list.indexOf(name);

      if (cb.checked && i < 0) list.push(name);
      if (!cb.checked && i >= 0) list.splice(i, 1);

      session.set({ institutions: list });
      render();
      host.toast(cb.checked ? `«${name}» закреплено за вами` : `«${name}» откреплено`, 'ok');
    });

    bindColumnResize(scope, {
      rootSel: '[data-inst-cols-box]',
      cols: INST_COLUMNS,
      widths: instColWidths,
      onCommit(patch) { Object.assign(instColWidths, patch); },
    });
  }

  render();

  // Роль и список своих учреждений меняются и в реестре — экран это видит.
  const off = session.subscribe(render);

  return {
    onRoute() { render(); },
    destroy() { if (typeof off === 'function') off(); },
  };
}
