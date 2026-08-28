import { render } from './view.js';
import { bind } from './ctrl.js';
import { buildFloors } from './floors.model.js';

// Карточка ОИ «квартира» внутри модуля «Жилое здание (дом)».
// Отдельная копия: её поля и правила меняются независимо от строения.
export const card = {
  id: 'apartment',

  init(oi) {
    if (!oi.apartment) {
      oi.apartment = {
        floor: '', buildingFloors: '', rooms: '', series: '',
        location: '', locationOther: '', storeys: '1',
        loggiaCount: '', balconyCount: '', loggiaBuildArea: '', balconyBuildArea: '',
        rights: '', rightsOther: '',
      };
    }
    if (!oi.floorList || !oi.floorList.length) buildFloors(oi);
    if (!oi.plans) oi.plans = [];
  },

  render,
  bind,
};
