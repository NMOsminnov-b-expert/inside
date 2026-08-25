import { esc } from '../../../kernel/dom.js';
import { cardMeta } from '../oi/registry.js';
import { miniThumbs, photoAccordions } from '../parts/photos/blocks.js';
import { addOiMenuHTML } from './addOiMenu.js';

function oiAccordion(ctx, oi) {
  return `<div style="padding:4px 2px">
    <div class="acc-inner">
      <div class="sec-h">Фотографии по категориям</div>
      ${photoAccordions(ctx.ui, oi, true)}
    </div>
  </div>`;
}

export function tableOI(ctx) {
  const rec = ctx.rec;
  const rows = rec.oi.filter((o) => o.card !== 'land');
  const lands = rec.oi.filter((o) => o.card === 'land');

  const landRows = lands.length
    ? lands.map((land) => `<tr class="rowlink land-row" data-open-oi="${land.id}" title="Открыть карточку участка">
        <td>—</td>
        <td>${esc(land.name)}</td>
        <td class="ell">${esc(land.purpose || '—')}</td>
        <td>${esc(land.status || '—')}</td>
        <td>${cardMeta(land).tableArea(land)}</td>
        <td style="font-family:ui-monospace,Menlo,monospace;font-size:11.5px">${esc(land.eni)}</td>
        <td>${miniThumbs(land)}</td>
        <td><div class="row-actions"></div></td>
      </tr>`).join('')
    : `<tr class="land-row"><td colspan="8" class="muted">Земельный участок не добавлен. Добавление — только через «Добавить ОИ/ОЦ».</td></tr>`;

  return `<div class="card t-blue" style="margin-top:12px">
    <div class="card-head" data-card-toggle>
      <span class="card-idx">02</span>
      <h3>Перечень ОИ</h3>
      <span class="hint">клик по строке — карточка; шеврон — аккордеон; мини-фото — просмотрщик</span>

      <div class="dd" style="margin-left:auto">
        <button class="btn btn-primary btn-sm" data-dd-toggle>+ Добавить ОИ ▾</button>
        <div class="dd-menu">
          ${addOiMenuHTML(rec)}
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
            const meta = cardMeta(o);
            const expanded = !!ctx.ui.expanded[o.id];

            const isRealty = meta.hasLetter;
            const chev = isRealty ? `<button class="chev-btn ${expanded ? 'open' : ''}" title="Показать/скрыть фото">▸</button>` : '';
            const lit = isRealty
              ? `${chev}${esc(o.letter)}`
              : `<span class="tag-mini">${esc(meta.tableTag ? meta.tableTag(o) : 'ОИ')}</span>`;

            return `<tr class="rowlink" data-open-oi="${o.id}" ${isRealty ? `data-acc-id="${o.id}"` : ''} title="Клик по строке — карточка; по литере — аккордеон">
              <td ${isRealty ? 'data-acc-cell' : ''}>${lit}</td>
              <td>${esc(o.name)}</td>
              <td class="ell">${esc(meta.tableCategory(o))}</td>
              <td>${esc(o.status || '—')}</td>
              <td>${meta.tableArea(o)}</td>
              <td style="font-family:ui-monospace,Menlo,monospace;font-size:11.5px">${esc(o.eni)}</td>
              <td>${isRealty ? miniThumbs(o) : '<span class="muted">—</span>'}</td>
              <td>
                <div class="row-actions">
                  <button class="btn btn-danger btn-sm" data-del-oi="${o.id}" title="${isRealty ? 'Удалить литеру' : 'Удалить ОИ'}">×</button>
                </div>
              </td>
            </tr>
            ${isRealty && expanded ? `<tr class="acc-row" data-accrow="${o.id}"><td colspan="8">${oiAccordion(ctx, o)}</td></tr>` : ''}`;
          }).join('')}

          ${landRows}
        </tbody>
      </table>

      <div class="muted" style="font-size:10.5px;padding:8px 14px 12px">Земельный участок — справочная строка: редактирование и документы в карточке участка.</div>
    </div>
  </div>`;
}
