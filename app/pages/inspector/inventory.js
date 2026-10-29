// Опись у осмотрщика — по образцу приложения «Осмотр» (этап Б4, запись графа
// osmotr-opisey-i-skany-ustroystvo-etapov-b-v; термин opis-oborudovaniya-i-
// mehanizmov): поиск одним полем «Инв. номер или название», сводка «N из M
// осмотрено · сегодня +K», чипы отбора, сортировка; строка — значок
// состояния, №, инв. номер, приоритет, наименование, «· N шт», место,
// «Фото»; раскрытая позиция — снимки, состояние оборудования, «Осмотрено»,
// «Не найдено», комментарий. «Нет в описи» — предмет есть, в описи нет.
//
// Состояния — те же четыре, что в карточке механизмов (таблица пользователя
// 28.10.2026); «Нерабочее» — только при снимках (В9), у «В ремонте» снимки не
// обязательны («В ремонте оно может и не быть на месте», 29.10.2026).
import { esc } from '../../kernel/dom.js';

export const INV_STATES = ['Рабочее', 'Условно пригодное', 'Нерабочее', 'В ремонте'];
export const PAGE = 60;

// Поиск: инв. номер без разделителей, латиница = кириллица, слова в любом
// порядке; слово от 4 букв прощает одну опечатку.
const LAT = 'abcehkmoptxy';
const CYR = 'авсенкмортху';
const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');
const key = (s) => norm(s).split('').map((c) => { const i = LAT.indexOf(c); return i >= 0 ? CYR[i] : c; }).join('').replace(/[^0-9a-zа-я]/g, '');
function near(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i);
}
export function matches(item, q) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const inv = key(item.inv);
  const hay = norm(`${item.name} ${item.place}`);
  const hw = hay.split(/[^0-9a-zа-я]+/).filter(Boolean);
  return words.every((w) => {
    const k = key(w);
    if (k && inv.includes(k)) return true;
    if (hay.includes(w)) return true;
    return w.length >= 4 && hw.some((h) => h.length >= 4 && (near(h.slice(0, w.length), w) || near(h, w)));
  });
}

export const CHIPS = [
  { k: 'all', label: 'Все' }, { k: 'todo', label: 'Не осмотрено' },
  { k: 'p1', label: 'П1' }, { k: 'p2', label: 'П2' }, { k: 'p3', label: 'П3' },
  { k: 'broken', label: 'Нерабочие' }, { k: 'missing', label: 'Не найдено' },
];
export function chipFilter(k, item, m) {
  if (k === 'todo') return !m || !m.state;
  if (k === 'p1' || k === 'p2' || k === 'p3') return item.priority === Number(k[1]);
  if (k === 'broken') return !!m && m.cond === 'Нерабочее';
  if (k === 'missing') return !!m && m.state === 'missing';
  return true;
}

const money = (n) => (n ? Math.round(n).toLocaleString('ru-RU') : '—');
const icoState = (m) => (!m || !m.state ? '<span class="inv-st inv-st-todo" title="Не осмотрено" aria-label="Не осмотрено"></span>'
  : m.state === 'missing' ? '<span class="inv-st inv-st-miss" title="Не найдено" aria-label="Не найдено">✕</span>'
    : `<span class="inv-st inv-st-ok" title="Осмотрено${(m.photos || []).length ? ', снимков ' + m.photos.length : ''}" aria-label="Осмотрено">✓${(m.photos || []).length ? `<i>${m.photos.length}</i>` : ''}</span>`);

