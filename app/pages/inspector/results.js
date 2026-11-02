// Вкладка «Результаты осмотра» карточки ОЦ — разбор и приёмка осмотра у ЦОД.
// Решения пользователя: 30.10.2026 «Вкладка в карточке + срез»; 02.11.2026
// «Снять запрет для вкладки», «Да, рядом с подсветкой» (сравнение с
// карточкой), «Да, разбор здесь», раскладка «Сверка главная», возврат «По ОИ,
// а не целиком», расхождение — «В карточку» по полю, «Принять осмотр» —
// «Когда все ОИ приняты» (запись графа
// priemka-osmotra-cod-vo-vkladke-rezultaty-osmotra-po-oi-vozvrat-po-oi-v).
// Регистрируется в ядре (kernel/inspectionTab.js): модули карточек к экрану
// осмотрщика не ходят.
//
// Раскладка: сверху сводка (кто осматривал, сколько ОИ принято, расхождения,
// снимки); слева — ОИ строками с состоянием приёмки; справа — выбранный ОИ:
// лента снимков (категории чипами, страницами — у литеры бывает до 3000
// снимков, «по 1 литере минздрава внутренние помещения»), крупный просмотр на
// месте ленты, сверка «в карточке / на осмотре» по разделам формы с «В
// карточку» у поля; внизу закреплён подвал решений: «Принять ОИ», «Вернуть на
// доосмотр» с причиной на месте (без окна), «Принять осмотр» — статус
// «Осмотрен». Кнопки нажимаются всегда и говорят, чего не хватает (практика
// panel-podval-deystviy-vybor-strokoy-dannye-chestno).
//
// Просмотр ничего не создаёт (peekResults, reviewOf); пишут только решения.
import { esc } from '../../kernel/dom.js';
import { ensureStyle } from '../../kernel/css.js';
import { allAssignments, ASSIGN_STATES, coversOi, logEvent, changed, returnOis } from '../../kernel/inspections.js';
import { peekResults, reviewOf, setReview } from '../../kernel/inspectionResults.js';
import { getValue } from '../../kernel/fieldSchema.js';
import { setInspectionTab } from '../../kernel/inspectionTab.js';
import { scanKey, scanStateLabel } from '../../kernel/scanQueue.js';
import { getType } from '../../kernel/registry.js';
import { scheduleSave } from '../../kernel/persist.js';
import { localIso } from '../../kernel/fmt.js';
import { session } from '../../kernel/session.js';
import { STATUS_MAIN } from '../../kernel/status/flow.js';
import { ICON_ROTATE } from '../../kernel/viewer/icons.js';
import { sections, setNetsRec } from './form.js';
import { oiLabel, ownOis } from './tasks.js';

ensureStyle('./app/pages/inspector/results.css');

const OBJ = '__obj';
const PAGE = 16;              // снимков на странице ленты
const DONE_STATUS = 'Осмотрен';
const ddmm = (iso) => (iso ? new Date(iso).toLocaleDateString('ru-RU') : '');
const dt = (iso) => (iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const assignsOf = (typeId, ocId) => allAssignments().filter((a) => a.typeId === typeId && a.ocId === ocId && a.state !== 'removed');
const stateText = (a) => {
  const label = (ASSIGN_STATES.find((s) => s.key === a.state) || {}).label || a.state;
  return a.state === 'done' && a.incomplete ? `${label} · неполный` : label;
};
const statePill = (a) => `<span class="pill ${a.state === 'done' ? (a.incomplete ? 'ir-pill-warn' : 'pill-cat') : 'pill-gray'}">${esc(stateText(a))}</span>`;
const plural = (n, one, few, many) => {
  const m10 = n % 10; const m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};
const num = (n) => Number(n).toLocaleString('ru-RU');

// Значение поля строкой; составные (место, координаты) — не значения поля.
function shown(v) {
  if (v == null || v === '') return '';
  if (Array.isArray(v)) return v.filter((x) => x != null && x !== '' && typeof x !== 'object').join(', ');
  if (typeof v === 'boolean') return v ? 'да' : 'нет';
  if (typeof v === 'object') return '';
  return String(v);
}
const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[\s,.;]+/g, ' ').trim();

// Состояние вкладки по объекту — в памяти страницы.
const views = new Map();
const viewOf = (key) => {
  if (!views.has(key)) views.set(key, { sel: '', only: false, cat: '', page: 0, photo: -1, zoom: 100, rot: 0, returning: false, reason: '', msg: '', tone: '' });
  return views.get(key);
};
const resetPhotos = (v) => Object.assign(v, { cat: '', page: 0, photo: -1, zoom: 100, rot: 0 });

