import { renderMovableCard } from './movableSections.js';

export const vehicleCard = {
  id: 'vehicle',
  label: 'Транспортное средство',
  kind: 'vehicle',

  render(oi) {
    return renderMovableCard(oi);
  },

  bind() {
    // Общие поля ТС уже обрабатываются контроллером ОИ.
  },

  validate(oi) {
    const errors = [];

    if (!String(oi.name || '').trim()) {
      errors.push('Не заполнено наименование ТС');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },
};