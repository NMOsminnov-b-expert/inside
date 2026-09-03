import { yearFieldHTML } from '../../../../kernel/yearField.js';
import { structMS } from '../../parts/struct/ms.js';
import { fmtEni } from '../../../../kernel/fmt.js';
import { specialsBlockHTML } from '../../parts/specials/view.js';
import { esc } from '../../../../kernel/dom.js';
import { STATUS_BUILD, BUILD_TYPE, STRUCT, RES_BUILD_CAT, WEAR_LEVEL, OI_CATEGORY_GROUPS, OI_CATEGORY_OTHER, PROD_FRAME, PROD_FLOORS, STRUCT_STRENGTH, CRANE_BEAM } from '../../data/dictionaries.js';
import { opt, optGroups } from '../../data/opts.js';
import { floorsBlock, floorsCountField } from './floors.view.js';
import { tempModeMS } from './tempMode.js';
import { heatingMS } from './heating.js';
import { photoAccordions } from '../../parts/photos/blocks.js';
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
  const groups = optGroups('building', 'category', OI_CATEGORY_GROUPS).map((g) => `<optgroup label="${esc(g.label)}">
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
${opt('building', 'status', STATUS_BUILD).map((o) => `<option ${o === oi.status ? 'selected' : ''}>${o}</option>`).join('')}
</select>
</div>
</div>
${flagsRowHTML(oi)}
<div class="grid g-3">
${yearFieldHTML(oi, 'Год постройки')}
<div class="field"><label>Тип строения${rq.buildTypeRequired ? '<span class="req">*</span>' : ''}</label>
<select class="select" data-buildtype>${opt('building', 'buildType', BUILD_TYPE).map((o) => `<option ${o === oi.buildType ? 'selected' : ''}>${o}</option>`).join('')}</select>
</div>
<div class="field"><label>Категория ОИ</label>
<select class="select" data-oi-category>${oiCategoryOptions(oi.oiCategory || '')}</select>
</div>
${showResCat ? `<div class="field"><label>Категория жилого строения</label>
<select class="select" data-rescat>${resCatOptions().map((o) => `<option ${o === oi.resCat ? 'selected' : ''}>${o}</option>`).join('')}</select>
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
<div class="field"><label title="Она же площадь по наружным (внешним) замерам">Площадь застройки, м²</label><input class="input" data-area="build" value="${esc(areas.build || '')}" title="Она же площадь по наружным (внешним) замерам"></div>
</div>
<div class="grid g-4" style="margin-top:10px">
${floorsCountField(oi)}
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
  const val = wear[key] || opt('building', 'wear', WEAR_LEVEL)[0];

  return `<div class="field"><label>${label}</label>
<select class="select" data-wear="${key}">${opt('building', 'wear', WEAR_LEVEL).map((o) => `<option ${o === val ? 'selected' : ''}>${o}</option>`).join('')}</select>
</div>`;
}

function structCard(ctx, oi, idx = 3) {
  const rq = fieldRules(ctx, oi);
  const struct = oi.struct || {};

  return `<div class="card t-teal" id="q-struct">
<div class="card-head" data-card-toggle><span class="card-idx">${String(idx).padStart(2, '0')}</span><h3>Конструктивный состав / основные материалы (под вопросом)</h3><span class="chev">▾</span></div>
<div class="card-body-wrap"><div class="card-pad">
<div class="grid g-4">
${structField(oi, 'foundation', 'Фундамент', opt('building', 'struct.foundation', STRUCT.foundation), struct.foundation)}
${structField(oi, 'wallsExt', 'Наружные стены', opt('building', 'struct.wallsExt', STRUCT.wallsExt), struct.wallsExt, rq.wallsRequired)}
${structField(oi, 'wallsInt', 'Внутренние стены', opt('building', 'struct.wallsInt', STRUCT.wallsExt), struct.wallsInt)}
${structField(oi, 'ceilings', 'Перекрытия', opt('building', 'struct.ceilings', STRUCT.ceilings), struct.ceilings)}
</div>
<div class="grid g-4" style="margin-top:8px">
${structField(oi, 'roof', 'Кровля', opt('building', 'struct.roof', STRUCT.roof), struct.roof)}
${structField(oi, 'floors', 'Полы', opt('building', 'struct.floors', STRUCT.floors), struct.floors)}
${structField(oi, 'windows', 'Окна', opt('building', 'struct.windows', STRUCT.windows), struct.windows)}
${structField(oi, 'doors', 'Двери', opt('building', 'struct.doors', STRUCT.doors), struct.doors)}
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
<div class="grid g-3">
<div class="field"><label>Высота, м (ТП)</label><input class="input" data-prod-height value="${esc(oi.prodHeight || '')}" inputmode="decimal"></div>
${tempModeMS(ctx, oi)}
<div class="field"><label>Усиленность конструкции</label>
<select class="select" data-struct-strength>${opt('building', 'structStrength', STRUCT_STRENGTH).map((o) => `<option ${o === (oi.structStrength || '') ? 'selected' : ''}>${o}</option>`).join('')}</select>
</div>
</div>
<div class="grid g-3" style="margin-top:10px">
<div class="field"><label>Конструктив</label>
<select class="select" data-prod-frame>${opt('building', 'frame', PROD_FRAME).map((o) => `<option ${o === (oi.prodFrame || '') ? 'selected' : ''}>${o}</option>`).join('')}</select>
</div>
<div class="field"><label>Полы (несущая способность)</label>
<select class="select" data-prod-floors>${opt('building', 'floorsType', PROD_FLOORS).map((o) => `<option ${o === (oi.prodFloors || '') ? 'selected' : ''}>${o}</option>`).join('')}</select>
</div>
<div class="field"><label>Наличие/возможность кран-балки</label>
<select class="select" data-prod-crane>${opt('building', 'craneBeam', CRANE_BEAM).map((o) => `<option ${o === (oi.craneBeam || opt('building', 'craneBeam', CRANE_BEAM)[0]) ? 'selected' : ''}>${o}</option>`).join('')}</select>
</div>
</div>
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

// Два поля не должны противоречить друг другу (Л2.5). Ведёт «Расположение
// строения», подстраивается «Категория жилого строения»:
//   Отдельностоящее → «Обособленный»;
//   Встроенное      → таунхаус, полдома, барак.
// Так и в жизни: обособленным бывает частный дом, а таунхаус или полдома — это
// всегда часть чего-то большего. Квартира сюда не попадает вовсе: она по
// определению внутри здания, и категории жилого строения у неё нет.
// Список ПОЛНЫЙ: пункты не прячем — они могут понадобиться для особых случаев
// (уточнение пользователя 28.08.2026). Согласованность обеспечивает автовыбор
// при смене расположения (см. обработчик data-buildtype в ctrl.js), а не запрет.
function resCatOptions() {
  return opt('building', 'buildCat', RES_BUILD_CAT).slice();
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
${photosCard(ctx, oi, docsIdx + 1)}
</div>`;

  return `${splitWrap(ctx.ui.viewer ? viewerHTML(ctx) : null, cardBody)}`;
}
