import { areaListHTML } from '../../../../kernel/areaList.js';
import { yearFieldHTML } from '../../../../kernel/yearField.js';
import { structMS } from '../../parts/struct/ms.js';
import { fmtEni } from '../../../../kernel/fmt.js';
import { specialsBlockHTML } from '../../parts/specials/view.js';
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

// Материал теперь мультивыбор: в одном элементе их может быть несколько
// (кирпич и монолит, металл и профлист), одним значением это не описать.
// Поле работает так же, как «Отопление» — см. parts/struct/ms.js.
// Аргумент val больше не нужен: значения читаются из oi.struct.
function structField(oi, key, label, opts, val, req) {
  return structMS(oi, key, label, opts, req);
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
</div>
${flagsRowHTML(oi)}
<div class="grid g-3">
${yearFieldHTML(oi, 'Год постройки')}
<div class="field"><label>Тип строения${rq.buildTypeRequired ? '<span class="req">*</span>' : ''}</label>
<select class="select" data-buildtype>${buildTypeOptions(oi).map((o) => `<option ${o === oi.buildType ? 'selected' : ''}>${o}</option>`).join('')}</select>
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
<div class="field"><label>Общая по ПУД, м²</label><input class="input" data-area="pud" value="${esc(areas.pud || '')}"></div>
<div class="field"><label>Общая по техпаспорту, м²</label><input class="input" data-area="tp" value="${esc(areas.tp || '')}"></div>
<div class="field"><label>Общая по факту, м²</label><input class="input" data-area="fact" value="${esc(areas.fact || '')}"></div>
<div class="field"><label>Площадь застройки, м²</label><input class="input" data-area="build" value="${esc(areas.build || '')}"></div>
</div>
<div class="grid g-4" style="margin-top:10px">
${floorsCountField(oi)}
<div class="field"><label>Конструктивный тип мансарды</label>
<select class="select" data-mansard>${MANSARD_TYPE.map((o) => `<option ${o === (oi.mansardType || MANSARD_TYPE[0]) ? 'selected' : ''}>${o}</option>`).join('')}</select>
</div>
</div>
${areaListHTML(oi, 'loggias', 'Лоджии', 'Лоджия', ctx.ui)}
${areaListHTML(oi, 'balconies', 'Балконы', 'Балкон', ctx.ui)}
${areaListHTML(oi, 'terraces', 'Террасы', 'Терраса', ctx.ui)}
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
${specialsBlockHTML(oi)}
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

// «Отдельностоящее» доступно только обособленным строениям (Л2.5): это признак
// категории жилого строения, а не самостоятельный выбор. Пока категория не
// «Обособленный», такого варианта в списке нет.
//
// Уже сохранённое значение из списка не выбрасываем: иначе смена категории
// молча переписала бы данные. Оно остаётся видимым с пометкой, чтобы
// расхождение было заметно и его исправили руками.
function buildTypeOptions(oi) {
  // Правило действует только там, где рядом есть «Категория жилого строения»
  // (жилые строения). В гражданском и производственном такой категории нет
  // вовсе, и отбирать у них «Отдельностоящее» не за что.
  if (!oi.residential) return BUILD_TYPE.slice();

  const detached = (oi.resCat || '') === 'Обособленный';
  const list = detached ? BUILD_TYPE.slice() : BUILD_TYPE.filter((o) => o !== 'Отдельностоящее');
  if (oi.buildType && !list.includes(oi.buildType)) list.push(oi.buildType);
  return list;
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
<button class="btn btn-danger" data-del-oi="${oi.id}">Удалить литеру</button>
<button class="btn btn-ghost" data-open-ocdocs>Документы ОЦ</button>
<button class="btn btn-primary" data-save-oi>Сохранить</button>
<button class="btn btn-ghost" data-back>Отмена</button>
</div>
${splitWrap(ctx.ui.viewer ? viewerHTML(ctx) : null, cardBody)}`;
}