function hasAny(r) {
  return !!(r && (r.photos.length || (r.found || []).length || r.note || (r.scans || []).length
    || (r.voices || []).length || Object.keys(r.assets || {}).some((k) => Object.keys(r.assets[k] || {}).length)));
}
function has(typeId, ocId) {
  return assignsOf(typeId, ocId).length > 0 || hasAny(peekResults(typeId, ocId));
}

// Сверка по ОИ: поля осмотра, где есть значение осмотра; group — раздел формы
// (у механизмов — единица перечня); path — где поле лежит в карточке (есть у
// полей, взятых из карточки как есть, — их можно перенести «В карточку»).
function compareOf(typeId, rec, oi, r) {
  setNetsRec(rec);
  const values = (r && r.assets && r.assets[oi.id]) || {};
  return sections(typeId, oi).flatMap((s) => s.fields.map((f) => {
    const insp = shown(getValue(values, f.key));
    const card = typeof f.doc === 'function' ? shown(f.doc(oi)) : '';
    return { group: s.title || '', label: f.label, insp, card, path: (f.doc && f.doc.path) || '', diff: !!(insp && card && norm(insp) !== norm(card)) };
  })).filter((x) => x.insp);
}

// Где ОИ в приёмке: принят, снова сдан после возврата, на доосмотре, ждёт
// приёмки, осмотр идёт, не назначен.
function stageOf(x) {
  const rv = x.review;
  const doneAt = Math.max(0, ...x.by.filter((a) => a.state === 'done').map((a) => Date.parse(a.doneAt) || 0));
  if (rv && rv.state === 'accepted') return { key: 'accepted', label: 'принят', tone: 'ok' };
  if (rv && rv.state === 'returned') {
    return doneAt > (Date.parse(rv.at) || 0) ? { key: 'wait', label: 'снова сдан — ждёт приёмки', tone: 'wait' } : { key: 'returned', label: 'на доосмотре', tone: 'warn' };
  }
  if (x.done) return { key: 'wait', label: 'ждёт приёмки', tone: 'wait' };
  if (x.by.length) return { key: 'progress', label: 'осмотр идёт', tone: 'gray' };
  return { key: 'none', label: 'осмотр не назначен', tone: 'gray' };
}
const stagePill = (st) => `<span class="pill ir-st ir-st-${st.tone}">${esc(st.label)}</span>`;

// Строки: объект в целом, ОИ записи, выявленное.
function itemsOf(typeId, rec, r, list) {
  const items = [];
  const photosOf = (id) => (r ? r.photos.filter((p) => (p.oiId || '') === id) : []);
  const free = photosOf('');
  if (r && (r.note || free.length || (r.scans || []).length || (r.contacts || []).length || (r.voices || []).length)) {
    const sub = [r.note ? 'заметка' : '', (r.contacts || []).length ? 'контакты' : '', (r.voices || []).length ? 'голосовые' : '', (r.scans || []).length ? 'сканы' : ''].filter(Boolean).join(', ');
    items.push({ id: OBJ, kind: 'obj', label: 'Объект в целом', sub: sub || 'снимки', photos: free, values: 0, diffs: 0 });
  }
  ownOis(rec).forEach((oi) => {
    const cmp = compareOf(typeId, rec, oi, r);
    const by = list.filter((a) => coversOi(a, oi.id));
    const x = { id: oi.id, kind: 'oi', oi, label: oiLabel(oi), by, cmp, photos: photosOf(oi.id), values: cmp.length,
      diffs: cmp.filter((c) => c.diff).length, done: by.some((a) => a.state === 'done'), review: reviewOf(typeId, rec.id, oi.id) };
    x.stage = stageOf(x);
    items.push(x);
  });
  ((r && r.found) || []).forEach((f) => items.push({ id: f.id, kind: 'found', found: f, label: oiLabel(f), photos: photosOf(f.id), values: 0, diffs: 0 }));
  return items;
}
// ОИ, которые принимаются: на них было назначение.
const toAccept = (items) => items.filter((x) => x.kind === 'oi' && x.by.length);

