import { areaListHTML } from '../../../../kernel/areaList.js';
import { blockNumbers } from '../../../../kernel/blockIndex.js';
import { yearFieldHTML } from '../../../../kernel/yearField.js';
import { structMS } from '../../parts/struct/ms.js';
import { fmtEni } from '../../../../kernel/fmt.js';
import { specialsBlockHTML } from '../../parts/specials/view.js';
import { esc } from '../../../../kernel/dom.js';
import { devNote } from '../../../../kernel/devNote.js';
import { STATUS_BUILD, BUILD_TYPE, STRUCT, CATCLASS, RES_BUILD_CAT, STRUCTURE_KIND, APARTMENT_RIGHTS , OI_CATEGORY_GROUPS, OI_CATEGORY_OTHER, WEAR_LEVEL, PROD_FRAME, PROD_FLOORS, CRANE_BEAM, STRUCT_STRENGTH } from '../../data/dictionaries.js';
import { activeOcType } from '../../../../kernel/ocType.js';
import { opt, optGroups } from '../../data/opts.js';
import { floorsBlock, floorsCountField } from './floors.view.js';
import { heatingMS } from './heating.js';
import { photoAccordions } from '../../parts/photos/blocks.js';
import { splitWrap, viewerHTML } from '../../parts/viewer/shell.js';
import { tempModeMS } from './tempMode.js';


// Типы ОЦ, у которых сам объект оценки жилой. Списком, а не поиском подстроки
// «жилое здание» в названии типа: название — текст для человека, его правят.
const OWN_TYPE = 'residential-house';
const HOUSING_OC = ['apartment', 'residential-house'];

// Правила полей строения: что обязательно и что показывать.
//
// Жилой дом описывается одинаково во всех типах ОЦ (решение пользователя
// 04.09.2026): признак «жилое» ставит сам вид ОИ при создании, а карточка по
// нему показывает «Категорию жилого строения». Раньше это работало только в
// модуле «жилое здание (дом)», хотя завести жилой дом можно в любом ОЦ.
export function fieldRules(ctx, oi) {
  const prod = (oi.catClass || '') === 'Производственно-складское';
  const ml = (oi.origin || 'manual') === 'ml';

  // В жилом объекте оценки категория ОИ у жилого строения не нужна: она там
  // и без того очевидна. В нежилых ОЦ (гражданское, производственное,
  // участок) жилой дом — исключение из состава, и категорию видеть надо.
  const housingOc = HOUSING_OC.includes(activeOcType() || OWN_TYPE);

  return {
    prod,
    heightRequired: prod,
    wallsRequired: prod,
    buildTypeRequired: !prod,
    showResCat: !!oi.residential,
    showMatched: ml,
    showCatClass: !(oi.residential && housingOc),
    // У жилого дома нет ни класса капитальности, ни аренды по этажам: и то и
    // другое описывает нежилые здания — класс капитальности назначают
    // административным и производственно-складским помещениям, аренда по
    // этажам тоже про них (решение пользователя 05.09.2026).
    showOiCategory: !oi.residential,
    showRent: !oi.residential,
  };
}

// Материал теперь мультивыбор: в одном элементе их может быть несколько
// (кирпич и монолит, металл и профлист), одним значением это не описать.
// Поле работает так же, как «Отопление» — см. parts/struct/ms.js.
// Аргумент val больше не нужен: значения читаются из oi.struct.
function structField(oi, key, label, opts, val, req) {
  return structMS(oi, key, label, opts, req);
}

// Категория ОИ: сгруппированный select (optgroup по типу помещений, классы
// внутри). Значение — ключ раздела с номером класса (admin-1, prod-3): классы
// в разделах называются одинаково, и без ключа они бы слились.
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

