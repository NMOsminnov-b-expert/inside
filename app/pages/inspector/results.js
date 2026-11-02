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
// Раскладка — как у карточки ОЦ (замечание 02.11.2026 «просмотрщик - сбоку.
// Как в ОЦ… По оформлению таблиц подгляди в таблицах карточек ОЦ… Кнопки
// должны быть явными. Столбцы регулируемыми»): сверху сводка; слева —
// просмотрщик снимков выбранного во всю высоту с разделителем (разметка
// .split / .viewer / .vsplit / .grow ядра), лента миниатюр окнами — у литеры
// бывает до 3000 снимков; справа — «Что осмотрено» таблицей и выбранное: сверка
// «Поле | В карточке | На осмотре | Сверка | Действие» с «В карточку»; таблицы —
// в рамке, как в карточке, столбцы тянутся перегородками; внизу закреплён
// подвал решений: «Принять ОИ», «Вернуть на доосмотр» с причиной на месте (без
// окна), «Принять осмотр» — статус «Осмотрен». Кнопки нажимаются всегда и
// говорят, чего не хватает (практика panel-podval-deystviy-vybor-strokoy-dannye-chestno).
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
import { colGroupHTML, colLabelHTML, resizeGripHTML, colVar } from '../../kernel/columns.js';
import { completeRichDemo } from '../../kernel/inspectionsDemo.js';
import { sections, setNetsRec } from './form.js';
import { oiLabel, ownOis } from './tasks.js';

ensureStyle('./app/pages/inspector/results.css');

const OBJ = '__obj';
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
  if (!views.has(key)) views.set(key, { sel: '', only: false, returning: false, reason: '', msg: '', tone: '', colW: {} });
  return views.get(key);
};

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
    return { group: s.title || '', label: f.label, insp, card, multi: !!f.multi, path: (f.doc && f.doc.path) || '', diff: !!(insp && card && norm(insp) !== norm(card)) };
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
  const voicesOf = (id) => (r ? (r.voices || []).filter((x) => (x.oiId || '') === id) : []);
  const free = photosOf('');
  const freeVoices = voicesOf('');
  if (r && (r.note || free.length || (r.scans || []).length || (r.contacts || []).length || freeVoices.length)) {
    const sub = [r.note ? 'заметка' : '', (r.contacts || []).length ? 'контакты' : '', (r.scans || []).length ? 'сканы' : ''].filter(Boolean).join(', ');
    items.push({ id: OBJ, kind: 'obj', label: 'Объект в целом', sub: sub || 'снимки', photos: free, voices: freeVoices, values: 0, diffs: 0 });
  }
  ownOis(rec).forEach((oi) => {
    const cmp = compareOf(typeId, rec, oi, r);
    const by = list.filter((a) => coversOi(a, oi.id));
    const x = { id: oi.id, kind: 'oi', oi, label: oiLabel(oi), by, cmp, photos: photosOf(oi.id), voices: voicesOf(oi.id), values: cmp.length,
      diffs: cmp.filter((c) => c.diff).length, done: by.some((a) => a.state === 'done'), review: reviewOf(typeId, rec.id, oi.id) };
    x.stage = stageOf(x);
    items.push(x);
  });
  ((r && r.found) || []).forEach((f) => items.push({ id: f.id, kind: 'found', found: f, label: oiLabel(f), photos: photosOf(f.id), voices: voicesOf(f.id), values: 0, diffs: 0 }));
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

// --- таблицы: оформление и перегородки столбцов — как в таблицах карточки ОЦ ---
// Рамка-обёртка .ir-frame (как .cs-scroll карточки), общая .tbl ядра,
// перегородки — kernel/columns.js (colGroupHTML, resizeGripHTML); ширины держит
// состояние вкладки (v.colW[таблица]), во время перетаскивания — переменные
// --cw-* на рамке.
const NAV_COLS = [
  { key: 'n-obj', label: 'Объект', width: 220 },
  { key: 'n-st', label: 'Приёмка', width: 150 },
  { key: 'n-val', label: 'Знач.', width: 62, num: true, title: 'Значений осмотра' },
  { key: 'n-ph', label: 'Снимков', width: 76, num: true },
  { key: 'n-vo', label: 'Голос.', width: 62, num: true, title: 'Голосовые заметки' },
  { key: 'n-diff', label: 'Расх.', width: 62, num: true, title: 'Расхождений с карточкой' },
];
const CMP_COLS = [
  { key: 'c-f', label: 'Поле', width: 230 },
  { key: 'c-card', label: 'В карточке', width: 200 },
  { key: 'c-insp', label: 'На осмотре', width: 200 },
  { key: 'c-chk', label: 'Сверка', width: 120 },
  { key: 'c-act', label: 'Действие', width: 120 },
];
const headHTML = (cols) => `<thead><tr>${cols.map((c, i) => `<th data-col="${c.key}" class="${c.num ? 'num' : ''}"${c.title ? ` title="${esc(c.title)}"` : ''}>${colLabelHTML(c)}${resizeGripHTML(c, i === cols.length - 1)}</th>`).join('')}</tr></thead>`;

