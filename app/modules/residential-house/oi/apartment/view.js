import { yearFieldHTML } from '../../../../kernel/yearField.js';
import { emptyOptionHTML } from '../../../../kernel/emptyOption.js';
import { areaListHTML } from '../../../../kernel/areaList.js';
import { blockNumbers } from '../../../../kernel/blockIndex.js';
import { structMS } from '../../parts/struct/ms.js';
import { fmtEni } from '../../../../kernel/fmt.js';
import { specialsBlockHTML } from '../../parts/specials/view.js';
import { esc } from '../../../../kernel/dom.js';
import {
  STATUS_BUILD, STRUCT,
  APARTMENT_SERIES, APARTMENT_LOCATIONS, APARTMENT_RIGHTS,
} from '../../data/dictionaries.js';
import { opt } from '../../data/opts.js';
import { floorsBlock } from './floors.view.js';
import { heatingMS } from './heating.js';
import { photoAccordions } from '../../parts/photos/blocks.js';
import { splitWrap, viewerHTML } from '../../parts/viewer/shell.js';

// Материал теперь мультивыбор: в одном элементе их может быть несколько
// (кирпич и монолит, металл и профлист), одним значением это не описать.
// Поле работает так же, как «Отопление» — см. parts/struct/ms.js.
// Аргумент val больше не нужен: значения читаются из oi.struct.
function structField(oi, key, label, opts, val, req) {
  return structMS(oi, key, label, opts, req);
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

</div>`;
}

function generalCard(ctx, oi, idx) {
  const apt = oi.apartment || {};
  const showLocationOther = apt.location === 'Прочее';
  const showRightsOther = apt.rights === 'Иное';

  return `<div class="card t-blue" id="q-gen">
<div class="card-head" data-card-toggle>
<span class="card-idx">${String(idx).padStart(2, '0')}</span>
<h3>Общие параметры квартиры</h3>
<span class="hint">${esc(oi.name)}</span>
<span class="head-eni" title="Код ЕНИ — правится здесь">
<label>ЕНИ</label>
<input class="input mono" data-head-eni value="${esc(fmtEni(oi.eni))}"></span>
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
${yearFieldHTML(oi, 'Год постройки')}
</div>
<div class="grid g-2" style="margin-top:10px">
<div class="field">
<label>Серия</label>
<div class="inline-row">
<select class="select" data-apt-series style="flex:1 1 160px">
${emptyOptionHTML(opt('apartment', 'series', APARTMENT_SERIES))}
${opt('apartment', 'series', APARTMENT_SERIES).map((series) => `<option ${series === apt.series ? 'selected' : ''}>${esc(series)}</option>`).join('')}
</select>
<input class="input" data-apt-series-other placeholder="Укажите серию" maxlength="60"
  value="${esc(apt.seriesOther || '')}" style="flex:1 1 140px;${apt.series === 'Прочее' ? '' : 'display:none'}">
</div>
</div>
<div class="field">
<label>Положение на этаже</label>
<div class="inline-row">
<select class="select" data-apt-location style="flex:1 1 160px;">
${emptyOptionHTML(opt('apartment', 'location', APARTMENT_LOCATIONS))}
${opt('apartment', 'location', APARTMENT_LOCATIONS).map((location) => `<option ${location === apt.location ? 'selected' : ''}>${location}</option>`).join('')}
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
${emptyOptionHTML(opt('apartment', 'rights', APARTMENT_RIGHTS))}
${opt('apartment', 'rights', APARTMENT_RIGHTS).map((right) => `<option ${right === apt.rights ? 'selected' : ''}>${right}</option>`).join('')}
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
<div class="sec-h" style="margin-top:12px">Адрес и координаты</div>
<div class="grid g-4" style="margin-top:6px">
<div class="field"><label>Улица</label>
<input class="input" data-oi-street value="${esc(oi.street || '')}" placeholder="Байтик Баатыра">
</div>
<div class="field"><label>Дом</label>
<input class="input" data-oi-house value="${esc(oi.house || '')}" placeholder="42">
</div>
<div class="field"><label>Квартира</label>
<input class="input" data-oi-flat value="${esc(oi.flat || '')}" placeholder="78">
</div>
<div class="field"><label>Координаты (широта, долгота)</label>
<input class="input mono" data-oi-gps value="${esc(oi.gps || '')}"
placeholder="42.874722, 74.612222" title="Из карты или прибора: сначала широта, потом долгота">
</div>
</div>
<div class="muted" style="font-size:11px;margin-top:6px">Город, район и микрорайон общие для записи — они задаются в объекте оценки.</div>
</div></div>
</div>`;
}

// Блок 02 квартиры: площади + лоджии/балконы + развёртка (при этажности > 1).
function areasCard(ctx, oi, idx) {
  const areas = oi.areas || {};
  const heights = oi.heights || {};
  const apt = oi.apartment || {};


  return `<div class="card t-blue" id="q-areas">
<div class="card-head" data-card-toggle><span class="card-idx">${String(idx).padStart(2, '0')}</span><h3>Площади квартиры</h3><span class="chev">▾</span></div>
<div class="card-body-wrap"><div class="card-pad">
<div class="grid g-4">
<div class="field"><label>Общая по правоустанавливающим документам, м²</label><input class="input" data-area="pud" value="${esc(areas.pud || '')}"></div>
<div class="field"><label>Общая по техпаспорту, м²</label><input class="input" data-area="tp" value="${esc(areas.tp || '')}"></div>
<div class="field"><label>Общая по факту, м²</label><input class="input" data-area="fact" value="${esc(areas.fact || '')}"></div>
<div class="field"><label title="Она же площадь по наружным (внешним) замерам">Площадь застройки, м²</label><input class="input" data-area="build" value="${esc(areas.build || '')}" title="Она же площадь по наружным (внешним) замерам"></div>

</div>
<div id="floors-${oi.id}" style="margin-top:10px">${floorsBlock(ctx, oi)}</div>
<div class="grid g-2" style="margin-top:10px">
<div class="field"><label>Высота по внешним замерам, м</label><input class="input" data-height="ext" value="${esc(heights.ext || '')}"></div>
<div class="field"><label>Высота по внутренним замерам, м</label><input class="input" data-height="int" value="${esc(heights.int || '')}"></div>
</div>

</div></div>
</div>`;
}

function structCard(ctx, oi, idx) {
  const struct = oi.struct || {};

  return `<div class="card t-teal" id="q-struct">
<div class="card-head" data-card-toggle><span class="card-idx">${String(idx).padStart(2, '0')}</span><h3>Конструктивный состав / основные материалы (под вопросом)</h3><span class="chev">▾</span></div>
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
${specialsBlockHTML(oi)}
</div></div>
</div>`;
}

function plansCard(oi, idx) {
  const plans = oi.plans || [];

  return `<div class="card t-slate" id="q-plans">
<div class="card-head" data-card-toggle><span class="card-idx">${String(idx).padStart(2, '0')}</span><h3>Планировки</h3><span class="hint">отдельно от документов — для осмотрщиков</span><span class="chev">▾</span></div>
<div class="card-body-wrap"><div class="card-pad">
<!-- Оформление общее с лоджиями и поэтажкой (класс al): таблица идёт вплотную
     к краям блока, без зазоров и прямых углов внутри скругления. -->
<div class="al acc open">
<div class="acc-head" style="display:flex;align-items:center;gap:8px">
<span>Планировки</span>
<span class="pill-mini ${plans.length ? 'pill-pend' : ''}">${plans.length}</span>
<button class="btn btn-ghost btn-sm" data-add-plan>+ Планировка</button>
</div>
<div class="acc-body">
<table class="tbl al-tbl"><colgroup><col style="width:34px"><col><col style="width:110px"><col style="width:44px"></colgroup>
<thead><tr><th>№</th><th>Наименование</th><th>Дата</th><th></th></tr></thead>
<tbody>${plans.map((pl, i) => `<tr>
<td class="al-n">${i + 1}</td>
<td><input class="input" data-plan-name="${pl.id}" value="${esc(pl.name)}" placeholder="Наименование планировки"></td>
<td><input class="input" data-plan-date="${pl.id}" value="${esc(pl.date)}" placeholder="ДД.ММ.ГГГГ"></td>
<td class="al-act"><button class="btn btn-danger btn-sm" data-plan-del="${pl.id}" title="Удалить планировку">×</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Планировок нет.</td></tr>'}</tbody></table>
</div>
</div>
</div></div>
</div>`;
}

function photosCard(ctx, oi, idx) {
  return `<div class="card t-blue" id="q-photo">
<div class="card-head" data-card-toggle><span class="card-idx">${String(idx).padStart(2, '0')}</span><h3>Фото по категориям</h3>
<button class="btn btn-ghost btn-sm" data-open-pviewer style="margin-left:auto">Открыть просмотрщик</button><span class="chev">▾</span>
</div>
<div class="card-body-wrap"><div class="card-pad">
${photoAccordions(ctx.ui, oi, true)}
</div></div>
</div>`;
}

// Лоджии, балконы и террасы — свой блок (Л5.4): внутри «Площадей» они
// оказывались ниже высот, и их там не находили. У квартиры списки живут в
// oi.apartment, а не в самой литере.
function annexesCard(ctx, oi, idx) {
  return `<div class="card t-blue" id="q-annexes">
<div class="card-head" data-card-toggle><span class="card-idx">${String(idx).padStart(2, '0')}</span><h3>Лоджии, балконы и террасы</h3><span class="chev">▾</span></div>
<div class="card-body-wrap"><div class="card-pad">
${areaListHTML(oi.apartment, 'loggias', 'Лоджии', 'Лоджия', ctx.ui)}
${areaListHTML(oi.apartment, 'balconies', 'Балконы', 'Балкон', ctx.ui)}
${areaListHTML(oi.apartment, 'terraces', 'Террасы', 'Терраса', ctx.ui)}
</div></div>
</div>`;
}

export function render(ctx, oi) {

  const idx = blockNumbers();

  const cardBody = `<div class="oi-stack">
${generalCard(ctx, oi, idx())}
${areasCard(ctx, oi, idx())}
${annexesCard(ctx, oi, idx())}
${plansCard(oi, idx())}
${structCard(ctx, oi, idx())}
${photosCard(ctx, oi, idx())}
</div>`;

  return `${splitWrap(ctx.ui.viewer ? viewerHTML(ctx) : null, cardBody)}`;
}
