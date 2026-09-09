import { ocTypes, previewOcTypeChange, changeOcType } from '../../../kernel/typeChange.js';
import { bindPickSearch } from '../../../kernel/pickSearch.js';
import { podvedNamesOf } from '../../../kernel/institutions.js';
import { syncOcAddress, ocFullAddress, parseAddress } from '../../../kernel/address.js';
import { plural, ENI_LENGTHS } from '../../../kernel/fmt.js';
import { bindEniField, firstBadEni, eniCodesOf } from '../../../kernel/eniField.js';
import { bindCheckedField, setFieldError } from '../../../kernel/fieldError.js';
import { gpsError } from '../../../kernel/gps.js';
import { pickFile, attachedFileFrom, isFileTooLarge, MAX_DOC_FILE_MB } from '../parts/docs/model.js';
import { parseEni } from '../../../kernel/fmt.js';
import { nextDocId } from '../data/store.js';
import { openDocViewer, VS } from '../parts/viewer/state.js';
import { bindParties } from './parties.ctrl.js';

export function bindOcForm(ctx) {
  const s = ctx.scope;
  const rec = ctx.rec;

  // Смена типа объекта оценки (ТЗ docs/tz/30-uchastok-pravki.md §9).
  //
  // Тип ОЦ — это модуль, в котором живёт запись, поэтому смена типа означает
  // переезд между модулями (kernel/typeChange.js). Перед переездом человек
  // видит списком, чего не будет в новой карточке, и что значения не пропадут.
  const fType = s.$('#fType');
  if (fType) fType.onchange = async () => {
    const toId = fType.value;
    if (!toId || toId === rec.typeId) return;

    const info = await previewOcTypeChange(rec, toId);
    const named = info.lost.filter((f) => f.label);
    const unnamed = info.lost.reduce((n, f) => n + (f.unnamed || 0), 0);
    if (unnamed) named.push({ label: `И ещё ${unnamed} ${plural(unnamed, 'поле', 'поля', 'полей')}`, value: '' });

    const ok = await ctx.host.confirm({
      title: `Сменить тип на «${info.toLabel}»?`,
      text: named.length
        ? 'В новой карточке не показываются:'
        : 'Все заполненные поля показываются и в новом типе.',
      list: named.map((f) => ({ label: f.label, value: f.value })),
      note: `Объектов имущества переедет: ${info.oiCount}. Документов: ${info.docs}. `
        + 'Значения сохранятся и вернутся, если сменить тип обратно.',
      okLabel: 'Сменить тип',
    });

    if (!ok) { fType.value = rec.typeId; return; }

    const res = changeOcType(rec, toId);
    if (!res) {
      fType.value = rec.typeId;
      ctx.toast('Сменить тип не удалось', 'warn');
      return;
    }

    ctx.toast(`Тип изменён: ${info.toLabel}`, 'ok');
    location.hash = `#/oc/${encodeURIComponent(toId)}/${encodeURIComponent(rec.id)}`;
  };

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

  const save = s.$('#btnSaveOc');
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
    // Кодов может быть несколько: eni — первый (его читают архив и
    // документы), eniList — все.
    const eniCodes = eniCodesOf(s.$('#fEni').value);
    rec.eni = eniCodes[0] || '';
    rec.eniList = eniCodes;
    // Учреждение и подвед выбираются из дерева (kernel/pickSearch.js) и
    // записываются сразу при выборе — здесь их брать неоткуда.
    // Адрес записи больше не вводится строкой: у объекта оценки общая часть
    // (город, район, микрорайон), улица с домом — у каждого ОИ. Собранное
    // значение держим в rec.address, его читают реестр, поиск, архив и лог
    // (kernel/address.js).
    // Блок «Местоположение»: адрес целиком у записи, включая улицу с домом —
    // в объектах имущества этих полей больше нет (решение 09.09.2026).
    rec.region = s.$('#fRegion').value.trim();
    rec.city = s.$('#fCity').value.trim();
    rec.district = s.$('#fDistrict').value.trim();
    rec.micro = s.$('#fMicro').value.trim();
    rec.street = s.$('#fStreet').value.trim();
    rec.house = s.$('#fHouse').value.trim();
    rec.flat = s.$('#fFlat').value.trim();
    syncOcAddress(rec);
    rec.gps = s.$('#fGps').value.trim();
    rec.complex = !!(s.$('#fComplex') && s.$('#fComplex').checked);
    rec.updatedAt = ctx.today;

    ctx.navigate({ rest: [] });
    ctx.toast('ОЦ сохранён', 'ok');
  };

  // Стороны и документы в форме — те же обработчики, что и в карточке.
  s.$$('[data-resp]').forEach((sel) => sel.onchange = () => {
    rec.resp[sel.dataset.resp] = sel.value;
    ctx.toast('Ответственный обновлён', 'ok');
  });
  // Собственники и пользователи: строки с наименованием и долей, добавление на
  // месте (parties.ctrl.js). До 09.09.2026 сторону заводили через диалог, доли
  // не было вовсе, а обработчики лежали тремя копиями — здесь, в форме ОЦ и в
  // форме создания.
  bindParties(ctx, rec);

  s.$$('[data-open-doc]').forEach((tr) => tr.onclick = (e) => {
    if (e.target.closest('[data-doc-del]')) return;
    openDocViewer(ctx, 'oc', tr.dataset.openDoc);
  });

  // Адрес записи и поля местоположения — одно значение с двух сторон.
  //
  // Вниз: правишь область или улицу — строка адреса пересобирается по ходу
  // ввода, иначе человек правит поле, а адрес показывает прежнее.
  //
  // Вверх: вставил адрес целиком — что распозналось, раскидывается по полям
  // (требование пользователя 09.09.2026). Разбирает kernel/address.js; поля,
  // которых в строке нет, остаются как были — пустое поле честнее угаданного
  // неверно.
  const PARTS = {
    region: '#fRegion',
    district: '#fDistrict',
    city: '#fCity',
    micro: '#fMicro',
    street: '#fStreet',
    house: '#fHouse',
    flat: '#fFlat',
  };

  const addrSum = s.$('[data-addr-sum]');
  if (addrSum) {
    const valuesOf = () => {
      const out = {};
      Object.entries(PARTS).forEach(([key, sel]) => {
        out[key] = (s.$(sel) || {}).value || '';
      });
      return out;
    };

    const redrawAddr = () => {
      addrSum.value = ocFullAddress(Object.assign({}, rec, valuesOf()));
    };

    Object.values(PARTS).forEach((sel) => {
      const el = s.$(sel);
      if (el) el.oninput = redrawAddr;
    });

    // Разбор — на change, а не на каждый символ: пока адрес набирают, части
    // ещё не дописаны, и поля прыгали бы на каждой букве.
    addrSum.onchange = () => {
      const parsed = parseAddress(addrSum.value);
      Object.entries(PARTS).forEach(([key, sel]) => {
        const el = s.$(sel);
        if (el && parsed[key]) el.value = parsed[key];
      });
      redrawAddr();
    };
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
