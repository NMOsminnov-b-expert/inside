// Контроллер карточки ОИ «Транспортное средство»: форма ТС привязывается
// своим контроллером (vehicle/card.js), здесь — только подпись объекта
// имущества в перечне ОЦ, которая следует за маркой и госномером.
import { bindTsForm } from '../../../vehicle/card.js';
import { syncVehicleName } from './model.js';

export function bind(ctx, oi) {
  bindTsForm(ctx, oi, oi);

  ['make', 'plate'].forEach((key) => {
    const el = ctx.scope.$(`[data-tsf="main|${key}"]`);
    if (el) el.addEventListener('input', () => syncVehicleName(oi));
  });
}
