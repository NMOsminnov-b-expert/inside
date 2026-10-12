// Табличный редактор «как в Excel» (ТЗ рабочего дня осмотрщика, раздел 10:
// «буквально Excel, который потом может парситься в систему»; уточнение
// пользователя 12.10.2026 — «можно открыть табличный вид… на весь экран и
// работать как в Excel»).
//
// Что умеет: активная ячейка и диапазон (мышью, Shift+стрелки, Ctrl+A);
// стрелки, Tab / Shift+Tab, Enter / Shift+Enter, Home / End, Ctrl+Home / End;
// правка — по вводу знака (заменяет), F2 или двойной щелчок (дописывает);
// Enter или Tab — сохранить, Esc — отменить; Delete — очистить диапазон;
// пробел — да/нет в логическом столбце; Ctrl+C / Ctrl+X / Ctrl+V — блоки
// ячеек в Excel и из Excel (табуляция и перевод строки); одно значение,
// вставленное в диапазон, заполняет его; Ctrl+Z — отменить последнюю правку.
// Сортировка — щелчком по заголовку, фильтр — строкой под ним; шапка и
// первые столбцы закреплены; ширина столбца — перетаскиванием края.
// Практика — WAI-ARIA APG, шаблон «grid» (роли grid / gridcell, одна точка
// фокуса, стрелки внутри).
//
// Разделы (opts.groups): строки делятся на разделы и подразделы — например,
// по ответственному лицу, а внутри по области (просьба пользователя
// 12.10.2026). У раздела свой цвет — полосой у строк и заливкой заголовка,
// подраздел — тем же цветом светлее; заголовок сворачивает и разворачивает
// группу, как группировка строк в Excel. Свёрнутые строки выпадают из
// переходов и выделения.
//
// Фильтр столбца с filter: 'select' — выбор из значений столбца, а не поиск
// по вхождению.
//
// Поля-выборы правятся выбором, а не текстом (замечание пользователя
// 12.10.2026: «где поля — выбор, то в таблице тоже должен быть выбор, а не
// текст»): у list и bool под ячейкой — список (ввод сужает, стрелки, Enter);
// у multi — список с отметками (пробел отмечает, Enter сохраняет). Вставка
// из Excel проверяется тем же списком (parseCell).
//
// Страница передаёт столбцы и строки и получает правки списком
// { id, key, value, old } — сама решает, как их сохранить, и вызывает
// refresh(rows). Таблица ничего не знает о том, что редактирует.
import { esc } from './dom.js';

const ddmmyyyy = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.split('-').reverse().join('.') : iso || '');

// Значение ячейки → текст (для показа, копирования, фильтра).
export function cellText(col, v) {
  if (v === null || v === undefined) return '';
  if (col.type === 'bool') return v ? 'да' : '';
  if (col.type === 'date') return ddmmyyyy(String(v));
  return String(v);
}

