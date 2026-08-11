import { OI, appState } from '../../core/state.js';
import { esc, fmt, num } from '../../core/utils.js';
import { autoCategory } from './oiModel.js';
import { miniThumbs, photoAccordions } from '../photos/photoBlocks.js';
import { photoPages } from '../photos/photoModel.js';

function oiAccordion(oi) {
  return `<div style="padding:4px 2px">
    <div class="acc-inner">
      <div class="sec-h">Основные параметры</div>
      <div class="params-grid">
        <div class="grid g-4">
          <div class="field"><label>Общая площадь (ТП)</label><b>${esc(oi.areas && oi.areas.tp ? oi.areas.tp : '—')} м²</b></div>
          <div class="field"><label>Этажей</label><b>${oi.floors || '—'}</b></div>
          <div class="field"><label>Тип строения</label><b>${esc(oi.buildType || '—')}</b></div>
          <div class="field"><label>Категория/класс</label><b>${esc(autoCategory(oi))}</b></div>
        </div>
      </div>
    </div>
    <div class="acc-inner">
      <div class="sec-h">Фотографии по категориям</div>
      ${photoAccordions(oi, true)}
    </div>
  </div>`;
}

export function tableOI() {
  const rows = OI.filter((o) => o.kind !== 'land');
  const land = OI.find((o) => o.kind === 'land');
  return `<div class="card t-blue" style="margin-top:12px">
    <div class="card-head" data-card-toggle><span class="card-idx">02</span><h3>Перечень ОИ</h3><span class="hint">клик по строке — карточка; шеврон — аккордеон; мини-фото — просмотрщик</span>
      <button class="btn btn-primary btn-sm" data-add-letter style="margin-left:auto">+ Добавить литеру</button><span class="chev">▾</span></div>
    <div class="card-body-wrap">
    <table class="tbl">
      <colgroup><col style="width:86px"><col><col style="width:150px"><col style="width:110px"><col style="width:100px"><col style="width:130px"><col style="width:100px"><col style="width:120px"></colgroup>
      <thead><tr><th>Литера</th><th>Наименование</th><th>Категория</th><th>Статус</th><th>Общая площадь</th><th>Код ЕНИ</th><th>Фото</th><th>Действия</th></tr></thead>
      <tbody>
      ${rows.map((o) => {
        const isR = o.kind === 'realty';
        const expanded = !!appState.expanded[o.id];
        const chev = isR ? `<button class="chev-btn ${expanded ? 'open' : ''}" title="Показать/скрыть фото">▸</button>` : '';
        const lit = isR ? `${chev}${esc(o.letter)}` : `<span class="tag-mini">${o.kind === 'vehicle' ? 'ТС' : o.kind === 'office' ? 'Офис. техника' : 'Механизм'}</span>`;
        const area = isR ? (o.areas && o.areas.tp ? fmt(num(o.areas.tp)) + ' м²' : '—') : '—';
        return `<tr class="rowlink" data-open-oi="${o.id}" ${isR ? `data-acc-id="${o.id}"` : ''} title="Клик по строке — карточка; по литере — аккордеон">
          <td ${isR ? 'data-acc-cell' : ''}>${lit}</td><td>${esc(o.name)}</td><td class="ell">${esc(autoCategory(o))}</td><td>${esc(o.status || '—')}</td><td>${area}</td>
          <td style="font-family:ui-monospace,Menlo,monospace;font-size:11.5px">${esc(o.eni)}</td>
          <td>${isR ? miniThumbs(o) : '<span class="muted">—</span>'}</td>
          <td><div class="row-actions">
            ${isR ? `<button class="btn btn-danger btn-sm" data-del-oi="${o.id}" title="Удалить литеру">×</button>` : ''}
          </div></td>
        </tr>
        ${isR && expanded ? `<tr class="acc-row" data-accrow="${o.id}"><td colspan="8">${oiAccordion(o)}</td></tr>` : ''}`;
      }).join('')}
      </tbody>
    </table>
    <div class="card-pad" style="border-top:1px solid var(--line-soft);padding-top:8px">
      <div class="sec-h teal" style="margin:0 0 6px">Земельный участок</div>
      ${land ? `<table class="tbl"><colgroup><col><col style="width:120px"><col style="width:150px"><col style="width:150px"></colgroup><thead><tr><th>Назначение</th><th>Площадь</th><th>ЕНИ</th><th>Действия</th></tr></thead>
        <tbody><tr class="clickable" data-open-oi="${land.id}" title="Открыть карточку участка">
          <td>${esc(land.purpose)}</td><td>${fmt(num(land.area))} м²</td>
          <td style="font-family:ui-monospace,Menlo,monospace;font-size:11.5px">${esc(land.eni)}</td>
          <td><div class="row-actions"><span class="rowchev-open">›</span></div></td>
        </tr></tbody></table>
        <div class="muted" style="font-size:10.5px;margin-top:6px">Строка справочная: редактирование и документы — в карточке участка.</div>`
      : '<span class="muted">Не добавлен. Добавление — только через «Добавить ОИ/ОЦ».</span>'}
    </div>
    </div>
  </div>`;
}