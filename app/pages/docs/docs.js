// Документы — общесистемная вкладка сайдбара (решение пользователя 2026-09-02):
// реестр документов, не привязанных ни к одному типу ОЦ (см. заглавный
// комментарий kernel/documentsRegistry.js). Каркас страницы и её монтирование —
// по образцу app/pages/archive/archive.js (единый файл, state на уровне
// модуля, viewHTML()/render()/bind(), mountDocs(host) → {onRoute, destroy}).
//
// Список и карточка документа (#/docs/<id>) живут в одном монтировании, как
// вкладки/литеры внутри модуля ОЦ: boot.js не размонтирует страницу между
// ними (route.name==='docs' в обоих случаях), меняется только host.route.id.
import { esc } from '../../kernel/dom.js';
import { MENU_HREF, DOCS_HREF } from '../../kernel/router.js';
import { setCrumbs, setActiveNav } from '../../shell/shell.js';
import {
  colGroupHTML, headAttrs, colLabelHTML, resizeGripHTML, columnVarsStyle, bindColumnResize,
  bindColumnReorder, orderedColumns, movableKeys, normalizeOrder,
} from '../../kernel/columns.js';
import { DOC_TYPES, DOC_STATUSES, queryDocuments, documentStats, statusTone, getDocument } from '../../kernel/documentsRegistry.js';
import { openDocumentModal } from './create.js';
import { detailHTML, bindDetail } from './detail.js';

const state = { q: '', type: '', status: '', page: 1, pageSize: 25, sort: { key: '', dir: 'asc' } };

// Столбцы можно и тянуть за перегородку (ширина), и перетаскивать за шапку
// (порядок) — тот же механизм, что в реестре ОЦ и перечне ОИ (kernel/columns.js).
// Закреплён только «№»: он не двигается и не участвует в перестановке.
// «Наименование» раньше было резиновым (width:0, забирает остаток) — с
// добавлением трёх новых колонок сумма закреплённых ширин стала настолько
// большой, что остаток на слабых экранах уходил в отрицательный, а
// table-layout:fixed с нулевой колонкой на это отвечает крайне заметно
// (см. .docs-cols в docs.css — теперь горизонтальный скролл вместо сжатия).
// Поэтому здесь тоже обычная ширина, а не «резинка».
const DOCS_COLUMNS = [
  { key: 'idx', label: '№', width: 46, minWidth: 40, fixed: true },
  { key: 'type', label: 'Тип', width: 150, minWidth: 100 },
  { key: 'name', label: 'Наименование', width: 220, minWidth: 140 },
  { key: 'number', label: '№ документа', width: 130, minWidth: 90 },
  { key: 'date', label: 'Дата документа', width: 130, minWidth: 100 },
  { key: 'institution', label: 'От кого', width: 220, minWidth: 140 },
  { key: 'regAuthority', label: 'Орган регистрации', width: 200, minWidth: 140 },
  { key: 'regDate', label: 'Дата регистрации', width: 140, minWidth: 100 },
  { key: 'affiliation', label: 'Принадлежность', width: 180, minWidth: 120 },
  { key: 'status', label: 'Статус', width: 140, minWidth: 100 },
];
const DOCS_COLUMNS_DEFAULT = movableKeys(DOCS_COLUMNS);
const docsColWidths = {};
// Порядок столбцов (кроме закреплённого «№») — можно перетаскивать шапку,
// как в реестре ОЦ и в перечне ОИ (kernel/columns.js).
let docsColOrder = DOCS_COLUMNS_DEFAULT.slice();

// .ell — display:block, поэтому её нельзя вешать прямо на <td> (это снимает с
// него display:table-cell и рвёт раскладку строки, особенно когда .ell-ячеек
// в строке несколько подряд — они начинают складываться друг под другом
// вместо того чтобы идти по колонкам). Всегда через внутренний <span>.
function cellHTML(col, doc, n) {
  if (col.key === 'idx') return `<td class="mono">${n}</td>`;
  if (col.key === 'type') return `<td><span class="tag-mini">${esc(doc.type || '—')}</span></td>`;
  if (col.key === 'name') {
    const fname = (doc.files || [])[0];
    const nameCell = `${esc(doc.type || '—')} · ${fname ? esc(fname.name) : '—'}`;
    return `<td><span class="ell" title="${nameCell}">${nameCell}</span></td>`;
  }
  if (col.key === 'number') return `<td>${esc(doc.number || '—')}</td>`;
  if (col.key === 'date') return `<td>${esc(doc.date || '—')}</td>`;
  if (col.key === 'institution') return `<td><span class="ell" title="${esc(doc.institution || '')}">${esc(doc.institution || '—')}</span></td>`;
  if (col.key === 'regAuthority') return `<td><span class="ell" title="${esc(doc.regAuthority || '')}">${esc(doc.regAuthority || '—')}</span></td>`;
  if (col.key === 'regDate') return `<td>${esc(doc.regDate || '—')}</td>`;
  if (col.key === 'affiliation') return `<td><span class="ell" title="${esc(doc.affiliation || '')}">${esc(doc.affiliation || '—')}</span></td>`;
  if (col.key === 'status') return `<td><span class="docs-status ${statusTone(doc.status)}">${esc(doc.status)}</span></td>`;
  return '<td></td>';
}

