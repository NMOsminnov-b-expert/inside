import { appState } from '../../core/state.js';
import { esc, fmt, num } from '../../core/utils.js';
import { floorsSum } from './floorsModel.js';

export function floorsBlock(oi) {
  const s = floorsSum(oi);
  const t = num(oi.areas.tp);
  const ok = Math.abs(s - t) < 0.01;
  const fkey = 'fl|' + oi.id;
  const anyAuto = (oi.floorList || []).some((f) => f.on);
  const open = appState.accOpen[fkey] === true || (appState.accOpen[fkey] === undefined && (oi.floors > 1 || anyAuto));
  return `<div class="field" style="max-width:220px"><label>Количество этажей</label>
    <input class="input" data-floors-n value="${oi.floors}" inputmode="numeric"></div>
    <div class="acc ${open ? 'open' : ''}" style="margin-top:6px">
      <div class="acc-head" data-acc-toggle="${fkey}"><span class="chev">▾</span>Поэтажная развёртка (включая подвал, мансарду, цоколь)
        <span style="margin-left:auto" data-floor-sum class="${ok ? 'sum-ok' : 'sum-warn'}">Σ этажей: ${fmt(s)} / ${fmt(t)} м²</span>
        <button class="btn btn-ghost btn-sm" data-redistribute style="margin-left:8px">Выровнять отмеченные</button>
      </div>
      <div class="acc-body" style="padding:8px">
        <table class="tbl"><thead><tr><th style="width:30px"></th><th>Этаж</th><th style="width:120px">Площадь, м²</th><th style="width:120px">Высота внешн, м</th><th style="width:120px">Высота внутр, м</th></tr></thead>
        <tbody>${(oi.floorList || []).map((f, i) => `<tr>
          <td><input type="checkbox" data-floor-on="${i}" ${f.on ? 'checked' : ''} title="Отмечено — площадь распределяется автоматически; снято — задаётся вручную"></td>
          <td>${esc(f.name)}${f.special ? ' <span class="tag-mini">вручную</span>' : ''}</td>
          <td><input class="input" data-floor-area="${i}" value="${esc(f.area)}" ${f.special || f.on ? '' : 'disabled'}></td>
          <td><input class="input" data-floor-hext="${i}" value="${esc(f.hExt)}"></td>
          <td><input class="input" data-floor-hint="${i}" value="${esc(f.hInt)}"></td>
        </tr>`).join('')}</tbody></table>
        <div class="muted" style="font-size:10.5px;margin-top:5px">Отмеченные этажи получают оставшуюся площадь (итог − сумма ручных) поровну; снятый чекбокс = площадь вручную. Высоты по внешним и внутренним замерам — по каждому этажу.</div>
      </div>
    </div>`;
}

export function updateFloorsUI(oi) {
  oi.floorList.forEach((f, i) => {
    const a = document.querySelector(`[data-floor-area="${i}"]`);
    if (a) {
      if (document.activeElement !== a) a.value = f.area;
      a.readOnly = f.on;
      a.disabled = !f.special && !f.on;
    }
    const on = document.querySelector(`[data-floor-on="${i}"]`);
    if (on) on.checked = f.on;
    const he = document.querySelector(`[data-floor-hext="${i}"]`);
    if (he && document.activeElement !== he) he.value = f.hExt;
    const hi = document.querySelector(`[data-floor-hint="${i}"]`);
    if (hi && document.activeElement !== hi) hi.value = f.hInt;
  });
  const s = document.querySelector('[data-floor-sum]');
  if (s) {
    const ssum = floorsSum(oi);
    const tot = num(oi.areas.tp);
    s.textContent = `Σ этажей: ${fmt(ssum)} / ${fmt(tot)} м²`;
    s.className = Math.abs(ssum - tot) < 0.01 ? 'sum-ok' : 'sum-warn';
  }
}

export function rerenderFloors(oi) {
  const w = document.getElementById('floors-' + oi.id);
  if (w) w.outerHTML = `<div id="floors-${oi.id}" style="margin-top:10px">${floorsBlock(oi)}</div>`;
}