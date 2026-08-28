import { esc } from '../../../../kernel/dom.js';
import { fmtNum, num } from '../../../../kernel/fmt.js';
import { MANSARD_TYPE } from '../../data/dictionaries.js';
import { floorsSum, AREA_FIELDS } from './floors.model.js';

// Конструктивный тип мансарды у КАЖДОЙ строки, а не один на литеру: мансарда и
// полумансарда встречаются в одном здании (Л5.3, решение пользователя
// 2026-08-28). Общего поля в шапке блока больше нет.
const CATS = [
  { key: 'over', label: 'Надземные' },
  { key: 'under', label: 'Подземные' },
  { key: 'mansard', label: 'Мансардные' },
];

function catSummary(rows) {
  const sum = rows.reduce((s, f) => s + num(f.area), 0);
  return `${rows.length} · ${fmtNum(sum)} м²`;
}

function mansardTypeCell(f, i) {
  return `<td><select class="select" data-floor-mansard="${i}">
${MANSARD_TYPE.map((o) => `<option ${o === (f.mansardType || MANSARD_TYPE[0]) ? 'selected' : ''}>${o}</option>`).join('')}
</select></td>`;
}

function catSection(ctx, oi, cat, fkey) {
  const rows = oi.floorList.map((f, i) => ({ f, i })).filter(({ f }) => f.cat === cat.key);
  if (!rows.length) return '';

  const onCount = rows.filter(({ f }) => f.on).length;
  const ckey = `${fkey}|${cat.key}`;
  const open = ctx.ui.accOpen[ckey] === true
    || (ctx.ui.accOpen[ckey] === undefined && cat.key === 'over');
  const isMansard = cat.key === 'mansard';

  // Оформление общее с лоджиями и балконами (класс al): таблица идёт вплотную
  // к краям блока, без зазоров и прямых углов внутри скругления.
  return `<div class="al acc ${open ? 'open' : ''}">
<div class="acc-head" data-acc-toggle="${ckey}" style="display:flex;align-items:center;gap:8px">
<span class="chev">▾</span>
<input type="checkbox" data-cat-all="${cat.key}" ${onCount === rows.length ? 'checked' : ''} title="Выбрать/снять всю категорию — площадь распределится автоматически">
<span>${cat.label}</span>
<span style="margin-left:auto" data-cat-summary="${cat.key}">${catSummary(rows.map(({ f }) => f))}</span>
${isMansard ? '<button class="btn btn-ghost btn-sm" data-add-mansard>+ Мансарда</button>' : ''}
</div>
<div class="acc-body">
<table class="tbl al-tbl"><thead><tr><th style="width:40px"></th><th>Этаж</th>
${isMansard ? '<th style="width:150px">Тип</th>' : ''}
${AREA_FIELDS.map((a) => `<th style="width:120px" title="итог: ${a.title}">${a.label}</th>`).join('')}
<th style="width:110px">Высота внешн, м</th><th style="width:110px">Высота внутр, м</th>
${isMansard ? '<th style="width:44px"></th>' : ''}</tr></thead>
<tbody>${rows.map(({ f, i }) => `<tr>
<td><input type="checkbox" data-floor-on="${i}" ${f.on ? 'checked' : ''} title="Отмечено — площади распределяются автоматически; снято — задаются вручную"></td>
<td>${esc(f.name)}${cat.key !== 'over' ? ' <span class="tag-mini">вручную</span>' : ''}</td>
${isMansard ? mansardTypeCell(f, i) : ''}
${AREA_FIELDS.map((a) => `<td><input class="input" data-floor-area="${a.key}|${i}" value="${esc(f[a.key] || '')}" ${f.on ? 'readonly' : ''} title="${f.on ? 'Считается автоматически — снимите отметку, чтобы задать вручную' : ''}"></td>`).join('')}
<td><input class="input" data-floor-hext="${i}" value="${esc(f.hExt)}"></td>
<td><input class="input" data-floor-hint="${i}" value="${esc(f.hInt)}"></td>
${isMansard ? `<td class="al-act"><button class="btn btn-danger btn-sm" data-del-mansard="${i}" title="Убрать мансарду">×</button></td>` : ''}
</tr>`).join('')}</tbody></table>
</div>
</div>`;
}

export function floorsCountField(oi) {
  return `<div class="field"><label>Количество этажей</label>
<input class="input" data-floors-n value="${oi.floors}" inputmode="numeric"></div>`;
}

// По одному итогу на каждую площадь: у них разные источники, и сходиться они
// должны каждый со своим.
function sumsRow(oi) {
  return AREA_FIELDS.map((a) => {
    const total = num((oi.areas || {})[a.total]);
    const s = floorsSum(oi, a.key);
    const ok = Math.abs(s - total) < 0.01;
    return `<span data-floor-sum="${a.key}" class="${ok ? 'sum-ok' : 'sum-warn'}">Σ ${a.title}: ${fmtNum(s)} / ${fmtNum(total)} м²</span>`;
  }).join('');
}

export function floorsBlock(ctx, oi) {
  const fkey = 'fl|' + oi.id;

  return `<div class="inline-row floors-sums" style="margin-top:8px; align-items:center;">
${sumsRow(oi)}
<button class="btn btn-ghost btn-sm" data-redistribute style="margin-left:auto">Выровнять отмеченные</button>
</div>
${CATS.map((cat) => catSection(ctx, oi, cat, fkey)).join('')}
<div class="muted" style="font-size:10.5px;margin-top:5px">Отмеченные этажи получают оставшуюся площадь поровну — КАЖДАЯ колонка от своего итога (по техпаспорту, по факту, застройка); снятый чекбокс = площади вручную. Чекбокс у категории — отметить/снять её целиком. «Надземные» — чистая площадь этажей дома, без подвала/цоколя/мансарды.</div>`;
}

export function updateFloorsUI(ctx, oi) {
  const s = ctx.scope;

  oi.floorList.forEach((f, i) => {
    AREA_FIELDS.forEach((a) => {
      const el = s.$(`[data-floor-area="${a.key}|${i}"]`);
      if (!el) return;
      if (document.activeElement !== el) el.value = f[a.key] || '';
      el.readOnly = f.on;
    });

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

  AREA_FIELDS.forEach((a) => {
    const sum = s.$(`[data-floor-sum="${a.key}"]`);
    if (!sum) return;
    const ssum = floorsSum(oi, a.key);
    const tot = num((oi.areas || {})[a.total]);
    sum.textContent = `Σ ${a.title}: ${fmtNum(ssum)} / ${fmtNum(tot)} м²`;
    sum.className = Math.abs(ssum - tot) < 0.01 ? 'sum-ok' : 'sum-warn';
  });
}

export function rerenderFloors(ctx, oi) {
  const w = ctx.scope.$('#floors-' + oi.id);
  if (w) w.outerHTML = `<div id="floors-${oi.id}" style="margin-top:10px">${floorsBlock(ctx, oi)}</div>`;
}
