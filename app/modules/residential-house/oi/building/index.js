import { render } from './view.js';
import { bind } from './ctrl.js';
import { buildFloors } from './floors.model.js';

// Карточка ОИ «строение» внутри модуля «Жилое здание (дом)».
export const card = {
  id: 'building',

  // Ленивая доинициализация данных карточки (этажная развёртка).
  init(oi) {
    if (!oi.floorList || !oi.floorList.length) buildFloors(oi);
  },

  render,
  bind,
};
