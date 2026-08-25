import { esc } from '../../../kernel/dom.js';
import { isAdmin, roleLabel } from '../../../kernel/session.js';
import { DOC_TYPES } from '../data/dictionaries.js';
import { ownersUsersHTML, responsiblesHTML } from './parties.view.js';
import { tableOI } from './oiTable.view.js';
import { docsTableHTML } from '../parts/docs/table.js';
import { photosTab } from '../parts/photos/explorer.js';
import { splitWrap, viewerHTML } from '../parts/viewer/shell.js';
import { addOiMenuHTML } from './addOiMenu.js';

// Только для роли «администратор» — кто что менял, для какого объекта,
// с какого значения на какое (см. kernel/auditLog.js).
function auditLogCard(rec) {
  const entries = (rec.auditLog || []).slice().reverse();

  return `<div class="card t-slate" style="margin-top:12px">
    <div class="card-head" data-card-toggle><span class="card-idx">03</span><h3>Лог изменений</h3><span class="hint">видно только администратору</span><span class="chev">▾</span></div>
    <div class="card-body-wrap"><div class="card-pad">
      ${entries.length ? `<table class="tbl">
        <colgroup><col style="width:120px"><col style="width:170px"><col style="width:160px"><col style="width:170px"><col><col></colgroup>
        <thead><tr><th>Когда</th><th>Кто</th><th>Объект</th><th>Поле</th><th>Было</th><th>Стало</th></tr></thead>
        <tbody>${entries.map((e) => `<tr>
          <td>${esc(e.at)}</td>
          <td>${esc(e.person)}${e.role && e.role !== 'any' ? ` <span class="tag-mini">${esc(roleLabel(e.role))}</span>` : ''}</td>
          <td class="ell">${esc(e.target)}</td>
          <td class="ell">${esc(e.field)}</td>
          <td class="ell">${esc(e.before)}</td>
          <td class="ell">${esc(e.after)}</td>
        </tr>`).join('')}</tbody>
      </table>` : '<div class="muted">Изменений пока нет</div>'}
    </div></div>
  </div>`;
}

function headOC(rec) {
  return `<div class="card card-pad t-blue">
    <div class="head-meta">
      <span class="pill pill-cat">${esc(rec.category)}</span>

      <div class="hm"><label>Тип ОЦ</label><b>${esc(rec.type)}</b></div>
      <div class="hm"><label>Назначение по ТП</label><b>${esc(rec.purposeTP)}</b></div>
      <div class="hm"><label>Код ЕНИ</label><b>${esc(rec.eni)}</b></div>
      <div class="hm"><label>Адрес</label><b>${esc(rec.address)}</b></div>

      <span class="pill pill-status" style="margin-left:auto"><span class="dot"></span>${esc(rec.status)}</span>

      <div class="dd" id="ddAddOi">
        <button class="btn btn-primary" data-dd-toggle>+ Добавить ОИ ▾</button>
        <div class="dd-menu">
          ${addOiMenuHTML(rec)}
        </div>
      </div>

      <button class="btn btn-ghost" id="btnEditOc">Редактировать</button>
      <button class="btn btn-danger" id="btnDelOc">Удалить</button>
    </div>
  </div>`;
}

function partiesOC(rec) {
  return `<div class="card t-slate" style="margin-top:12px">
    <div class="card-head" data-card-toggle><span class="card-idx">01</span><h3>Учреждение, собственники и ответственные</h3><span class="hint">редактируется в форме ОЦ</span><span class="chev">▾</span></div>

    <div class="card-body-wrap"><div class="card-pad">
      <div class="grid g-4">
        <div class="field"><label>Учреждение</label><b>${esc(rec.institution)}</b></div>
        <div class="field"><label>Подвед</label><b>${esc(rec.podved)}</b></div>

        <div class="field"><label>Собственники</label>
          <div class="inline-row">${rec.owners.map((o, i) => `<span class="ms-tag">${esc(o)}<span data-owner-rm="${i}" title="Убрать">×</span></span>`).join('') || '<span class="muted">не указаны</span>'}
          <button class="btn btn-ghost btn-sm" data-add-party="owner">+ Добавить</button></div>
        </div>

        <div class="field"><label>Пользователь</label>
          <div class="inline-row">${rec.users.map((o, i) => `<span class="ms-tag">${esc(o)}<span data-user-rm="${i}" title="Убрать">×</span></span>`).join('') || '<span class="muted">не указан</span>'}
          <button class="btn btn-ghost btn-sm" data-add-party="user">+ Добавить</button></div>
        </div>
      </div>

      <div class="sec-h">Ответственные (без юриста)</div>
      ${responsiblesHTML(rec)}
    </div></div>
  </div>`;
}

function docsTab(ctx) {
  return splitWrap(
    (ctx.ui.viewer && ctx.ui.viewerDoc && ctx.ui.viewerDoc.scope === 'oc') ? viewerHTML(ctx) : null,
    `<div class="card t-slate">
      <div class="card-head"><span class="card-idx">03</span><h3>Перечень документов</h3><span class="hint">клик по строке — просмотрщик</span>
        <div class="dd" style="margin-left:auto">
          <button class="btn btn-primary btn-sm" data-dd-toggle>+ Прикрепить документ</button>
          <div class="dd-menu">${DOC_TYPES.map((t) => `<button data-attach="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        </div>
      </div>

      ${docsTableHTML(ctx.rec, true)}

      <div class="muted" style="font-size:10.5px;padding:8px 14px 12px">Открытые документы накапливаются вкладками.</div>
    </div>`
  );
}

export function viewOC(ctx) {
  const rec = ctx.rec;
  const generalTab = splitWrap(ctx.ui.viewer ? viewerHTML(ctx) : null, partiesOC(rec) + tableOI(ctx) + (isAdmin() ? auditLogCard(rec) : ''));

  return `${headOC(rec)}
    <div class="tabs">
      <button class="tab ${ctx.tab === 'general' ? 'active' : ''}" data-tab="general">Общие данные</button>
      <button class="tab ${ctx.tab === 'docs' ? 'active' : ''}" data-tab="docs">Документы ${(rec.docs || []).length}</button>
      <button class="tab ${ctx.tab === 'photo' ? 'active' : ''}" data-tab="photo">Фото</button>
    </div>

    ${ctx.tab === 'general' ? generalTab : ctx.tab === 'docs' ? docsTab(ctx) : photosTab(ctx)}`;
}
