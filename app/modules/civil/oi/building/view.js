import { esc } from '../../../../kernel/dom.js';
import { STATUS_BUILD, BUILD_TYPE, STRUCT, RES_BUILD_CAT, RIGHTS, MANSARD_TYPE, WEAR_LEVEL, OI_CATEGORY_GROUPS, OI_CATEGORY_OTHER, PROD_FRAME, PROD_FLOORS, CRANE_BEAM } from '../../data/dictionaries.js';
import { floorsBlock, floorsCountField } from './floors.view.js';
import { heatingMS } from './heating.js';
import { photoAccordions } from '../../parts/photos/blocks.js';
import { docsBlockInner } from '../../parts/docs/table.js';
import { splitWrap, viewerHTML } from '../../parts/viewer/shell.js';

// Правила полей строения: что обязательно и что показывать.
export function fieldRules(ctx, oi) {
  const prod = (oi.catClass || '') === 'Производственно-складское';
  const ml = (oi.origin || 'manual') === 'ml';

  return {
    prod,
    heightRequired: prod,
    wallsRequired: prod,
    buildTypeRequired: !prod,
    showResCat: false,
    showMatched: ml,
    showCatClass: true,
  };
}

function structField(oi, key, label, opts, val, req) {
  const isOther = String(val).includes('Прочее');
  const other = (oi.structOther || {})[key] || '';

  return `<div class="field"><label>${label}${req ? '<span class="req">*</span>' : ''}</label>
<select class="select" data-struct="${key}">${opts.map((o) => `<option ${o === val ? 'selected' : ''}>${o}</option>`).join('')}</select>
${isOther ? `<input class="input" data-struct-other="${key}" placeholder="Укажите вручную" value="${esc(other)}">` : ''}
</div>`;
}

// Категория ОИ: сгруппированный select (optgroup по типу помещений, классы внутри).
function oiCategoryOptions(selected) {
  const groups = OI_CATEGORY_GROUPS.map((g) => `<optgroup label="${esc(g.label)}">
${g.classes.map((c, i) => {
    const val = `${g.key}-${i + 1}`;
    return `<option value="${val}" ${val === selected ? 'selected' : ''}>${esc(c)}</option>`;
  }).join('')}
</optgroup>`).join('');

  return `${groups}<option value="${OI_CATEGORY_OTHER.key}" ${OI_CATEGORY_OTHER.key === selected ? 'selected' : ''}>${esc(OI_CATEGORY_OTHER.label)}</option>`;
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
  const rq = fieldRules(ctx, oi);
  const showResCat = rq.showResCat;

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
<div class="grid g-3">
<div class="field"><label>Год постройки</label><input class="input" data-year value="${esc(oi.year || '')}" inputmode="numeric"></div>
<div class="field"><label>Тип строения${rq.buildTypeRequired ? '<span class="req">*</span>' : ''}</label>
<select class="select" data-buildtype>${BUILD_TYPE.map((o) => `<option ${o === oi.buildType ? 'selected' : ''}>${o}</option>`).join('')}</select>
</div>
<div class="field"><label>Права на строение</label>
<select class="select" data-rights>${RIGHTS.map((o) => `<option ${o === (oi.rights || RIGHTS[0]) ? 'selected' : ''}>${o}</option>`).join('')}</select>
</div>
<div class="field"><label>Категория ОИ</label>
<select class="select" data-oi-category>${oiCategoryOptions(oi.oiCategory || '')}</select>
</div>
${showResCat ? `<div class="field"><label>Категория жилого строения</label>
<select class="select" data-rescat>${RES_BUILD_CAT.map((o) => `<option ${o === (oi.resCat || RES_BUILD_CAT[0]) ? 'selected' : ''}>${o}</option>`).join('')}</select>
</div>` : ''}
${rq.showCatClass ? `<div class="field"><label>Назначение по тех паспорту</label>
<input class="input" data-catclass value="${esc(oi.catClass || '')}" placeholder="Укажите назначение вручную">
</div>` : ''}
</div>
${rq.showCatClass ? `<div class="inline-row" style="margin-top:10px; gap:14px; flex-wrap:wrap; align-items:center;">
<label class="flag-lbl"><input type="checkbox" data-dis ${oi.dis ? 'checked' : ''}> расхождение ТП и фото с осмотров</label>
</div>` : ''}
</div></div>
</div>`;
}

function areasCard(ctx, oi) {
  const rq = fieldRules(ctx, oi);
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
<div class="grid g-4" style="margin-top:10px">
${floorsCountField(oi)}
<div class="field"><label>Конструктивный тип мансарды</label>
<select class="select" data-mansard>${MANSARD_TYPE.map((o) => `<option ${o === (oi.mansardType || MANSARD_TYPE[0]) ? 'selected' : ''}>${o}</option>`).join('')}</select>
</div>
<div class="field"><label>Кол-во лоджий</label><input class="input" data-loggias-count value="${esc(oi.loggiasCount || '')}" inputmode="numeric"></div>
<div class="field"><label>Кол-во балконов/террас</label><input class="input" data-balconies-count value="${esc(oi.balconiesCount || '')}" inputmode="numeric"></div>
</div>
<div class="grid g-2" style="margin-top:10px">
<div class="field"><label>Общая площадь застройки лоджий, м²</label><input class="input" data-area="loggias" value="${esc(areas.loggias || '')}"></div>
<div class="field"><label>Общая площадь застройки балконов/террас, м²</label><input class="input" data-area="balconies" value="${esc(areas.balconies || '')}"></div>
</div>
<div id="floors-${oi.id}" style="margin-top:10px">${floorsBlock(ctx, oi)}</div>
<div class="grid g-2" style="margin-top:10px">
<div class="field"><label>Высота по внешним замерам, м${rq.heightRequired ? '<span class="req">*</span>' : ''}</label><input class="input" data-height="ext" value="${esc(heights.ext || '')}"></div>
<div class="field"><label>Высота по внутренним замерам, м</label><input class="input" data-height="int" value="${esc(heights.int || '')}"></div>
</div>
</div></div>
</div>`;
}

