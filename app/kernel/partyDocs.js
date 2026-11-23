// Документы-основания у собственников и пользователей карточки ОЦ — как на проде (пользователь 23.11.2026:
// «Там делаем механизм как на проде»; запись графа zapros-dokumentov-na-osmotr-cod-sostavlyaet-regional-
// podtverzhdaet-osm). Один механизм на все типы ОЦ: модули рисуют участника, а документы под ним — отсюда.
//
//   * Привязанные документы — документы этой карточки (записи и её ОИ): «Это прикрепленные в систему pdf
//     файлы»; перечень один для собственников и пользователей, и один документ может быть привязан к обоим
//     сразу («оно одновременно и туда и туда может быть прикреплено»).
//   * «+ ещё документ» — окно «Документы-основания · <участник>» у кнопки (не на весь экран — правило
//     bez-modalok): вкладки по видам, поиск, флажки, предпросмотр выбранного, «Привязать (N)».
//   * «Документа нет в системе» — строка «Не подтверждён документом»: вид, №, дата, кем выдан и серия. Такие
//     строки ЦОД по умолчанию берёт в «Запросить документы» (pendingDocsOf).
//
// Данные участника: docs — ключи документов «<scope>|<id>» (scope — 'oc' или id ОИ, как в kernel/fileUpload.js
// docListFor), unconfirmed — [{ id, type, no, date, issuer }]. Прежнее поле pud (документ доли строкой) не
// стирается: пока у участника нет ни docs, ни unconfirmed, оно читается — совпало с названием документа
// карточки — привязкой, нет — строкой «Не подтверждён документом» (правило refaktor-bez-poteri-logiki-i-poley).
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: привязка — связь «участник — документ» в базе (многие ко многим), а не ключи в записи;
// строки «Не подтверждён документом» — отдельная таблица с автором и временем.
import { esc } from './dom.js';
import { paintPdfCanvases } from './viewer/pdf.js';
import { openDocViewer } from './viewer/state.js';

export const docKey = (scope, id) => `${scope}|${id}`;

// Все документы карточки: записи и её ОИ.
export function cardDocs(rec) {
  const out = [];
  ((rec && rec.docs) || []).forEach((d) => d && d.id && out.push({ key: docKey('oc', d.id), scope: 'oc', id: d.id, doc: d, where: '' }));
  ((rec && rec.oi) || []).forEach((o) => (o.docs || []).forEach((d) => d && d.id
    && out.push({ key: docKey(o.id, d.id), scope: o.id, id: d.id, doc: d, where: o.letter ? `литера ${o.letter}` : o.name || '' })));
  return out;
}

let seq = 0;
const newId = () => `u${Date.now().toString(36)}${(++seq).toString(36)}`;

// Документы участника: прочитанные (с переводом прежнего pud) — без записи в данные.
export function partyDocsOf(rec, p) {
  const all = cardDocs(rec);
  if (Array.isArray(p.docs) || Array.isArray(p.unconfirmed)) {
    const keys = new Set(p.docs || []);
    return { docs: all.filter((x) => keys.has(x.key)), unconfirmed: p.unconfirmed || [] };
  }
  const pud = String(p.pud || '').trim();
  if (!pud) return { docs: [], unconfirmed: [] };
  const hit = all.find((x) => String(x.doc.name || '').trim() === pud);
  return hit ? { docs: [hit], unconfirmed: [] } : { docs: [], unconfirmed: [{ id: 'pud', type: pud, no: '', date: '', issuer: '' }] };
}

// Перевести прочитанное в данные участника — перед первой правкой документов.
function materialize(rec, p) {
  if (Array.isArray(p.docs) && Array.isArray(p.unconfirmed)) return;
  const cur = partyDocsOf(rec, p);
  p.docs = cur.docs.map((x) => x.key);
  p.unconfirmed = cur.unconfirmed.map((u) => ({ ...u }));
}

// Строки «Не подтверждён документом» всей карточки — по умолчанию для «Запросить документы».
export function pendingDocsOf(rec) {
  const out = [];
  [['owner', 'Собственник', rec.owners], ['user', 'Пользователь', rec.users]].forEach(([kind, role, list]) => (list || []).forEach((x, i) => {
    if (!x || typeof x !== 'object') return;
    partyDocsOf(rec, x).unconfirmed.forEach((u) => out.push({ kind, i, role, party: x.name || '', row: u }));
  }));
  return out;
}

