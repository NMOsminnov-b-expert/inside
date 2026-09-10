import { bindEniField, firstBadEni, eniCodesOf } from '../../../kernel/eniField.js';
import { bindCheckedField, setFieldError } from '../../../kernel/fieldError.js';
import { gpsError } from '../../../kernel/gps.js';
import { bindPickSearch } from '../../../kernel/pickSearch.js';
import { podvedNamesOf } from '../../../kernel/institutions.js';
import { syncOcAddress, ocFullAddress, parseAddress } from '../../../kernel/address.js';
import { pickFile, attachedFileFrom, isFileTooLarge, MAX_DOC_FILE_MB } from '../parts/docs/model.js';
import { parseEni, ENI_LENGTHS } from '../../../kernel/fmt.js';
import { nextDocId } from '../data/store.js';
import { openDocViewer, VS } from '../parts/viewer/state.js';
import { bindParties } from './parties.ctrl.js';
import { bindCadastre, ADDR_PARTS, setAddrField } from './cadastre.ctrl.js';

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
  // onCommit обязателен: без него код остаётся только в поле, и запись узнаёт о
  // нём лишь по кнопке «Сохранить» — до тех пор перезагрузка его теряет.
  bindEniField(s.$('#fEni'), (first, codes) => {
    rec.eni = first;
    rec.eniList = codes;
  });

  // Адрес из портала Кадастра по коду ЕНИ — по кнопке в блоке «Местоположение»
  // (card/cadastre.ctrl.js). Обработчик общий с формой создания.
  bindCadastre(ctx, rec);

  // GPS-координаты: тот же контроль формата, что и у координат ОИ (kernel/gps.js).
  // Поле впоследствии заполняется автоматически, но пока его вводят руками —
  // перепутанные широта и долгота иначе всплывут только на карте.
  bindCheckedField(s.$('#fGps'), gpsError, (v) => { rec.gps = v; });


  // Поля пишутся в запись СРАЗУ, на change, а не только по кнопке «Сохранить».
  // Иначе часть введённого не переживает перезагрузку: сохранение снимает
  // снимок с записи, а в записи этих значений ещё нет (замечание пользователя
  // 09.09.2026 — «при редактировании ОЦ ничего не сохранилось»).
  //
  // Кнопка «Сохранить» остаётся: она проверяет ЕНИ, пересобирает адрес и
  // возвращает к карточке — то есть завершает правку, а не начинает её.
  const LIVE = {
    '#fStatus': (v) => { rec.status = v; },
    '#fRegion': (v) => { rec.region = v; },
    '#fDistrict': (v) => { rec.district = v; },
    '#fCity': (v) => { rec.city = v; },
    '#fMicro': (v) => { rec.micro = v; },
    '#fStreet': (v) => { rec.street = v; },
    '#fHouse': (v) => { rec.house = v; },
    '#fFlat': (v) => { rec.flat = v; },
  };

  Object.entries(LIVE).forEach(([sel, write]) => {
    const el = s.$(sel);
    if (!el) return;
    el.addEventListener('change', () => {
      write(el.value.trim());
      syncOcAddress(rec);
      ctx.updatePlate();
    });
  });

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
    ctx.toast('ОЦ создан', 'ok');
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
  const PARTS = ADDR_PARTS;

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
        if (el && parsed[key]) setAddrField(el, parsed[key]);
        // Значение ставится программно, а change при этом не возникает —
        // поэтому в запись пишем здесь же, иначе разобранный адрес живёт
        // только в полях и не переживает перезагрузку.
        if (parsed[key]) rec[key] = parsed[key];
      });
      syncOcAddress(rec);
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
