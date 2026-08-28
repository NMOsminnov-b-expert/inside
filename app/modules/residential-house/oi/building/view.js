import { yearFieldHTML } from '../../../../kernel/yearField.js';
import { structMS } from '../../parts/struct/ms.js';
import { fmtEni } from '../../../../kernel/fmt.js';
import { specialsBlockHTML } from '../../parts/specials/view.js';
import { esc } from '../../../../kernel/dom.js';
import {
  STATUS_BUILD, BUILD_TYPE, STRUCT, CATCLASS, RES_BUILD_CAT,
  STRUCTURE_KIND, APARTMENT_RIGHTS,
} from '../../data/dictionaries.js';
import { floorsBlock } from './floors.view.js';
import { heatingMS } from './heating.js';
import { photoAccordions } from '../../parts/photos/blocks.js';
import { docsBlockInner } from '../../parts/docs/table.js';
import { splitWrap, viewerHTML } from '../../parts/viewer/shell.js';

// Правила полей строения: что обязательно и что показывать.
export function fieldRules(ctx, oi) {
  const prod = (oi.catClass || '') === 'Производственно-складское';
  const ml = (oi.origin || 'manual') === 'ml';

  return {
    heightRequired: prod,
    wallsRequired: prod,
    buildTypeRequired: !prod,
    showResCat: !!oi.residential,
    showMatched: ml,
    // Для ОЦ «Жилое здание (дом)» категория ОИ у жилого строения скрыта.
    showCatClass: !(oi.residential && String(ctx.rec.type || '').toLowerCase().includes('жилое здание')),
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

function generalCard(ctx, oi) {
  const rq = fieldRules(ctx, oi);
  const showResCat = rq.showResCat && ctx.rec.type === 'Жилое здание (дом)';
  const showStructureKindOther = oi.structureKind === 'Прочее';
  const showRightsOther = oi.rights === 'Иное';

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
<div class="field"><label>Расположение строения${rq.buildTypeRequired ? '<span class="req">*</span>' : ''}</label>
<select class="select" data-buildtype>${buildTypeOptions(oi).map((o) => `<option ${o === oi.buildType ? 'selected' : ''}>${o}</option>`).join('')}</select>
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
<div class="grid g-2" style="margin-top:10px">
<div class="field">
<label>Тип строения</label>
<div class="inline-row">
<select class="select" data-structure-kind style="flex:1 1 160px;">
<option value="">Не выбрано</option>
${STRUCTURE_KIND.map((o) => `<option ${o === oi.structureKind ? 'selected' : ''}>${o}</option>`).join('')}
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
</div>
<div class="field">
<label>Права на строение</label>
<div class="inline-row">
<select class="select" data-bld-rights style="flex:1 1 200px;">
<option value="">Не выбрано</option>
${APARTMENT_RIGHTS.map((r) => `<option ${r === oi.rights ? 'selected' : ''}>${r}</option>`).join('')}
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

function areasCard(ctx, oi) {
  const rq = fieldRules(ctx, oi);
  const areas = oi.areas || {};
  const heights = oi.heights || {};

  return `<div class="card t-blue" id="q-areas">
<div class="card-head" data-card-toggle><span class="card-idx">02</span><h3>Площади и этажность</h3><span class="chev">▾</span></div>
<div class="card-body-wrap"><div class="card-pad">
<div class="grid g-4">
<div class="field"><label>Общая по правоустанавливающим документам, м²</label><input class="input" data-area="pud" value="${esc(areas.pud || '')}"></div>
<div class="field"><label>Общая по техпаспорту, м²</label><input class="input" data-area="tp" value="${esc(areas.tp || '')}"></div>
<div class="field"><label>Общая по факту, м²</label><input class="input" data-area="fact" value="${esc(areas.fact || '')}"></div>
<div class="field"><label>Площадь застройки по техпаспорту, м²</label><input class="input" data-area="build" value="${esc(areas.build || '')}"></div>
</div>
<div id="floors-${oi.id}" style="margin-top:10px">${floorsBlock(ctx, oi)}</div>
<div class="grid g-2" style="margin-top:10px">
<div class="field"><label>Высота по внешним замерам, м${rq.heightRequired ? '<span class="req">*</span>' : ''}</label><input class="input" data-height="ext" value="${esc(heights.ext || '')}"></div>
<div class="field"><label>Высота по внутренним замерам, м</label><input class="input" data-height="int" value="${esc(heights.int || '')}"></div>
</div>
<div class="sec-h" style="margin-top:14px">Лоджии и балконы</div>
<div class="grid g-4">
<div class="field">
<label>Кол-во лоджий</label>
<input class="input" data-bld-loggia-count value="${esc(oi.loggiaCount || '')}"
inputmode="numeric" min="0" max="10" placeholder="до 10">
</div>
<div class="field">
<label>Кол-во балконов / террас</label>
<input class="input" data-bld-balcony-count value="${esc(oi.balconyCount || '')}"
inputmode="numeric" min="0" max="10" placeholder="до 10">
</div>
<div class="field">
<label>Площадь застройки лоджий, м²</label>
<input class="input" data-bld-loggia-area value="${esc(oi.loggiaBuildArea || '')}"
inputmode="decimal" min="0" max="500" placeholder="до 500">
</div>
<div class="field">
<label>Площадь застройки балконов / террас, м²</label>
<input class="input" data-bld-balcony-area value="${esc(oi.balconyBuildArea || '')}"
inputmode="decimal" min="0" max="500" placeholder="до 500">
</div>
</div>
</div></div>
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
${structField(oi, 'ceilings', 'Перекрытия', STRUCT.ceilings, struct.ceilings)}
${structField(oi, 'roof', 'Кровля', STRUCT.roof, struct.roof)}
</div>
<div class="grid g-4" style="margin-top:8px">
${structField(oi, 'floors', 'Полы', STRUCT.floors, struct.floors)}
${structField(oi, 'windows', 'Окна', STRUCT.windows, struct.windows)}
${structField(oi, 'doors', 'Двери', STRUCT.doors, struct.doors)}
${heatingMS(ctx, oi)}
</div>
<div class="grid g-2" style="margin-top:8px">
${specialsBlockHTML(oi)}
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

  const cardBody = `<div class="oi-stack">
${generalCard(ctx, oi)}
${areasCard(ctx, oi)}
${structCard(ctx, oi, 3)}
${docsCard(oi, 4)}
${photosCard(ctx, oi, 5)}
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
