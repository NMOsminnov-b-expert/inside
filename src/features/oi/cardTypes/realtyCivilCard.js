import { renderRealtyBase } from './realtySections.js';

export const realtyCivilCard = {
  id: 'realty_civil',
  label: 'Гражданское здание',
  kind: 'realty',

  render(oi) {
    return renderRealtyBase(oi, {
      generalTitle: 'Общие параметры гражданского здания',
      showResCat: false,
    });
  },

  bind() {
    // Специфичные биндинги гражданского здания при необходимости добавляются здесь.
  },

  validate(oi) {
    const errors = [];

    if (!String(oi.name || '').trim()) {
      errors.push('Не заполнено наименование гражданского здания');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },
};