// Шапка колонки — клик по названию сортирует список по этой колонке (дата —
// хронологически, текст — от А до Я), повторный клик меняет направление.
// Закреплённый «№» не сортируется (это просто номер строки на странице).
function headCellHTML(c, i, cols) {
  if (c.fixed) return `<th ${headAttrs(c)}>${colLabelHTML(c)}${resizeGripHTML(c, i === cols.length - 1)}</th>`;

  const active = state.sort.key === c.key;
  const arrow = active ? `<span class="col-sort-arrow">${state.sort.dir === 'desc' ? '▼' : '▲'}</span>` : '';
  return `<th ${headAttrs(c)} data-docs-sort="${c.key}" class="sortable ${active ? 'sorted' : ''}">
    <span class="col-label">${c.label}</span>${arrow}${resizeGripHTML(c, i === cols.length - 1)}
  </th>`;
}

function rowHTML(cols, doc, n) {
  return `<tr data-doc-row="${esc(doc.id)}">${cols.map((c) => cellHTML(c, doc, n)).join('')}</tr>`;
}

function listHTML() {
  const stats = documentStats();
  const offset = (state.page - 1) * state.pageSize;
  const { rows, total } = queryDocuments({
    q: state.q, type: state.type, status: state.status, sort: state.sort, offset, limit: state.pageSize,
  });
  const pageCount = Math.max(1, Math.ceil(total / state.pageSize));
  const cols = orderedColumns(DOCS_COLUMNS, docsColOrder);

  return `<div class="docs">
    <div class="docs-head"><h2>Документы</h2></div>

    <div class="docs-stats">
      <div class="docs-stat"><b>${stats.total}</b><span>Всего</span></div>
      <div class="docs-stat tone-ok"><b>${stats['Загружен'] || 0}</b><span>Загружен</span></div>
      <div class="docs-stat tone-good"><b>${stats['Проверен'] || 0}</b><span>Проверен</span></div>
      <div class="docs-stat tone-bad"><b>${stats['Нечитабелен'] || 0}</b><span>Нечитабелен</span></div>
      <div class="docs-stat tone-warn"><b>${stats['Не валиден'] || 0}</b><span>Не валиден</span></div>
    </div>

    <div class="docs-toolbar">
      <input class="input docs-search" data-docs-q value="${esc(state.q)}" autocomplete="off"
        placeholder="Поиск по номеру и дате документа">
      <select class="select docs-filter" data-docs-type>
        <option value="">Тип: все</option>
        ${DOC_TYPES.map((t) => `<option ${state.type === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
      </select>
      <select class="select docs-filter" data-docs-status>
        <option value="">Статус: все</option>
        ${DOC_STATUSES.map((s) => `<option ${state.status === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}
      </select>
      <span class="docs-count">${total} документов</span>
      <button class="btn btn-primary" data-docs-create>+ Создать документ</button>
    </div>

    <div class="docs-body">
      ${rows.length ? `<div class="docs-cols" data-docs-cols-box style="${columnVarsStyle(cols, docsColWidths)}">
        <table class="docs-tbl">
          ${colGroupHTML(cols, docsColWidths)}
          <thead><tr>${cols.map((c, i) => headCellHTML(c, i, cols)).join('')}</tr></thead>
          <tbody>${rows.map((d, i) => rowHTML(cols, d, offset + i + 1)).join('')}</tbody>
        </table>
      </div>` : `<div class="docs-empty">Ничего не найдено. Измените запрос или сбросьте фильтры.</div>`}
      <div class="docs-pager">
        <span>Стр. ${state.page} из ${pageCount}</span>
        <select class="select" data-docs-pagesize>
          ${[10, 25, 50, 100].map((n) => `<option value="${n}" ${state.pageSize === n ? 'selected' : ''}>${n} на странице</option>`).join('')}
        </select>
        <button class="btn btn-ghost btn-sm" data-docs-prev ${state.page <= 1 ? 'disabled' : ''}>‹</button>
        <button class="btn btn-ghost btn-sm" data-docs-next ${state.page >= pageCount ? 'disabled' : ''}>›</button>
      </div>
    </div>
  </div>`;
}

export function mountDocs(host) {
  const scope = host.scope;
  let route = host.route;
  document.body.dataset.page = 'docs';
  setActiveNav('docs');

  function render() {
    const id = route && route.id;

    if (id) {
      const doc = getDocument(id);
      if (!doc) {
        setCrumbs([{ label: 'Главная', to: MENU_HREF }, { label: 'Документы', to: DOCS_HREF }, { label: 'Не найден', current: true }]);
        scope.setHTML(`<div class="card card-pad">Документ не найден.
          <button class="btn btn-ghost btn-sm" data-docs-back-menu style="margin-left:10px">К документам</button></div>`);
        const b = scope.$('[data-docs-back-menu]');
        if (b) b.onclick = () => { location.hash = DOCS_HREF; };
        return;
      }

      setCrumbs([{ label: 'Главная', to: MENU_HREF }, { label: 'Документы', to: DOCS_HREF }, { label: doc.type || 'Документ', current: true }]);
      scope.setHTML(detailHTML(doc));
      bindDetail(scope, {
        doc, host,
        onBack: () => { location.hash = DOCS_HREF; },
        onChanged: render,
      });
      return;
    }

    setCrumbs([{ label: 'Главная', to: MENU_HREF }, { label: 'Документы', current: true }]);
    scope.setHTML(listHTML());
    bindList();
  }

  function bindList() {
    const q = scope.$('[data-docs-q]');
    if (q) {
      q.oninput = () => {
        state.q = q.value;
        state.page = 1;
        const pos = q.selectionStart;
        render();
        const again = scope.$('[data-docs-q]');
        if (again) { again.focus(); again.setSelectionRange(pos, pos); }
      };
    }

    const t = scope.$('[data-docs-type]');
    if (t) t.onchange = () => { state.type = t.value; state.page = 1; render(); };

    const s = scope.$('[data-docs-status]');
    if (s) s.onchange = () => { state.status = s.value; state.page = 1; render(); };

    scope.$$('[data-docs-sort]').forEach((th) => {
      th.addEventListener('click', (e) => {
        if (e.target.closest('[data-col-grip]')) return;
        const key = th.dataset.docsSort;
        state.sort = state.sort.key === key
          ? { key, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' }
          : { key, dir: 'asc' };
        render();
      });
    });

    const ps = scope.$('[data-docs-pagesize]');
    if (ps) ps.onchange = () => { state.pageSize = +ps.value; state.page = 1; render(); };

    const prev = scope.$('[data-docs-prev]');
    if (prev) prev.onclick = () => { if (state.page > 1) { state.page -= 1; render(); } };

    const next = scope.$('[data-docs-next]');
    if (next) next.onclick = () => { state.page += 1; render(); };

    scope.$$('[data-doc-row]').forEach((tr) => tr.onclick = () => {
      location.hash = DOCS_HREF + '/' + encodeURIComponent(tr.dataset.docRow);
    });

    const createBtn = scope.$('[data-docs-create]');
    if (createBtn) createBtn.onclick = () => openDocumentModal(host, { onSaved: render });

    bindColumnResize(scope, {
      rootSel: '[data-docs-cols-box]',
      cols: DOCS_COLUMNS,
      widths: docsColWidths,
      onCommit(patch) {
        Object.assign(docsColWidths, patch);
        const box = scope.$('[data-docs-cols-box]');
        if (box) Object.entries(docsColWidths).forEach(([k, v]) => box.style.setProperty('--cw-' + k, v + 'px'));
      },
    });

    bindColumnReorder(scope, {
      headSel: '[data-docs-cols-box] thead',
      order: docsColOrder,
      onCommit(order) {
        docsColOrder = normalizeOrder(DOCS_COLUMNS, order, DOCS_COLUMNS_DEFAULT);
        render();
      },
    });
  }

  render();

  return {
    onRoute(next) { route = next; render(); },
    destroy() {},
  };
}
