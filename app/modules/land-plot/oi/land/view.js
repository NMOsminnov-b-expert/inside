import { esc } from '../../../../kernel/dom.js';
import { blockNumbers } from '../../../../kernel/blockIndex.js';
import { fmtEni } from '../../../../kernel/fmt.js';
import {
  DOC_TYPES, LAND_TYPES, LAND_USE_CATEGORIES, IRRIGATION_ACCESS,
  LAND_LOCATION, LAND_ROAD_LOCATION, LAND_CORNER, LAND_ENCUMBRANCE,
  LAND_UTILITY_STATUS, LAND_FORM, IRRIGATION_TYPE, LAND_RELIEF,
  LAND_CATEGORIES, LAND_RIGHTS, LAND_PURPOSE_DOC, LAND_SOIL, LAND_STONINESS,
} from '../../data/dictionaries.js';
import { opt } from '../../data/opts.js';
import { devNote, noteAfter } from '../../../../kernel/devNote.js';
import { utilitiesMS } from './utilities.js';
import { auxBuildingsHTML } from './buildings.js';
import { improvementsFields } from './improvements.js';
import { photoAccordions } from '../../parts/photos/blocks.js';
import { splitWrap, viewerHTML } from '../../parts/viewer/shell.js';

function options(values, value) {
  return `<option value="">Не выбрано</option>${values.map((item) => `<option ${item === value ? 'selected' : ''}>${esc(item)}</option>`).join('')}`;
}

function selectField(label, attr, values, value) {
  return `<div class="field"><label>${label}</label><select class="select" ${attr}>${options(values, value)}</select></div>`;
}

// Блок 01. Правки 04.09.2026 (ТЗ docs/tz/30-uchastok-pravki.md §2):
//   * «Статус» убран — этап процесса ведётся у объекта оценки, у участка он
//     дублировал чужое понятие;
//   * площадей три: правоустанавливающие, правоудостоверяющие, по факту. Это
//     разные документы, и цифры в них расходятся;
//   * застроенная площадь переехала сюда из несельхоз-блока и показывается у
//     обоих типов участка;
//   * сервитуты переехали сюда же: обременение — это о правах, а не о
//     местоположении, и стоять оно должно рядом с правами;
//   * категория земель — только у несельхоза: у сельхозучастка категория
//     известна из самого типа.
function commonCard(oi, idx) {
  const areas = oi.areas || {};
  const nonAgricultural = oi.landType === 'Несельскохозяйственный';
  const showEncArea = oi.encumbrance === 'Есть';

  return `<div class="card t-blue"><div class="card-head"><span class="card-idx">${String(idx).padStart(2, '0')}</span><h3>Основные параметры</h3></div><div class="card-pad">
<div class="grid g-4">
<div class="field"><label>Тип земельного участка</label><select class="select" data-land-type>${options(opt('land', 'landType', LAND_TYPES), oi.landType)}</select></div>
${nonAgricultural ? selectField('Категория земель', 'data-land-category', opt('land', 'landCategory', LAND_CATEGORIES), oi.landCategory) : ''}
<div class="field"><label>${noteAfter('Назначение по правоудостоверяющему документу', PURPOSE_NOTE)}</label>
<div class="inline-row">
<select class="select" data-land-purpose style="flex:1 1 200px">${options(opt('land', 'purpose', LAND_PURPOSE_DOC), oi.purpose)}</select>
<input class="input" data-land-purpose-other placeholder="Укажите назначение" maxlength="120"
  value="${esc(oi.purposeOther || '')}" style="flex:1 1 180px;${oi.purpose === 'Иное' ? '' : 'display:none'}"></div>
</div>
<div class="field"><label>ЕНИ</label><input class="input mono" data-land-eni value="${esc(fmtEni(oi.eni))}"></div>
<div class="field"><label>Форма участка</label>
<div class="inline-row">
<select class="select" data-land-form style="flex:1 1 200px">${options(opt('land', 'form', LAND_FORM), oi.form)}</select>
<input class="input" data-land-form-other placeholder="Впишите форму" maxlength="80"
  value="${esc(oi.formOther || '')}" style="flex:1 1 160px;${oi.form === 'Иное' ? '' : 'display:none'}"></div>
</div></div>

<div class="sec-h">Площади</div>
<div class="grid g-4">
<div class="field"><label>По правоустанавливающим документам, кв.м.</label><input class="input" data-land-area="pravo" value="${esc(areas.pravo || '')}"></div>
<div class="field"><label>По правоудостоверяющим документам, кв.м.</label><input class="input" data-land-area="pravoUd" value="${esc(areas.pravoUd || '')}"></div>
<div class="field"><label>По факту, кв.м.</label><input class="input" data-land-area="fact" value="${esc(areas.fact || '')}"></div>
<div class="field"><label>Застроенная площадь, кв.м.</label><input class="input" data-land-area="build" value="${esc(areas.build || '')}"></div>
</div>

<div class="sec-h">Права и обременения</div>
<div class="field-flow">
<div class="field"><label>Права на земельный участок</label>
<div class="inline-row">
<select class="select" data-land-rights style="flex:1 1 200px">${options(opt('land', 'rights', LAND_RIGHTS), oi.rights)}</select>
<input class="input" data-land-rights-other placeholder="Укажите право" maxlength="100"
  value="${esc(oi.rightsOther || '')}" style="flex:1 1 180px;${oi.rights === 'Иное' ? '' : 'display:none'}"></div>
</div>
${selectField('Наличие сервитутов и обременений', 'data-land-encumbrance', opt('land', 'encumbrance', LAND_ENCUMBRANCE), oi.encumbrance || 'Нет')}
${showEncArea ? `<div class="field"><label>Площадь сервитутов и обременений, кв.м. <span class="req">*</span></label><input class="input" data-land-encumbrance-area value="${esc(oi.encumbranceArea || '')}" required></div>` : ''}
</div>
${showEncArea ? `<div class="field" style="margin-top:10px"><label>Комментарий к сервитуту</label>
<textarea class="textarea ta-wide" data-land-encumbrance-note
  placeholder="Чем обременён участок: чей проезд, какие коммуникации, на каком основании">${esc(oi.encumbranceNote || '')}</textarea></div>` : ''}
</div></div>`;
}

