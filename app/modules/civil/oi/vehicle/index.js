import { render } from './view.js';
import { bind } from './ctrl.js';
import { syncVehicleName } from './model.js';

// Карточка ОИ «Транспортное средство» модуля «Гражданское здание».
export const card = {
  id: 'vehicle',

  // Подпись ОИ — производная от марки, модели и госномера: у машины, заведённой
  // до того, как их заполнили, в перечне стояла бы пустая строка.
  init(oi) {
    oi.params = oi.params || {};
    syncVehicleName(oi);
  },

  render,
  bind,
};