function summaryHTML(rec, list, items, r) {
  const ois = toAccept(items);
  const accepted = ois.filter((x) => x.stage.key === 'accepted').length;
  const diffs = items.reduce((s, x) => s + (x.diffs || 0), 0);
  const photos = r ? r.photos.length : 0;
  const scans = (r && r.scans) || [];
  const waitScans = scans.filter((s) => !(s.review && s.review.state)).length;
  const found = ((r && r.found) || []).length;
  const stat = (n, label, warn = false) => `<span class="ir-stat ${warn && n && n !== '0' ? 'warn' : ''}"><b>${n}</b> ${esc(label)}</span>`;
  const people = [...new Set(list.map((a) => a.person))];
  return `<div class="card t-blue ir-sum">
    <div class="ir-sum-who">${people.length ? `<span class="ir-sum-a">Осматривал${people.length > 1 ? 'и' : ''}: <b>${esc(people.join(', '))}</b></span>`
      : '<span class="ir-muted">Назначений на осмотр нет — внесено без назначения</span>'}
      <span class="ir-sum-a">Статус объекта: <b>${esc(rec.status || '—')}</b></span></div>
    <div class="ir-sum-stats">
      ${stat(`${accepted} из ${ois.length}`, 'ОИ принято')}
      ${stat(diffs, plural(diffs, 'расхождение', 'расхождения', 'расхождений'), true)}
      ${stat(num(photos), plural(photos, 'снимок', 'снимка', 'снимков'))}
      ${scans.length ? stat(`${waitScans} из ${scans.length}`, 'сканов ждут разбора', waitScans > 0) : ''}
      ${found ? stat(found, 'выявлено на осмотре', true) : ''}
    </div>
  </div>`;
}

// Строки слева — выбор, несущий сведения: строкой с числами.
function navHTML(items, sel) {
  return `<nav class="card ir-nav" aria-label="Что осмотрено">
    <div class="card-head"><h3>Что осмотрено</h3><span class="hint">${items.length}</span></div>
    <div class="ir-nav-list">${items.map((x) => {
    const counts = [x.values ? `значений ${x.values}` : '', x.photos.length ? `снимков ${num(x.photos.length)}` : ''].filter(Boolean).join(' · ');
    const sub = x.kind === 'oi' ? stagePill(x.stage) : x.kind === 'found' ? '<span class="pill ir-st ir-st-warn">выявлено на осмотре</span>' : `<span class="ir-muted">${esc(x.sub)}</span>`;
    return `<button type="button" class="ir-item ${x.id === sel ? 'on' : ''}" data-ir-sel="${esc(x.id)}" aria-current="${x.id === sel}">
      <span class="ir-item-t">${esc(x.label)}</span>
      <span class="ir-item-s">${sub}</span>
      <span class="ir-item-n">${esc(counts || (x.kind === 'oi' ? 'значений осмотра нет' : ''))}${x.diffs ? ` · <b class="ir-diff-n">расхождений ${x.diffs}</b>` : ''}</span>
    </button>`;
  }).join('')}</div></nav>`;
}

const byCat = (photos) => {
  const m = new Map();
  photos.forEach((p, i) => { const c = p.cat || 'Прочее'; if (!m.has(c)) m.set(c, []); m.get(c).push([p, i]); });
  return [...m];
};

// Снимки выбранного: категории чипами с числом, лента страницами по PAGE
// (тысячи снимков не рисуются разом), крупный просмотр — на месте ленты.
function photosHTML(item, v) {
  const all = item.photos;
  if (!all.length) return '<p class="ir-muted ir-ph-none">Снимков нет.</p>';
  const cats = byCat(all);
  if (v.cat && !cats.some(([c]) => c === v.cat)) v.cat = '';
  const list = v.cat ? cats.find(([c]) => c === v.cat)[1] : all.map((p, i) => [p, i]);
  const chip = (cat, n, on) => `<button type="button" class="ir-chip ${on ? 'on' : ''}" data-irc="${esc(cat)}" aria-pressed="${on}">${esc(cat || 'Все')} <b>${num(n)}</b></button>`;
  const chips = cats.length > 1 ? `<div class="ir-chips" role="group" aria-label="Категории снимков">${chip('', all.length, !v.cat)}${cats.map(([c, l]) => chip(c, l.length, v.cat === c)).join('')}</div>` : '';
  const pos = list.findIndex(([, i]) => i === v.photo);
  if (pos >= 0) return chips + viewerHTML(item, list, pos, v);
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  v.page = Math.min(Math.max(v.page, 0), pages - 1);
  const from = v.page * PAGE;
  const part = list.slice(from, from + PAGE);
  return `${chips}<div class="ir-strip">
    <ul class="ir-thumbs">${part.map(([p, i]) => `<li><button type="button" class="ir-thumb" data-irv-ph="${i}" aria-label="Открыть снимок: ${esc(p.cat || 'снимок')} ${i + 1}">
      ${p.dataUrl ? `<img src="${esc(p.dataUrl)}" alt="" loading="lazy">` : '<span class="ir-thumb-none">не загружен</span>'}
      <span class="ir-thumb-cap">${esc(p.cat || 'Прочее')}</span></button></li>`).join('')}</ul>
    ${pages > 1 ? `<div class="ir-pager"><button type="button" class="btn btn-ghost btn-sm" data-irp="-1" aria-label="Предыдущие снимки" ${v.page ? '' : 'disabled'}>‹</button>
      <span>${num(from + 1)}–${num(from + part.length)} из ${num(list.length)}</span>
      <button type="button" class="btn btn-ghost btn-sm" data-irp="1" aria-label="Следующие снимки" ${v.page < pages - 1 ? '' : 'disabled'}>›</button></div>` : ''}
  </div>`;
}