// «Что осмотрено» — таблица, строка выбирает (кнопка в первой ячейке — для
// клавиатуры, щелчок по строке — для мыши).
function navHTML(items, sel, v) {
  return `<section class="card t-blue ir-nav" aria-label="Что осмотрено">
    <div class="card-head"><h3>Что осмотрено</h3><span class="hint">${items.length}</span></div>
    <div class="card-pad"><div class="ir-frame" data-ir-tbl="nav"><table class="tbl ir-tbl ir-nav-tbl">${colGroupHTML(NAV_COLS, v.colW.nav)}${headHTML(NAV_COLS)}
      <tbody>${items.map((x) => {
    const st = x.kind === 'oi' ? stagePill(x.stage) : x.kind === 'found' ? '<span class="pill ir-st ir-st-warn">выявлено</span>' : `<span class="ir-muted">${esc(x.sub)}</span>`;
    const n = (k) => (k ? num(k) : '<span class="ir-muted">—</span>');
    return `<tr class="${x.id === sel ? 'on' : ''}" data-ir-row="${esc(x.id)}">
        <td class="ir-f"><button type="button" class="ir-rowbtn" data-ir-sel="${esc(x.id)}" aria-current="${x.id === sel}">${esc(x.label)}</button></td>
        <td>${st}</td><td class="num">${n(x.values)}</td><td class="num">${n(x.photos.length)}</td><td class="num">${n(x.voices.length)}</td>
        <td class="num">${x.diffs ? `<b class="ir-diff-n">${x.diffs}</b>` : n(0)}</td></tr>`;
  }).join('')}</tbody></table></div></div></section>`;
}

// Снимки выбранного — для просмотрщика карточки (kernel/inspectionTab.js,
// inspectionViewerCtx): держатель того же вида, что у ОИ, — photos
// {категория: число} и photoFiles {категория: [снимок]}; пометка
// inspectionPhotos — читать его ядру самому и не давать переносить к литере.
function holder(typeId, rec) {
  const v = viewOf(typeId + '|' + rec.id);
  const r = peekResults(typeId, rec.id);
  // Модуль рисует просмотрщик раньше вкладки — демо дописывается и здесь.
  if (completeRichDemo(r, rec)) scheduleSave();
  const items = itemsOf(typeId, rec, r, assignsOf(typeId, rec.id));
  const item = items.find((x) => x.id === v.sel) || items.find((x) => x.kind === 'oi' && x.stage.key === 'wait') || items[0];
  const h = { id: `insp:${typeId}|${rec.id}|${item ? item.id : ''}`, name: item ? `Снимки осмотра · ${item.label}` : 'Снимки осмотра',
    letter: '', inspectionPhotos: true, photos: {}, photoFiles: {}, docs: [] };
  (item ? item.photos : []).forEach((p) => {
    const c = p.cat || 'Прочее';
    h.photos[c] = (h.photos[c] || 0) + 1;
    (h.photoFiles[c] = h.photoFiles[c] || []).push({ id: p.id, name: p.name || c, dataUrl: p.dataUrl || '', at: p.at, by: p.by });
  });
  return h;
}

