import { esc } from '../../../../kernel/dom.js';
import { docsBlockInner } from '../../parts/docs/table.js';
import { splitWrap, viewerHTML } from '../../parts/viewer/shell.js';

export function render(ctx, oi) {
  const f = oi.flags || {};
  const isMl = (oi.origin || 'manual') === 'ml';
  const isMech = oi.kind === 'МЕХ';

  const cardBody = `<div class="oi-stack">
<div class="card t-blue"><div class="card-head"><span class="card-idx">01</span><h3>${isMech ? 'Данные механизма' : 'Данные офисной техники'}</h3></div>
<div class="card-pad">
<div class="inline-row" style="margin-bottom:10px">
<label class="flag-lbl"><input type="checkbox" data-flag="entered" ${f.entered ? 'checked' : ''}> Введено</label>
${isMl ? `<label class="flag-lbl"><input type="checkbox" data-flag="matched" ${f.matched ? 'checked' : ''}> Сопоставлено с фото</label>` : ''}
</div>
<div class="grid g-3">
<div class="field"><label>Наименование</label><input class="input" data-mv-name value="${esc(oi.name)}"></div>
<div class="field"><label>Год выпуска</label><input class="input" data-mv-year value="${esc(oi.year || '')}"></div>
<div class="field"><label>Заводской / инв. номер</label><input class="input" data-mv-serial value="${esc(oi.serial || '')}"></div>
</div>
${oi.complexItems ? `<div class="sec-h" style="margin-top:14px">Состав комплекса</div>
<table class="tbl"><colgroup><col><col style="width:160px"><col style="width:160px"></colgroup>
<thead><tr><th>Наименование ОИ</th><th>Тип</th><th>Код ЕНИ</th></tr></thead>
<tbody>${oi.complexItems.length ? oi.complexItems.map((it) => `<tr><td>${esc(it.name)}</td><td>${esc(it.type)}</td><td style="font-family:ui-monospace,Menlo,monospace;font-size:11.5px">${esc(it.eni)}</td></tr>`).join('') : '<tr><td colspan="3" class="muted">Состав не заполнен</td></tr>'}</tbody></table>` : ''}
</div>
</div>
<div class="card t-slate"><div class="card-head"><span class="card-idx">02</span><h3>Документы</h3></div><div class="card-pad">${docsBlockInner(oi, oi.id)}</div></div>
</div>`;

  return `<div class="view-head">
<button class="back-btn" data-back>← К объекту оценки</button>
<span class="pill pill-gray">${isMech ? 'Механизм' : 'Офисная техника'}</span>
<button class="btn btn-danger" data-del-oi="${oi.id}">Удалить ОИ</button>
<button class="btn btn-ghost" data-open-ocdocs>Документы ОЦ</button>
<button class="btn btn-primary" data-save-oi>Сохранить</button>
<button class="btn btn-ghost" data-back>Отмена</button>
</div>
${splitWrap(ctx.ui.viewer ? viewerHTML(ctx) : null, cardBody)}`;
}
