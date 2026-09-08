import { openDocViewer } from '../parts/viewer/state.js';
import { bindMechList, uid } from '../parts/mechConstructor.js';
import { rememberTemplate, rememberValue } from '../data/fieldTemplates.js';

// Контроллер формы редактирования ОЦ. Заметно проще, чем у остальных
// модулей: нет кода ЕНИ (ни маски, ни проверки длины), нет смены типа ОЦ
// (поле #fType здесь всегда заблокировано — см. ocForm.view.js), нет
// чекбокса «Имущественный комплекс». Вместо этого — конструктор полей
// механизмов (parts/mechConstructor.js), теперь СПИСКОМ: одна запись ОЦ
// может описывать несколько единиц техники сразу.
export function bindOcForm(ctx) {
  const s = ctx.scope;
  const rec = ctx.rec;

  rec.mechanisms = (rec.mechanisms && rec.mechanisms.length) ? rec.mechanisms : [{ id: uid(), name: '', qty: 1, fields: [] }];
  bindMechList(s, rec.mechanisms, () => ctx.render());

  const save = s.$('#btnSaveOc');
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

    // Название и подписи полей уходят в историю конструктора (data/fieldTemplates.js) —
    // по каждому механизму записи отдельно: при следующем создании записи с
    // тем же названием шаблон подставится сам, а значения полей появятся в подсказке.
    rec.mechanisms.forEach((mech) => {
      rememberTemplate(mech.name, mech.fields.map((f) => f.label));
      mech.fields.forEach((f) => { if (f.value) rememberValue(f.label, f.value); });
    });

    ctx.navigate({ rest: [] });
    ctx.toast('ОЦ сохранён', 'ok');
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
