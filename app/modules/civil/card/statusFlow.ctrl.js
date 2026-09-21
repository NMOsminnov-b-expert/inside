import { stepOf, isBranch, STATUS_MAIN } from '../data/statusFlow.js';

// Шкала статусов в шапке карточки ОЦ (разметка — statusFlow.view.js).
//
// Переход — только на доступный шаг, и через подтверждение: статус двигает
// запись по конвейеру (от него зависят срезы реестра «Мне осмотреть», «Мне
// оценить»), а шаг назад шкала не даёт — промах мышью не должен уводить запись
// дальше.
export function bindStatusFlow(ctx) {
  const s = ctx.scope;
  const rec = ctx.rec;

  s.$$('[data-status-toggle]').forEach((b) => b.onclick = () => {
    ctx.ui.statusCollapsed = !ctx.ui.statusCollapsed;
    // Без перерисовки: обе формы шкалы уже на экране, решает класс.
    const flow = s.$('[data-status-flow]');
    if (flow) flow.classList.toggle('is-collapsed', !!ctx.ui.statusCollapsed);
    const other = s.$(`.st-flow ${ctx.ui.statusCollapsed ? '.st-mini' : '.st-full'} [data-status-toggle]`);
    if (other) other.focus();
    if (s.syncStickyHead) s.syncStickyHead();
  });

  s.$$('[data-status-go]').forEach((b) => b.onclick = async () => {
    const to = b.dataset.statusGo;
    const note = isBranch(to)
      ? 'Это боковая ветка: из неё дальше по шкале объект не пойдёт.'
      : `Шаг ${stepOf(to) + 1} из ${STATUS_MAIN.length}. Вернуть прежний статус шкалой нельзя — только в форме ОЦ.`;
    const ok = await ctx.host.confirm({
      title: 'Сменить статус',
      text: `«${rec.status}» → «${to}»`,
      note,
      okLabel: 'Перевести',
    });
    if (!ok) return;

    rec.status = to;
    rec.updatedAt = new Date().toISOString().slice(0, 10);
    ctx.render();
    ctx.toast(`Статус: ${to}`, 'ok');
  });
}
