import { esc } from '../../kernel/dom.js';
import { fmtNum } from '../../kernel/fmt.js';
import { summaryOf, recordOf } from './query.js';

// Превью строки: состав ОИ и заметки без перехода в карточку.
export function previewHTML(state) {
  if (!state.previewId) return '';

  const s = summaryOf(state.previewType, state.previewId);
  if (!s) return '';

  const rec = recordOf(state.previewType, state.previewId);
  const oi = rec ? rec.oi : [];
  const notes = rec ? (rec.notes || []).filter((n) => !n.done) : [];

  return `<div class="reg-peek">
    <div class="reg-peek-h">
      <span class="reg-ico">${esc(s.typeIcon)}</span>
      <b>${esc(s.title)}</b>
      <button class="reg-peek-x" data-peek-close title="Закрыть">×</button>
    </div>

    <div class="reg-peek-sub">${esc(s.typeLabel)} · ${esc(s.institution || '—')}</div>

    <div class="reg-peek-badges">
      <span class="pill pill-status"><span class="dot"></span>${esc(s.status)}</span>
    </div>

    <div class="reg-peek-facts">
      ${s.facts.map((f) => `<div class="oc-fact"><label>${esc(f.label)}</label><b ${f.mono ? 'class="mono"' : ''}>${esc(f.value)}</b></div>`).join('')}
    </div>

    <div class="reg-peek-sec">Состав ОИ <span class="tag-mini">${oi.length}</span></div>
    <div class="reg-peek-list">
      ${oi.length ? oi.map((o) => `<div class="reg-peek-oi">
        <span class="tag-mini">${o.letter ? esc(o.letter) : (o.card === 'land' ? 'уч.' : 'ОИ')}</span>
        <span class="ell">${esc(o.name)}</span>
        <span class="muted">${o.card === 'land' ? (o.area ? fmtNum(+String(o.area).replace(',', '.')) + ' м²' : '—') : (o.areas && o.areas.tp ? fmtNum(+String(o.areas.tp).replace(',', '.')) + ' м²' : '—')}</span>
      </div>`).join('') : '<div class="muted">ОИ не добавлены</div>'}
    </div>

    <div class="reg-peek-sec">Невыполненные заметки ОЦ <span class="tag-mini">${notes.length}</span></div>
    <div class="reg-peek-list">
      ${notes.length ? notes.map((n) => `<div class="reg-peek-note">${esc(n.text)}</div>`).join('') : '<div class="muted">нет</div>'}
    </div>

    <div class="reg-peek-foot">
      <button class="btn btn-primary btn-sm" data-open-peek>Открыть карточку</button>
      <span class="muted" style="font-size:10.5px">Space — превью, Enter — карточка</span>
    </div>
  </div>`;
}
