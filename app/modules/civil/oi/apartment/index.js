// Карточка ОИ «квартира» — импортируется из модуля «Жилое здание (квартира)»
// (там она основная и обновляется для всех модулей разом). Сознательное
// исключение из изоляции модулей — то же, что у карточки земельного участка
// (см. ../land/index.js, app/README.md и граф знаний).
//
// Появилась здесь потому, что в объект оценки любого типа можно добавить любой
// недвижимый ОИ, включая квартиру (решение пользователя 02.09.2026).
import { render } from '../../../apartment/oi/apartment/view.js';
import { bind } from '../../../apartment/oi/apartment/ctrl.js';
import { buildFloors } from '../../../apartment/oi/apartment/floors.model.js';

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
