import { migrateAreaList } from '../../kernel/areaList.js';
import { migrateStruct } from './parts/struct/ms.js';
import { migrateSpecials } from './parts/specials/model.js';
import { fmtEni } from '../../kernel/fmt.js';
import { manifest } from './manifest.js';
import { MENU_HREF } from '../../kernel/router.js';
import { getOi, ui, resetViewer } from './data/store.js';
import { loadRecord } from './records.js';
import { viewOC } from './card/ocCard.view.js';
import { bindOcCard } from './card/ocCard.ctrl.js';
import { viewOCForm } from './card/ocForm.view.js';
import { bindOcForm } from './card/ocForm.ctrl.js';
import { viewOCCreate } from './card/ocCreateForm.view.js';
import { bindOcCreate } from './card/ocCreateForm.ctrl.js';
import { ctxPlate, updatePlate } from './card/ctxPlate.js';
import { OI_CARDS, cardMeta } from './oi/registry.js';
import { drawerNotesHTML, drawerCount } from './parts/notes/view.js';
import { bindDrawerNotes } from './parts/notes/ctrl.js';
import { bindViewer } from './parts/viewer/ctrl.js';
import { bindSplitPanes } from './parts/viewer/shell.js';

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

// ГЛАВНАЯ ФУНКЦИЯ МОДУЛЯ: её вызывает меню ОЦ при клике по объекту этого типа.
export function main(host) {
  const scope = host.scope;
  const cardCache = new Map();

  let route = host.route;
  let rec = loadRecord(route.ocId);

  // Контекст, который получают все виды и контроллеры этого модуля.
  const ctx = {
    host,
    scope,
    manifest,
    today: todayStr(),
    ui,
    get rec() { return rec; },
    get route() { return route; },
    get view() { return viewName(); },
    get tab() { return route.query.tab || 'general'; },
    get oi() { return route.rest[0] === 'oi' ? getOi(rec, route.rest[1]) : null; },

    toast: host.toast,
    resetViewer,
    navigate: (patch) => host.navigate(Object.assign({ ocId: rec.id }, patch)),
    // render и renderKeepScroll были одним и тем же вызовом с разным
    // поведением по умолчанию — 217 мест в пяти модулях звали именно
    // render() и теряли скролл на каждом клике. Скролл теперь сохраняется
    // всегда, поэтому оставлен один метод (см. draw()).
    render: () => draw(),
    updatePlate: () => { updatePlate(ctx); refreshDrawer(); },

    async deleteOi(id) {
      const oi = getOi(rec, id);
      if (!oi) return;

      const label = oi.letter ? 'Литера ' + oi.letter : 'ОИ';
      const ok = await host.confirm({
        title: 'Удаление ОИ',
        text: `Удалить «${label}» (${oi.name})? Действие нельзя отменить.`,
        okLabel: 'Удалить',
        danger: true,
      });
      if (!ok) return;
      // Удаление участка не уносит литеры: они остаются в записи и теряют
      // привязку, то есть уезжают в группу «Без участка» (Л2.1, Л2.2).
      if (oi.card === 'land') {
        rec.oi.forEach((o) => { if (o.landId === oi.id) o.landId = null; });
      }


      const i = rec.oi.findIndex((o) => o.id === id);
      if (i >= 0) rec.oi.splice(i, 1);

      if (ctx.oi && ctx.oi.id === id) {
        ui.letterEdit = false;
        ctx.navigate({ rest: [] });
      } else {
        migrateSpecials(rec);
        migrateStruct(rec);
        migrateAnnexes(rec);
        draw();
      }
      host.toast(label + ' удалён');
    },
  };

  function viewName() {
    if (route.rest[0] === 'oi') return 'oi';
    if (route.rest[0] === 'form') return 'form';
    if (route.rest[0] === 'create') return 'create';
    return 'oc';
  }

  function refreshDrawer() {
    host.updateDrawer();
  }

  function crumbs() {
    const items = [
      { label: 'Главная', to: MENU_HREF },
      { label: 'Объекты оценки', to: MENU_HREF },
    ];

    const ocHref = host.hrefFor({ ocId: rec.id, rest: [] });

    if (ctx.view === 'oc') {
      items.push({ label: manifest.label, current: true });
      return items;
    }

    items.push({ label: `Объект ${fmtEni(rec.eni)}`, to: ocHref });

    if (ctx.view === 'form') items.push({ label: 'Редактирование ОЦ', current: true });
    else if (ctx.view === 'create') items.push({ label: 'Создание ОЦ', current: true });
    else if (ctx.oi) items.push({ label: cardMeta(ctx.oi).crumbLabel(ctx.oi), current: true });
    else items.push({ label: manifest.label, current: true });

    return items;
  }

  // Общие для модуля переключатели: карточки, аккордеоны, дропдауны.
  function bindCommonUI() {
    scope.on('click', '[data-acc-toggle]', (e, head) => {
      if (e.target.closest('button') || e.target.closest('input')
        || e.target.closest('select') || e.target.closest('.dd')) return;
      e.stopPropagation();
      const acc = head.closest('.acc');
      if (!acc) return;
      acc.classList.toggle('open');
      ui.accOpen[head.dataset.accToggle] = acc.classList.contains('open');
    });

    scope.on('click', '[data-card-toggle]', (e, head) => {
      if (e.target.closest('button') || e.target.closest('input')
        || e.target.closest('select') || e.target.closest('.dd')) return;
      e.stopPropagation();
      const card = head.closest('.card');
      if (card) card.classList.toggle('collapsed');
    });

    scope.on('click', '[data-dd-toggle]', (e, btn) => {
      const dd = btn.closest('.dd');
      if (!dd) return;
      const wasOpen = dd.classList.contains('open');
      scope.$$('.dd.open').forEach((d) => d.classList.remove('open'));
      if (!wasOpen) dd.classList.add('open');
    });

    scope.on('click', '[data-back]', () => {
      ui.letterEdit = false;
      ui.heatOpen = false;
      resetViewer();
      ctx.navigate({ rest: [] });
    });

    // Закрытие дропдаунов по клику вне них.
    scope.onDocument('click', (e) => {
      if (!e.target.closest('.dd')) {
        document.querySelectorAll('.dd.open').forEach((d) => d.classList.remove('open'));
      }
    });
  }

  async function ensureCard(oi) {
    const meta = OI_CARDS[oi.card];
    if (!meta) return null;
    if (!cardCache.has(oi.card)) {
      const mod = await meta.load();
      cardCache.set(oi.card, mod.card);
    }
    const card = cardCache.get(oi.card);
    if (card.init) card.init(oi);
    return card;
  }

  async function draw() {
    if (!rec) {
      scope.setHTML(`<div class="card card-pad">Объект оценки не найден.
        <button class="btn btn-ghost btn-sm" data-to-menu style="margin-left:10px">В меню</button></div>`);
      scope.$('[data-to-menu]').onclick = () => host.toMenu();
      host.setCrumbs([{ label: 'Главная', to: MENU_HREF }, { label: 'Объекты оценки', to: MENU_HREF }, { label: 'Объект не найден', current: true }]);
      host.setDrawer(null);
      return;
    }

    // Каждый клик (добавить документ, снять ответственного, отметить
    // заметку и т.д.) раньше пересобирал экран с нуля и отбрасывал вверх —
    // скролл теперь сохраняется всегда, а не только при явном keepScroll.
    const top = scope.root.scrollTop;

    let body = '';
    let bindBody = () => {};

    if (ctx.view === 'oi') {
      const oi = ctx.oi;
      if (!oi) { ctx.navigate({ rest: [], replace: true }); return; }
      const card = await ensureCard(oi);
      body = card.render(ctx, oi);
      bindBody = () => card.bind(ctx, oi);
    } else if (ctx.view === 'form') {
      body = viewOCForm(ctx);
      bindBody = () => bindOcForm(ctx);
    } else if (ctx.view === 'create') {
      body = viewOCCreate(ctx);
      bindBody = () => bindOcCreate(ctx);
    } else {
      body = viewOC(ctx);
      bindBody = () => bindOcCard(ctx);
    }

    const plate = ctxPlate(ctx);
    scope.setHTML(`<div id="ctxPlateWrap" style="${plate ? '' : 'display:none'}">${plate || ''}</div>` + body);

    host.setCrumbs(crumbs());

    // Ящик заметок показывается там же, где и в макете:
    // общие данные ОЦ и карточка ОИ.
    const showDrawer = (ctx.view === 'oc' && ctx.tab === 'general') || ctx.view === 'oi';
    host.setDrawer(showDrawer ? {
      count: () => drawerCount(rec),
      html: () => drawerNotesHTML(rec, ui),
      bind: (drawerScope) => bindDrawerNotes(drawerScope, {
        rec,
        ui,
        refresh: () => { host.updateDrawer(); updatePlate(ctx); },
        toast: host.toast,
      }),
    } : null);

    bindBody();
    bindViewer(ctx);
    bindSplitPanes(ctx);

    scope.root.scrollTop = top;
  }

  // Лоджии и балконы: было количество и общая площадь, стало список с площадью
  // у каждого (Л2.9). Перевод идёт до отрисовки, иначе попал бы в лог правок
  // как правка пользователя.
  function migrateAnnexes(r) {
    if (!r || !Array.isArray(r.oi)) return;
    r.oi.forEach((o) => {
      migrateAreaList(o, 'loggias', 'loggiasCount', 'loggias');
      migrateAreaList(o, 'balconies', 'balconiesCount', 'balconies');
      migrateAreaList(o, 'loggias', 'loggiaCount', 'loggiaBuildArea');
      migrateAreaList(o, 'balconies', 'balconyCount', 'balconyBuildArea');
      if (o.apartment) {
        migrateAreaList(o.apartment, 'loggias', 'loggiaCount', 'loggiaBuildArea');
        migrateAreaList(o.apartment, 'balconies', 'balconyCount', 'balconyBuildArea');
      }
    });
  }

  bindCommonUI();
  migrateSpecials(rec);
  migrateStruct(rec);
  migrateAnnexes(rec);
  draw();

  return {
    onRoute(next) {
      route = next;
      const nextRec = loadRecord(next.ocId);
      if (nextRec !== rec) {
        rec = nextRec;
        resetViewer();
      }
      migrateSpecials(rec);
      migrateStruct(rec);
      migrateAnnexes(rec);
      draw();
    },
    destroy() {
      resetViewer();
    },
  };
}

export { manifest };
