import { openDocViewer } from '../parts/viewer/state.js';
import { bindMechList, uid } from '../parts/mechConstructor.js';
import { rememberTemplate, rememberValue } from '../data/fieldTemplates.js';

// Контроллер экрана создания ОЦ. Сознательно отдельный файл от
// ocForm.ctrl.js — см. ocCreateForm.view.js.
export function bindOcCreate(ctx) {
  const s = ctx.scope;
  const rec = ctx.rec;

  rec.mechanisms = (rec.mechanisms && rec.mechanisms.length) ? rec.mechanisms : [{ id: uid(), name: '', qty: 1, cost: 0, fields: [], photos: {} }];
  // Фото механизма открывается общим просмотрщиком записи (parts/viewer/*),
  // тем же, что и у документов, — не отдельным лайтбоксом (задача
  // пользователя 07.09.2026: «возьми просмотрщик с других карточек»).
  bindMechList(s, rec.mechanisms, () => ctx.render(), (mech, idx) => {
    ctx.ui.viewer = { mode: 'photo' };
    ctx.ui.viewerPhotoTarget = mech;
    ctx.ui.viewerPhotoJumpIdx = idx;
    ctx.ui.viewerClosed = false;
    ctx.render();
  });

  const save = s.$('#btnCreateOc');
  if (save) save.onclick = () => {
    // Подпись поля обязательна (задача пользователя) — пустая уже подсвечена
    // в fieldRowHTML, здесь только не даём уйти с сохранением, пока не
    // заполнено.
    if (rec.mechanisms.some((mech) => mech.fields.some((f) => !String(f.label || '').trim()))) {
      ctx.toast('Заполните подпись у всех добавленных полей', 'warn');
      return;
    }

    rec.status = s.$('#fStatus').value;
    rec.institution = s.$('#fInst').value;
    rec.podved = s.$('#fPodved').value;
    rec.address = s.$('#fAddr').value;
    rec.city = rec.address.includes('Ош') ? 'Ош' : 'Бишкек';
    rec.updatedAt = ctx.today;

    rec.mechanisms.forEach((mech) => {
      rememberTemplate(mech.name, mech.fields.map((f) => f.label));
      mech.fields.forEach((f) => { if (f.value) rememberValue(f.label, f.value); });
    });

    ctx.navigate({ rest: [] });
    ctx.toast('ОЦ создан', 'ok');
  };

  // Стороны и документы в форме — те же обработчики, что и в карточке.
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

  s.$$('[data-open-doc]').forEach((tr) => tr.onclick = (e) => {
    if (e.target.closest('[data-doc-del]')) return;
    openDocViewer(ctx, 'oc', tr.dataset.openDoc);
  });
}