function compareHTML(cmp, v) {
  if (!cmp.length) return '<p class="ir-muted">Значений осмотра нет.</p>';
  const diffs = cmp.filter((x) => x.diff).length;
  const rows = (v.only ? cmp.map((x, i) => [x, i]).filter(([x]) => x.diff) : cmp.map((x, i) => [x, i]));
  const grouped = new Set(cmp.map((x) => x.group)).size > 1;
  const chk = (x) => (x.diff ? '<span class="pill ir-pill-warn">расходится</span>' : x.card ? '<span class="ir-ok">совпадает</span>' : '<span class="ir-muted">в карточке нет</span>');
  const act = (x, i) => (x.path && norm(x.insp) !== norm(x.card)
    ? `<button type="button" class="btn btn-ghost btn-sm ir-apply" data-ir-apply="${i}" title="Записать «${esc(x.insp)}» в карточку">В карточку</button>` : '');
  return `<div class="ir-cmp-head"><p class="ir-sub">Сверка <b>${cmp.length}</b>${diffs ? ` · <span class="ir-diff-n">расхождений ${diffs}</span>` : ''}</p>
      <label class="ir-only"><input type="checkbox" data-ir-only ${v.only ? 'checked' : ''} ${diffs ? '' : 'disabled'}> только расхождения</label></div>
    <div class="ir-frame" data-ir-tbl="cmp"><table class="tbl ir-tbl ir-cmp">${colGroupHTML(CMP_COLS, v.colW.cmp)}${headHTML(CMP_COLS)}
      <tbody>${rows.map(([x, i], k) => `${grouped && (k === 0 || rows[k - 1][0].group !== x.group) ? `<tr class="ir-grp"><th colspan="5" scope="colgroup">${esc(x.group)}</th></tr>` : ''}<tr class="${x.diff ? 'diff' : ''}">
        <td class="ir-f" data-l="Поле">${esc(x.label)}</td><td data-l="В карточке">${x.card ? esc(x.card) : '<span class="ir-muted">—</span>'}</td><td data-l="На осмотре"><b>${esc(x.insp)}</b></td>
        <td data-l="Сверка">${chk(x)}</td><td data-l="Действие">${act(x, i)}</td></tr>`).join('') || '<tr><td colspan="5" class="ir-muted">Расхождений нет.</td></tr>'}</tbody>
    </table></div>`;
}

