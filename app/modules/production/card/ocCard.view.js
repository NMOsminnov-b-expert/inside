import { ocHeadHTML, ocTabs } from '../../../kernel/ocHead.js';
import { recFlags } from '../records.js';
import { canViewAuditLog } from '../audit/access.js';
import { auditTab } from '../audit/view.js';
import { fmtEni } from '../../../kernel/fmt.js';
import { eniAllOf } from '../../../kernel/eniFold.js';
import { esc } from '../../../kernel/dom.js';
import { ownersUsersHTML, responsiblesHTML } from './parties.view.js';
import { partyNames } from '../records.js';
import { tableOI } from './oiTable.view.js';
import { photosTab } from '../parts/photos/explorer.js';
import { splitWrap, viewerHTML } from '../../../kernel/viewer/shell.js';
import { addOiMenuHTML } from './addOiMenu.js';

// Код ЕНИ в шапке — свёрнутые коды записи целиком: её собственный и коды её
// объектов имущества, ровно как в столбце реестра (решение пользователя
// 08.09.2026). Значение считает ядро, чтобы шапка и реестр не разошлись.
//
// Подсказка нужна всегда, а не только когда значение обрезано: у .hm b стоит
// многоточие по ширине, и у записи с несколькими литерами хвосты кодов уходят
// за край первыми — а именно они и отличают коды друг от друга.
const eniCodes = (rec) => eniAllOf(rec) || fmtEni(rec.eni);

// Шапка — общая на все типы ОЦ (kernel/ocHead.js): Г-образный блок со сводкой,
// вкладками и шкалой статусов в свободном углу.
function headOC(ctx) {
  const rec = ctx.rec;
  return ocHeadHTML(ctx, {
    meta: [
      { label: 'Тип ОЦ', value: rec.type },
      { label: 'Назначение по ТП', value: rec.purposeTP },
      { label: 'Код ЕНИ', value: eniCodes(rec) },
      { label: 'Адрес', value: rec.address, wide: true },
    ],
    flags: recFlags(rec),
    menu: addOiMenuHTML(rec),
    tabs: ocTabs(canViewAuditLog(rec)),
  });
}

function partiesOC(rec) {
  return `<div class="card t-slate" style="margin-top:12px">
    <div class="card-head" data-card-toggle><span class="card-idx">01</span><h3>Учреждение, собственники и ответственные</h3><span class="hint">редактируется в форме ОЦ</span><span class="chev">▾</span></div>

    <div class="card-body-wrap"><div class="card-pad">
      <!-- g-top: в этой строке поля разной высоты (значение текстом против
           плашек с кнопкой), а .grid по умолчанию равняет по низу — из-за этого
           подписи «Учреждение» и «Подвед» опускались ниже соседних. -->
      <div class="grid g-4 g-top">
        <div class="field"><span class="lbl">Головное учреждение</span><b>${esc(rec.institution)}</b></div>
        <div class="field"><span class="lbl">Подвед</span><b>${esc(rec.podved)}</b></div>
      </div>

      <!-- Стороны — тем же блоком, что в форме ОЦ: раньше шапка держала свою
           копию разметки, и правки доходили только до одной из них. -->
      ${ownersUsersHTML(rec, partyNames())}

      <div class="sec-h">Ответственные (без юриста)</div>
      ${responsiblesHTML(rec)}
    </div></div>
  </div>`;
}

export function viewOC(ctx) {
  const rec = ctx.rec;
  const generalTab = splitWrap(ctx.ui.viewer ? viewerHTML(ctx) : null, partiesOC(rec) + tableOI(ctx));

  return `${headOC(ctx)}

    ${ctx.tab === 'general' ? generalTab
      : ctx.tab === 'audit' && canViewAuditLog(rec) ? auditTab(ctx)
      : photosTab(ctx)}`;
}
