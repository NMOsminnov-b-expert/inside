import { flagBadgesHTML, activeBadges } from '../../kernel/flagBadges.js';
import { esc } from '../../kernel/dom.js';
import { fmtNum, fmtInt, fmtEni } from '../../kernel/fmt.js';
import {
  orderedColumns, cellStyle, columnVarsStyle, headAttrs, resizeGripHTML,
  colLabelHTML, columnsMenuHTML as kernelColumnsMenuHTML,
} from '../../kernel/columns.js';
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
// Высота строки одна — без сжатого режима: реже устаёшь от чтения.
export const ROW_H = 38;

// Список значений в одну строку: полностью — в подсказке (Л1.4).
function listCell(list) {
  const arr = (list || []).filter(Boolean);
  if (!arr.length) return '<span class="muted">—</span>';
  return `<span class="ell" title="${esc(arr.join(', '))}">${esc(arr.join(', '))}</span>`;
}

// Теги вынесены в свой столбец (Л1.10). Пока это те же признаки записи, что
// раньше жили значками в столбце адреса; окончательный состав тегов — на
// согласовании (вопрос 2.3 в docs/tz/90-na-soglasovanie.md).
function tagsCell(flags) {
  // Набор и вид значков общие с карточками (kernel/flagBadges.js): держать
  // здесь свою копию значило получить два разных набора при первой же правке.
  return flagBadgesHTML(flags) || '<span class="muted">—</span>';
}

function cell(col, s) {
  switch (col.key) {
    // Коды записи и её объектов имущества — одной строкой, свёрнутые по общему
    // началу. Что не влезло, сокращается многоточием, полное значение в
    // подсказке (решение пользователя 05.09.2026).
    case 'eni': {
      const codes = s.eniAll || fmtEni(s.eni);
      return `<span class="mono ell" title="${esc(codes)}">${esc(codes)}</span>`;
    }
    case 'title': return `<span class="reg-cell-title">
      <span class="reg-ico">${esc(s.typeIcon)}</span>
      <span class="ell" title="${esc(s.title)}">${esc(s.title)}</span>
      ${flagBadgesHTML(s.flags)}
    </span>`;
    case 'status': return `<span class="reg-status st-${STAGE_INDEX.get(s.status) ?? 9}"><i></i><span class="ell" title="${esc(s.status)}">${esc(s.status)}</span></span>`;
    case 'area': return s.metrics.area ? fmtNum(s.metrics.area) : '—';
    case 'oiCount': return fmtInt(s.metrics.oiCount);
    case 'photos': return fmtInt(s.metrics.photos);
    case 'docs': return fmtInt(s.metrics.docs);
    case 'notes': return s.metrics.pendingNotes
      ? `<span class="pill-mini pill-pend">${s.metrics.pendingNotes}</span>`
      : '<span class="muted">—</span>';
    case 'insp': return `<span class="ell" title="${esc(s.resp.insp || '')}">${esc(s.resp.insp || '—')}</span>`;
    case 'appr': return `<span class="ell" title="${esc(s.resp.appr || '')}">${esc(s.resp.appr || '—')}</span>`;
    case 'typeLabel': return `<span class="ell" title="${esc(s.typeLabel)}">${esc(s.typeLabel)}</span>`;
    case 'institution': return `<span class="ell" title="${esc(s.institution || '')}">${esc(s.institution || '—')}</span>`;
    case 'city': return `<span class="ell" title="${esc(s.city || '')}">${esc(s.city || '—')}</span>`;
    case 'landKind': return s.landKind
      ? `<span class="tag-mini">${esc(s.landKind)}</span>`
      : '<span class="muted">—</span>';
    case 'updatedAt': return `<span class="ell" title="${esc(s.updatedAt || '')}">${esc(s.updatedAt || '—')}</span>`;
    case 'podved': return `<span class="ell" title="${esc(s.podved || '')}">${esc(s.podved || '—')}</span>`;
    case 'landArea': return s.metrics.landArea ? fmtNum(s.metrics.landArea) : '—';
    case 'owners': return listCell(s.owners);
    case 'users': return listCell(s.users);
    case 'tags': return tagsCell(s.flags);
    default: return '';
  }
}