// Голосовые заметки осмотрщика (решение 16.10.2026 «Голосовые заметки тоже»;
// 02.11.2026 «Нужно уметь их слушать»): плеер браузера на месте, кто и когда
// записал, длительность. Файл недоступен (запись не пережила перезагрузку в
// макете) — так и сказано, а не пустой плеер.
const durText = (sec) => (sec > 0 ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}` : '');
function voicesHTML(list) {
  if (!list || !list.length) return '';
  return `<p class="ir-sub">Голосовые заметки <b>${list.length}</b></p>
    <ul class="ir-voices">${list.map((x, i) => `<li class="ir-voice">
      <span class="ir-voice-n">${i + 1}</span>
      ${x.dataUrl ? `<audio controls preload="metadata" src="${esc(x.dataUrl)}" aria-label="Голосовая заметка ${i + 1}"></audio>` : '<span class="ir-muted">файл записи недоступен</span>'}
      <span class="ir-voice-m">${esc([x.by, dt(x.at), durText(x.dur)].filter(Boolean).join(' · '))}</span></li>`).join('')}</ul>`;
}

function objectHTML(typeId, ocId, r) {
  const scans = (r && r.scans) || [];
  const state = (s) => (s.review && s.review.state) || 'wait';
  return [
    r && r.note ? `<p class="ir-sub">Заметка осмотрщика</p><p class="ir-note">${esc(r.note)}</p>` : '',
    r && (r.contacts || []).length ? `<p class="ir-sub">Контакты с осмотра</p><ul class="ir-plain">${r.contacts.map((c) => `<li>${esc([c.name, c.role, c.phone].filter(Boolean).join(' · '))}</li>`).join('')}</ul>` : '',
    voicesHTML(((r && r.voices) || []).filter((x) => !x.oiId)),
    scans.length ? `<p class="ir-sub">Сканы документов <b>${scans.length}</b></p>
      <ul class="ir-plain">${scans.map((s) => `<li><a class="btn btn-ghost btn-sm" href="#/scans?${state(s) !== 'wait' ? `state=${esc(state(s))}&` : ''}key=${encodeURIComponent(scanKey(typeId, ocId, s.id))}">${esc(s.title || 'Документ с осмотра')} →</a>
        <span class="pill pill-gray">${esc(scanStateLabel(state(s)))}</span> <span class="ir-muted">${esc(ddmm(s.at))}</span></li>`).join('')}</ul>` : '',
  ].join('') || '<p class="ir-muted">Кроме снимков, по объекту в целом ничего не внесено.</p>';
}

function detailHTML(typeId, rec, r, item, v, anyDone) {
  if (!item) return '<div class="card ir-det"><div class="card-pad ir-muted">Выберите в таблице выше, что смотреть.</div></div>';
  if (item.kind === 'obj') {
    return `<div class="card t-slate ir-det"><div class="card-head"><h3>Объект в целом</h3></div><div class="card-pad">${objectHTML(typeId, rec.id, r)}</div></div>`;
  }
  if (item.kind === 'found') {
    const f = item.found;
    return `<div class="card t-amber ir-det"><div class="card-head"><h3>${esc(item.label)}</h3><span class="hint">выявлено на осмотре</span></div>
      <div class="card-pad">${anyDone ? `<dl class="ir-kv">
        ${[['Где', f.where], ['Кто выявил', f.foundBy], ['Когда', f.foundAt], ['Источник', f.source && f.source.label], ['Описание', f.note]]
          .filter(([, x]) => x).map(([l, x]) => `<div><dt>${esc(l)}</dt><dd>${esc(x)}</dd></div>`).join('')}</dl>${voicesHTML(item.voices)}`
        : '<p class="ir-muted">Выявленное показывается после завершения осмотра.</p>'}</div></div>`;
  }
  const by = item.by.length ? item.by.map((a) => `<span class="ir-sum-a"><b>${esc(a.person)}</b> ${statePill(a)}${a.doneAt ? ` <span class="ir-muted">${esc(ddmm(a.doneAt))}</span>` : ''}</span>`).join('')
    : '<span class="ir-muted">на этот ОИ осмотр не назначен</span>';
  const rv = item.review;
  const note = rv && rv.state === 'returned' ? `<p class="ir-ret">Возвращён на доосмотр ${esc(dt(rv.at))}${rv.by ? ` · ${esc(rv.by)}` : ''}: ${esc(rv.reason || '')}</p>`
    : rv && rv.state === 'accepted' ? `<p class="ir-acc">Принят ${esc(dt(rv.at))}${rv.by ? ` · ${esc(rv.by)}` : ''}</p>` : '';
  return `<div class="card t-teal ir-det" data-oi="${esc(item.id)}"><div class="card-head"><h3>${esc(item.label)}</h3>${stagePill(item.stage)}<span class="ir-det-by">${by}</span></div>
    <div class="card-pad">${note}${voicesHTML(item.voices)}${compareHTML(item.cmp, v)}</div></div>`;
}

// Подвал решений: по выбранному ОИ и по осмотру целиком. Кнопки — явные:
// главное залито, остальное в рамке (btn-primary / btn-ghost ядра).
function footHTML(rec, items, item, v) {
  const oi = item && item.kind === 'oi' ? item : null;
  const msg = v.msg ? `<p class="ir-msg ${v.tone === 'ok' ? 'ok' : 'warn'}" role="status">${esc(v.msg)}</p>` : '';
  const ret = oi && v.returning ? `<div class="ir-ret-form">
      <label class="ir-ret-l" for="ir-reason">Причина возврата «${esc(oi.label)}»</label>
      <textarea id="ir-reason" class="input" rows="2" maxlength="500" data-ir-reason placeholder="Что доснять или проверить на месте">${esc(v.reason)}</textarea>
      <div class="ir-foot-row"><button type="button" class="btn btn-primary" data-ir-return-go>Вернуть осмотрщику</button>
        <button type="button" class="btn btn-ghost" data-ir-return-cancel>Отмена</button></div></div>` : '';
  const accepted = oi && oi.stage.key === 'accepted';
  const left = oi && !v.returning ? `<div class="ir-foot-row">
      <button type="button" class="btn ${accepted ? 'btn-ghost' : 'btn-primary'}" data-ir-accept>${accepted ? '✓ Принят' : 'Принять ОИ'}</button>
      <button type="button" class="btn btn-ghost ir-btn-warn" data-ir-return>Вернуть на доосмотр…</button></div>` : '';
  const ois = toAccept(items);
  const done = ois.filter((x) => x.stage.key === 'accepted').length;
  return `<div class="ir-foot" role="region" aria-label="Решения по осмотру">
    ${msg}${ret}
    <div class="ir-foot-bar">${left}
      <div class="ir-foot-row ir-foot-all"><span class="ir-muted">Принято ОИ: <b>${done} из ${ois.length}</b></span>
        <button type="button" class="btn btn-primary" data-ir-accept-all>Принять осмотр</button></div>
    </div>
  </div>`;
}

function render(typeId, rec) {
  const key = typeId + '|' + rec.id;
  const v = viewOf(key);
  const list = assignsOf(typeId, rec.id);
  const r = peekResults(typeId, rec.id);
  // Демо объекта среза: значения и снимки по ОИ — когда карточка собрана.
  if (completeRichDemo(r, rec)) scheduleSave();
  const items = itemsOf(typeId, rec, r, list);
  if (!items.some((x) => x.id === v.sel)) {
    v.sel = (items.find((x) => x.kind === 'oi' && x.stage.key === 'wait') || items.find((x) => x.kind === 'oi' && (x.values || x.photos.length)) || items[0] || {}).id || '';
  }
  const item = items.find((x) => x.id === v.sel);
  const anyDone = list.some((a) => a.state === 'done') || !!(r && r.done);
  return `<div class="ir" data-ir-key="${esc(key)}">
    ${summaryHTML(rec, list, items, r)}
    ${items.length ? `<div class="ir-grow">${navHTML(items, v.sel, v)}${detailHTML(typeId, rec, r, item, v, anyDone)}${footHTML(rec, items, item, v)}</div>`
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
// Перерисовка — всей карточки (kernel/boot.js, inside:redraw): просмотрщик
// слева рисует модуль, и снимки выбранного должны смениться и там. Фокус
// возвращается на ту же кнопку.
function rerender(el) {
  const focus = document.activeElement && el.contains(document.activeElement) ? focusKey(document.activeElement) : '';
  window.dispatchEvent(new CustomEvent('inside:redraw'));
  if (!focus) return;
  requestAnimationFrame(() => setTimeout(() => {
    const back = document.querySelector(`.ir ${focus}`);
    if (back) back.focus();
  }, 0));
}
const FOCUS_ATTRS = ['data-ir-sel', 'data-ir-only', 'data-ir-reason', 'data-ir-accept', 'data-ir-return', 'data-ir-apply'];
const focusKey = (n) => FOCUS_ATTRS.filter((a) => n.hasAttribute(a))
  .map((a) => `[${a}${n.getAttribute(a) ? `="${CSS.escape(n.getAttribute(a))}"` : ''}]`)[0] || '';

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
  box[last] = Array.isArray(box[last]) || row.multi ? row.insp.split(/,\s*/).filter(Boolean) : row.insp;
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
  if ((n = hit('[data-ir-sel]') || (!hit('button, a, input, select, textarea') && hit('[data-ir-row]')))) {
    Object.assign(v, { sel: n.dataset.irSel || n.dataset.irRow, returning: false, reason: '', msg: '' });
  } else if ((n = hit('[data-ir-apply]'))) {
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
  if (!el) return;
  const v = viewOf(el.dataset.irKey);
  if (e.target.matches('[data-ir-only]')) v.only = e.target.checked;
  else return;
  rerender(el);
});
// Перегородки столбцов таблиц — как bindColumnResize ядра: меняются два
// соседних столбца. Вкладка перерисовывается вместе с карточкой, поэтому
// обработчик — на документе, а не на элементах.
document.addEventListener('pointerdown', (e) => {
  const grip = e.target.closest('.ir [data-col-grip]');
  if (!grip) return;
  // Карточка вешает свои обработчики на все перегородки страницы и гасит
  // событие (kernel/columns.js, bindColumnResize) — перехват при погружении.
  e.stopPropagation();
  const el = e.target.closest('.ir[data-ir-key]');
  const v = viewOf(el.dataset.irKey);
  e.preventDefault();
  const target = grip;
  target.setPointerCapture(e.pointerId);
  let move;
  let up;
  {
    const th = grip.closest('[data-col]');
    const next = th && th.nextElementSibling;
    const box = th && th.closest('[data-ir-tbl]');
    if (!next || !box) return;
    const wL = Math.round(th.getBoundingClientRect().width);
    const wR = Math.round(next.getBoundingClientRect().width);
    const x0 = e.clientX;
    let d = 0;
    box.classList.add('col-resizing');
    grip.classList.add('active');
    move = (ev) => {
      d = Math.max(60 - wL, Math.min(wR - 60, Math.round(ev.clientX - x0)));
      box.style.setProperty(colVar(th.dataset.col), (wL + d) + 'px');
      box.style.setProperty(colVar(next.dataset.col), (wR - d) + 'px');
    };
    up = () => {
      box.classList.remove('col-resizing');
      grip.classList.remove('active');
      if (!d) return;
      const w = {};
      th.parentElement.querySelectorAll('[data-col]').forEach((cell) => {
        w[cell.dataset.col] = cell === th ? wL + d : cell === next ? wR - d : Math.round(cell.getBoundingClientRect().width);
      });
      v.colW[box.dataset.irTbl] = w;
    };
  }
  const stop = () => {
    target.releasePointerCapture(e.pointerId);
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', stop);
    up();
  };
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', stop);
}, true);

setInspectionTab({ has, render, holder });
