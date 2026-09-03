import { esc } from '../../../../kernel/dom.js';
import { fmtNum, num, plural } from '../../../../kernel/fmt.js';
import { MANSARD_TYPE } from '../../data/dictionaries.js';
import { opt } from '../../data/opts.js';
import { floorsSum, floorsSumByCat, AREA_FIELDS, FLOOR_CATS } from './floors.model.js';

// Развёрткой управляет человек, а не формула (решение пользователя 2026-08-28):
// строку любой категории можно добавить и удалить, имя строки правится прямо в
// таблице — этажи бывают и «−1», и «Цоколь 2», и «Мансарда над пристроем».
// Конструктивный тип мансарды — у каждой мансардной строки: мансарда и
// полумансарда встречаются в одном здании (Л5.3).

function catSummary(rows) {
  const sum = rows.reduce((s, f) => s + num(f.area), 0);
  return `${rows.length} · ${fmtNum(sum)} м²`;
}

function mansardTypeCell(f, i) {
  return `<td><select class="select" data-floor-mansard="${i}">
${opt('building', 'mansardType', MANSARD_TYPE).map((o) => `<option ${o === (f.mansardType || opt('building', 'mansardType', MANSARD_TYPE)[0]) ? 'selected' : ''}>${o}</option>`).join('')}
</select></td>`;
}

function catSection(ctx, oi, cat, fkey) {
  const rows = oi.floorList.map((f, i) => ({ f, i })).filter(({ f }) => f.cat === cat.key);

  const onCount = rows.filter(({ f }) => f.on).length;
  const ckey = `${fkey}|${cat.key}`;
  const open = ctx.ui.accOpen[ckey] === true
    || (ctx.ui.accOpen[ckey] === undefined && cat.key === 'over');
  const isMansard = cat.key === 'mansard';

  // Заголовок категории показывается даже когда строк нет — иначе добавить
  // первую было бы негде (объект может состоять из одного цоколя).
  // Доли колонок — от ширины за вычетом двух служебных (чекбокс и крестик,
  // по 36px). Если считать их от полной ширины, сумма долей плюс служебные
  // пикселя превышает таблицу, и она уезжает под горизонтальную прокрутку —
  // ровно это и случалось с мансардной секцией, где колонок на одну больше.
  const col = (frac) => `width:calc((100% - 72px) * ${frac})`;
  const w = isMansard
    ? { name: 0.20, type: 0.16, area: 0.17, h: 0.15 }
    : { name: 0.26, area: 0.21, h: 0.16 };

  const body = rows.length
    ? `<table class="tbl al-tbl"><thead><tr><th class="fl-c"></th><th style="${col(w.name)}">Этаж</th>
${isMansard ? `<th style="${col(w.type)}">Тип</th>` : ''}
${AREA_FIELDS.map((a) => `<th style="${col(w.area)}" title="итог: ${a.title}">${a.label}</th>`).join('')}
<th style="${col(w.h)}">Высота внешн, м</th><th style="${col(w.h)}">Высота внутр, м</th>
<th class="fl-c"></th></tr></thead>
<tbody>${rows.map(({ f, i }) => `<tr>
<td><input type="checkbox" data-floor-on="${i}" ${f.on ? 'checked' : ''} title="Отмечено — площади распределяются автоматически; снято — задаются вручную"></td>
<td><input class="input" data-floor-name="${i}" value="${esc(f.name)}" title="Название строки — можно править: этаж «−1», «Цоколь 2» и т. п."></td>
${isMansard ? mansardTypeCell(f, i) : ''}
${AREA_FIELDS.map((a) => `<td><input class="input" data-floor-area="${a.key}|${i}" value="${esc(f[a.key] || '')}" ${f.on ? 'readonly' : ''} title="${f.on ? 'Считается автоматически — снимите отметку, чтобы задать вручную' : ''}"></td>`).join('')}
<td><input class="input" data-floor-hext="${i}" value="${esc(f.hExt)}"></td>
<td><input class="input" data-floor-hint="${i}" value="${esc(f.hInt)}"></td>
<td class="al-act"><button class="btn btn-danger btn-sm" data-del-floor="${i}" title="Убрать строку">×</button></td>
</tr>`).join('')}</tbody></table>`
    : `<div class="al-empty">Строк нет. Добавьте кнопкой «+ ${esc(cat.add)}».</div>`;

  return `<div class="al acc ${open ? 'open' : ''}">
<div class="acc-head" data-acc-toggle="${ckey}" style="display:flex;align-items:center;gap:8px">
<span class="chev">▾</span>
${rows.length ? `<input type="checkbox" data-cat-all="${cat.key}" ${onCount === rows.length ? 'checked' : ''} title="Выбрать/снять всю категорию — площадь распределится автоматически">` : ''}
<span>${cat.label}</span>
<span style="margin-left:auto" data-cat-summary="${cat.key}">${catSummary(rows.map(({ f }) => f))}</span>
<button class="btn btn-ghost btn-sm" data-add-floor="${cat.key}">+ ${esc(cat.add)}</button>
</div>
<div class="acc-body">${body}</div>
</div>`;
}

// Сноска под развёрткой — та же величина, что в приписке у поля.
function floorsHint(oi) {
  const n = (oi.floorList || []).filter((f) => f.cat === 'over').length;
  if (!n) return '<b>Надземных этажей нет</b> — объект из подземных и мансардных строк.';
  return `<b>${floorsNote(oi)}</b> надземных.`;
}

export function floorsCountField(oi) {
  // Приписка прямо под полем (Л2.8): сколько получилось надземных этажей и
  // какая у них площадь. Слово согласовано с числом — «1 этаж», «2 этажа».
  return `<div class="field"><label>Количество этажей</label>
<input class="input" data-floors-n value="${oi.floors}" inputmode="numeric"
  title="Надземные этажи. Подвалы, цоколи и мансарды добавляются в самой развёртке">
<span class="muted floors-note" data-floors-note>${floorsNote(oi)}</span></div>`;
}

// Текст приписки: «2 этажа · 96,40 м²». Отдельной функцией, потому что его же
// обновляет updateFloorsUI после правки площадей.
export function floorsNote(oi) {
  const n = (oi.floorList || []).filter((f) => f.cat === 'over').length;
  const area = floorsSumByCat(oi, 'over');
  if (!n) return 'надземных этажей нет';
  return `${n} ${plural(n, 'этаж', 'этажа', 'этажей')} · ${fmtNum(area)} м²`;
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
${FLOOR_CATS.map((cat) => catSection(ctx, oi, cat, fkey)).join('')}
<div class="muted" style="font-size:10.5px;margin-top:5px">${floorsHint(oi)} Отмеченные строки получают оставшуюся площадь поровну — каждая колонка от своего итога (по техпаспорту и застройка); снятый чекбокс = площади вручную. Название строки правится: этажи бывают «−1», подвалов и цоколей — несколько. Любую строку можно убрать крестиком.</div>`;
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

  FLOOR_CATS.forEach((cat) => {
    const rows = oi.floorList.filter((f) => f.cat === cat.key);

    const summaryEl = s.$(`[data-cat-summary="${cat.key}"]`);
    if (summaryEl) summaryEl.textContent = catSummary(rows);

    const allCb = s.$(`[data-cat-all="${cat.key}"]`);
    if (allCb && rows.length) {
      const onCount = rows.filter((f) => f.on).length;
      allCb.checked = onCount === rows.length;
      allCb.indeterminate = onCount > 0 && onCount < rows.length;
    }
  });

  const note = s.$('[data-floors-note]');
  if (note) note.textContent = floorsNote(oi);

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
