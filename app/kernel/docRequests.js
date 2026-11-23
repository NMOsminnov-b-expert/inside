// «Запросить документы» — запрос ЦОД на документы к осмотру (пользователь 23.11.2026; запись графа zapros-dokumentov-
// na-osmotr-cod-sostavlyaet-regional-podtverzhdaet-osm):
//
//   «ЦОД заполняет, какие документы нужны (можно подхватывать по умолчанию те, что заведены как нет в системе),
//   Регионал валидирует (подтверждает) и оно улетает на осмотр с запросом. Осмотрщик сканирует и потом это улетает
//   в ЦОД, ЦОДнику прилетает уведомление и он в карточке может просмотреть отсканированное и либо отправить на
//   пересканировку, либо принять, либо отклонить».
//
// Путь запроса: ЦОД составляет в карточке ОЦ (по умолчанию — строки «Не подтверждён документом» собственников и
// пользователей, kernel/partyDocs.js; можно добавить свои) → «На проверке» у регионала: «Регионал может и править
// и менять и отклонять список» → «Подтверждён» — становится запросом «Документы на месте» на объект
// (kernel/inspections.js, createCadRequest): дальше — готовый путь ответа сканом на странице осмотрщика (блок
// «Запросить документы»), очередь ЦОД «Сканы с осмотров» и привязка принятого скана к участнику.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: запрос — таблица с автором, временем и журналом решений; права: составляет ЦОД, решает
// регионал своего региона; уведомления — сервером.
import { registerPersisted, scheduleSave } from './persist.js';
import { session } from './session.js';
import { getType } from './registry.js';
import { esc } from './dom.js';
import { assignmentsOf, createCadRequest, cadRequest, allCadRequests, cadResultLabel, changed } from './inspections.js';
import { pendingDocsOf, setDocRequestCard } from './partyDocs.js';

export const DOC_REQ_STATES = [
  { key: 'review', label: 'На проверке у регионала', tone: 'amber' },
  { key: 'approved', label: 'Подтверждён — ушёл на осмотр', tone: 'green' },
  { key: 'rejected', label: 'Отклонён регионалом', tone: 'red' },
];
export const docReqStateOf = (k) => DOC_REQ_STATES.find((x) => x.key === k) || DOC_REQ_STATES[0];

const reqs = [];
let seq = 0;
const nextId = (p) => `${p}-${Date.now().toString(36)}${(++seq).toString(36)}`;
const now = () => new Date().toISOString();
const me = () => session.state.person || '';
const recOf = (typeId, ocId) => { const t = getType(typeId); return t ? t.records.loadRecord(ocId) : null; };

// Строка запроса: вид документа и реквизиты; party — участник и его строка «Не подтверждён документом».
const rowOf = (x) => ({
  id: x.id || nextId('dq'), type: String(x.type || '').trim(), no: x.no || '', date: x.date || '', issuer: x.issuer || '', note: x.note || '',
  ...(x.party ? { party: { kind: x.party.kind, i: x.party.i, uid: x.party.uid, name: x.party.name || '' } } : {}),
});
// Подпись строки — для осмотрщика и Кадастра: «Постановление № 123-т от 19.06.2025».
const dateRu = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || '')); return m ? `${m[3]}.${m[2]}.${m[1]}` : String(v || ''); };
export const docReqRowLabel = (x) => [x.type || 'Документ', x.no ? `№ ${x.no}` : '', x.date ? `от ${dateRu(x.date)}` : ''].filter(Boolean).join(' ');

export const allDocRequests = () => reqs;
export const docRequest = (id) => reqs.find((r) => r.id === id) || null;
export const docRequestsOf = (typeId, ocId) => reqs.filter((r) => r.typeId === typeId && r.ocId === ocId);
export const docRequestsToReview = () => reqs.filter((r) => r.state === 'review');

// Строки по умолчанию для нового запроса: «Не подтверждён документом» участников карточки.
// Строки, уже ждущие в открытом запросе (на проверке или подтверждён, а скан ещё не принят), — не повторяются.
export function defaultDocReqRows(rec, typeId = '') {
  const busy = new Set(reqs.filter((r) => r.ocId === rec.id && (!typeId || r.typeId === typeId) && r.state !== 'rejected')
    .flatMap((r) => (r.state === 'approved' ? docReqRowsState(r).filter((s) => s.label !== 'Принят ЦОД').map((s) => s.row) : r.rows))
    .map((x) => x.party && x.party.uid).filter(Boolean));
  return pendingDocsOf(rec).filter((p) => !busy.has(p.row.id)).map((p) => rowOf({ type: p.row.type, no: p.row.no, date: p.row.date, issuer: p.row.issuer,
    party: { kind: p.kind, i: p.i, uid: p.row.id, name: p.party } }));
}

