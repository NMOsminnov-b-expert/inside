import { OI, OC, appState } from '../../core/state.js';
import { esc } from '../../core/utils.js';
import {
  DICT,
  CATCLASS,
  RES_BUILD_CAT,
  APARTMENT_SERIES,
  APARTMENT_LOCATIONS,
  APARTMENT_RIGHTS,
} from '../../core/dictionaries.js';
import { oiFieldRules, isApartmentOi } from './oiModel.js';
import { floorsBlock } from './floorsView.js';
import { heatingMS } from './heating.js';
import { photoAccordions } from '../photos/photoBlocks.js';
import { docsBlockInner } from '../docs/docsTable.js';
import { splitWrap, viewerHTML } from '../viewer/viewerShell.js';
import { viewOC } from '../oc/ocView.js';

function structField(key, label, opts, val, req) {
  const isOther = String(val).includes('Прочее');
  return `<div class="field"><label>${label}${req ? '<span class="req">*</span>' : ''}</label>
<select class="select" data-struct="${key}">${opts.map((o) => `<option ${o === val ? 'selected' : ''}>${o}</option>`).join('')}</select>
${isOther ? `<input class="input" placeholder="Укажите вручную" value="">` : ''}
</div>`;
}

function letterControlHTML(oi) {
  if (appState.letterEdit) {
    return `<div style="display:flex; gap:4px; align-items:center;">
      <input class="input" style="width:80px; text-align:center; font-weight:700;"
        data-letter-input value="${esc(oi.letter)}"
        data-letter-id="${oi.id}">
      <button class="btn btn-primary btn-sm" data-letter-save data-letter-id="${oi.id}">Сохранить</button>
      <button class="btn btn-ghost btn-sm" data-letter-cancel data-letter-id="${oi.id}">Отмена</button>
    </div>`;
  }
  return `<span class="letter-clickable" data-edit-letter data-letter-id="${oi.id}"
    title="Кликните чтобы редактировать">${esc(oi.letter)}</span>`;
}