// Категория ОИ здесь одним полем-справочником (категория → класс), и поля
// «Назначение по тех паспорту» нет. У гражданских и производственных строений
// иначе: там сгруппированный справочник категорий ПЛЮС отдельное текстовое
// назначение по техпаспорту. Расхождение согласовано с пользователем
// 04.09.2026 и оставлено намеренно — состав полей у тех типов другой по делу.
// Не «выравнивать» при очередном аудите (docs/reestr-kosyakov.md §5).
function generalCard(ctx, oi, idx) {
  const rq = fieldRules(ctx, oi);
  const showResCat = rq.showResCat && ctx.rec.type === 'Жилое здание (дом)';
  const showStructureKindOther = oi.structureKind === 'Прочее';
  // «Тип строения» (дом, пристройка, времянка, баня, гараж…) описывает
  // ВСПОМОГАТЕЛЬНОЕ здание. У основного он бессмысленен и конфликтует с
  // категорией — поле скрыто (решение пользователя 2026-08-28).
  const showStructureKind = oi.status === 'Вспомогательное';
  const showRightsOther = oi.rights === 'Иное';

  return `<div class="card t-blue" id="q-gen">
<div class="card-head" data-card-toggle>
<span class="card-idx">${String(idx).padStart(2, '0')}</span>
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
<div class="field"><label>Расположение строения${rq.buildTypeRequired ? '<span class="req">*</span>' : ''}</label>
<select class="select" data-buildtype>${opt('building', 'buildType', BUILD_TYPE).map((o) => `<option ${o === oi.buildType ? 'selected' : ''}>${o}</option>`).join('')}</select>
</div>
${showResCat ? `<div class="field"><label>Категория жилого строения</label>
<select class="select" data-rescat>${resCatOptions().map((o) => `<option ${o === oi.resCat ? 'selected' : ''}>${o}</option>`).join('')}</select>
</div>` : ''}
${rq.showCatClass ? `<div class="field"><label>Категория ОИ (категория → класс)</label>
<select class="select" data-catclass>${opt('building', 'class', CATCLASS).map((o) => `<option ${o === (oi.catClass || 'Гражданское здание') ? 'selected' : ''}>${o}</option>`).join('')}</select>
<label class="inline-row" style="font-size:10.5px;font-weight:400"><input type="checkbox" data-dis ${oi.dis ? 'checked' : ''}> расхождение ТП и фото с осмотров</label>
<span class="muted" style="font-size:10px">авто; допроверка — ЦОД, при отсутствии компетенций — оценщик</span>
</div>` : ''}
</div>
<div class="grid g-2" style="margin-top:10px">
${showStructureKind ? `<div class="field">
<label>Тип строения</label>
<div class="inline-row">
<select class="select" data-structure-kind style="flex:1 1 160px;">
<option value="">Не выбрано</option>
${opt('building', 'structureKind', STRUCTURE_KIND).map((o) => `<option ${o === oi.structureKind ? 'selected' : ''}>${o}</option>`).join('')}
</select>
<input
class="input"
data-structure-kind-other
placeholder="Укажите тип"
value="${esc(oi.structureKindOther || '')}"
maxlength="60"
style="flex:1 1 160px; ${showStructureKindOther ? '' : 'display:none;'}"
>
</div>
</div>` : ''}
${rq.showOiCategory ? `<div class="field"><label>Категория ОИ</label>
<select class="select" data-oi-category>${oiCategoryOptions(oi.oiCategory || '')}</select>
</div>` : ''}
<div class="field">
<label>Права на строение</label>
<div class="inline-row">
<select class="select" data-bld-rights style="flex:1 1 200px;">
<option value="">Не выбрано</option>
${opt('building', 'rights', APARTMENT_RIGHTS).map((r) => `<option ${r === oi.rights ? 'selected' : ''}>${r}</option>`).join('')}
</select>
<input
class="input"
data-bld-rights-other
placeholder="Укажите право"
value="${esc(oi.rightsOther || '')}"
maxlength="100"
style="flex:1 1 200px; ${showRightsOther ? '' : 'display:none;'}"
>
</div>
</div>
</div>
</div></div>
</div>`;
}