export function createDocRequest({ typeId, ocId, rows = [], note = '' }) {
  const list = rows.map(rowOf).filter((x) => x.type);
  if (!typeId || !ocId || !list.length) return null;
  const rec = recOf(typeId, ocId);
  const r = {
    id: nextId('dr'), no: reqs.reduce((m, x) => Math.max(m, x.no || 0), 0) + 1, typeId, ocId,
    eni: (rec && rec.eni) || '', inst: (rec && rec.institution) || '', title: (rec && (rec.address || rec.name)) || ocId,
    state: 'review', note, at: now(), by: me(), rows: list, log: [{ at: now(), by: me(), kind: 'create' }],
  };
  reqs.unshift(r);
  changed();
  return r;
}

// Правка регионалом до решения: строки целиком (убрать, добавить, изменить) и комментарий.
export function updateDocRequest(id, { rows, note }) {
  const r = docRequest(id);
  if (!r || r.state !== 'review') return null;
  const before = r.rows.length;
  if (rows) r.rows = rows.map(rowOf).filter((x) => x.type);
  if (note !== undefined) r.note = note;
  r.log.push({ at: now(), by: me(), kind: 'edit', text: before !== r.rows.length ? `строк ${before} → ${r.rows.length}` : 'изменён' });
  changed();
  return r;
}

// Подтвердить: запрос «Документы на месте» на объект — осмотрщику действующего назначения, если оно есть; нет —
// без осмотрщика (строки увидит тот, кто приедет на объект).
export function approveDocRequest(id) {
  const r = docRequest(id);
  if (!r || r.state !== 'review' || !r.rows.length) return null;
  const live = assignmentsOf(r.typeId, r.ocId)[0];
  const cad = createCadRequest({
    person: live ? live.person : '', kind: 'site', note: r.note, from: r.id,
    rows: r.rows.map((x) => ({ typeId: r.typeId, ocId: r.ocId, inst: r.inst, eni: r.eni, doc: docReqRowLabel(x),
      note: [x.issuer, x.note].filter(Boolean).join(' · '), party: x.party, spec: { type: x.type, no: x.no, date: x.date, issuer: x.issuer } })),
  });
  Object.assign(r, { state: 'approved', decidedAt: now(), decidedBy: me(), cadId: cad ? cad.id : '' });
  r.log.push({ at: now(), by: me(), kind: 'approve' });
  changed();
  return r;
}

export function rejectDocRequest(id, reason) {
  const r = docRequest(id);
  const why = String(reason || '').trim();
  if (!r || r.state !== 'review' || !why) return null;
  Object.assign(r, { state: 'rejected', decidedAt: now(), decidedBy: me(), reason: why });
  r.log.push({ at: now(), by: me(), kind: 'reject', text: why });
  changed();
  return r;
}

// Ход подтверждённого запроса по строкам — по строкам запроса «Документы на месте».
export function docReqRowsState(r) {
  const cad = r && r.cadId ? cadRequest(r.cadId) : null;
  return (r ? r.rows : []).map((x, i) => {
    const c = cad ? cad.rows[i] : null;
    const rv = c && c.review;
    const label = !cad ? '' : rv && rv.state === 'accepted' ? 'Принят ЦОД' : rv && rv.state === 'returned' ? 'Возвращён на пересъёмку'
      : rv && rv.state === 'rejected' ? 'Отклонён ЦОД' : c && c.result === 'got' ? 'Снят — ждёт разбора ЦОД' : c && c.result ? cadResultLabel(c.result) : 'Ждёт осмотра';
    return { row: x, cad: c, label, scanKey: c && c.result === 'got' && cad ? `cad|${cad.id}|${c.id}` : '' };
  });
}

registerPersisted('inspections.docRequests', {
  snapshot: () => reqs,
  restore: (saved) => {
    if (!Array.isArray(saved)) return;
    reqs.splice(0, reqs.length, ...saved.filter((x) => x && x.id));
  },
});

