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
import {
  DOC_TYPES, DOC_STATUSES, queryDocuments, documentStats, statusTone, getDocument,
  documentInstitutions,
} from '../../kernel/documentsRegistry.js';
import { openDocumentModal } from './create.js';
import { detailHTML, bindDetail } from './detail.js';

const state = {
  q: '', type: '', status: '', institution: '', dateFrom: '', dateTo: '',
  sort: '', dir: 'asc', page: 1, pageSize: 25,
};

// Есть ли что сбрасывать: кнопка сброса появляется только когда фильтр реально
// сужает список, иначе она просто занимает место.
const hasFilters = () => !!(state.q || state.type || state.status || state.institution
  || state.dateFrom || state.dateTo);

// Столбцы можно и тянуть за перегородку (ширина), и перетаскивать за шапку
// (порядок) — тот же механизм, что в реестре ОЦ и перечне ОИ (kernel/columns.js).
// Закреплён только «№»: он не двигается и не участвует в перестановке.
const DOCS_COLUMNS = [
  { key: 'idx', label: '№', width: 46, minWidth: 40, fixed: true },
  { key: 'type', label: 'Тип', width: 150, minWidth: 100 },
  // Ширина числом, а не «резинкой» (width:0): колонок стало больше, и остаток
  // на узком экране уходил в минус — table-layout:fixed ломал раскладку.
  // Вместо сжатия таблица получает горизонтальную прокрутку (docs.css).
  { key: 'name', label: 'Наименование', width: 220, minWidth: 140 },
  { key: 'number', label: '№ документа', width: 130, minWidth: 90 },
  { key: 'date', label: 'Дата документа', width: 130, minWidth: 100 },
  { key: 'institution', label: 'От кого', width: 220, minWidth: 140 },
  // Столбцы из ветки kirill (Кирилл, 03.09.2026): регистрация документа и
  // принадлежность.
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

// Склонение при числе: «1 документ», «2 документа», «19 документов».
function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

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
  // .ell — display:block, поэтому её нельзя вешать прямо на <td>: это снимает
  // с ячейки display:table-cell, и несколько таких ячеек подряд складываются
  // друг под другом вместо колонок (проявилось, как только рядом встали три
  // новые колонки). Всегда через внутренний <span>.
  if (col.key === 'institution') return `<td><span class="ell" title="${esc(doc.institution || '')}">${esc(doc.institution || '—')}</span></td>`;
  if (col.key === 'regAuthority') return `<td><span class="ell" title="${esc(doc.regAuthority || '')}">${esc(doc.regAuthority || '—')}</span></td>`;
  if (col.key === 'regDate') return `<td>${esc(doc.regDate || '—')}</td>`;
  if (col.key === 'affiliation') return `<td><span class="ell" title="${esc(doc.affiliation || '')}">${esc(doc.affiliation || '—')}</span></td>`;
  if (col.key === 'status') return `<td><span class="docs-status ${statusTone(doc.status)}">${esc(doc.status)}</span></td>`;
  return '<td></td>';
}

function rowHTML(cols, doc, n) {
  return `<tr data-doc-row="${esc(doc.id)}">${cols.map((c) => cellHTML(c, doc, n)).join('')}</tr>`;
}

