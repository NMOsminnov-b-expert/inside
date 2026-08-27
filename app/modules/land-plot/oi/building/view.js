import { structMS } from '../../parts/struct/ms.js';
import { fmtEni } from '../../../../kernel/fmt.js';
import { specialsBlockHTML } from '../../parts/specials/view.js';
import { esc } from '../../../../kernel/dom.js';
import { STATUS_BUILD, BUILD_TYPE, STRUCT, CATCLASS, RES_BUILD_CAT } from '../../data/dictionaries.js';
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
<input class="eni-corner" style="width:100%;" data-oi-eni value="${esc(fmtEni(oi.eni))}" title="ЕНИ-код">
</div>
</div>
${flagsRowHTML(oi)}
<div class="grid g-3">
<div class="field"><label>Год постройки</label><input class="input" data-year value="${esc(oi.year || '')}" inputmode="numeric"></div>
<div class="field"><label>Тип строения${rq.buildTypeRequired ? '<span class="req">*</span>' : ''}</label>
<select class="select" data-buildtype>${BUILD_TYPE.map((o) => `<option ${o === oi.buildType ? 'selected' : ''}>${o}</option>`).join('')}</select>
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
<div id="floors-${oi.id}" style="margin-top:10px">${floorsBlock(ctx, oi)}</div>
<div class="grid g-2" style="margin-top:10px">
<div class="field"><label>Высота по внешним замерам, м${rq.heightRequired ? '<span class="req">*</span>' : ''}</label><input class="input" data-height="ext" value="${esc(heights.ext || '')}"></div>
<div class="field"><label>Высота по внутренним замерам, м</label><input class="input" data-height="int" value="${esc(heights.int || '')}"></div>
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
${specialsBlockHTML(oi)}
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
<span class="pill pill-gray">Карточка ОИ (литера)</span>
<label class="flag-lbl"><input type="checkbox" data-flag="entered" ${f.entered ? 'checked' : ''}> Введено</label>${isMl ? `<label class="flag-lbl"><input type="checkbox" data-flag="matched" ${f.matched ? 'checked' : ''}> Сопоставлено с фото</label>` : ''}
<button class="btn btn-danger" data-del-oi="${oi.id}">Удалить литеру</button>
<button class="btn btn-ghost" data-open-ocdocs>Документы ОЦ</button>
<button class="btn btn-primary" data-save-oi>Сохранить</button>
<button class="btn btn-ghost" data-back>Отмена</button>
</div>
${splitWrap(ctx.ui.viewer ? viewerHTML(ctx) : null, cardBody)}`;
}
