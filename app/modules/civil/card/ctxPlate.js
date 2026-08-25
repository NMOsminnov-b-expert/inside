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
        ${chips}
        <span class="ctx-chip ${pend ? '' : 'ctx-ok'}">${pend ? pend + ' невып. заметок' : 'заметки выполнены'}</span>
        <span class="ctx-back-hint">возврат — «К объекту оценки»</span>
      </div>`;
  }

  if (ctx.view === 'mech') {
    return `<div class="ctx-plate ctx-form"><span class="ctx-kind">Создание</span><b>${ctx.mechKind === 'МЕХ' ? 'Механизм' : 'Офисная техника'}</b><span class="ctx-chip">${ctx.ui.mechMode === 'mono' ? 'монолит' : 'комплекс'}</span></div>`;
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
