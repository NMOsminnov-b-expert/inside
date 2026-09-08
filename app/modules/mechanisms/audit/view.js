import { esc } from '../../../kernel/dom.js';
import { roleLabel } from '../../../kernel/session.js';
import { fieldLabel } from './fieldLabels.js';
import { CATEGORIES } from './categories.js';
import { resolveDocRef } from './model.js';

// Лог действий этого модуля устроен проще, чем у остальных: нет объектов
// имущества, поэтому нет и аккордеона «по объектам» — весь лог записи
// показывается одним списком правок плюс отдельным списком документов.
const ACTION_LABEL = { create: 'Добавлено', delete: 'Удалено', update: 'Изменено', move: 'Перенесено' };
const ACTIONS = ['create', 'update', 'delete', 'move'];

// --- Панель фильтров --------------------------------------------------------
// Мультивыборы — тот же .ms/.ms-drop паттерн, что и в остальных модулях,
// пустой выбор везде значит «без ограничения».

function msOptionsHTML(options, selected, dataAttr) {
  if (!options.length) return '<div class="muted" style="padding:4px 9px">Нет данных</div>';
  return options.map((o) => `<label class="ms-opt"><input type="checkbox" data-${dataAttr}="${esc(o.key)}" ${selected.includes(o.key) ? 'checked' : ''}>${esc(o.label)}</label>`).join('');
}

function msSummaryHTML(options, selected) {
  if (!selected.length) return '<span class="muted">Все</span>';
  const labels = options.filter((o) => selected.includes(o.key)).map((o) => o.label);
  return `<span class="ms-summary" title="${esc(labels.join(', '))}">${esc(labels.join(', '))}</span><span class="ms-count">${selected.length}</span>`;
}

function msFilterHTML(label, uiFlagKey, dropOpen, options, selected, dataAttr) {
  return `<div class="field audit-filter-field">
    <label>${esc(label)}</label>
    <div class="ms">
      <div class="ms-control" data-ms-control data-audit-ms-toggle="${uiFlagKey}">
        ${msSummaryHTML(options, selected)}
        <span class="chev">▾</span>
      </div>
      <div class="ms-drop" ${dropOpen ? '' : 'hidden'}>${msOptionsHTML(options, selected, dataAttr)}</div>
    </div>
  </div>`;
}

function distinctOptions(rows, key, labelFn) {
  const seen = new Map();
  rows.forEach((r) => { if (r[key] && !seen.has(r[key])) seen.set(r[key], labelFn ? labelFn(r) : r[key]); });
  return Array.from(seen.entries()).map(([k, label]) => ({ key: k, label }));
}

function filterPanelHTML(ctx, allRows) {
  const ui = ctx.ui;
  const personOptions = distinctOptions(allRows, 'person');
  const actionOptions = ACTIONS.filter((a) => allRows.some((r) => r.action === a)).map((a) => ({ key: a, label: ACTION_LABEL[a] }));
  // Единственный «объект» этого модуля — сам ОЦ (нет литер), поэтому фасет
  // «Объект» сведён к нему одному — оставлен ради единообразия с остальными
  // модулями (тот же .ms-паттерн и та же панель), а не потому что здесь есть
  // что различать.
  const objectOptions = [{ key: 'oc', label: 'ОЦ' }];

  const active = (ui.auditCatFilter || []).length + (ui.auditPersonFilter || []).length
    + (ui.auditObjectFilter || []).length + (ui.auditActionFilter || []).length
    + (ui.auditDateFrom ? 1 : 0) + (ui.auditDateTo ? 1 : 0) + ((ui.auditSearchText || '').trim() ? 1 : 0);

  return `<div class="audit-filters">
    <div class="audit-filters-head">
      Фильтры
      ${active ? `<span class="tag-mini">активно: ${active}</span><button class="btn btn-ghost btn-sm" data-audit-filters-reset style="margin-left:auto">Сбросить</button>` : '<span class="muted" style="font-weight:400">показаны все записи</span>'}
    </div>
    <div class="audit-filters-row">
      ${msFilterHTML('Категории', 'auditCatOpen', ui.auditCatOpen, CATEGORIES.map((c) => ({ key: c.key, label: c.label })), ui.auditCatFilter || [], 'audit-cat-opt')}
      ${msFilterHTML('Сотрудник', 'auditPersonOpen', ui.auditPersonOpen, personOptions, ui.auditPersonFilter || [], 'audit-person-opt')}
      ${msFilterHTML('Объект', 'auditObjectOpen', ui.auditObjectOpen, objectOptions, ui.auditObjectFilter || [], 'audit-object-opt')}
      ${msFilterHTML('Тип действия', 'auditActionOpen', ui.auditActionOpen, actionOptions, ui.auditActionFilter || [], 'audit-action-opt')}
      <div class="field audit-filter-field"><label>С даты</label><input class="input" type="date" data-audit-date-from value="${esc(ui.auditDateFrom || '')}"></div>
      <div class="field audit-filter-field"><label>По дату</label><input class="input" type="date" data-audit-date-to value="${esc(ui.auditDateTo || '')}"></div>
      <div class="field audit-filter-search"><label>Поиск</label><input class="input" data-audit-search placeholder="Параметр или значение" value="${esc(ui.auditSearchText || '')}"></div>
    </div>
  </div>`;
}

