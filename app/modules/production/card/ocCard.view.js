import { flagBadgesHTML } from '../../../kernel/flagBadges.js';
import { recFlags } from '../records.js';
import { canViewAuditLog } from '../audit/access.js';
import { auditTab } from '../audit/view.js';
import { fmtEni } from '../../../kernel/fmt.js';
import { esc } from '../../../kernel/dom.js';
import { ownersUsersHTML, responsiblesHTML } from './parties.view.js';
import { tableOI } from './oiTable.view.js';
import { photosTab } from '../parts/photos/explorer.js';
import { splitWrap, viewerHTML } from '../parts/viewer/shell.js';
import { addOiMenuHTML } from './addOiMenu.js';

function headOC(rec) {
  // data-oc-head: при прокрутке шапка уезжает вверх, а её место занимает
  // закреплённая плашка «ОЦ → литера» (см. bindStickyHead в index.js).
  return `<div class="card card-pad t-blue" data-oc-head>
    <div class="head-meta">
      <span class="pill pill-cat">${esc(rec.category)}</span>

      <div class="hm"><span class="lbl">Тип ОЦ</span><b>${esc(rec.type)}</b></div>
      <div class="hm"><span class="lbl">Назначение по ТП</span><b>${esc(rec.purposeTP)}</b></div>
      <div class="hm"><span class="lbl">Код ЕНИ</span><b>${esc(fmtEni(rec.eni))}</b></div>
      <div class="hm"><span class="lbl">Адрес</span><b>${esc(rec.address)}</b></div>

      ${flagBadgesHTML(recFlags(rec))}

      <span class="head-actions">
        <span class="pill pill-status"><span class="dot"></span>${esc(rec.status)}</span>

        <div class="dd" id="ddAddOi">
          <button class="btn btn-primary" data-dd-toggle>+ Добавить ОИ ▾</button>
          <div class="dd-menu">
            ${addOiMenuHTML(rec)}
          </div>
        </div>

        <button class="btn btn-ghost" id="btnEditOc">Редактировать</button>
        <button class="btn btn-danger" id="btnDelOc">Удалить</button>
      </span>
    </div>
  </div>`;
}

function partiesOC(rec) {
  return `<div class="card t-slate" style="margin-top:12px">
    <div class="card-head" data-card-toggle><span class="card-idx">01</span><h3>Учреждение, собственники и ответственные</h3><span class="hint">редактируется в форме ОЦ</span><span class="chev">▾</span></div>

    <div class="card-body-wrap"><div class="card-pad">
      <!-- g-top: в этой строке поля разной высоты (значение текстом против
           плашек с кнопкой), а .grid по умолчанию равняет по низу — из-за этого
           подписи «Учреждение» и «Подвед» опускались ниже соседних. -->
      <div class="grid g-4 g-top">
        <div class="field"><span class="lbl">Учреждение</span><b>${esc(rec.institution)}</b></div>
        <div class="field"><span class="lbl">Подвед</span><b>${esc(rec.podved)}</b></div>

        <div class="field"><span class="lbl">Собственники</span>
          <div class="inline-row">${rec.owners.map((o, i) => `<span class="ms-tag">${esc(o)}<span data-owner-rm="${i}" title="Убрать">×</span></span>`).join('') || '<span class="muted">не указаны</span>'}
          <button class="btn btn-ghost btn-sm" data-add-party="owner">+ Добавить</button></div>
        </div>

        <div class="field"><span class="lbl">Пользователь</span>
          <div class="inline-row">${rec.users.map((o, i) => `<span class="ms-tag">${esc(o)}<span data-user-rm="${i}" title="Убрать">×</span></span>`).join('') || '<span class="muted">не указан</span>'}
          <button class="btn btn-ghost btn-sm" data-add-party="user">+ Добавить</button></div>
        </div>
      </div>

      <div class="sec-h">Ответственные (без юриста)</div>
      ${responsiblesHTML(rec)}
    </div></div>
  </div>`;
}

export function viewOC(ctx) {
  const rec = ctx.rec;
  const generalTab = splitWrap(ctx.ui.viewer ? viewerHTML(ctx) : null, partiesOC(rec) + tableOI(ctx));

  return `${headOC(rec)}
    <div class="tabs">
      <button class="tab ${ctx.tab === 'general' ? 'active' : ''}" data-tab="general">Общие данные</button>
      <button class="tab ${ctx.tab === 'photo' ? 'active' : ''}" data-tab="photo">Фото</button>
      ${canViewAuditLog(rec) ? `<button class="tab ${ctx.tab === 'audit' ? 'active' : ''}" data-tab="audit">Логи</button>` : ''}
    </div>

    ${ctx.tab === 'general' ? generalTab
      : ctx.tab === 'audit' && canViewAuditLog(rec) ? auditTab(ctx)
      : photosTab(ctx)}`;
}