// Крупный просмотр — в вёрстке просмотрщика ядра (kernel/viewer.css: .vbar,
// .tool-btn, .vstage), управление своё на data-irv-*: доступ просмотрщика ядра
// один на страницу (kernel/viewer/deps.js), и подмена отняла бы его у вкладки
// «Фото».
function viewerHTML(item, list, pos, v) {
  const [cur] = list[pos];
  const n = list.length;
  const zoomed = v.zoom > 100;
  // Поворот на 90° и 270° меняет местами ширину и высоту: снимок кладётся в
  // рамку размером с видимый прямоугольник (fitSide). Размеры — от сцены (cq).
  const side = v.rot % 180 === 90;
  const z = v.zoom / 100;
  const style = side
    ? `width:calc(${z} * (100cqh - 24px));${zoomed ? '' : 'max-height:calc(100cqw - 24px);'}transform:translate(-50%, -50%) rotate(${v.rot}deg)`
    : `${zoomed ? `width:calc(${z} * (100cqw - 24px));` : ''}transform:rotate(${v.rot}deg)`;
  return `<section class="viewer irv" aria-label="Просмотр снимка">
    <div class="vbar">
      <div class="tool-group">
        <button type="button" class="tool-btn" data-irv-step="-1" title="Предыдущий (←)" aria-label="Предыдущий снимок" ${n < 2 ? 'disabled' : ''}>‹</button>
        <span class="irv-n"><b>${num(pos + 1)}</b> / ${num(n)}</span>
        <button type="button" class="tool-btn" data-irv-step="1" title="Следующий (→)" aria-label="Следующий снимок" ${n < 2 ? 'disabled' : ''}>›</button>
      </div>
      <span class="irv-cap"><b>${esc(cur.cat || 'Снимок')}</b>${cur.by ? ` · ${esc(cur.by)}` : ''}${cur.at ? ` · ${esc(dt(cur.at))}` : ''}</span>
      <div class="tool-group right">
        <button type="button" class="tool-btn" data-irv-zoom="-1" title="Уменьшить" aria-label="Уменьшить" ${zoomed ? '' : 'disabled'}>−</button>
        <span class="zoom-label">${v.zoom}%</span>
        <button type="button" class="tool-btn" data-irv-zoom="1" title="Увеличить" aria-label="Увеличить" ${v.zoom >= 300 ? 'disabled' : ''}>+</button>
        <button type="button" class="tool-btn" data-irv-rot title="Повернуть" aria-label="Повернуть">${ICON_ROTATE}</button>
        <button type="button" class="btn btn-ghost btn-sm" data-irv-close title="К ленте (Esc)">К ленте</button>
      </div>
    </div>
    <div class="vstage irv-stage ${zoomed ? 'zoomed' : ''} ${side ? 'side' : ''}">
      ${cur.dataUrl ? `${side ? '<div class="irv-box">' : ''}<img class="irv-img" src="${esc(cur.dataUrl)}" alt="${esc((cur.cat || 'Снимок') + ' — ' + item.label)}" style="${style}">${side ? '</div>' : ''}`
    : '<div class="photo-fill">Снимок не загружен</div>'}
    </div>
  </section>`;
}

