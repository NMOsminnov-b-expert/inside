import { OI, appState } from '../../core/state.js';
import { render } from '../../core/renderer.js';
import { $ } from '../../core/dom.js';
import { toast } from '../../core/utils.js';
import { createMovableOi } from '../oi/oiModel.js';

export function bindMech() {
  document.querySelectorAll('[data-mech-mode]').forEach((c) => c.onclick = () => {
    appState.mechMode = c.dataset.mechMode;
    render();
  });

  if (appState.view === 'mech') {
    const am = document.querySelector('[data-add-movdoc]');
    if (am) am.onclick = () => {
      appState.mechDocs = appState.mechDocs || [];
      appState.mechDocs.push({ id: 'md' + Date.now(), type: 'ПУД', name: 'Новый документ', date: '07.08.2026' });
      render();
      toast('Документ добавлен', 'ok');
    };
  }

  const ma = document.querySelector('[data-mech-add]');
  if (ma) ma.onclick = () => {
    const tb = $('#mechRows');
    tb.insertAdjacentHTML('beforeend', `<tr><td><input class="input" placeholder="Наименование ОИ"></td>
      <td><select class="select">${['Узел', 'Агрегат', 'Станция', 'Прочее'].map((o) => `<option>${o}</option>`).join('')}</select></td>
      <td><input class="input" placeholder="Код ЕНИ"></td><td><button class="btn btn-ghost btn-sm" data-mech-del>×</button></td></tr>`);
    tb.querySelectorAll('[data-mech-del]').forEach((b) => b.onclick = () => b.closest('tr').remove());
  };

  const ms2 = document.querySelector('[data-mech-save]');
  if (ms2) ms2.onclick = () => {
    const kind = appState.mechKind === 'МЕХ' ? 'mech' : 'office';
    const name = appState.mechMode === 'mono'
      ? (($('#mName')?.value || (appState.mechKind === 'МЕХ' ? 'Механизм' : 'Офисная техника')))
      : (appState.mechKind === 'МЕХ' ? 'Механизм-комплекс' : 'Комплекс техники');
    OI.push(createMovableOi({
      kind,
      name,
      docs: appState.mechDocs || [],
      year: $('#mYear')?.value || '',
      serial: $('#mSerial')?.value || '',
    }));
    appState.mechDocs = [];
    appState.view = 'oc';
    render();
    toast(appState.mechMode === 'mono' ? 'Объект добавлен (монолит)' : 'Комплекс добавлен, ОИ создаются внутри', 'ok');
  };
}