function itemPanelHTML(inv, it, m, { locked, err, docs }) {
  const photos = (m && m.photos) || [];
  return `<div class="inv-item" id="inv-item-${esc(it.id)}">
    <dl class="inv-facts">
      <div><dt>Инв. номер</dt><dd class="mono">${esc(it.inv)}</dd></div>
      <div><dt>Место</dt><dd>${esc(it.place || '—')}</dd></div>
      <div><dt>Кол-во</dt><dd>${esc(it.qty)} шт.</dd></div>
      <div><dt>Первонач., сом</dt><dd class="num">${money(it.costInitial)}</dd></div>
      <div><dt>Список</dt><dd>${esc(it.list)} · П${it.priority}</dd></div>
    </dl>
    ${locked ? '' : `<div class="inv-acts">
      <button type="button" class="ins-btn ins-btn-main" data-inv-seen="${esc(it.id)}">${m && m.state === 'seen' ? 'Осмотрено ✓' : 'Отметить осмотренным'}</button>
      <button type="button" class="ins-btn" data-inv-missing="${esc(it.id)}">${m && m.state === 'missing' ? 'Не найдено ✓' : 'Не найдено'}</button>
      ${m && m.state ? `<button type="button" class="ins-btn" data-inv-unmark="${esc(it.id)}">Снять отметку</button>` : ''}
    </div>`}
    <div class="inv-photos">
      ${photos.map((p, i) => `<a class="inv-ph" href="${esc(p.dataUrl || '#')}" target="_blank" rel="noopener" aria-label="Снимок ${i + 1}"><img src="${esc(p.dataUrl || '')}" alt=""></a>`).join('')}
      ${locked ? '' : `<button type="button" class="ins-btn inv-shoot" data-inv-shoot="${esc(it.id)}">Фото${photos.length ? ` · ${photos.length}` : ''}</button>
      <button type="button" class="ins-btn inv-doc" data-inv-doc="${esc(it.id)}" title="Паспорт, акт, гарантийный талон — снимки или PDF; уходят оператору ЦОД">Документ</button>`}
    </div>
    ${docs && docs.length ? `<p class="ins-hint">Документы позиции: ${docs.map((d) => esc(d.type + ' · ' + d.name)).join('; ')}</p>` : ''}
    <div class="ins-field">
      <label for="inv-cond-${esc(it.id)}">Состояние</label>
      <select class="select ins-select" id="inv-cond-${esc(it.id)}" data-inv-cond="${esc(it.id)}" ${locked ? 'disabled' : ''}>
        <option value="">Не выбрано</option>
        ${INV_STATES.map((s) => `<option ${m && m.cond === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}
      </select>
      ${err ? `<span class="ins-fs-hint warn" role="alert">${esc(err)}</span>` : ''}
    </div>
    <div class="ins-field">
      <label for="inv-cm-${esc(it.id)}">Комментарий</label>
      <textarea class="input ins-input" id="inv-cm-${esc(it.id)}" rows="2" data-inv-comment="${esc(it.id)}" ${locked ? 'disabled' : ''}
        placeholder="Что видно на месте">${esc((m && m.comment) || '')}</textarea>
    </div>
    ${m && m.state ? `<p class="ins-hint">Отметил: ${esc(m.by || '—')} · ${esc(String(m.at || '').slice(0, 16).replace('T', ' '))}</p>` : ''}
  </div>`;
}

// Экран описи. st — { q, chip, sort, open, shown, err, extraOpen }.
export function inventoryHTML({ inv, marks, extras, progress, st, headerHTML, backHref, locked, itemDocs = null }) {
  const rows = inv.items
    .map((it) => ({ it, m: marks.get(it.id) || null }))
    .filter(({ it, m }) => matches(it, st.q) && chipFilter(st.chip, it, m));
  const by = { no: (a, b) => a.it.no - b.it.no, pr: (a, b) => a.it.priority - b.it.priority || a.it.no - b.it.no, cost: (a, b) => b.it.costInitial - a.it.costInitial };
  rows.sort(by[st.sort] || by.no);
  const shown = rows.slice(0, st.shown || PAGE);
  const cnt = (k) => inv.items.filter((it) => chipFilter(k, it, marks.get(it.id) || null)).length;
  const prSeen = (n) => { const x = progress.byPriority[n] || { total: 0, seen: 0 }; return `${x.seen}/${x.total}`; };
  return `<div class="ins">
    ${headerHTML({ title: inv.title, sub: [inv.institution, inv.podved && !String(inv.title).includes(inv.podved) ? inv.podved : ''].filter(Boolean).join(' · '), backHref, backLabel: 'К задаче',
    progress: progress.total ? (progress.seen + progress.missing) / progress.total : 0 })}
    <div class="ins-body inv">
      <section class="ins-blk inv-sum" aria-label="Ход описи">
        <p class="inv-sum-main"><b>${progress.seen + progress.missing}</b> из ${progress.total} осмотрено${progress.today ? ` · <span class="inv-today">сегодня +${progress.today}</span>` : ''}</p>
        <p class="ins-hint">не найдено ${progress.missing} · нерабочих ${progress.broken} · в ремонте ${progress.repair} · нет в описи ${progress.extra}</p>
      </section>
      <div class="inv-tools">
        <label class="inv-q"><span class="sr-only">Инв. номер или название</span>
          <input class="input ins-input" type="search" data-inv-q value="${esc(st.q)}" placeholder="Инв. номер или название" autocomplete="off" enterkeyhint="search"></label>
        <select class="select ins-select inv-sort" data-inv-sort aria-label="Порядок">
          <option value="no" ${st.sort === 'no' ? 'selected' : ''}>По №</option>
          <option value="pr" ${st.sort === 'pr' ? 'selected' : ''}>По приоритету</option>
          <option value="cost" ${st.sort === 'cost' ? 'selected' : ''}>По стоимости</option>
        </select>
      </div>
      <div class="inv-chips" role="group" aria-label="Отбор">
        ${CHIPS.map((c) => `<button type="button" class="inv-chip ${st.chip === c.k ? 'on' : ''}" data-inv-chip="${c.k}" aria-pressed="${st.chip === c.k}">${c.label}
          <b>${/^p\d$/.test(c.k) ? prSeen(c.k[1]) : cnt(c.k)}</b></button>`).join('')}
      </div>
      ${shown.length ? `<ul class="inv-list">${shown.map(({ it, m }) => `<li class="inv-row ${st.open === it.id ? 'open' : ''}">
        <div class="inv-row-h">
          <button type="button" class="inv-row-b" data-inv-open="${esc(it.id)}" aria-expanded="${st.open === it.id}" aria-controls="inv-item-${esc(it.id)}">
            ${icoState(m)}
            <span class="inv-no">${it.no}</span>
            <span class="inv-main"><b>${esc(it.name)}${it.qty > 1 ? ` <span class="inv-qty">· ${it.qty} шт</span>` : ''}</b>
              <small><span class="mono">${esc(it.inv)}</span> · П${it.priority} · ${esc(it.place || '—')}${m && m.cond ? ` · ${esc(m.cond)}` : ''}</small></span>
          </button>
          ${locked || st.open === it.id ? '' : `<button type="button" class="ins-btn inv-snap" data-inv-shoot="${esc(it.id)}" aria-label="Фото «${esc(it.name)}»">Фото</button>`}
        </div>
        ${st.open === it.id ? itemPanelHTML(inv, it, m, { locked, err: st.err, docs: itemDocs ? itemDocs(it.id) : [] }) : ''}
      </li>`).join('')}</ul>
      ${rows.length > shown.length ? `<button type="button" class="ins-btn ins-btn-wide" data-inv-more>Ещё ${Math.min(PAGE, rows.length - shown.length)} из ${rows.length - shown.length}</button>` : ''}`
    : '<p class="ins-empty">По отбору позиций нет.</p>'}
      <section class="ins-blk inv-extra" aria-label="Нет в описи">
        <h2 class="ins-blk-h">Нет в описи${extras.length ? ' · ' + extras.length : ''}</h2>
        ${extras.length ? `<ul class="inv-extra-list">${extras.map((x) => `<li><b>${esc(x.name)}</b>${x.comment ? ` — ${esc(x.comment)}` : ''} <small class="ins-hint">${esc(x.by || '')}</small></li>`).join('')}</ul>` : ''}
        ${locked ? '' : st.extraOpen ? `<form class="inv-extra-f" data-inv-extra-form>
          <div class="ins-field"><label for="inv-x-name">Название</label><input class="input ins-input" id="inv-x-name" data-inv-x-name required placeholder="Что стоит на месте"></div>
          <div class="ins-field"><label for="inv-x-cm">Комментарий</label><input class="input ins-input" id="inv-x-cm" data-inv-x-cm placeholder="Где стоит, номер с таблички"></div>
          <div class="inv-acts"><button class="ins-btn ins-btn-main" type="submit">Добавить</button><button class="ins-btn" type="button" data-inv-extra-cancel>Отмена</button></div>
        </form>` : '<button type="button" class="ins-btn ins-btn-wide" data-inv-extra>+ Предмет, которого нет в описи</button>'}
      </section>
    </div>
  </div>`;
}

// Описи задачи — блок на экране задачи.
export function taskInventoriesHTML(list) {
  if (!list.length) return '';
  return `<section class="ins-blk inv-task" aria-label="Описи">
    <h2 class="ins-blk-h">Описи · ${list.length}</h2>
    <ul class="ins-docs">${list.map(({ inv, progress, href }) => `<li class="ins-doc">
      <a class="inv-task-a" href="${esc(href)}"><b>${esc(inv.title)}</b>
        <small>${progress.seen + progress.missing} из ${progress.total} осмотрено${progress.today ? ` · сегодня +${progress.today}` : ''}</small></a></li>`).join('')}</ul>
  </section>`;
}
