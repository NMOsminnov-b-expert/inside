import { ocHeadHTML, ocTabs } from '../../../kernel/ocHead.js';
import { recFlags } from '../records.js';
import { fmtEni } from '../../../kernel/fmt.js';
import { eniAllOf } from '../../../kernel/eniFold.js';
import { canViewAuditLog } from '../audit/access.js';
import { auditTab } from '../audit/view.js';
import { esc } from '../../../kernel/dom.js';
import { ownersUsersHTML, responsiblesHTML } from './parties.view.js';
import { partyNames } from '../records.js';
import { tableOI } from './oiTable.view.js';
import { capSummaryHTML, ocTypology } from './capSummary.view.js';
import { typologyTip } from './typology.js';
import { comparativeTab } from './comparative.view.js';
import { photosTab } from '../parts/photos/explorer.js';
import { splitWrap, viewerHTML } from '../../../kernel/viewer/shell.js';
import { addOiMenuHTML } from './addOiMenu.js';
import { institutionChain, ownHTML, chainHTML, summaryHTML } from '../../../kernel/contacts.js';

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
  const typology = ocTypology(rec);
  return ocHeadHTML(ctx, {
    meta: [
      // Тип нежилого здания считает система по внутренней площади литер
      // (card/typology.js, решение пользователя 28.09.2026).
      { label: 'Тип ОЦ', value: typology.shown, title: typologyTip(typology) },
      { label: 'Назначение по ТП', value: rec.purposeTP },
      { label: 'Код ЕНИ', value: eniCodes(rec) },
      { label: 'Адрес', value: rec.address, wide: true },
    ],
    flags: recFlags(rec),
    menu: addOiMenuHTML(rec),
    // «Сравнительный подход» — только у гражданского ОЦ (методология «Категории
    // и классы зданий», 25.09.2026); вкладка перед «Логами». СПРЯТАНА: см.
    // COMPARATIVE_HIDDEN ниже.
    tabs: COMPARATIVE_HIDDEN ? ocTabs(canViewAuditLog(rec)) : withComparative(ocTabs(canViewAuditLog(rec))),
  });
}

// ⚠ ЭЛЕМЕНТ ПОД БОЛЬШИМ ВОПРОСОМ. Вкладка «Сравнительный подход»
// (card/comparative.*) спрятана решением пользователя 25.09.2026: «прячем — не
// вырезаем, но прячем… элемент под огромным вопросом. Не лезем внутрь без прямых
// указаний». Код оставлен как есть. НЕ ПРАВИТЬ, НЕ РАЗВИВАТЬ и не открывать
// вкладку, пока пользователь прямо не скажет вернуться к ней (граф:
// decision:sravnitelnyy-podhod). Флаг выключает и вкладку, и маршрут ?tab=comparative.
export const COMPARATIVE_HIDDEN = true;

function withComparative(tabs) {
  const at = tabs.findIndex((t) => t.key === 'audit');
  const tab = { key: 'comparative', label: 'Сравнительный подход' };
  return at < 0 ? tabs.concat(tab) : [...tabs.slice(0, at), tab, ...tabs.slice(at)];
}


// Контакты для связи (решение пользователя 06.10.2026: «чистым интерфейсом,
// но что бы каждый раз контакты не мозолили глаза»). В строке учреждения —
// сводка одной строкой (первый контакт и «и ещё N»), все контакты — по
// нажатию, под строкой: свои контакты объекта и подтянутые от узлов дерева
// учреждений, от подведа вверх (правятся в учреждении). Свободные колонки этой
// строки и так пустовали — сводка места не прибавляет.
const instHref = (node) => `#/institutions?node=${encodeURIComponent(node.id)}&name=${encodeURIComponent(node.name)}&tab=contacts`;

export function contactsUi(ctx) {
  ctx.ui.contacts = ctx.ui.contacts || { open: false, editing: null };
  return ctx.ui.contacts;
}

function contactsRowHTML(ctx) {
  const rec = ctx.rec;
  const ui = contactsUi(ctx);
  const chain = institutionChain(rec.institution, rec.podved);
  const all = [...(rec.contacts || []), ...chain.flatMap((x) => x.contacts)];
  return {
    cell: `<div class="field ct-cell"><span class="lbl">Контакты для связи</span>${summaryHTML(all, { key: 'oc', open: ui.open })}</div>`,
    panel: ui.open ? `<div class="ct-panel">
      ${ownHTML(rec.contacts || [], { key: 'oc', editing: ui.editing })}
      ${chainHTML(chain, instHref)}
    </div>` : '',
  };
}

function partiesOC(ctx) {
  const rec = ctx.rec;
  const ct = contactsRowHTML(ctx);
  // Отступ сверху — как у просмотрщика слева, чтобы верх двух колонок совпадал.
  // Прежние 12px остались от полосы вкладок, которой над блоком больше нет.
  return `<div class="card t-slate" style="margin-top:10px">
    <div class="card-head" data-card-toggle><span class="card-idx">01</span><h3>Учреждение, собственники и ответственные</h3><span class="hint">редактируется в форме ОЦ</span><span class="chev">▾</span></div>

    <div class="card-body-wrap"><div class="card-pad">
      <!-- g-top: в этой строке поля разной высоты (значение текстом против
           плашек с кнопкой), а .grid по умолчанию равняет по низу — из-за этого
           подписи «Учреждение» и «Подвед» опускались ниже соседних. -->
      <div class="grid g-4 g-top">
        <div class="field"><span class="lbl">Головное учреждение</span><b>${esc(rec.institution)}</b></div>
        <div class="field"><span class="lbl">Подвед</span><b>${esc(rec.podved)}</b></div>
        ${ct.cell}
      </div>
      ${ct.panel}

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
  const generalTab = splitWrap(ctx.ui.viewer ? viewerHTML(ctx) : null, partiesOC(ctx) + tableOI(ctx) + capSummaryHTML(ctx));

  // Спрятанная вкладка по прямому адресу открывает «Общие данные».
  const tab = ctx.tab === 'comparative' && COMPARATIVE_HIDDEN ? 'general' : ctx.tab;

  return `${headOC(ctx)}

    ${tab === 'general' ? generalTab
      : ctx.tab === 'audit' && canViewAuditLog(rec) ? auditTab(ctx)
      : ctx.tab === 'comparative' && !COMPARATIVE_HIDDEN ? comparativeTab(ctx)
      : photosTab(ctx)}`;
}