// Порядок показа задаёт state.columns, а не порядок описаний в COLUMNS —
// иначе перетаскивание столбцов не имело бы смысла (kernel/columns.js).
export function activeColumns(state) {
  return orderedColumns(COLUMNS, state.columns);
}

// Ширины объявляются переменными на контейнере таблицы: при растягивании
// мышью меняется одно свойство, и строки его подхватывают без перерисовки —
// на 20 000 записей это принципиально (см. kernel/columns.js).
export function tableVarsStyle(state) {
  return columnVarsStyle(activeColumns(state), state.colWidths);
}

export function tableHeadHTML(state) {
  const cols = activeColumns(state);

  return `<div class="reg-thead">
    <div class="reg-th check"><input type="checkbox" data-select-page title="Выбрать страницу"></div>
    ${cols.map((c, i) => `<div class="reg-th ${c.align === 'right' ? 'right' : ''} ${c.sort ? 'sortable' : ''}"
      style="${cellStyle(c, state.colWidths)}" ${headAttrs(c)}
      ${c.sort ? `data-sort="${esc(c.sort)}"` : ''}
      title="${esc(c.label)}${c.sort ? ' — клик сортирует' : ''}; перетащите, чтобы переставить">
      ${colLabelHTML(c)}
      ${state.sort.key === c.sort ? `<span class="reg-sort">${state.sort.dir === 'asc' ? '▲' : '▼'}</span>` : ''}
      ${resizeGripHTML(c, i === cols.length - 1)}
    </div>`).join('')}
  </div>`;
}

export function rowsHTML(state, rows, startIndex) {
  const cols = activeColumns(state);

  return rows.map((s, i) => `<div class="reg-tr ${state.selected.has(s.id) ? 'sel' : ''} ${state.previewId === s.id ? 'peek' : ''}"
    data-row="${esc(s.typeId)}|${esc(s.id)}" data-index="${startIndex + i}" tabindex="-1">
    <div class="reg-td check"><input type="checkbox" data-select="${esc(s.id)}" ${state.selected.has(s.id) ? 'checked' : ''}></div>
    ${cols.map((c) => `<div class="reg-td ${c.align === 'right' ? 'right' : ''} ${c.mono ? 'mono' : ''}"
      style="${cellStyle(c, state.colWidths)}">${cell(c, s)}</div>`).join('')}
  </div>`).join('');
}

// Значение ячейки в виде простого текста — для выгрузки в Excel.
// Без разделителей разрядов: с ними Excel не разберёт число.
function plain(col, s) {
  switch (col.key) {
    case 'eni': return s.eni;
    case 'title': return s.title;
    case 'typeLabel': return s.typeLabel;
    case 'status': return s.status;
    case 'institution': return s.institution;
    case 'city': return s.city;
    case 'landKind': return s.landKind || '';
    case 'podved': return s.podved || '';
    case 'landArea': return s.metrics.landArea ? String(s.metrics.landArea).replace('.', ',') : '';
    case 'owners': return (s.owners || []).join(', ');
    case 'users': return (s.users || []).join(', ');
    case 'tags': return activeBadges(s.flags).map((f) => f.title).join(', ');
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
// Столбцы и их порядок — те, что на экране: выгружается то, что видно.
export function csvOf(state, rows) {
  const cols = activeColumns(state);
  const cell = (v) => (/[";\n]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : v);

  const head = cols.map((c) => cell(c.label)).join(';');
  const body = rows.map((s) => cols.map((c) => cell(plain(c, s))).join(';'));

  return [head, ...body].join('\r\n');
}

export function columnsMenuHTML(state) {
  return kernelColumnsMenuHTML(COLUMNS, state.columns);
}
