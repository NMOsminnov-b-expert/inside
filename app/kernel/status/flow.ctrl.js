import { stepOf, isBranch, OC_FLOW } from './flow.js';

// Шкала статусов (разметка — kernel/status/flow.view.js).
//
// Переход — только на доступный шаг, и через подтверждение: статус двигает
// запись по конвейеру (от него зависят срезы реестра «Мне осмотреть», «Мне
// оценить»), а шаг назад шкала не даёт — промах мышью не должен уводить запись
// дальше.
//
// o: key — приставка атрибутов шкалы (как в flowHTML); flow — шаги; get/set —
// прочитать и записать статус; collapsed — имя признака свёрнутости в ctx.ui;
// back — где вернуть прежний статус; after — что сделать после перехода.
export function bindFlow(ctx, o) {
  const s = ctx.scope;

  s.$$(`[data-${o.key}-toggle]`).forEach((b) => b.onclick = () => {
    ctx.ui[o.collapsed] = !ctx.ui[o.collapsed];
    // Без перерисовки: обе формы шкалы уже на экране, решает класс.
    const flow = s.$(`[data-${o.key}-flow]`);
    if (flow) flow.classList.toggle('is-collapsed', !!ctx.ui[o.collapsed]);
    const other = s.$(`[data-${o.key}-flow] ${ctx.ui[o.collapsed] ? '.st-mini' : '.st-full'} [data-${o.key}-toggle]`);
    if (other) other.focus();
    if (s.syncStickyHead) s.syncStickyHead();
  });

  s.$$(`[data-${o.key}-go]`).forEach((b) => b.onclick = async () => {
    const to = b.dataset[`${o.key}Go`];
    const note = isBranch(to, o.flow)
      ? 'Это боковая ветка: из неё дальше по шкале объект не пойдёт.'
      : `Шаг ${stepOf(to, o.flow) + 1} из ${o.flow.main.length}. Вернуть прежний статус шкалой нельзя${o.back ? ' — только ' + o.back : ''}.`;
    const ok = await ctx.host.confirm({
      title: 'Сменить статус',
      text: `«${o.get()}» → «${to}»`,
      note,
      okLabel: 'Перевести',
    });
    if (!ok) return;

    o.set(to);
    o.after();
    ctx.toast(`Статус: ${to}`, 'ok');
  });
}

// Шкала объекта оценки — в шапке карточки ОЦ.
export function bindStatusFlow(ctx) {
  const rec = ctx.rec;
  bindFlow(ctx, {
    key: 'status',
    flow: OC_FLOW,
    collapsed: 'statusCollapsed',
    back: 'в форме ОЦ',
    get: () => rec.status,
    set: (to) => {
      rec.status = to;
      rec.updatedAt = new Date().toISOString().slice(0, 10);
    },
    after: () => ctx.render(),
  });
}
