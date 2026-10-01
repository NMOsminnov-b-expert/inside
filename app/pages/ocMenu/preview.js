import { esc } from '../../kernel/dom.js';
import { fmtNum } from '../../kernel/fmt.js';
import { summaryOf, recordOf } from './query.js';

// Состав недвижимого — объекты имущества записи (участки и литеры).
function oiListHTML(oi) {
  const area = (o) => (o.card === 'land'
    ? (o.area ? fmtNum(+String(o.area).replace(',', '.')) + ' м²' : '—')
    : (o.areas && o.areas.tp ? fmtNum(+String(o.areas.tp).replace(',', '.')) + ' м²' : '—'));
  return `<div class="reg-peek-sec">Состав ОИ <span class="tag-mini">${oi.length}</span></div>
    <div class="reg-peek-list">
      ${oi.length ? oi.map((o) => `<div class="reg-peek-oi">
        <span class="tag-mini">${o.letter ? esc(o.letter) : (o.card === 'land' ? 'уч.' : 'ОИ')}</span>
        <span class="ell">${esc(o.name)}</span>
        <span class="muted">${area(o)}</span>
      </div>`).join('') : '<div class="muted">ОИ не добавлены</div>'}
    </div>`;
}

// Состав движимого отдаёт сам модуль (summary.composition): у механизмов —
// позиции с состоянием, у ТС — модули на машине.
function compositionHTML(comp) {
  const MAX = 8;
  const items = comp.items || [];
  return `<div class="reg-peek-sec">${esc(comp.label)} <span class="tag-mini">${items.length}</span></div>
    <div class="reg-peek-list">
      ${items.length ? items.slice(0, MAX).map((x) => `<div class="reg-peek-oi">
        <span class="ell">${esc(x.name)}</span><span class="muted">${esc(x.sub || '')}</span>
      </div>`).join('') : '<div class="muted">пусто</div>'}
      ${items.length > MAX ? `<div class="muted">ещё ${items.length - MAX}</div>` : ''}
    </div>`;
}

// Превью строки: состав и заметки без перехода в карточку.
export function previewHTML(state) {
  if (!state.previewId) return '';

  const s = summaryOf(state.previewType, state.previewId);
  if (!s) return '';

  const rec = recordOf(state.previewType, state.previewId);
  // У ТС и механизмов объектов имущества нет: rec.oi не определён, и превью
  // раньше падало с ошибкой (обход главной 01.10.2026).
  const oi = (rec && rec.oi) || [];
  const notes = rec ? (rec.notes || []).filter((n) => !n.done) : [];

  return `<div class="reg-peek">
    <div class="reg-peek-h">
      <span class="reg-ico">${esc(s.typeIcon)}</span>
      <b>${esc(s.title)}</b>
      <button class="reg-peek-x" data-peek-close title="Закрыть" aria-label="Закрыть превью">×</button>
    </div>

    <div class="reg-peek-sub">${esc(s.kindLabel || s.typeLabel)} · ${esc(s.institution || '—')}</div>

    <div class="reg-peek-badges">
      <span class="reg-status st-x" title="${esc(s.status)}"><i></i><span>${esc(s.status)}</span></span>
    </div>

    <div class="reg-peek-facts">
      ${s.facts.map((f) => `<div class="oc-fact"><label>${esc(f.label)}</label><b ${f.mono ? 'class="mono"' : ''}>${esc(f.value)}</b></div>`).join('')}
    </div>

    ${s.composition ? compositionHTML(s.composition) : oiListHTML(oi)}

    <div class="reg-peek-sec">Невыполненные заметки <span class="tag-mini">${notes.length}</span></div>
    <div class="reg-peek-list">
      ${notes.length ? notes.map((n) => `<div class="reg-peek-note">${esc(n.text)}</div>`).join('') : '<div class="muted">нет</div>'}
    </div>

    <div class="reg-peek-foot">
      <button class="btn btn-primary btn-sm" data-open-peek>Открыть карточку</button>
    </div>
  </div>`;
}
