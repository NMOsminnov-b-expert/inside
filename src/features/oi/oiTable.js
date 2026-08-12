import { OI, appState } from '../../core/state.js';
import { esc, fmt, num } from '../../core/utils.js';
import { autoCategory } from './oiModel.js';
import { miniThumbs, photoAccordions } from '../photos/photoBlocks.js';
import { addOiMenuHTML } from '../oc/addOiMenu.js';

function oiAccordion(oi) {
  return `<div style="padding:4px 2px">
    <div class="acc-inner">
      <div class="sec-h">Фотографии по категориям</div>
      ${photoAccordions(oi, true)}
    </div>
  </div>`;
}

export function tableOI() {
  const rows = OI.filter((o) => o.kind !== 'land');
  const land = OI.find((o) => o.kind === 'land');

  // Участок выводится строкой в той же таблице и с тем же colgroup,
  // поэтому колонки совпадают с колонками литер без смещений.
  const landRow = land
    ? `<tr class="rowlink land-row" data-open-oi="${land.id}" title="Открыть карточку участка">
        <td>—</td>
        <td>${esc(land.name)}</td>
        <td class="ell">${esc(land.purpose || '—')}</td>
        <td>${esc(land.status || '—')}</td>
        <td>${land.area ? fmt(num(land.area)) + ' м²' : '—'}</td>
        <td style="font-family:ui-monospace,Menlo,monospace;font-size:11.5px">${esc(land.eni)}</td>
        <td>${miniThumbs(land)}</td>
        <td><div class="row-actions"></div></td>
      </tr>`
    : `<tr class="land-row"><td colspan="8" class="muted">Земельный участок не добавлен. Добавление — только через «Добавить ОИ/ОЦ».</td></tr>`;

  return `<div class="card t-blue" style="margin-top:12px">
    <div class="card-head" data-card-toggle>
      <span class="card-idx">02</span>
      <h3>Перечень ОИ</h3>
      <span class="hint">клик по строке — карточка; шеврон — аккордеон; мини-фото — просмотрщик</span>

      <div class="dd" style="margin-left:auto">
        <button class="btn btn-primary btn-sm" data-dd-toggle>+ Добавить ОИ ▾</button>
        <div class="dd-menu">
          ${addOiMenuHTML()}
        </div>
      </div>

      <span class="chev" style="margin-left:8px">▾</span>
    </div>

    <div class="card-body-wrap">
      <table class="tbl">
        <colgroup>
          <col style="width:86px">
          <col>
          <col style="width:150px">
          <col style="width:110px">
          <col style="width:100px">
          <col style="width:130px">
          <col style="width:100px">
          <col style="width:120px">
        </colgroup>

        <thead>
          <tr>
            <th>Литера</th>
            <th>Наименование</th>
            <th>Категория</th>
            <th>Статус</th>
            <th>Общая площадь</th>
            <th>Код ЕНИ</th>
            <th>Фото</th>
            <th></th>
          </tr>
        </thead>

        <tbody>
          ${rows.map((o) => {
            const isR = o.kind === 'realty';
            const expanded = !!appState.expanded[o.id];

            const chev = isR
              ? `<button class="chev-btn ${expanded ? 'open' : ''}" title="Показать/скрыть фото">▸</button>`
              : '';

            const lit = isR
              ? `${chev}${esc(o.letter)}`
              : `<span class="tag-mini">${o.kind === 'vehicle' ? 'ТС' : o.kind === 'office' ? 'Офис. техника' : 'Механизм'}</span>`;

            const area = isR
              ? (o.areas && o.areas.tp ? fmt(num(o.areas.tp)) + ' м²' : '—')
              : '—';

            return `<tr class="rowlink" data-open-oi="${o.id}" ${isR ? `data-acc-id="${o.id}"` : ''} title="Клик по строке — карточка; по литере — аккордеон">
              <td ${isR ? 'data-acc-cell' : ''}>${lit}</td>
              <td>${esc(o.name)}</td>
              <td class="ell">${esc(autoCategory(o))}</td>
              <td>${esc(o.status || '—')}</td>
              <td>${area}</td>
              <td style="font-family:ui-monospace,Menlo,monospace;font-size:11.5px">${esc(o.eni)}</td>
              <td>${isR ? miniThumbs(o) : '<span class="muted">—</span>'}</td>
              <td>
                <div class="row-actions">
                  ${isR ? `<button class="btn btn-danger btn-sm" data-del-oi="${o.id}" title="Удалить литеру">×</button>` : ''}
                </div>
              </td>
            </tr>
            ${isR && expanded ? `<tr class="acc-row" data-accrow="${o.id}"><td colspan="8">${oiAccordion(o)}</td></tr>` : ''}`;
          }).join('')}

          ${landRow}
        </tbody>
      </table>

      <div class="muted" style="font-size:10.5px;padding:8px 14px 12px">Земельный участок — справочная строка: редактирование и документы в карточке участка.</div>
    </div>
  </div>`;
}