// «Сканы с осмотров» — очередь разбора (этап В, пункт В3; запись графа
// osmotr-opisey-i-skany-ustroystvo-etapov-b-v, решение пользователя
// 27.10.2026): документы, снятые осмотрщиками на месте, и ответы кадастра не
// становятся документами записи, пока их не разберёт ЦОД или регионал.
//
// Раскладка — как «К назначению» в панели регионала: перечень и панель
// выбранного рядом, без модальных окон. Данные и действия — kernel/scanQueue.js;
// страница только показывает и вызывает acceptScan / returnScan / rejectScan.
//
// Вкладка, отборы и выбранный элемент живут в адресе (?state=&src=&who=&key=),
// чтобы «Назад» из карточки объекта возвращал на тот же скан.
//
// «Мне» (решение пользователя 06.11.2026 «Сканы его осмотрщиков»): у регионала — сканы
// осмотрщиков, закреплённых за ним; у ЦОД — сканы его записей, и у ЦОД это вид по умолчанию.
// Принятый скан правится (вид, название, к чему относится), ждущий — переносится к другому
// объекту; возврат называет страницы к пересъёмке; история разбора видна в панели.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: право разбора на сервере — по роли и региону, с журналом решений.
import { esc } from '../../kernel/dom.js';
import { session } from '../../kernel/session.js';
import { go, build } from '../../kernel/router.js';
import { getType, sortedTypes } from '../../kernel/registry.js';
import { optionsFor } from '../../kernel/dicts.js';
import { toast } from '../../kernel/toast.js';
import {
  scanQueue, scanCounts, acceptScan, returnScan, rejectScan, editAccepted, moveScan, SCAN_SOURCES, SCAN_STATES, scanStateLabel,
} from '../../kernel/scanQueue.js';
import { oiLabel } from '../inspector/tasks.js';
import { fmtEni } from '../../kernel/fmt.js';
import { pageViewerHTML, bindPageViewer, bindPageViewerKeys } from '../../kernel/viewer/pageViewer.js';
import { persistSizes } from '../../kernel/viewState.js';
import { scheduleSave } from '../../kernel/persist.js';

// Площади страницы (указание пользователя 06.11.2026: «главное — сам документ… выделив большую часть
// площади под него» и «регулирование размеров площадей тоже добавляем»): ширина перечня в % и ширина
// колонки полей разбора в px — перетаскиванием разделителей, стрелками, двойной щелчок — по умолчанию.
// Запоминаются, как ширины на других страницах (kernel/viewState.js).
const SIZE0 = { list: 30, side: 340 };
const LIST_MIN = 18;
const LIST_MAX = 60;
const SIDE_MIN = 260;
const SIDE_MAX = 560;
const sizes = { ...SIZE0 };
persistSizes('scans-sizes', () => ({ ...sizes }), (s) => {
  if (Number.isFinite(s.list)) sizes.list = Math.min(LIST_MAX, Math.max(LIST_MIN, s.list));
  if (Number.isFinite(s.side)) sizes.side = Math.min(SIDE_MAX, Math.max(SIDE_MIN, s.side));
});
const splitHTML = (kind) => (kind === 'list'
  ? `<div class="sc-split" role="separator" aria-orientation="vertical" tabindex="0" data-sc-split="list" aria-label="Ширина перечня"
      aria-valuemin="${LIST_MIN}" aria-valuemax="${LIST_MAX}" aria-valuenow="${Math.round(sizes.list)}" title="Перетащите, чтобы изменить ширину; двойной щелчок — как было"></div>`
  : `<div class="sc-split sc-split-side" role="separator" aria-orientation="vertical" tabindex="0" data-sc-split="side" aria-label="Ширина полей разбора"
      aria-valuemin="${SIDE_MIN}" aria-valuemax="${SIDE_MAX}" aria-valuenow="${Math.round(sizes.side)}" title="Перетащите, чтобы изменить ширину; двойной щелчок — как было"></div>`);

const SRC_LABEL = { 'осмотр': 'Осмотр', 'опись': 'Опись', 'кадастр': 'Кадастр' };
// Перечень видов документов, если справочник типа ОЦ ещё не заведён.
const DOC_TYPES_FALLBACK = ['Техпаспорт', 'ПУД', 'Гос. акт на землю', 'Акт осмотра', 'Фото', 'Прочее'];
const WHO = [['me', 'Мне'], ['all', 'Все']];
// Класс метки источника: у каждого свой цвет (осмотр, опись, кадастр).
const SRC_CLS = { 'осмотр': 'insp', 'опись': 'inv', 'кадастр': 'cad' };
const srcTag = (it, extra = '') => `<span class="sc-src sc-src-${SRC_CLS[it.source] || 'insp'} ${extra}">${esc(SRC_LABEL[it.source])}</span>`;
const eniOf = (it) => (it.eni ? fmtEni(it.eni) || it.eni : '');
const SRC = [['', 'Все'], ...SCAN_SOURCES.map((s) => [s.key, s.label])];