// Текст (ввод, вставка из Excel) → значение; { error } при негодном.
export function parseCell(col, text) {
  const s = String(text ?? '').trim();
  if (col.type === 'bool') {
    if (!s || /^(нет|no|false|0|-|ложь)$/i.test(s)) return { value: false };
    if (/^(да|yes|true|1|x|✓|истина|есть)$/i.test(s)) return { value: true };
    return { error: `«${s}» — нужно «да» или «нет»` };
  }
  if (!s) return { value: '' };
  if (col.type === 'number') {
    const n = Number(s.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? { value: String(n) } : { error: `«${s}» — не число` };
  }
  if (col.type === 'date') {
    let m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
    let ymd = m ? [m[3], m[2], m[1]] : null;
    if (!ymd) { m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); ymd = m ? [m[1], m[2], m[3]] : null; }
    // Дата должна существовать: 31.31.2026 и 30.02.2026 — не даты.
    const d = ymd ? new Date(+ymd[0], +ymd[1] - 1, +ymd[2]) : null;
    if (!d || d.getMonth() !== +ymd[1] - 1 || d.getDate() !== +ymd[2]) return { error: `«${s}» — дата как 01.10.2026` };
    return { value: `${ymd[0]}-${ymd[1].padStart(2, '0')}-${ymd[2].padStart(2, '0')}` };
  }
  if (col.type === 'time') {
    const m = /^(\d{1,2})[:.](\d{2})$/.exec(s);
    return m && +m[1] < 24 && +m[2] < 60 ? { value: `${m[1].padStart(2, '0')}:${m[2]}` } : { error: `«${s}» — время как 09:00` };
  }
  if (col.type === 'list') {
    const o = (col.options || []).find((x) => x.toLowerCase() === s.toLowerCase());
    return o !== undefined ? { value: o } : { error: `«${s}» — нет в списке: ${(col.options || []).join(', ')}` };
  }
  if (col.type === 'multi') {
    const parts = s.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
    const bad = parts.filter((x) => !(col.options || []).some((o) => o.toLowerCase() === x.toLowerCase()));
    if (bad.length) return { error: `«${bad.join(', ')}» — нет в списке: ${(col.options || []).join(', ')}` };
    return { value: (col.options || []).filter((o) => parts.some((x) => x.toLowerCase() === o.toLowerCase())).join(', ') };
  }
  return { value: s };
}

