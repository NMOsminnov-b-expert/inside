import { OI, DOCS, appState, OC } from '../../core/state.js';
import { render } from '../../core/renderer.js';
import { toast } from '../../core/utils.js';
import { nextLetter, createRealtyOi, createLandOi, currentOI, isApartmentOi } from './oiModel.js';
import { buildFloors, buildApartmentFloors, recalcFloors } from './floorsModel.js';
import { updateFloorsUI, rerenderFloors } from './floorsView.js';
import { updateHeatingUI } from './heating.js';
import { openDocViewer, openPhotoInPlace, VS } from '../viewer/viewerState.js';
import { photoPages } from '../photos/photoModel.js';
import { updateCtxPlate } from '../../ui/ctxPlate.js';
import { canAddOiType } from '../oc/ocRules.js';

function renderKeepScroll() {
  const sc = document.getElementById('content');
  const top = sc ? sc.scrollTop : 0;
  render();
  if (sc) sc.scrollTop = top;
}

export function addLetter() {
  const letter = nextLetter();
  const oi = createRealtyOi({ letter, name: 'Новое строение' });
  OI.push(oi);
  appState.openOi = oi.id;
  appState.letterEdit = false;
  appState.viewer = { mode: 'doc' };
  appState.viewerDoc = null;
  appState.view = 'oi';
  render();
  toast('Литера ' + letter + ' добавлена — заполните карточку', 'ok');
}

export function addOi(type) {
  document.querySelectorAll('.dd').forEach((d) => d.classList.remove('open'));
  if (!canAddOiType(type, OC)) {
    toast('Для текущего типа ОЦ этот вид ОИ недоступен', 'warn');
    return;
  }
  if (type === 'МЕХ' || type === 'ОФИС') {
    appState.view = 'mech';
    appState.mechKind = type;
    appState.mechMode = 'mono';
    appState.mechDocs = [];
    appState.viewer = { mode: 'doc' };
    appState.viewerDoc = null;
    render();
    return;
  }
  if (type === 'Земельный участок') {
    if (OI.find((o) => o.kind === 'land')) {
      toast('Земельный участок уже добавлен (один ЕНИ на объект)', 'warn');
      return;
    }
    OI.push(createLandOi());
    appState.openOi = OI[OI.length - 1].id;
    appState.letterEdit = false;
    appState.viewer = { mode: 'doc' };
    appState.viewerDoc = null;
    appState.view = 'oi';
    render();
    return;
  }
  const letter = nextLetter();
  const oi = createRealtyOi({
    letter,
    name: type,
    catClass: type === 'Производственное строение' ? 'Производственно-складское' : 'Гражданское здание',
  });
  OI.push(oi);
  appState.openOi = oi.id;
  appState.letterEdit = false;
  appState.viewer = { mode: 'doc' };
  appState.viewerDoc = null;
  appState.view = 'oi';
  render();
  toast('Литера ' + letter + ' создана', 'ok');
}

export function deleteOi(id) {
  const oi = OI.find((o) => o.id === id);
  if (!oi) return;
  const label = oi.letter ? 'Литера ' + oi.letter : 'ОИ';
  if (!confirm(`Удалить «${label}» (${oi.name})? Действие нельзя отменить.`)) {
    return;
  }
  const i = OI.findIndex((o) => o.id === id);
  if (i >= 0) OI.splice(i, 1);
  if (appState.openOi === id) {
    appState.view = 'oc';
    appState.openOi = null;
    appState.letterEdit = false;
  }
  render();
  toast(label + ' удалён');
}