const dateRu = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || '')); return m ? `${m[3]}.${m[2]}.${m[1]}` : String(v || ''); };
const badge = (d) => {
  const k = (d.file && d.file.kind) || '';
  return `<i class="pd-ico ${k === 'pdf' ? 'is-pdf' : k === 'image' ? 'is-img' : ''}" aria-hidden="true">${k === 'image' ? 'IMG' : 'PDF'}</i>`;
};

// Под строкой участника: привязанные документы, «Не подтверждён документом», действия.
export function partyDocsHTML(rec, kind, i, p) {
  const ref = `${kind}|${i}`;
  const { docs, unconfirmed } = partyDocsOf(rec, p);
  const chip = (x) => `<span class="pd-chip">${badge(x.doc)}
      <button type="button" class="pd-chip-t" data-pd-open="${esc(x.key)}" title="Открыть: ${esc(x.doc.name || '')}">${esc(x.doc.name || x.doc.type || 'Документ')}</button>
      ${x.doc.date ? `<span class="pd-chip-d">${esc(dateRu(x.doc.date))}</span>` : ''}
      <button type="button" class="pd-x" data-pd-off="${esc(ref)}|${esc(x.key)}" aria-label="Открепить: ${esc(x.doc.name || '')}" title="Открепить">×</button></span>`;
  const urow = (u) => `<div class="pd-urow" data-pd-u="${esc(ref)}|${esc(u.id)}">
      <input class="input" data-pd-uk="type" value="${esc(u.type)}" placeholder="Решение, приказ…" aria-label="Вид документа" list="pd-types">
      <input class="input" data-pd-uk="no" value="${esc(u.no)}" placeholder="№" aria-label="Номер документа">
      <input class="input" type="date" data-pd-uk="date" value="${esc(u.date)}" aria-label="Дата документа">
      <input class="input" data-pd-uk="issuer" value="${esc(u.issuer)}" placeholder="кем выдан, серия…" aria-label="Кем выдан, серия">
      <button type="button" class="pd-x" data-pd-udel aria-label="Убрать строку" title="Убрать">×</button></div>`;
  return `<div class="pd" data-pd="${esc(ref)}">
    ${docs.length ? `<div class="pd-chips">${docs.map(chip).join('')}</div>` : ''}
    ${unconfirmed.length ? `<div class="pd-unc"><span class="pd-badge">Не подтверждён документом</span>${unconfirmed.map(urow).join('')}</div>` : ''}
    <div class="pd-acts">
      <button type="button" class="pd-act" data-pd-pick="${esc(ref)}">+ ещё документ</button>
      <button type="button" class="pd-act" data-pd-none="${esc(ref)}">Документа нет в системе</button>
    </div></div>`;
}

// Виды для строки «Не подтверждён документом» — подсказкой, ввод свободный.
export function partyDocTypesHTML(types) {
  return `<datalist id="pd-types">${(types || []).map((t) => `<option value="${esc(t)}"></option>`).join('')}</datalist>`;
}

// --- окно «Документы-основания» ---------------------------------------------------------------------------

let pop = null;   // { el, close }

function preview(box, x) {
  const d = x && x.doc;
  const f = d && d.file;
  box.innerHTML = !d ? '<p class="pd-pv-none">Выберите документ</p>'
    : f && f.kind === 'pdf' && f.dataUrl ? `<canvas class="pd-pv-canvas" data-pdf-src="1" data-pdf-url="${esc(f.dataUrl)}" data-pdf-thumb="900"></canvas>`
      : f && f.kind === 'image' && f.dataUrl ? `<img class="pd-pv-img" src="${esc(f.dataUrl)}" alt="${esc(d.name || '')}">`
        : '<p class="pd-pv-none">Файл не загружен</p>';
  if (d) box.insertAdjacentHTML('beforeend', `<p class="pd-pv-cap">${esc([d.name, d.date ? 'от ' + dateRu(d.date) : '', f && f.name].filter(Boolean).join(' · '))}</p>`);
  paintPdfCanvases({ scope: { root: box } }, 1, box);
}

