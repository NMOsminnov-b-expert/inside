import { DOC_TYPES, RIGHTS, MANSARD_TYPE, LAND_SHAPE, WEAR_LEVEL, CRANE_BEAM } from '../data/dictionaries.js';
import { oiTypeByLabel } from '../data/rules.js';
import { nextLetter, nextId, nextEni, removeRecord } from '../data/store.js';
import { openDocViewer, openPhotoInPlace, VS } from '../parts/viewer/state.js';
import { photoPages } from '../parts/photos/model.js';
import { bindPhotoExplorer } from '../parts/photos/explorer.js';

function createOi(ctx, type) {
  const rec = ctx.rec;

  if (type.card === 'land') {
    return {
      id: nextId('oi-l'),
      card: 'land',
      name: 'Земельный участок',
      purpose: '',
      area: '',
      areaPud: '',
      areaBuilt: '',
      rights: RIGHTS[0],
      shape: LAND_SHAPE[0],
      easements: false,
      easementsArea: '',
      eni: nextEni(rec, rec.eni),
      status: 'Основное',
      flags: { entered: false, matched: false },
      docs: [],
      photos: {},
      notes: [],
    };
  }

  const letter = nextLetter(rec);

  const oi = {
    id: nextId('oi'),
    card: type.card,
    letter,
    name: type.label,
    status: 'Основное',
    origin: 'manual',
    residential: false,
    resCat: '',
    eni: nextEni(rec, rec.eni),
    year: '',
    flags: { entered: false, matched: false },
    rights: RIGHTS[0],
    oiCategory: '',
    areas: {
      tp: '', pud: '', fact: '', build: '',
      loggias: '', balconies: '',
    },
    floors: 1,
    floorList: [],
    heights: { ext: '', int: '' },
    buildType: 'Отдельностоящее',
    mansardType: MANSARD_TYPE[0],
    loggiasCount: '',
    balconiesCount: '',
    rentAreas: [],
    struct: {
      foundation: 'Не указано',
      wallsExt: 'Не указано',
      wallsInt: 'Не указано',
      ceilings: 'Не указано',
      roof: 'Не указано',
      floors: 'Не указано',
      windows: 'Не указано',
      doors: 'Не указано',
    },
    structOther: {},
    heating: [],
    heatingOther: '',
    wear: {
      finish: WEAR_LEVEL[0], insulation: WEAR_LEVEL[0], roof: WEAR_LEVEL[0], plinth: WEAR_LEVEL[0],
      floors: WEAR_LEVEL[0], ceilings: WEAR_LEVEL[0], windows: WEAR_LEVEL[0], doors: WEAR_LEVEL[0], heating: WEAR_LEVEL[0],
    },
    comment: '',
    features: '',
    catClass: type.catClass || 'Гражданское здание',
    // «Доп параметры» — заполняются только для производственно-складских строений.
    prodHeight: '',
    prodFrame: '',
    prodFloors: '',
    craneBeam: CRANE_BEAM[0],
    dis: false,
    docs: [],
    photos: {},
    notes: [],
  };

  if (type.card === 'apartment') oi.apartment = null;

  return oi;
}