function flagsRowHTML(oi) {
  const f = oi.flags || {};
  const isMl = (oi.origin || 'manual') === 'ml';
  return `<div class="inline-row" style="margin-bottom:10px">
    <label class="flag-lbl"><input type="checkbox" data-flag="entered" ${f.entered ? 'checked' : ''}> Введено</label>
    ${isMl ? `<label class="flag-lbl"><input type="checkbox" data-flag="matched" ${f.matched ? 'checked' : ''}> Сопоставлено с фото</label>` : ''}
  </div>`;
}
function realtyGeneralCard(oi) {
  const rq = oiFieldRules(oi);
  const showResCat = rq.showResCat && OC.type === 'Жилое здание (дом)';
  return `<div class="card t-blue" id="q-gen">
    <div class="card-head" data-card-toggle>
      <span class="card-idx">01</span>
      <h3>Общие параметры</h3>
      <span class="hint">${esc(oi.name)}</span>
      <span class="chev">▾</span>
    </div>
    <div class="card-body-wrap"><div class="card-pad">
      <div class="inline-row" style="margin-bottom:10px; display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end;">
        <div class="field" style="flex:0 0 auto;">
          <label>Литера</label>
          ${letterControlHTML(oi)}
        </div>
        <div class="field" style="flex:1 1 180px;">
          <label>Наименование</label>
          <input class="input" style="width:100%;" data-oi-name value="${esc(oi.name)}">
        </div>
        <div class="field" style="flex:0 0 150px;">
          <label>Статус</label>
          <select class="select" style="width:100%;" data-status>
            ${DICT.statusBuild.map((o) => `<option ${o === oi.status ? 'selected' : ''}>${o}</option>`).join('')}
          </select>
        </div>
        <div class="field" style="flex:0 0 160px;">
          <label>ЕНИ код</label>
          <input class="eni-corner" style="width:100%;" data-oi-eni value="${esc(oi.eni)}" title="ЕНИ-код">
        </div>
      </div>
      ${flagsRowHTML(oi)}
      <div class="grid g-3">
        <div class="field"><label>Год постройки</label><input class="input" data-year value="${esc(oi.year || '')}" inputmode="numeric"></div>
        <div class="field"><label>Тип строения${rq.buildTypeRequired ? '<span class="req">*</span>' : ''}</label>
          <select class="select" data-buildtype>${DICT.buildType.map((o) => `<option ${o === oi.buildType ? 'selected' : ''}>${o}</option>`).join('')}</select>
        </div>
        ${showResCat ? `<div class="field"><label>Категория жилого строения</label>
          <select class="select" data-rescat>${RES_BUILD_CAT.map((o) => `<option ${o === (oi.resCat || RES_BUILD_CAT[0]) ? 'selected' : ''}>${o}</option>`).join('')}</select>
        </div>` : ''}
        ${rq.showCatClass ? `<div class="field"><label>Категория ОИ (категория → класс)</label>
          <select class="select" data-catclass>${CATCLASS.map((o) => `<option ${o === (oi.catClass || 'Гражданское здание') ? 'selected' : ''}>${o}</option>`).join('')}</select>
          <label class="inline-row" style="font-size:10.5px;font-weight:400"><input type="checkbox" data-dis ${oi.dis ? 'checked' : ''}> расхождение ТП и фото с осмотров</label>
          <span class="muted" style="font-size:10px">авто; допроверка — ЦОД, при отсутствии компетенций — оценщик</span>
        </div>` : ''}
      </div>
    </div></div>
  </div>`;
}
function apartmentGeneralCard(oi) {
  const apt = oi.apartment || {};
  const showLocationOther = apt.location === 'Прочее';
  const showRightsOther = apt.rights === 'Иное';

  return `<div class="card t-blue" id="q-gen">
    <div class="card-head" data-card-toggle>
      <span class="card-idx">01</span>
      <h3>Общие параметры квартиры</h3>
      <span class="hint">${esc(oi.name)}</span>
      <span class="chev">▾</span>
    </div>
    <div class="card-body-wrap"><div class="card-pad">
      <div class="inline-row" style="margin-bottom:10px; display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end;">
        <div class="field" style="flex:0 0 auto;">
          <label>Литера</label>
          ${letterControlHTML(oi)}
        </div>
        <div class="field" style="flex:1 1 180px;">
          <label>Наименование</label>
          <input class="input" style="width:100%;" data-oi-name value="${esc(oi.name)}">
        </div>
        <div class="field" style="flex:0 0 150px;">
          <label>Статус</label>
          <select class="select" style="width:100%;" data-status>
            ${DICT.statusBuild.map((o) => `<option ${o === oi.status ? 'selected' : ''}>${o}</option>`).join('')}
          </select>
        </div>
        <div class="field" style="flex:0 0 160px;">
          <label>ЕНИ код</label>
          <input class="eni-corner" style="width:100%;" data-oi-eni value="${esc(oi.eni)}" title="ЕНИ-код">
        </div>
      </div>

      ${flagsRowHTML(oi)}

      <div class="grid g-4">
        <div class="field">
          <label>Год постройки</label>
          <input class="input" data-year value="${esc(oi.year || '')}" inputmode="numeric">
        </div>
        <div class="field">
          <label>Этаж расположения</label>
          <input class="input" data-apt-floor value="${esc(apt.floor || '')}" inputmode="numeric">
        </div>
        <div class="field">
          <label>Этажность квартиры</label>
          <input class="input" data-apt-storeys value="${esc(apt.storeys || '')}"
                 inputmode="numeric" min="1" max="30" placeholder="до 30">
        </div>
        <div class="field">
          <label>Количество комнат</label>
          <input class="input" data-apt-rooms value="${esc(apt.rooms || '')}" inputmode="numeric">
        </div>
      </div>

      <div class="grid g-2" style="margin-top:10px">
        <div class="field">
          <label>Серия</label>
          <input class="input" list="apartmentSeriesList" data-apt-series
                 value="${esc(apt.series || '')}" placeholder="Введите или выберите серию">
          <datalist id="apartmentSeriesList">
            ${APARTMENT_SERIES.map((s) => `<option value="${esc(s)}">`).join('')}
          </datalist>
        </div>
        <div class="field">
          <label>Положение на этаже</label>
          <div class="inline-row">
            <select class="select" data-apt-location style="flex:1 1 160px;">
              <option value="">Не выбрано</option>
              ${APARTMENT_LOCATIONS.map((l) => `<option ${l === apt.location ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
            <input class="input" data-apt-location-other
                   placeholder="Укажите положение"
                   value="${esc(apt.locationOther || '')}"
                   maxlength="50"
                   style="flex:1 1 160px; ${showLocationOther ? '' : 'display:none;'}">
          </div>
        </div>
      </div>

      <div class="grid g-2" style="margin-top:10px">
        <div class="field">
          <label>Права на строение</label>
          <div class="inline-row">
            <select class="select" data-apt-rights style="flex:1 1 200px;">
              <option value="">Не выбрано</option>
              ${APARTMENT_RIGHTS.map((r) => `<option ${r === apt.rights ? 'selected' : ''}>${r}</option>`).join('')}
            </select>
            <input class="input" data-apt-rights-other
                   placeholder="Укажите право"
                   value="${esc(apt.rightsOther || '')}"
                   maxlength="100"
                   style="flex:1 1 200px; ${showRightsOther ? '' : 'display:none;'}">
          </div>
        </div>
      </div>
    </div></div>
  </div>`;
}

function realtyAreasCard(oi) {
  const rq = oiFieldRules(oi);
  const areas = oi.areas || {};
  const heights = oi.heights || {};
  return `<div class="card t-blue" id="q-areas">
    <div class="card-head" data-card-toggle><span class="card-idx">02</span><h3>Площади и этажность</h3><span class="chev">▾</span></div>
    <div class="card-body-wrap"><div class="card-pad">
      <div class="grid g-4">
        <div class="field"><label>Общая по техпаспорту, м²</label><input class="input" data-area="tp" value="${esc(areas.tp || '')}"></div>
        <div class="field"><label>Общая по ПУД, м²</label><input class="input" data-area="pud" value="${esc(areas.pud || '')}"></div>
        <div class="field"><label>Общая по факту, м²</label><input class="input" data-area="fact" value="${esc(areas.fact || '')}"></div>
        <div class="field"><label>Площадь застройки, м²</label><input class="input" data-area="build" value="${esc(areas.build || '')}"></div>
      </div>
      <div id="floors-${oi.id}" style="margin-top:10px">${floorsBlock(oi)}</div>
      <div class="grid g-2" style="margin-top:10px">
        <div class="field"><label>Высота по внешним замерам, м${rq.heightRequired ? '<span class="req">*</span>' : ''}</label><input class="input" data-height="ext" value="${esc(heights.ext || '')}"></div>
        <div class="field"><label>Высота по внутренним замерам, м</label><input class="input" data-height="int" value="${esc(heights.int || '')}"></div>
      </div>
    </div></div>
  </div>`;
}

function apartmentAreasCard(oi) {
  const areas = oi.areas || {};
  const apt = oi.apartment || {};

  return `<div class="card t-blue" id="q-areas">
    <div class="card-head" data-card-toggle>
      <span class="card-idx">02</span>
      <h3>Площади квартиры</h3>
      <span class="chev">▾</span>
    </div>
    <div class="card-body-wrap"><div class="card-pad">
      <div class="grid g-4">
        <div class="field">
          <label>Общая площадь, м²</label>
          <input class="input" data-area="tp" value="${esc(areas.tp || '')}">
        </div>
        <div class="field">
          <label>Жилая площадь, м²</label>
          <input class="input" data-area="living" value="${esc(areas.living || '')}">
        </div>
        <div class="field">
          <label>Площадь по ПУД, м²</label>
          <input class="input" data-area="pud" value="${esc(areas.pud || '')}">
        </div>
        <div class="field">
          <label>Площадь по факту, м²</label>
          <input class="input" data-area="fact" value="${esc(areas.fact || '')}">
        </div>
      </div>

      <div class="sec-h" style="margin-top:14px">Лоджии и балконы</div>
      <div class="grid g-4">
        <div class="field">
          <label>Кол-во лоджий</label>
          <input class="input" data-apt-loggia-count
                 value="${esc(apt.loggiaCount || '')}"
                 inputmode="numeric" min="0" max="10" placeholder="до 10">
        </div>
        <div class="field">
          <label>Кол-во балконов / террас</label>
          <input class="input" data-apt-balcony-count
                 value="${esc(apt.balconyCount || '')}"
                 inputmode="numeric" min="0" max="10" placeholder="до 10">
        </div>
        <div class="field">
          <label>Площадь застройки лоджий, м²</label>
          <input class="input" data-apt-loggia-area
                 value="${esc(apt.loggiaBuildArea || '')}"
                 inputmode="decimal" min="0" max="500" placeholder="до 500">
        </div>
        <div class="field">
          <label>Площадь застройки балконов / террас, м²</label>
          <input class="input" data-apt-balcony-area
                 value="${esc(apt.balconyBuildArea || '')}"
                 inputmode="decimal" min="0" max="500" placeholder="до 500">
        </div>
      </div>
    </div></div>
  </div>`;
}

function realtyStructCard(oi) {
  const rq = oiFieldRules(oi);
  const struct = oi.struct || {};
  const heatingSource = {
    ...oi,
    heating: Array.isArray(oi.heating) ? oi.heating : [],
    heatingOther: oi.heatingOther || '',
  };
  return `<div class="card t-teal" id="q-struct">
    <div class="card-head" data-card-toggle><span class="card-idx">03</span><h3>Конструктивный состав</h3><span class="chev">▾</span></div>
    <div class="card-body-wrap"><div class="card-pad">
      <div class="grid g-4">
        ${structField('foundation', 'Фундамент', DICT.foundation, struct.foundation)}
        ${structField('wallsExt', 'Наружные стены', DICT.wallsExt, struct.wallsExt, rq.wallsRequired)}
        ${structField('ceilings', 'Перекрытия', DICT.ceilings, struct.ceilings)}
        ${structField('roof', 'Кровля', DICT.roof, struct.roof)}
      </div>
      <div class="grid g-4" style="margin-top:8px">
        ${structField('floors', 'Полы', DICT.floors, struct.floors)}
        ${structField('windows', 'Окна', DICT.windows, struct.windows)}
        ${structField('doors', 'Двери', DICT.doors, struct.doors)}
        ${heatingMS(heatingSource)}
      </div>
      <div class="field" style="margin-top:8px"><label>Комментарий</label><textarea class="textarea" data-comment>${esc(oi.comment || '')}</textarea></div>
    </div></div>
  </div>`;
}

function docsCard(oi) {
  return `<div class="card t-slate" id="q-docs">
    <div class="card-head" data-card-toggle><span class="card-idx">04</span><h3>Документы</h3><span class="chev">▾</span></div>
    <div class="card-body-wrap"><div class="card-pad">
      ${docsBlockInner(oi, oi.id)}
    </div></div>
  </div>`;
}

function photosCard(oi) {
  return `<div class="card t-blue" id="q-photo">
    <div class="card-head" data-card-toggle><span class="card-idx">05</span><h3>Фото по категориям</h3>
      <button class="btn btn-ghost btn-sm" data-open-pviewer style="margin-left:auto">Открыть просмотрщик</button><span class="chev">▾</span>
    </div>
    <div class="card-body-wrap"><div class="card-pad">
      ${photoAccordions(oi, true)}
    </div></div>
  </div>`;
}

function realtyCards(oi) {
  return `<div class="oi-stack">
    ${realtyGeneralCard(oi)}
    ${realtyAreasCard(oi)}
    ${realtyStructCard(oi)}
    ${docsCard(oi)}
    ${photosCard(oi)}
  </div>`;
}

function apartmentCards(oi) {
  return `<div class="oi-stack">
    ${apartmentGeneralCard(oi)}
    ${apartmentAreasCard(oi)}
    ${realtyStructCard(oi)}
    ${docsCard(oi)}
    ${photosCard(oi)}
  </div>`;
}

function movableCards(oi) {
  const isV = oi.kind === 'vehicle';
  const f = oi.flags || {};
  const isMl = (oi.origin || 'manual') === 'ml';
  return `<div class="oi-stack">
    <div class="card t-blue"><div class="card-head"><span class="card-idx">01</span><h3>${isV ? 'Данные ТС' : oi.kind === 'mech' ? 'Данные механизма' : 'Данные офисной техники'}</h3></div>
      <div class="card-pad">
        <div class="inline-row" style="margin-bottom:10px">
          <label class="flag-lbl"><input type="checkbox" data-flag="entered" ${f.entered ? 'checked' : ''}> Введено</label>
          ${isMl ? `<label class="flag-lbl"><input type="checkbox" data-flag="matched" ${f.matched ? 'checked' : ''}> Сопоставлено с фото</label>` : ''}
        </div>
        ${isV ? `<div class="grid g-3">
          <div class="field"><label>Марка</label><input class="input" data-mv-make value="${esc(oi.make)}"></div>
          <div class="field"><label>Модель</label><input class="input" data-mv-model value="${esc(oi.model)}"></div>
          <div class="field"><label>Год выпуска</label><input class="input" data-mv-year value="${esc(oi.year)}"></div>
          <div class="field"><label>VIN</label><input class="input" data-mv-vin value="${esc(oi.vin)}"></div>
          <div class="field"><label>Гос. номер</label><input class="input" data-mv-plate value="${esc(oi.plate)}"></div>
        </div>` : `<div class="grid g-3">
          <div class="field"><label>Наименование</label><input class="input" data-mv-name value="${esc(oi.name)}"></div>
          <div class="field"><label>Год выпуска</label><input class="input" data-mv-year value="${esc(oi.year || '')}"></div>
          <div class="field"><label>Заводской / инв. номер</label><input class="input" data-mv-serial value="${esc(oi.serial || '')}"></div>
        </div>`}
      </div>
    </div>
    <div class="card t-slate"><div class="card-head"><span class="card-idx">02</span><h3>Документы</h3></div><div class="card-pad">${docsBlockInner(oi, oi.id)}</div></div>
  </div>`;
}

function landCards(oi) {
  return `<div class="oi-stack">
    <div class="card t-teal"><div class="card-head"><span class="card-idx">01</span><h3>Земельный участок (один ЕНИ)</h3></div>
      <div class="card-pad"><div class="grid g-4">
        <div class="field"><label>Назначение</label><input class="input" data-land-purpose value="${esc(oi.purpose)}"></div>
        <div class="field"><label>Общая площадь, м²</label><input class="input" data-land-area value="${esc(oi.area)}"></div>
        <div class="field"><label>Статус</label>
          <select class="select" data-status>${DICT.statusBuild.map((o) => `<option ${o === oi.status ? 'selected' : ''}>${o}</option>`).join('')}</select>
        </div>
        <div class="field"><label>ЕНИ</label><input class="input" readonly value="${esc(oi.eni)}"></div>
      </div></div>
    </div>
    <div class="card t-slate"><div class="card-head"><span class="card-idx">02</span><h3>Документы</h3></div><div class="card-pad">${docsBlockInner(oi, oi.id)}</div></div>
    <div class="card t-blue"><div class="card-head" data-card-toggle><span class="card-idx">03</span><h3>Фото по категориям</h3>
      <button class="btn btn-ghost btn-sm" data-open-pviewer style="margin-left:auto">Открыть просмотрщик</button><span class="chev">▾</span></div>
      <div class="card-body-wrap"><div class="card-pad">
        ${photoAccordions(oi, true)}
      </div></div>
    </div>
  </div>`;
}

export function viewOI() {
  const oi = OI.find((o) => o.id === appState.openOi);
  if (!oi) {
    return viewOC();
  }
  const isR = oi.kind === 'realty';
  const f = oi.flags || {};
  const isApartment = isApartmentOi(oi);
  const isMl = (oi.origin || 'manual') === 'ml';
  const cardLabel = isR
    ? isApartment
      ? 'Карточка квартиры'
      : 'Карточка ОИ (литера)'
    : oi.kind === 'land'
      ? 'Земельный участок'
      : oi.kind === 'vehicle'
        ? 'Транспортное средство'
        : oi.kind === 'office'
          ? 'Офисная техника'
          : 'Механизм';
  const cardBody = isR
    ? isApartment
      ? apartmentCards(oi)
      : realtyCards(oi)
    : oi.kind === 'land'
      ? landCards(oi)
      : movableCards(oi);
  return `<div class="view-head">
    <button class="back-btn" data-back>← К объекту оценки</button>
    <span class="pill pill-gray">${cardLabel}</span>
    ${isR ? `<label class="flag-lbl"><input type="checkbox" data-flag="entered" ${f.entered ? 'checked' : ''}> Введено</label>${isMl ? `<label class="flag-lbl"><input type="checkbox" data-flag="matched" ${f.matched ? 'checked' : ''}> Сопоставлено с фото</label>` : ''}` : ''}
    ${isR ? `<button class="btn btn-danger" data-del-oi="${oi.id}">Удалить литеру</button>` : ''}
    <button class="btn btn-ghost" data-open-ocdocs>Документы ОЦ</button>
    <button class="btn btn-primary" data-save-oi>Сохранить</button>
    <button class="btn btn-ghost" data-back>Отмена</button>
  </div>
  ${splitWrap(appState.viewer ? viewerHTML() : null, cardBody)}`;
}