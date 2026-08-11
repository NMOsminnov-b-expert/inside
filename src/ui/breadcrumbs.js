import { OC, OI, appState } from '../core/state.js';
import { esc } from '../core/utils.js';

export function crumbsHTML() {
  const home = `<span data-crumb="oc">Главная</span>`;
  const list = `<span data-crumb="oc">Объекты оценки</span>`;
  const obj = `<span data-crumb="oc">Объект ${esc(OC.eni)}</span>`;
  if (appState.view === 'oc') return `${home}<span>/</span>${list}<span>/</span><b>${esc(OC.type)}</b>`;
  if (appState.view === 'oi') {
    const oi = OI.find((o) => o.id === appState.openOi);
    const t = oi ? (oi.kind === 'realty' ? `Литера ${esc(oi.letter)} · ${esc(oi.name)}` : esc(oi.name)) : '';
    return `${home}<span>/</span>${list}<span>/</span>${obj}<span>/</span><b>${t}</b>`;
  }
  if (appState.view === 'ocform') return `${home}<span>/</span>${list}<span>/</span>${obj}<span>/</span><b>Редактирование ОЦ</b>`;
  return `${home}<span>/</span>${list}<span>/</span>${obj}<span>/</span><b>Создание объекта</b>`;
}