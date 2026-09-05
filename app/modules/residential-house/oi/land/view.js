import { fmtEni } from '../../../../kernel/fmt.js';
import { emptyOptionHTML } from '../../../../kernel/emptyOption.js';
import { esc } from '../../../../kernel/dom.js';
import { STATUS_BUILD, APARTMENT_RIGHTS, LAND_FORM, LAND_ENCUMBRANCE } from '../../data/dictionaries.js';
import { opt } from '../../data/opts.js';
import { photoAccordions } from '../../parts/photos/blocks.js';
import { docsBlockInner } from '../../parts/docs/table.js';
import { splitWrap, viewerHTML } from '../../parts/viewer/shell.js';

export function render(ctx, oi) {
  const areas = oi.areas || {};
  const showRightsOther = oi.rights === 'Иное';
  const showFormOther = oi.form === 'Прочее';
  const showEncOther = oi.encumbrance === 'Прочее';
  const showEncArea = !!oi.encumbrance && oi.encumbrance !== 'Нет';

  const cardBody = `<div class="oi-stack">
<div class="card t-teal"><div class="card-head"><span class="card-idx">01</span><h3>Земельный участок (один ЕНИ)</h3></div>
<div class="card-pad">
<div class="grid g-4">
<div class="field"><label>Назначение</label><input class="input" data-land-purpose value="${esc(oi.purpose)}"></div>
<div class="field"><label>Статус</label>
<select class="select" data-status>${STATUS_BUILD.map((o) => `<option ${o === oi.status ? 'selected' : ''}>${o}</option>`).join('')}</select>
</div>
<div class="field"><label>ЕНИ</label><input class="input" readonly value="${esc(fmtEni(oi.eni))}"></div>
</div>
<div class="grid g-4" style="margin-top:10px">
<div class="field"><label>Площадь по правоустанавливающим документам, м²</label><input class="input" data-land-area="pravo" value="${esc(areas.pravo || '')}"></div>
<div class="field"><label>Площадь по факту (из ТП), м²</label><input class="input" data-land-area="fact" value="${esc(areas.fact || '')}"></div>
<div class="field"><label>Застроенная площадь, м²</label><input class="input" data-land-area="build" value="${esc(areas.build || '')}"></div>
</div>
<div class="grid g-2" style="margin-top:10px">
<div class="field">
<label>Права на земельный участок</label>
<div class="inline-row">
<select class="select" data-land-rights style="flex:1 1 200px;">
${emptyOptionHTML(opt('land', 'rights', APARTMENT_RIGHTS))}
${opt('land', 'rights', APARTMENT_RIGHTS).map((r) => `<option ${r === oi.rights ? 'selected' : ''}>${r}</option>`).join('')}
</select>
<input
class="input"
data-land-rights-other
placeholder="Укажите право"
value="${esc(oi.rightsOther || '')}"
maxlength="100"
style="flex:1 1 200px; ${showRightsOther ? '' : 'display:none;'}"
>
</div>
</div>
<div class="field">
<label>Форма участка</label>
<div class="inline-row">
<select class="select" data-land-form style="flex:1 1 200px;">
${emptyOptionHTML(opt('land', 'form', LAND_FORM))}
${opt('land', 'form', LAND_FORM).map((f) => `<option ${f === oi.form ? 'selected' : ''}>${f}</option>`).join('')}
</select>
<input
class="input"
data-land-form-other
placeholder="Укажите форму"
value="${esc(oi.formOther || '')}"
maxlength="60"
style="flex:1 1 200px; ${showFormOther ? '' : 'display:none;'}"
>
</div>
</div>
</div>
<div class="grid g-2" style="margin-top:10px">
<div class="field">
<label>Сервитуты и обременения</label>
<div class="inline-row">
<select class="select" data-land-encumbrance style="flex:1 1 160px;">
${opt('land', 'encumbrance', LAND_ENCUMBRANCE).map((o) => `<option ${o === (oi.encumbrance || 'Нет') ? 'selected' : ''}>${o}</option>`).join('')}
</select>
<input
class="input"
data-land-encumbrance-other
placeholder="Опишите (до 200 симв.)"
maxlength="200"
value="${esc(oi.encumbranceOther || '')}"
style="flex:1 1 200px; ${showEncOther ? '' : 'display:none;'}"
>
</div>
</div>
${showEncArea ? `<div class="field"><label>Площадь сервитутов/обременений, м²</label><input class="input" data-land-encumbrance-area value="${esc(oi.encumbranceArea || '')}"></div>` : ''}
</div>
</div>
</div>
<div class="card t-slate"><div class="card-head"><span class="card-idx">02</span><h3>Документы</h3></div><div class="card-pad">${docsBlockInner(oi, oi.id)}</div></div>
<div class="card t-blue"><div class="card-head" data-card-toggle><span class="card-idx">03</span><h3>Фото по категориям</h3>
<button class="btn btn-ghost btn-sm" data-open-pviewer style="margin-left:auto">Открыть просмотрщик</button><span class="chev">▾</span></div>
<div class="card-body-wrap"><div class="card-pad">
${photoAccordions(ctx.ui, oi, true)}
</div></div>
</div>
</div>`;

  return `${splitWrap(ctx.ui.viewer ? viewerHTML(ctx) : null, cardBody)}`;
}