function agriculturalCard(ctx, oi, idx) {
  return `<div class="card t-blue"><div class="card-head"><span class="card-idx">${String(idx).padStart(2, '0')}</span><h3>Сельскохозяйственные характеристики</h3></div><div class="card-pad"><div class="grid g-3">
${selectField('Категория и разрешенное использование', 'data-land-use', opt('land', 'useCategory', LAND_USE_CATEGORIES), oi.useCategory)}${selectField('Доступность полива', 'data-land-irrigation', opt('land', 'irrigation', IRRIGATION_ACCESS), oi.irrigation)}${selectField('Тип полива', 'data-land-irrigation-type', opt('land', 'irrigationType', IRRIGATION_TYPE), oi.irrigationType)}${selectField('Тип почвы', 'data-land-soil', opt('land', 'soil', LAND_SOIL), oi.soil)}
<div class="field"><label>Балл бонитета</label><input class="input" data-land-bonitet value="${esc(oi.bonitet || '')}"></div>${selectField('Каменистость', 'data-land-stoniness', opt('land', 'stoniness', LAND_STONINESS), oi.stoniness)}</div>
<div class="grid g-3" style="margin-top:10px">${utilitiesMS(ctx, oi)}</div>
${auxBuildingsHTML(ctx, oi)}</div></div>`;
}

// Блок 02 несельхоза — «Инженерные сети» (ТЗ §4). Застроенная площадь уехала
// в блок 01, автономное отопление убрано, добавлены электроснабжение и
// канализация, сюда же переехало наличие построек: постройки — это про
// застройку участка, а не про его местоположение.
function nonAgriculturalCard(ctx, oi, idx) {
  return `<div class="card t-blue"><div class="card-head"><span class="card-idx">${String(idx).padStart(2, '0')}</span><h3>Инженерные сети</h3></div><div class="card-pad"><div class="grid g-3">
${selectField('Наличие электроснабжения', 'data-land-electricity', opt('land', 'electricity', LAND_UTILITY_STATUS), oi.electricity)}
${selectField('Наличие канализации', 'data-land-sewerage', opt('land', 'sewerage', LAND_UTILITY_STATUS), oi.sewerage)}
${selectField('Наличие газификации', 'data-land-gas', opt('land', 'gasification', LAND_UTILITY_STATUS), oi.gasification)}
${selectField('Наличие центрального отопления', 'data-land-central-heating', opt('land', 'centralHeating', LAND_UTILITY_STATUS), oi.centralHeating)}
${selectField('Наличие центрального водоснабжения', 'data-land-water', opt('land', 'centralWater', LAND_UTILITY_STATUS), oi.centralWater)}
</div>
<div class="sec-h">Постройки</div>
${auxBuildingsHTML(ctx, oi)}
</div></div>`;
}

// Города, где район дробится на крупную зону и микрорайон (ТЗ §5.2). В
// остальных населённых пунктах достаточно «расположения в районе»: деления
// такой мелкости там просто нет.
const BIG_CITIES = ['Бишкек', 'Ош', 'Жалал-Абад', 'Джалал-Абад', 'Манас'];

// Что состав полей зависит от города, по интерфейсу не видно: оценщик просто
// видит разный набор в двух карточках и не понимает, почему. Пользователь
// 04.09.2026 попросил сказать это прямо заметкой.
const PURPOSE_NOTE = 'Перечень значений начальный и заведомо неполный: '
  + 'формулировки назначения нужно свести по настоящим правоудостоверяющим '
  + 'документам. Список правится в разделе «Справочники», вариант «Иное» '
  + 'открывает поле ручного ввода.';

