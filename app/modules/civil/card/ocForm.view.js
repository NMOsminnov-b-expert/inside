import { eniAllOwn } from '../../../kernel/eniFold.js';
import { pickSearchHTML } from '../../../kernel/pickSearch.js';
import { institutionOptions, podvedOptionsOf } from '../../../kernel/institutions.js';
import { ocFullAddress } from '../../../kernel/address.js';
import { esc } from '../../../kernel/dom.js';
import { ocTypes } from '../../../kernel/typeChange.js';
import { STATUS_OC } from '../data/dictionaries.js';
import { opt } from '../data/opts.js';
import { ownersUsersHTML, responsiblesHTML } from './parties.view.js';
import { partyNames } from '../records.js';
import { splitWrap, viewerHTML } from '../parts/viewer/shell.js';

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
          <select class="select" id="fType"
            title="Смена типа переносит объект в карточки другого типа — сначала покажем, что изменится">
            ${ocTypes().map((t) => `<option value="${esc(t.id)}" ${t.id === rec.typeId ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
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
            ${opt('oc', 'status', STATUS_OC).map((s) => `<option ${s === rec.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>

        <div class="field">
          <label>Код ЕНИ</label>
          <input class="input mono" id="fEni" value="${esc(eniAllOwn(rec))}">
        </div>

        <div class="field">
          <label>Головное учреждение</label>
          ${pickSearchHTML({
    key: 'inst',
    value: rec.institution,
    options: institutionOptions(),
    placeholder: 'Выберите головное учреждение',
    search: 'Поиск по названию или коду…',
  })}
        </div>

        <div class="field">
          <label>Подвед</label>
          ${pickSearchHTML({
    key: 'podved',
    value: rec.podved,
    options: podvedOptionsOf(rec.institution),
    placeholder: rec.institution ? 'Выберите подвед' : 'Сначала выберите учреждение',
    search: 'Поиск подведа…',
  })}
        </div>





      </div>
    </div>
  </div>`;
}

function locationSection(rec) {
  return `<div class="card t-amber">
    <div class="card-head">
      <span class="card-idx">02</span>
      <h3>Местоположение</h3>
    </div>

    <div class="card-pad">
      <!-- Источник адреса — портал Кадастра. Строкой над полями, а не кнопкой у
           поля адреса: запрос заполняет весь блок, а не одно поле, и видно, по
           какому коду он пойдёт, ещё до нажатия. Подстановка ТОЛЬКО по кнопке —
           автоматическая не давала убрать адрес вовсе: сотрёшь поля, тронешь
           код, и они заполнены снова (замечание пользователя 09.09.2026). -->
      <div class="src-row">
        <span class="src-ic" aria-hidden="true">⌖</span>
        <span class="src-name">Портал Кадастра</span>
        <span class="src-code" id="cadCode"></span>
        <span class="src-msg" id="cadMsg" role="status"></span>
        <button type="button" class="btn src-btn" id="btnCadastre">Заполнить адрес</button>
      </div>

      <!-- Порядок полей — от общего к частному, как называют адрес вслух:
           область, район, населённый пункт, микрорайон, улица, дом, квартира.
           Улица и дом переехали сюда из карточек объектов имущества (решение
           пользователя 09.09.2026): адрес у записи один, и держать его частями
           в каждом ОИ значило собирать одно и то же по кускам. -->
      <div class="grid g-4 g-roomy">
        <div class="field">
          <label>Область</label>
          <input class="input" id="fRegion" value="${esc(rec.region || '')}" placeholder="Чуйская область">
        </div>

        <div class="field">
          <label>Район</label>
          <input class="input" id="fDistrict" value="${esc(rec.district || '')}" placeholder="Первомайский р-н">
        </div>

        <div class="field">
          <label>Город или село</label>
          <input class="input" id="fCity" value="${esc(rec.city || '')}" placeholder="г. Бишкек">
        </div>

        <div class="field">
          <label>Микрорайон</label>
          <input class="input" id="fMicro" value="${esc(rec.micro || '')}" placeholder="мкр. Асанбай">
        </div>

        <div class="field">
          <label>Улица</label>
          <input class="input" id="fStreet" value="${esc(rec.street || '')}" placeholder="Киевская">
        </div>

        <div class="field">
          <label>Дом</label>
          <input class="input" id="fHouse" value="${esc(rec.house || '')}" placeholder="218">
        </div>

        <div class="field">
          <label>Квартира</label>
          <input class="input" id="fFlat" value="${esc(rec.flat || '')}" placeholder="12">
        </div>

        <div class="field">
          <label>GPS-координаты</label>
          <input class="input" id="fGps" value="${esc(rec.gps)}">
          <span class="field-hint">впоследствии заполняется автоматически</span>
        </div>

        <!-- Адрес записи можно не только читать, но и вставить целиком: что
             распозналось, раскидывается по полям выше (требование пользователя
             09.09.2026). Обратно он собирается из тех же полей, поэтому
             остаётся одним значением, а не вторым источником правды. -->
        <div class="field sp-all">
          <label>Адрес записи</label>
          <input class="input" id="fAddress" data-addr-sum value="${esc(ocFullAddress(rec))}"
            placeholder="Вставьте адрес целиком — разложим по полям">
          <span class="field-hint">собирается из полей выше; вставленный адрес разбирается по частям</span>
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
      ${ownersUsersHTML(rec, partyNames())}
      <div class="sec-h">Ответственные</div>
      ${responsiblesHTML(rec)}
    </div>
  </div>`;
}

export function viewOCForm(ctx) {
  const rec = ctx.rec;

  const stack = `<div class="oi-stack">
    ${mainSection(rec)}
      ${locationSection(rec)}
    ${compositionSection(rec)}
    ${partiesSection(rec)}
  </div>`;

  return `<div class="view-head">
    <button class="back-btn" data-back>← К карточке объекта</button>
    <span class="pill pill-gray">Редактирование ОЦ · ${esc(eniAllOwn(rec))}</span>
    <button class="btn btn-primary" id="btnSaveOc">Сохранить и вернуться</button>
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
