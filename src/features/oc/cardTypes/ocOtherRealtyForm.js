import { renderOcBaseStack, bindOcComplexCheckbox } from './ocFormSections.js';

export const ocOtherRealtyForm = {
  id: 'oc_other_realty',
  label: 'Прочее строение',

  render(oc) {
    return renderOcBaseStack(oc);
  },

  bind(oc) {
    bindOcComplexCheckbox(oc);
  },
};