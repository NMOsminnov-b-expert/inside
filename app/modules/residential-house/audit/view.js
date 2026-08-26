import { esc } from '../../../kernel/dom.js';
import { roleLabel } from '../../../kernel/session.js';
import { fieldLabel } from './fieldLabels.js';
import { CATEGORIES, categoryLabel, categoryTone } from './categories.js';
import { resolveDocRef } from './model.js';

const ACTION_LABEL = { create: 'Добавлено', delete: 'Удалено', update: 'Изменено' };

// --- Фильтр категорий (мультивыбор) — тот же .ms/.ms-drop паттерн, что у
// отопления ОИ (oi/building/heating.js), просто по CATEGORIES вместо HEATING.

function catOptionRow(cat, checked) {
  return `<label class="ms-opt"><input type="checkbox" data-audit-cat-opt="${cat.key}" ${checked ? 'checked' : ''}>${esc(cat.label)}</label>`;
}

function catDropBodyHTML(filter) {
  const selected = CATEGORIES.filter((c) => filter.includes(c.key));
  const rest = CATEGORIES.filter((c) => !filter.includes(c.key));

  return `<div class="dd-group">Показаны${selected.length ? ` (${selected.length})` : ''}</div>
${selected.length ? selected.map((c) => catOptionRow(c, true)).join('') : '<div class="muted" style="padding:4px 9px">Ничего не выбрано</div>'}
<div class="dd-group">Скрыты</div>
${rest.length ? rest.map((c) => catOptionRow(c, false)).join('') : '<div class="muted" style="padding:4px 9px">Показаны все</div>'}`;
}

function catSummaryHTML(filter) {
  if (filter.length === CATEGORIES.length) return '<span class="ms-summary">Все категории</span>';
  if (!filter.length) return '<span class="muted">Ничего не показано</span>';
  const labels = CATEGORIES.filter((c) => filter.includes(c.key)).map((c) => c.label).join(', ');
  return `<span class="ms-summary" title="${esc(labels)}">${esc(labels)}</span><span class="ms-count">${filter.length}</span>`;
}

export function categoryFilterHTML(ctx) {
  const filter = ctx.ui.auditCatFilter || [];

  return `<div class="field" style="max-width:340px">
    <label>Категории</label>
    <div class="ms">
      <div class="ms-control" data-ms-control data-audit-cat-toggle title="Фильтр по категориям">
        ${catSummaryHTML(filter)}
        <span class="chev">▾</span>
      </div>
      <div class="ms-drop" ${ctx.ui.auditCatOpen ? '' : 'hidden'}>
        ${catDropBodyHTML(filter)}
      </div>
    </div>
  </div>`;
}

// --- Строка лога -----------------------------------------------------------

function targetLabelHTML(entry) {
  if (!entry.target) return '';
  return `<span class="tag-mini">Литера ${esc(entry.target.letter || '')}</span> <span class="muted">${esc(entry.target.name || '')}</span>`;
}

// Прирост счётчика фото в категории — единственный случай, когда даём
// ссылку («на добавленные — да, на удалённые — не нужно», прямое указание
// пользователя); уменьшение (перенос/убыло) — просто текст, без ссылки.
function isPhotoAddition(c) {
  const b = c.before === '—' ? 0 : (parseInt(c.before, 10) || 0);
  const a = c.after === '—' ? 0 : (parseInt(c.after, 10) || 0);
  return a > b;
}

function photoCategoryOf(c) {
  return c.field.replace(/^photos\./, '');
}

function describeChange(entry, c) {
  if (entry.category === 'docs') {
    if (c.field === 'pages') {
      return c.action === 'create' ? `Добавлена страница (сейчас ${c.after}) — ${c.docLabel}` : `Удалена страница ${c.before} — ${c.docLabel}`;
    }
    if (c.field === '(объект)') {
      return c.action === 'create' ? `Добавлен документ ${c.docLabel}` : `Удалён документ ${c.docLabel}`;
    }
    return `${fieldLabel(c.field)}: ${c.before} → ${c.after}`;
  }

  if (entry.category === 'photos') {
    const cat = photoCategoryOf(c);
    return isPhotoAddition(c) ? `Добавлено фото в раздел «${cat}»` : `Фото убрано из раздела «${cat}»`;
  }

  if (c.field === '(объект)') {
    return c.action === 'create' ? `Добавлена литера: ${c.after}` : `Удалена литера: ${c.before}`;
  }

  return null;
}

