// Вкладка «Результаты осмотра» карточки ОЦ — что внесено на осмотре, только
// чтение (ответы пользователя 30.10.2026 «Вкладка в карточке + срез» и
// 02.11.2026 «Снять запрет для вкладки»). Регистрируется в ядре
// (kernel/inspectionTab.js): модули карточек к экрану осмотрщика не ходят.
//
// Что показывается (решение 15.10.2026, запись графа
// vyyavlennye-na-osmotre-zdaniya-neutverzhdennaya-litera-razbor-v-kartoc):
//   * осмотры объекта — кто, какие ОИ, в каком состоянии, когда закончен;
//   * по каждому ОИ — значения, внесённые на осмотре, и снимки по категориям;
//     сравнения с данными карточки нет («Надо сначала согласовать все поля»);
//   * по объекту — заметка, голосовые заметки, контакты, сканы со ссылкой на
//     разбор («Сканы с осмотров»);
//   * выявленное на осмотре — только после завершения осмотра («По
//     завершению осмотра»).
// Ничего не создаёт: результаты читаются без пустой записи (peekResults).
import { esc } from '../../kernel/dom.js';
import { ensureStyle } from '../../kernel/css.js';
import { allAssignments, ASSIGN_STATES } from '../../kernel/inspections.js';
import { peekResults } from '../../kernel/inspectionResults.js';
import { getValue } from '../../kernel/fieldSchema.js';
import { setInspectionTab } from '../../kernel/inspectionTab.js';
import { scanKey, scanStateLabel } from '../../kernel/scanQueue.js';
import { allFields } from './form.js';
import { oiLabel, ownOis } from './tasks.js';

ensureStyle('./app/pages/inspector/results.css');

const ddmm = (iso) => (iso ? new Date(iso).toLocaleDateString('ru-RU') : '');
const assignsOf = (typeId, ocId) => allAssignments().filter((a) => a.typeId === typeId && a.ocId === ocId && a.state !== 'removed');
const stateText = (a) => {
  const label = (ASSIGN_STATES.find((s) => s.key === a.state) || {}).label || a.state;
  return a.state === 'done' && a.incomplete ? `${label} · неполный` : label;
};

// Значение поля строкой; составные (место, координаты) — не значения поля.
function shown(v) {
  if (v == null || v === '') return '';
  if (Array.isArray(v)) return v.filter((x) => x != null && x !== '' && typeof x !== 'object').join(', ');
  if (typeof v === 'boolean') return v ? 'да' : 'нет';
  if (typeof v === 'object') return '';
  return String(v);
}

function hasAny(r) {
  return !!(r && (r.photos.length || (r.found || []).length || r.note || (r.scans || []).length
    || (r.voices || []).length || Object.keys(r.assets || {}).some((k) => Object.keys(r.assets[k] || {}).length)));
}

function has(typeId, ocId) {
  return assignsOf(typeId, ocId).length > 0 || hasAny(peekResults(typeId, ocId));
}

function assignsHTML(list, rec) {
  if (!list.length) return '';
  const ois = new Map(ownOis(rec).map((o) => [o.id, o]));
  const scope = (a) => (a.oiIds && a.oiIds.length
    ? a.oiIds.map((id) => oiLabel(ois.get(id) || { name: id })).join('; ') : 'весь объект');
  return `<div class="card t-blue ir-blk"><div class="card-head"><h3>Осмотры</h3><span class="hint">кто, что и в каком состоянии</span></div>
    <div class="ir-tbl-wrap"><table class="tbl ir-tbl">
      <colgroup><col class="ir-c-who"><col><col class="ir-c-st"><col class="ir-c-d"><col class="ir-c-d"></colgroup>
      <thead><tr><th>Осмотрщик</th><th>Объекты имущества</th><th>Состояние</th><th class="num">План</th><th class="num">Закончен</th></tr></thead>
      <tbody>${list.map((a) => `<tr>
        <td data-l="Осмотрщик">${esc(a.person)}</td><td class="ir-wrap" data-l="Объекты имущества">${esc(scope(a))}</td>
        <td data-l="Состояние"><span class="pill ${a.state === 'done' ? (a.incomplete ? 'ir-pill-warn' : 'pill-cat') : 'pill-gray'}">${esc(stateText(a))}</span></td>
        <td class="num" data-l="План">${esc(ddmm(a.plannedAt) || '—')}</td><td class="num" data-l="Закончен">${esc(ddmm(a.doneAt) || '—')}</td></tr>`).join('')}</tbody>
    </table></div></div>`;
}

function photosHTML(photos) {
  if (!photos.length) return '';
  const byCat = new Map();
  photos.forEach((p) => { const c = p.cat || 'Прочее'; if (!byCat.has(c)) byCat.set(c, []); byCat.get(c).push(p); });
  return `<div class="ir-ph-groups">${[...byCat].map(([cat, list]) => `<div class="ir-ph-group">
      <p class="ir-sub">${esc(cat)} <b>${list.length}</b></p>
      <ul class="ir-ph">${list.map((p) => `<li>${p.dataUrl
        ? `<img src="${esc(p.dataUrl)}" alt="${esc(cat)}" loading="lazy">`
        : '<span class="ir-ph-none">снимок не загружен</span>'}<span class="ir-ph-at">${esc(ddmm(p.at))}</span></li>`).join('')}</ul>
    </div>`).join('')}</div>`;
}