// Разбивка площадей/стоимости аренды — отдельный блок, строки заводит
// пользователь сам (без заготовленного списка этажей/помещений).
// Работа с документами по данному разделу (договоры аренды и т.п.)
// начнётся не ранее чем через 3 месяца — пока это просто табличный ввод.
const RENT_COLS = [
  { key: 'total', label: 'Общая площадь' },
  { key: 'useful', label: 'Полезная площадь' },
  { key: 'rentable', label: 'Сдаваемая площадь' },
  { key: 'rentValue', label: 'Стоимость сдаваемых площадей' },
];

function rentAreasCard(ctx, oi, idx = 3) {
  const rows = oi.rentAreas || [];

  return `<div class="card t-slate" id="q-rent">
<div class="card-head" data-card-toggle><span class="card-idx">${String(idx).padStart(2, '0')}</span><h3>Площади и стоимость аренды по этажам</h3><span class="chev">▾</span></div>
<div class="card-body-wrap"><div class="card-pad">
<div class="muted" style="font-size:11px;margin-bottom:8px">Раздел про работу с документами (договоры аренды и т.п.) — начнётся не ранее чем через 3 месяца; пока доступен только табличный ввод. Строки (этажи/помещения) добавляются вручную.</div>
${rows.length ? `<div style="overflow-x:auto">
<table class="tbl">
<thead><tr><th style="width:260px">Строка (этаж/помещение)</th>${RENT_COLS.map((c) => `<th>${c.label}</th>`).join('')}<th style="width:36px"></th></tr></thead>
<tbody>
${rows.map((r) => `<tr>
<td><input class="input" data-rent-label="${r.id}" value="${esc(r.label || '')}" placeholder="Например: Подвал"></td>
${RENT_COLS.map((c) => `<td><input class="input" data-rent-cell="${c.key}|${r.id}" value="${esc(r[c.key] || '')}"></td>`).join('')}
<td><button class="btn btn-ghost btn-sm" data-rent-del="${r.id}" title="Удалить строку">✕</button></td>
</tr>`).join('')}
</tbody>
</table>
</div>` : ''}
<button class="btn btn-ghost btn-sm" data-rent-add style="margin-top:8px">+ Добавить строку</button>
</div></div>
</div>`;
}

const WEAR_ITEMS = [
  { key: 'finish', label: 'Отделка' },
  { key: 'insulation', label: 'Утепление' },
  { key: 'roof', label: 'Кровля' },
  { key: 'plinth', label: 'Цоколь' },
  { key: 'floors', label: 'Полы' },
  { key: 'ceilings', label: 'Перекрытия' },
  { key: 'windows', label: 'Окна' },
  { key: 'doors', label: 'Двери' },
  { key: 'heating', label: 'Отопление' },
];

function wearField(oi, key, label) {
  const wear = oi.wear || {};
  const val = wear[key] || WEAR_LEVEL[0];

  return `<div class="field"><label>${label}</label>
<select class="select" data-wear="${key}">${WEAR_LEVEL.map((o) => `<option ${o === val ? 'selected' : ''}>${o}</option>`).join('')}</select>
</div>`;
}