// Свёрнутая строка: время+дата · (литера) · кто(роль) · суть — по образцу
// категории. Для ОИ/ОЦ с одной правкой — название поля; при нескольких —
// «и ещё N» (детали — в развёрнутом виде). Документы/фото — всегда словесное
// описание первой правки (там нет отдельной таблицы «Поле|Было|Стало»).
function summaryLineHTML(ctx, entry) {
  const n = entry.changes.length;
  const first = entry.changes[0];
  const more = n > 1 ? ` <span class="muted">и ещё ${n - 1}</span>` : '';

  let what;
  if ((entry.category === 'oi' || entry.category === 'oc') && first.field !== '(объект)') {
    what = esc(fieldLabel(first.field, entry.cardType)) + more;
  } else {
    what = esc(describeChange(entry, first)) + more;
  }

  return `<span class="audit-cat-badge">${esc(categoryLabel(entry.category))}</span>
    <b>${esc(entry.at)}</b>
    <span class="muted">${esc(entry.person)}</span>
    <span class="tag-mini">${esc(roleLabel(entry.role))}</span>
    ${entry.target ? targetLabelHTML(entry) : ''}
    <span style="margin-left:auto; text-align:right">${what}</span>`;
}

// Развёрнутое тело: для ОИ/ОЦ/Документов — таблица (у документов первый
// столбец — сам документ: название, тип, id, при живом документе — переход
// к нему); для Фото — список словесных описаний, ссылка только у добавлений.
function bodyHTML(ctx, entry) {
  if (entry.category === 'oi' || entry.category === 'oc') {
    const rows = entry.changes.map((c) => `<tr>
      <td>${c.field === '(объект)' ? '' : esc(fieldLabel(c.field, entry.cardType))}</td>
      <td class="muted">${esc(ACTION_LABEL[c.action] || '')}</td>
      <td>${esc(c.before)}</td>
      <td>${esc(c.after)}</td>
    </tr>`).join('');

    return `<table class="tbl audit-tbl">
      <thead><tr><th>Поле</th><th></th><th>Было</th><th>Стало</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  if (entry.category === 'docs') {
    const rows = entry.changes.map((c) => {
      const ref = c.docId ? resolveDocRef(ctx.rec, c.docId) : null;
      const link = ref
        ? `<button class="btn btn-ghost btn-sm" data-audit-goto-doc="${esc(ref.scope)}|${esc(c.docId)}" style="display:block;margin-top:4px">Перейти к документу</button>`
        : (c.docId ? '<div class="muted" style="font-size:10.5px;margin-top:2px">документ удалён</div>' : '');

      return `<tr>
        <td><div>${esc(c.docLabel || '')}</div>${link}</td>
        <td class="muted">${esc(ACTION_LABEL[c.action] || '')}${c.field === 'pages' ? ' <span class="muted">(страница)</span>' : ''}</td>
        <td>${esc(c.before)}</td>
        <td>${esc(c.after)}</td>
      </tr>`;
    }).join('');

    return `<table class="tbl audit-tbl">
      <thead><tr><th>Документ</th><th></th><th>Было</th><th>Стало</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  // photos
  return entry.changes.map((c) => {
    const cat = photoCategoryOf(c);
    const addition = isPhotoAddition(c);
    const oiId = entry.target && entry.target.id;
    const oi = addition && oiId ? (ctx.rec.oi || []).find((o) => o.id === oiId) : null;
    const stillThere = oi && ((oi.photos || {})[cat] || 0) > 0;

    const link = addition
      ? (stillThere
        ? `<button class="btn btn-ghost btn-sm" data-audit-goto-photo="${esc(oiId)}|${esc(cat)}" style="margin-left:8px">Перейти к фото</button>`
        : '<span class="muted" style="margin-left:8px">фото в разделе больше нет</span>')
      : '';

    return `<div class="audit-change">
      <div class="audit-change-attr">${esc(describeChange(entry, c))}${link}</div>
    </div>`;
  }).join('');
}

function entryHTML(ctx, entry) {
  const key = 'audit|' + entry.id;
  const open = ctx.ui.accOpen[key] === true;
  const tone = categoryTone(entry.category);

  return `<div class="acc audit-row ${tone} ${open ? 'open' : ''}">
    <div class="acc-head audit-row-head" data-acc-toggle="${key}">
      <span class="chev">▾</span>
      ${summaryLineHTML(ctx, entry)}
    </div>
    <div class="acc-body" style="padding:10px 12px">
      ${bodyHTML(ctx, entry)}
    </div>
  </div>`;
}

export function auditTab(ctx) {
  const rec = ctx.rec;
  const filter = ctx.ui.auditCatFilter || [];
  const all = (rec.auditLog || []).slice().reverse();
  const entries = all.filter((e) => filter.includes(e.category));

  return `<div class="card t-slate">
    <div class="card-head"><span class="card-idx">01</span><h3>Лог действий</h3><span class="hint">кто и что менял в этом объекте оценки</span></div>
    <div class="card-pad">
      <div style="margin-bottom:12px">${categoryFilterHTML(ctx)}</div>
      ${entries.length
        ? entries.map((e) => entryHTML(ctx, e)).join('')
        : `<div class="muted">${all.length ? 'Нет записей в выбранных категориях' : 'Изменений пока нет'}</div>`}
    </div>
  </div>`;
}
