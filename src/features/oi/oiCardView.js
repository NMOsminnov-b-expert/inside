import { OI, appState } from '../../core/state.js';
import { splitWrap, viewerHTML } from '../viewer/viewerShell.js';
import { viewOC } from '../oc/ocView.js';
import { getOiCardDefinition } from './cardTypes/index.js';

export function viewOI() {
  const oi = OI.find((o) => o.id === appState.openOi);

  if (!oi) {
    return viewOC();
  }

  const card = getOiCardDefinition(oi);

  const isR = oi.kind === 'realty';
  const f = oi.flags || {};
  const isMl = (oi.origin || 'manual') === 'ml';

  return `<div class="view-head">
    <button class="back-btn" data-back>← К объекту оценки</button>

    <span class="pill pill-gray">${card.label}</span>

    ${isR ? `<label class="flag-lbl"><input type="checkbox" data-flag="entered" ${f.entered ? 'checked' : ''}> Введено</label>` : ''}
    ${isR && isMl ? `<label class="flag-lbl"><input type="checkbox" data-flag="matched" ${f.matched ? 'checked' : ''}> Сопоставлено с фото</label>` : ''}

    ${isR ? `<button class="btn btn-danger" data-del-oi="${oi.id}">Удалить литеру</button>` : ''}

    <button class="btn btn-ghost" data-open-ocdocs>Документы ОЦ</button>
    <button class="btn btn-primary" data-save-oi>Сохранить</button>
    <button class="btn btn-ghost" data-back>Отмена</button>
  </div>

  ${splitWrap(
    appState.viewer ? viewerHTML() : null,
    card.render(oi)
  )}`;
}