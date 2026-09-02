import { fmtEni } from '../../../kernel/fmt.js';
import { esc } from '../../../kernel/dom.js';
import { STATUS_OC } from '../data/dictionaries.js';
import { ownersUsersHTML, responsiblesHTML } from './parties.view.js';
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
      <div class="grid g-4 g-roomy">
        <div class="field">
          <label>Тип ОЦ</label>
          <select class="select" id="fType" disabled title="Тип задаётся модулем ОЦ">
            <option selected>${esc(rec.type)}</option>
          </select>
        </div>

        <div class="field">
          <label>Категория ОЦ</label>
          <select class="select" id="fCat" disabled title="Категория задаётся модулем ОЦ">
            <option selected>${esc(rec.category)}</option>
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
        <div class="field">
          <label>Код ЕНИ</label>
          <input class="input mono" id="fEni" value="${esc(fmtEni(rec.eni))}">
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

    </div>
  </div>`;
}

function locationSection(rec) {
  return `<div class="card t-teal">
    <div class="card-head">
      <span class="card-idx">02</span>
      <h3>Местоположение</h3>
    </div>
    <div class="card-pad">
      <div class="grid g-2">
        <div class="field">
          <label>Адрес</label>
          <input class="input" id="fAddr" value="${esc(rec.address)}">
        </div>
        <div class="field">
          <label>GPS-координаты</label>
          <input class="input" id="fGps" value="${esc(rec.gps)}">
          <span class="field-hint">впоследствии заполняется автоматически</span>
        </div>
      </div>
    </div>
  </div>`;
}

function compositionSection(rec) {
  return `<div class="card t-teal">
    <div class="card-head">
      <span class="card-idx">03</span>
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
      <span class="card-idx">04</span>
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

export function viewOCCreate(ctx) {
  const rec = ctx.rec;

  const stack = `<div class="oi-stack">
    ${mainSection(rec)}
    ${locationSection(rec)}
    ${compositionSection(rec)}
    ${partiesSection(rec)}
  </div>`;

  return `<div class="view-head">
    <button class="back-btn" data-back>← К карточке объекта</button>
    <span class="pill pill-gray">Создание ОЦ${rec.eni ? ' · ' + esc(fmtEni(rec.eni)) : ''}</span>
    <button class="btn btn-primary" id="btnCreateOc">Создать и перейти к карточке</button>
    <button class="btn btn-ghost" data-back>Отмена</button>
  </div>

  ${splitWrap(
    // Просмотрщик рисуется всегда, а не только когда документ уже выбран: без
    // этого на пустом экране его не было вовсе, хотя на соседней вкладке той же
    // карточки он есть. Что показать, решает сам viewerHTML — открытый документ
    // либо приглашение выбрать/прикрепить.
    ctx.ui.viewer ? viewerHTML(ctx) : null,
    stack
  )}`;
}
