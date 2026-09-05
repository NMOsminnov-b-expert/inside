import { bindEniField, firstBadEni } from '../../../kernel/eniField.js';
import { bindCheckedField, setFieldError } from '../../../kernel/fieldError.js';
import { gpsError } from '../../../kernel/gps.js';
import { bindPickSearch } from '../../../kernel/pickSearch.js';
import { podvedNamesOf } from '../../../kernel/institutions.js';
import { syncOcAddress, ocFullAddress } from '../../../kernel/address.js';
import { pickFile, attachedFileFrom, isFileTooLarge, MAX_DOC_FILE_MB } from '../parts/docs/model.js';
import { parseEni, ENI_LENGTHS } from '../../../kernel/fmt.js';
import { nextDocId } from '../data/store.js';
import { openDocViewer, VS } from '../parts/viewer/state.js';

// Контроллер экрана создания ОЦ. Сознательно отдельный файл от
// ocForm.ctrl.js — см. ocCreateForm.view.js.
export function bindOcCreate(ctx) {
  const s = ctx.scope;
  const rec = ctx.rec;

  const fp = s.$('#fPurpose');
  if (fp) fp.onchange = () => { rec.purposeTP = fp.value; ctx.updatePlate(); };

  const complex = s.$('#fComplex');
  if (complex) complex.onchange = () => { rec.complex = complex.checked; };

  // Код ЕНИ: маска и проверка длины прямо в поле, чтобы неверный код было
  // видно до сохранения, а не после выгрузки (kernel/eniField.js).
  bindEniField(s.$('#fEni'));

  // GPS-координаты: тот же контроль формата, что и у координат ОИ (kernel/gps.js).
  // Поле впоследствии заполняется автоматически, но пока его вводят руками —
  // перепутанные широта и долгота иначе всплывут только на карте.
  bindCheckedField(s.$('#fGps'), gpsError, (v) => { rec.gps = v; });

  const save = s.$('#btnCreateOc');
  if (save) save.onclick = () => {
    const bad = firstBadEni(s);
    if (bad) {
      bad.focus();
      ctx.toast(`Проверьте код ЕНИ — в нём должно быть ${ENI_LENGTHS.join(', ')} цифр`, 'warn');
      return;
    }

    const gpsBad = gpsError(s.$('#fGps').value);
    if (gpsBad) {
      setFieldError(s.$('#fGps'), gpsBad);
      s.$('#fGps').focus();
      ctx.toast(gpsBad, 'warn');
      return;
    }

    rec.purposeTP = s.$('#fPurpose').value;
    rec.status = s.$('#fStatus').value;
    rec.eni = parseEni(s.$('#fEni').value);
    // Учреждение и подвед выбираются из дерева (kernel/pickSearch.js) и
    // записываются сразу при выборе — здесь их брать неоткуда.
    // Адрес записи больше не вводится строкой: у объекта оценки общая часть
    // (город, район, микрорайон), улица с домом — у каждого ОИ. Собранное
    // значение держим в rec.address, его читают реестр, поиск, архив и лог
    // (kernel/address.js).
    rec.city = s.$('#fCity').value.trim();
    rec.district = s.$('#fDistrict').value.trim();
    rec.micro = s.$('#fMicro').value.trim();
    syncOcAddress(rec);
    rec.gps = s.$('#fGps').value.trim();
    rec.complex = !!(s.$('#fComplex') && s.$('#fComplex').checked);
    rec.updatedAt = ctx.today;

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

  // Собранный адрес обновляется по ходу ввода: иначе человек правит город, а
  // строка под полями показывает прежнее — и непонятно, что получится.
  const addrSum = s.$('[data-addr-sum]');
  if (addrSum) {
    const redrawAddr = () => {
      const preview = Object.assign({}, rec, {
        city: (s.$('#fCity') || {}).value || '',
        district: (s.$('#fDistrict') || {}).value || '',
        micro: (s.$('#fMicro') || {}).value || '',
      });
      const text = ocFullAddress(preview);
      addrSum.textContent = text
        || 'Заполните город; улица и дом задаются в карточках объектов имущества';
    };
    ['#fCity', '#fDistrict', '#fMicro'].forEach((sel) => {
      const el = s.$(sel);
      if (el) el.oninput = redrawAddr;
    });
  }


  // Учреждение и подвед — выбор из дерева учреждений с поиском. Подвед зависит
  // от учреждения, поэтому после смены учреждения форма перерисовывается: иначе
  // в поле остался бы подвед чужого учреждения (замечание пользователя
  // 05.09.2026 — раньше это были текстовые поля).
  bindPickSearch(s, 'inst', (value) => {
    rec.institution = value;
    if (!podvedNamesOf(value).includes(rec.podved)) rec.podved = '';
    ctx.render();
  });

  bindPickSearch(s, 'podved', (value) => {
    rec.podved = value;
    ctx.render();
  });

}
