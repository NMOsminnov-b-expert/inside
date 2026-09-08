import { esc } from '../../../kernel/dom.js';

// Контекстная плашка над карточкой. У этого модуля нет карточки ОИ (нет
// объектов имущества — см. manifest.js, records.js) и нет мастера создания
// движимого имущества (rec САМ уже единица техники), поэтому, в отличие от
// остальных модулей, здесь только один вариант плашки — режим редактирования
// записи ОЦ. Своих действий (удалить/сохранить/отмена) плашка не несёт: их
// негде взять — они были нужны только карточке ОИ, которой здесь нет.
export function ctxPlate(ctx) {
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

  // Высота плашки могла измениться (длинный адрес переносит её на две
  // строки). От неё считаются и высота просмотрщика, и положение закладок —
  // пересчитываем сразу, а не ждём прокрутки.
  if (ctx.scope.syncStickyHead) ctx.scope.syncStickyHead();
}
