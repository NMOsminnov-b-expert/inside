import { manifest } from './manifest.js';
import { setActiveOcType } from '../../kernel/ocType.js';
import { ui, resetViewer } from './data/store.js';
import { loadRecord } from './records.js';
import { viewOC } from './card/ocCard.view.js';
import { bindOcCard } from './card/ocCard.ctrl.js';
import { viewOCForm } from './card/ocForm.view.js';
import { bindOcForm } from './card/ocForm.ctrl.js';
import { viewOCCreate } from './card/ocCreateForm.view.js';
import { bindOcCreate } from './card/ocCreateForm.ctrl.js';
import { ctxPlate, updatePlate } from './card/ctxPlate.js';
import { drawerNotesHTML, drawerCount } from './parts/notes/view.js';
import { bindDrawerNotes } from './parts/notes/ctrl.js';
import { bindViewer, bindViewerHotkeys } from './parts/viewer/ctrl.js';
import { bindSplitPanes } from './parts/viewer/shell.js';
import { takeSnapshot, recordChanges } from './audit/model.js';

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

// ГЛАВНАЯ ФУНКЦИЯ МОДУЛЯ: её вызывает меню ОЦ при клике по объекту этого типа.
//
// Заметно проще, чем у остальных четырёх модулей: у этого типа ОЦ нет ни
// одного объекта имущества (см. manifest.js, records.js) — сама запись уже
// единица техники, а её состав описывает конструктор полей (rec.mechanisms, см.
// parts/mechConstructor.js). Поэтому здесь нет ни ctx.oi/ctx.mechKind, ни
// реестра карточек ОИ (OI_CARDS/cardMeta/ensureCard), ни маршрута мастера
// создания движимого имущества (rest[0] === 'new'), ни каскадных миграций
// данных литер (migrateFloorAreas/migrateTempMode/migrateUtilities/…) — их
// не с чем применять.
export function main(host) {
  // Открыт экран этого типа ОЦ: справочники карточек читаются по нему.
  setActiveOcType(manifest.id);

  const scope = host.scope;

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

    toast: host.toast,
    resetViewer,
    navigate: (patch) => host.navigate(Object.assign({ ocId: rec.id }, patch)),
    // render и renderKeepScroll были одним и тем же вызовом с разным
    // поведением по умолчанию (см. остальные модули) — здесь сразу один
    // метод: скролл сохраняется всегда.
    render: () => draw(),
    updatePlate: () => { updatePlate(ctx); refreshDrawer(); },
  };

  function viewName() {
    if (route.rest[0] === 'form') return 'form';
    if (route.rest[0] === 'create') return 'create';
    return 'oc';
  }

  function refreshDrawer() {
    host.updateDrawer();
  }

  function crumbs() {
    // Начало пути даёт ядро: из реестра объектов это «Главная / Объекты
    // оценки», из раздела «Учреждения» — «Главная / Учреждения / <учреждение>».
    const items = host.originCrumbs();

    if (ctx.view === 'oc') {
      items.push({ label: manifest.label, current: true });
      return items;
    }

    const ocHref = host.hrefFor({ ocId: rec.id, rest: [] });
    items.push({ label: rec.address || manifest.label, to: ocHref });

    if (ctx.view === 'form') items.push({ label: 'Редактирование ОЦ', current: true });
    else if (ctx.view === 'create') items.push({ label: 'Создание ОЦ', current: true });
    else items.push({ label: manifest.label, current: true });

    return items;
  }

  // Общие для модуля переключатели: карточки, аккордеоны, дропдауны, кнопка
  // «Назад». Один в один с остальными модулями — эта часть предметной
  // области не касается вовсе.
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

  async function draw() {
    if (!rec) {
      scope.setHTML(`<div class="card card-pad">Объект оценки не найден.
        <button class="btn btn-ghost btn-sm" data-to-menu style="margin-left:10px">В меню</button></div>`);
      scope.$('[data-to-menu]').onclick = () => host.toMenu();
      host.setCrumbs([...host.originCrumbs(), { label: 'Объект не найден', current: true }]);
      host.setDrawer(null);
      return;
    }

    // Каждый клик (добавить документ, снять ответственного, отметить
    // заметку и т.д.) раньше пересобирал экран с нуля и отбрасывал вверх —
    // скролл теперь сохраняется всегда.
    const top = scope.root.scrollTop;

    let body = '';
    let bindBody = () => {};

    if (ctx.view === 'form') {
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

    // Ящик заметок показывается там же, где и в остальных модулях на уровне
    // ОЦ: общие данные, вкладка «Общие данные». Карточки ОИ здесь нет —
    // второго места показа, в отличие от остальных модулей, не существует.
    const showDrawer = ctx.view === 'oc' && ctx.tab === 'general';
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
    if (scope.watchStickyHead) scope.watchStickyHead();
    if (scope.syncStickyHead) scope.syncStickyHead();
  }

  // Просмотрщик по умолчанию должен быть виден всегда — прячется только явным
  // закрытием (крестик, data-vclose). У этого модуля нет ни объектов
  // имущества, ни вкладки «Фото» на уровне ОЦ, поэтому режим всегда
  // документный — переключать его на «фото» здесь неоткуда.
  function ensureViewerDefault() {
    // Исключение — вкладка «Логи»: она на всю ширину, просмотрщику там не место.
    if (route.rest.length === 0 && route.query.tab === 'audit') return;
    // Закрыли крестиком — не возвращаем: открыть можно закладкой «Документы».
    if (ui.viewerClosed) return;
    if (!ui.viewer || ui.viewer.mode !== 'doc') ui.viewer = { mode: 'doc' };
  }

  // Лог действий (вкладка «Логи» в карточке ОЦ, см. card/ocCard.view.js):
  // снимок записи снимается при входе, сравнивается с текущим состоянием при
  // выходе (смена маршрута/записи, размонтирование модуля) — см. audit/model.js.
  let recSnapshot = null;

  function resnapshot() {
    recSnapshot = rec ? takeSnapshot(rec) : null;
  }

  function flushAuditLog() {
    if (recSnapshot) recordChanges(rec, recSnapshot, rec);
  }

  // Краткая сводка должна быть видна всегда, даже когда карточку прокрутили
  // вниз — при прокрутке шапка карточки уезжает вверх, а её место занимает
  // закреплённая плашка (см. card/ctxPlate.js и #ctxPlateWrap в module.css).
  function bindStickyHead() {
    const root = scope.root;

    const HIDE_AT = 90;
    const SHOW_AT = 20;

    const sync = () => {
      const y = root.scrollTop;
      const on = root.classList.contains('scrolled');
      if (!on && y > HIDE_AT) root.classList.add('scrolled');
      else if (on && y < SHOW_AT) root.classList.remove('scrolled');

      const plate = root.querySelector('#ctxPlateWrap');
      const head = root.querySelector('[data-oc-head]');
      const hp = plate && plate.offsetParent !== null ? plate.offsetHeight : 0;
      const hh = head && head.offsetParent !== null ? head.offsetHeight : 0;
      const pinnedH = Math.max(hp, hh);
      root.style.setProperty('--plate-h', pinnedH + 'px');
      document.documentElement.style.setProperty('--plate-h', pinnedH + 'px');

      const viewer = root.querySelector('.viewer');
      if (viewer) {
        const top = viewer.getBoundingClientRect().top;
        viewer.style.setProperty('--viewer-h', Math.max(320, window.innerHeight - top - 14) + 'px');
      }
    };

    root.syncStickyHeadFn = sync;
    if (!root.dataset.stickyHeadBound) {
      root.dataset.stickyHeadBound = '1';
      const call = () => { if (root.syncStickyHeadFn) root.syncStickyHeadFn(); };
      root.addEventListener('scroll', call);
      window.addEventListener('resize', call);
    }

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => sync());
      const watch = () => {
        ro.disconnect();
        [root.querySelector('#ctxPlateWrap'), root.querySelector('[data-oc-head]')]
          .forEach((el) => { if (el) ro.observe(el); });
      };
      watch();
      scope.watchStickyHead = watch;
    }
    scope.syncStickyHead = sync;
    sync();
  }

  bindCommonUI();
  bindStickyHead();
  // Клавиши просмотрщика — однократно на монтирование модуля (см. остальные
  // модули: слушатели накапливались бы на каждую перерисовку иначе).
  bindViewerHotkeys(ctx);
  ensureViewerDefault();
  draw().then(resnapshot);

  return {
    onRoute(next) {
      flushAuditLog();
      route = next;
      const nextRec = loadRecord(next.ocId);
      if (nextRec !== rec) {
        rec = nextRec;
        resetViewer();
      }
      ensureViewerDefault();
      draw().then(resnapshot);
    },
    destroy() {
      flushAuditLog();
      resetViewer();
    },
  };
}

export { manifest };
