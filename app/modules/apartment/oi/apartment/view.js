import { esc } from '../../../../kernel/dom.js';
import {
  STATUS_BUILD, STRUCT,
  APARTMENT_SERIES, APARTMENT_LOCATIONS, APARTMENT_RIGHTS,
} from '../../data/dictionaries.js';
import { apartmentFloorsBlock } from './floors.view.js';
import { heatingMS } from './heating.js';
import { photoAccordions } from '../../parts/photos/blocks.js';
import { docsBlockInner } from '../../parts/docs/table.js';
import { splitWrap, viewerHTML } from '../../parts/viewer/shell.js';

function structField(oi, key, label, opts, val, req) {
  const isOther = String(val).includes('Прочее');
  const other = (oi.structOther || {})[key] || '';

  return `<div class="field"><label>${label}${req ? '<span class="req">*</span>' : ''}</label>
<select class="select" data-struct="${key}">${opts.map((o) => `<option ${o === val ? 'selected' : ''}>${o}</option>`).join('')}</select>
${isOther ? `<input class="input" data-struct-other="${key}" placeholder="Укажите вручную" value="${esc(other)}">` : ''}
</div>`;
}

function letterControlHTML(ctx, oi) {
  if (ctx.ui.letterEdit) {
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

function generalCard(ctx, oi) {
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
${letterControlHTML(ctx, oi)}
</div>
<div class="field" style="flex:1 1 180px;">
<label>Наименование</label>
<input class="input" style="width:100%;" data-oi-name value="${esc(oi.name)}">
</div>
<div class="field" style="flex:0 0 150px;">
<label>Статус</label>
<select class="select" style="width:100%;" data-status>
${STATUS_BUILD.map((o) => `<option ${o === oi.status ? 'selected' : ''}>${o}</option>`).join('')}
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
<label>Этаж</label>
<input class="input" data-apt-floor value="${esc(apt.floor || '')}" inputmode="numeric">
</div>
<div class="field">
<label>Этажность дома</label>
<input class="input" data-apt-building-floors value="${esc(apt.buildingFloors || '')}" inputmode="numeric">
</div>
<div class="field">
<label>Количество этажей в квартире</label>
<input class="input" data-apt-storeys value="${esc(apt.storeys || '1')}"
inputmode="numeric" min="1" max="30" title="Количество этажей квартиры (до 30)">
</div>
<div class="field">
<label>Количество комнат</label>
<input class="input" data-apt-rooms value="${esc(apt.rooms || '')}" inputmode="numeric">
</div>
</div>
<div class="grid g-2" style="margin-top:10px">
<div class="field">
<label>Серия</label>
<input class="input" list="apartmentSeriesList" data-apt-series value="${esc(apt.series || '')}" placeholder="Введите или выберите серию">
<datalist id="apartmentSeriesList">
${APARTMENT_SERIES.map((series) => `<option value="${esc(series)}">`).join('')}
</datalist>
</div>
<div class="field">
<label>Положение на этаже</label>
<div class="inline-row">
<select class="select" data-apt-location style="flex:1 1 160px;">
<option value="">Не выбрано</option>
${APARTMENT_LOCATIONS.map((location) => `<option ${location === apt.location ? 'selected' : ''}>${location}</option>`).join('')}
</select>
<input
class="input"
data-apt-location-other
placeholder="Укажите положение"
value="${esc(apt.locationOther || '')}"
maxlength="50"
style="flex:1 1 160px; ${showLocationOther ? '' : 'display:none;'}"
>
</div>
</div>
</div>
<div class="grid g-2" style="margin-top:10px">
<div class="field">
<label>Права на строение</label>
<div class="inline-row">
<select class="select" data-apt-rights style="flex:1 1 200px;">
<option value="">Не выбрано</option>
${APARTMENT_RIGHTS.map((right) => `<option ${right === apt.rights ? 'selected' : ''}>${right}</option>`).join('')}
</select>
<input
class="input"
data-apt-rights-other
placeholder="Укажите право"
value="${esc(apt.rightsOther || '')}"
maxlength="100"
style="flex:1 1 200px; ${showRightsOther ? '' : 'display:none;'}"
>
</div>
</div>
</div>
</div></div>
</div>`;
}

// Блок 02 квартиры: площади + лоджии/балконы + развёртка (при этажности > 1).
function areasCard(ctx, oi) {
  const areas = oi.areas || {};
  const apt = oi.apartment || {};
  const storeys = parseInt(apt.storeys, 10) || 1;
  const showFloors = storeys > 1;

  return `<div class="card t-blue" id="q-areas">
<div class="card-head" data-card-toggle><span class="card-idx">02</span><h3>Площади квартиры</h3><span class="chev">▾</span></div>
<div class="card-body-wrap"><div class="card-pad">
<div class="grid g-4">
<div class="field"><label>Общая по техпаспорту, м²</label><input class="input" data-area="tp" value="${esc(areas.tp || '')}"></div>
<div class="field"><label>Общая по ПУД, м²</label><input class="input" data-area="pud" value="${esc(areas.pud || '')}"></div>
<div class="field"><label>Общая по факту, м²</label><input class="input" data-area="fact" value="${esc(areas.fact || '')}"></div>
<div class="field"><label>Площадь застройки, м²</label><input class="input" data-area="build" value="${esc(areas.build || '')}"></div>

</div>
<div>
${showFloors ? apartmentFloorsBlock(ctx, oi) : ''}
</div>
<div class="sec-h" style="margin-top:14px">Лоджии и балконы</div>
<div class="grid g-4">
<div class="field">
<label>Кол-во лоджий</label>
<input class="input" data-apt-loggia-count value="${esc(apt.loggiaCount || '')}"
inputmode="numeric" min="0" max="10" placeholder="до 10">
</div>
<div class="field">
<label>Кол-во балконов / террас</label>
<input class="input" data-apt-balcony-count value="${esc(apt.balconyCount || '')}"
inputmode="numeric" min="0" max="10" placeholder="до 10">
</div>
<div class="field">
<label>Площадь застройки лоджий, м²</label>
<input class="input" data-apt-loggia-area value="${esc(apt.loggiaBuildArea || '')}"
inputmode="decimal" min="0" max="500" placeholder="до 500">
</div>
<div class="field">
<label>Площадь застройки балконов / террас, м²</label>
<input class="input" data-apt-balcony-area value="${esc(apt.balconyBuildArea || '')}"
inputmode="decimal" min="0" max="500" placeholder="до 500">
</div>
</div>

</div></div>
</div>`;
}

function structCard(ctx, oi, idx = 3) {
  const struct = oi.struct || {};

  return `<div class="card t-teal" id="q-struct">
<div class="card-head" data-card-toggle><span class="card-idx">${String(idx).padStart(2, '0')}</span><h3>Конструктивный состав</h3><span class="chev">▾</span></div>
<div class="card-body-wrap"><div class="card-pad">
<div class="grid g-4">
${structField(oi, 'foundation', 'Фундамент', STRUCT.foundation, struct.foundation)}
${structField(oi, 'wallsExt', 'Наружные стены', STRUCT.wallsExt, struct.wallsExt)}
${structField(oi, 'ceilings', 'Перекрытия', STRUCT.ceilings, struct.ceilings)}
${structField(oi, 'roof', 'Кровля', STRUCT.roof, struct.roof)}
</div>
<div class="grid g-4" style="margin-top:8px">
${structField(oi, 'floors', 'Полы', STRUCT.floors, struct.floors)}
${structField(oi, 'windows', 'Окна', STRUCT.windows, struct.windows)}
${structField(oi, 'doors', 'Двери', STRUCT.doors, struct.doors)}
${heatingMS(ctx, oi)}
</div>
<div class="field" style="margin-top:8px"><label>Комментарий</label><textarea class="textarea" data-comment>${esc(oi.comment || '')}</textarea></div>
</div></div>
</div>`;
}

function docsCard(oi, idx = 4) {
  return `<div class="card t-slate" id="q-docs">
<div class="card-head" data-card-toggle><span class="card-idx">${String(idx).padStart(2, '0')}</span><h3>Документы</h3><span class="chev">▾</span></div>
<div class="card-body-wrap"><div class="card-pad">
${docsBlockInner(oi, oi.id)}
</div></div>
</div>`;
}

function photosCard(ctx, oi, idx = 5) {
  return `<div class="card t-blue" id="q-photo">
<div class="card-head" data-card-toggle><span class="card-idx">${String(idx).padStart(2, '0')}</span><h3>Фото по категориям</h3>
<button class="btn btn-ghost btn-sm" data-open-pviewer style="margin-left:auto">Открыть просмотрщик</button><span class="chev">▾</span>
</div>
<div class="card-body-wrap"><div class="card-pad">
${photoAccordions(ctx.ui, oi, true)}
</div></div>
</div>`;
}

export function render(ctx, oi) {
  const f = oi.flags || {};
  const isMl = (oi.origin || 'manual') === 'ml';

  const cardBody = `<div class="oi-stack">
${generalCard(ctx, oi)}
${areasCard(ctx, oi)}
${structCard(ctx, oi, 3)}
${docsCard(oi, 4)}
${photosCard(ctx, oi, 5)}
</div>`;

  return `<div class="view-head">
<button class="back-btn" data-back>← К объекту оценки</button>
<span class="pill pill-gray">Карточка квартиры</span>
<label class="flag-lbl"><input type="checkbox" data-flag="entered" ${f.entered ? 'checked' : ''}> Введено</label>${isMl ? `<label class="flag-lbl"><input type="checkbox" data-flag="matched" ${f.matched ? 'checked' : ''}> Сопоставлено с фото</label>` : ''}
<button class="btn btn-danger" data-del-oi="${oi.id}">Удалить литеру</button>
<button class="btn btn-ghost" data-open-ocdocs>Документы ОЦ</button>
<button class="btn btn-primary" data-save-oi>Сохранить</button>
<button class="btn btn-ghost" data-back>Отмена</button>
</div>
${splitWrap(ctx.ui.viewer ? viewerHTML(ctx) : null, cardBody)}`;
}
