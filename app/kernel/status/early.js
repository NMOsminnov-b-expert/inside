import { esc } from '../dom.js';
import { dateRu } from '../fmt.js';
import { openAnchorPop, closeAnchorPop } from '../anchorPop.js';
import {
  EARLY_STATES, earlyOf, canSendEarly, canManageEarly, earlyAllowedType, earlyAssigns, sendEarly, updateEarly, cancelEarly,
} from '../earlyInspection.js';

// Досрочный осмотр на шкале статусов карточки ОЦ (данные и правила — kernel/earlyInspection.js).
//
// Отметка — боковым узлом под шагом «Направлен на осмотр», как ветки шкалы: это не шаг статуса, а пометка рядом с
// ним (статус не меняется). Пунктир — «можно направить досрочно», фиолетовый — «Досрочно направлен на осмотр»,
// бирюзовый — «Осмотр проведён досрочно». В свёрнутой шкале — значком рядом со статусом. Нажатие — окно у отметки:
// направить (весь объект или выбранные ОИ, комментарий), сведения, изменить, отозвать.

export const EARLY_STEP = 'Направлен на осмотр';

const when = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(d) ? `${dateRu(iso.slice(0, 10))} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';
};
const oiName = (o) => (o.letter ? `Литера ${o.letter}${o.name ? ` · ${o.name}` : ''}` : o.name || 'Объект имущества');

// Что показать на шкале: null — ничего (тип без досрочного осмотра или нет ни флага, ни права направить).
function markOf(rec, typeId) {
  if (!earlyAllowedType(typeId)) return null;
  const e = earlyOf(rec);
  if (e) return { cls: e.state, label: EARLY_STATES[e.state].label, short: EARLY_STATES[e.state].short };
  return canSendEarly(rec, typeId) ? { cls: 'can', label: 'Направить досрочно на осмотр', short: 'Досрочно…' } : null;
}

export function earlyStepHTML(rec, typeId) {
  const m = markOf(rec, typeId);
  if (!m) return '';
  return `<span class="st-fork st-early-fork" aria-hidden="true"></span>
    <button type="button" class="st-early st-early-${m.cls}" data-early aria-haspopup="dialog" title="${esc(m.label)}">
      <span class="st-dot" aria-hidden="true"></span><span class="st-lbl">${esc(m.cls === 'can' ? 'Досрочно…' : m.label)}</span></button>`;
}

export function earlyMiniHTML(rec, typeId) {
  const m = markOf(rec, typeId);
  if (!m || m.cls === 'can') return '';
  return `<button type="button" class="st-early-chip st-early-${m.cls}" data-early aria-haspopup="dialog" title="${esc(m.label)}">${esc(m.short)}</button>`;
}

// --- окно ---------------------------------------------------------------------------------------------------------------

function formHTML(rec, draft, err, edit) {
  const ois = rec.oi || [];
  const many = ois.length > 1;
  return `<div class="apop-h">${edit ? 'Досрочное направление' : 'Направить досрочно на осмотр'}</div>
    <div class="apop-b">
      ${many ? `<fieldset class="ea-scope"><legend>Что осмотреть</legend>
        <label class="ea-opt"><input type="radio" name="ea-scope" value="all" ${draft.all ? 'checked' : ''} data-ea-scope> Весь объект</label>
        <label class="ea-opt"><input type="radio" name="ea-scope" value="some" ${draft.all ? '' : 'checked'} data-ea-scope> Выбранные ОИ</label>
        ${draft.all ? '' : `<ul class="ea-ois">${ois.map((o) => `<li><label class="ea-opt"><input type="checkbox" data-ea-oi="${esc(o.id)}" ${draft.ids.has(o.id) ? 'checked' : ''}> ${esc(oiName(o))}</label></li>`).join('')}</ul>`}
      </fieldset>` : ''}
      <label class="ea-lbl" for="ea-note">Комментарий для регионала</label>
      <textarea class="input ea-note" id="ea-note" data-ea-note rows="3" maxlength="500">${esc(draft.note)}</textarea>
      ${err ? `<p class="ea-err" role="alert">${esc(err)}</p>` : ''}
    </div>
    <div class="apop-f"><button type="button" class="btn btn-ghost btn-sm" data-ea-cancel>Отмена</button>
      <button type="button" class="btn btn-primary btn-sm" data-ea-send>${edit ? 'Сохранить' : 'Направить'}</button></div>`;
}

function infoHTML(rec, typeId, confirmOff, err) {
  const e = earlyOf(rec);
  const ois = rec.oi || [];
  const names = e.oiIds.length ? e.oiIds.map((id) => ois.find((o) => o.id === id)).filter(Boolean).map(oiName) : [];
  const as = earlyAssigns(rec, typeId);
  const row = (l, v) => (v ? `<div class="ea-row"><dt>${esc(l)}</dt><dd>${v}</dd></div>` : '');
  const can = canManageEarly() && e.state === 'sent';
  return `<div class="apop-h apop-h-${e.state}">${esc(EARLY_STATES[e.state].label)}</div>
    <div class="apop-b"><dl class="ea-facts">
      ${row('Направил', esc([e.by, when(e.at)].filter(Boolean).join(', ')))}
      ${row('Что осмотреть', names.length ? names.map(esc).join('<br>') : 'Весь объект')}
      ${row('Комментарий', e.note ? esc(e.note) : '')}
      ${row('Осмотр', as.length ? as.map((a) => esc(`${a.person} · ${a.label || a.state}${a.plannedAt ? ` · ${dateRu(a.plannedAt)}` : ''}`)).join('<br>') : e.state === 'sent' ? 'ждёт назначения регионалом' : '')}
      ${row('Статус карточки', esc(rec.status || '—'))}
    </dl>${err ? `<p class="ea-err" role="alert">${esc(err)}</p>` : ''}</div>
    ${can ? `<div class="apop-f">${confirmOff
    ? `<span class="ea-ask">Отозвать направление?</span><button type="button" class="btn btn-ghost btn-sm" data-ea-off-no>Нет</button>
       <button type="button" class="btn btn-danger btn-sm" data-ea-off-yes>Отозвать</button>`
    : `${as.length ? '' : '<button type="button" class="btn btn-ghost btn-sm ea-off" data-ea-off>Отозвать</button>'}
       <button type="button" class="btn btn-ghost btn-sm" data-ea-edit>Изменить</button>`}</div>` : ''}`;
}

function openEarly(anchor, ctx, typeId) {
  const rec = ctx.rec;
  const e0 = earlyOf(rec);
  let mode = e0 ? 'info' : 'form';
  let err = '';
  let confirmOff = false;
  const draft = { all: !(e0 && e0.oiIds.length), ids: new Set(e0 ? e0.oiIds : []), note: e0 ? e0.note : '' };
  const done = (text) => { closeAnchorPop(); ctx.toast(text, 'ok'); ctx.render(); };
  openAnchorPop(anchor, {
    label: e0 ? EARLY_STATES[e0.state].label : 'Направить досрочно на осмотр',
    width: 420,
    className: 'ea-pop',
    draw: (el) => { el.innerHTML = mode === 'form' ? formHTML(rec, draft, err, !!earlyOf(rec)) : infoHTML(rec, typeId, confirmOff, err); },
    onOpen: (el, pop) => {
      el.addEventListener('input', (ev) => { if (ev.target.matches('[data-ea-note]')) draft.note = ev.target.value; });
      el.addEventListener('change', (ev) => {
        const t = ev.target;
        if (t.matches('[data-ea-scope]')) { draft.all = t.value === 'all'; err = ''; pop.redraw(); }
        else if (t.matches('[data-ea-oi]')) { if (t.checked) draft.ids.add(t.dataset.eaOi); else draft.ids.delete(t.dataset.eaOi); }
      });
      el.addEventListener('click', (ev) => {
        const t = ev.target.closest('button');
        if (!t) return;
        try {
          if (t.hasAttribute('data-ea-cancel')) { if (earlyOf(rec)) { mode = 'info'; err = ''; pop.redraw(); } else closeAnchorPop(); }
          else if (t.hasAttribute('data-ea-send')) {
            const ids = draft.all ? [] : [...draft.ids];
            if (!draft.all && !ids.length) { err = 'Отметьте хотя бы один ОИ'; pop.redraw(); return; }
            if (earlyOf(rec)) { updateEarly(rec, { oiIds: ids, note: draft.note }); done('Досрочное направление изменено'); }
            else { sendEarly(rec, typeId, { oiIds: ids, note: draft.note }); done('Досрочно направлен на осмотр — регионал увидит его в очереди'); }
          } else if (t.hasAttribute('data-ea-edit')) { mode = 'form'; err = ''; pop.redraw(); }
          else if (t.hasAttribute('data-ea-off')) { confirmOff = true; pop.redraw(); }
          else if (t.hasAttribute('data-ea-off-no')) { confirmOff = false; pop.redraw(); }
          else if (t.hasAttribute('data-ea-off-yes')) { cancelEarly(rec, typeId); done('Досрочное направление отозвано'); }
        } catch (x) { err = x.message; confirmOff = false; pop.redraw(); }
      });
    },
  });
}

export function bindEarly(ctx) {
  const typeId = ctx.manifest && ctx.manifest.id;
  ctx.scope.$$('[data-early]').forEach((b) => b.onclick = () => openEarly(b, ctx, typeId));
}