function areasCard(ctx, oi, idx) {
  const rq = fieldRules(ctx, oi);
  const areas = oi.areas || {};
  const heights = oi.heights || {};

  return `<div class="card t-blue" id="q-areas">
<div class="card-head" data-card-toggle><span class="card-idx">${String(idx).padStart(2, '0')}</span><h3>Площади и этажность</h3><span class="chev">▾</span></div>
<div class="card-body-wrap"><div class="card-pad">
<div class="grid g-4">
<div class="field"><label>Общая по правоустанавливающим документам, м²</label><input class="input" data-area="pud" value="${esc(areas.pud || '')}"></div>
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

// Открытый вопрос методики: в каком виде нужен износ. Сейчас это три ступени на
// каждый элемент — шкала грубая, и два оценщика поставят по-разному. По
// методике износ может считаться процентом или годами с последнего ремонта, и
// тогда состав раздела другой. Держим вопрос на виду заметкой (решение
// пользователя 04.09.2026: «износ распространяем, но с заметкой»).
const WEAR_NOTE = 'В каком виде нужен износ — открытый вопрос. Сейчас три '
  + 'ступени на элемент: «не указано», «умеренный», «значительный». Соседние '
  + 'ступени два оценщика поставят по-разному, а по методике износ может '
  + 'считаться процентом или годами с последнего ремонта — тогда и состав '
  + 'раздела изменится. Обсудить до того, как по нему начнут считать.';

function structCard(ctx, oi, idx) {
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
${structField(oi, 'roof', 'Кровля', opt('building', 'struct.roof', STRUCT.roof), struct.roof)}
${structField(oi, 'floors', 'Полы', opt('building', 'struct.floors', STRUCT.floors), struct.floors)}
${structField(oi, 'windows', 'Окна', opt('building', 'struct.windows', STRUCT.windows), struct.windows)}
${structField(oi, 'doors', 'Двери', opt('building', 'struct.doors', STRUCT.doors), struct.doors)}
${heatingMS(ctx, oi)}
</div>
<div style="margin-top:12px">
<div class="sec-h">Износ конструктивных элементов${devNote(WEAR_NOTE)}</div>
<div class="grid g-3" style="margin-top:6px">
${WEAR_ITEMS.map((w) => wearField(oi, w.key, w.label)).join('')}
</div>
</div>
${specialsBlockHTML(oi)}
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

// Лоджии, балконы и террасы — свой блок (Л5.4): внутри «Площадей и этажности»
// они оказывались ниже поэтажной развёртки и высот, и их там не находили.
function annexesCard(ctx, oi, idx) {
  return `<div class="card t-blue" id="q-annexes">
<div class="card-head" data-card-toggle><span class="card-idx">${String(idx).padStart(2, '0')}</span><h3>Лоджии, балконы и террасы</h3><span class="chev">▾</span></div>
<div class="card-body-wrap"><div class="card-pad">
${areaListHTML(oi, 'loggias', 'Лоджии', 'Лоджия', ctx.ui)}
${areaListHTML(oi, 'balconies', 'Балконы', 'Балкон', ctx.ui)}
${areaListHTML(oi, 'terraces', 'Террасы', 'Терраса', ctx.ui)}
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

function rentAreasCard(ctx, oi, idx) {
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

export function render(ctx, oi) {
  const rq = fieldRules(ctx, oi);

  const idx = blockNumbers();

  const cardBody = `<div class="oi-stack">
${generalCard(ctx, oi, idx())}
${areasCard(ctx, oi, idx())}
${annexesCard(ctx, oi, idx())}
${rq.showRent ? rentAreasCard(ctx, oi, idx()) : ''}
${structCard(ctx, oi, idx())}
${rq.prod ? prodExtraCard(ctx, oi, idx()) : ''}
${photosCard(ctx, oi, idx())}
</div>`;

  return `${splitWrap(ctx.ui.viewer ? viewerHTML(ctx) : null, cardBody)}`;
}
