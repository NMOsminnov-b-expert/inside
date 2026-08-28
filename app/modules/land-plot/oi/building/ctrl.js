import { pickFile, attachedFileFrom, isFileTooLarge, MAX_DOC_FILE_MB } from '../../parts/docs/model.js';
import { bindYearField } from '../../../../kernel/yearField.js';
import { bindDocsColumns } from '../../parts/docs/table.js';
import { bindStruct } from '../../parts/struct/ms.js';
import { parseEni } from '../../../../kernel/fmt.js';
import { bindSpecials } from '../../parts/specials/ctrl.js';
import { buildFloors, recalcFloors, addFloorRow, removeFloorRow, renameFloorRow } from './floors.model.js';
import { updateFloorsUI, rerenderFloors } from './floors.view.js';
import { updateHeatingUI, bindHeating } from './heating.js';
import { photoPages, addPhotoFile } from '../../parts/photos/model.js';
import { openDocViewer, openPhotoInPlace, VS } from '../../parts/viewer/state.js';
import { nextDocId } from '../../data/store.js';

export function bind(ctx, oi) {
  bindYearField(ctx, oi);
  bindDocsColumns(ctx.scope);
  bindSpecials(ctx, oi);
  const s = ctx.scope;

  // --- Площади и этажность -------------------------------------------------
  s.$$('[data-area]').forEach((i) => i.onchange = () => {
    oi.areas[i.dataset.area] = i.value;
    recalcFloors(oi);
    updateFloorsUI(ctx, oi);
    ctx.updatePlate();
  });

  s.$$('[data-height]').forEach((i) => i.onchange = () => { oi.heights[i.dataset.height] = i.value; });

  // Количество этажей: только цифры и разумные границы. Раньше поле принимало
  // что угодно, а любая нечисловая строка молча превращалась в 1 — этаж
  // пропадал вместе с введёнными по нему площадями.
  const fn = s.$('[data-floors-n]');
  if (fn) {
    fn.oninput = () => {
      const clean = fn.value.replace(/\D/g, '').slice(0, 3);
      if (clean !== fn.value) fn.value = clean;
    };
    fn.onchange = () => {
      const n = parseInt(fn.value, 10);
      // Пустое поле — не повод менять состав: оставляем прежнее значение.
      // А вот ноль допустим: бывает объект из одного цоколя и мансарды.
      if (fn.value.trim() === '') { fn.value = oi.floors; return; }

      oi.floors = Math.min(200, Math.max(0, n || 0));
      fn.value = oi.floors;
      buildFloors(oi);
      redrawFloors();
      ctx.updatePlate();
    };
  }

  // Слушатели развёртки вынесены в функцию: rerenderFloors заменяет разметку
  // блока целиком, и без повторной привязки чекбоксы и поля площадей остаются
  // на выброшенных узлах — то есть перестают работать после смены этажности
  // или добавления мансарды.
  const redrawFloors = () => { rerenderFloors(ctx, oi); bindFloors(); };

  // Количество надземных этажей — производное от состава развёртки: строку
  // могли добавить или убрать прямо в таблице.
  const syncFloorsCount = () => {
    const el = ctx.scope.$('[data-floors-n]');
    if (el) el.value = oi.floors;
    ctx.updatePlate();
  };

  function bindFloors() {
    const rd = s.$('[data-redistribute]');
    if (rd) rd.onclick = (e) => {
      e.stopPropagation();
      recalcFloors(oi);
      updateFloorsUI(ctx, oi);
      ctx.toast('Отмеченные этажи выровнены по остатку', 'ok');
    };

    s.$$('[data-floor-on]').forEach((c) => c.onchange = () => {
      oi.floorList[+c.dataset.floorOn].on = c.checked;
      recalcFloors(oi);
      updateFloorsUI(ctx, oi);
    });

    s.$$('[data-cat-all]').forEach((c) => c.onchange = () => {
      const cat = c.dataset.catAll;
      oi.floorList.filter((f) => f.cat === cat).forEach((f) => { f.on = c.checked; });
      recalcFloors(oi);
      updateFloorsUI(ctx, oi);
    });

    // Ключ поля — «<колонка>|<индекс>»: площадей у этажа три, и каждая
    // распределяется от своего итога (см. floors.model.js).
    s.$$('[data-floor-area]').forEach((i) => i.onchange = () => {
      const [key, idx] = i.dataset.floorArea.split('|');
      oi.floorList[+idx][key] = i.value;
      recalcFloors(oi);
      updateFloorsUI(ctx, oi);
    });

    s.$$('[data-floor-hext]').forEach((i) => i.onchange = () => { oi.floorList[+i.dataset.floorHext].hExt = i.value; });
    s.$$('[data-floor-hint]').forEach((i) => i.onchange = () => { oi.floorList[+i.dataset.floorHint].hInt = i.value; });

    // Название строки правится вручную: этажи бывают «−1», подвалов и цоколей
    // может быть несколько. Перерисовки не делаем — сбился бы курсор в поле.
    s.$$('[data-floor-name]').forEach((inp) => inp.onchange = () => {
      renameFloorRow(oi, +inp.dataset.floorName, inp.value);
    });

    // Тип у каждой мансардной строки: мансарда и полумансарда бывают в одном
    // здании, поэтому одного поля на литеру не хватает (Л5.3).
    s.$$('[data-floor-mansard]').forEach((sel) => sel.onchange = () => {
      oi.floorList[+sel.dataset.floorMansard].mansardType = sel.value;
    });

    // Строку любой категории можно добавить и убрать: состав развёртки задаёт
    // человек, а не формула. Поле «Количество этажей» после этого пересчитано
    // по надземным строкам, поэтому обновляем и его.
    s.$$('[data-add-floor]').forEach((b) => b.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      addFloorRow(oi, b.dataset.addFloor);
      redrawFloors();
      syncFloorsCount();
    });

    s.$$('[data-del-floor]').forEach((b) => b.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeFloorRow(oi, +b.dataset.delFloor);
      redrawFloors();
      syncFloorsCount();
    });
  }

  bindFloors();

  // --- Общие параметры ----------------------------------------------------
  // Перерисовка обязательна: от расположения зависит список категорий
  // жилого строения (обособленный бывает только у отдельностоящего).
  const bt = s.$('[data-buildtype]');
  if (bt) bt.onchange = () => {
    oi.buildType = bt.value;
    // Категория, не подходящая новому расположению, сбрасывается: держать её
    // молча означало бы хранить противоречие в данных.
    const detached = oi.buildType === 'Отдельностоящее';
    if (detached && oi.resCat && oi.resCat !== 'Обособленный') oi.resCat = 'Обособленный';
    if (!detached && oi.resCat === 'Обособленный') oi.resCat = '';
    ctx.updatePlate();
    ctx.render();
  };

  const cm = s.$('[data-comment]');
  if (cm) cm.onchange = () => { oi.comment = cm.value; };

  const dis = s.$('[data-dis]');
  if (dis) dis.onchange = () => { oi.dis = dis.checked; };

  const cc = s.$('[data-catclass]');
  if (cc) cc.onchange = () => { oi.catClass = cc.value; ctx.render(); };

  const rc = s.$('[data-rescat]');
  // Перерисовка обязательна: от категории зависит состав «Расположения
  // строения» — «Отдельностоящее» доступно только обособленным (Л2.5).
  if (rc) rc.onchange = () => { oi.resCat = rc.value; ctx.render(); };

  s.$$('[data-status]').forEach((sel) => sel.onchange = () => { oi.status = sel.value; ctx.updatePlate(); });

  const nm = s.$('[data-oi-name]');
  if (nm) nm.onchange = () => { oi.name = nm.value; ctx.updatePlate(); };
  // ЕНИ правится в шапке карточки (плашке): он одинаково нужен и в общих
  // параметрах, и при вводе любых значений, а место в форме занимал зря.
  // Из поля приходит маска — в данные кладём цифры (kernel/fmt.js).
  const en = s.$('[data-plate-eni]');
  if (en) en.onchange = () => {
    oi.eni = parseEni(en.value) || oi.eni;
    ctx.updatePlate();
  };

  s.$$('[data-flag]').forEach((c) => c.onchange = () => {
    oi.flags = oi.flags || {};
    oi.flags[c.dataset.flag] = c.checked;
    ctx.render();
  });

  // --- Конструктивный состав ----------------------------------------------
  bindStruct(ctx, oi);

  // --- Отопление ----------------------------------------------------------
  s.$$('[data-ms-toggle]').forEach((c) => c.onclick = (e) => {
    e.stopPropagation();
    const drop = c.parentElement.querySelector('.ms-drop');
    s.$$('.ms-drop').forEach((d) => { if (d !== drop) d.hidden = true; });
    s.$$('.ms-control').forEach((mc) => { if (mc !== c) mc.classList.remove('open'); });
    drop.hidden = !drop.hidden;
    c.classList.toggle('open', !drop.hidden);
    ctx.ui.heatOpen = !drop.hidden;
  });

  bindHeating(ctx, oi);

  // Закрытие списков по клику вне них. Вешается ОДИН раз на скоуп: контроллер
  // перепривязывается на каждой отрисовке, а документные слушатели снимаются
  // только при уходе с экрана — иначе они копились бы всю сессию.
  if (!s.root.dataset.msOutsideBound) {
    s.root.dataset.msOutsideBound = '1';
    s.onDocument('click', (e) => {
    if (!e.target.closest('.ms')) {
      s.$$('.ms-control').forEach((mc) => mc.classList.remove('open'));
      s.$$('.ms-drop').forEach((d) => d.hidden = true);
      ctx.ui.heatOpen = false;
    }
    });
  }

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
    const file = await pickFile();
    if (!file) return;
    if (isFileTooLarge(file)) { ctx.toast(`Файл слишком большой (максимум ${MAX_DOC_FILE_MB} МБ)`, 'warn'); return; }
    oi.docs = oi.docs || [];
    const doc = { id: nextDocId(ctx.rec), type: 'ПУД', name: file.name, date: ctx.today, file: await attachedFileFrom(file) };
    oi.docs.push(doc);
    openDocViewer(ctx, oi.id, doc.id);
    ctx.toast('Документ добавлен', 'ok');
  };

  s.$$('[data-open-ocdocs]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const tabs = VS.openTabs['oc'] || [];
    const docs = ctx.rec.docs || [];
    openDocViewer(ctx, 'oc', tabs.length ? tabs[tabs.length - 1] : (docs[0] ? docs[0].id : null));
  });

  // --- Литера -------------------------------------------------------------
  const elBtn = s.$('[data-edit-letter]');
  if (elBtn) elBtn.onclick = () => {
    ctx.ui.letterEdit = true;
    ctx.render();
    const i = ctx.scope.$('[data-letter-input]');
    if (i) { i.focus(); i.select(); }
  };

  const ls = s.$('[data-letter-save]');
  if (ls) ls.onclick = () => {
    const inp = s.$('[data-letter-input]');
    const v = (inp ? inp.value : '').trim();
    if (!v || v === oi.letter) { ctx.ui.letterEdit = false; ctx.render(); return; }
    const taken = ctx.rec.oi.some((o) => o !== oi && o.card !== 'land' && o.letter === v);
    if (taken) { ctx.toast('Литера занята', 'warn'); return; }
    oi.letter = v;
    ctx.ui.letterEdit = false;
    ctx.render();
    ctx.toast('Литера переименована', 'ok');
  };

  const lc = s.$('[data-letter-cancel]');
  if (lc) lc.onclick = () => { ctx.ui.letterEdit = false; ctx.render(); };

  // --- Удаление и сохранение ---------------------------------------------
  s.$$('[data-del-oi]').forEach((b) => b.onclick = async (e) => {
    e.stopPropagation();
    await ctx.deleteOi(b.dataset.delOi);
  });

  const sv = s.$('[data-save-oi]');
  if (sv) sv.onclick = () => {
    ctx.ui.letterEdit = false;
    ctx.resetViewer();
    ctx.navigate({ rest: [] });
    ctx.toast('ОИ сохранён', 'ok');
  };
}