export function mountGrid(host, opts) {
  const cols = opts.columns;
  const frozen = opts.frozen ?? 1;
  const widths = { ...(opts.widths || {}) };
  let rows = opts.rows;
  let view = [];                       // видимые строки (фильтр + сортировка)
  // Состояние вида — можно вернуть после пересоздания (opts.state).
  const st = opts.state || {};
  const filters = { ...(st.filters || {}) };
  let sort = st.sort || { key: '', dir: 0 };
  let act = st.act || { r: 0, c: Math.min(frozen, cols.length - 1) };
  let anchor = st.anchor || { ...act };
  let edit = null;                     // { r, c, input }
  const undo = [];
  let dragging = false;
  const groups = opts.groups || null;          // { levels: [fn(row) → подпись, …], empty: [подпись пустого, …] }
  const collapsed = new Set(st.collapsed || []);

  host.innerHTML = `<div class="kg" tabindex="0" role="grid" aria-label="${esc(opts.label || 'Таблица')}" aria-multiselectable="true">
    <div class="kg-scroll"><table class="kg-tbl"><colgroup></colgroup><thead></thead><tbody></tbody></table></div>
    <div class="kg-status" aria-live="polite"></div></div>`;
  const root = host.querySelector('.kg');
  const scroll = root.querySelector('.kg-scroll');
  const tbl = root.querySelector('.kg-tbl');
  const status = root.querySelector('.kg-status');
  const say = (t) => { status.textContent = t; if (opts.onMessage) opts.onMessage(t); };

  // --- отрисовка --------------------------------------------------------------
  const W = (c) => widths[c.key] || c.width || 140;
  function leftOf(ci) { let x = 0; for (let i = 0; i < ci; i++) x += W(cols[i]); return x; }
  let allGrouped = [];
  const PALETTE = 6;
  function computeView() {
    const f = Object.entries(filters).filter(([, v]) => v);
    view = rows.filter((row) => f.every(([k, v]) => {
      const col = cols.find((c) => c.key === k);
      const text = cellText(col, row.cells[k]);
      return col.filter === 'select' ? (v === '∅' ? !text : text === v) : text.toLowerCase().includes(v.toLowerCase());
    }));
    if (sort.key && sort.dir) {
      const col = cols.find((c) => c.key === sort.key);
      const val = (row) => (col.type === 'number' ? Number(row.cells[col.key]) || 0 : cellText(col, row.cells[col.key]).toLowerCase());
      view.sort((a, b) => { const x = val(a); const y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
    }
    if (groups) {
      // Разделы — по алфавиту, «пустой» раздел — последним; порядок строк
      // внутри — тот, что дала сортировка (сортировка устойчивая).
      const keyOf = (row) => groups.levels.map((fn, i) => fn(row) || groups.empty[i]);
      const cmp = (x, y, i) => (x === groups.empty[i]) - (y === groups.empty[i]) || x.localeCompare(y, 'ru');
      view = view.map((row) => ({ row, k: keyOf(row) }))
        .sort((a, b) => cmp(a.k[0], b.k[0], 0) || cmp(a.k[1], b.k[1], 1))
        .map((x) => Object.assign(x.row, { _g: x.k }));
      allGrouped = view;
      view = view.filter((row) => !collapsed.has(row._g[0]) && !collapsed.has(row._g.join('\u0001')));
    }
  }
  function renderHead() {
    tbl.querySelector('colgroup').innerHTML = cols.map((c) => `<col style="width:${W(c)}px">`).join('');
    tbl.style.width = `${cols.reduce((n, c) => n + W(c), 0)}px`;
    const fz = (ci) => (ci < frozen ? ` kg-fz" style="left:${leftOf(ci)}px` : '');
    tbl.querySelector('thead').innerHTML = `<tr>${cols.map((c, ci) => `<th class="kg-h${fz(ci)}" role="columnheader" aria-sort="${sort.key === c.key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}" title="${esc(c.title || c.label)}">
        <button type="button" class="kg-sort" data-kg-sort="${esc(c.key)}">${esc(c.label)}${sort.key === c.key ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''}</button>
        <span class="kg-rs" data-kg-rs="${ci}" aria-hidden="true"></span></th>`).join('')}</tr>
      <tr class="kg-frow">${cols.map((c, ci) => `<th class="kg-f${fz(ci)}">${c.filter === 'select'
        ? `<select class="kg-fin" data-kg-filter="${esc(c.key)}" aria-label="Фильтр: ${esc(c.label)}"><option value="">все</option>${[...new Set(rows.map((r) => cellText(c, r.cells[c.key])))].sort((a, b) => a.localeCompare(b, 'ru'))
          .map((v) => `<option value="${esc(v || '∅')}" ${filters[c.key] === (v || '∅') ? 'selected' : ''}>${esc(v || '— не указано —')}</option>`).join('')}</select>`
        : `<input class="kg-fin" data-kg-filter="${esc(c.key)}" value="${esc(filters[c.key] || '')}" placeholder="фильтр" aria-label="Фильтр: ${esc(c.label)}">`}</th>`).join('')}</tr>`;
  }
  function renderBody() {
    computeView();
    act.r = Math.min(act.r, Math.max(0, view.length - 1));
    anchor.r = Math.min(anchor.r, Math.max(0, view.length - 1));
    const fz = (ci) => (ci < frozen ? ` kg-fz" style="left:${leftOf(ci)}px` : '');
    const rowHTML = (row, ri) => `<tr${groups ? ` class="kg-in kg-c${colorOf(row._g[0])}"` : ''}>${cols.map((c, ci) => `<td class="kg-c${c.readOnly ? ' ro' : ''}${c.type === 'number' ? ' num' : ''}${fz(ci)}" role="gridcell" data-r="${ri}" data-c="${ci}">${esc(cellText(c, row.cells[c.key]))}</td>`).join('')}</tr>`;
    let html = '';
    if (groups) {
      // Заголовки разделов и подразделов — между строками данных; число строк —
      // по всем строкам группы, включая свёрнутые.
      const count = (g0, g1) => allGrouped.filter((r) => r._g[0] === g0 && (g1 === undefined || r._g[1] === g1)).length;
      const seen = new Set();
      const head = (lvl, g0, g1) => {
        const id = lvl === 1 ? g0 : `${g0}\u0001${g1}`;
        const n = lvl === 1 ? count(g0) : count(g0, g1);
        const shut = collapsed.has(id);
        return `<tr class="kg-g kg-g${lvl} kg-c${colorOf(g0)}"><th colspan="${cols.length}"><button type="button" class="kg-gh" data-kg-group="${esc(id)}" aria-expanded="${!shut}">
          <span class="kg-gt">${shut ? '▸' : '▾'}</span>${lvl === 1 && groups.title ? `<span class="kg-gk">${esc(groups.title[0])}</span>` : ''}<b>${esc(lvl === 1 ? g0 : g1)}</b><span class="kg-gn">${n}</span></button></th></tr>`;
      };
      // Число строк раздела и подраздела — в его заголовке; отдельных строк
      // «Итого» нет (пользователь 12.10.2026: «Зачем дубляж?… Обычного
      // числа сверху хватит»).
      const order = [];
      allGrouped.forEach((row) => {
        const [g0, g1] = row._g;
        let a = order.find((x) => x.g0 === g0);
        if (!a) { a = { g0, subs: [] }; order.push(a); }
        let b = a.subs.find((x) => x.g1 === g1);
        if (!b) { b = { g1, rows: [] }; a.subs.push(b); }
        b.rows.push(row);
      });
      order.forEach(({ g0, subs }) => {
        html += head(1, g0);
        if (!collapsed.has(g0)) {
          subs.forEach(({ g1, rows: list }) => {
            html += head(2, g0, g1);
            if (collapsed.has(`${g0}\u0001${g1}`)) return;
            list.forEach((row) => { html += rowHTML(row, view.indexOf(row)); });
          });
        }
      });
      void seen;
    } else {
      html = view.map(rowHTML).join('');
    }
    tbl.querySelector('tbody').innerHTML = html || `<tr><td class="kg-empty" colspan="${cols.length}">Под фильтр ничего не подошло.</td></tr>`;
    paint();
  }
  // Цвет раздела — по порядку раздела, по кругу из шести.
  function colorOf(g0) {
    const order = [...new Set(allGrouped.map((r) => r._g[0]))];
    return Math.max(0, order.indexOf(g0)) % PALETTE;
  }
  const cell = (r, c) => tbl.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
  const range = () => ({ r1: Math.min(act.r, anchor.r), r2: Math.max(act.r, anchor.r), c1: Math.min(act.c, anchor.c), c2: Math.max(act.c, anchor.c) });
  function paint() {
    tbl.querySelectorAll('td.act, td.sel').forEach((td) => td.classList.remove('act', 'sel'));
    if (!view.length) return;
    const { r1, r2, c1, c2 } = range();
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) { const td = cell(r, c); if (td) td.classList.add('sel'); }
    const a = cell(act.r, act.c);
    if (a) {
      a.classList.add('act');
      root.setAttribute('aria-activedescendant', '');
      // Активная ячейка — в видимой части, с учётом закреплённых столбцов и шапки.
      const fzW = leftOf(frozen);
      const head = tbl.querySelector('thead').offsetHeight;
      if (act.c >= frozen) {
        if (a.offsetLeft - fzW < scroll.scrollLeft) scroll.scrollLeft = a.offsetLeft - fzW;
        else if (a.offsetLeft + a.offsetWidth > scroll.scrollLeft + scroll.clientWidth) scroll.scrollLeft = a.offsetLeft + a.offsetWidth - scroll.clientWidth;
      }
      if (a.offsetTop - head < scroll.scrollTop) scroll.scrollTop = a.offsetTop - head;
      else if (a.offsetTop + a.offsetHeight > scroll.scrollTop + scroll.clientHeight) scroll.scrollTop = a.offsetTop + a.offsetHeight - scroll.clientHeight;
    }
    const n = (range().r2 - range().r1 + 1) * (range().c2 - range().c1 + 1);
    status.textContent = view.length ? `${cols[act.c].label}, строка ${act.r + 1} из ${view.length}${n > 1 ? ` · выделено ячеек: ${n}` : ''}` : '';
  }

  // --- правка -------------------------------------------------------------------
  function apply(changes, { record = true } = {}) {
    const ok = changes.filter((x) => x.value !== x.old);
    if (!ok.length) return;
    if (record) { undo.push(ok); if (undo.length > 100) undo.shift(); }
    opts.onChange(ok);
  }
  const isPick = (col) => col.type === 'list' || col.type === 'bool' || col.type === 'multi';
  const pickOptions = (col) => (col.type === 'bool' ? ['да', 'нет'] : col.options || []);
  function startEdit(initial) {
    if (!view.length) return;
    const col = cols[act.c];
    if (col.readOnly) { say(`Столбец «${col.label}» не правится здесь`); return; }
    const td = cell(act.r, act.c);
    const row = view[act.r];
    const input = document.createElement('input');
    input.className = 'kg-edit';
    const pick = isPick(col);
    // У выбора поле — строка поиска по списку: пустое (или с введённым знаком).
    input.value = pick ? (initial || '') : initial !== undefined ? initial : cellText(col, row.cells[col.key]);
    input.setAttribute('aria-label', pick ? `${col.label}: поиск в списке` : col.label);
    Object.assign(input.style, { left: `${td.offsetLeft}px`, top: `${td.offsetTop}px`, width: `${Math.max(td.offsetWidth, pick ? 200 : 160)}px`, height: `${td.offsetHeight}px` });
    scroll.appendChild(input);
    edit = { r: act.r, c: act.c, input };
    if (pick) {
      const cur = cellText(col, row.cells[col.key]);
      const box = document.createElement('ul');
      box.className = 'kg-pick';
      box.setAttribute('role', 'listbox');
      if (col.type === 'multi') box.setAttribute('aria-multiselectable', 'true');
      Object.assign(box.style, { left: `${td.offsetLeft}px`, top: `${td.offsetTop + td.offsetHeight}px`, minWidth: `${Math.max(td.offsetWidth, 200)}px` });
      scroll.appendChild(box);
      const sel = new Set(col.type === 'multi' ? cur.split(/,\s*/).filter(Boolean) : []);
      edit.pick = { box, sel, hi: 0, list: [] };
      const curIdx = pickOptions(col).indexOf(col.type === 'bool' ? (row.cells[col.key] ? 'да' : 'нет') : cur);
      edit.pick.hi = curIdx >= 0 && !initial ? curIdx : 0;
      drawPick();
      input.addEventListener('input', () => { edit.pick.hi = 0; drawPick(); });
      box.addEventListener('mousedown', (e) => {
        const li = e.target.closest('[data-kg-opt]');
        if (!li) return;
        e.preventDefault();
        edit.pick.hi = +li.dataset.kgOpt;
        choose(col.type !== 'multi');
      });
    }
    input.focus();
    if (!pick) { if (initial === undefined) input.select(); else input.setSelectionRange(input.value.length, input.value.length); }
    input.addEventListener('keydown', onEditKey);
    input.addEventListener('blur', () => { if (edit && edit.input === input) commit(); });
  }
  // Список выбора: отбор по введённому, отмеченное, подсвеченное.
  function drawPick() {
    const col = cols[edit.c];
    const q = edit.input.value.trim().toLowerCase();
    const all = pickOptions(col);
    edit.pick.list = all.filter((o) => !q || o.toLowerCase().includes(q));
    edit.pick.hi = Math.max(0, Math.min(edit.pick.hi, edit.pick.list.length - 1));
    edit.pick.box.innerHTML = edit.pick.list.map((o, i) => `<li role="option" data-kg-opt="${i}" class="${i === edit.pick.hi ? 'hi' : ''}" aria-selected="${col.type === 'multi' ? edit.pick.sel.has(o) : i === edit.pick.hi}">${col.type === 'multi' ? `<span class="kg-ck ${edit.pick.sel.has(o) ? 'on' : ''}" aria-hidden="true"></span>` : ''}${esc(o)}</li>`).join('')
      || '<li class="kg-pick-none">Нет в списке</li>';
    const h = edit.pick.box.querySelector('.hi');
    if (h) h.scrollIntoView({ block: 'nearest' });
  }
  // Выбрать подсвеченное: у одиночного — сохранить; у multi — отметить.
  function choose(close) {
    const col = cols[edit.c];
    const o = edit.pick.list[edit.pick.hi];
    if (o === undefined) return;
    if (col.type === 'multi') {
      if (edit.pick.sel.has(o)) edit.pick.sel.delete(o); else edit.pick.sel.add(o);
      drawPick();
      return;
    }
    edit.chosen = o;
    if (close) commit();
  }
  function closeEdit() {
    if (!edit) return;
    const { input } = edit;
    if (edit.pick) edit.pick.box.remove();
    edit = null;
    input.remove();
    root.focus({ preventScroll: true });
  }
  function commit() {
    if (!edit) return true;
    const col = cols[edit.c];
    const row = view[edit.r];
    let text = edit.input.value;
    if (edit.pick) {
      if (col.type === 'multi') text = pickOptions(col).filter((o) => edit.pick.sel.has(o)).join(', ');
      else if (edit.chosen !== undefined) text = edit.chosen;
      else if (!pickOptions(col).some((o) => o.toLowerCase() === text.trim().toLowerCase())) { closeEdit(); return true; }
    }
    const p = parseCell(col, text);
    if (p.error) { say(p.error); edit.input.classList.add('bad'); return false; }
    const old = row.cells[col.key];
    closeEdit();
    apply([{ id: row.id, key: col.key, value: p.value, old }]);
    return true;
  }
  function onEditKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeEdit(); return; }
    if (edit && edit.pick) {
      const col = cols[edit.c];
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        edit.pick.hi = Math.max(0, Math.min(edit.pick.list.length - 1, edit.pick.hi + (e.key === 'ArrowDown' ? 1 : -1)));
        drawPick();
        return;
      }
      if (e.key === ' ' && col.type === 'multi') { e.preventDefault(); choose(false); return; }
      if ((e.key === 'Enter' || e.key === 'Tab') && col.type !== 'multi' && edit.chosen === undefined && edit.pick.list.length) {
        edit.chosen = edit.pick.list[edit.pick.hi];
      }
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      if (!commit()) return;
      if (e.key === 'Enter') move(e.shiftKey ? -1 : 1, 0, false);
      else move(0, e.shiftKey ? -1 : 1, false, true);
    }
  }

  // --- переходы -------------------------------------------------------------------
  function move(dr, dc, extend, wrap = false) {
    if (!view.length) return;
    let r = act.r + dr;
    let c = act.c + dc;
    if (wrap && c >= cols.length) { c = 0; r++; }
    if (wrap && c < 0) { c = cols.length - 1; r--; }
    act = { r: Math.max(0, Math.min(view.length - 1, r)), c: Math.max(0, Math.min(cols.length - 1, c)) };
    if (!extend) anchor = { ...act };
    paint();
  }
  const go = (r, c, extend) => { act = { r, c }; if (!extend) anchor = { ...act }; paint(); };

  // --- буфер обмена ------------------------------------------------------------------
  function selectionTSV() {
    const { r1, r2, c1, c2 } = range();
    const lines = [];
    for (let r = r1; r <= r2; r++) {
      const out = [];
      for (let c = c1; c <= c2; c++) out.push(cellText(cols[c], view[r].cells[cols[c].key]).replace(/[\t\n]/g, ' '));
      lines.push(out.join('\t'));
    }
    return lines.join('\r\n');
  }
  function clearRange() {
    const { r1, r2, c1, c2 } = range();
    const ch = [];
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
      const col = cols[c];
      if (col.readOnly) continue;
      ch.push({ id: view[r].id, key: col.key, value: col.type === 'bool' ? false : '', old: view[r].cells[col.key] });
    }
    apply(ch);
  }
  function pasteTSV(text) {
    const m = String(text).replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map((l) => l.split('\t'));
    if (!m.length || !view.length) return;
    const { r1, r2, c1, c2 } = range();
    // Одно значение в выделенный диапазон — заполняет весь диапазон.
    const fill = m.length === 1 && m[0].length === 1 && (r2 > r1 || c2 > c1);
    const rh = fill ? r2 - r1 + 1 : m.length;
    const cw = fill ? c2 - c1 + 1 : Math.max(...m.map((l) => l.length));
    const ch = [];
    const errs = [];
    let skipped = 0;
    for (let i = 0; i < rh; i++) for (let j = 0; j < cw; j++) {
      const r = r1 + i;
      const c = c1 + j;
      if (r >= view.length || c >= cols.length) { skipped++; continue; }
      const col = cols[c];
      const raw = fill ? m[0][0] : (m[i] || [])[j];
      if (raw === undefined) continue;
      if (col.readOnly) { skipped++; continue; }
      const p = parseCell(col, raw);
      if (p.error) { errs.push(`${col.label}, строка ${r + 1}: ${p.error}`); continue; }
      ch.push({ id: view[r].id, key: col.key, value: p.value, old: view[r].cells[col.key] });
    }
    apply(ch);
    act = { r: Math.min(view.length - 1, r1 + rh - 1), c: Math.min(cols.length - 1, c1 + cw - 1) };
    anchor = { r: r1, c: c1 };
    paint();
    say(`Вставлено ячеек: ${ch.length}${skipped ? ` · не вставлено (за краем или без правки): ${skipped}` : ''}${errs.length ? ` · с ошибкой: ${errs.length} — ${errs[0]}` : ''}`);
  }

  // --- события ---------------------------------------------------------------------
  function onKey(e) {
    if (edit || e.target.classList.contains('kg-fin')) return;
    const k = e.key;
    const ctrl = e.ctrlKey || e.metaKey;
    const last = { r: view.length - 1, c: cols.length - 1 };
    if (k === 'ArrowDown') { e.preventDefault(); if (ctrl) go(last.r, act.c, e.shiftKey); else move(1, 0, e.shiftKey); } else if (k === 'ArrowUp') { e.preventDefault(); if (ctrl) go(0, act.c, e.shiftKey); else move(-1, 0, e.shiftKey); } else if (k === 'ArrowRight') { e.preventDefault(); if (ctrl) go(act.r, last.c, e.shiftKey); else move(0, 1, e.shiftKey); } else if (k === 'ArrowLeft') { e.preventDefault(); if (ctrl) go(act.r, 0, e.shiftKey); else move(0, -1, e.shiftKey); } else if (k === 'Home') { e.preventDefault(); go(ctrl ? 0 : act.r, 0, e.shiftKey); } else if (k === 'End') { e.preventDefault(); go(ctrl ? last.r : act.r, last.c, e.shiftKey); } else if (k === 'Tab') { e.preventDefault(); move(0, e.shiftKey ? -1 : 1, false, true); } else if (k === 'Enter') { e.preventDefault(); move(e.shiftKey ? -1 : 1, 0, false); } else if (k === 'F2') { e.preventDefault(); startEdit(); } else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); clearRange(); } else if (k === ' ' && cols[act.c].type === 'bool' && !cols[act.c].readOnly) {
      e.preventDefault();
      const row = view[act.r];
      apply([{ id: row.id, key: cols[act.c].key, value: !row.cells[cols[act.c].key], old: row.cells[cols[act.c].key] }]);
    } else if (ctrl && (k === 'a' || k === 'ф')) { e.preventDefault(); anchor = { r: 0, c: 0 }; act = { ...last }; paint(); } else if (ctrl && (k === 'z' || k === 'я')) {
      e.preventDefault();
      const b = undo.pop();
      if (b) { apply(b.map((x) => ({ ...x, value: x.old, old: x.value })), { record: false }); say(`Отменено правок: ${b.length}`); }
    } else if (k === 'Escape' && opts.onEscape) { opts.onEscape(); } else if (k.length === 1 && !ctrl && !e.altKey) { e.preventDefault(); startEdit(k); }
  }
  root.addEventListener('keydown', onKey);
  root.addEventListener('copy', (e) => { if (edit || e.target.classList.contains('kg-fin')) return; e.preventDefault(); e.clipboardData.setData('text/plain', selectionTSV()); say('Скопировано'); });
  root.addEventListener('cut', (e) => { if (edit || e.target.classList.contains('kg-fin')) return; e.preventDefault(); e.clipboardData.setData('text/plain', selectionTSV()); clearRange(); });
  root.addEventListener('paste', (e) => { if (edit || e.target.classList.contains('kg-fin')) return; e.preventDefault(); pasteTSV(e.clipboardData.getData('text/plain')); });
  tbl.addEventListener('mousedown', (e) => {
    const td = e.target.closest('td[data-r]');
    if (!td || e.button !== 0) return;
    if (edit) commit();
    const r = +td.dataset.r;
    const c = +td.dataset.c;
    act = { r, c };
    if (!e.shiftKey) anchor = { r, c };
    dragging = true;
    paint();
    root.focus({ preventScroll: true });
    e.preventDefault();
  });
  tbl.addEventListener('mouseover', (e) => {
    if (!dragging) return;
    const td = e.target.closest('td[data-r]');
    if (td) { act = { r: +td.dataset.r, c: +td.dataset.c }; paint(); }
  });
  const stopDrag = () => { dragging = false; };
  document.addEventListener('mouseup', stopDrag);
  tbl.addEventListener('dblclick', (e) => { if (e.target.closest('td[data-r]')) startEdit(); });
  tbl.querySelector('tbody').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kg-group]');
    if (!b) return;
    const id = b.dataset.kgGroup;
    if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
    renderBody();
    root.focus({ preventScroll: true });
  });
  tbl.querySelector('thead').addEventListener('change', (e) => {
    const f = e.target.closest('select[data-kg-filter]');
    if (!f) return;
    filters[f.dataset.kgFilter] = f.value;
    renderBody();
  });
  tbl.querySelector('thead').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kg-sort]');
    if (!b) return;
    const key = b.dataset.kgSort;
    sort = sort.key !== key ? { key, dir: 1 } : sort.dir === 1 ? { key, dir: -1 } : { key: '', dir: 0 };
    renderHead();
    renderBody();
  });
  tbl.querySelector('thead').addEventListener('input', (e) => {
    const f = e.target.closest('[data-kg-filter]');
    if (!f) return;
    filters[f.dataset.kgFilter] = f.value;
    renderBody();
  });
  // Ширина столбца — перетаскиванием края заголовка.
  tbl.querySelector('thead').addEventListener('mousedown', (e) => {
    const h = e.target.closest('[data-kg-rs]');
    if (!h) return;
    e.preventDefault();
    const col = cols[+h.dataset.kgRs];
    const x0 = e.clientX;
    const w0 = W(col);
    const onMove = (ev) => {
      widths[col.key] = Math.max(48, Math.round(w0 + ev.clientX - x0));
      tbl.querySelector('colgroup').children[+h.dataset.kgRs].style.width = `${widths[col.key]}px`;
      tbl.style.width = `${cols.reduce((n, c) => n + W(c), 0)}px`;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      renderHead();
      renderBody();
      if (opts.onWidths) opts.onWidths({ ...widths });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  renderHead();
  renderBody();
  if (st.scroll) { scroll.scrollTop = st.scroll[0]; scroll.scrollLeft = st.scroll[1]; }
  return {
    root,
    state: () => ({ filters: { ...filters }, sort: { ...sort }, act: { ...act }, anchor: { ...anchor }, scroll: [scroll.scrollTop, scroll.scrollLeft], collapsed: [...collapsed] }),
    refresh(next) {
      const id = view[act.r] && view[act.r].id;
      rows = next;
      renderBody();
      const i = view.findIndex((r) => r.id === id);
      if (i >= 0) { act.r = i; anchor.r = Math.min(Math.max(anchor.r, 0), view.length - 1); paint(); }
    },
    focus() { root.focus({ preventScroll: true }); },
    destroy() { document.removeEventListener('mouseup', stopDrag); host.innerHTML = ''; },
  };
}
