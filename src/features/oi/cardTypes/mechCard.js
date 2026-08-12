import { renderMovableCard } from './movableSections.js';

export const mechCard = {
  id: 'mech',
  label: 'Механизм',
  kind: 'mech',

  render(oi) {
    return renderMovableCard(oi);
  },

  bind() {
    // Общие поля механизма уже обрабатываются контроллером ОИ.
  },

  validate(oi) {
    const errors = [];

    if (!String(oi.name || '').trim()) {
      errors.push('Не заполнено наименование механизма');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },
};