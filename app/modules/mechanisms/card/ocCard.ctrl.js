import { archiveRecord } from '../../../kernel/archive.js';
import { bindDocsColumns } from '../parts/docs/table.js';
import { bindAuditTab } from '../audit/ctrl.js';
import { openDocViewer } from '../parts/viewer/state.js';

// Контроллер карточки ОЦ. Заметно проще, чем у остальных модулей: нет
// объектов имущества, поэтому нет ни добавления/удаления ОИ, ни перетаскивания
// литер по участкам, ни столбцов перечня ОИ, ни всплывающего окна фото.
export function bindOcCard(ctx) {
  const s = ctx.scope;
  const rec = ctx.rec;

  if (ctx.tab === 'audit') bindAuditTab(ctx);

  // --- Вкладки ------------------------------------------------------------
  s.$$('[data-tab]').forEach((b) => b.onclick = () => {
    const tab = b.dataset.tab;

    // Закрыт крестиком — вкладки его не возвращают: открыть можно только
    // закладкой «Документы» (как блок заметок).
    if (ctx.ui.viewerClosed) {
      ctx.ui.viewer = null;
      ctx.navigate({ rest: [], query: tab === 'general' ? {} : { tab } });
      return;
    }

    if (tab === 'docs') {
      ctx.ui.viewer = { mode: 'doc' };
      const docs = rec.docs || [];
      if (!ctx.ui.viewerDoc && docs.length) ctx.ui.viewerDoc = { scope: 'oc', id: docs[0].id };
    } else {
      ctx.ui.viewer = null;
    }

    ctx.navigate({ rest: [], query: tab === 'general' ? {} : { tab } });
  });

  // --- Шапка ОЦ -------------------------------------------------------------
  const be = s.$('#btnEditOc');
  if (be) be.onclick = () => {
    ctx.ui.viewer = { mode: 'doc' };
    ctx.ui.viewerDoc = null;
    ctx.navigate({ rest: ['form'] });
  };

  const bd = s.$('#btnDelOc');
  if (bd) bd.onclick = async () => {
    // Не удаление: объект уезжает в архив вместе с документами, откуда его
    // можно вернуть целиком (ТЗ docs/tz/20-arhiv.md, §4.2). Объектов
    // имущества здесь нет — упоминать их в тексте подтверждения незачем.
    const ok = await ctx.host.confirm({
      title: 'Убрать объект оценки в архив?',
      text: `Вместе с «${rec.address}» уедут все документы. Вернуть можно из архива целиком.`,
      okLabel: 'В архив',
    });
    if (!ok) return;

    archiveRecord({ typeId: ctx.manifest.id, typeLabel: ctx.manifest.label, rec, today: ctx.today });
    ctx.host.toMenu();
    ctx.toast('Убрано в архив: объект оценки');
  };

  // --- Стороны --------------------------------------------------------------
  s.$$('[data-resp]').forEach((sel) => sel.onchange = () => {
    rec.resp[sel.dataset.resp] = sel.value;
    ctx.toast('Ответственный обновлён', 'ok');
  });

  s.$$('[data-owner-rm]').forEach((x) => x.onclick = (e) => {
    e.stopPropagation();
    rec.owners.splice(+x.dataset.ownerRm, 1);
    ctx.render();
  });

  s.$$('[data-user-rm]').forEach((x) => x.onclick = (e) => {
    e.stopPropagation();
    rec.users.splice(+x.dataset.userRm, 1);
    ctx.render();
  });

  s.$$('[data-add-party]').forEach((b) => b.onclick = async () => {
    const isOwner = b.dataset.addParty === 'owner';
    const who = isOwner ? 'Собственник' : 'Пользователь';
    const v = await ctx.host.prompt({ title: who, label: 'ФИО или организация', placeholder: 'Наименование' });
    if (!v) return;
    (isOwner ? rec.owners : rec.users).push(v);
    ctx.render();
    ctx.toast(who + ' добавлен', 'ok');
  });

  // --- Документы ОЦ -----------------------------------------------------------
  s.$$('[data-open-doc]').forEach((tr) => tr.onclick = (e) => {
    if (e.target.closest('[data-doc-del]')) return;
    openDocViewer(ctx, 'oc', tr.dataset.openDoc);
  });

  bindDocsColumns(s);
}