function place(el, anchor) {
  const r = anchor.getBoundingClientRect();
  // Предпросмотр — крупно (замечание пользователя 23.11.2026 «предпросмотр к слову мелкий»): окно до 1100 px.
  const w = Math.min(1100, window.innerWidth - 16);
  el.style.width = `${w}px`;
  const h = el.offsetHeight;
  const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
  const below = r.bottom + 6 + h <= window.innerHeight - 8;
  const top = below ? r.bottom + 6 : Math.max(8, r.top - 6 - h);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

export function closePartyDocsPop() {
  if (pop) pop.close();
}

function openPick(anchor, rec, p, onBind) {
  closePartyDocsPop();
  const all = cardDocs(rec);
  const chosen = new Set(partyDocsOf(rec, p).docs.map((x) => x.key));
  const types = [...new Set(all.map((x) => x.doc.type).filter(Boolean))];
  let tab = '';
  let q = '';
  let focus = all.find((x) => chosen.has(x.key)) || all[0] || null;
  const el = document.createElement('div');
  el.className = 'pd-pop anim-in';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', `Документы-основания · ${p.name || ''}`);
  const list = () => all.filter((x) => (!tab || x.doc.type === tab)
    && (!q || [x.doc.name, x.doc.type, x.doc.date, x.doc.file && x.doc.file.name].join(' ').toLowerCase().includes(q)));
  const draw = () => {
    const rows = list();
    el.innerHTML = `<div class="pd-pop-h">Документы-основания · ${esc(p.name || 'участник')}</div>
      <div class="pd-pop-bar"><div class="pd-tabs" role="group" aria-label="Вид документа">
        ${['', ...types].map((t) => `<button type="button" data-pd-tab="${esc(t)}" aria-pressed="${tab === t}">${esc(t || 'Все')}</button>`).join('')}</div>
        <input class="input pd-q" data-pd-q value="${esc(q)}" placeholder="Номер или имя файла" aria-label="Поиск документа" autocomplete="off"></div>
      <div class="pd-pop-body"><ul class="pd-list">${rows.length ? rows.map((x) => `<li class="pd-li ${chosen.has(x.key) ? 'on' : ''} ${focus && focus.key === x.key ? 'cur' : ''}" data-pd-li="${esc(x.key)}">
          <input type="checkbox" data-pd-ck="${esc(x.key)}" ${chosen.has(x.key) ? 'checked' : ''} aria-label="Отметить: ${esc(x.doc.name || '')}">
          ${badge(x.doc)}<span class="pd-li-t"><b>${esc(x.doc.name || 'Документ')}</b>${x.doc.date ? ` от ${esc(dateRu(x.doc.date))}` : ''}
          <small>${esc([x.doc.file && x.doc.file.name, x.where].filter(Boolean).join(' · '))}</small></span>
          ${x.doc.type ? `<span class="pd-li-k">${esc(x.doc.type)}</span>` : ''}</li>`).join('')
    : `<li class="pd-li-none">${all.length ? 'Ничего не найдено' : 'К карточке не прикреплено ни одного документа'}</li>`}</ul>
        <div class="pd-pv" data-pd-pv aria-label="Предпросмотр"></div></div>
      <div class="pd-pop-f"><span class="pd-pop-n">Отмечено: ${chosen.size} · документы этой карточки</span>
        <button type="button" class="btn btn-ghost btn-sm" data-pd-cancel>Отмена</button>
        <button type="button" class="btn btn-primary btn-sm" data-pd-bind>Привязать (${chosen.size})</button></div>`;
    preview(el.querySelector('[data-pd-pv]'), focus);
  };
  draw();
  document.body.appendChild(el);
  place(el, anchor);
  const qFocus = () => { const i = el.querySelector('[data-pd-q]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } };
  qFocus();

  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-pd-tab],[data-pd-li],[data-pd-cancel],[data-pd-bind]');
    if (!t) return;
    if (t.dataset.pdTab !== undefined) { tab = t.dataset.pdTab; draw(); return; }
    if (t.hasAttribute('data-pd-cancel')) { close(); return; }
    if (t.hasAttribute('data-pd-bind')) { const keys = [...chosen]; close(); onBind(keys); return; }
    const key = t.dataset.pdLi;
    focus = all.find((x) => x.key === key) || focus;
    if (e.target.matches('[data-pd-ck]')) { if (e.target.checked) chosen.add(key); else chosen.delete(key); }
    draw();
  });
  el.addEventListener('input', (e) => { if (e.target.matches('[data-pd-q]')) { q = e.target.value.trim().toLowerCase(); draw(); qFocus(); } });
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const onDown = (e) => { if (!el.contains(e.target) && e.target !== anchor) close(); };
  const onResize = () => place(el, anchor);
  document.addEventListener('keydown', onKey);
  setTimeout(() => document.addEventListener('mousedown', onDown), 0);
  window.addEventListener('resize', onResize);
  function close() {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('mousedown', onDown);
    window.removeEventListener('resize', onResize);
    el.remove();
    if (pop && pop.el === el) pop = null;
  }
  pop = { el, close };
}

