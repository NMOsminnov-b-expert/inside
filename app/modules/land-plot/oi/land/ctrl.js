import { bindEniField } from '../../../../kernel/eniField.js';
import { syncOcAddress } from '../../../../kernel/address.js';
import { pickFile, attachedFileFrom, isFileTooLarge, MAX_DOC_FILE_MB } from '../../parts/docs/model.js';
import { bindCheckedField } from '../../../../kernel/fieldError.js';
import { gpsError } from './gps.js';
import { bindDocsColumns } from '../../parts/docs/table.js';
import { bindUtilities } from './utilities.js';
import { bindAuxBuildings } from './buildings.js';
import { photoPages, addPhotoFile } from '../../parts/photos/model.js';
import { openDocViewer, openPhotoInPlace, VS } from '../../parts/viewer/state.js';
import { nextDocId } from '../../data/store.js';
import { DOC_TYPES, LAND_PLAN_DOC_TYPES } from '../../data/dictionaries.js';
import { parseEni } from '../../../../kernel/fmt.js';

export function bind(ctx, oi) {
  bindDocsColumns(ctx.scope);
  const s = ctx.scope;

  const valueBindings = {
    '[data-land-use]': 'useCategory',
    '[data-land-irrigation]': 'irrigation',
    '[data-land-irrigation-type]': 'irrigationType',
    '[data-land-soil]': 'soil',
    '[data-land-bonitet]': 'bonitet',
    '[data-land-stoniness]': 'stoniness',
    '[data-land-gas]': 'gasification',
    '[data-land-central-heating]': 'centralHeating',
    '[data-land-water]': 'centralWater',
    // Электроснабжение и канализация добавлены 04.09.2026 в блок «Инженерные
    // сети»; автономное отопление оттуда убрано (ТЗ §4).
    '[data-land-electricity]': 'electricity',
    '[data-land-sewerage]': 'sewerage',
    // Железнодорожная ветка — у несельхоз-участка (заметки команды).
    '[data-land-railway]': 'railway',

    // Местоположение: свой адрес участка (улица и дом — как у остальных ОИ),
    // координаты и удалённость от райцентра у сельхоза. Крупная зона с
    // микрорайоном уехали в объект оценки (заметки команды 05.09.2026).
    '[data-oi-street]': 'street',
    '[data-oi-house]': 'house',
    '[data-land-distance]': 'distanceToCenter',

    // Благоустройство: ранг и описание вместо двух мультивыборов (ТЗ §6).
    '[data-land-improve-note]': 'improvementNote',

    // Комментарий к сервитуту (ТЗ §2, пункт 1.4).
    '[data-land-encumbrance-note]': 'encumbranceNote',

    '[data-land-location]': 'location',
    '[data-land-road]': 'roadLocation',
    '[data-land-corner]': 'corner',
    '[data-land-relief]': 'relief',
    '[data-land-location-features]': 'locationFeatures',
    '[data-land-encumbrance-area]': 'encumbranceArea',
  };
  Object.entries(valueBindings).forEach(([selector, key]) => {
    const input = s.$(selector);
    if (input) input.onchange = () => { oi[key] = input.value; };
  });

  // Улица и дом участка входят в адрес записи, поэтому после правки собираем
  // его заново: rec.address читают шапка, реестр, поиск и архив
  // (kernel/address.js).
  ['[data-oi-street]', '[data-oi-house]'].forEach((sel) => {
    const input = s.$(sel);
    if (!input) return;
    const prev = input.onchange;
    input.onchange = () => {
      if (prev) prev();
      syncOcAddress(ctx.rec);
      ctx.updatePlate();
    };
  });

  const type = s.$('[data-land-type]');
  if (type) type.onchange = () => { oi.landType = type.value; ctx.render(); };

  // Категория земель — только у несельхоза (ТЗ §2.1), перерисовка не нужна:
  // состав полей от неё не зависит.
  // Координаты: проверка формата (ТЗ §5.1, oi/land/gps.js). Через общий
  // механизм сообщений ядра — тот же, что у кода ЕНИ: перепутанные или
  // оборванные координаты сами себя не проявляют, точка просто окажется не там.
  bindCheckedField(s.$('[data-land-gps]'), gpsError, (v) => { oi.gps = v; });

  // Назначение по правоудостоверяющему документу — справочник с тем же
  // приёмом, что у прав: «Иное» открывает поле ручного ввода, поэтому нужна
  // перерисовка (от значения зависит видимость поля).
  const purpose = s.$('[data-land-purpose]');
  if (purpose) purpose.onchange = () => {
    oi.purpose = purpose.value;
    if (oi.purpose !== 'Иное') oi.purposeOther = '';
    ctx.render();
  };

  const purposeOther = s.$('[data-land-purpose-other]');
  if (purposeOther) purposeOther.onchange = () => { oi.purposeOther = purposeOther.value; };

  // Права — справочник; «Иное» открывает поле ручного ввода (тот же приём, что
  // у прав на строение). Перерисовка нужна: от значения зависит видимость поля.
  const rights = s.$('[data-land-rights]');
  if (rights) rights.onchange = () => {
    oi.rights = rights.value;
    if (oi.rights !== 'Иное') oi.rightsOther = '';
    ctx.render();
  };

  const rightsOther = s.$('[data-land-rights-other]');
  if (rightsOther) rightsOther.onchange = () => { oi.rightsOther = rightsOther.value; };

  const cat = s.$('[data-land-category]');
  if (cat) cat.onchange = () => { oi.landCategory = cat.value; };

  const rank = s.$('[data-land-improve-rank]');
  if (rank) rank.onchange = () => { oi.improvementRank = rank.value; };

  s.$$('[data-land-area]').forEach((input) => input.onchange = () => {
    oi.areas = oi.areas || {};
    oi.areas[input.dataset.landArea] = input.value;
    ctx.updatePlate();
  });

  // Открытие/закрытие любого мультивыбора карточки. Мультивыборов здесь уже
  // три (оснащение и две группы благоустройства), поэтому в ctx.ui хранится
  // КЛЮЧ открытого списка, а не отдельный флаг на каждый — иначе после
  // перерисовки открытым оказывался бы не тот список, что раскрыл человек.
  s.$$('[data-ms-toggle]').forEach((c2) => c2.onclick = (e) => {
    e.stopPropagation();
    const drop = c2.parentElement.querySelector('.ms-drop');
    if (!drop) return;
    s.$$('.ms-drop').forEach((d) => { if (d !== drop) d.hidden = true; });
    s.$$('.ms-control').forEach((mc) => { if (mc !== c2) mc.classList.remove('open'); });
    drop.hidden = !drop.hidden;
    c2.classList.toggle('open', !drop.hidden);
    ctx.ui.msOpen = drop.hidden ? null : c2.dataset.msToggle;
  });

  // Закрытие по клику вне. Вешается ОДИН раз на скоуп: контроллер
  // перепривязывается на каждой отрисовке, а документные слушатели снимаются
  // только при уходе с экрана — иначе они копились бы всю сессию.
  if (!s.root.dataset.msOutsideBound) {
    s.root.dataset.msOutsideBound = '1';
    s.onDocument('click', (e) => {
      if (!e.target.closest('.ms')) {
        s.$$('.ms-control').forEach((mc) => mc.classList.remove('open'));
        s.$$('.ms-drop').forEach((d) => { d.hidden = true; });
        ctx.ui.msOpen = null;
      }
    });
  }

  bindUtilities(ctx, oi);
  bindAuxBuildings(ctx, oi);

  const encumbrance = s.$('[data-land-encumbrance]');
  if (encumbrance) encumbrance.onchange = () => { oi.encumbrance = encumbrance.value; ctx.render(); };

  const buildings = s.$('[data-land-buildings]');
  if (buildings) buildings.onchange = () => { oi.buildings = buildings.value; ctx.render(); };

  const requiredMessage = (input, message) => {
    input.setCustomValidity(input.value.trim() ? '' : message);
    return input.value.trim();
  };

  const nm = s.$('[data-oi-name]');
  if (nm) nm.onchange = () => { oi.name = nm.value; ctx.updatePlate(); };

  // ЕНИ: из поля приходит маска, в данные кладём цифры (kernel/fmt.js) — так
  // же, как в карточках литер. Плашка над карточкой показывает тот же код.
  // Код ЕНИ: маска и проверка длины в самом поле (kernel/eniField.js).
  bindEniField(s.$('[data-land-eni]'), (digits) => {
    oi.eni = digits;
    ctx.render();
  });

  s.$$('[data-del-oi]').forEach((b) => b.onclick = async (e) => {
    e.stopPropagation();
    await ctx.deleteOi(b.dataset.delOi);
  });

  s.$$('[data-status]').forEach((sel) => sel.onchange = () => { oi.status = sel.value; ctx.updatePlate(); });

  s.$$('[data-flag]').forEach((c) => c.onchange = () => {
    oi.flags = oi.flags || {};
    oi.flags[c.dataset.flag] = c.checked;
    ctx.render();
  });

  // Форма участка: «Иное» открывает поле ручного ввода рядом, поэтому смена
  // значения требует перерисовки, а не только записи в данные.
  const formSel = s.$('[data-land-form]');
  if (formSel) formSel.onchange = () => {
    oi.form = formSel.value;
    if (oi.form !== 'Иное') oi.formOther = '';
    ctx.render();
  };

  const formOther = s.$('[data-land-form-other]');
  if (formOther) formOther.oninput = () => { oi.formOther = formOther.value; };

  // --- Фото ---------------------------------------------------------------
  // Настоящая загрузка файла, а не инкремент счётчика: файл кладётся в
  // oi.photoFiles, счётчик увеличивает addPhotoFile (см. parts/photos/model.js).
  s.$$('[data-add-photo]').forEach((b) => b.onclick = async (e) => {
    e.stopPropagation();
    const cat = b.dataset.addPhoto;

    const file = await pickFile('image/*');
    if (!file) return;
    if (isFileTooLarge(file)) { ctx.toast(`Файл слишком большой (максимум ${MAX_DOC_FILE_MB} МБ)`, 'warn'); return; }

    addPhotoFile(oi, cat, await attachedFileFrom(file));
    ctx.ui.accOpen['ph|' + oi.id + '|' + cat] = true;
    ctx.render();
    ctx.toast('Фото загружено: ' + file.name, 'ok');
  });

  s.$$('[data-open-photo]').forEach((p) => p.onclick = (e) => {
    e.stopPropagation();
    const [, rest] = p.dataset.openPhoto.split('|');
    const [cat, i] = rest.split(':');
    const idx = photoPages(oi).findIndex((x) => x.cat === cat && x.i === +i) + 1;
    openPhotoInPlace(ctx, oi.id, idx);
  });

  s.$$('[data-open-pviewer]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    ctx.ui.viewer = { mode: 'photo' };
    ctx.render();
  });

  // --- Документы ----------------------------------------------------------
  s.$$('[data-open-movdoc]').forEach((tr) => tr.onclick = () => {
    const [scope, id] = tr.dataset.openMovdoc.split('|');
    openDocViewer(ctx, scope, id);
  });

  const am = s.$('[data-add-movdoc]');
  if (am) am.onclick = async () => {
    // Тип спрашиваем до файла: у участка свой набор типов (включая планы),
    // и по имени файла его не угадать.
    const type = await ctx.host.select({ title: 'Тип документа', options: [...DOC_TYPES, ...LAND_PLAN_DOC_TYPES] });
    if (!type) return;
    const file = await pickFile();
    if (!file) return;
    if (isFileTooLarge(file)) { ctx.toast(`Файл слишком большой (максимум ${MAX_DOC_FILE_MB} МБ)`, 'warn'); return; }
    oi.docs = oi.docs || [];
    const doc = { id: nextDocId(ctx.rec), type, name: file.name, date: ctx.today, file: await attachedFileFrom(file), pages: null };
    oi.docs.push(doc);
    openDocViewer(ctx, oi.id, doc.id);
    ctx.toast('Документ прикреплён: ' + type, 'ok');
  };

  s.$$('[data-open-ocdocs]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const tabs = VS.openTabs['oc'] || [];
    const docs = ctx.rec.docs || [];
    openDocViewer(ctx, 'oc', tabs.length ? tabs[tabs.length - 1] : (docs[0] ? docs[0].id : null));
  });

  const sv = s.$('[data-save-oi]');
  if (sv) sv.onclick = () => {
    const encArea = s.$('[data-land-encumbrance-area]');
    const buildingType = s.$('[data-land-building-type]');
    const buildingArea = s.$('[data-land-building-area]');
    if (oi.encumbrance === 'Есть' && encArea && !requiredMessage(encArea, 'Укажите площадь сервитутов и обременений')) return encArea.reportValidity();
    if (oi.buildings === 'Есть' && buildingType && !requiredMessage(buildingType, 'Укажите тип построек')) return buildingType.reportValidity();
    if (oi.buildings === 'Есть' && buildingArea && !requiredMessage(buildingArea, 'Укажите площадь построек')) return buildingArea.reportValidity();
    ctx.resetViewer();
    ctx.navigate({ rest: [] });
    ctx.toast('ОИ сохранён', 'ok');
  };
}