function structCard(ctx, oi, idx = 3) {
  const rq = fieldRules(ctx, oi);
  const struct = oi.struct || {};

  return `<div class="card t-teal" id="q-struct">
<div class="card-head" data-card-toggle><span class="card-idx">${String(idx).padStart(2, '0')}</span><h3>Конструктивный состав</h3><span class="chev">▾</span></div>
<div class="card-body-wrap"><div class="card-pad">
<div class="grid g-4">
${structField(oi, 'foundation', 'Фундамент', STRUCT.foundation, struct.foundation)}
${structField(oi, 'wallsExt', 'Наружные стены', STRUCT.wallsExt, struct.wallsExt, rq.wallsRequired)}
${structField(oi, 'wallsInt', 'Внутренние стены', STRUCT.wallsExt, struct.wallsInt)}
${structField(oi, 'ceilings', 'Перекрытия', STRUCT.ceilings, struct.ceilings)}
</div>
<div class="grid g-4" style="margin-top:8px">
${structField(oi, 'roof', 'Кровля', STRUCT.roof, struct.roof)}
${structField(oi, 'floors', 'Полы', STRUCT.floors, struct.floors)}
${structField(oi, 'windows', 'Окна', STRUCT.windows, struct.windows)}
${structField(oi, 'doors', 'Двери', STRUCT.doors, struct.doors)}
</div>
<div class="grid g-3" style="margin-top:8px">
${heatingMS(ctx, oi)}
</div>
<div style="margin-top:12px">
<div class="sec-h">Износ конструктивных элементов</div>
<div class="grid g-3" style="margin-top:6px">
${WEAR_ITEMS.map((w) => wearField(oi, w.key, w.label)).join('')}
</div>
</div>
<div class="field" style="margin-top:8px"><label>Особенности</label><textarea class="textarea" data-features>${esc(oi.features || '')}</textarea></div>
<div class="field" style="margin-top:8px"><label>Комментарий</label><textarea class="textarea" data-comment>${esc(oi.comment || '')}</textarea></div>
</div></div>
</div>`;
}

// «Доп параметры» — только для строений с catClass «Производственно-складское».
function prodExtraCard(ctx, oi, idx) {
  return `<div class="card t-teal" id="q-prod">
<div class="card-head" data-card-toggle><span class="card-idx">${String(idx).padStart(2, '0')}</span><h3>Доп параметры (производственное строение)</h3><span class="chev">▾</span></div>
<div class="card-body-wrap"><div class="card-pad">
<div class="grid g-4">
<div class="field"><label>Высота, м (ТП)</label><input class="input" data-prod-height value="${esc(oi.prodHeight || '')}" inputmode="decimal"></div>
<div class="field"><label>Конструктив</label>
<select class="select" data-prod-frame>${PROD_FRAME.map((o) => `<option ${o === (oi.prodFrame || '') ? 'selected' : ''}>${o}</option>`).join('')}</select>
</div>
<div class="field"><label>Полы (несущая способность)</label>
<select class="select" data-prod-floors>${PROD_FLOORS.map((o) => `<option ${o === (oi.prodFloors || '') ? 'selected' : ''}>${o}</option>`).join('')}</select>
</div>
<div class="field"><label>Наличие/возможность кран-балки</label>
<select class="select" data-prod-crane>${CRANE_BEAM.map((o) => `<option ${o === (oi.craneBeam || CRANE_BEAM[0]) ? 'selected' : ''}>${o}</option>`).join('')}</select>
</div>
</div>
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
  const rq = fieldRules(ctx, oi);
  const docsIdx = rq.prod ? 6 : 5;

  const cardBody = `<div class="oi-stack">
${generalCard(ctx, oi)}
${areasCard(ctx, oi)}
${rentAreasCard(ctx, oi, 3)}
${structCard(ctx, oi, 4)}
${rq.prod ? prodExtraCard(ctx, oi, 5) : ''}
${docsCard(oi, docsIdx)}
${photosCard(ctx, oi, docsIdx + 1)}
</div>`;

  return `<div class="view-head">
<button class="back-btn" data-back>← К объекту оценки</button>
<span class="pill pill-gray">Карточка ОИ (литера)</span>
<label class="flag-lbl"><input type="checkbox" data-flag="entered" ${f.entered ? 'checked' : ''}> Введено</label>${isMl ? `<label class="flag-lbl"><input type="checkbox" data-flag="matched" ${f.matched ? 'checked' : ''}> Сопоставлено с фото</label>` : ''}
<button class="btn btn-danger" data-del-oi="${oi.id}">Удалить литеру</button>
<button class="btn btn-ghost" data-open-ocdocs>Документы ОЦ</button>
<button class="btn btn-primary" data-save-oi>Сохранить</button>
<button class="btn btn-ghost" data-back>Отмена</button>
</div>
${splitWrap(ctx.ui.viewer ? viewerHTML(ctx) : null, cardBody)}`;
}