function oiHTML(typeId, oi, r) {
  const values = (r && r.assets && r.assets[oi.id]) || {};
  const fields = allFields(typeId, oi).map((f) => ({ label: f.label, v: shown(getValue(values, f.key)) })).filter((x) => x.v);
  const photos = r ? r.photos.filter((p) => p.oiId === oi.id) : [];
  if (!fields.length && !photos.length) return '';
  return `<div class="card t-teal ir-blk" data-oi="${esc(oi.id)}"><div class="card-head"><h3>${esc(oiLabel(oi))}</h3>
      <span class="hint">внесено на осмотре: ${fields.length} ${fields.length === 1 ? 'значение' : fields.length < 5 && fields.length ? 'значения' : 'значений'}${photos.length ? ` · снимков ${photos.length}` : ''}</span></div>
    <div class="card-pad">
      ${fields.length ? `<dl class="ir-kv">${fields.map((x) => `<div><dt>${esc(x.label)}</dt><dd>${esc(x.v)}</dd></div>`).join('')}</dl>` : ''}
      ${photosHTML(photos)}
    </div></div>`;
}

function objectHTML(typeId, ocId, r) {
  if (!r) return '';
  const free = r.photos.filter((p) => !p.oiId);
  const scans = r.scans || [];
  const voices = r.voices || [];
  const contacts = r.contacts || [];
  if (!r.note && !free.length && !scans.length && !voices.length && !contacts.length) return '';
  const state = (s) => (s.review && s.review.state) || 'wait';
  return `<div class="card t-slate ir-blk"><div class="card-head"><h3>По объекту в целом</h3><span class="hint">заметка, сканы, снимки без привязки</span></div>
    <div class="card-pad">
      ${r.note ? `<p class="ir-sub">Заметка осмотрщика</p><p class="ir-note">${esc(r.note)}</p>` : ''}
      ${voices.length ? `<p class="ir-sub">Голосовые заметки <b>${voices.length}</b></p>
        <ul class="ir-voice">${voices.map((v) => `<li>${v.dataUrl ? `<audio controls preload="none" src="${esc(v.dataUrl)}"></audio>` : ''}<span>${esc(v.by || '')} · ${esc(ddmm(v.at))}</span></li>`).join('')}</ul>` : ''}
      ${contacts.length ? `<p class="ir-sub">Контакты с осмотра</p><ul class="ir-list">${contacts.map((c) => `<li>${esc([c.name, c.role, c.phone].filter(Boolean).join(' · '))}</li>`).join('')}</ul>` : ''}
      ${scans.length ? `<p class="ir-sub">Сканы документов <b>${scans.length}</b></p>
        <ul class="ir-list">${scans.map((s) => `<li><a href="#/scans?${state(s) !== 'wait' ? `state=${esc(state(s))}&` : ''}key=${encodeURIComponent(scanKey(typeId, ocId, s.id))}">${esc(s.title || 'Документ с осмотра')}</a>
          <span class="pill pill-gray">${esc(scanStateLabel(state(s)))}</span> <span class="ir-muted">${esc(ddmm(s.at))}</span></li>`).join('')}</ul>` : ''}
      ${free.length ? `<p class="ir-sub">Снимки без привязки к ОИ</p>${photosHTML(free)}` : ''}
    </div></div>`;
}

function foundHTML(r, list) {
  const found = (r && r.found) || [];
  if (!found.length) return '';
  // Выявленное — после завершения осмотра (ответ 15.10.2026).
  if (!list.some((a) => a.state === 'done') && !r.done) {
    return `<div class="card t-amber ir-blk"><div class="card-head"><h3>Выявлено на осмотре</h3></div>
      <div class="card-pad"><p class="ir-muted">Выявлено ${found.length} — показывается после завершения осмотра.</p></div></div>`;
  }
  return `<div class="card t-amber ir-blk"><div class="card-head"><h3>Выявлено на осмотре</h3><span class="hint">${found.length}</span></div>
    <div class="card-pad"><ul class="ir-found">${found.map((f) => {
      const ph = r.photos.filter((p) => p.oiId === f.id).length;
      return `<li><b>${esc(oiLabel(f))}</b>
        <span class="ir-muted">${esc([f.where, f.foundBy, f.foundAt].filter(Boolean).join(' · '))}${ph ? ` · снимков ${ph}` : ''}</span>
        ${f.note ? `<span>${esc(f.note)}</span>` : ''}</li>`;
    }).join('')}</ul></div></div>`;
}

function render(typeId, rec) {
  const list = assignsOf(typeId, rec.id);
  const r = peekResults(typeId, rec.id);
  const ois = ownOis(rec).map((oi) => oiHTML(typeId, oi, r)).join('');
  const body = assignsHTML(list, rec) + ois + objectHTML(typeId, rec.id, r) + foundHTML(r, list);
  const nothing = !ois && !objectHTML(typeId, rec.id, r) && !foundHTML(r, list);
  return `<div class="ir">${body}${nothing
    ? `<div class="empty ir-empty">${list.length ? 'Осмотр назначен, на осмотре пока ничего не внесено.' : 'По объекту осмотров не было.'}</div>` : ''}</div>`;
}

setInspectionTab({ has, render });
