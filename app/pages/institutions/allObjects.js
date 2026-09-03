// Сводная вкладка учреждения: объекты самого узла И всех подведомственных,
// на любую глубину, с фильтрами по полям объекта оценки.
//
// Зачем отдельно от вкладки «Объекты оценки»: там показаны СВОИ объекты узла —
// то, что за ним закреплено. Здесь другой вопрос — «что вообще есть в сети
// этого министерства»: по крупному узлу нужно уметь спросить «все объекты в
// Бишкеке» или «все без движения больше 30 дней», не обходя подведы вручную
// (задача пользователя 03.09.2026).
//
// Фильтры повторяют реестр объектов оценки (pages/ocMenu): фасеты со
// счётчиками, поиск, «без движения», «только мои». Считаются они здесь по уже
// собранной выборке поддерева, а не запросом в модули: набор строк один и тот
// же для всех фасетов, и счётчики обязаны сходиться с таблицей.
import { esc } from '../../kernel/dom.js';
import { fmtEni, eniRegion } from '../../kernel/fmt.js';
import { session } from '../../kernel/session.js';
import {
  colGroupHTML, headAttrs, colLabelHTML, resizeGripHTML, columnVarsStyle,
} from '../../kernel/columns.js';

// Сумма закреплённых ширин держится в пределах того, что остаётся от колонки
// фильтров: иначе таблица уезжает под горизонтальную прокрутку прямо на
// широком экране. Адрес — резиновый (width:0), он забирает остаток.
export const ALL_COLUMNS = [
  { key: 'eni', label: 'ЕНИ', width: 132, minWidth: 122 },
  // Адрес — резиновый: остаток ширины его. Минимум крупный намеренно, иначе
  // при подгонке он сжимался до «г. …» и переставал быть адресом.
  { key: 'address', label: 'Адрес', width: 0, minWidth: 200 },
  { key: 'unit', label: 'Учреждение / подвед', width: 150, minWidth: 118 },
  { key: 'city', label: 'Город / район', width: 104, minWidth: 84 },
  { key: 'status', label: 'Статус', width: 152, minWidth: 118 },
  { key: 'type', label: 'Тип ОЦ', width: 140, minWidth: 104 },
  { key: 'oi', label: 'ОИ', width: 42, minWidth: 38 },
  { key: 'updatedAt', label: 'Обновлён', width: 94, minWidth: 88 },
];

// Пороги «без движения» — те же, что в реестре: неделя, месяц, квартал, год.
export const STALE_STEPS = [
  { days: 0, label: 'любое' },
  { days: 7, label: '> 7 дней' },
  { days: 30, label: '> 30 дней' },
  { days: 90, label: '> 90 дней' },
  { days: 365, label: '> года' },
];

const FACETS = [
  { key: 'type', label: 'Тип ОЦ' },
  { key: 'status', label: 'Статус' },
  { key: 'region', label: 'Область' },
  { key: 'city', label: 'Город / район' },
  { key: 'unit', label: 'Учреждение / подвед' },
  { key: 'insp', label: 'Осмотрщик' },
];

const FACET_KEYS = FACETS.map((f) => f.key);

export function emptyAllFilter() {
  return {
    q: '',
    type: [], status: [], region: [], city: [], unit: [], insp: [],
    staleDays: 0,
    mine: false,
    open: { type: true, status: true, region: false, city: false, unit: false, insp: false },
    search: {},          // поиск внутри фасета: { city: 'биш' }
    panel: true,         // раскрыта ли колонка фильтров
  };
}

export function isAllFilterEmpty(f) {
  return !f.q && !f.staleDays && !f.mine && FACET_KEYS.every((k) => !f[k].length);
}

// --- значения полей --------------------------------------------------------

// Значение фасета у строки. Учреждение берём по узлу дерева (nodeName), а не
// по полю institution записи: на глубине больше двух уровней запись числится
// за верхним учреждением, а закреплена за подведом.
function valueOf(row, key) {
  if (key === 'type') return row.typeLabel || '';
  if (key === 'status') return row.status || '';
  if (key === 'region') return eniRegion(row.eni) || '';
  if (key === 'city') return row.city || '';
  if (key === 'unit') return row.nodeName || row.podved || row.institution || '';
  if (key === 'insp') return (row.resp || {}).insp || '';
  return '';
}

