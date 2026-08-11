import { OC, OI, appState } from '../core/state.js';
import { esc, fmt, num } from '../core/utils.js';
import { oiVerbal } from '../features/oi/oiModel.js';

export function ctxPlate() {
  if (appState.view === 'oi') {
    const oi = OI.find((o) => o.id === appState.openOi);
    if (oi) {
      const pend = (oi.notes || []).filter((n) => !n.done).length;
      const isR = oi.kind === 'realty';
      const v = oiVerbal(oi);
      return `<div class="ctx-plate ctx-oi">
        <span class="ctx-kind">ОЦ → ${isR ? 'литера' : 'ОИ'}</span>
        <b>${isR ? 'Литера ' + esc(oi.letter) + ' · ' : ''}${esc(oi.name)}</b>
        ${isR ? `<span class="ctx-chip">${fmt(num(oi.areas.tp || 0))} м² общая</span><span class="ctx-chip">этажей: ${oi.floors}</span><span class="ctx-chip ${v.c}">${v.t}</span>` : ''}
        <span class="ctx-chip ${pend ? '' : 'ctx-ok'}">${pend ? pend + ' невып. заметок' : 'заметки выполнены'}</span>
        <span class="ctx-back-hint">возврат — «К объекту оценки»</span>
      </div>`;
    }
  }
  if (appState.view === 'ocform') return `<div class="ctx-plate ctx-form"><span class="ctx-kind">Редактирование</span><b>ОЦ · ${esc(OC.type)}</b><span class="ctx-chip">${esc(OC.address)}</span><span class="ctx-chip">${esc(OC.status)}</span></div>`;
  if (appState.view === 'mech') return `<div class="ctx-plate ctx-form"><span class="ctx-kind">Создание</span><b>${appState.mechKind === 'МЕХ' ? 'Механизм' : 'Офисная техника'}</b><span class="ctx-chip">${appState.mechMode === 'mono' ? 'монолит' : 'комплекс'}</span></div>`;
  return null;
}

export function updateCtxPlate() {
  const w = document.getElementById('ctxPlateWrap');
  if (w) {
    const h = ctxPlate();
    w.innerHTML = h || '';
    w.style.display = h ? '' : 'none';
  }
}