function compareHTML(cmp, v) {
  if (!cmp.length) return '<p class="ir-muted">Значений осмотра нет.</p>';
  const diffs = cmp.filter((x) => x.diff).length;
  const rows = (v.only ? cmp.map((x, i) => [x, i]).filter(([x]) => x.diff) : cmp.map((x, i) => [x, i]));
  const grouped = new Set(cmp.map((x) => x.group)).size > 1;
  const check = (x, i) => {
    const can = x.path && norm(x.insp) !== norm(x.card);
    const btn = can ? ` <button type="button" class="btn btn-sm ir-apply" data-ir-apply="${i}" title="Записать «${esc(x.insp)}» в карточку">В карточку</button>` : '';
    if (x.diff) return `<span class="pill ir-pill-warn">расходится</span>${btn}`;
    if (x.card) return '<span class="ir-ok">совпадает</span>';
    return `<span class="ir-muted">в карточке нет</span>${btn}`;
  };
  return `<div class="ir-cmp-head"><p class="ir-sub">Сверка <b>${cmp.length}</b></p>
      <label class="ir-only"><input type="checkbox" data-ir-only ${v.only ? 'checked' : ''} ${diffs ? '' : 'disabled'}> только расхождения (${diffs})</label></div>
    <div class="ir-tbl-wrap"><table class="tbl ir-cmp">
      <colgroup><col class="ir-c-f"><col><col><col class="ir-c-m"></colgroup>
      <thead><tr><th>Поле</th><th>В карточке</th><th>На осмотре</th><th>Сверка</th></tr></thead>
      <tbody>${rows.map(([x, i], k) => `${grouped && (k === 0 || rows[k - 1][0].group !== x.group) ? `<tr class="ir-grp"><th colspan="4" scope="colgroup">${esc(x.group)}</th></tr>` : ''}<tr class="${x.diff ? 'diff' : ''}">
        <td data-l="Поле">${esc(x.label)}</td><td data-l="В карточке">${x.card ? esc(x.card) : '<span class="ir-muted">—</span>'}</td><td data-l="На осмотре"><b>${esc(x.insp)}</b></td>
        <td data-l="Сверка"><span class="ir-chk">${check(x, i)}</span></td></tr>`).join('') || '<tr><td colspan="4" class="ir-muted">Расхождений нет.</td></tr>'}</tbody>
    </table></div>`;
}

function objectHTML(typeId, ocId, r) {
  const scans = (r && r.scans) || [];
  const state = (s) => (s.review && s.review.state) || 'wait';
  return [
    r && r.note ? `<p class="ir-sub">Заметка осмотрщика</p><p class="ir-note">${esc(r.note)}</p>` : '',
    r && (r.contacts || []).length ? `<p class="ir-sub">Контакты с осмотра</p><ul class="ir-plain">${r.contacts.map((c) => `<li>${esc([c.name, c.role, c.phone].filter(Boolean).join(' · '))}</li>`).join('')}</ul>` : '',
    r && (r.voices || []).length ? `<p class="ir-sub">Голосовые заметки <b>${r.voices.length}</b></p>
      <ul class="ir-plain">${r.voices.map((x) => `<li>${x.dataUrl ? `<audio controls preload="none" src="${esc(x.dataUrl)}"></audio>` : ''} <span class="ir-muted">${esc(x.by || '')} · ${esc(dt(x.at))}</span></li>`).join('')}</ul>` : '',
    scans.length ? `<p class="ir-sub">Сканы документов <b>${scans.length}</b></p>
      <ul class="ir-plain">${scans.map((s) => `<li><a href="#/scans?${state(s) !== 'wait' ? `state=${esc(state(s))}&` : ''}key=${encodeURIComponent(scanKey(typeId, ocId, s.id))}">${esc(s.title || 'Документ с осмотра')}</a>
        <span class="pill pill-gray">${esc(scanStateLabel(state(s)))}</span> <span class="ir-muted">${esc(ddmm(s.at))}</span></li>`).join('')}</ul>` : '',
  ].join('');
}

function detailHTML(typeId, rec, r, item, v, anyDone) {
  if (!item) return '<div class="card ir-det"><div class="card-pad ir-muted">Выберите слева, что смотреть.</div></div>';
  const photos = `<p class="ir-sub">Снимки <b>${num(item.photos.length)}</b></p>${photosHTML(item, v)}`;
  if (item.kind === 'obj') {
    return `<div class="card t-slate ir-det"><div class="card-head"><h3>Объект в целом</h3></div><div class="card-pad">${objectHTML(typeId, rec.id, r)}${photos}</div></div>`;
  }
  if (item.kind === 'found') {
    const f = item.found;
    return `<div class="card t-amber ir-det"><div class="card-head"><h3>${esc(item.label)}</h3><span class="hint">выявлено на осмотре</span></div>
      <div class="card-pad">${anyDone ? `<dl class="ir-kv">
        ${[['Где', f.where], ['Кто выявил', f.foundBy], ['Когда', f.foundAt], ['Источник', f.source && f.source.label], ['Описание', f.note]]
          .filter(([, x]) => x).map(([l, x]) => `<div><dt>${esc(l)}</dt><dd>${esc(x)}</dd></div>`).join('')}</dl>${photos}`
        : '<p class="ir-muted">Выявленное показывается после завершения осмотра.</p>'}</div></div>`;
  }
  const by = item.by.length ? item.by.map((a) => `<span class="ir-sum-a"><b>${esc(a.person)}</b> ${statePill(a)}${a.doneAt ? ` <span class="ir-muted">${esc(ddmm(a.doneAt))}</span>` : ''}</span>`).join('')
    : '<span class="ir-muted">на этот ОИ осмотр не назначен</span>';
  const rv = item.review;
  const note = rv && rv.state === 'returned' ? `<p class="ir-ret">Возвращён на доосмотр ${esc(dt(rv.at))}${rv.by ? ` · ${esc(rv.by)}` : ''}: ${esc(rv.reason || '')}</p>`
    : rv && rv.state === 'accepted' ? `<p class="ir-acc">Принят ${esc(dt(rv.at))}${rv.by ? ` · ${esc(rv.by)}` : ''}</p>` : '';
  return `<div class="card t-teal ir-det" data-oi="${esc(item.id)}"><div class="card-head"><h3>${esc(item.label)}</h3>${stagePill(item.stage)}<span class="ir-det-by">${by}</span></div>
    <div class="card-pad">${note}${photos}${compareHTML(item.cmp, v)}</div></div>`;
}

