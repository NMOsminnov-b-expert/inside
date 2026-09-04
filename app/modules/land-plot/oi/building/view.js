import { yearFieldHTML } from '../../../../kernel/yearField.js';
import { blockNumbers } from '../../../../kernel/blockIndex.js';
import { structMS } from '../../parts/struct/ms.js';
import { fmtEni } from '../../../../kernel/fmt.js';
import { specialsBlockHTML } from '../../parts/specials/view.js';
import { esc } from '../../../../kernel/dom.js';
import { STATUS_BUILD, BUILD_TYPE, STRUCT, CATCLASS, RES_BUILD_CAT } from '../../data/dictionaries.js';
import { activeOcType } from '../../../../kernel/ocType.js';
import { opt } from '../../data/opts.js';
import { floorsBlock, floorsCountField } from './floors.view.js';
import { heatingMS } from './heating.js';
import { photoAccordions } from '../../parts/photos/blocks.js';
import { splitWrap, viewerHTML } from '../../parts/viewer/shell.js';


// Типы ОЦ, у которых сам объект оценки жилой. Списком, а не поиском подстроки
// «жилое здание» в названии типа: название — текст для человека, его правят.
const OWN_TYPE = 'land-plot';
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
  };
}

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

// Категория ОИ здесь одним полем-справочником (категория → класс), и поля
// «Назначение по тех паспорту» нет. У гражданских и производственных строений
// иначе: там сгруппированный справочник категорий ПЛЮС отдельное текстовое
// назначение по техпаспорту. Расхождение согласовано с пользователем
// 04.09.2026 и оставлено намеренно — состав полей у тех типов другой по делу.
// Не «выравнивать» при очередном аудите (docs/reestr-kosyakov.md §5).
function generalCard(ctx, oi, idx) {
  const rq = fieldRules(ctx, oi);
  const showResCat = rq.showResCat;

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
<div class="field"><label>Тип строения${rq.buildTypeRequired ? '<span class="req">*</span>' : ''}</label>
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

function structCard(ctx, oi, idx) {
  const rq = fieldRules(ctx, oi);
  const struct = oi.struct || {};

  return `<div class="card t-teal" id="q-struct">
<div class="card-head" data-card-toggle><span class="card-idx">${String(idx).padStart(2, '0')}</span><h3>Конструктивный состав / основные материалы (под вопросом)</h3><span class="chev">▾</span></div>
<div class="card-body-wrap"><div class="card-pad">
<div class="grid g-4">
${structField(oi, 'foundation', 'Фундамент', opt('building', 'struct.foundation', STRUCT.foundation), struct.foundation)}
${structField(oi, 'wallsExt', 'Наружные стены', opt('building', 'struct.wallsExt', STRUCT.wallsExt), struct.wallsExt, rq.wallsRequired)}
${structField(oi, 'ceilings', 'Перекрытия', opt('building', 'struct.ceilings', STRUCT.ceilings), struct.ceilings)}
${structField(oi, 'roof', 'Кровля', opt('building', 'struct.roof', STRUCT.roof), struct.roof)}
</div>
<div class="grid g-4" style="margin-top:8px">
${structField(oi, 'floors', 'Полы', opt('building', 'struct.floors', STRUCT.floors), struct.floors)}
${structField(oi, 'windows', 'Окна', opt('building', 'struct.windows', STRUCT.windows), struct.windows)}
${structField(oi, 'doors', 'Двери', opt('building', 'struct.doors', STRUCT.doors), struct.doors)}
${heatingMS(ctx, oi)}
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

export function render(ctx, oi) {

  const idx = blockNumbers();

  const cardBody = `<div class="oi-stack">
${generalCard(ctx, oi, idx())}
${areasCard(ctx, oi, idx())}
${structCard(ctx, oi, idx())}
${photosCard(ctx, oi, idx())}
</div>`;

  return `${splitWrap(ctx.ui.viewer ? viewerHTML(ctx) : null, cardBody)}`;
}
