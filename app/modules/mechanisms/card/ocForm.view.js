import { esc } from '../../../kernel/dom.js';
import { STATUS_OC } from '../data/dictionaries.js';
import { opt } from '../data/opts.js';
import { ownersUsersHTML, responsiblesHTML } from './parties.view.js';
import { splitWrap, viewerHTML } from '../parts/viewer/shell.js';
import { renderMechList, uid } from '../parts/mechConstructor.js';

// У этого модуля нет ни кода ЕНИ, ни GPS, ни назначения по ТП, ни объектов
// имущества (см. manifest.js, records.js) — поля #fEni/#fGps/#fPurpose и
// блок «Состав и тип имущества» (чекбокс «Имущественный комплекс») из
// остальных модулей здесь не нужны вовсе. Вместо них — карточка 02:
// конструктор полей самого механизма (parts/mechConstructor.js).
//
// Тип ОЦ здесь заблокирован даже в форме РЕДАКТИРОВАНИЯ (в отличие от
// остальных модулей, где смена типа доступна и там) — движение записи между
// типами для этого модуля не предусмотрено этой задачей.
function mainSection(rec) {
  return `<div class="card t-blue">
    <div class="card-head">
      <span class="card-idx">01</span>
      <h3>Основные параметры</h3>
    </div>

    <div class="card-pad">
      <div class="grid g-4 g-roomy">
        <div class="field">
          <label>Тип ОЦ</label>
          <select class="select" id="fType" disabled title="Тип задаётся модулем ОЦ">
            <option selected>${esc(rec.type)}</option>
          </select>
        </div>

        <div class="field">
          <label>Категория ОЦ</label>
          <select class="select" id="fCat" disabled title="Категория закреплена модулем — «Механизмы и оборудование» всегда движимое имущество">
            <option selected>${esc(rec.category)}</option>
          </select>
        </div>

        <div class="field">
          <label>Статус ОЦ</label>
          <select class="select" id="fStatus">
            ${opt('oc', 'status', STATUS_OC).map((s) => `<option ${s === rec.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>

        <div class="field">
          <label>Учреждение</label>
          <input class="input" id="fInst" value="${esc(rec.institution)}">
        </div>

        <div class="field">
          <label>Подвед</label>
          <input class="input" id="fPodved" value="${esc(rec.podved)}">
        </div>

        <div class="field sp-all">
          <label>Адрес</label>
          <input class="input" id="fAddr" value="${esc(rec.address)}">
        </div>
      </div>
    </div>
  </div>`;
}

function mechSection(rec) {
  rec.mechanisms = (rec.mechanisms && rec.mechanisms.length) ? rec.mechanisms : [{ id: uid(), name: '', qty: 1, cost: 0, fields: [] }];
  return `<div class="card t-teal">
    <div class="card-head">
      <span class="card-idx">02</span>
      <h3>Механизмы</h3>
      <span class="hint">название, количество и параметры каждого — конструктором полей, без общего справочника</span>
    </div>

    <div class="card-pad">
      ${renderMechList(rec.mechanisms)}
    </div>
  </div>`;
}

function partiesSection(rec) {
  return `<div class="card t-slate">
    <div class="card-head">
      <span class="card-idx">03</span>
      <h3>Собственники, пользователи и ответственные</h3>
      <span class="hint">без юриста</span>
    </div>

    <div class="card-pad">
      ${ownersUsersHTML(rec)}
      <div class="sec-h">Ответственные</div>
      ${responsiblesHTML(rec)}
    </div>
  </div>`;
}

export function viewOCForm(ctx) {
  const rec = ctx.rec;

  const stack = `<div class="oi-stack">
    ${mainSection(rec)}
    ${mechSection(rec)}
    ${partiesSection(rec)}
  </div>`;

  return `<div class="view-head">
    <button class="back-btn" data-back>← К карточке объекта</button>
    <span class="pill pill-gray">Редактирование ОЦ${rec.address ? ' · ' + esc(rec.address) : ''}</span>
    <button class="btn btn-primary" id="btnSaveOc">Сохранить и вернуться</button>
    <button class="btn btn-ghost" data-back>Отмена</button>
  </div>

  ${splitWrap(
    ctx.ui.viewer ? viewerHTML(ctx) : null,
    stack
  )}`;
}