export function bindOcCard(ctx) {
  const s = ctx.scope;
  const rec = ctx.rec;

  // --- Вкладки ------------------------------------------------------------
  s.$$('[data-tab]').forEach((b) => b.onclick = () => {
    const tab = b.dataset.tab;

    if (tab === 'docs') {
      ctx.ui.viewer = { mode: 'doc' };
      const docs = rec.docs || [];
      if (!ctx.ui.viewerDoc && docs.length) ctx.ui.viewerDoc = { scope: 'oc', id: docs[0].id };
    } else if (tab === 'photo') {
      if (ctx.ui.viewer && ctx.ui.viewer.mode !== 'photo') ctx.ui.viewer = null;
    } else {
      ctx.ui.viewer = null;
    }

    ctx.navigate({ rest: [], query: tab === 'general' ? {} : { tab } });
  });

  // --- Добавление ОИ ------------------------------------------------------
  s.$$('[data-add-oi]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    s.$$('.dd').forEach((d) => d.classList.remove('open'));

    const type = oiTypeByLabel(b.dataset.addOi, rec);
    if (!type) { ctx.toast('Для текущего типа ОЦ этот вид ОИ недоступен', 'warn'); return; }

    // Движимое создаётся через мастер (монолит или комплекс).
    if (type.wizard) {
      ctx.ui.mechMode = 'mono';
      ctx.ui.mechDocs = [];
      ctx.ui.mechRows = [];
      ctx.ui.mechDraft = { name: '', year: '', serial: '' };
      ctx.ui.viewer = { mode: 'doc' };
      ctx.ui.viewerDoc = null;
      ctx.navigate({ rest: ['new', type.wizard] });
      return;
    }

    if (type.single && rec.oi.some((o) => o.card === type.card)) {
      ctx.toast('Земельный участок уже добавлен (один ЕНИ на объект)', 'warn');
      return;
    }

    const oi = createOi(ctx, type);
    rec.oi.push(oi);

    ctx.ui.letterEdit = false;
    ctx.ui.viewer = { mode: 'doc' };
    ctx.ui.viewerDoc = null;

    ctx.navigate({ rest: ['oi', oi.id] });
    ctx.toast(oi.card === 'land' ? 'Земельный участок добавлен' : 'Литера ' + oi.letter + ' создана', 'ok');
  });

  // --- Шапка ОЦ -----------------------------------------------------------
  const be = s.$('#btnEditOc');
  if (be) be.onclick = () => {
    ctx.ui.viewer = { mode: 'doc' };
    ctx.ui.viewerDoc = null;
    ctx.navigate({ rest: ['form'] });
  };

  const bd = s.$('#btnDelOc');
  if (bd) bd.onclick = async () => {
    const ok = await ctx.host.confirm({
      title: 'Удаление объекта оценки',
      text: `Удалить «${rec.address}» вместе с ${rec.oi.length} ОИ? Действие нельзя отменить.`,
      okLabel: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    removeRecord(rec.id);
    ctx.host.toMenu();
    ctx.toast('Объект оценки удалён');
  };

  // --- Стороны ------------------------------------------------------------
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

  // --- Документы ОЦ -------------------------------------------------------
  s.$$('[data-attach]').forEach((b) => b.onclick = async (e) => {
    e.stopPropagation();
    const t = b.dataset.attach;
    const name = await ctx.host.prompt({ title: 'Прикрепить документ', label: 'Наименование документа (' + t + ')', placeholder: t });
    if (!name) return;

    rec.docs = rec.docs || [];
    rec.docs.push({ id: nextId('d'), type: t, name, date: ctx.today, pages: null });

    ctx.render();
    ctx.toast('Документ прикреплён: ' + t, 'ok');
  });

  s.$$('[data-doc-del]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();

    const id = b.dataset.docDel;
    const i = (rec.docs || []).findIndex((d) => d.id === id);
    if (i >= 0) rec.docs.splice(i, 1);

    VS.openTabs.oc = (VS.openTabs.oc || []).filter((x) => x !== id);

    if (ctx.ui.viewerDoc && ctx.ui.viewerDoc.id === id) {
      ctx.ui.viewerDoc = VS.openTabs.oc.length
        ? { scope: 'oc', id: VS.openTabs.oc[VS.openTabs.oc.length - 1] }
        : null;
      if (!ctx.ui.viewerDoc) ctx.ui.viewer = null;
    }

    ctx.render();
    ctx.toast('Документ откреплён');
  });

  s.$$('[data-open-doc]').forEach((tr) => tr.onclick = (e) => {
    if (e.target.closest('[data-doc-del]')) return;
    openDocViewer(ctx, 'oc', tr.dataset.openDoc);
  });

  // --- Перечень ОИ --------------------------------------------------------
  s.$$('tr[data-open-oi]').forEach((tr) => tr.onclick = (e) => {
    const accId = tr.dataset.accId;

    if (accId && (e.target.closest('[data-acc-cell]') || e.target.closest('.chev-btn'))) {
      e.stopPropagation();
      ctx.ui.expanded[accId] = !ctx.ui.expanded[accId];
      ctx.render();
      return;
    }

    if (e.target.closest('button') || e.target.closest('.ph-mini')) return;

    const oi = rec.oi.find((o) => o.id === tr.dataset.openOi);
    ctx.ui.letterEdit = false;
    ctx.ui.viewer = { mode: (oi && oi.photos && Object.keys(oi.photos).length) ? 'photo' : 'doc' };
    ctx.ui.viewerDoc = null;
    ctx.navigate({ rest: ['oi', tr.dataset.openOi] });
  });

  s.$$('[data-del-oi]').forEach((b) => b.onclick = async (e) => {
    e.stopPropagation();
    await ctx.deleteOi(b.dataset.delOi);
  });

  // Фото в аккордеоне перечня и мини-превью в строках.
  s.$$('[data-add-photo]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const oi = rec.oi.find((o) => o.id === b.dataset.photoOi);
    if (!oi) return;
    const cat = b.dataset.addPhoto;
    oi.photos = oi.photos || {};
    oi.photos[cat] = (oi.photos[cat] || 0) + 1;
    ctx.ui.accOpen['ph|' + oi.id + '|' + cat] = true;
    ctx.render();
    ctx.toast('Фото загружено', 'ok');
  });

  s.$$('[data-open-photo]').forEach((p) => p.onclick = (e) => {
    e.stopPropagation();
    const [oiId, rest] = p.dataset.openPhoto.split('|');
    const [cat, i] = rest.split(':');
    const oi = rec.oi.find((o) => o.id === oiId);
    if (!oi) return;
    const idx = photoPages(oi).findIndex((x) => x.cat === cat && x.i === +i) + 1;
    openPhotoInPlace(ctx, oiId, idx);
  });

  bindPhotoExplorer(ctx);
}
