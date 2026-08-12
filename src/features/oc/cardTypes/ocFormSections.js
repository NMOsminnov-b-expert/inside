import { esc } from '../../../core/utils.js';
import { DICT, DOC_TYPES, OC_TYPES } from '../../../core/dictionaries.js';
import { ownersUsersHTML, responsiblesHTML } from '../partiesView.js';
import { docsTableHTML } from '../../docs/docsTable.js';

export function renderOcMainSection(oc) {
  const typeOptions = OC_TYPES.includes(oc.type)
    ? OC_TYPES
    : [oc.type, ...OC_TYPES];

  return `<div class="card t-blue">
    <div class="card-head">
      <span class="card-idx">01</span>
      <h3>Основные параметры</h3>
    </div>

    <div class="card-pad">
      <div class="grid g-3">
        <div class="field">
          <label>Тип ОЦ</label>
          <select class="select" id="fType">
            ${typeOptions.map((t) => `<option ${t === oc.type ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>

        <div class="field">
          <label>Назначение по ТП</label>
          <input class="input" id="fPurpose" value="${esc(oc.purposeTP)}">
        </div>

        <div class="field">
          <label>Статус ОЦ</label>
          <select class="select" id="fStatus">
            ${DICT.statusOC.map((s) => `<option ${s === oc.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="grid g-4" style="margin-top:10px">
        <div class="field">
          <label>Категория ОЦ</label>
          <select class="select" id="fCat">
            ${['Недвижимое', 'Движимое', 'Имущественный комплекс'].map((c) => `<option ${c === oc.category ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>

        <div class="field">
          <label>Код ЕНИ</label>
          <input class="input" id="fEni" value="${esc(oc.eni)}">
        </div>

        <div class="field">
          <label>Учреждение</label>
          <input class="input" id="fInst" value="${esc(oc.institution)}">
        </div>

        <div class="field">
          <label>Подвед</label>
          <input class="input" id="fPodved" value="${esc(oc.podved)}">
        </div>
      </div>

      <div class="grid g-2" style="margin-top:10px">
        <div class="field">
          <label>Адрес</label>
          <input class="input" id="fAddr" value="${esc(oc.address)}">
        </div>

        <div class="field">
          <label>GPS-координаты</label>
          <input class="input" id="fGps" value="${esc(oc.gps)}">
          <span class="muted" style="font-size:10px">впоследствии заполняется автоматически</span>
        </div>
      </div>
    </div>
  </div>`;
}

export function renderOcCompositionSection(oc) {
  const mov = oc.category === 'Движимое';

  return `<div class="card t-teal">
    <div class="card-head">
      <span class="card-idx">02</span>
      <h3>Состав и тип имущества</h3>
    </div>

    <div class="card-pad">
      ${mov ? `<div class="grid g-3">
        <div class="field">
          <label>Вид движимого</label>
          <select class="select" id="fMovType">
            ${['ТС', 'Механизмы и производственное оборудование', 'Офисная техника и мебель'].map((t) => `<option ${t === (oc.movType || 'ТС') ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>

        ${(oc.movType || 'ТС') !== 'ТС' ? `<div class="field">
          <label>Состав</label>
          <label class="inline-row" style="cursor:pointer">
            <input type="checkbox" id="fMovComplex" ${oc.movComplex ? 'checked' : ''}>
            Многосоставной объект (комплекс)
          </label>
        </div>` : ''}
      </div>

      <div class="grid g-3" style="margin-top:10px">
        <div class="field">
          <label>Наименование</label>
          <input class="input" id="fMovName" value="${esc(oc.movName || '')}">
        </div>

        <div class="field">
          <label>Год</label>
          <input class="input" id="fMovYear">
        </div>

        <div class="field">
          <label>Заводской номер / VIN</label>
          <input class="input" id="fMovSerial">
        </div>
      </div>` : `<label class="inline-row" style="cursor:pointer">
        <input type="checkbox" id="fComplex" ${oc.complex ? 'checked' : ''}>
        Имущественный комплекс — разрешить добавление ТС и механизмов в состав ОЦ
      </label>`}
    </div>
  </div>`;
}

export function renderOcPartiesSection() {
  return `<div class="card t-slate">
    <div class="card-head">
      <span class="card-idx">03</span>
      <h3>Собственники, пользователи и ответственные</h3>
      <span class="hint">без юриста</span>
    </div>

    <div class="card-pad">
      ${ownersUsersHTML()}
      <div class="sec-h">Ответственные</div>
      ${responsiblesHTML()}
    </div>
  </div>`;
}

export function renderOcDocsSection() {
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

    ${docsTableHTML(true)}
  </div>`;
}

export function renderOcBaseStack(oc) {
  return `<div class="oi-stack">
    ${renderOcMainSection(oc)}
    ${renderOcCompositionSection(oc)}
    ${renderOcPartiesSection()}
    ${renderOcDocsSection()}
  </div>`;
}

export function bindOcComplexCheckbox(oc) {
  const complexCheckbox = document.querySelector('#fComplex');

  if (complexCheckbox) {
    complexCheckbox.onchange = () => {
      oc.complex = complexCheckbox.checked;
    };
  }
}

export function bindOcMovableComplexCheckbox(oc) {
  const complexCheckbox = document.querySelector('#fMovComplex');

  if (complexCheckbox) {
    complexCheckbox.onchange = () => {
      oc.movComplex = complexCheckbox.checked;
    };
  }
}