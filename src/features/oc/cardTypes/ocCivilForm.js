import { renderOcBaseStack, bindOcComplexCheckbox } from './ocFormSections.js';

export const ocCivilForm = {
  id: 'oc_civil',
  label: 'Гражданское здание',

  render(oc) {
    return renderOcBaseStack(oc);
  },

  bind(oc) {
    bindOcComplexCheckbox(oc);
  },
};