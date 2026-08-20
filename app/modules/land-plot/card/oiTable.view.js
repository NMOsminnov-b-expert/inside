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
  const rows = rec.oi;

  const emptyRow = rows.length
    ? ''
    : `<tr><td colspan="8" class="muted">ОИ не добавлены. Добавление — через «+ Добавить ОИ».</td></tr>`;

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
            const meta = cardMeta(o);
            const expanded = !!ctx.ui.expanded[o.id];

            const chev = `<button class="chev-btn ${expanded ? 'open' : ''}" title="Показать/скрыть фото">▸</button>`;
            const lit = meta.hasLetter ? `${chev}${esc(o.letter)}` : `${chev}<span class="tag-mini">участок</span>`;

            return `<tr class="rowlink" data-open-oi="${o.id}" data-acc-id="${o.id}" title="Клик по строке — карточка; по литере — аккордеон">
              <td data-acc-cell>${lit}</td>
              <td>${esc(o.name)}</td>
              <td class="ell">${o.card === 'land' ? esc(o.purpose || '—') : esc(meta.tableCategory(o))}</td>
              <td>${esc(o.status || '—')}</td>
              <td>${meta.tableArea(o)}</td>
              <td style="font-family:ui-monospace,Menlo,monospace;font-size:11.5px">${esc(o.eni)}</td>
              <td>${miniThumbs(o)}</td>
              <td>
                <div class="row-actions">
                  <button class="btn btn-danger btn-sm" data-del-oi="${o.id}" title="Удалить ОИ">×</button>
                </div>
              </td>
            </tr>
            ${expanded ? `<tr class="acc-row" data-accrow="${o.id}"><td colspan="8">${oiAccordion(ctx, o)}</td></tr>` : ''}`;
          }).join('')}

          ${emptyRow}
        </tbody>
      </table>

      <div class="muted" style="font-size:10.5px;padding:8px 14px 12px">Участков может быть несколько — каждый со своим ЕНИ и своими документами.</div>
    </div>
  </div>`;
}
