import { bindEniField } from '../../../../kernel/eniField.js';
import { bindYearField } from '../../../../kernel/yearField.js';
import { pickFile, attachedFileFrom, isFileTooLarge, MAX_DOC_FILE_MB } from '../../parts/docs/model.js';
import { bindAreaList } from '../../../../kernel/areaList.js';
import { bindDocsColumns } from '../../parts/docs/table.js';
import { bindStruct } from '../../parts/struct/ms.js';
import { parseEni } from '../../../../kernel/fmt.js';
import { bindSpecials } from '../../parts/specials/ctrl.js';
import { buildFloors, recalcFloors, addFloorRow, removeFloorRow, renameFloorRow } from './floors.model.js';
import { updateFloorsUI, rerenderFloors } from './floors.view.js';
import { updateHeatingUI, bindHeating } from './heating.js';
import { photoPages, addPhotoFile } from '../../parts/photos/model.js';
import { openDocViewer, openPhotoInPlace, VS } from '../../parts/viewer/state.js';
import { nextId, nextDocId } from '../../data/store.js';

export function bind(ctx, oi) {
  bindYearField(ctx, oi);

  // Планировки правятся прямо в строке. Слушатели прямые: карточка
  // перепривязывается на каждой отрисовке, делегированные накапливались бы.
  ctx.scope.$$('[data-plan-name]').forEach((inp) => {
    inp.oninput = () => {
      const pl = (oi.plans || []).find((x) => x.id === inp.dataset.planName);
      if (pl) pl.name = inp.value;
    };
  });
  ctx.scope.$$('[data-plan-date]').forEach((inp) => {
    inp.oninput = () => {
      const pl = (oi.plans || []).find((x) => x.id === inp.dataset.planDate);
      if (pl) pl.date = inp.value;
    };
  });
  bindAreaList(ctx, oi.apartment, 'loggias');
  bindAreaList(ctx, oi.apartment, 'balconies');
  bindAreaList(ctx, oi.apartment, 'terraces');
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

  s.$$('[data-height]').forEach((i) => i.onchange = () => {
    oi.heights = oi.heights || {};
    oi.heights[i.dataset.height] = i.value;
  });

  // Слушатели развёртки вынесены в функцию: rerenderFloors заменяет разметку
  // блока целиком, и без повторной привязки чекбоксы и поля площадей остаются
  // на выброшенных узлах — то есть перестают работать после смены этажности
  // или добавления мансарды.
  const redrawFloors = () => { rerenderFloors(ctx, oi); bindFloors(); };

  // Количество надземных этажей — производное от состава развёртки: строку
  // могли добавить или убрать прямо в таблице.
  // У квартиры счётчик этажей живёт не в развёртке, а в общих параметрах —
  // поле «Кол-во этажей квартиры». Держим его в согласии с составом надземных
  // строк, иначе после добавления этажа в таблице оно врало бы.
  const syncFloorsCount = () => {
    apt().storeys = String(oi.floors);
    const el = ctx.scope.$('[data-apt-storeys]');
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

  s.$$('[data-status]').forEach((sel) => sel.onchange = () => { oi.status = sel.value; ctx.updatePlate(); });

  const nm = s.$('[data-oi-name]');
  if (nm) nm.onchange = () => { oi.name = nm.value; ctx.updatePlate(); };
  // ЕНИ правится в шапке карточки (плашке): он одинаково нужен и в общих
  // параметрах, и при вводе любых значений, а место в форме занимал зря.
  // Из поля приходит маска — в данные кладём цифры (kernel/fmt.js).
  // Код ЕНИ: маска и проверка длины в самом поле (kernel/eniField.js). В данные
  // попадает только корректный код — неверный остаётся в поле подсвеченным,
  // чтобы его исправили, а не потеряли.
  bindEniField(s.$('[data-head-eni]') || s.$('[data-land-eni]'), (digits) => {
    oi.eni = digits;
    ctx.updatePlate();
  });

  // --- Поля квартиры ------------------------------------------------------
  const apt = () => (oi.apartment = oi.apartment || {});

  const bindApt = (selector, key) => {
    const el = s.$(selector);
    if (el) el.onchange = () => { apt()[key] = el.value; };
  };

  bindApt('[data-apt-floor]', 'floor');
  bindApt('[data-apt-building-floors]', 'buildingFloors');
  bindApt('[data-apt-rooms]', 'rooms');
  // Серия — справочник; «Прочее» открывает поле ручного ввода, поэтому нужна
  // перерисовка (от значения зависит видимость поля). Тот же приём, что у прав
  // и назначения участка.
  const series = s.$('[data-apt-series]');
  if (series) series.onchange = () => {
    const a = apt();
    a.series = series.value;
    if (a.series !== 'Прочее') a.seriesOther = '';
    ctx.render();
  };

  const seriesOther = s.$('[data-apt-series-other]');
  if (seriesOther) seriesOther.onchange = () => { apt().seriesOther = seriesOther.value; };

  // Этажность квартиры управляет наличием поэтажной развёртки.
  const aptStoreys = s.$('[data-apt-storeys]');
  if (aptStoreys) aptStoreys.onchange = () => {
    // Ноль допустим: квартира бывает целиком в подвале или мансарде (Л4.3) —
    // тогда надземных этажей у неё нет вовсе.
    const val = Math.max(0, Math.min(30, parseInt(aptStoreys.value, 10) || 0));
    aptStoreys.value = val;
    apt().storeys = String(val);
    oi.floors = val;
    buildFloors(oi);
    ctx.render();
    ctx.updatePlate();
  };

  // Положение на этаже: select + условный ручной ввод.
  const locSel = s.$('[data-apt-location]');
  if (locSel) locSel.onchange = () => {
    const a = apt();
    a.location = locSel.value;
    const other = s.$('[data-apt-location-other]');
    if (other) {
      other.style.display = a.location === 'Прочее' ? '' : 'none';
      if (a.location !== 'Прочее') { other.value = ''; a.locationOther = ''; }
    }
  };

  const locOther = s.$('[data-apt-location-other]');
  if (locOther) locOther.onchange = () => { apt().locationOther = locOther.value; };

  // Права на строение: select + условный ручной ввод.
  const rightsSel = s.$('[data-apt-rights]');
  if (rightsSel) rightsSel.onchange = () => {
    const a = apt();
    a.rights = rightsSel.value;
    const other = s.$('[data-apt-rights-other]');
    if (other) {
      other.style.display = a.rights === 'Иное' ? '' : 'none';
      if (a.rights !== 'Иное') { other.value = ''; a.rightsOther = ''; }
    }
  };

  const rightsOther = s.$('[data-apt-rights-other]');
  if (rightsOther) rightsOther.onchange = () => { apt().rightsOther = rightsOther.value; };

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
      s.$$('.ms-drop').forEach((d) => d.hidden = true);
      s.$$('.ms-control').forEach((mc) => mc.classList.remove('open'));
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

  // --- Планировки -----------------------------------------------------------
  const ap = s.$('[data-add-plan]');
  if (ap) ap.onclick = () => {
    (oi.plans = oi.plans || []).push({ id: nextId('pl'), name: 'Новая планировка', date: ctx.today });
    ctx.render();
    ctx.toast('Планировка добавлена', 'ok');
  };

  s.$$('[data-plan-del]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const i = (oi.plans || []).findIndex((pl) => pl.id === b.dataset.planDel);
    if (i >= 0) oi.plans.splice(i, 1);
    ctx.render();
    ctx.toast('Планировка удалена');
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
