import { fmtEni } from '../../../../kernel/fmt.js';
import { esc } from '../../../../kernel/dom.js';
import { STATUS_BUILD, RIGHTS, LAND_SHAPE } from '../../data/dictionaries.js';
import { photoAccordions } from '../../parts/photos/blocks.js';
import { docsBlockInner } from '../../parts/docs/table.js';
import { splitWrap, viewerHTML } from '../../parts/viewer/shell.js';

export function render(ctx, oi) {
  const cardBody = `<div class="oi-stack">
<div class="card t-teal"><div class="card-head"><span class="card-idx">01</span><h3>Земельный участок (один ЕНИ)</h3></div>
<div class="card-pad">
<div class="grid g-4">
<div class="field"><label>Назначение</label><input class="input" data-land-purpose value="${esc(oi.purpose)}"></div>
<div class="field"><label>Площадь по правоустанавливающим документам, м²</label><input class="input" data-area-pud value="${esc(oi.areaPud || '')}"></div>
<div class="field"><label>Площадь по факту, м²</label><input class="input" data-land-area value="${esc(oi.area)}"></div>
<div class="field"><label>Застроенная площадь, м²</label><input class="input" data-area-built value="${esc(oi.areaBuilt || '')}"></div>
</div>
<div class="grid g-4" style="margin-top:10px">
<div class="field"><label>Статус</label>
<select class="select" data-status>${STATUS_BUILD.map((o) => `<option ${o === oi.status ? 'selected' : ''}>${o}</option>`).join('')}</select>
</div>
<div class="field"><label>ЕНИ</label><input class="input" data-oi-eni value="${esc(fmtEni(oi.eni))}" title="дублируется с ЕНИ дома; можно поправить вручную"></div>
<div class="field"><label>Права на земельный участок</label>
<select class="select" data-rights>${RIGHTS.map((o) => `<option ${o === (oi.rights || RIGHTS[0]) ? 'selected' : ''}>${o}</option>`).join('')}</select>
</div>
<div class="field"><label>Форма</label>
<select class="select" data-shape>${LAND_SHAPE.map((o) => `<option ${o === (oi.shape || LAND_SHAPE[0]) ? 'selected' : ''}>${o}</option>`).join('')}</select>
</div>
</div>
<div class="inline-row" style="margin-top:10px; gap:12px; align-items:flex-end; flex-wrap:wrap;">
<label class="flag-lbl"><input type="checkbox" data-easements ${oi.easements ? 'checked' : ''}> Наличие сервитутов и обременений</label>
${oi.easements ? `<div class="field" style="flex:0 0 220px;"><label>Площадь сервитутов и обременений, м²</label><input class="input" data-easements-area value="${esc(oi.easementsArea || '')}"></div>` : ''}
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
