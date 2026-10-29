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
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: «Мне» — записи, где вошедший — оператор ЦОД (resp.cod);
// у регионала пока равно «Все» (scanQueue). Право разбора на сервере — по роли
// и региону, с журналом решений.
import { esc } from '../../kernel/dom.js';
import { session } from '../../kernel/session.js';
import { go, build } from '../../kernel/router.js';
import { getType } from '../../kernel/registry.js';
import { optionsFor } from '../../kernel/dicts.js';
import { toast } from '../../kernel/toast.js';
import {
  scanQueue, scanCounts, acceptScan, returnScan, rejectScan, SCAN_SOURCES, SCAN_STATES, scanStateLabel,
} from '../../kernel/scanQueue.js';
import { oiLabel } from '../inspector/tasks.js';

const SRC_LABEL = { 'осмотр': 'Осмотр', 'опись': 'Опись', 'кадастр': 'Кадастр' };
// Перечень видов документов, если справочник типа ОЦ ещё не заведён.
const DOC_TYPES_FALLBACK = ['Техпаспорт', 'ПУД', 'Гос. акт на землю', 'Акт осмотра', 'Фото', 'Прочее'];
const WHO = [['me', 'Мне'], ['all', 'Все']];
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
  let draft = { key: '', docType: '', oiId: '', title: '', reason: '' };
  let pageNo = 0;          // текущая страница скана в просмотре
  let pageKey = '';
  let err = '';

  // --- состояние из адреса ---------------------------------------------------
  const q = () => (route && route.query) || {};
  const stateKey = () => (SCAN_STATES.some((s) => s.key === q().state) ? q().state : 'wait');
  const srcKey = () => (SCAN_SOURCES.some((s) => s.key === q().src) ? q().src : '');
  const whoKey = () => (q().who === 'me' ? 'me' : 'all');
  const hrefOf = (patch) => {
    const cur = { state: stateKey(), src: srcKey(), who: whoKey(), key: q().key || '', ...patch };
    const parts = [];
    if (cur.state !== 'wait') parts.push('state=' + encodeURIComponent(cur.state));
    if (cur.src) parts.push('src=' + encodeURIComponent(cur.src));
    if (cur.who !== 'all') parts.push('who=' + cur.who);
    if (cur.key) parts.push('key=' + encodeURIComponent(cur.key));
    return '#/scans' + (parts.length ? '?' + parts.join('&') : '');
  };
  // Адрес меняем на месте (replace): выбор строки и отборы — не шаги истории,
  // а «Назад» должен уводить со страницы, а не перебирать выбранные строки.
  const nav = (patch) => go(hrefOf(patch), { replace: true });

  const filter = () => ({
    state: stateKey(), source: srcKey(),
    role: whoKey() === 'me' ? 'cod' : 'all', person: session.state.person,
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
  // Вид — предложенный осмотрщиком, затем совпавший с названием, затем «Прочее».
  const defaultDocType = (it, types) => (it.docType && types.includes(it.docType) ? it.docType
    : types.includes(it.title) ? it.title : (types.includes('Прочее') ? 'Прочее' : types[0] || ''));

  function ensureDraft(it) {
    if (draft.key === it.key) return;
    const types = docTypesFor(it);
    draft = { key: it.key, docType: defaultDocType(it, types), oiId: it.oiId || '', title: it.title, reason: '' };
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
      <td class="sc-date">${esc(fmtAt(it.at))}</td>
      <td><span class="sc-src sc-src-${it.source === 'кадастр' ? 'cad' : 'insp'}">${esc(SRC_LABEL[it.source])}</span></td>
      <td><span class="sc-t">${esc(it.title)}</span><span class="sc-s">${esc(it.by || '—')}</span>${reason}</td>
      <td title="${esc(it.place || '')}"><span class="sc-t">${esc(it.place || '—')}</span><span class="sc-s mono">${esc(it.eni || '')}</span></td>
      <td class="num">${it.pages.length}</td></tr>`;
  }

  function listHTML(items, curKey) {
    return `<div class="sc-list"><div class="icols"><div class="sc-scroll"><table class="itbl sc-tbl">
      <colgroup><col class="c-d"><col class="c-s"><col class="c-t"><col class="c-o"><col class="c-p"></colgroup>
      <thead><tr><th>Дата</th><th>Источник</th><th>Документ</th><th>Объект</th><th class="num" title="Страниц в скане">Стр.</th></tr></thead>
      <tbody>${items.map((it) => rowHTML(it, it.key === curKey)).join('')}</tbody></table></div></div></div>`;
  }

  function viewerHTML(it) {
    if (pageKey !== it.key) { pageKey = it.key; pageNo = 0; }
    const pages = it.pages;
    if (!pages.length) return '<p class="sc-hint">В скане нет страниц.</p>';
    pageNo = Math.max(0, Math.min(pageNo, pages.length - 1));
    const p = pages[pageNo];
    const big = p.type === 'application/pdf'
      ? `<iframe class="sc-page" src="${esc(p.dataUrl || '')}" title="${esc(p.name)}"></iframe>`
      : `<img class="sc-page" data-sc-img src="${esc(p.dataUrl || '')}" alt="${esc(p.name)}">`;
    return `<section class="sc-view" aria-label="Страницы скана">
      <div class="sc-big">${big}<p class="sc-lost" hidden>Файл страницы недоступен — он не сохранился после перезагрузки.</p></div>
      <div class="sc-strip" role="group" aria-label="Страницы">
        <span class="sc-pn">Страница <b>${pageNo + 1}</b> из ${pages.length}</span>
        ${pages.length > 1 ? `<span class="sc-thumbs">${pages.map((pg, i) => `<button type="button" class="sc-th ${i === pageNo ? 'on' : ''}" data-sc-page="${i}" aria-label="Страница ${i + 1}" aria-pressed="${i === pageNo}">
          ${pg.type === 'application/pdf' ? '<span>PDF</span>' : `<img src="${esc(pg.dataUrl || '')}" alt="">`}<i>${i + 1}</i></button>`).join('')}</span>` : ''}
      </div></section>`;
  }

  function infoHTML(it, rec) {
    const oi = it.oiId && rec ? (rec.oi || []).find((o) => o.id === it.oiId) : null;
    const row = (k, v) => (v ? `<div><dt>${k}</dt><dd>${v}</dd></div>` : '');
    const card = `<a href="${esc(build({ typeId: it.typeId, ocId: it.ocId }))}">${esc(it.place || 'Карточка объекта')}</a>`;
    const decided = it.state !== 'wait'
      ? row(scanStateLabel(it.state), `${esc(it.decidedBy || '—')}, ${esc(fmtFull(it.decidedAt))}`) + row('Причина', esc(it.reason)) : '';
    return `<section class="sc-sec" aria-label="Сведения"><dl class="sc-dl">
      ${row('Объект', card)}${row('ЕНИ', it.eni ? `<span class="mono">${esc(it.eni)}</span>` : '')}
      ${row('Объект имущества', oi ? esc(oiLabel(oi)) : '')}
      ${it.inv ? row('Опись', esc(it.inv.invTitle)) + row('Позиция описи', esc(it.inv.item)) : ''}
      ${row('Источник', esc(SRC_LABEL[it.source]))}${row('Запрос', esc(it.request || ''))}
      ${row('Прислал', esc(it.by || '—'))}${row('Получено', esc(fmtFull(it.at)))}
      ${row('Дата сканирования', it.scanDate ? esc(it.scanDate.split('-').reverse().join('.')) : '')}${row('Ответ', esc(it.answer || ''))}
      ${decided}</dl></section>`;
  }

  function formHTML(it, rec) {
    ensureDraft(it);
    const types = docTypesFor(it);
    const ois = rec ? rec.oi || [] : [];
    return `<section class="sc-sec" aria-label="Принять как"><h3>Принять как</h3><div class="sc-form">
      <div class="field"><label for="sc-f-type">Вид документа</label>
        <select class="select" id="sc-f-type" data-sc-f-type>${types.map((t) => `<option ${draft.docType === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
      ${it.inv ? `<div class="field"><label>К чему относится</label><p class="sc-hint">Позиция описи: ${esc(it.inv.item)}</p></div>` : `<div class="field"><label for="sc-f-oi">К чему относится</label>
        <select class="select" id="sc-f-oi" data-sc-f-oi><option value="" ${draft.oiId ? '' : 'selected'}>Объект оценки в целом</option>
          ${ois.map((o) => `<option value="${esc(o.id)}" ${draft.oiId === o.id ? 'selected' : ''}>${esc(oiLabel(o))}</option>`).join('')}</select></div>`}
      <div class="field sc-f-wide"><label for="sc-f-title">Название документа</label>
        <input class="input" id="sc-f-title" data-sc-f-title value="${esc(draft.title)}" autocomplete="off"></div>
    </div></section>`;
  }

  function footHTML(it) {
    const empty = !draft.reason.trim();
    return `<footer class="sc-foot">
      <div class="field"><label for="sc-f-reason">Причина возврата или отклонения</label>
        <input class="input" id="sc-f-reason" data-sc-f-reason value="${esc(draft.reason)}" autocomplete="off" placeholder="Например: страница смазана, не видна печать"></div>
      <p class="sc-err" data-sc-err ${err ? '' : 'hidden'}>${esc(err)}</p>
      <p class="sc-hint" id="scNeed" data-sc-need ${empty ? '' : 'hidden'}>Чтобы вернуть или отклонить, укажите причину.</p>
      <div class="sc-acts">
        <button class="btn btn-ghost" data-sc-return aria-describedby="scNeed" ${empty ? 'disabled title="Укажите причину возврата"' : ''}>Вернуть на пересъёмку</button>
        <button class="btn btn-danger" data-sc-reject aria-describedby="scNeed" ${empty ? 'disabled title="Укажите причину отклонения"' : ''}>Отклонить</button>
        <button class="btn btn-primary sc-ok" data-sc-accept>Принять</button>
      </div></footer>`;
  }

  function paneHTML(it) {
    const rec = recOf(it);
    const wait = it.state === 'wait';
    const docLink = it.state === 'accepted' && it.docId
      ? `<footer class="sc-foot sc-foot-link"><a class="btn btn-ghost" data-sc-open-doc href="${esc(build({ typeId: it.typeId, ocId: it.ocId }))}">Открыть документ у объекта</a></footer>` : '';
    return `<aside class="sc-pane" aria-label="Выбранный скан">
      <header class="sc-head">
        <button class="btn btn-ghost btn-sm sc-back" data-sc-back>‹ К перечню</button>
        <h2>${esc(it.title)}</h2>
        <p class="sc-meta"><span class="sc-src sc-src-${it.source === 'кадастр' ? 'cad' : 'insp'}">${esc(SRC_LABEL[it.source])}</span>
          <span class="sc-st sc-st-${it.state}">${esc(scanStateLabel(it.state))}</span></p>
      </header>
      <div class="sc-body">${viewerHTML(it)}${wait ? formHTML(it, rec) : ''}${infoHTML(it, rec)}</div>
      ${wait ? footHTML(it) : docLink}
    </aside>`;
  }

  // --- отрисовка -------------------------------------------------------------
  function render() {
    const items = itemsNow();
    const urlKey = q().key || '';
    const hasUrl = items.some((x) => x.key === urlKey);
    const curKey = hasUrl ? urlKey : (items[0] ? items[0].key : '');
    const it = items.find((x) => x.key === curKey) || null;
    host.setCrumbs([{ label: 'Сканы с осмотров' }]);
    const keep = ['.sc-scroll', '.sc-body'].map((s) => [s, scope.$(s) ? scope.$(s).scrollTop : 0]);
    const keepKey = scope.$('.sc-pane') ? pageKey : '';
    const empty = !items.length;
    scope.setHTML(`<div class="sc ${hasUrl ? 'sc-detail' : ''} ${empty ? 'sc-bare' : ''}">
      <div class="sc-top">${tabsHTML()}
        <div class="sc-tools">${seg('Источник', 'data-sc-src', SRC, srcKey())}${seg('Показывать', 'data-sc-who', WHO, whoKey())}</div></div>
      <div class="sc-main">${empty
    ? `<p class="sc-empty">${stateKey() === 'wait' ? 'Сканов, ждущих разбора, нет' : `Сканов в состоянии «${esc(scanStateLabel(stateKey()))}» нет`}</p>`
    : listHTML(items, curKey) + (it ? paneHTML(it) : '')}</div></div>`);
    keep.forEach(([s, y]) => { const el = scope.$(s); if (el && (keepKey === pageKey || s === '.sc-scroll')) el.scrollTop = y; });
    const cur = scope.$('tr.cur');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
    bindImg();
  }

  function bindImg() {
    const img = scope.$('[data-sc-img]');
    if (!img) return;
    img.addEventListener('error', () => {
      img.hidden = true;
      const lost = scope.$('.sc-lost');
      if (lost) lost.hidden = false;
    }, { once: true });
  }

  // Следующий по списку после разобранного: на то же место, а если разобранный
  // был последним — на предыдущий (практика очередей проверки, auto-advance).
  function afterAction(prevIdx) {
    const items = itemsNow();
    const next = items[Math.min(prevIdx, items.length - 1)];
    draft = { key: '', docType: '', oiId: '', title: '', reason: '' };
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
        acceptScan(it.key, { docType: draft.docType, oiId: draft.oiId, title: draft.title });
        toast('Принято, документ у объекта', 'ok');
      } else if (kind === 'return') {
        returnScan(it.key, draft.reason);
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
  scope.on('click', '[data-sc-page]', (e, b) => { pageNo = Number(b.dataset.scPage) || 0; render(); });
  scope.on('click', '[data-sc-accept]', () => act('accept'));
  scope.on('click', '[data-sc-return]', (e, b) => { if (!b.disabled) act('return'); });
  scope.on('click', '[data-sc-reject]', (e, b) => { if (!b.disabled) act('reject'); });
  scope.on('change', '[data-sc-f-type]', (e, el) => { draft.docType = el.value; });
  scope.on('change', '[data-sc-f-oi]', (e, el) => { draft.oiId = el.value; });
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
  const off = session.subscribe(() => { if (scope.root.isConnected) render(); });

  render();
  return {
    onRoute(next) { route = next; render(); },
    destroy() { off(); },
  };
}
