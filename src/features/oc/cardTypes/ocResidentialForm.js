import { renderOcBaseStack, bindOcComplexCheckbox } from './ocFormSections.js';

export const ocResidentialForm = {
  id: 'oc_residential',
  label: 'Жилое здание',

  render(oc) {
    return renderOcBaseStack(oc);
  },

  bind(oc) {
    bindOcComplexCheckbox(oc);
  },
};