import { esc } from '../../../../kernel/dom.js';
import { colGroupHTML, headAttrs, colLabelHTML, resizeGripHTML, columnVarsStyle, bindColumnResize } from '../../../../kernel/columns.js';

// Столбцы таблиц документов. Ширину можно менять перегородками — механизм общий
// (kernel/columns.js), тот же, что в реестре и в перечне ОИ.
//
// Перестановки столбцов здесь нет намеренно: docsTableHTML и docsBlockInner
// вызываются из семи мест (карточка ОЦ, две формы, карточки ОИ, мастер
// движимого) и получают только запись — ни ctx, ни ui до них не доходят, а
// перестановка требует перерисовки таблицы и места, где хранить порядок.
// Ширины перерисовки не требуют (они в CSS-переменных), поэтому их держим
// прямо здесь, на уровне модуля: это настройка показа, одна на все таблицы
// документов модуля.
const DOC_COLUMNS = [
  { key: 'type', label: 'Тип', width: 150, minWidth: 90 },
  { key: 'name', label: 'Наименование', width: 0 },
  { key: 'date', label: 'Дата', width: 90, minWidth: 70 },
  { key: 'act', label: '', width: 60, fixed: true },
];

const docWidths = {};

const head = () => `<thead><tr>${DOC_COLUMNS.map((c, i) => `<th ${headAttrs(c)}>
  ${c.label ? colLabelHTML(c) : ''}${resizeGripHTML(c, i === DOC_COLUMNS.length - 1)}
</th>`).join('')}</tr></thead>`;

const shell = (inner) => `<div class="docs-cols" data-docs-cols-box style="${columnVarsStyle(DOC_COLUMNS, docWidths)}">
  <table class="tbl">${colGroupHTML(DOC_COLUMNS, docWidths)}${head()}${inner}</table>
</div>`;

export function docsTableHTML(rec, withDel) {
  const docs = rec.docs || [];

  return shell(`<tbody>${docs.map((d) => `<tr class="clickable" data-open-doc="${d.id}" title="Открыть документ в просмотрщике">
    <td><span class="tag-mini">${esc(d.type)}</span></td><td class="ell" title="${esc(d.name)}">${esc(d.name)}</td><td>${esc(d.date)}</td>
    <td><div class="row-actions">${withDel ? `<button class="btn btn-danger btn-sm" data-doc-del="${d.id}" title="Открепить документ">×</button>` : ''}<span class="rowchev-open">›</span></div></td></tr>`).join('')}</tbody>`);
}

export function docsBlockInner(oi, scope) {
  return shell(`<tbody>${(oi.docs || []).map((d) => `<tr class="clickable" data-open-movdoc="${scope}|${d.id}" title="Открыть документ в просмотрщике">
    <td><span class="tag-mini">${esc(d.type)}</span></td><td class="ell" title="${esc(d.name)}">${esc(d.name)}</td><td>${esc(d.date)}</td>
    <td><span class="rowchev-open">›</span></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Нет документов</td></tr>'}</tbody>`)
    + `<button class="btn btn-ghost btn-sm" data-add-movdoc style="margin-top:6px">+ Добавить документ</button>`;
}

// Перегородки для всех таблиц документов на экране. Зовётся из bind карточки.
// Каждая таблица объявляет переменные у себя, но ширины общие на модуль —
// поэтому после перетаскивания раскладку проставляем всем таблицам сразу.
export function bindDocsColumns(scope) {
  bindColumnResize(scope, {
    rootSel: '[data-docs-cols-box]',
    cols: DOC_COLUMNS,
    widths: docWidths,
    onCommit(patch) {
      Object.assign(docWidths, patch);
      scope.$$('[data-docs-cols-box]').forEach((box) => {
        Object.entries(docWidths).forEach(([k, v]) => box.style.setProperty('--cw-' + k, v + 'px'));
      });
    },
  });
}
