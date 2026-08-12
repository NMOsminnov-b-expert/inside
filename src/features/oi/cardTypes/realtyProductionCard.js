import { renderRealtyBase } from './realtySections.js';

export const realtyProductionCard = {
  id: 'realty_production',
  label: 'Производственное строение',
  kind: 'realty',

  render(oi) {
    return renderRealtyBase(oi, {
      generalTitle: 'Общие параметры производственного строения',
      showResCat: false,
    });
  },

  bind() {
    // Специфичные биндинги производственного строения при необходимости добавляются здесь.
  },

  validate(oi) {
    const errors = [];

    if (!String(oi.name || '').trim()) {
      errors.push('Не заполнено наименование производственного строения');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },
};