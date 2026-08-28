import { flagBadgesHTML } from '../../../kernel/flagBadges.js';
import { recFlags } from '../records.js';
import { fmtEni } from '../../../kernel/fmt.js';
import { esc } from '../../../kernel/dom.js';
import { cardMeta } from '../oi/registry.js';

// Контекстная плашка над карточкой. Данные для чипов даёт метаданные
// карточки ОИ — плашка не знает, какие бывают виды ОИ.
// Действия карточки литеры живут в самой плашке (решение пользователя
// 28.08.2026): отдельная строка кнопок под ней дублировала их и занимала место.
// Сохранение и отмена — значками: в плашке тесно, а смысл читается по форме
// (дискета, стрела назад). Удаление — словами и красным: оно необратимо, и
// значок для него слишком тих.
const ICON_SAVE = `<svg viewBox="0 0 14 14" width="16" height="16" aria-hidden="true">
  <path d="M2.2 2.2h7.3l2.3 2.3v7.3H2.2z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
  <path d="M4.6 2.2v3.2h4.5V2.2M4.6 11.8V8.3h4.8v3.5"
    fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
</svg>`;

const ICON_BACK = `<svg viewBox="0 0 14 14" width="16" height="16" aria-hidden="true">
  <path d="M11.5 7H3M6.2 3.5 2.7 7l3.5 3.5"
    fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

export function ctxPlate(ctx) {
  if (ctx.view === 'oi' && ctx.oi) {
    const oi = ctx.oi;
    const meta = cardMeta(oi);
    const chips = meta.plateChips(oi).join('');

    return `<div class="ctx-plate ctx-oi">
        <span class="ctx-kind">${meta.plateKind}</span>
        <b>${meta.hasLetter ? 'Литера ' + esc(oi.letter) + ' · ' : ''}${esc(oi.name)}</b>
        <span class="ctx-chip ctx-plate-eni" title="Код ЕНИ — правится в шапке блока «Общие параметры»">
          <label>ЕНИ</label>
          <b class="mono">${esc(fmtEni(oi.eni))}</b></span>
        <span class="ctx-chip ctx-plate-addr ell" title="${esc(ctx.rec.address)}">${esc(ctx.rec.address)}</span>
        ${chips}
        ${flagBadgesHTML(recFlags(ctx.rec))}
        <span class="ctx-actions">
          <button class="btn btn-danger btn-sm ctx-del" data-del-oi="${esc(oi.id)}"
            title="Удалить литеру — действие нельзя отменить">Удалить литеру</button>
          <button class="ctx-act primary" data-save-oi title="Сохранить">${ICON_SAVE}</button>
          <button class="ctx-act" data-back title="Отмена — вернуться к объекту оценки">${ICON_BACK}</button>
        </span>
      </div>`;
  }

  if (ctx.view === 'form') {
    return `<div class="ctx-plate ctx-form"><span class="ctx-kind">Редактирование</span><b>ОЦ · ${esc(ctx.rec.type)}</b><span class="ctx-chip">${esc(ctx.rec.address)}</span><span class="ctx-chip">${esc(ctx.rec.status)}</span></div>`;
  }

  return null;
}

export function updatePlate(ctx) {
  const w = ctx.scope.$('#ctxPlateWrap');
  if (!w) return;
  const h = ctxPlate(ctx);
  w.innerHTML = h || '';
  w.style.display = h ? '' : 'none';

  bindPlateActions(ctx, w);

  // Высота плашки могла измениться (длинный ЕНИ или адрес переносит её на две
  // строки). От неё считаются и высота просмотрщика, и положение закладок —
  // пересчитываем сразу, а не ждём прокрутки.
  if (ctx.scope.syncStickyHead) ctx.scope.syncStickyHead();
}

// Действия карточки литеры живут в плашке, а она перерисовывается сама по себе —
// поэтому слушатели вешаются здесь, а не в контроллере карточки: иначе после
// первой же правки поля кнопки оставались бы на выброшенных узлах.
export function bindPlateActions(ctx, box) {
  const w = box || ctx.scope.$('#ctxPlateWrap');
  if (!w) return;

  const del = w.querySelector('[data-del-oi]');
  if (del) del.onclick = async (e) => {
    e.stopPropagation();
    await ctx.deleteOi(del.dataset.delOi);
  };

  const save = w.querySelector('[data-save-oi]');
  if (save) save.onclick = () => {
    ctx.ui.letterEdit = false;
    ctx.resetViewer();
    ctx.navigate({ rest: [] });
    ctx.toast('ОИ сохранён', 'ok');
  };
}