// Подвал решений: по выбранному ОИ и по осмотру целиком.
function footHTML(rec, items, item, v) {
  const oi = item && item.kind === 'oi' ? item : null;
  const msg = v.msg ? `<p class="ir-msg ${v.tone === 'ok' ? 'ok' : 'warn'}" role="status">${esc(v.msg)}</p>` : '';
  const ret = oi && v.returning ? `<div class="ir-ret-form">
      <label class="ir-ret-l" for="ir-reason">Причина возврата «${esc(oi.label)}»</label>
      <textarea id="ir-reason" class="input" rows="2" maxlength="500" data-ir-reason placeholder="Что доснять или проверить на месте">${esc(v.reason)}</textarea>
      <div class="ir-foot-row"><button type="button" class="btn btn-primary btn-sm" data-ir-return-go>Вернуть осмотрщику</button>
        <button type="button" class="btn btn-ghost btn-sm" data-ir-return-cancel>Отмена</button></div></div>` : '';
  const left = oi && !v.returning ? `<div class="ir-foot-row">
      <button type="button" class="btn btn-sm ${oi.stage.key === 'accepted' ? 'btn-ghost' : 'btn-primary'}" data-ir-accept>${oi.stage.key === 'accepted' ? 'Принят' : 'Принять ОИ'}</button>
      <button type="button" class="btn btn-sm" data-ir-return>Вернуть на доосмотр…</button></div>` : '';
  const ois = toAccept(items);
  const accepted = ois.filter((x) => x.stage.key === 'accepted').length;
  return `<div class="ir-foot" role="region" aria-label="Решения по осмотру">
    ${msg}${ret}
    <div class="ir-foot-bar">${left}
      <div class="ir-foot-row ir-foot-all"><span class="ir-muted">Принято ОИ: <b>${accepted} из ${ois.length}</b></span>
        <button type="button" class="btn btn-sm btn-primary" data-ir-accept-all>Принять осмотр</button></div>
    </div>
  </div>`;
}

function render(typeId, rec) {
  const key = typeId + '|' + rec.id;
  const v = viewOf(key);
  const list = assignsOf(typeId, rec.id);
  const r = peekResults(typeId, rec.id);
  const items = itemsOf(typeId, rec, r, list);
  if (!items.some((x) => x.id === v.sel)) {
    v.sel = (items.find((x) => x.kind === 'oi' && x.stage.key === 'wait') || items.find((x) => x.kind === 'oi' && (x.values || x.photos.length)) || items[0] || {}).id || '';
  }
  const item = items.find((x) => x.id === v.sel);
  const anyDone = list.some((a) => a.state === 'done') || !!(r && r.done);
  return `<div class="ir" data-ir-key="${esc(key)}">
    ${summaryHTML(rec, list, items, r)}
    ${items.length ? `<div class="ir-work">${navHTML(items, v.sel)}<div class="ir-main">${detailHTML(typeId, rec, r, item, v, anyDone)}${footHTML(rec, items, item, v)}</div></div>`
      : `<div class="empty ir-empty">${list.length ? 'Осмотр назначен, на осмотре пока ничего не внесено.' : 'По объекту осмотров не было.'}</div>`}
  </div>`;
}

