// Панель осмотров — экран регионального менеджера (ТЗ panel-osmotrov-tz,
// разделы 3–3.5; постановка и ответы пользователя 12.10.2026).
//
// Раскладка «список и подробности»: слева осмотрщики с загрузкой, справа
// рабочая область. Выбор осмотрщика сужает рабочую область до его назначений
// и подставляет его в окно назначения. На узком экране колонки встают одна
// над другой, у каждой своя прокрутка (практики list-details: Microsoft,
// SAP Fiori; запись графа panel-podval-deystviy-vybor-strokoy-dannye-chestno).
//
// Видны все осмотрщики; менеджер собирает своих в «Мои осмотрщики» (ответ В5:
// «Пока что видны все осмотрщики. Просто региональный менеджер может своих
// забрать в свой список и уже оттуда с ними работать»).
import { esc } from '../../kernel/dom.js';
import { persistView } from '../../kernel/viewState.js';
import { confirmDialog } from '../../kernel/dialog.js';
import { unassign, allAssignments } from '../../kernel/inspections.js';
import {
  summaries, queueRows, queueFacets, assignedRows, inspectorRows, regionOf, isOverdue, stateLabel,
} from './model.js';
import { openAssignDialog } from './assignDialog.js';

// Строки таблиц рисуются порциями: очередь на 20 000 записей — больше тысячи
// строк (тот же приём, что у сводной таблицы учреждений).
const STEP = 200;

const view = {
  tab: 'queue',          // queue | assigned
  person: '',            // выбранный осмотрщик; пусто — все
  peopleMode: 'all',     // mine | all
  mine: [],              // «Мои осмотрщики»
  peopleQ: '',
  q: '',
  type: '',
  region: '',
  shown: STEP,
};
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: «Мои осмотрщики» — личная настройка менеджера; в
// макете живёт с видом экрана в браузере. На сервере — список у учётной
// записи менеджера (следует за ним с машины на машину) или, когда появится
// привязка к области, выводится из неё.
persistView('inspections', view, ['tab', 'person', 'peopleMode', 'mine', 'q', 'type', 'region', 'shown']);

const fmtDate = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '');