// Дней без изменений. Дата обновления хранится строкой ГГГГ-ММ-ДД.
function daysSince(iso) {
  if (!iso) return Infinity;
  const t = Date.parse(String(iso).slice(0, 10));
  if (isNaN(t)) return Infinity;
  return Math.floor((Date.now() - t) / 86400000);
}

function matchQ(row, q) {
  if (!q) return true;
  const hay = [row.eni, row.title, row.city, row.status, row.typeLabel,
    row.institution, row.podved, row.nodeName, ...Object.values(row.resp || {})]
    .filter(Boolean).join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

function isMine(row) {
  const me = session.state.person;
  if (!me) return false;
  return Object.values(row.resp || {}).some((x) => x === me);
}

// Фильтр без одного поля — нужен для счётчиков фасета: если считать с учётом
// самого фасета, после первого выбора остальные варианты в нём обнуляются.
function passes(row, f, skipKey) {
  if (!matchQ(row, f.q)) return false;
  if (f.mine && !isMine(row)) return false;
  if (f.staleDays && daysSince(row.updatedAt) < f.staleDays) return false;

  return FACET_KEYS.every((k) => {
    if (k === skipKey || !f[k].length) return true;
    return f[k].includes(valueOf(row, k));
  });
}

export function applyAllFilter(rows, f) {
  return rows.filter((r) => passes(r, f, null));
}

function countsFor(rows, f, key) {
  const counts = {};
  rows.forEach((r) => {
    if (!passes(r, f, key)) return;
    const v = valueOf(r, key);
    if (!v) return;
    counts[v] = (counts[v] || 0) + 1;
  });
  return counts;
}

// --- разметка --------------------------------------------------------------

function facetHTML(rows, f, { key, label }) {
  const counts = countsFor(rows, f, key);
  const picked = f[key];
  const q = (f.search[key] || '').toLowerCase();

  let items = Object.keys(counts)
    .map((v) => ({ v, n: counts[v] }))
    .filter((e) => !q || e.v.toLowerCase().includes(q));

  items.sort((a, b) => (b.n - a.n) || a.v.localeCompare(b.v, 'ru'));
  // Выбранное всегда видно, даже если ушло за предел показа.
  items.sort((a, b) => (picked.includes(b.v) ? 1 : 0) - (picked.includes(a.v) ? 1 : 0));

  const shown = items.slice(0, 12);
  const open = f.open[key];

  return `<div class="iall-facet ${open ? 'open' : ''}">
    <button class="iall-facet-head" data-all-facet="${esc(key)}">
      <span class="chev">▾</span>
      <span>${esc(label)}</span>
      ${picked.length ? `<b>${picked.length}</b>` : ''}
    </button>
    ${open ? `<div class="iall-facet-body">
      ${items.length > 8 ? `<input class="iall-facet-q" data-all-facet-q="${esc(key)}"
        value="${esc(f.search[key] || '')}" placeholder="Найти…" autocomplete="off">` : ''}
      ${shown.length ? shown.map((e) => `<label class="iall-opt ${picked.includes(e.v) ? 'on' : ''}">
        <input type="checkbox" data-all-pick="${esc(key)}" value="${esc(e.v)}"
          ${picked.includes(e.v) ? 'checked' : ''}>
        <span class="iall-opt-l" title="${esc(e.v)}">${esc(e.v)}</span>
        <span class="iall-opt-n">${e.n}</span>
      </label>`).join('') : '<div class="iall-none">нет значений</div>'}
      ${items.length > shown.length
        ? `<div class="iall-more">ещё ${items.length - shown.length} — уточните поиском</div>` : ''}
    </div>` : ''}
  </div>`;
}

function chipsHTML(f) {
  const chips = [];
  FACET_KEYS.forEach((k) => f[k].forEach((v) => {
    chips.push(`<button class="iall-chip" data-all-unpick="${esc(k)}|${esc(v)}"
      title="Убрать из фильтра">${esc(v)}<span>×</span></button>`);
  }));
  if (f.staleDays) {
    const step = STALE_STEPS.find((s) => s.days === f.staleDays);
    chips.push(`<button class="iall-chip" data-all-stale="0" title="Убрать из фильтра">без движения ${
      esc(step ? step.label : f.staleDays + ' дн.')}<span>×</span></button>`);
  }
  if (f.mine) chips.push('<button class="iall-chip" data-all-mine title="Убрать из фильтра">только мои<span>×</span></button>');

  if (!chips.length) return '';
  return `<div class="iall-chips">${chips.join('')}
    <button class="iall-reset" data-all-reset>Сбросить всё</button></div>`;
}

function cellHTML(col, row) {
  if (col.key === 'eni') return `<td class="mono">${esc(fmtEni(row.eni))}</td>`;
  if (col.key === 'address') return `<td><span class="ell" title="${esc(row.title || '')}">${esc(row.title || '—')}</span></td>`;
  if (col.key === 'unit') return `<td><span class="ell" title="${esc(valueOf(row, 'unit'))}">${esc(valueOf(row, 'unit') || '—')}</span></td>`;
  if (col.key === 'city') return `<td><span class="ell" title="${esc(row.city || '')}">${esc(row.city || '—')}</span></td>`;
  if (col.key === 'status') return `<td><span class="itag">${esc(row.status || '—')}</span></td>`;
  if (col.key === 'type') return `<td><span class="ell" title="${esc(row.typeLabel || '')}">${esc(row.typeLabel || '—')}</span></td>`;
  if (col.key === 'oi') return `<td class="num">${row.metrics ? row.metrics.oiCount : '—'}</td>`;
  if (col.key === 'updatedAt') {
    const d = daysSince(row.updatedAt);
    const stale = d >= 90 ? ' stale' : '';
    return `<td class="mono${stale}" title="${d === Infinity ? 'дата не указана' : 'без движения ' + d + ' дн.'}">${esc(row.updatedAt || '—')}</td>`;
  }
  return '<td></td>';
}

// rows — вся выборка поддерева, f — фильтр, widths — ширины столбцов.
export function allPaneHTML(rows, f, widths) {
  const found = applyAllFilter(rows, f);

  const facets = `<div class="iall-facets">
    <div class="iall-facets-head">
      <b>Фильтры</b>
      <button class="idoc-list-hide" data-all-panel-close title="Свернуть фильтры">‹</button>
    </div>
    <div class="iall-facets-body">
      <label class="iall-flag ${f.mine ? 'on' : ''}">
        <input type="checkbox" data-all-mine-box ${f.mine ? 'checked' : ''}>
        <span>Только мои</span>
      </label>
      <div class="iall-stale">
        <span class="iall-stale-l">Без движения</span>
        <select class="select" data-all-stale-sel>
          ${STALE_STEPS.map((s) => `<option value="${s.days}" ${s.days === f.staleDays ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}
        </select>
      </div>
      ${FACETS.map((sec) => facetHTML(rows, f, sec)).join('')}
    </div>
  </div>`;

  const table = found.length
    ? `<div class="icols" data-all-cols-box style="${columnVarsStyle(ALL_COLUMNS, widths)}">
        <table class="itbl">
          ${colGroupHTML(ALL_COLUMNS, widths)}
          <thead><tr>${ALL_COLUMNS.map((c, i) => `<th ${headAttrs(c)}>
            ${colLabelHTML(c)}${resizeGripHTML(c, i === ALL_COLUMNS.length - 1)}
          </th>`).join('')}</tr></thead>
          <tbody>${found.map((r) => `<tr data-all-row="${esc(r.typeId)}|${esc(r.id)}|${esc(r.nodeId || '')}">
            ${ALL_COLUMNS.map((c) => cellHTML(c, r)).join('')}
          </tr>`).join('')}</tbody>
        </table>
      </div>`
    : `<div class="iempty">
        <b>${rows.length ? 'Под фильтр ничего не подошло' : 'Объектов нет'}</b>
        <span>${rows.length
          ? 'Снимите часть условий — счётчики у фасетов показывают, что останется.'
          : 'Ни за этим учреждением, ни за подведомственными объекты не закреплены.'}</span>
      </div>`;

  return `<div class="iall ${f.panel ? '' : 'closed'}">
    ${f.panel ? facets : `<button class="idocs-tab" data-all-panel-open title="Показать фильтры">
        <span>Фильтры${isAllFilterEmpty(f) ? '' : ' ·'}</span>
      </button>`}
    <div class="iall-main">
      <div class="iall-tools">
        <span class="isearch">
          <svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true">
            <circle cx="6" cy="6" r="4.1" fill="none" stroke="currentColor" stroke-width="1.4"/>
            <path d="M9.2 9.2 12.4 12.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
          <input data-all-q value="${esc(f.q)}" autocomplete="off"
            placeholder="Поиск по ЕНИ, адресу, статусу, людям">
          ${f.q ? '<button class="isearch-clear" data-all-q-clear title="Очистить">×</button>' : ''}
        </span>
        <span class="iall-count">${found.length} из ${rows.length}</span>
      </div>
      ${chipsHTML(f)}
      ${table}
    </div>
  </div>`;
}

// Обработчики. render() перерисовывает страницу целиком — как и остальные
// вкладки раздела, поэтому после набора в поле поиска фокус и каретку
// возвращаем руками: тот же приём, что у поиска по дереву.
function keepFocus(scope, sel, render) {
  const el = scope.$(sel);
  const pos = el ? el.selectionStart : 0;
  render();
  const again = scope.$(sel);
  if (again) { again.focus(); again.setSelectionRange(pos, pos); }
}

export function bindAllPane(scope, { filter, render, openRow }) {
  const f = filter;

  const q = scope.$('[data-all-q]');
  if (q) {
    q.oninput = () => { f.q = q.value; keepFocus(scope, '[data-all-q]', render); };
  }
  const qClear = scope.$('[data-all-q-clear]');
  if (qClear) qClear.onclick = () => { f.q = ''; render(); };

  scope.$$('[data-all-facet]').forEach((b) => b.onclick = () => {
    const key = b.dataset.allFacet;
    f.open[key] = !f.open[key];
    render();
  });

  scope.$$('[data-all-facet-q]').forEach((inp) => inp.oninput = () => {
    const key = inp.dataset.allFacetQ;
    f.search[key] = inp.value;
    keepFocus(scope, `[data-all-facet-q="${key}"]`, render);
  });

  scope.$$('[data-all-pick]').forEach((c) => c.onchange = () => {
    const key = c.dataset.allPick;
    const v = c.value;
    f[key] = c.checked ? [...f[key], v] : f[key].filter((x) => x !== v);
    render();
  });

  scope.$$('[data-all-unpick]').forEach((b) => b.onclick = () => {
    const [key, v] = b.dataset.allUnpick.split('|');
    f[key] = f[key].filter((x) => x !== v);
    render();
  });

  const stale = scope.$('[data-all-stale-sel]');
  if (stale) stale.onchange = () => { f.staleDays = +stale.value || 0; render(); };

  const staleChip = scope.$('[data-all-stale]');
  if (staleChip) staleChip.onclick = () => { f.staleDays = 0; render(); };

  const mineBox = scope.$('[data-all-mine-box]');
  if (mineBox) mineBox.onchange = () => { f.mine = mineBox.checked; render(); };

  const mineChip = scope.$('[data-all-mine]');
  if (mineChip) mineChip.onclick = () => { f.mine = false; render(); };

  const reset = scope.$('[data-all-reset]');
  if (reset) reset.onclick = () => {
    const fresh = emptyAllFilter();
    Object.assign(f, fresh, { open: f.open, panel: f.panel });
    render();
  };

  const close = scope.$('[data-all-panel-close]');
  if (close) close.onclick = () => { f.panel = false; render(); };
  const open = scope.$('[data-all-panel-open]');
  if (open) open.onclick = () => { f.panel = true; render(); };

  scope.$$('[data-all-row]').forEach((tr) => tr.onclick = () => {
    const [typeId, id, nodeId] = tr.dataset.allRow.split('|');
    openRow(typeId, id, nodeId);
  });
}
