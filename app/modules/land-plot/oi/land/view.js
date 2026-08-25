import { esc } from '../../../../kernel/dom.js';
import {
  STATUS_BUILD, DOC_TYPES, LAND_TYPES, LAND_USE_CATEGORIES, IRRIGATION_ACCESS,
  LAND_LOCATION, LAND_ROAD_LOCATION, LAND_CORNER, LAND_ENCUMBRANCE,
  LAND_BUILDINGS, LAND_UTILITY_STATUS,
} from '../../data/dictionaries.js';
import { photoAccordions } from '../../parts/photos/blocks.js';
import { docsBlockInner } from '../../parts/docs/table.js';
import { splitWrap, viewerHTML } from '../../parts/viewer/shell.js';

function options(values, value) {
  return `<option value="">Не выбрано</option>${values.map((item) => `<option ${item === value ? 'selected' : ''}>${esc(item)}</option>`).join('')}`;
}

function selectField(label, attr, values, value) {
  return `<div class="field"><label>${label}</label><select class="select" ${attr}>${options(values, value)}</select></div>`;
}

function commonCard(oi) {
  const areas = oi.areas || {};
  return `<div class="card t-blue"><div class="card-head"><span class="card-idx">01</span><h3>Основные параметры</h3></div><div class="card-pad">
<div class="grid g-4"><div class="field"><label>Тип земельного участка</label><select class="select" data-land-type>${options(LAND_TYPES, oi.landType)}</select></div>
<div class="field"><label>Назначение</label><input class="input" data-land-purpose value="${esc(oi.purpose || '')}"></div>
<div class="field"><label>Статус</label><select class="select" data-status>${STATUS_BUILD.map((o) => `<option ${o === oi.status ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
<div class="field"><label>ЕНИ</label><input class="input" data-land-eni value="${esc(oi.eni || '')}"></div></div>
<div class="grid g-3" style="margin-top:10px"><div class="field"><label>Площадь земельного участка по правоустанавливающим документам, кв.м.</label><input class="input" data-land-area="pravo" value="${esc(areas.pravo || '')}"></div>
<div class="field"><label>Площадь земельного участка по факту, кв.м.</label><input class="input" data-land-area="fact" value="${esc(areas.fact || '')}"></div>
<div class="field"><label>Права на земельный участок</label><input class="input" data-land-rights value="${esc(oi.rights || '')}"></div></div>
<div class="grid g-2" style="margin-top:10px"><div class="field"><label>Форма</label><input class="input" data-land-form value="${esc(oi.form || '')}"></div></div>
</div></div>`;
}

function agriculturalCard(oi) {
  const utilities = oi.utilities || {};
  return `<div class="card t-blue"><div class="card-head"><span class="card-idx">02</span><h3>Сельскохозяйственные характеристики</h3></div><div class="card-pad"><div class="grid g-3">
${selectField('Категория и разрешенное использование', 'data-land-use', LAND_USE_CATEGORIES, oi.useCategory)}${selectField('Доступность полива', 'data-land-irrigation', IRRIGATION_ACCESS, oi.irrigation)}<div class="field"><label>Тип почвы</label><input class="input" data-land-soil value="${esc(oi.soil || '')}"></div>
<div class="field"><label>Балл бонитета</label><input class="input" data-land-bonitet value="${esc(oi.bonitet || '')}"></div><div class="field"><label>Каменистость</label><input class="input" data-land-stoniness value="${esc(oi.stoniness || '')}"></div></div>
<div class="sec-h">Коммуникации</div><div class="inline-row" style="gap:14px;flex-wrap:wrap">${[['electricity', 'Электричество'], ['water', 'Водопровод'], ['sewerage', 'Канализация'], ['heating', 'Центральное отопление']].map(([key, label]) => `<label class="flag-lbl"><input type="checkbox" data-land-utility="${key}" ${utilities[key] ? 'checked' : ''}> ${label}</label>`).join('')}</div></div></div>`;
}

function nonAgriculturalCard(oi) {
  return `<div class="card t-blue"><div class="card-head"><span class="card-idx">02</span><h3>Несельскохозяйственные характеристики</h3></div><div class="card-pad"><div class="grid g-3">
<div class="field"><label>Застроенная площадь земельного участка, кв.м.</label><input class="input" data-land-area="build" value="${esc((oi.areas || {}).build || '')}"></div>
${selectField('Наличие газификации', 'data-land-gas', LAND_UTILITY_STATUS, oi.gasification)}${selectField('Наличие центрального отопления', 'data-land-central-heating', LAND_UTILITY_STATUS, oi.centralHeating)}${selectField('Наличие центрального водоснабжения', 'data-land-water', LAND_UTILITY_STATUS, oi.centralWater)}${selectField('Наличие автономного отопления', 'data-land-autonomous-heating', LAND_UTILITY_STATUS, oi.autonomousHeating)}</div></div></div>`;
}

function locationCard(oi) {
  const showEncArea = oi.encumbrance === 'Есть';
  const showBuildings = oi.buildings === 'Есть';
    return `<div class="card t-blue"><div class="card-head"><span class="card-idx">03</span><h3>Местоположение и застройка</h3></div><div class="card-pad"><div class="grid g-3">
  ${selectField('Расположение в районе', 'data-land-location', LAND_LOCATION, oi.location)}${selectField('Расположение к трассе', 'data-land-road', LAND_ROAD_LOCATION, oi.roadLocation)}${selectField('Угловой/Неугловой', 'data-land-corner', LAND_CORNER, oi.corner)}</div>
<div class="field" style="margin-top:10px"><label>Особенности местоположения</label><textarea class="textarea" data-land-location-features>${esc(oi.locationFeatures || '')}</textarea></div>
<div class="grid g-2" style="margin-top:10px">${selectField('Наличие сервитутов и обременений', 'data-land-encumbrance', LAND_ENCUMBRANCE, oi.encumbrance || 'Нет')}${showEncArea ? `<div class="field"><label>Площадь сервитутов и обременений, кв.м. <span class="req">*</span></label><input class="input" data-land-encumbrance-area value="${esc(oi.encumbranceArea || '')}" required></div>` : ''}</div>
<div class="grid g-3" style="margin-top:10px">${selectField('Наличие построек', 'data-land-buildings', LAND_BUILDINGS, oi.buildings || 'Нет')}${showBuildings ? `<div class="field"><label>Тип построек <span class="req">*</span></label><input class="input" data-land-building-type value="${esc(oi.buildingType || '')}" required></div>` : ''}${showBuildings ? `<div class="field"><label>Площадь построек, кв.м. <span class="req">*</span></label><input class="input" data-land-building-area value="${esc(oi.buildingArea || '')}" required></div>` : ''}</div></div></div>`;
}

function documentsCard(oi) {
  return `<div class="card t-slate"><div class="card-head"><span class="card-idx">04</span><h3>Документы</h3></div><div class="card-pad">${docsBlockInner(oi, oi.id)}</div></div>`;
}

export function render(ctx, oi) {
  const agricultural = oi.landType !== 'Несельскохозяйственный';
  const body = `<div class="oi-stack">${commonCard(oi)}${agricultural ? agriculturalCard(oi) : nonAgriculturalCard(oi)}${locationCard(oi)}${documentsCard(oi)}<div class="card t-blue"><div class="card-head" data-card-toggle><span class="card-idx">05</span><h3>Фото по категориям</h3><button class="btn btn-ghost btn-sm" data-open-pviewer style="margin-left:auto">Открыть просмотрщик</button><span class="chev">▾</span></div><div class="card-body-wrap"><div class="card-pad">${photoAccordions(ctx.ui, oi, true)}</div></div></div></div>`;
  return `<div class="view-head"><button class="back-btn" data-back>← К объекту оценки</button><span class="pill pill-gray">Земельный участок</span><button class="btn btn-ghost" data-open-ocdocs>Документы ОЦ</button><button class="btn btn-primary" data-save-oi>Сохранить</button><button class="btn btn-ghost" data-back>Отмена</button></div>${splitWrap(ctx.ui.viewer ? viewerHTML(ctx) : null, body)}`;
}