export function mountInspections(host) {
  const { scope } = host;
  const selected = new Map();   // key → { typeId, ocId, title }

  function peopleHTML(people) {
    const mine = new Set(view.mine);
    const q = view.peopleQ.trim().toLowerCase();
    const list = people.filter((p) => (view.peopleMode === 'all' || mine.has(p.name)) && (!q || p.name.toLowerCase().includes(q)));
    const row = (p) => `<li class="ip-person ${view.person === p.name ? 'on' : ''}">
        <button class="ip-person-main" data-ip-person="${esc(p.name)}" aria-pressed="${view.person === p.name}">
          <span class="ip-person-name">${esc(p.name)}</span>
          <span class="ip-person-load">
            <span class="ip-num" title="Назначено и не закончено">в работе <b>${p.live}</b></span>
            ${p.late ? `<span class="ip-num ip-late" title="Плановая дата прошла">просрочено <b>${p.late}</b></span>` : ''}
            <span class="ip-num" title="Закончено за 30 дней">за 30 дн. <b>${p.done}</b></span>
          </span>
        </button>
        <button class="ip-star ${mine.has(p.name) ? 'on' : ''}" data-ip-star="${esc(p.name)}"
          aria-label="${mine.has(p.name) ? 'Убрать из моих осмотрщиков' : 'Добавить в мои осмотрщики'}"
          title="${mine.has(p.name) ? 'Убрать из моих осмотрщиков' : 'Добавить в мои осмотрщики'}">${mine.has(p.name) ? '★' : '☆'}</button>
      </li>`;
    return `<aside class="ip-people" aria-label="Осмотрщики">
      <div class="ip-people-head">
        <h2>Осмотрщики</h2>
        <div class="ip-seg" role="group" aria-label="Какие осмотрщики">
          <button data-ip-mode="mine" aria-pressed="${view.peopleMode === 'mine'}">Мои <b>${view.mine.length}</b></button>
          <button data-ip-mode="all" aria-pressed="${view.peopleMode === 'all'}">Все <b>${people.length}</b></button>
        </div>
        <input class="input ip-people-q" data-ip-people-q type="search" value="${esc(view.peopleQ)}" placeholder="Поиск по фамилии" aria-label="Поиск осмотрщика">
      </div>
      <ul class="ip-people-list">
        <li class="ip-person ${view.person ? '' : 'on'}"><button class="ip-person-main" data-ip-person="">
          <span class="ip-person-name">Все осмотрщики</span></button></li>
        ${list.map(row).join('')}
      </ul>
      ${view.peopleMode === 'mine' && !list.length ? `<div class="ip-empty">${view.mine.length ? 'Никого не нашлось — измените поиск.' : 'Своих осмотрщиков нет. Отметьте их звёздочкой в списке «Все».'}</div>` : ''}
    </aside>`;
  }

  function queueHTML(all) {
    const rows = queueRows(all, view);
    const facets = queueFacets(all);
    const shown = rows.slice(0, Math.max(view.shown, STEP));
    const sel = selected.size;
    return `<div class="ip-tools">
        <input class="input ip-q" data-ip-q type="search" value="${esc(view.q)}" placeholder="Поиск по ЕНИ, адресу, учреждению" aria-label="Поиск объекта">
        <select class="select" data-ip-type aria-label="Тип ОЦ"><option value="">Все типы ОЦ</option>
          ${facets.types.map((t) => `<option value="${esc(t.id)}" ${view.type === t.id ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select>
        <select class="select" data-ip-region aria-label="Область"><option value="">Все области</option>
          ${facets.regions.map((r) => `<option ${view.region === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
        <span class="ip-count">${rows.length} к назначению</span>
      </div>
      ${sel ? `<div class="ip-bulk" role="region" aria-label="Выбранные объекты">
        <span>Выбрано <b>${sel}</b></span>
        <button class="btn btn-primary btn-sm" data-ip-bulk-assign>Назначить${view.person ? ` ${esc(view.person)}` : ''}…</button>
        <button class="btn btn-ghost btn-sm" data-ip-bulk-clear>Снять выбор</button>
      </div>` : ''}
      ${rows.length ? `<div class="ip-wrap"><table class="ip-tbl ip-tbl-queue">
        <colgroup><col class="c-check"><col class="c-eni"><col><col class="c-region"><col class="c-n"><col class="c-n"></colgroup>
        <thead><tr>
          <th class="c-check"><input type="checkbox" data-ip-all aria-label="Выбрать показанные" ${shown.length && shown.every((s) => selected.has(s.typeId + '|' + s.id)) ? 'checked' : ''}></th>
          <th>ЕНИ</th><th>Объект</th><th>Область, город</th><th class="num" title="Объектов имущества">ОИ</th><th class="num" title="Документов у объекта и его ОИ">Док.</th>
        </tr></thead>
        <tbody>${shown.map((s) => {
          const k = s.typeId + '|' + s.id;
          return `<tr data-ip-open="${esc(k)}" class="${selected.has(k) ? 'sel' : ''}">
            <td class="c-check"><input type="checkbox" data-ip-sel="${esc(k)}" ${selected.has(k) ? 'checked' : ''} aria-label="Выбрать"></td>
            <td class="mono"><span class="ell" title="${esc(s.eniAll || s.eni)}">${esc(s.eniAll || s.eni || '—')}</span></td>
            <td><span class="ip-obj"><span class="ell ip-obj-t" title="${esc(s.title)}">${esc(s.title || '—')}</span>
              <span class="ell ip-obj-s" title="${esc(s.typeLabel + ' · ' + (s.institution || ''))}">${esc([s.typeLabel, s.institution].filter(Boolean).join(' · '))}</span></span></td>
            <td><span class="ell" title="${esc([regionOf(s), s.city].filter(Boolean).join(', '))}">${esc([regionOf(s), s.city].filter(Boolean).join(', ') || '—')}</span></td>
            <td class="num">${(s.metrics && s.metrics.oiCount) || 0}</td>
            <td class="num">${(s.metrics && s.metrics.docs) || 0}</td>
          </tr>`;
        }).join('')}</tbody></table></div>
        ${rows.length > shown.length ? `<div class="ip-more"><span>Показаны первые ${shown.length} из ${rows.length}</span>
          <button class="btn btn-ghost btn-sm" data-ip-more>Показать ещё ${Math.min(rows.length - shown.length, STEP)}</button></div>` : ''}`
      : `<div class="ip-empty">${view.q || view.type || view.region ? 'Под условия ничего не подошло — смягчите поиск или фильтры.' : 'Все объекты, удостоверенные по документам, назначены.'}</div>`}`;
  }

  function assignedHTML(all) {
    const rows = assignedRows(all, view);
    const shown = rows.slice(0, Math.max(view.shown, STEP));
    return `<div class="ip-tools">
        <input class="input ip-q" data-ip-q type="search" value="${esc(view.q)}" placeholder="Поиск по ЕНИ, адресу, осмотрщику" aria-label="Поиск назначения">
        <span class="ip-count">${rows.length} назначено</span>
      </div>
      ${rows.length ? `<div class="ip-wrap"><table class="ip-tbl ip-tbl-assigned">
        <colgroup><col class="c-eni"><col><col class="c-oi"><col class="c-person"><col class="c-date"><col class="c-n"><col class="c-state"><col class="c-act"></colgroup>
        <thead><tr><th>ЕНИ</th><th>Объект</th><th>ОИ</th><th>Осмотрщик</th><th title="Плановая дата осмотра">План</th>
          <th class="num" title="Документов и описей, назначенных осмотрщику">Док.</th><th>Состояние</th><th><span class="sr-only">Действия</span></th></tr></thead>
        <tbody>${shown.map(({ a, s }) => {
          const oi = a.oiIds && a.oiIds.length ? `${a.oiIds.length} из ${(s.metrics && s.metrics.oiCount) || a.oiIds.length}` : 'все';
          const late = isOverdue(a);
          return `<tr data-ip-edit="${esc(a.id)}">
            <td class="mono"><span class="ell" title="${esc(s.eniAll || s.eni)}">${esc(s.eniAll || s.eni || '—')}</span></td>
            <td><span class="ip-obj"><span class="ell ip-obj-t" title="${esc(s.title)}">${esc(s.title || '—')}</span>
              <span class="ell ip-obj-s">${esc([s.typeLabel, s.institution].filter(Boolean).join(' · '))}</span></span></td>
            <td>${esc(oi)}</td>
            <td><span class="ell" title="${esc(a.person)}">${esc(a.person)}</span></td>
            <td class="num ${late ? 'ip-late' : ''}" title="${late ? 'Плановая дата прошла' : ''}">${esc(fmtDate(a.plannedAt) || '—')}</td>
            <td class="num">${(a.docs || []).length + (a.inventories || []).length}</td>
            <td><span class="ip-state st-${esc(a.state)}">${esc(stateLabel(a.state))}</span></td>
            <td class="c-act"><button class="btn btn-ghost btn-sm" data-ip-unassign="${esc(a.id)}">Снять</button></td>
          </tr>`;
        }).join('')}</tbody></table></div>
        ${rows.length > shown.length ? `<div class="ip-more"><span>Показаны первые ${shown.length} из ${rows.length}</span>
          <button class="btn btn-ghost btn-sm" data-ip-more>Показать ещё ${Math.min(rows.length - shown.length, STEP)}</button></div>` : ''}`
      : `<div class="ip-empty">${view.q ? 'Ничего не нашлось — измените поиск.' : view.person ? `У осмотрщика ${esc(view.person)} нет действующих назначений.` : 'Действующих назначений нет.'}</div>`}`;
  }

  let all = null;
  let people = [];

  function render() {
    all = summaries();
    people = inspectorRows();
    if (view.person && !people.some((p) => p.name === view.person)) view.person = '';
    const me = people.find((p) => p.name === view.person);
    const queueN = queueRows(all, { q: '', type: '', region: '' }).length;
    const assignedN = assignedRows(all, { person: view.person }).length;
    host.setCrumbs([{ label: 'Осмотры' }]);

    scope.setHTML(`<div class="ip">
      ${peopleHTML(people)}
      <section class="ip-main" aria-label="Назначения">
        <header class="ip-head">
          <h1>${esc(view.person || 'Все осмотрщики')}</h1>
          ${me ? `<p class="ip-sum">В работе ${me.live}${me.late ? ` · <span class="ip-late">просрочено ${me.late}</span>` : ''} · закончено за 30 дней ${me.done}</p>` : '<p class="ip-sum">Назначение осмотров объектов оценки и их ОИ</p>'}
        </header>
        <div class="ip-tabs" role="tablist">
          <button role="tab" data-ip-tab="queue" aria-selected="${view.tab === 'queue'}">К назначению <b>${queueN}</b></button>
          <button role="tab" data-ip-tab="assigned" aria-selected="${view.tab === 'assigned'}">Назначено <b>${assignedN}</b></button>
        </div>
        <div class="ip-pane">${view.tab === 'assigned' ? assignedHTML(all) : queueHTML(all)}</div>
      </section>
    </div>`);
  }

  const keepFocus = (sel) => {
    const el = scope.$(sel);
    const pos = el ? el.selectionStart : 0;
    render();
    const again = scope.$(sel);
    if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (e) { /* type=search */ } }
  };

  function openFor(targets, prev = null) {
    openAssignDialog({
      targets,
      people,
      person: view.person,
      prev,
      onDone(made, who) {
        selected.clear();
        render();
        host.toast(prev ? 'Назначение изменено' : `Назначено: ${who} · ${made.length}`, 'ok');
      },
    });
  }

  const target = (k) => {
    const s = all.get(k);
    return s ? { typeId: s.typeId, ocId: s.id, title: s.title } : null;
  };

  scope.on('click', '[data-ip-person]', (e, b) => { view.person = b.dataset.ipPerson; view.shown = STEP; render(); });
  scope.on('click', '[data-ip-star]', (e, b) => {
    const n = b.dataset.ipStar;
    view.mine = view.mine.includes(n) ? view.mine.filter((x) => x !== n) : [...view.mine, n];
    render();
  });
  scope.on('click', '[data-ip-mode]', (e, b) => { view.peopleMode = b.dataset.ipMode; render(); });
  scope.on('click', '[data-ip-tab]', (e, b) => { view.tab = b.dataset.ipTab; view.q = ''; view.shown = STEP; selected.clear(); render(); });
  scope.on('input', '[data-ip-people-q]', (e, el) => { view.peopleQ = el.value; keepFocus('[data-ip-people-q]'); });
  scope.on('input', '[data-ip-q]', (e, el) => { view.q = el.value; view.shown = STEP; keepFocus('[data-ip-q]'); });
  scope.on('change', '[data-ip-type]', (e, el) => { view.type = el.value; view.shown = STEP; render(); });
  scope.on('change', '[data-ip-region]', (e, el) => { view.region = el.value; view.shown = STEP; render(); });
  scope.on('click', '[data-ip-more]', () => {
    const box = scope.$('.ip-wrap');
    const top = box ? box.scrollTop : 0;
    view.shown = Math.max(view.shown, STEP) + STEP;
    render();
    const again = scope.$('.ip-wrap');
    if (again) again.scrollTop = top;
  });

  // Выбор флажками; щелчок по строке — окно назначения одного объекта.
  scope.on('click', '[data-ip-sel]', (e, el) => {
    e.stopPropagation();
    const k = el.dataset.ipSel;
    if (el.checked) selected.set(k, target(k)); else selected.delete(k);
    render();
  });
  scope.on('click', '[data-ip-all]', (e, el) => {
    scope.$$('[data-ip-sel]').forEach((x) => { const k = x.dataset.ipSel; if (el.checked) selected.set(k, target(k)); else selected.delete(k); });
    render();
  });
  scope.on('click', '.c-check', (e) => e.stopPropagation());
  scope.on('click', '[data-ip-open]', (e, tr) => { const t = target(tr.dataset.ipOpen); if (t) openFor([t]); });
  scope.on('click', '[data-ip-bulk-clear]', () => { selected.clear(); render(); });
  scope.on('click', '[data-ip-bulk-assign]', () => openFor([...selected.values()].filter(Boolean)));

  scope.on('click', '[data-ip-edit]', (e, tr) => {
    if (e.target.closest('[data-ip-unassign]')) return;
    const a = allAssignments().find((x) => x.id === tr.dataset.ipEdit);
    const s = a && all.get(a.typeId + '|' + a.ocId);
    if (a && s) openFor([{ typeId: a.typeId, ocId: a.ocId, title: s.title }], a);
  });
  scope.on('click', '[data-ip-unassign]', async (e, b) => {
    e.stopPropagation();
    const ok = await confirmDialog({ title: 'Снять назначение?', text: 'Назначение уйдёт из работы осмотрщика. Снимки и заметки по нему останутся в истории.', okLabel: 'Снять' });
    if (!ok) return;
    unassign(b.dataset.ipUnassign);
    render();
    host.toast('Назначение снято', 'ok');
  });

  const onChange = () => render();
  window.addEventListener('inside:inspections', onChange);
  window.addEventListener('inside:redraw', onChange);

  render();
  return {
    onRoute() { render(); },
    destroy() {
      window.removeEventListener('inside:inspections', onChange);
      window.removeEventListener('inside:redraw', onChange);
    },
  };
}