const CITY_NOTE = 'Состав полей здесь зависит от города объекта оценки. В '
  + 'крупных городах (Бишкек, Ош, Жалал-Абад, Манас) район дробится на крупную '
  + 'зону и микрорайон; в остальных населённых пунктах вместо них одно поле '
  + '«Расположение в районе» — более мелкого деления там нет. Сам перечень '
  + 'крупных городов пока задан в коде: нужно решить, выносить ли его в '
  + 'справочник, чтобы список правился без разработчика.';

const ZONE_NOTE = 'Позже крупная зона и микрорайон будут подставляться '
  + 'автоматически по координатам, с возможностью ручной правки. Сейчас — '
  + 'свободный ввод.';

// Крупный ли город. Смотрим и на адрес объекта оценки, и на город записи:
// адрес заполняют не всегда одинаково, а ошибиться здесь — значит спрятать
// нужные поля.
function isBigCity(ctx) {
  const rec = (ctx && ctx.rec) || {};
  const hay = `${rec.city || ''} ${rec.address || ''}`.toLowerCase();
  return BIG_CITIES.some((c) => hay.includes(c.toLowerCase()));
}

// Блок 03 после правок 04.09.2026 (ТЗ §5–6): сервитуты и постройки уехали в
// блоки 01 и 02, добавились координаты, зона с микрорайоном для крупных
// городов и удалённость от райцентра для сельхоза; благоустройство стало
// рангом с текстовым описанием.
function locationCard(ctx, oi, idx) {
  const bigCity = isBigCity(ctx);
  const agricultural = oi.landType !== 'Несельскохозяйственный';

  return `<div class="card t-blue"><div class="card-head"><span class="card-idx">${String(idx).padStart(2, '0')}</span><h3>Местоположение</h3></div><div class="card-pad">
<div class="sec-h">Расположение${devNote(CITY_NOTE)}</div>
<div class="grid g-4">
<div class="field"><label>Координаты (широта, долгота)</label>
  <input class="input mono" data-land-gps value="${esc(oi.gps || '')}"
    placeholder="42.874722, 74.612222" title="Из карты или прибора: сначала широта, потом долгота"></div>
${bigCity
    ? `<div class="field"><label>${noteAfter('Крупная зона', ZONE_NOTE)}</label>
        <input class="input" data-land-zone value="${esc(oi.zone || '')}" placeholder="Центр"></div>
       <div class="field"><label>${noteAfter('Микрорайон', ZONE_NOTE)}</label>
        <input class="input" data-land-microdistrict value="${esc(oi.microdistrict || '')}" placeholder="Военторг"></div>`
    : selectField('Расположение в районе', 'data-land-location', opt('land', 'location', LAND_LOCATION), oi.location)}
${selectField('Расположение к трассе', 'data-land-road', opt('land', 'roadLocation', LAND_ROAD_LOCATION), oi.roadLocation)}
${selectField('Угловой/Неугловой', 'data-land-corner', opt('land', 'corner', LAND_CORNER), oi.corner)}
${selectField('Рельеф участка', 'data-land-relief', opt('land', 'relief', LAND_RELIEF), oi.relief)}
${agricultural ? `<div class="field"><label>Удалённость от райцентра, км</label>
  <input class="input" data-land-distance value="${esc(oi.distanceToCenter || '')}" inputmode="decimal"></div>` : ''}
</div>
<div class="field" style="margin-top:10px"><label>Особенности местоположения</label><textarea class="textarea ta-wide" data-land-location-features
  placeholder="Что важно знать об окружении: соседство, подъезд, вид, шум, затопляемость…">${esc(oi.locationFeatures || '')}</textarea></div>
<div class="sec-h">Благоустройство территории</div>
<div class="grid g-2">${improvementsFields(ctx, oi)}</div>
</div></div>`;
}

export function render(ctx, oi) {
  const agricultural = oi.landType !== 'Несельскохозяйственный';
  const idx = blockNumbers();

  const body = `<div class="oi-stack">${commonCard(oi, idx())}${agricultural ? agriculturalCard(ctx, oi, idx()) : nonAgriculturalCard(ctx, oi, idx())}${locationCard(ctx, oi, idx())}<div class="card t-blue"><div class="card-head" data-card-toggle><span class="card-idx">${String(idx()).padStart(2, '0')}</span><h3>Фото по категориям</h3><button class="btn btn-ghost btn-sm" data-open-pviewer style="margin-left:auto">Открыть просмотрщик</button><span class="chev">▾</span></div><div class="card-body-wrap"><div class="card-pad">${photoAccordions(ctx.ui, oi, true)}</div></div></div></div>`;
  return `${splitWrap(ctx.ui.viewer ? viewerHTML(ctx) : null, body)}`;
}
