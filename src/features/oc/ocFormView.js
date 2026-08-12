import { OC, appState } from '../../core/state.js';
import { splitWrap, viewerHTML } from '../viewer/viewerShell.js';
import { getOcFormDefinition } from './cardTypes/index.js';

export function viewOCForm() {
  const form = getOcFormDefinition(OC);

  return `<div class="view-head">
    <button class="back-btn" data-back>← К карточке объекта</button>
    <span class="pill pill-gray">Редактирование ОЦ · ${OC.eni}</span>
    <button class="btn btn-primary" id="btnSaveOc">Сохранить и вернуться</button>
    <button class="btn btn-ghost" data-back>Отмена</button>
  </div>

  ${splitWrap(
    (appState.viewer && appState.viewerDoc && appState.viewerDoc.scope === 'oc')
      ? viewerHTML()
      : null,
    form.render(OC)
  )}`;
}