export function bindOi() {
  const al = document.querySelector('[data-add-letter]');
  if (al) al.onclick = addLetter;

  document.querySelectorAll('[data-del-oi]').forEach((b) => {
    b.onclick = (e) => { e.stopPropagation(); deleteOi(b.dataset.delOi); };
  });

  document.querySelectorAll('tr[data-open-oi]').forEach((tr) => {
    tr.onclick = (e) => {
      const accId = tr.dataset.accId;
      if (accId && (e.target.closest('[data-acc-cell]') || e.target.closest('.chev-btn'))) {
        e.stopPropagation();
        appState.expanded[accId] = !appState.expanded[accId];
        const sc = document.getElementById('content');
        const top = sc ? sc.scrollTop : 0;
        render();
        if (sc) sc.scrollTop = top;
        return;
      }
      if (e.target.closest('button') || e.target.closest('.ph-mini')) return;
      appState.openOi = tr.dataset.openOi;
      appState.letterEdit = false;
      const oi = OI.find((o) => o.id === tr.dataset.openOi);
      appState.viewer = {
        mode: (oi && oi.photos && Object.keys(oi.photos).length) ? 'photo' : 'doc',
      };
      appState.viewerDoc = null;
      appState.view = 'oi';
      render();
    };
  });

  document.querySelectorAll('[data-open-ocdocs]').forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      const tabs = VS.openTabs['oc'] || [];
      openDocViewer('oc', tabs.length ? tabs[tabs.length - 1] : (DOCS[0] ? DOCS[0].id : null));
    };
  });

  document.querySelectorAll('[data-open-movdoc]').forEach((tr) => {
    tr.onclick = () => {
      const [scope, id] = tr.dataset.openMovdoc.split('|');
      openDocViewer(scope, id);
    };
  });

  document.querySelectorAll('[data-open-photo]').forEach((p) => {
    p.onclick = (e) => {
      e.stopPropagation();
      const [oiId, rest] = p.dataset.openPhoto.split('|');
      const [cat, i] = rest.split(':');
      const oi = OI.find((o) => o.id === oiId);
      if (!oi) return;
      const idx = photoPages(oi).findIndex((x) => x.cat === cat && x.i === +i) + 1;
      openPhotoInPlace(oiId, idx);
    };
  });

  document.querySelectorAll('[data-add-photo]').forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      const oi = OI.find((o) => o.id === (b.dataset.photoOi || appState.openOi));
      if (!oi) return;
      const cat = b.dataset.addPhoto;
      oi.photos = oi.photos || {};
      oi.photos[cat] = (oi.photos[cat] || 0) + 1;
      appState.accOpen['ph|' + oi.id + '|' + cat] = true;
      render();
      toast('Фото загружено', 'ok');
    };
  });

  document.querySelectorAll('[data-open-pviewer]').forEach((b) => {
    b.onclick = (e) => { e.stopPropagation(); appState.viewer = { mode: 'photo' }; render(); };
  });

  const elBtn = document.querySelector('[data-edit-letter]');
  if (elBtn) elBtn.onclick = () => {
    appState.letterEdit = true;
    render();
    const i = document.querySelector('[data-letter-input]');
    if (i) { i.focus(); i.select(); }
  };
  const ls = document.querySelector('[data-letter-save]');
  if (ls) ls.onclick = () => {
    const oi = currentOI();
    if (!oi) return;
    const inp = document.querySelector('[data-letter-input]');
    const v = (inp ? inp.value : '').trim();
    if (!v || v === oi.letter) { appState.letterEdit = false; render(); return; }
    const taken = OI.some((o) => o !== oi && o.kind === 'realty' && o.letter === v);
    if (taken) { toast('Литера занята', 'warn'); return; }
    oi.letter = v;
    appState.letterEdit = false;
    render();
    toast('Литера переименована', 'ok');
  };
  const lc = document.querySelector('[data-letter-cancel]');
  if (lc) lc.onclick = () => { appState.letterEdit = false; render(); };

  const oi = OI.find((o) => o.id === appState.openOi);
  if (oi && appState.view === 'oi') {
    if (oi.kind === 'realty') {
      document.querySelectorAll('[data-area]').forEach((i) => i.onchange = () => {
        oi.areas[i.dataset.area] = i.value;
        recalcFloors(oi);
        updateFloorsUI(oi);
        updateCtxPlate();
      });
      document.querySelectorAll('[data-height]').forEach((i) => i.onchange = () => { oi.heights[i.dataset.height] = i.value; });

      const fn = document.querySelector('[data-floors-n]');
      if (fn) fn.onchange = () => {
        oi.floors = Math.max(1, parseInt(fn.value, 10) || 1);
        buildFloors(oi);
        rerenderFloors(oi);
        updateCtxPlate();
      };

      const rd = document.querySelector('[data-redistribute]');
      if (rd) rd.onclick = (e) => {
        e.stopPropagation();
        recalcFloors(oi);
        updateFloorsUI(oi);
        toast('Отмеченные этажи выровнены по остатку', 'ok');
      };
      document.querySelectorAll('[data-floor-on]').forEach((c) => c.onchange = () => {
        oi.floorList[+c.dataset.floorOn].on = c.checked;
        recalcFloors(oi);
        updateFloorsUI(oi);
      });
      document.querySelectorAll('[data-floor-area]').forEach((i) => i.onchange = () => {
        oi.floorList[+i.dataset.floorArea].area = i.value;
        recalcFloors(oi);
        updateFloorsUI(oi);
      });
      document.querySelectorAll('[data-floor-hext]').forEach((i) => i.onchange = () => { oi.floorList[+i.dataset.floorHext].hExt = i.value; });
      document.querySelectorAll('[data-floor-hint]').forEach((i) => i.onchange = () => { oi.floorList[+i.dataset.floorHint].hInt = i.value; });

      const bt = document.querySelector('[data-buildtype]');
      if (bt) bt.onchange = () => { oi.buildType = bt.value; updateCtxPlate(); };
      const yr = document.querySelector('[data-year]');
      if (yr) yr.onchange = () => { oi.year = yr.value; };
      const cm = document.querySelector('[data-comment]');
      if (cm) cm.onchange = () => { oi.comment = cm.value; };
      const dis = document.querySelector('[data-dis]');
      if (dis) dis.onchange = () => { oi.dis = dis.checked; };
      const cc = document.querySelector('[data-catclass]');
      if (cc) cc.onchange = () => { oi.catClass = cc.value; renderKeepScroll(); };
      const rc = document.querySelector('[data-rescat]');
      if (rc) rc.onchange = () => { oi.resCat = rc.value; };

      // Специфичные поля квартиры.
      if (isApartmentOi(oi)) {
        const ensureApartment = () => {
          if (!oi.apartment) oi.apartment = {};
          return oi.apartment;
        };
        const bindAptField = (selector, key) => {
          const el = document.querySelector(selector);
          if (!el) return;
          el.onchange = () => { ensureApartment()[key] = el.value; };
        };

        bindAptField('[data-apt-floor]', 'floor');
        bindAptField('[data-apt-building-floors]', 'buildingFloors');
        bindAptField('[data-apt-rooms]', 'rooms');
        bindAptField('[data-apt-series]', 'series');
        bindAptField('[data-apt-loggia-count]', 'loggiaCount');
        bindAptField('[data-apt-balcony-count]', 'balconyCount');
        bindAptField('[data-apt-loggia-area]', 'loggiaBuildArea');
        bindAptField('[data-apt-balcony-area]', 'balconyBuildArea');

        // Этажность квартиры: управляет видимостью аккордеона развёртки в блоке 01.
        const aptStoreys = document.querySelector('[data-apt-storeys]');
        if (aptStoreys) {
          aptStoreys.onchange = () => {
            const val = Math.max(1, Math.min(30, parseInt(aptStoreys.value, 10) || 1));
            aptStoreys.value = val;
            ensureApartment().storeys = String(val);
            oi.floors = val;
            buildApartmentFloors(oi);
            // Полный ререндер: аккордеон развёртки появляется или исчезает.
            renderKeepScroll();
            updateCtxPlate();
          };
        }

        // Положение на этаже: select + условный ручной ввод.
        const locSel = document.querySelector('[data-apt-location]');
        if (locSel) {
          locSel.onchange = () => {
            const a = ensureApartment();
            a.location = locSel.value;
            const other = document.querySelector('[data-apt-location-other]');
            if (other) {
              other.style.display = a.location === 'Прочее' ? '' : 'none';
              if (a.location !== 'Прочее') { other.value = ''; a.locationOther = ''; }
            }
          };
        }
        const locOther = document.querySelector('[data-apt-location-other]');
        if (locOther) locOther.onchange = () => { ensureApartment().locationOther = locOther.value; };

        // Права на строение: select + условный ручной ввод.
        const rightsSel = document.querySelector('[data-apt-rights]');
        if (rightsSel) {
          rightsSel.onchange = () => {
            const a = ensureApartment();
            a.rights = rightsSel.value;
            const other = document.querySelector('[data-apt-rights-other]');
            if (other) {
              other.style.display = a.rights === 'Иное' ? '' : 'none';
              if (a.rights !== 'Иное') { other.value = ''; a.rightsOther = ''; }
            }
          };
        }
        const rightsOther = document.querySelector('[data-apt-rights-other]');
        if (rightsOther) rightsOther.onchange = () => { ensureApartment().rightsOther = rightsOther.value; };
      }
    }

    document.querySelectorAll('[data-status]').forEach((s) => s.onchange = () => { oi.status = s.value; updateCtxPlate(); });
    const nm = document.querySelector('[data-oi-name]');
    if (nm) nm.onchange = () => { oi.name = nm.value; updateCtxPlate(); };
    const en = document.querySelector('[data-oi-eni]');
    if (en) en.onchange = () => { oi.eni = en.value.trim() || oi.eni; };
    document.querySelectorAll('[data-flag]').forEach((c) => c.onchange = () => {
      oi.flags = oi.flags || {};
      oi.flags[c.dataset.flag] = c.checked;
      renderKeepScroll();
    });

    if (oi.kind !== 'realty' && oi.kind !== 'land') {
      const mk = document.querySelector('[data-mv-make]');
      if (mk) mk.onchange = () => { oi.make = mk.value; };
      const md = document.querySelector('[data-mv-model]');
      if (md) md.onchange = () => { oi.model = md.value; };
      const vy = document.querySelector('[data-mv-year]');
      if (vy) vy.onchange = () => { oi.year = vy.value; };
      const vv = document.querySelector('[data-mv-vin]');
      if (vv) vv.onchange = () => { oi.vin = vv.value; };
      const pl = document.querySelector('[data-mv-plate]');
      if (pl) pl.onchange = () => { oi.plate = pl.value; };
      const mn = document.querySelector('[data-mv-name]');
      if (mn) mn.onchange = () => { oi.name = mn.value; updateCtxPlate(); };
      const sr = document.querySelector('[data-mv-serial]');
      if (sr) sr.onchange = () => { oi.serial = sr.value; };
    }

    if (oi.kind === 'land') {
      const lp = document.querySelector('[data-land-purpose]');
      if (lp) lp.onchange = () => { oi.purpose = lp.value; };
      const la = document.querySelector('[data-land-area]');
      if (la) la.onchange = () => { oi.area = la.value; };
    }

    document.querySelectorAll('[data-struct]').forEach((s) => s.onchange = () => { oi.struct[s.dataset.struct] = s.value; });
    document.querySelectorAll('[data-ms-toggle]').forEach((c) => c.onclick = (e) => {
      e.stopPropagation();
      const drop = c.parentElement.querySelector('.ms-drop');
      document.querySelectorAll('.ms-drop').forEach((d) => { if (d !== drop) d.hidden = true; });
      drop.hidden = !drop.hidden;
      appState.heatOpen = !drop.hidden;
    });
    document.querySelectorAll('[data-heat-opt]').forEach((cb) => cb.onchange = () => {
      const h = cb.dataset.heatOpt;
      const i = oi.heating.indexOf(h);
      if (i >= 0) oi.heating.splice(i, 1); else oi.heating.push(h);
      updateHeatingUI(oi);
    });
    document.querySelectorAll('[data-heat-rm]').forEach((x) => x.onclick = (e) => {
      e.stopPropagation();
      const cur = currentOI();
      if (!cur) return;
      const h = x.dataset.heatRm;
      const i = cur.heating.indexOf(h);
      if (i >= 0) cur.heating.splice(i, 1);
      updateHeatingUI(cur);
    });
    const ho = document.querySelector('[data-heat-other]');
    if (ho) ho.onchange = () => { oi.heatingOther = ho.value; };

    const am = document.querySelector('[data-add-movdoc]');
    if (am) am.onclick = () => {
      (oi.docs = oi.docs || []).push({ id: 'md' + Date.now(), type: 'ПУД', name: 'Новый документ', date: '07.08.2026' });
      render();
      toast('Документ добавлен', 'ok');
    };

    const sv = document.querySelector('[data-save-oi]');
    if (sv) sv.onclick = () => {
      appState.view = 'oc';
      appState.viewer = null;
      appState.letterEdit = false;
      render();
      toast('ОИ сохранён', 'ok');
    };
  }
}