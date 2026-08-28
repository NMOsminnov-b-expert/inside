import { esc } from '../../../../kernel/dom.js';
import { fmtNum, num } from '../../../../kernel/fmt.js';
import { floorsSum } from './floors.model.js';

// Конструктивный тип мансарды здесь не дублируется — контрол уже есть в
// общей карточке (data-mansard, читает/пишет oi.mansardType).
const CATS = [
  { key: 'over', label: 'Надземные' },
  { key: 'under', label: 'Подземные' },
  { key: 'mansard', label: 'Мансардные' },
];

function catSummary(rows) {
  const sum = rows.reduce((s, f) => s + num(f.area), 0);
  return `${rows.length} · ${fmtNum(sum)} м²`;
}

function catSection(ctx, oi, cat, fkey) {
  const rows = oi.floorList.map((f, i) => ({ f, i })).filter(({ f }) => f.cat === cat.key);
  if (!rows.length) return '';

  const onCount = rows.filter(({ f }) => f.on).length;
  const ckey = `${fkey}|${cat.key}`;
  const open = ctx.ui.accOpen[ckey] === true
    || (ctx.ui.accOpen[ckey] === undefined && cat.key === 'over');

  // Оформление общее с лоджиями и балконами (класс al): таблица идёт вплотную
  // к краям блока, без зазоров и прямых углов внутри скругления.
  return `<div class="al acc ${open ? 'open' : ''}">
<div class="acc-head" data-acc-toggle="${ckey}" style="display:flex;align-items:center;gap:8px">
<span class="chev">▾</span>
<input type="checkbox" data-cat-all="${cat.key}" ${onCount === rows.length ? 'checked' : ''} title="Выбрать/снять всю категорию — площадь распределится автоматически">
<span>${cat.label}</span>
<span style="margin-left:auto" data-cat-summary="${cat.key}">${catSummary(rows.map(({ f }) => f))}</span>
</div>
<div class="acc-body">
<table class="tbl al-tbl"><thead><tr><th style="width:40px"></th><th>Этаж</th><th style="width:120px">Площадь, м²</th><th style="width:120px">Высота внешн, м</th><th style="width:120px">Высота внутр, м</th></tr></thead>
<tbody>${rows.map(({ f, i }) => `<tr>
<td><input type="checkbox" data-floor-on="${i}" ${f.on ? 'checked' : ''} title="Отмечено — площадь распределяется автоматически; снято — задаётся вручную"></td>
<td>${esc(f.name)}${cat.key !== 'over' ? ' <span class="tag-mini">вручную</span>' : ''}</td>
<td><input class="input" data-floor-area="${i}" value="${esc(f.area)}" ${f.on ? 'readonly' : ''} title="${f.on ? 'Считается автоматически — снимите отметку, чтобы задать вручную' : ''}"></td>
<td><input class="input" data-floor-hext="${i}" value="${esc(f.hExt)}"></td>
<td><input class="input" data-floor-hint="${i}" value="${esc(f.hInt)}"></td>
</tr>`).join('')}</tbody></table>
</div>
</div>`;
}

export function floorsCountField(oi) {
  return `<div class="field"><label>Количество этажей</label>
<input class="input" data-floors-n value="${oi.floors}" inputmode="numeric"></div>`;
}

export function floorsBlock(ctx, oi) {
  const total = num(oi.areas.tp);
  const allSum = floorsSum(oi);
  const ok = Math.abs(allSum - total) < 0.01;
  const fkey = 'fl|' + oi.id;

  return `<div class="inline-row" style="margin-top:8px; align-items:center;">
<span data-floor-sum class="${ok ? 'sum-ok' : 'sum-warn'}">Σ по зданию: ${fmtNum(allSum)} / ${fmtNum(total)} м² (общая по ТП)</span>
<button class="btn btn-ghost btn-sm" data-redistribute style="margin-left:8px">Выровнять отмеченные</button>
</div>
${CATS.map((cat) => catSection(ctx, oi, cat, fkey)).join('')}
<div class="muted" style="font-size:10.5px;margin-top:5px">Отмеченные этажи получают оставшуюся площадь (итог по техпаспорту − сумма ручных) поровну; снятый чекбокс = площадь вручную. Чекбокс у категории — отметить/снять её целиком. «Надземные» — чистая площадь этажей дома, без подвала/цоколя/мансарды.</div>`;
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
    const he = s.$(`[data-floor-hext="${i}"]`);
    if (he && document.activeElement !== he) he.value = f.hExt;
    const hi = s.$(`[data-floor-hint="${i}"]`);
    if (hi && document.activeElement !== hi) hi.value = f.hInt;
  });

  CATS.forEach((cat) => {
    const rows = oi.floorList.filter((f) => f.cat === cat.key);
    if (!rows.length) return;
    const onCount = rows.filter((f) => f.on).length;

    const summaryEl = s.$(`[data-cat-summary="${cat.key}"]`);
    if (summaryEl) summaryEl.textContent = catSummary(rows);

    const allCb = s.$(`[data-cat-all="${cat.key}"]`);
    if (allCb) {
      allCb.checked = onCount === rows.length;
      allCb.indeterminate = onCount > 0 && onCount < rows.length;
    }
  });

  const sum = s.$('[data-floor-sum]');
  if (sum) {
    const ssum = floorsSum(oi);
    const tot = num(oi.areas.tp);
    sum.textContent = `Σ по зданию: ${fmtNum(ssum)} / ${fmtNum(tot)} м² (общая по ТП)`;
    sum.className = Math.abs(ssum - tot) < 0.01 ? 'sum-ok' : 'sum-warn';
  }
}

export function rerenderFloors(ctx, oi) {
  const w = ctx.scope.$('#floors-' + oi.id);
  if (w) w.outerHTML = `<div id="floors-${oi.id}" style="margin-top:10px">${floorsBlock(ctx, oi)}</div>`;
}
