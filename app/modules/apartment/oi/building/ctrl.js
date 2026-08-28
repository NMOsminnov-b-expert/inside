import { bindYearField } from '../../../../kernel/yearField.js';
import { bindDocsColumns } from '../../parts/docs/table.js';
import { bindStruct } from '../../parts/struct/ms.js';
import { parseEni } from '../../../../kernel/fmt.js';
import { bindSpecials } from '../../parts/specials/ctrl.js';
import { buildFloors, recalcFloors } from './floors.model.js';
import { updateFloorsUI, rerenderFloors } from './floors.view.js';
import { updateHeatingUI, bindHeating } from './heating.js';
import { photoPages } from '../../parts/photos/model.js';
import { openDocViewer, openPhotoInPlace, VS } from '../../parts/viewer/state.js';
import { nextId } from '../../data/store.js';

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

  const fn = s.$('[data-floors-n]');
  if (fn) fn.onchange = () => {
    oi.floors = Math.max(1, parseInt(fn.value, 10) || 1);
    buildFloors(oi);
    rerenderFloors(ctx, oi);
    ctx.updatePlate();
  };

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

  s.$$('[data-floor-area]').forEach((i) => i.onchange = () => {
    oi.floorList[+i.dataset.floorArea].area = i.value;
    recalcFloors(oi);
    updateFloorsUI(ctx, oi);
  });

  s.$$('[data-floor-hext]').forEach((i) => i.onchange = () => { oi.floorList[+i.dataset.floorHext].hExt = i.value; });
  s.$$('[data-floor-hint]').forEach((i) => i.onchange = () => { oi.floorList[+i.dataset.floorHint].hInt = i.value; });

  // --- Общие параметры ----------------------------------------------------
  const bt = s.$('[data-buildtype]');
  if (bt) bt.onchange = () => { oi.buildType = bt.value; ctx.updatePlate(); };

  const cm = s.$('[data-comment]');
  if (cm) cm.onchange = () => { oi.comment = cm.value; };

  const feat = s.$('[data-features]');
  if (feat) feat.onchange = () => { oi.features = feat.value; };

  const dis = s.$('[data-dis]');
  if (dis) dis.onchange = () => { oi.dis = dis.checked; };

  const cc = s.$('[data-catclass]');
  if (cc) cc.onchange = () => { oi.catClass = cc.value; ctx.render(); };

  const rc = s.$('[data-rescat]');
  // Перерисовка обязательна: от категории зависит состав «Расположения
  // строения» — «Отдельностоящее» доступно только обособленным (Л2.5).
  if (rc) rc.onchange = () => { oi.resCat = rc.value; ctx.render(); };

  // Тип строения: select + условный ручной ввод.
  const skSel = s.$('[data-structure-kind]');
  if (skSel) skSel.onchange = () => {
    oi.structureKind = skSel.value;
    const other = s.$('[data-structure-kind-other]');
    if (other) {
      other.style.display = oi.structureKind === 'Прочее' ? '' : 'none';
      if (oi.structureKind !== 'Прочее') { other.value = ''; oi.structureKindOther = ''; }
    }
  };

  const skOther = s.$('[data-structure-kind-other]');
  if (skOther) skOther.onchange = () => { oi.structureKindOther = skOther.value; };

  // Права на строение: select + условный ручной ввод.
  const rightsSel = s.$('[data-bld-rights]');
  if (rightsSel) rightsSel.onchange = () => {
    oi.rights = rightsSel.value;
    const other = s.$('[data-bld-rights-other]');
    if (other) {
      other.style.display = oi.rights === 'Иное' ? '' : 'none';
      if (oi.rights !== 'Иное') { other.value = ''; oi.rightsOther = ''; }
    }
  };

  const rightsOther = s.$('[data-bld-rights-other]');
  if (rightsOther) rightsOther.onchange = () => { oi.rightsOther = rightsOther.value; };

  // Лоджии и балконы.
  const bindBld = (selector, key) => {
    const el = s.$(selector);
    if (el) el.onchange = () => { oi[key] = el.value; };
  };

  bindBld('[data-bld-loggia-count]', 'loggiaCount');
  bindBld('[data-bld-balcony-count]', 'balconyCount');
  bindBld('[data-bld-loggia-area]', 'loggiaBuildArea');
  bindBld('[data-bld-balcony-area]', 'balconyBuildArea');

  const mt = s.$('[data-mansard-type]');
  if (mt) mt.onchange = () => { oi.mansardType = mt.value; };

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
      s.$$('.ms-drop').forEach((d) => d.hidden = true);
      s.$$('.ms-control').forEach((mc) => mc.classList.remove('open'));
      ctx.ui.heatOpen = false;
    }
    });
  }

  // --- Фото ---------------------------------------------------------------
  s.$$('[data-add-photo]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const cat = b.dataset.addPhoto;
    oi.photos = oi.photos || {};
    oi.photos[cat] = (oi.photos[cat] || 0) + 1;
    ctx.ui.accOpen['ph|' + oi.id + '|' + cat] = true;
    ctx.render();
    ctx.toast('Фото загружено', 'ok');
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
  if (am) am.onclick = () => {
    (oi.docs = oi.docs || []).push({ id: nextId('md'), type: 'ПУД', name: 'Новый документ', date: ctx.today });
    ctx.render();
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
