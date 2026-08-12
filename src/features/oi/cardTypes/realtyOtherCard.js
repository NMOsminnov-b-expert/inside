import { renderRealtyBase } from './realtySections.js';

export const realtyOtherCard = {
  id: 'realty_other',
  label: 'Прочее строение',
  kind: 'realty',

  render(oi) {
    return renderRealtyBase(oi, {
      generalTitle: 'Общие параметры прочего строения',
      showResCat: false,
    });
  },

  bind() {
    // Специфичные биндинги прочего строения при необходимости добавляются здесь.
  },

  validate(oi) {
    const errors = [];

    if (!String(oi.name || '').trim()) {
      errors.push('Не заполнено наименование строения');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },
};