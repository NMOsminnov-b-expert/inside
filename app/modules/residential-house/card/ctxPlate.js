import { fmtEni } from '../../../kernel/fmt.js';
import { esc } from '../../../kernel/dom.js';
import { cardMeta } from '../oi/registry.js';

// Контекстная плашка над карточкой. Данные для чипов даёт метаданные
// карточки ОИ — плашка не знает, какие бывают виды ОИ.
export function ctxPlate(ctx) {
  if (ctx.view === 'oi' && ctx.oi) {
    const oi = ctx.oi;
    const meta = cardMeta(oi);
    const pend = (oi.notes || []).filter((n) => !n.done).length;
    const chips = meta.plateChips(oi).join('');

    return `<div class="ctx-plate ctx-oi">
        <span class="ctx-kind">${meta.plateKind}</span>
        <b>${meta.hasLetter ? 'Литера ' + esc(oi.letter) + ' · ' : ''}${esc(oi.name)}</b>
        <span class="ctx-chip ctx-plate-eni" title="Код ЕНИ — можно править прямо здесь">
          <label>ЕНИ</label>
          <input class="mono" data-plate-eni value="${esc(fmtEni(oi.eni))}" size="18"></span>
        <span class="ctx-chip ctx-plate-addr ell" title="${esc(ctx.rec.address)}">${esc(ctx.rec.address)}</span>
        ${chips}
        <span class="ctx-chip ${pend ? '' : 'ctx-ok'}">${pend ? pend + ' невып. заметок' : 'заметки выполнены'}</span>
        <button class="ctx-back-btn" data-back title="Вернуться к объекту оценки">← К объекту оценки</button>
      </div>`;
  }

  if (ctx.view === 'form') {
    return `<div class="ctx-plate ctx-form"><span class="ctx-kind">Редактирование</span><b>ОЦ · ${esc(ctx.rec.type)}</b><span class="ctx-chip">${esc(ctx.rec.address)}</span><span class="ctx-chip">${esc(ctx.rec.status)}</span></div>`;
  }

  return null;
}

export function updatePlate(ctx) {
  const w = ctx.scope.$('#ctxPlateWrap');
  if (!w) return;
  const h = ctxPlate(ctx);
  w.innerHTML = h || '';
  w.style.display = h ? '' : 'none';
}
