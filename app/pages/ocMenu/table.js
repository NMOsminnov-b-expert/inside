import { esc } from '../../kernel/dom.js';
import { fmt } from '../../kernel/fmt.js';
import { COLUMNS } from './state.js';

const STAGE_INDEX = new Map([
  'В заполнении',
  'Удостоверен по документам',
  'Осмотрен',
  'Удостоверен после осмотра',
  'На юридической экспертизе',
].map((s, i) => [s, i]));

// Виртуализированная таблица: в DOM живут только видимые строки,
// запрос идёт ровно за тот срез, который сейчас на экране.
export const ROW_H = { compact: 30, normal: 38 };

function cell(col, s) {
  switch (col.key) {
    case 'eni': return `<span class="mono">${esc(s.eni)}</span>`;
    case 'title': return `<span class="reg-cell-title">
      <span class="reg-ico">${esc(s.typeIcon)}</span>
      <span class="ell">${esc(s.title)}</span>
      ${s.flags.pendingNotes ? '<span class="reg-badge notes" title="есть невыполненные заметки">⚑</span>' : ''}
      ${s.flags.defects ? '<span class="reg-badge warn" title="расхождение ТП и фото">⚠</span>' : ''}
      ${s.flags.mlUnverified ? '<span class="reg-badge ml" title="импорт ML без проверки">ML</span>' : ''}
    </span>`;
    case 'status': return `<span class="reg-status st-${STAGE_INDEX.get(s.status) ?? 9}"><i></i><span class="ell">${esc(s.status)}</span></span>`;
    case 'area': return s.metrics.area ? fmt(s.metrics.area) : '—';
    case 'oiCount': return String(s.metrics.oiCount);
    case 'photos': return String(s.metrics.photos);
    case 'docs': return String(s.metrics.docs);
    case 'notes': return s.metrics.pendingNotes
      ? `<span class="pill-mini pill-pend">${s.metrics.pendingNotes}</span>`
      : '<span class="muted">—</span>';
    case 'insp': return `<span class="ell">${esc(s.resp.insp || '—')}</span>`;
    case 'appr': return `<span class="ell">${esc(s.resp.appr || '—')}</span>`;
    case 'typeLabel': return `<span class="ell">${esc(s.typeLabel)}</span>`;
    case 'institution': return `<span class="ell">${esc(s.institution || '—')}</span>`;
    case 'city': return `<span class="ell">${esc(s.city || '—')}</span>`;
    case 'updatedAt': return esc(s.updatedAt || '—');
    default: return '';
  }
}

export function activeColumns(state) {
  return COLUMNS.filter((c) => state.columns.includes(c.key));
}

export function tableHeadHTML(state) {
  const cols = activeColumns(state);

  return `<div class="reg-thead">
    <div class="reg-th check"><input type="checkbox" data-select-page title="Выбрать страницу"></div>
    ${cols.map((c) => `<div class="reg-th ${c.align === 'right' ? 'right' : ''} ${c.sort ? 'sortable' : ''}"
      style="${c.width ? `width:${c.width}px;flex:0 1 ${c.width}px` : 'flex:1 1 240px;min-width:190px'}"
      ${c.sort ? `data-sort="${esc(c.sort)}"` : ''}>
      ${esc(c.label)}
      ${state.sort.key === c.sort ? `<span class="reg-sort">${state.sort.dir === 'asc' ? '▲' : '▼'}</span>` : ''}
    </div>`).join('')}
  </div>`;
}

export function rowsHTML(state, rows, startIndex) {
  const cols = activeColumns(state);

  return rows.map((s, i) => `<div class="reg-tr ${state.selected.has(s.id) ? 'sel' : ''} ${state.previewId === s.id ? 'peek' : ''}"
    data-row="${esc(s.typeId)}|${esc(s.id)}" data-index="${startIndex + i}" tabindex="-1">
    <div class="reg-td check"><input type="checkbox" data-select="${esc(s.id)}" ${state.selected.has(s.id) ? 'checked' : ''}></div>
    ${cols.map((c) => `<div class="reg-td ${c.align === 'right' ? 'right' : ''} ${c.mono ? 'mono' : ''}"
      style="${c.width ? `width:${c.width}px;flex:0 1 ${c.width}px` : 'flex:1 1 240px;min-width:190px'}">${cell(c, s)}</div>`).join('')}
  </div>`).join('');
}

export function tableShellHTML(state) {
  return `${tableHeadHTML(state)}
    <div class="reg-viewport" data-viewport>
      <div class="reg-spacer" data-spacer></div>
      <div class="reg-rows" data-rows></div>
    </div>`;
}

// Значение ячейки в виде простого текста — для выгрузки в Excel.
function plain(col, s) {
  switch (col.key) {
    case 'eni': return s.eni;
    case 'title': return s.title;
    case 'typeLabel': return s.typeLabel;
    case 'status': return s.status;
    case 'institution': return s.institution;
    case 'city': return s.city;
    case 'area': return s.metrics.area ? String(s.metrics.area).replace('.', ',') : '';
    case 'oiCount': return String(s.metrics.oiCount);
    case 'photos': return String(s.metrics.photos);
    case 'docs': return String(s.metrics.docs);
    case 'notes': return String(s.metrics.pendingNotes);
    case 'insp': return s.resp.insp || '';
    case 'appr': return s.resp.appr || '';
    case 'updatedAt': return s.updatedAt || '';
    default: return '';
  }
}

// CSV с «;» и BOM — так Excel в русской локали открывает файл без импорта.
export function csvOf(state, rows) {
  const cols = activeColumns(state);
  const cell = (v) => (/[";\n]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : v);

  const head = cols.map((c) => cell(c.label)).join(';');
  const body = rows.map((s) => cols.map((c) => cell(plain(c, s))).join(';'));

  return [head, ...body].join('\r\n');
}

export function columnsMenuHTML(state) {
  return `<div class="dd-group">Столбцы</div>
    ${COLUMNS.map((c) => `<label class="reg-col-opt">
      <input type="checkbox" data-column="${esc(c.key)}" ${state.columns.includes(c.key) ? 'checked' : ''}>
      ${esc(c.label)}
    </label>`).join('')}`;
}
