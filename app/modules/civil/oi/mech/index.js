import { render } from './view.js';
import { bind } from './ctrl.js';
import { mechUnits, createUnit, syncMechName } from './model.js';

// Карточка ОИ «Механизмы и оборудование» модуля «Гражданское здание».
export const card = {
  id: 'mech',

  // Состав не бывает пустым: ОИ без единиц открылся бы карточкой, в которой
  // нечего заполнять.
  init(oi) {
    const list = mechUnits(oi);
    if (!list.length) list.push(createUnit());
    syncMechName(oi);
  },

  render,
  bind,
};