// --- действия ---------------------------------------------------------------
function ctxOf(el) {
  const [typeId, ocId] = el.dataset.irKey.split('|');
  const t = getType(typeId);
  const rec = t && t.records.loadRecord(ocId);
  if (!rec) return null;
  const v = viewOf(el.dataset.irKey);
  const items = itemsOf(typeId, rec, peekResults(typeId, ocId), assignsOf(typeId, ocId));
  return { typeId, rec, v, items, item: items.find((x) => x.id === v.sel) };
}
function rerender(el) {
  const c = ctxOf(el);
  if (!c) return;
  const y = window.scrollY;
  const focus = document.activeElement && el.contains(document.activeElement) ? focusKey(document.activeElement) : '';
  el.outerHTML = render(c.typeId, c.rec);
  window.scrollTo(0, y);
  // Фокус остаётся на той же кнопке: перерисовка не выбрасывает клавиатуру.
  const back = focus && document.querySelector(`.ir[data-ir-key="${CSS.escape(el.dataset.irKey)}"] ${focus}`);
  if (back) back.focus();
  document.querySelectorAll('.irv-stage.side .irv-img').forEach((img) => { if (img.complete) fitSide(img); });
}
const FOCUS_ATTRS = ['data-ir-sel', 'data-irv-ph', 'data-irv-step', 'data-irv-zoom', 'data-irv-rot', 'data-irc', 'data-irp', 'data-ir-only', 'data-ir-reason', 'data-ir-accept', 'data-ir-return'];
const focusKey = (n) => FOCUS_ATTRS.filter((a) => n.hasAttribute(a))
  .map((a) => `[${a}${n.getAttribute(a) ? `="${CSS.escape(n.getAttribute(a))}"` : ''}]`)[0] || '';

// Рамка повёрнутого снимка — по его видимому прямоугольнику (после загрузки).
function fitSide(img) {
  const rc = img.getBoundingClientRect();
  if (!rc.width) return;
  Object.assign(img.parentElement.style, { width: `${Math.round(rc.width)}px`, height: `${Math.round(rc.height)}px` });
}
document.addEventListener('load', (e) => { if (e.target.matches && e.target.matches('.irv-stage.side .irv-img')) fitSide(e.target); }, true);

// Снимки текущей ленты (с учётом категории) — индексы в общем перечне ОИ.
function listIdx(c) {
  const all = c.item ? c.item.photos : [];
  return all.map((p, i) => [p, i]).filter(([p]) => !c.v.cat || (p.cat || 'Прочее') === c.v.cat).map(([, i]) => i);
}
function step(c, d) {
  const idx = listIdx(c);
  const pos = idx.indexOf(c.v.photo);
  if (pos < 0 || idx.length < 2) return;
  Object.assign(c.v, { photo: idx[(pos + d + idx.length) % idx.length], zoom: 100, rot: 0 });
}
const say = (v, msg, tone = 'warn') => Object.assign(v, { msg, tone });

// Записать значение осмотра в поле карточки (ответ «В карточку» по полю).
// Механизмы-ОЦ: ОИ «mech» — копия rec.mech (tasks.js, selfMech), пишем в саму
// запись. Журнал правок карточки ловит изменение сам (снимок модуля), событие
// осмотра говорит, откуда значение.
function applyToCard(c, row) {
  const oi = c.item.oi;
  const target = oi.ocSelf && oi.card === 'mech' ? c.rec.mech : oi;
  const keys = row.path.split('.');
  const last = keys.pop();
  const box = keys.reduce((o, k) => (o[k] = o[k] && typeof o[k] === 'object' ? o[k] : {}), target);
  box[last] = Array.isArray(box[last]) ? row.insp.split(/,\s*/).filter(Boolean) : row.insp;
  c.rec.updatedAt = localIso();
  scheduleSave();
  logEvent('applied', null, { typeId: c.typeId, ocId: c.rec.id, oiId: oi.id, text: `${row.label}: ${row.card || '—'} → ${row.insp}` });
  changed();
}