// Дата и время — «ДД.ММ ЧЧ:ММ» по местному времени.
function fmtAt(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const fmtFull = (iso) => {
  const d = new Date(iso);
  return !iso || Number.isNaN(d.getTime()) ? '—' : `${fmtAt(iso).slice(0, 5)}.${d.getFullYear()} ${fmtAt(iso).slice(6)}`;
};

export function mountScans(host) {
  const { scope } = host;
  let route = host.route;
  // Черновик панели выбранного: переживает перерисовку, пока выбран тот же скан.
  let draft = { key: '', docType: '', oiId: '', title: '', reason: '', pages: [] };
  // Перенос к другому объекту: строка поиска, выбранная запись и ОИ.
  let move = { key: '', q: '', pick: null, oiId: '' };
  // Черновики панели — по каждому скану: причина и выбор не теряются при переходе на соседний.
  const drafts = new Map();
  // Открытая страница скана в просмотрщике — по ключу скана.
  const viewFile = new Map();
  let err = '';

  // --- состояние из адреса ---------------------------------------------------
  const q = () => (route && route.query) || {};
  const stateKey = () => (SCAN_STATES.some((s) => s.key === q().state) ? q().state : 'wait');
  const srcKey = () => (SCAN_SOURCES.some((s) => s.key === q().src) ? q().src : '');
  // У ЦОД по умолчанию — «Мне», у остальных — «Все».
  const whoDefault = () => (session.state.role === 'cod' ? 'me' : 'all');
  const whoKey = () => (q().who === 'me' || q().who === 'all' ? q().who : whoDefault());
  const hrefOf = (patch) => {
    const cur = { state: stateKey(), src: srcKey(), who: whoKey(), key: q().key || '', ...patch };
    const parts = [];
    if (cur.state !== 'wait') parts.push('state=' + encodeURIComponent(cur.state));
    if (cur.src) parts.push('src=' + encodeURIComponent(cur.src));
    if (cur.who !== whoDefault()) parts.push('who=' + cur.who);
    if (cur.key) parts.push('key=' + encodeURIComponent(cur.key));
    return '#/scans' + (parts.length ? '?' + parts.join('&') : '');
  };
  // Адрес меняем на месте (replace): выбор строки и отборы — не шаги истории,
  // а «Назад» должен уводить со страницы, а не перебирать выбранные строки.
  const nav = (patch) => go(hrefOf(patch), { replace: true });

  const filter = () => ({
    state: stateKey(), source: srcKey(),
    role: whoKey() === 'me' ? (session.state.role === 'rm' ? 'rm' : 'cod') : 'all', person: session.state.person,
  });
  const itemsNow = () => scanQueue(filter());

  // --- пункты ----------------------------------------------------------------
  const recOf = (it) => {
    const t = getType(it.typeId);
    return t && t.records.loadRecord ? t.records.loadRecord(it.ocId) : null;
  };
  const docTypesFor = (it) => {
    const list = (optionsFor(it.typeId, 'oc', 'docType') || DOC_TYPES_FALLBACK).slice();
    if (it.source === 'кадастр' && it.title && !list.includes(it.title)) list.unshift(it.title);
    return list;
  };
  // Вид — предложенный осмотрщиком, затем совпавший с названием; иначе не выбран — ЦОД выбирает сам
  // (находка аудита 30.10: «Принять» одним щелчком клало вид «Прочее»).
  const defaultDocType = (it, types) => (it.docType && types.includes(it.docType) ? it.docType
    : types.includes(it.title) ? it.title : '');

  function ensureDraft(it) {
    if (draft.key === it.key) return;
    if (draft.key) drafts.set(draft.key, draft);
    if (drafts.has(it.key)) { draft = drafts.get(it.key); err = ''; return; }
    const types = docTypesFor(it);
    draft = it.doc ? { key: it.key, docType: it.doc.type, oiId: it.doc.oiId, title: it.doc.name, reason: '', pages: [] }
      : { key: it.key, docType: defaultDocType(it, types), oiId: it.oiId || '', title: it.title, reason: '', pages: [] };
    move = { key: it.key, q: '', pick: null, oiId: '' };
    err = '';
  }

  // --- разметка --------------------------------------------------------------
  const seg = (label, attr, items, cur) => `<div class="sc-segw"><span class="sc-seglab">${label}</span>
    <div class="sc-seg" role="group" aria-label="${esc(label)}">${items.map(([k, t]) =>
    `<button type="button" ${attr}="${esc(k)}" aria-pressed="${cur === k}">${esc(t)}</button>`).join('')}</div></div>`;

  function tabsHTML() {
    const c = scanCounts({ role: filter().role, person: filter().person, source: srcKey() });
    return `<div class="itabs sc-tabs" role="tablist" aria-label="Состояние">${SCAN_STATES.map((s) =>
      `<button class="itab ${stateKey() === s.key ? 'on' : ''}" role="tab" data-sc-state="${s.key}" aria-selected="${stateKey() === s.key}">${esc(s.label)} <b>${c[s.key]}</b></button>`).join('')}</div>`;
  }

  function rowHTML(it, cur) {
    const reason = it.state === 'returned' || it.state === 'rejected'
      ? `<span class="sc-why">${esc(scanStateLabel(it.state))}: ${esc(it.reason || '—')}</span>` : '';
    return `<tr data-sc-row="${esc(it.key)}" class="${cur ? 'cur' : ''}" aria-selected="${cur}" tabindex="-1">
      <td class="sc-date">${esc(fmtFull(it.at).slice(0, 10))}<span class="sc-s">${esc(fmtFull(it.at).slice(11))}</span></td>
      <td>${srcTag(it)}</td>
      <td>${srcTag(it, 'sc-src-narrow')}<span class="sc-t">${esc(it.title)}</span><span class="sc-s">${esc(it.by || '—')}</span>${reason}
        <span class="sc-s sc-narrow-obj">${esc(it.inv ? it.inv.invTitle : it.place || '—')}${!it.inv && eniOf(it) ? ` · <span class="mono">${esc(eniOf(it))}</span>` : ''} · ${esc(fmtFull(it.at))}</span></td>
      <td title="${esc(it.inv ? it.inv.invTitle : it.place || '')}">${it.inv ? `<span class="sc-t">${esc(it.inv.invTitle)}</span><span class="sc-s">${esc(it.inv.item)}</span>`
    : `<span class="sc-t">${esc(it.place || '—')}</span><span class="sc-s mono">${esc(eniOf(it))}</span>`}</td>
      <td class="num">${it.pages.length}</td></tr>`;
  }

  function listHTML(items, curKey) {
    return `<div class="sc-list"><div class="icols"><div class="sc-scroll"><table class="itbl sc-tbl">
      <colgroup><col class="c-d"><col class="c-s"><col class="c-t"><col class="c-o"><col class="c-p"></colgroup>
      <thead><tr><th>Дата</th><th>Источник</th><th>Документ</th><th>Объект</th><th class="num" title="Страниц в скане">Стр.</th></tr></thead>
      <tbody>${items.map((it) => rowHTML(it, it.key === curKey)).join('')}</tbody></table></div></div></div>`;
  }

  // Страницы скана — просмотрщиком ядра (масштаб, поворот, во весь экран, листание): решать «смазано,
  // не видна печать» по миниатюре нельзя (находка аудита 30.10). Страница скана — файл просмотрщика.
  const kindOf = (t) => ((t || '').startsWith('image/') ? 'image' : t === 'application/pdf' ? 'pdf' : 'other');
  // Скан — один документ: страницы-картинки — листами одного файла, PDF — сам файл.
  const viewDoc = (it) => {
    const pages = it.pages.filter((p) => p && p.dataUrl);
    if (!pages.length) return { id: 'scan:' + it.key, type: it.title, files: [] };
    const first = pages[0];
    const file = { id: it.key + '#f', name: it.title, type: first.type || '', mime: first.type || '', kind: kindOf(first.type), dataUrl: first.dataUrl, size: first.size || 0 };
    if (pages.length > 1) file.scanPages = pages.map((p) => ({ name: p.name, type: p.type || '', dataUrl: p.dataUrl }));
    return { id: 'scan:' + it.key, type: it.title, files: [file] };
  };
  function viewerHTML(it) {
    if (!it.pages.length) return '<p class="sc-hint">В скане нет страниц.</p>';
    const doc = viewDoc(it);
    if (!doc.files.length) return '<p class="sc-hint">Файлы страниц недоступны — они не сохранились после перезагрузки.</p>';
    return `<section class="sc-view" aria-label="Страницы скана">${pageViewerHTML(doc, { activeFileId: viewFile.get(it.key) })}</section>`;
  }

  function infoHTML(it, rec) {
    const oi = it.oiId && rec ? (rec.oi || []).find((o) => o.id === it.oiId) : null;
    const row = (k, v) => (v ? `<div><dt>${k}</dt><dd>${v}</dd></div>` : '');
    const card = `<a href="${esc(build({ typeId: it.typeId, ocId: it.ocId }))}">${esc(it.place || 'Карточка объекта')}</a>`;
    const decided = it.state !== 'wait'
      ? row(scanStateLabel(it.state), `${esc(it.decidedBy || '—')}, ${esc(fmtFull(it.decidedAt))}`) + row('Причина', esc(it.reason)) : '';
    return `<section class="sc-sec" aria-label="Сведения"><dl class="sc-dl">
      ${it.inv ? '' : row('Объект', card) + row('ЕНИ', it.eni ? `<span class="mono">${esc(eniOf(it))}</span>` : '')}
      ${row('Объект имущества', oi ? esc(oiLabel(oi)) : '')}
      ${it.inv ? row('Опись', esc(it.inv.invTitle)) + row((it.inv.itemIds || []).length > 1 ? 'Позиции описи' : 'Позиция описи', esc(it.inv.item)) : ''}
      ${row('Источник', esc(SRC_LABEL[it.source]))}${row('Запрос', esc(it.request || ''))}
      ${row('Прислал', esc(it.by || '—'))}${row('Получено', esc(fmtFull(it.at)))}
      ${row('Дата сканирования', it.scanDate ? esc(it.scanDate.split('-').reverse().join('.')) : '')}${row('Ответ', esc(it.answer || ''))}
      ${decided}</dl></section>${historyHTML(it)}`;
  }

  // История разбора: возвраты (с названными страницами), отклонения, правки, переносы.
  const HIST_KIND = { returned: 'Возвращено', rejected: 'Отклонено', edited: 'Исправлено', moved: 'Перенесено' };
  function historyHTML(it) {
    if (!(it.returns || []).length) return '';
    return `<section class="sc-sec" aria-label="История разбора"><h3>История разбора</h3><ol class="sc-hist">
      ${it.returns.slice().reverse().map((h) => `<li><span class="sc-hist-k">${esc(HIST_KIND[h.kind] || h.kind)}</span>
        <span class="sc-hist-t">${esc(h.reason || '')}${(h.pages || []).length ? ` · стр. ${esc(h.pages.join(', '))}` : ''}</span>
        <span class="sc-s">${esc(h.by || '—')}, ${esc(fmtFull(h.at))}</span></li>`).join('')}</ol></section>`;
  }

  function formHTML(it, rec, head = 'Принять как') {
    ensureDraft(it);
    const types = docTypesFor(it);
    if (draft.docType && !types.includes(draft.docType)) types.unshift(draft.docType);
    const ois = rec ? rec.oi || [] : [];
    return `<section class="sc-sec" aria-label="${esc(head)}"><h3>${esc(head)}</h3><div class="sc-form">
      <div class="field"><label for="sc-f-type">Вид документа</label>
        <select class="select" id="sc-f-type" data-sc-f-type ${draft.docType ? '' : 'aria-invalid="false"'}>${draft.docType ? '' : '<option value="" selected>— выберите вид —</option>'}${types.map((t) => `<option ${draft.docType === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
      ${it.inv ? `<div class="field"><label>К чему относится</label><p class="sc-hint">Позиция описи: ${esc(it.inv.item)}</p></div>` : `<div class="field"><label for="sc-f-oi">К чему относится</label>
        <select class="select" id="sc-f-oi" data-sc-f-oi><option value="" ${draft.oiId ? '' : 'selected'}>Объект оценки в целом</option>
          ${ois.map((o) => `<option value="${esc(o.id)}" ${draft.oiId === o.id ? 'selected' : ''}>${esc(oiLabel(o))}</option>`).join('')}</select></div>`}
      <div class="field sc-f-wide"><label for="sc-f-title">Название документа</label>
        <input class="input" id="sc-f-title" data-sc-f-title value="${esc(draft.title)}" autocomplete="off"></div>
    </div></section>`;
  }

  // Итог выбора над «Принять» — видно, как ляжет документ, даже если поля формы под прокруткой.
  function asText(it) {
    const rec = recOf(it);
    const oi = draft.oiId && rec ? (rec.oi || []).find((o) => o.id === draft.oiId) : null;
    const to = it.inv ? (it.inv.item || 'позиция описи') : oi ? oiLabel(oi) : 'объект оценки в целом';
    return `Принять как: <b>${esc(draft.docType || 'вид не выбран')}</b> · ${esc(to)}`;
  }

  function footHTML(it) {
    const empty = !draft.reason.trim();
    return `<footer class="sc-foot">
      <div class="field"><label for="sc-f-reason">Причина возврата или отклонения</label>
        <input class="input" id="sc-f-reason" data-sc-f-reason value="${esc(draft.reason)}" autocomplete="off" placeholder="Например: страница смазана, не видна печать"></div>
      ${it.pages.length > 1 && it.source !== 'кадастр' ? `<div class="sc-repg" role="group" aria-label="Страницы к пересъёмке">
        <span class="sc-seglab">Переснять страницы</span>
        ${it.pages.map((p, i) => `<button type="button" class="sc-pgchip" data-sc-retake-page="${i + 1}" aria-pressed="${draft.pages.includes(i + 1)}">${i + 1}</button>`).join('')}
        <span class="sc-hint">${draft.pages.length ? '' : 'не отмечены — все'}</span></div>` : ''}
      <p class="sc-hint sc-as" data-sc-as>${asText(it)}</p>
      <p class="sc-err" data-sc-err ${err ? '' : 'hidden'}>${esc(err)}</p>
      <p class="sc-hint" id="scNeed" data-sc-need ${empty ? '' : 'hidden'}>Чтобы вернуть или отклонить, укажите причину.</p>
      <div class="sc-acts">
        <button class="btn btn-ghost" data-sc-return aria-describedby="scNeed" ${empty ? 'disabled title="Укажите причину возврата"' : ''}>Вернуть на пересъёмку</button>
        <button class="btn btn-danger" data-sc-reject aria-describedby="scNeed" ${empty ? 'disabled title="Укажите причину отклонения"' : ''}>Отклонить</button>
        <button class="btn btn-primary sc-ok" data-sc-accept>Принять</button>
      </div></footer>`;
  }

  // Перенос к другому объекту: поиск по ЕНИ или адресу, выбор записи и ОИ.
  function findRecs(text) {
    const s = text.trim().toLowerCase();
    if (s.length < 2) return [];
    const out = [];
    for (const t of sortedTypes()) {
      if (!t.records.queryRecords) continue;
      out.push(...t.records.queryRecords({ filter: { q: s }, offset: 0, limit: 6 }).rows.map((r) => ({ ...r, typeId: t.manifest.id })));
      if (out.length >= 6) break;
    }
    return out.slice(0, 6);
  }
  function moveHitsHTML(it) {
    if (move.q.trim().length < 2) return '<p class="sc-hint">Наберите ЕНИ или часть адреса — от двух знаков.</p>';
    const hits = findRecs(move.q).filter((r) => !(r.typeId === it.typeId && r.id === it.ocId));
    if (!hits.length) return '<p class="sc-hint">Не найдено. Проверьте ЕНИ или наберите улицу без номера дома.</p>';
    return `<ul class="sc-hits" role="listbox" aria-label="Найденные объекты">${hits.map((r) => {
      const k = r.typeId + '|' + r.id;
      return `<li><button type="button" role="option" aria-selected="${!!move.pick && move.pick === k}" data-sc-move-pick="${esc(k)}">
        <span class="sc-t" title="${esc(r.title || r.address || r.id)}">${esc(r.title || r.address || r.id)}</span><span class="sc-s mono">${esc(r.eni || '')}</span></button></li>`;
    }).join('')}</ul>`;
  }
  function moveHTML(it) {
    const [ty, oc] = move.pick ? move.pick.split('|') : ['', ''];
    const prec = move.pick ? (getType(ty) || { records: { loadRecord: () => null } }).records.loadRecord(oc) : null;
    return `<section class="sc-sec" aria-label="Перенести к другому объекту"><h3>Перенести к другому объекту</h3>
      <div class="field"><label for="sc-move-q">ЕНИ или адрес</label>
        <input class="input" id="sc-move-q" data-sc-move-q value="${esc(move.q)}" autocomplete="off" placeholder="Например: 1-01-01 или Чуй"></div>
      <div data-sc-move-hits>${moveHitsHTML(it)}</div>
      ${prec ? `<div class="sc-form"><div class="field"><label for="sc-move-oi">К чему относится</label>
        <select class="select" id="sc-move-oi" data-sc-move-oi><option value="">Объект оценки в целом</option>
          ${(prec.oi || []).map((o) => `<option value="${esc(o.id)}" ${move.oiId === o.id ? 'selected' : ''}>${esc(oiLabel(o))}</option>`).join('')}</select></div>
        <div class="field sc-move-go"><button type="button" class="btn btn-ghost" data-sc-move-go>Перенести</button></div></div>` : ''}
    </section>`;
  }

  function paneHTML(it) {
    const rec = recOf(it);
    const wait = it.state === 'wait';
    const canEdit = it.state === 'accepted' && it.docId && !it.inv;
    // Документ принят к ОИ — ссылка на ОИ, к объекту в целом — на карточку ОЦ.
    const docOi = it.doc && it.doc.oiId;
    const docOiRec = docOi && rec ? (rec.oi || []).find((o) => o.id === docOi) : null;
    const docLink = it.state === 'accepted' && it.docId
      ? `<footer class="sc-foot sc-foot-link"><p class="sc-err" data-sc-err ${err ? '' : 'hidden'}>${esc(err)}</p><div class="sc-acts">
        ${it.inv ? '' : `<a class="btn btn-ghost" data-sc-open-doc href="${esc(build({ typeId: it.typeId, ocId: it.ocId, rest: docOi ? ['oi', docOi] : [] }))}"
          title="${esc(`«${it.doc ? it.doc.name : it.title}» — во вкладке документов`)}">Открыть ${docOiRec ? `«${esc(oiLabel(docOiRec))}»` : 'карточку объекта'}</a>`}
        ${canEdit ? '<button class="btn btn-primary" data-sc-edit>Сохранить правку</button>' : ''}</div></footer>` : '';
    return `<aside class="sc-pane" aria-label="Выбранный скан" data-sc-key="${esc(it.key)}">
      <header class="sc-head">
        <div class="sc-headrow"><button class="btn btn-ghost btn-sm sc-back" data-sc-back>‹ К перечню</button>
          <span class="sc-steps"><button type="button" class="btn btn-ghost btn-sm" data-sc-step="-1" aria-label="Предыдущий скан" title="Предыдущий (↑)">‹</button><button type="button" class="btn btn-ghost btn-sm" data-sc-step="1" aria-label="Следующий скан" title="Следующий (↓)">›</button></span></div>
        <h2>${esc(it.title)}</h2>
        <p class="sc-meta">${srcTag(it)}
          <span class="sc-st sc-st-${it.state}">${esc(scanStateLabel(it.state))}</span></p>
      </header>
      <div class="sc-body" style="--sc-side:${sizes.side}px"><div class="sc-docarea">${viewerHTML(it)}</div>${splitHTML('side')}
        <div class="sc-sidecol"><div class="sc-side">${wait ? formHTML(it, rec) : canEdit ? formHTML(it, rec, 'Исправить принятое') : ''}${wait && it.source === 'осмотр' ? moveHTML(it) : ''}${infoHTML(it, rec)}</div>
        ${wait ? footHTML(it) : docLink}</div></div>
    </aside>`;
  }

  // Пустое «Мне» — сколько их у всех и переход на «Все».
  function emptyMine() {
    if (whoKey() !== 'me') return '';
    const n = scanQueue({ ...filter(), role: 'all' }).length;
    return n ? `<br><span class="sc-hint">${whoDefault() === 'me' ? 'Среди ваших' : 'У вас'} их нет; у всех — ${n}. <button type="button" class="btn btn-ghost btn-sm" data-sc-who="all">Показать все</button></span>` : '';
  }

  // --- отрисовка -------------------------------------------------------------
  function render() {
    const items = itemsNow();
    const urlKey = q().key || '';
    const hasUrl = items.some((x) => x.key === urlKey);
    const curKey = hasUrl ? urlKey : (items[0] ? items[0].key : '');
    const it = items.find((x) => x.key === curKey) || null;
    host.setCrumbs([{ label: 'Сканы с осмотров' }]);
    const keep = ['.sc-scroll', '.sc-body', '.sc-side'].map((s) => [s, scope.$(s) ? scope.$(s).scrollTop : 0]);
    const keepKey = scope.$('.sc-pane') ? (scope.$('.sc-pane').dataset.scKey || '') : '';
    const empty = !items.length;
    scope.setHTML(`<div class="sc ${hasUrl ? 'sc-detail' : ''} ${empty ? 'sc-bare' : ''}" style="--sc-list:${sizes.list}%">
      <div class="sc-top">${tabsHTML()}
        <div class="sc-tools">${seg('Источник', 'data-sc-src', SRC, srcKey())}${seg('Чьи', 'data-sc-who', WHO, whoKey())}</div></div>
      <div class="sc-main">${empty
    ? `<p class="sc-empty">${stateKey() === 'wait' ? 'Сканов, ждущих разбора, нет' : `Сканов в состоянии «${esc(scanStateLabel(stateKey()))}» нет`}${emptyMine()}</p>`
    : listHTML(items, curKey) + (it ? splitHTML('list') + paneHTML(it) : '')}</div></div>`);
    keep.forEach(([s, y]) => { const el = scope.$(s); if (el && (keepKey === curKey || s === '.sc-scroll')) el.scrollTop = y; });
    const cur = scope.$('tr.cur');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
    if (it && scope.$('.sc-view .viewer, .sc-view [data-vmode], .sc-view')) {
      const doc = viewDoc(it);
      if (doc.files.length) bindPageViewer(scope, doc, { within: '.sc-view', onChange: (id) => { if (id) viewFile.set(it.key, id); render(); } });
    }
  }



  // Следующий по списку после разобранного: на то же место, а если разобранный
  // был последним — на предыдущий (практика очередей проверки, auto-advance).
  function afterAction(prevIdx) {
    const items = itemsNow();
    const next = items[Math.min(prevIdx, items.length - 1)];
    draft = { key: '', docType: '', oiId: '', title: '', reason: '', pages: [] };
    nav({ key: next ? next.key : '' });
  }

  function act(kind) {
    const items = itemsNow();
    const urlKey = q().key || '';
    const idx = Math.max(0, items.findIndex((x) => x.key === urlKey));
    const it = items[idx];
    if (!it) return;
    try {
      if (kind === 'accept') {
        if (!draft.docType && !it.inv) throw new Error('Выберите вид документа');
        acceptScan(it.key, { docType: draft.docType, oiId: draft.oiId, title: draft.title });
        toast('Принято, документ у объекта', 'ok');
      } else if (kind === 'edit') {
        editAccepted(it.key, { docType: draft.docType, oiId: draft.oiId, title: draft.title });
        toast('Правка сохранена', 'ok');
        err = '';
        render();
        return;
      } else if (kind === 'move') {
        const [ty, oc] = move.pick.split('|');
        const nk = moveScan(it.key, { typeId: ty, ocId: oc, oiId: move.oiId });
        toast('Скан перенесён к другому объекту', 'ok');
        err = '';
        draft = { key: '', docType: '', oiId: '', title: '', reason: '', pages: [] };
        nav({ key: nk });
        return;
      } else if (kind === 'return') {
        returnScan(it.key, draft.reason, { pages: draft.pages });
        toast('Возвращено осмотрщику', 'ok');
      } else {
        rejectScan(it.key, draft.reason);
        toast('Отклонено', 'ok');
      }
    } catch (e) {
      err = e.message || 'Не удалось выполнить';
      const box = scope.$('[data-sc-err]');
      if (box) { box.textContent = err; box.hidden = false; }
      return;
    }
    err = '';
    afterAction(idx);
  }

  // --- события ---------------------------------------------------------------
  scope.on('click', '[data-sc-state]', (e, b) => nav({ state: b.dataset.scState, key: '' }));
  scope.on('click', '[data-sc-src]', (e, b) => nav({ src: b.dataset.scSrc, key: '' }));
  scope.on('click', '[data-sc-who]', (e, b) => nav({ who: b.dataset.scWho, key: '' }));
  scope.on('click', '[data-sc-row]', (e, tr) => { if (!e.target.closest('a')) nav({ key: tr.dataset.scRow }); });
  scope.on('click', '[data-sc-back]', () => nav({ key: '' }));
  scope.on('click', '[data-sc-step]', (e, b) => {
    const items = itemsNow();
    const at = items.findIndex((x) => x.key === (q().key || ''));
    const next = items[Math.max(0, Math.min(items.length - 1, (at < 0 ? 0 : at) + Number(b.dataset.scStep)))];
    if (next) nav({ key: next.key });
  });
  scope.on('click', '[data-sc-accept]', () => act('accept'));
  scope.on('click', '[data-sc-edit]', () => act('edit'));
  scope.on('click', '[data-sc-move-go]', () => { if (move.pick) act('move'); });
  scope.on('click', '[data-sc-retake-page]', (e, b) => {
    const n = Number(b.dataset.scRetakePage);
    draft.pages = draft.pages.includes(n) ? draft.pages.filter((x) => x !== n) : [...draft.pages, n].sort((x, y) => x - y);
    render();
  });
  // Поиск переноса: подсказки по мере ввода, без перерисовки панели — поле не теряет фокус.
  scope.on('input', '[data-sc-move-q]', (e, el) => {
    move.q = el.value;
    const it = itemsNow().find((x) => x.key === (q().key || '')) || itemsNow()[0];
    const box = scope.$('[data-sc-move-hits]');
    if (box && it) box.innerHTML = moveHitsHTML(it);
  });
  scope.on('click', '[data-sc-move-pick]', (e, b) => { move.pick = b.dataset.scMovePick; move.oiId = ''; render(); });
  scope.on('change', '[data-sc-move-oi]', (e, el) => { move.oiId = el.value; });
  scope.on('click', '[data-sc-return]', (e, b) => { if (!b.disabled) act('return'); });
  scope.on('click', '[data-sc-reject]', (e, b) => { if (!b.disabled) act('reject'); });
  const syncAs = () => { const it = itemsNow().find((x) => x.key === (q().key || '')) || itemsNow()[0]; const p = scope.$('[data-sc-as]'); if (p && it) p.innerHTML = asText(it); };
  scope.on('change', '[data-sc-f-type]', (e, el) => { draft.docType = el.value; syncAs(); });
  scope.on('change', '[data-sc-f-oi]', (e, el) => { draft.oiId = el.value; syncAs(); });
  scope.on('input', '[data-sc-f-title]', (e, el) => { draft.title = el.value; });
  // Причина: кнопки включаются на лету, без перерисовки — иначе поле теряет фокус.
  scope.on('input', '[data-sc-f-reason]', (e, el) => {
    draft.reason = el.value;
    const empty = !draft.reason.trim();
    scope.$('[data-sc-return]').disabled = empty;
    scope.$('[data-sc-reject]').disabled = empty;
    scope.$('[data-sc-return]').title = empty ? 'Укажите причину возврата' : '';
    scope.$('[data-sc-reject]').title = empty ? 'Укажите причину отклонения' : '';
    scope.$('[data-sc-need]').hidden = !empty;
  });
  // ↑↓ — соседняя строка перечня, если фокус не в поле ввода.
  scope.onDocument('keydown', (e) => {
    if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest && e.target.closest('input, select, textarea, [contenteditable], .dd')) return;
    const items = itemsNow();
    if (!items.length) return;
    const urlKey = q().key || '';
    const at = items.findIndex((x) => x.key === urlKey);
    const next = items[Math.max(0, Math.min(items.length - 1, (at < 0 ? 0 : at) + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (next && next.key !== urlKey) { e.preventDefault(); nav({ key: next.key }); }
  });
  bindPageViewerKeys(scope);
  // Разделители площадей: перетаскивание (pointer), стрелки — шаг, Home — как было, двойной щелчок — как было.
  const applySizes = () => {
    const sc = scope.$('.sc');
    if (sc) sc.style.setProperty('--sc-list', sizes.list + '%');
    const body = scope.$('.sc-body');
    if (body) body.style.setProperty('--sc-side', sizes.side + 'px');
    scope.$$('[data-sc-split]').forEach((el) => el.setAttribute('aria-valuenow', String(Math.round(el.dataset.scSplit === 'list' ? sizes.list : sizes.side))));
  };
  const setSize = (kind, v) => {
    if (kind === 'list') sizes.list = Math.min(LIST_MAX, Math.max(LIST_MIN, v));
    else sizes.side = Math.min(SIDE_MAX, Math.max(SIDE_MIN, v));
    applySizes();
  };
  scope.on('pointerdown', '[data-sc-split]', (e, el) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const kind = el.dataset.scSplit;
    const box = (kind === 'list' ? scope.$('.sc-main') : scope.$('.sc-body')).getBoundingClientRect();
    el.classList.add('on');
    el.setPointerCapture(e.pointerId);
    const move = (ev) => setSize(kind, kind === 'list' ? ((ev.clientX - box.left) / box.width) * 100 : box.right - ev.clientX);
    const up = () => {
      el.classList.remove('on');
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      scheduleSave();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  });
  scope.on('keydown', '[data-sc-split]', (e, el) => {
    const kind = el.dataset.scSplit;
    const step = kind === 'list' ? 2 : 20;
    // Разделитель полей — у правого края: стрелка влево расширяет поля, вправо — сужает.
    const dir = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (dir) { e.preventDefault(); setSize(kind, kind === 'list' ? sizes.list + dir * step : sizes.side - dir * step); scheduleSave(); }
    if (e.key === 'Home') { e.preventDefault(); setSize(kind, SIZE0[kind]); scheduleSave(); }
  });
  scope.on('dblclick', '[data-sc-split]', (e, el) => { setSize(el.dataset.scSplit, SIZE0[el.dataset.scSplit]); scheduleSave(); });
  const off = session.subscribe(() => { if (scope.root.isConnected) render(); });

  render();
  return {
    onRoute(next) { route = next; render(); },
    destroy() { off(); },
  };
}
