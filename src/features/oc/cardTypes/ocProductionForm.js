import { renderOcBaseStack, bindOcComplexCheckbox } from './ocFormSections.js';

export const ocProductionForm = {
  id: 'oc_production',
  label: 'Производственное строение',

  render(oc) {
    return renderOcBaseStack(oc);
  },

  bind(oc) {
    bindOcComplexCheckbox(oc);
  },
};