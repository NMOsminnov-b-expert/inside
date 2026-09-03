import { esc } from '../../../../kernel/dom.js';
import { fmtEni } from '../../../../kernel/fmt.js';
import {
  STATUS_BUILD, DOC_TYPES, LAND_TYPES, LAND_USE_CATEGORIES, IRRIGATION_ACCESS,
  LAND_LOCATION, LAND_ROAD_LOCATION, LAND_CORNER, LAND_ENCUMBRANCE,
  LAND_BUILDINGS, LAND_UTILITY_STATUS, LAND_FORM, IRRIGATION_TYPE, LAND_RELIEF,
} from '../../data/dictionaries.js';
import { opt } from '../../data/opts.js';
import { utilitiesMS } from './utilities.js';
import { improvementsMS } from './improvements.js';
import { photoAccordions } from '../../parts/photos/blocks.js';
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
<div class="grid g-4"><div class="field"><label>Тип земельного участка</label><select class="select" data-land-type>${options(opt('land', 'landType', LAND_TYPES), oi.landType)}</select></div>
<div class="field"><label>Назначение</label><input class="input" data-land-purpose value="${esc(oi.purpose || '')}"></div>
<div class="field"><label>Статус</label><select class="select" data-status>${STATUS_BUILD.map((o) => `<option ${o === oi.status ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
<div class="field"><label>ЕНИ</label><input class="input mono" data-land-eni value="${esc(fmtEni(oi.eni))}"></div></div>
<div class="grid g-3" style="margin-top:10px"><div class="field"><label>Площадь земельного участка по правоустанавливающим документам, кв.м.</label><input class="input" data-land-area="pravo" value="${esc(areas.pravo || '')}"></div>
<div class="field"><label>Площадь земельного участка по факту, кв.м.</label><input class="input" data-land-area="fact" value="${esc(areas.fact || '')}"></div>
<div class="field"><label>Права на земельный участок</label><input class="input" data-land-rights value="${esc(oi.rights || '')}"></div></div>
<div class="grid g-2" style="margin-top:10px"><div class="field"><label>Форма участка</label>
<div class="inline-row">
<select class="select" data-land-form style="flex:1 1 200px">${options(opt('land', 'form', LAND_FORM), oi.form)}</select>
<input class="input" data-land-form-other placeholder="Впишите форму" maxlength="80"
  value="${esc(oi.formOther || '')}" style="flex:1 1 160px;${oi.form === 'Иное' ? '' : 'display:none'}"></div>
</div></div>
</div></div>`;
}

function agriculturalCard(ctx, oi) {
  return `<div class="card t-blue"><div class="card-head"><span class="card-idx">02</span><h3>Сельскохозяйственные характеристики</h3></div><div class="card-pad"><div class="grid g-3">
${selectField('Категория и разрешенное использование', 'data-land-use', opt('land', 'useCategory', LAND_USE_CATEGORIES), oi.useCategory)}${selectField('Доступность полива', 'data-land-irrigation', opt('land', 'irrigation', IRRIGATION_ACCESS), oi.irrigation)}${selectField('Тип полива', 'data-land-irrigation-type', opt('land', 'irrigationType', IRRIGATION_TYPE), oi.irrigationType)}<div class="field"><label>Тип почвы</label><input class="input" data-land-soil value="${esc(oi.soil || '')}"></div>
<div class="field"><label>Балл бонитета</label><input class="input" data-land-bonitet value="${esc(oi.bonitet || '')}"></div><div class="field"><label>Каменистость</label><input class="input" data-land-stoniness value="${esc(oi.stoniness || '')}"></div></div>
<div class="grid g-3" style="margin-top:10px">${utilitiesMS(ctx, oi)}</div></div></div>`;
}

function nonAgriculturalCard(oi) {
  return `<div class="card t-blue"><div class="card-head"><span class="card-idx">02</span><h3>Несельскохозяйственные характеристики</h3></div><div class="card-pad"><div class="grid g-3">
<div class="field"><label>Застроенная площадь земельного участка, кв.м.</label><input class="input" data-land-area="build" value="${esc((oi.areas || {}).build || '')}"></div>
${selectField('Наличие газификации', 'data-land-gas', opt('land', 'gasification', LAND_UTILITY_STATUS), oi.gasification)}${selectField('Наличие центрального отопления', 'data-land-central-heating', opt('land', 'centralHeating', LAND_UTILITY_STATUS), oi.centralHeating)}${selectField('Наличие центрального водоснабжения', 'data-land-water', opt('land', 'centralWater', LAND_UTILITY_STATUS), oi.centralWater)}${selectField('Наличие автономного отопления', 'data-land-autonomous-heating', opt('land', 'autonomousHeating', LAND_UTILITY_STATUS), oi.autonomousHeating)}</div></div></div>`;
}

function locationCard(ctx, oi) {
  const showEncArea = oi.encumbrance === 'Есть';
  const showBuildings = oi.buildings === 'Есть';

  // Переключатели «Нет/Есть» и их зависимые поля идут одной гибкой строкой, а
  // не каждый в своей сетке: раньше при «Нет» рядом с одиноким селектом
  // оставались пустые колонки во всю ширину карточки. Здесь поля занимают
  // столько, сколько им нужно, и переносятся по мере появления.
  const conditional = [
    selectField('Наличие сервитутов и обременений', 'data-land-encumbrance', opt('land', 'encumbrance', LAND_ENCUMBRANCE), oi.encumbrance || 'Нет'),
    showEncArea ? `<div class="field"><label>Площадь сервитутов и обременений, кв.м. <span class="req">*</span></label><input class="input" data-land-encumbrance-area value="${esc(oi.encumbranceArea || '')}" required></div>` : '',
    selectField('Наличие построек', 'data-land-buildings', opt('land', 'buildings', LAND_BUILDINGS), oi.buildings || 'Нет'),
    showBuildings ? `<div class="field"><label>Тип построек <span class="req">*</span></label><input class="input" data-land-building-type value="${esc(oi.buildingType || '')}" required></div>` : '',
    showBuildings ? `<div class="field"><label>Площадь построек, кв.м. <span class="req">*</span></label><input class="input" data-land-building-area value="${esc(oi.buildingArea || '')}" required></div>` : '',
  ].join('');

  return `<div class="card t-blue"><div class="card-head"><span class="card-idx">03</span><h3>Местоположение и застройка</h3></div><div class="card-pad">
<div class="sec-h">Расположение</div>
<div class="grid g-4">${selectField('Расположение в районе', 'data-land-location', opt('land', 'location', LAND_LOCATION), oi.location)}${selectField('Расположение к трассе', 'data-land-road', opt('land', 'roadLocation', LAND_ROAD_LOCATION), oi.roadLocation)}${selectField('Угловой/Неугловой', 'data-land-corner', opt('land', 'corner', LAND_CORNER), oi.corner)}${selectField('Рельеф участка', 'data-land-relief', opt('land', 'relief', LAND_RELIEF), oi.relief)}</div>
<div class="field" style="margin-top:10px"><label>Особенности местоположения</label><textarea class="textarea ta-wide" data-land-location-features
  placeholder="Что важно знать об окружении: соседство, подъезд, вид, шум, затопляемость…">${esc(oi.locationFeatures || '')}</textarea></div>
<div class="sec-h">Благоустройство территории</div>
<div class="grid g-2">${improvementsMS(ctx, oi)}</div>
<div class="sec-h">Обременения и постройки</div>
<div class="field-flow">${conditional}</div></div></div>`;
}

export function render(ctx, oi) {
  const agricultural = oi.landType !== 'Несельскохозяйственный';
  const body = `<div class="oi-stack">${commonCard(oi)}${agricultural ? agriculturalCard(ctx, oi) : nonAgriculturalCard(oi)}${locationCard(ctx, oi)}<div class="card t-blue"><div class="card-head" data-card-toggle><span class="card-idx">05</span><h3>Фото по категориям</h3><button class="btn btn-ghost btn-sm" data-open-pviewer style="margin-left:auto">Открыть просмотрщик</button><span class="chev">▾</span></div><div class="card-body-wrap"><div class="card-pad">${photoAccordions(ctx.ui, oi, true)}</div></div></div></div>`;
  return `${splitWrap(ctx.ui.viewer ? viewerHTML(ctx) : null, body)}`;
}