// --- Фильтрация строк --------------------------------------------------------

function rowMatchesFilters(ctx, row) {
  const ui = ctx.ui;
  const cat = ui.auditCatFilter || [];
  if (cat.length && !cat.includes(row.category)) return false;

  const persons = ui.auditPersonFilter || [];
  if (persons.length && !persons.includes(row.person)) return false;

  const actions = ui.auditActionFilter || [];
  if (actions.length && !actions.includes(row.action)) return false;

  // Фасет «Объект» здесь всегда «ОЦ» — фильтровать по нему нечего, кроме как
  // пропускать все строки, если он вдруг снят (чего интерфейс не позволяет).
  const objects = ui.auditObjectFilter || [];
  if (objects.length && !objects.includes('oc')) return false;

  if (ui.auditDateFrom) {
    const from = new Date(ui.auditDateFrom + 'T00:00:00').getTime();
    if (!isNaN(from) && row.atTs < from) return false;
  }
  if (ui.auditDateTo) {
    const to = new Date(ui.auditDateTo + 'T23:59:59').getTime();
    if (!isNaN(to) && row.atTs > to) return false;
  }

  const q = (ui.auditSearchText || '').trim().toLowerCase();
  if (q) {
    const hay = `${fieldLabel(row.field)} ${row.before} ${row.after} ${row.docLabel || ''}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }

  return true;
}

// --- Раздел «Правки» (таблица Кто|Когда|Параметр|Предыдущее|Новое) ----------

function paramLabel(row) {
  if (row.field === '(объект)') return row.action === 'create' ? 'Создание' : 'Удаление';
  return fieldLabel(row.field);
}

function editsTableHTML(rows) {
  if (!rows.length) return '<div class="muted">Правок пока нет</div>';
  const sorted = rows.slice().sort((a, b) => b.atTs - a.atTs);
  const trs = sorted.map((r) => `<tr>
    <td>${esc(r.person)} <span class="tag-mini">${esc(roleLabel(r.role))}</span></td>
    <td class="muted">${esc(r.at)}</td>
    <td>${esc(paramLabel(r))}</td>
    <td>${esc(r.before)}</td>
    <td>${esc(r.after)}</td>
  </tr>`).join('');

  return `<table class="tbl audit-tbl">
      <thead><tr><th>Сотрудник</th><th>Дата</th><th>Параметр</th><th>Предыдущее значение</th><th>Новое значение</th></tr></thead>
      <tbody>${trs}</tbody>
    </table>`;
}

// --- Раздел «Документы» -----------------------------------------------------

function docsSectionHTML(ctx, rows) {
  if (!rows.length) return '';
  const sorted = rows.slice().sort((a, b) => b.atTs - a.atTs);
  const trs = sorted.map((r) => {
    const ref = r.docId ? resolveDocRef(ctx.rec, r.docId) : null;
    const link = ref
      ? `<button class="btn btn-ghost btn-sm" data-audit-goto-doc="${esc(ref.scope)}|${esc(r.docId)}" style="display:block;margin-top:4px">Перейти к документу</button>`
      : (r.docId ? '<div class="muted" style="font-size:10.5px;margin-top:2px">документ удалён</div>' : '');

    return `<tr>
      <td><div>${esc(r.docLabel || '')}</div>${link}</td>
      <td class="muted">${esc(r.person)} · ${esc(r.at)}${r.field === 'pages' ? ' <span class="muted">(страница)</span>' : ''}</td>
      <td class="muted">${esc(ACTION_LABEL[r.action] || '')}</td>
      <td>${esc(r.before)}</td>
      <td>${esc(r.after)}</td>
    </tr>`;
  }).join('');

  return `<div class="sec-h" style="margin-top:14px">Документы</div>
    <table class="tbl audit-tbl">
      <thead><tr><th>Документ</th><th>Сотрудник / дата</th><th>Действие</th><th>Было</th><th>Стало</th></tr></thead>
      <tbody>${trs}</tbody>
    </table>`;
}

export function auditTab(ctx) {
  const rec = ctx.rec;
  const allRows = rec.auditLog || [];
  const visibleRows = allRows.filter((r) => rowMatchesFilters(ctx, r));

  const body = editsTableHTML(visibleRows.filter((r) => r.category === 'oc'))
    + docsSectionHTML(ctx, visibleRows.filter((r) => r.category === 'docs'));

  return `<div class="card t-slate">
    <div class="card-head"><span class="card-idx">01</span><h3>Лог действий</h3><span class="hint">кто и что менял в этом объекте оценки</span></div>
    <div class="card-pad">
      ${filterPanelHTML(ctx, allRows)}
      ${allRows.length ? body : '<div class="muted">Изменений пока нет</div>'}
    </div>
  </div>`;
}
