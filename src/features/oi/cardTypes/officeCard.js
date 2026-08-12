import { renderMovableCard } from './movableSections.js';

export const officeCard = {
  id: 'office',
  label: 'Офисная техника',
  kind: 'office',

  render(oi) {
    return renderMovableCard(oi);
  },

  bind() {
    // Общие поля офисной техники уже обрабатываются контроллером ОИ.
  },

  validate(oi) {
    const errors = [];

    if (!String(oi.name || '').trim()) {
      errors.push('Не заполнено наименование офисной техники');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },
};