// --- демо (пользователь 23.11.2026: «наполни макет демоданными тех самых запросить на месте») ------------------
// Три запроса на нежилые здания: подтверждён и ушёл на осмотр (строки ждут, одной нет на месте), ждёт проверки
// регионала, отклонён. У собственников этих записей — строки «Не подтверждён документом». Демо добавляется, если
// его нет в сохранённом (как демо-запросы в Кадастр). Номера, даты и реквизиты вымышленные.
function seedDemo() {
  const t = getType('civil');
  if (!t) return;
  const rows = t.records.queryRecords({ filter: {}, offset: 0, limit: 60 }).rows.map((x) => x.id);
  const pick = ['oc-cv-1', ...rows.filter((id) => id !== 'oc-cv-1' && assignmentsOf('civil', id).length)].slice(0, 3);
  const plan = [
    { state: 'approved', unc: [{ id: 'u-demo-1', type: 'Постановление', no: '123-т', date: '2025-06-19', issuer: 'мэрия г. Бишкек' }],
      extra: [{ type: 'Техпаспорт', note: 'последней инвентаризации' }, { type: 'Договор аренды', note: 'на часть помещений' }], missing: 2 },
    { state: 'review', unc: [{ id: 'u-demo-2', type: 'Решение', no: '47', date: '2019-03-11', issuer: 'районный акимиат' }], extra: [{ type: 'Генплан' }] },
    { state: 'rejected', unc: [], extra: [{ type: 'Свидетельство о праве собственности' }], reason: 'Свидетельство уже лежит в документах учреждения — запрос не нужен' },
  ];
  pick.forEach((ocId, k) => {
    const id = `dr-demo-${k + 1}`;
    if (reqs.some((r) => r.id === id)) return;
    const rec = t.records.loadRecord(ocId);
    const p = plan[k];
    if (!rec || !p) return;
    // Строки «Не подтверждён документом» у первого собственника — если документами его ещё не правили.
    if (p.unc.length) {
      rec.owners = (rec.owners && rec.owners.length ? rec.owners : [{ name: rec.institution || 'Собственник', share: '100' }])
        .map((x) => (x && typeof x === 'object' ? x : { name: String(x || ''), share: '' }));
      const o = rec.owners[0];
      if (!Array.isArray(o.unconfirmed)) { o.docs = o.docs || []; o.unconfirmed = p.unc.map((u) => ({ ...u })); }
    }
    const at = new Date(Date.now() - (3 - k) * 86400000).toISOString();
    const r = {
      id, no: k + 1, typeId: 'civil', ocId, eni: rec.eni || '', inst: rec.institution || '', title: rec.address || ocId,
      state: 'review', note: k === 1 ? 'без постановления не сверить долю' : '', at, by: (rec.resp && rec.resp.cod) || 'Оператор ЦОД (демо)', demo: true,
      rows: [...p.unc.map((u) => rowOf({ id: `${id}-${u.id}`, type: u.type, no: u.no, date: u.date, issuer: u.issuer, party: { kind: 'owner', i: 0, uid: u.id, name: rec.owners[0].name } })),
        ...p.extra.map((e, j) => rowOf({ id: `${id}-x${j}`, type: e.type, note: e.note || '' }))],
      log: [{ at, by: 'Оператор ЦОД (демо)', kind: 'create' }],
    };
    reqs.push(r);
    if (p.state === 'rejected') Object.assign(r, { state: 'rejected', decidedAt: at, decidedBy: 'Региональный менеджер (демо)', reason: p.reason });
    if (p.state === 'approved') {
      const cadId = `cr-demo-${id}`;
      const live = assignmentsOf('civil', ocId)[0];
      if (!allCadRequests().some((c) => c.id === cadId)) {
        allCadRequests().unshift({
          id: cadId, no: allCadRequests().reduce((m, x) => Math.max(m, x.no || 0), 0) + 1, person: live ? live.person : '', kind: 'site',
          due: '', note: '', branch: '', at, by: 'Региональный менеджер (демо)', from: id, demo: true,
          rows: r.rows.map((x, j) => ({ id: `${cadId}-${j}`, typeId: 'civil', ocId, inst: r.inst, eni: r.eni, doc: docReqRowLabel(x),
            note: [x.issuer, x.note].filter(Boolean).join(' · '), result: j === p.missing ? 'missing' : '',
            ...(j === p.missing ? { answer: 'в учреждении договора нет', answeredAt: at, answeredBy: live ? live.person : '' } : {}),
            ...(x.party ? { party: { ...x.party } } : {}), spec: { type: x.type, no: x.no, date: x.date, issuer: x.issuer } })),
        });
      }
      Object.assign(r, { state: 'approved', decidedAt: at, decidedBy: 'Региональный менеджер (демо)', cadId });
    }
  });
  scheduleSave();
}
try { seedDemo(); } catch (e) { console.warn('Демо запросов документов не собрано', e); }

// --- блок карточки ОЦ: «Запросить документы» ------------------------------------------------------------------

const ui = new Map();   // ocId → { open, rows, note }

