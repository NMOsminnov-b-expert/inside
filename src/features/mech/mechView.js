import { appState } from '../../core/state.js';
import { splitWrap, viewerHTML } from '../viewer/viewerShell.js';
import { docsBlockInner } from '../docs/docsTable.js';

export function viewMech() {
  const isMech = appState.mechKind === 'МЕХ';
  return `<div class="view-head"><button class="back-btn" data-back>← Отмена</button>
    <span class="pill pill-gray">${isMech ? 'Механизмы и производственное оборудование' : 'Офисная техника и мебель'}</span></div>
  ${splitWrap((appState.viewer && appState.viewerDoc && appState.viewerDoc.scope === 'mech-new') ? viewerHTML() : null, `<div class="card">
      <div class="card-head"><h3>Создание объекта</h3>
        <div class="inline-row" style="margin-left:auto">
          <span class="qn" data-mech-mode="mono" style="${appState.mechMode === 'mono' ? 'border-color:var(--blue-600);color:var(--blue-700);background:var(--blue-100)' : ''}">Монолит (единичный)</span>
          <span class="qn" data-mech-mode="complex" style="${appState.mechMode === 'complex' ? 'border-color:var(--blue-600);color:var(--blue-700);background:var(--blue-100)' : ''}">Комплекс (многосоставной)</span>
        </div>
      </div>
      <div class="card-pad">
      ${appState.mechMode === 'mono' ? `
        <div class="grid g-3">
          <div class="field"><label>Наименование</label><input class="input" id="mName" placeholder="${isMech ? 'Напр.: станок токарный' : 'Напр.: МФУ'}"></div>
          <div class="field"><label>Год выпуска</label><input class="input" id="mYear"></div>
          <div class="field"><label>Заводской номер</label><input class="input" id="mSerial"></div>
        </div>
        ${docsBlockInner({ docs: appState.mechDocs || [] }, 'mech-new')}
      ` : `
        <div class="muted" style="margin-bottom:6px">У комплекса вместо полей самого объекта создаются его ОИ (иерархия ОЦ → ОИ).</div>
        <table class="tbl"><thead><tr><th>Наименование ОИ</th><th style="width:160px">Тип</th><th>Код ЕНИ</th><th style="width:36px"></th></tr></thead>
        <tbody id="mechRows"></tbody></table>
        <button class="btn btn-ghost btn-sm" data-mech-add style="margin-top:6px">+ Добавить ОИ</button>
      `}
      <div class="inline-row" style="margin-top:14px">
        <button class="btn btn-primary" data-mech-save>Создать</button>
        <button class="btn btn-ghost" data-back>Отмена</button>
      </div>
      </div>
    </div>`)}`;
}