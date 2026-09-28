import { bindViewer } from '../../kernel/viewer/ctrl.js';
import { bindSplitPanes } from '../../kernel/viewer/shell.js';
import { bindStatusFlow } from '../../kernel/status/flow.ctrl.js';
import { bindParties } from './parties.ctrl.js';
import { bindMechForm } from './form/ctrl.js';
import { mechOf } from './records.js';

// Контроллер карточки ОЦ «Механизмы и оборудование»: форма перечня — общая с
// объектом имущества (form/ctrl.js), стороны, шкала статусов и просмотрщик —
// как у ОЦ «Транспортные средства».
export function bindMech(ctx) {
  const s = ctx.scope;
  bindMechForm(ctx, mechOf(ctx.rec));

  bindParties(ctx);
  bindStatusFlow(ctx);
  bindViewer(ctx);
  bindSplitPanes(ctx);

  const save = s.$('[data-mech-save]');
  if (save) {
    save.onclick = () => {
      ctx.rec.updatedAt = new Date().toISOString().slice(0, 10);
      ctx.toast('ОЦ механизмов и оборудования сохранён', 'ok');
    };
  }

  s.$$('[data-mech-back]').forEach((button) => button.onclick = () => ctx.host.toMenu());
}
