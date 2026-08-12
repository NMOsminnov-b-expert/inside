import { renderOcBaseStack, bindOcMovableComplexCheckbox } from './ocFormSections.js';

export const ocMovableForm = {
  id: 'oc_movable',
  label: 'Движимое имущество',

  render(oc) {
    return renderOcBaseStack(oc);
  },

  bind(oc) {
    bindOcMovableComplexCheckbox(oc);
  },
};