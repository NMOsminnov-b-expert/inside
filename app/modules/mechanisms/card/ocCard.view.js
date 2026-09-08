import { flagBadgesHTML } from '../../../kernel/flagBadges.js';
import { recFlags } from '../records.js';
import { esc } from '../../../kernel/dom.js';
import { ownersUsersHTML, responsiblesHTML } from './parties.view.js';
import { canViewAuditLog } from '../audit/access.js';
import { auditTab } from '../audit/view.js';
import { docsTableHTML } from '../parts/docs/table.js';
import { splitWrap, viewerHTML } from '../parts/viewer/shell.js';

// Карточка ОЦ этого модуля проще, чем у остальных четырёх: нет объектов
// имущества (см. manifest.js), поэтому нет ни перечня ОИ, ни меню
// «+ Добавить ОИ», ни вкладки «Фото» (фото по литерам здесь взять неоткуда).
// Вместо «Фото» — вкладка «Документы»: единственное место, где документы
// записи показываются списком (docsTableHTML), а не только через
// просмотрщик.
function headOC(rec) {
  // data-oc-head: при прокрутке шапка уезжает вверх, а её место занимает
  // закреплённая плашка (см. bindStickyHead в index.js) — тот же приём, что
  // и у остальных модулей, хотя здесь плашка не несёт своих действий.
  return `<div class="card card-pad t-blue" data-oc-head>
    <div class="head-meta">
      <span class="pill pill-cat">${esc(rec.category)}</span>

      <div class="hm"><span class="lbl">Тип ОЦ</span><b>${esc(rec.type)}</b></div>
      <div class="hm"><span class="lbl">Адрес</span><b>${esc(rec.address)}</b></div>

      ${flagBadgesHTML(recFlags(rec))}

      <span class="head-actions">
        <span class="pill pill-status"><span class="dot"></span>${esc(rec.status)}</span>

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

// Показ механизмов — читаемый, не форма: состав правится в форме ОЦ
// (card/ocForm.view.js, конструктор parts/mechConstructor.js), здесь только
// отображение того, что уже заполнено. Запись ОЦ может описывать несколько
// механизмов — каждый в своём визуально обособленном блоке (та же граница,
// что и в форме редактирования, см. .mech-view-entry в module.css).
function mechEntryHTML(mech) {
  const fields = mech.fields || [];

  return `<div class="mech-view-entry">
    <div class="grid g-4 g-top">
      <div class="field"><span class="lbl">Название</span><b>${esc(mech.name || '—')}</b></div>
      <div class="field"><span class="lbl">Количество</span><b>${esc(mech.qty != null ? mech.qty : 1)}</b></div>
      <div class="field"><span class="lbl">Стоимость</span><b>${mech.cost === '' || mech.cost == null ? '—' : esc(mech.cost)}</b></div>
    </div>

    ${fields.length
      ? `<div class="grid g-4 g-top" style="margin-top:10px">${fields.map((f) => `<div class="field"><span class="lbl">${esc(f.label)}</span><b>${esc(f.value || '—')}</b></div>`).join('')}</div>`
      : '<div class="muted" style="margin-top:8px">Полей ещё нет — заполняются в форме редактирования</div>'}
  </div>`;
}

function mechOC(rec) {
  const mechanisms = (rec.mechanisms && rec.mechanisms.length) ? rec.mechanisms : [{ name: '', qty: 1, cost: 0, fields: [] }];

  return `<div class="card t-teal" style="margin-top:12px">
    <div class="card-head" data-card-toggle><span class="card-idx">02</span><h3>Механизмы</h3><span class="hint">состав параметров задаётся конструктором полей — правится в форме ОЦ</span><span class="chev">▾</span></div>

    <div class="card-body-wrap"><div class="card-pad">
      <div class="mech-view-list">${mechanisms.map(mechEntryHTML).join('')}</div>
    </div></div>
  </div>`;
}

export function viewOC(ctx) {
  const rec = ctx.rec;
  const generalTab = splitWrap(ctx.ui.viewer ? viewerHTML(ctx) : null, partiesOC(rec) + mechOC(rec));
  const docsTab = splitWrap(ctx.ui.viewer ? viewerHTML(ctx) : null, docsTableHTML(rec, false));

  return `${headOC(rec)}
    <div class="tabs">
      <button class="tab ${ctx.tab === 'general' ? 'active' : ''}" data-tab="general">Общие данные</button>
      <button class="tab ${ctx.tab === 'docs' ? 'active' : ''}" data-tab="docs">Документы</button>
      ${canViewAuditLog(rec) ? `<button class="tab ${ctx.tab === 'audit' ? 'active' : ''}" data-tab="audit">Логи</button>` : ''}
    </div>

    ${ctx.tab === 'general' ? generalTab
      : ctx.tab === 'audit' && canViewAuditLog(rec) ? auditTab(ctx)
      : docsTab}`;
}