function listHTML() {
  const stats = documentStats();
  const offset = (state.page - 1) * state.pageSize;
  const { rows, total } = queryDocuments({
    q: state.q, type: state.type, status: state.status, institution: state.institution,
    dateFrom: state.dateFrom, dateTo: state.dateTo,
    sort: state.sort, dir: state.dir, offset, limit: state.pageSize,
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
      <span class="docs-search">
        <svg class="docs-search-ico" viewBox="0 0 14 14" width="13" height="13" aria-hidden="true">
          <circle cx="6" cy="6" r="4.1" fill="none" stroke="currentColor" stroke-width="1.4"/>
          <path d="M9.2 9.2 12.4 12.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
        <input data-docs-q value="${esc(state.q)}" autocomplete="off"
          placeholder="Поиск: тип, наименование, номер, дата, от кого">
        ${state.q ? '<button class="docs-search-clear" data-docs-q-clear title="Очистить">×</button>' : ''}
      </span>

      <select class="select docs-filter" data-docs-type>
        <option value="">Тип: все</option>
        ${DOC_TYPES.map((t) => `<option ${state.type === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
      </select>

      <select class="select docs-filter" data-docs-status>
        <option value="">Статус: все</option>
        ${DOC_STATUSES.map((s) => `<option ${state.status === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}
      </select>

      <select class="select docs-filter wide" data-docs-inst>
        <option value="">От кого: все</option>
        ${documentInstitutions().map((i) => `<option ${state.institution === i ? 'selected' : ''}>${esc(i)}</option>`).join('')}
      </select>

      <span class="docs-period" title="Дата документа">
        <i>Дата</i>
        <input type="date" class="input" data-docs-from value="${esc(state.dateFrom)}">
        <span>—</span>
        <input type="date" class="input" data-docs-to value="${esc(state.dateTo)}">
      </span>

      ${hasFilters() ? '<button class="btn btn-ghost btn-sm" data-docs-reset>Сбросить</button>' : ''}
      <span class="docs-count">${total} ${plural(total, 'документ', 'документа', 'документов')}</span>
      <button class="btn btn-primary" data-docs-create>+ Создать документ</button>
    </div>

    <div class="docs-body">
      ${rows.length ? `<div class="docs-cols" data-docs-cols-box style="${columnVarsStyle(cols, docsColWidths)}">
        <table class="docs-tbl">
          ${colGroupHTML(cols, docsColWidths)}
          <thead><tr>${cols.map((c, i) => `<th ${headAttrs(c)}
            ${c.key === 'idx' ? '' : `data-docs-sort="${c.key}"`}
            class="${state.sort === c.key ? 'sorted ' + state.dir : ''}">
            ${colLabelHTML(c)}${c.key === 'idx' ? '' : `<span class="docs-sort-mark">${
              state.sort === c.key ? (state.dir === 'asc' ? '▲' : '▼') : ''}</span>`}
            ${resizeGripHTML(c, i === cols.length - 1)}
          </th>`).join('')}</tr></thead>
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


// Соседние документы — те, между которыми человек и переключается: если пришли
// из учреждения, это его документы, иначе — текущая выборка реестра с её
// фильтрами. Без этого из карточки приходилось возвращаться в список ради
// каждого следующего документа.
function siblingsFor(doc, route) {
  const q = (route && route.query) || {};

  const filter = q.from === 'inst' && q.name
    ? { institution: q.name, limit: 200 }
    : {
      q: state.q, type: state.type, status: state.status, institution: state.institution,
      dateFrom: state.dateFrom, dateTo: state.dateTo, sort: state.sort, dir: state.dir,
      limit: 200,
    };

  const { rows } = queryDocuments(filter);
  const list = rows.length ? rows : [doc];
  const index = Math.max(0, list.findIndex((d) => d.id === doc.id));

  return { list, index, scope: q.from === 'inst' ? (q.name || 'учреждение') : 'реестр' };
}

export function mountDocs(host) {
  const scope = host.scope;
  let route = host.route;
  document.body.dataset.page = 'docs';
  // Стили просмотрщика лежат отдельно: он общий с разделом «Учреждения».
  host.ensureStyle('./app/kernel/docViewer.css');

  // Подсвечиваем тот раздел, из которого пришли: документ, открытый из
  // учреждения, принадлежит его контексту — путь и возврат ведут туда же.
  const cameFromInst = !!(host.route && host.route.query && host.route.query.from === 'inst');
  setActiveNav(cameFromInst ? 'inst' : 'docs');

  // Фильтр из адреса: из раздела «Учреждения» сюда приходят ссылкой
  // #/docs?institution=<название>, как в реестре объектов оценки.
  if (route && route.query && route.query.institution) {
    state.institution = route.query.institution;
    state.page = 1;
  }

  function render() {
    const id = route && route.id;
    const fromInst = !!(route && route.query && route.query.from === 'inst');
    setActiveNav(fromInst ? 'inst' : 'docs');

    if (id) {
      const doc = getDocument(id);
      if (!doc) {
        setCrumbs([...host.originCrumbs('docs'), { label: 'Не найден', current: true }]);
        scope.setHTML(`<div class="card card-pad">Документ не найден.
          <button class="btn btn-ghost btn-sm" data-docs-back-menu style="margin-left:10px">К документам</button></div>`);
        const b = scope.$('[data-docs-back-menu]');
        if (b) b.onclick = () => { location.hash = DOCS_HREF; };
        return;
      }

      // Откуда пришли — туда и вернёмся: из учреждения путь идёт через него,
      // из реестра — как раньше. Начало крошек и адрес возврата даёт ядро.
      setCrumbs([...host.originCrumbs('docs'), { label: doc.type || 'Документ', current: true }]);

      const siblings = siblingsFor(doc, route);
      scope.setHTML(detailHTML(doc, siblings));
      bindDetail(scope, {
        doc, host, siblings,
        onBack: () => { location.hash = host.backHref('docs'); },
        onOpen: (id) => {
          const q = route && route.query ? route.query : {};
          const tail = q.from === 'inst'
            ? `?from=inst&node=${encodeURIComponent(q.node || '')}&name=${encodeURIComponent(q.name || '')}`
            : '';
          location.hash = DOCS_HREF + '/' + encodeURIComponent(id) + tail;
        },
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

    const inst = scope.$('[data-docs-inst]');
    if (inst) inst.onchange = () => { state.institution = inst.value; state.page = 1; render(); };

    const from = scope.$('[data-docs-from]');
    if (from) from.onchange = () => { state.dateFrom = from.value; state.page = 1; render(); };

    const to = scope.$('[data-docs-to]');
    if (to) to.onchange = () => { state.dateTo = to.value; state.page = 1; render(); };

    const qClear = scope.$('[data-docs-q-clear]');
    if (qClear) qClear.onclick = () => { state.q = ''; state.page = 1; render(); };

    const reset = scope.$('[data-docs-reset]');
    if (reset) reset.onclick = () => {
      state.q = '';
      state.type = '';
      state.status = '';
      state.institution = '';
      state.dateFrom = '';
      state.dateTo = '';
      state.page = 1;
      render();
    };

    // Сортировка по столбцу: первый клик — по возрастанию, повторный
    // разворачивает, третий снимает сортировку и возвращает исходный порядок.
    scope.$$('[data-docs-sort]').forEach((th) => th.onclick = (e) => {
      if (e.target.closest('[data-col-grip]')) return;
      const key = th.dataset.docsSort;
      if (state.sort !== key) { state.sort = key; state.dir = 'asc'; }
      else if (state.dir === 'asc') state.dir = 'desc';
      else { state.sort = ''; state.dir = 'asc'; }
      state.page = 1;
      render();
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
