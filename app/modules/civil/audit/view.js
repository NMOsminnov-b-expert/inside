import { esc } from '../../../kernel/dom.js';
import { roleLabel } from '../../../kernel/session.js';
import { fieldLabel } from './fieldLabels.js';
import { CATEGORIES, categoryLabel, categoryTone } from './categories.js';
import { resolveDocRef } from './model.js';

const ACTION_LABEL = { create: 'Добавлено', delete: 'Удалено', update: 'Изменено' };
const ACTIONS = ['create', 'update', 'delete'];

// --- Панель фильтров --------------------------------------------------------
// Все мультивыборы — один и тот же .ms/.ms-drop паттерн (oi/building/heating.js),
// пустой выбор везде значит «без ограничения», см. data/store.js.

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

function filterPanelHTML(ctx, allRows, objects) {
  const ui = ctx.ui;
  const personOptions = distinctOptions(allRows, 'person');
  const actionOptions = ACTIONS.filter((a) => allRows.some((r) => r.action === a)).map((a) => ({ key: a, label: ACTION_LABEL[a] }));
  const objectOptions = objects.map((o) => ({ key: o.key, label: o.label }));

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

  const objects = ui.auditObjectFilter || [];
  if (objects.length) {
    const key = (row.category === 'oc' || row.category === 'docs') ? 'oc' : row.targetId;
    if (!objects.includes(key)) return false;
  }

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
    const hay = `${fieldLabel(row.field, row.cardType)} ${row.before} ${row.after} ${row.docLabel || ''}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }

  return true;
}

// --- Список объектов (ОЦ + литеры, включая удалённые) -----------------------

function oiObjLabel(letter, name) {
  return letter ? `Литера ${letter} · ${name}` : (name || 'ОИ');
}

// ОЦ — фиксированный объект первым; существующие литеры — в порядке rec.oi;
// удалённые — литеры, которых уже нет в rec.oi, но есть строки лога с их
// targetId (см. pushOiDeletionLog) — подпись берётся с последней такой строки.
function buildObjects(ctx, allRows) {
  const objects = [{ key: 'oc', kind: 'oc', label: 'ОЦ', deleted: false }];

  const seenIds = new Set();
  (ctx.rec.oi || []).forEach((oi) => {
    seenIds.add(oi.id);
    objects.push({ key: oi.id, kind: 'oi', label: oiObjLabel(oi.letter, oi.name), deleted: false });
  });

  const deleted = new Map();
  allRows.forEach((r) => {
    if ((r.category === 'oi' || r.category === 'photos') && r.targetId && !seenIds.has(r.targetId)) {
      deleted.set(r.targetId, { letter: r.targetLetter, name: r.targetName });
    }
  });
  deleted.forEach((v, id) => {
    objects.push({ key: id, kind: 'oi', label: `${oiObjLabel(v.letter, v.name)} (удалена)`, deleted: true });
  });

  return objects;
}

function rowsForObject(rows, obj) {
  if (obj.kind === 'oc') return rows.filter((r) => r.category === 'oc' || r.category === 'docs');
  return rows.filter((r) => r.targetId === obj.key && (r.category === 'oi' || r.category === 'photos'));
}

// --- Раздел «Правки» (таблица Кто|Когда|Параметр|Предыдущее|Новое) ----------

function paramLabel(row) {
  if (row.field === '(объект)') return row.action === 'create' ? 'Создание' : 'Удаление';
  return fieldLabel(row.field, row.cardType);
}

function editsTableHTML(rows) {
  if (!rows.length) return '';
  const sorted = rows.slice().sort((a, b) => b.atTs - a.atTs);
  const trs = sorted.map((r) => `<tr>
    <td>${esc(r.person)} <span class="tag-mini">${esc(roleLabel(r.role))}</span></td>
    <td class="muted">${esc(r.at)}</td>
    <td>${esc(paramLabel(r))}</td>
    <td>${esc(r.before)}</td>
    <td>${esc(r.after)}</td>
  </tr>`).join('');

  return `<div class="sec-h">Правки</div>
    <table class="tbl audit-tbl">
      <thead><tr><th>Сотрудник</th><th>Дата</th><th>Параметр</th><th>Предыдущее значение</th><th>Новое значение</th></tr></thead>
      <tbody>${trs}</tbody>
    </table>`;
}

// --- Раздел «Документы» (только в объекте ОЦ) -------------------------------

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

// --- Раздел «Фото» (только в объекте литеры) --------------------------------

function isPhotoAddition(r) {
  const b = r.before === '—' ? 0 : (parseInt(r.before, 10) || 0);
  const a = r.after === '—' ? 0 : (parseInt(r.after, 10) || 0);
  return a > b;
}

function photoCategoryOf(r) {
  return r.field.replace(/^photos\./, '');
}

function describePhotoRow(r) {
  const cat = photoCategoryOf(r);
  if (r.after && r.after.includes('Фото без литеры')) return `Фото перенесены в раздел «Фото без литеры» (${cat}, было ${r.before})`;
  return isPhotoAddition(r) ? `Добавлено фото в раздел «${cat}»` : `Фото убрано из раздела «${cat}»`;
}

function photosSectionHTML(ctx, rows) {
  if (!rows.length) return '';
  const sorted = rows.slice().sort((a, b) => b.atTs - a.atTs);
  const oiId = rows[0].targetId;

  const items = sorted.map((r) => {
    const cat = photoCategoryOf(r);
    const moved = r.after && r.after.includes('Фото без литеры');
    const addition = !moved && isPhotoAddition(r);
    const oi = addition ? (ctx.rec.oi || []).find((o) => o.id === oiId) : null;
    const stillThere = oi && ((oi.photos || {})[cat] || 0) > 0;

    const link = moved
      ? `<button class="btn btn-ghost btn-sm" data-audit-goto-orphan style="margin-left:8px">Перейти в «Фото без литеры»</button>`
      : addition
        ? (stillThere
          ? `<button class="btn btn-ghost btn-sm" data-audit-goto-photo="${esc(oiId)}|${esc(cat)}" style="margin-left:8px">Перейти к фото</button>`
          : '<span class="muted" style="margin-left:8px">фото в разделе больше нет</span>')
        : '';

    return `<div class="audit-change">
      <div class="audit-change-attr">${esc(r.person)} · ${esc(r.at)} — ${esc(describePhotoRow(r))}${link}</div>
    </div>`;
  }).join('');

  return `<div class="sec-h" style="margin-top:14px">Фото</div>${items}`;
}

// --- Аккордеон объекта --------------------------------------------------------

function objectAccordionHTML(ctx, obj, rows) {
  const key = 'audit-obj|' + obj.key;
  const open = ctx.ui.accOpen[key] === true;
  const tone = obj.kind === 'oc' ? 't-teal' : 't-blue';

  const editRows = rows.filter((r) => r.category === 'oi' || r.category === 'oc');
  const body = obj.kind === 'oc'
    ? editsTableHTML(editRows) + docsSectionHTML(ctx, rows.filter((r) => r.category === 'docs'))
    : editsTableHTML(editRows) + photosSectionHTML(ctx, rows.filter((r) => r.category === 'photos'));

  return `<div class="acc audit-row ${tone} ${open ? 'open' : ''}">
    <div class="acc-head audit-row-head" data-acc-toggle="${key}">
      <span class="chev">▾</span>
      <b>${esc(obj.label)}</b>
    </div>
    <div class="acc-body" style="padding:10px 12px">${body}</div>
  </div>`;
}

export function auditTab(ctx) {
  const rec = ctx.rec;
  const allRows = rec.auditLog || [];
  const objects = buildObjects(ctx, allRows);
  const visibleRows = allRows.filter((r) => rowMatchesFilters(ctx, r));

  const accordions = objects
    .map((obj) => ({ obj, rows: rowsForObject(visibleRows, obj) }))
    .filter(({ rows }) => rows.length)
    .map(({ obj, rows }) => objectAccordionHTML(ctx, obj, rows));

  return `<div class="card t-slate">
    <div class="card-head"><span class="card-idx">01</span><h3>Лог действий</h3><span class="hint">кто и что менял в этом объекте оценки — по объектам</span></div>
    <div class="card-pad">
      ${filterPanelHTML(ctx, allRows, objects)}
      ${accordions.length
        ? accordions.join('')
        : `<div class="muted">${allRows.length ? 'Нет строк по выбранным фильтрам' : 'Изменений пока нет'}</div>`}
    </div>
  </div>`;
}
