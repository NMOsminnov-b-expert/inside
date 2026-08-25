import { esc } from '../../../../kernel/dom.js';
import { fmt, num } from '../../../../kernel/fmt.js';
import { floorsSum } from './floors.model.js';

// Поэтажная развёртка квартиры: только этажи, без подвала/мансарды/цоколя
// и без внешнего замера высоты.
export function apartmentFloorsBlock(ctx, oi) {
  const s = floorsSum(oi);
  const t = num(oi.areas.tp);
  const ok = Math.abs(s - t) < 0.01;
  const fkey = 'fl|' + oi.id;
  const open = ctx.ui.accOpen[fkey] !== false;

  return `<div class="acc ${open ? 'open' : ''}" style="margin-top:14px">
<div class="acc-head" data-acc-toggle="${fkey}"><span class="chev">▾</span>Поэтажная развёртка
<span style="margin-left:auto" data-floor-sum class="${ok ? 'sum-ok' : 'sum-warn'}">Σ этажей: ${fmt(s)} / ${fmt(t)} м²</span>
<button class="btn btn-ghost btn-sm" data-redistribute style="margin-left:8px">Выровнять отмеченные</button>
</div>
<div class="acc-body" style="padding:8px">
<table class="tbl"><thead><tr><th style="width:40px"></th><th>Этаж</th><th style="width:140px">Площадь, м²</th><th style="width:140px">Высота внутр, м</th></tr></thead>
<tbody>${(oi.floorList || []).map((f, i) => `<tr>
<td><input type="checkbox" data-floor-on="${i}" ${f.on ? 'checked' : ''} title="Отмечено — площадь распределяется автоматически; снято — задаётся вручную"></td>
<td>${esc(f.name)}</td>
<td><input class="input" data-floor-area="${i}" value="${esc(f.area)}" ${f.on ? 'readonly' : ''} title="${f.on ? 'Считается автоматически — снимите отметку, чтобы задать вручную' : ''}"></td>
<td><input class="input" data-floor-hint="${i}" value="${esc(f.hInt)}"></td>
</tr>`).join('')}</tbody></table>
<div class="muted" style="font-size:10.5px;margin-top:5px">Отмеченные этажи получают оставшуюся площадь (итог − сумма ручных) поровну; снятый чекбокс = площадь вручную. Высота указывается по внутреннему замеру для каждого этажа.</div>
</div>
</div>`;
}

export function updateFloorsUI(ctx, oi) {
  const s = ctx.scope;

  oi.floorList.forEach((f, i) => {
    const a = s.$(`[data-floor-area="${i}"]`);
    if (a) {
      if (document.activeElement !== a) a.value = f.area;
      a.readOnly = f.on;
    }
    const on = s.$(`[data-floor-on="${i}"]`);
    if (on) on.checked = f.on;
    const hi = s.$(`[data-floor-hint="${i}"]`);
    if (hi && document.activeElement !== hi) hi.value = f.hInt;
  });

  const sum = s.$('[data-floor-sum]');
  if (sum) {
    const ssum = floorsSum(oi);
    const tot = num(oi.areas.tp);
    sum.textContent = `Σ этажей: ${fmt(ssum)} / ${fmt(tot)} м²`;
    sum.className = Math.abs(ssum - tot) < 0.01 ? 'sum-ok' : 'sum-warn';
  }
}
