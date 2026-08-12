import { renderRealtyBase } from './realtySections.js';

export const realtyResidentialCard = {
  id: 'realty_residential',
  label: 'Жилое здание',
  kind: 'realty',

  render(oi) {
    return renderRealtyBase(oi, {
      generalTitle: 'Общие параметры жилого здания',
      showResCat: true,
    });
  },

  bind() {
    // Специфичные биндинги жилого здания при необходимости добавляются здесь.
  },

  validate(oi) {
    const errors = [];

    if (!String(oi.name || '').trim()) {
      errors.push('Не заполнено наименование жилого здания');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },
};