// Под собственниками и пользователями: запросы этой карточки и составление нового.
export function docRequestCardHTML(typeId, rec) {
  if (!rec || !rec.id) return '';
  const list = docRequestsOf(typeId, rec.id);
  const u = ui.get(rec.id);
  const pend = defaultDocReqRows(rec, typeId).length;
  const reqHTML = (r) => {
    const st = docReqStateOf(r.state);
    const rows = r.state === 'approved' ? docReqRowsState(r) : r.rows.map((x) => ({ row: x, label: '' }));
    return `<div class="dq-req" data-dq-req="${esc(r.id)}"><div class="dq-req-h"><b>Запрос № ${esc(String(r.no))}</b>
      <span class="dq-st dq-${st.tone}">${esc(st.label)}</span><small>${esc(dateRu(String(r.at).slice(0, 10)))}${r.by ? ' · ' + esc(r.by) : ''}</small></div>
      ${r.reason ? `<p class="dq-why">Причина: ${esc(r.reason)}</p>` : ''}
      <ul class="dq-rows">${rows.map(({ row, label, scanKey }) => `<li><span>${esc(docReqRowLabel(row))}${row.party ? ` <small>· ${esc(row.party.name || '')}</small>` : ''}</span>
        ${label ? `<span class="dq-row-st">${esc(label)}</span>` : ''}
        ${scanKey ? `<a class="dq-link" href="#/scans?key=${encodeURIComponent(scanKey)}">Скан</a>` : ''}</li>`).join('')}</ul></div>`;
  };
  const form = u && u.open ? `<div class="dq-form" data-dq-form>
      <p class="dq-hint">По умолчанию — документы, отмеченные «Документа нет в системе». Запрос уйдёт регионалу на проверку.</p>
      ${u.rows.map((x, i) => `<div class="dq-frow" data-dq-row="${i}">
        <input class="input" data-dq-k="type" value="${esc(x.type)}" placeholder="Вид документа" aria-label="Вид документа" list="pd-types">
        <input class="input" data-dq-k="note" value="${esc(x.note || (x.party ? x.party.name : ''))}" placeholder="Пояснение" aria-label="Пояснение"${x.party ? ' readonly' : ''}>
        <button type="button" class="pd-x" data-dq-del="${i}" aria-label="Убрать строку" title="Убрать">×</button></div>`).join('')}
      <button type="button" class="pd-act" data-dq-add>+ документ</button>
      <textarea class="input dq-note" data-dq-note rows="2" placeholder="Комментарий регионалу" aria-label="Комментарий регионалу">${esc(u.note || '')}</textarea>
      <p class="dq-err" data-dq-err hidden>Добавьте хотя бы один документ</p>
      <div class="dq-acts"><button type="button" class="btn btn-ghost btn-sm" data-dq-cancel>Отмена</button>
        <button type="button" class="btn btn-primary btn-sm" data-dq-send>Отправить регионалу</button></div></div>` : '';
  return `<div class="dq" data-dq="${esc(typeId)}|${esc(rec.id)}"><div class="sec-h dq-h"><span>Запросить документы</span>
      ${u && u.open ? '' : `<button type="button" class="pd-act" data-dq-new>Запросить документы${pend ? ` · ${pend}` : ''}</button>`}</div>
    ${form}${list.map(reqHTML).join('')}</div>`;
}

export function bindDocRequestCard(ctx, typeId, rec) {
  const s = ctx.scope;
  const box = s.$('[data-dq]');
  if (!box || !rec) return;
  const u = () => ui.get(rec.id);
  const read = () => {
    const st = u();
    if (!st) return;
    box.querySelectorAll('[data-dq-row]').forEach((row) => {
      const x = st.rows[+row.dataset.dqRow];
      if (!x) return;
      x.type = row.querySelector('[data-dq-k="type"]').value;
      if (!x.party) x.note = row.querySelector('[data-dq-k="note"]').value;
    });
    const n = box.querySelector('[data-dq-note]');
    if (n) st.note = n.value;
  };
  const on = (sel, fn) => box.querySelectorAll(sel).forEach((b) => { b.onclick = (e) => fn(b, e); });
  on('[data-dq-new]', () => { ui.set(rec.id, { open: true, rows: defaultDocReqRows(rec, typeId).map((x) => ({ ...x })), note: '' }); ctx.render(); });
  on('[data-dq-cancel]', () => { ui.delete(rec.id); ctx.render(); });
  on('[data-dq-add]', () => { read(); u().rows.push(rowOf({ type: '' })); ctx.render(); });
  on('[data-dq-del]', (b) => { read(); u().rows.splice(+b.dataset.dqDel, 1); ctx.render(); });
  on('[data-dq-send]', () => {
    read();
    const r = createDocRequest({ typeId, ocId: rec.id, rows: u().rows, note: u().note });
    const err = box.querySelector('[data-dq-err]');
    if (!r) { if (err) err.hidden = false; return; }
    ui.delete(rec.id);
    if (ctx.toast) ctx.toast(`Запрос № ${r.no} отправлен регионалу`, 'ok');
    ctx.render();
  });
}

setDocRequestCard({ html: docRequestCardHTML, bind: bindDocRequestCard });
