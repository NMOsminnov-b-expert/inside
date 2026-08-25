import { esc } from '../../../kernel/dom.js';
import { STATUS_OC, DOC_TYPES } from '../data/dictionaries.js';
import { ownersUsersHTML, responsiblesHTML } from './parties.view.js';
import { docsTableHTML } from '../parts/docs/table.js';
import { splitWrap, viewerHTML } from '../parts/viewer/shell.js';

// Экран создания ОЦ. Сознательно отдельный файл от ocForm.view.js, не общий
// с редактированием — по составу совпадает с ним на 2026-08-21, но это два
// разных экрана, которые дальше будут меняться независимо друг от друга
// (обобщения — враг).

function mainSection(rec) {
  return `<div class="card t-blue">
    <div class="card-head">
      <span class="card-idx">01</span>
      <h3>Основные параметры</h3>
    </div>

    <div class="card-pad">
      <div class="grid g-3">
        <div class="field">
          <label>Тип ОЦ</label>
          <select class="select" id="fType" disabled title="Тип задаётся модулем ОЦ">
            <option selected>${esc(rec.type)}</option>
          </select>
        </div>

        <div class="field">
          <label>Назначение по ТП</label>
          <input class="input" id="fPurpose" value="${esc(rec.purposeTP)}">
        </div>

        <div class="field">
          <label>Статус ОЦ</label>
          <select class="select" id="fStatus">
            ${STATUS_OC.map((s) => `<option ${s === rec.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="grid g-4" style="margin-top:10px">
        <div class="field">
          <label>Категория ОЦ</label>
          <select class="select" id="fCat" disabled title="Категория задаётся модулем ОЦ">
            <option selected>${esc(rec.category)}</option>
          </select>
        </div>

        <div class="field">
          <label>Код ЕНИ</label>
          <input class="input" id="fEni" value="${esc(rec.eni)}">
        </div>

        <div class="field">
          <label>Учреждение</label>
          <input class="input" id="fInst" value="${esc(rec.institution)}">
        </div>

        <div class="field">
          <label>Подвед</label>
          <input class="input" id="fPodved" value="${esc(rec.podved)}">
        </div>
      </div>

      <div class="grid g-2" style="margin-top:10px">
        <div class="field">
          <label>Адрес</label>
          <input class="input" id="fAddr" value="${esc(rec.address)}">
        </div>

        <div class="field">
          <label>GPS-координаты</label>
          <input class="input" id="fGps" value="${esc(rec.gps)}">
          <span class="muted" style="font-size:10px">впоследствии заполняется автоматически</span>
        </div>
      </div>
    </div>
  </div>`;
}

function compositionSection(rec) {
  return `<div class="card t-teal">
    <div class="card-head">
      <span class="card-idx">02</span>
      <h3>Состав и тип имущества</h3>
    </div>

    <div class="card-pad">
      <label class="inline-row" style="cursor:pointer">
        <input type="checkbox" id="fComplex" ${rec.complex ? 'checked' : ''}>
        Имущественный комплекс — разрешить добавление ТС и механизмов в состав ОЦ
      </label>
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

function docsSection(rec) {
  return `<div class="card t-slate">
    <div class="card-head">
      <span class="card-idx">04</span>
      <h3>Документы ОЦ</h3>
      <span class="hint">клик по строке — просмотрщик</span>

      <div class="dd" style="margin-left:auto">
        <button class="btn btn-primary btn-sm" data-dd-toggle>+ Прикрепить документ</button>
        <div class="dd-menu">
          ${DOC_TYPES.map((t) => `<button data-attach="${esc(t)}">${esc(t)}</button>`).join('')}
        </div>
      </div>
    </div>

    ${docsTableHTML(rec, true)}
  </div>`;
}

export function viewOCCreate(ctx) {
  const rec = ctx.rec;

  const stack = `<div class="oi-stack">
    ${mainSection(rec)}
    ${compositionSection(rec)}
    ${partiesSection(rec)}
    ${docsSection(rec)}
  </div>`;

  return `<div class="view-head">
    <button class="back-btn" data-back>← К карточке объекта</button>
    <span class="pill pill-gray">Создание ОЦ${rec.eni ? ' · ' + esc(rec.eni) : ''}</span>
    <button class="btn btn-primary" id="btnCreateOc">Создать и перейти к карточке</button>
    <button class="btn btn-ghost" data-back>Отмена</button>
  </div>

  ${splitWrap(
    (ctx.ui.viewer && ctx.ui.viewerDoc && ctx.ui.viewerDoc.scope === 'oc') ? viewerHTML(ctx) : null,
    stack
  )}`;
}