function acceptAll(c) {
  const pending = toAccept(c.items).filter((x) => x.stage.key !== 'accepted');
  if (!toAccept(c.items).length) return say(c.v, 'Принимать нечего: на ОИ этого объекта осмотр не назначали.');
  if (pending.length) return say(c.v, `Осмотр принимается, когда приняты все ОИ. Не приняты: ${pending.map((x) => `${x.label} (${x.stage.label})`).join('; ')}.`);
  const at = STATUS_MAIN.indexOf(c.rec.status);
  const to = STATUS_MAIN.indexOf(DONE_STATUS);
  if (at >= to) return say(c.v, `Все ОИ приняты. Статус уже «${c.rec.status}» — дальше по шкале, менять не нужно.`, 'ok');
  c.rec.status = DONE_STATUS;
  c.rec.updatedAt = localIso();
  scheduleSave();
  logEvent('inspection-accepted', null, { typeId: c.typeId, ocId: c.rec.id });
  changed();
  say(c.v, `Осмотр принят. Статус объекта: «${DONE_STATUS}».`, 'ok');
  // Шапка карточки со шкалой статусов — перерисовка всей страницы.
  window.dispatchEvent(new CustomEvent('inside:redraw'));
  return null;
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('.ir[data-ir-key]');
  if (!el) return;
  const c = ctxOf(el);
  if (!c) return;
  const { v } = c;
  const hit = (s) => e.target.closest(s);
  let n;
  if ((n = hit('[data-ir-sel]'))) { resetPhotos(v); Object.assign(v, { sel: n.dataset.irSel, returning: false, reason: '', msg: '' }); }
  else if ((n = hit('[data-irc]'))) Object.assign(v, { cat: n.dataset.irc, page: 0, photo: -1 });
  else if ((n = hit('[data-irp]'))) v.page += +n.dataset.irp;
  else if ((n = hit('[data-irv-ph]'))) Object.assign(v, { photo: +n.dataset.irvPh, zoom: 100, rot: 0 });
  else if ((n = hit('[data-irv-step]'))) step(c, +n.dataset.irvStep);
  else if ((n = hit('[data-irv-zoom]'))) v.zoom = Math.min(300, Math.max(100, v.zoom + 50 * +n.dataset.irvZoom));
  else if (hit('[data-irv-rot]')) v.rot = (v.rot + 90) % 360;
  else if (hit('[data-irv-close]')) Object.assign(v, { photo: -1, zoom: 100, rot: 0 });
  else if ((n = hit('[data-ir-apply]'))) {
    const row = c.item && c.item.cmp[+n.dataset.irApply];
    if (!row) return;
    applyToCard(c, row);
    say(v, `«${row.label}» в карточке: ${row.insp}.`, 'ok');
  } else if (hit('[data-ir-accept]')) {
    const x = c.item;
    if (x.stage.key === 'accepted') say(v, `«${x.label}» уже принят.`, 'ok');
    else if (!x.done) say(v, `«${x.label}»: ${x.by.length ? 'осмотр ещё идёт — принять можно, когда осмотрщик закончит' : 'осмотр не назначен — принимать нечего'}.`);
    else {
      setReview(c.typeId, c.rec.id, x.id, { state: 'accepted', by: session.state.person });
      logEvent('accepted', null, { typeId: c.typeId, ocId: c.rec.id, oiId: x.id, text: x.label });
      changed();
      say(v, `«${x.label}» принят.`, 'ok');
    }
  } else if (hit('[data-ir-return]')) {
    const x = c.item;
    if (!x.done) say(v, `«${x.label}»: ${x.by.length ? 'осмотр ещё идёт — вернуть можно законченный осмотр' : 'осмотр не назначен — возвращать некому'}.`);
    else Object.assign(v, { returning: true, msg: '' });
  } else if (hit('[data-ir-return-cancel]')) Object.assign(v, { returning: false, msg: '' });
  else if (hit('[data-ir-return-go]')) {
    const reason = v.reason.trim();
    if (!reason) {
      say(v, 'Укажите причину возврата — её увидят осмотрщик и регионал.');
      rerender(el);
      const f = document.querySelector('.ir [data-ir-reason]');
      if (f) f.focus();
      return;
    }
    const x = c.item;
    const hitA = returnOis(c.typeId, c.rec.id, [x.id], reason);
    setReview(c.typeId, c.rec.id, x.id, { state: 'returned', reason, by: session.state.person });
    Object.assign(v, { returning: false, reason: '' });
    say(v, `«${x.label}» возвращён на доосмотр: ${[...new Set(hitA.map((a) => a.person))].join(', ') || 'осмотрщику'}.`, 'ok');
  } else if (hit('[data-ir-accept-all]')) acceptAll(c);
  else return;
  rerender(el);
});
document.addEventListener('input', (e) => {
  if (!e.target.matches('[data-ir-reason]')) return;
  const el = e.target.closest('.ir[data-ir-key]');
  if (el) viewOf(el.dataset.irKey).reason = e.target.value;
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('.ir[data-ir-key]');
  if (!el || !e.target.matches('[data-ir-only]')) return;
  viewOf(el.dataset.irKey).only = e.target.checked;
  rerender(el);
});
// ← → листают и Esc закрывает крупный просмотр, пока он открыт и фокус не в поле.
document.addEventListener('keydown', (e) => {
  if (!['ArrowRight', 'ArrowLeft', 'Escape'].includes(e.key)) return;
  if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest('input, select, textarea, [contenteditable]')) return;
  const el = document.querySelector('.ir[data-ir-key]');
  if (!el || !el.querySelector('.irv')) return;
  const c = ctxOf(el);
  if (!c) return;
  if (e.key === 'Escape') Object.assign(c.v, { photo: -1, zoom: 100, rot: 0 });
  else step(c, e.key === 'ArrowRight' ? 1 : -1);
  e.preventDefault();
  rerender(el);
});

setInspectionTab({ has, render });