// Обработчики — после каждой отрисовки блока. listOf(rec, kind) — изменяемый список участников модуля.
export function bindPartyDocs(ctx, rec, listOf) {
  const s = ctx.scope;
  const party = (ref) => { const [kind, i] = String(ref).split('|'); return listOf(rec, kind)[+i] || null; };
  const open = (key) => {
    const x = cardDocs(rec).find((d) => d.key === key);
    if (!x) return;
    if (ctx.ui) { openDocViewer(ctx, x.scope, x.id); return; }
    if (x.doc.file && x.doc.file.dataUrl) window.open(x.doc.file.dataUrl, '_blank', 'noopener');
  };
  s.$$('[data-pd-open]').forEach((b) => b.onclick = () => open(b.dataset.pdOpen));
  s.$$('[data-pd-off]').forEach((b) => b.onclick = () => {
    const [kind, i, ...key] = b.dataset.pdOff.split('|');
    const p = party(`${kind}|${i}`);
    if (!p) return;
    materialize(rec, p);
    p.docs = p.docs.filter((k) => k !== key.join('|'));
    ctx.render();
  });
  s.$$('[data-pd-pick]').forEach((b) => b.onclick = () => {
    const p = party(b.dataset.pdPick);
    if (!p) return;
    openPick(b, rec, p, (keys) => { materialize(rec, p); p.docs = keys; ctx.render(); });
  });
  s.$$('[data-pd-none]').forEach((b) => b.onclick = () => {
    const ref = b.dataset.pdNone;
    const p = party(ref);
    if (!p) return;
    materialize(rec, p);
    const u = { id: newId(), type: '', no: '', date: '', issuer: '' };
    p.unconfirmed.push(u);
    ctx.render();
    const first = ctx.scope.$(`[data-pd-u="${CSS.escape(`${ref}|${u.id}`)}"] [data-pd-uk="type"]`);
    if (first) first.focus();
  });
  s.$$('[data-pd-u]').forEach((row) => {
    const [kind, i, id] = row.dataset.pdU.split('|');
    const p = party(`${kind}|${i}`);
    if (!p) return;
    row.querySelectorAll('[data-pd-uk]').forEach((inp) => inp.onchange = () => {
      materialize(rec, p);
      const u = p.unconfirmed.find((x) => x.id === id);
      if (u) u[inp.dataset.pdUk] = inp.value.trim();
    });
    const del = row.querySelector('[data-pd-udel]');
    if (del) del.onclick = () => {
      materialize(rec, p);
      p.unconfirmed = p.unconfirmed.filter((x) => x.id !== id);
      ctx.render();
    };
  });
}

// --- «Запросить документы» в карточке ---------------------------------------------------------------------------
// Блок рисует kernel/docRequests.js и регистрируется здесь при загрузке (его грузит pages/inspection/results.js,
// как вкладку «Результаты осмотра»): модули карточек обращаются только сюда — прямой импорт docRequests.js
// (→ назначения → реестр → модули) дал бы кольцо.
let reqImpl = null;
export function setDocRequestCard(fns) { reqImpl = fns; }
export const docRequestSlotHTML = (typeId, rec) => (reqImpl ? reqImpl.html(typeId, rec) : '');
export function bindDocRequestSlot(ctx, typeId, rec) { if (reqImpl) reqImpl.bind(ctx, typeId, rec); }

// Принятый ЦОД скан по строке запроса «Запросить документы» — привязать к участнику вместо его строки «Не подтверждён
// документом» (пользователь 23.11.2026 на вопрос «ЦОД принял скан — что дальше?»: «Привязать само»). party — из
// строки запроса: kind, uid строки, name участника (по имени — если участника передвинули в перечне).
export function confirmPartyDoc(rec, party, key) {
  if (!rec || !party || !key) return false;
  const list = party.kind === 'user' ? rec.users : rec.owners;
  if (!Array.isArray(list)) return false;
  const objs = list.map((x) => (x && typeof x === 'object' ? x : { name: String(x || ''), share: '' }));
  if (party.kind === 'user') rec.users = objs; else rec.owners = objs;
  const hasRow = (p) => partyDocsOf(rec, p).unconfirmed.some((u) => u.id === party.uid);
  const p = objs.find(hasRow) || objs.find((x) => x.name === party.name) || objs[party.i] || null;
  if (!p) return false;
  materialize(rec, p);
  p.unconfirmed = p.unconfirmed.filter((u) => u.id !== party.uid);
  if (!p.docs.includes(key)) p.docs.push(key);
  return true;
}
