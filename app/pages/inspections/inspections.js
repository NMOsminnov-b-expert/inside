// Панель осмотров — экран регионального менеджера (ТЗ panel-osmotrov-tz,
// разделы 3–3.5; постановка и ответы пользователя 12.10.2026).
//
// Три колонки: осмотрщики с загрузкой — объекты (очередь или назначенные) —
// панель назначения выбранного. Работа идёт на месте, без модальных окон, и
// экран не бывает пустым: при открытии выбрана первая строка (замечание
// пользователя 12.10.2026 «Куча свободного места… Зачем опять модалки?… стили
// в разнобой»; правило графа bez-modalok-prostranstvo-celikom-stili-iz-yadra).
// Поиск, вкладки и таблица — общие примитивы kernel/tokens.css, те же, что в
// «Учреждениях»; своё у страницы — только раскладка.
//
// Видны все осмотрщики; менеджер собирает своих в «Мои осмотрщики» (ответ В5).
import { esc } from '../../kernel/dom.js';
import { persistView } from '../../kernel/viewState.js';
import { allAssignments, profileOf, saveProfile, PROFILE_FIELDS } from '../../kernel/inspections.js';
import {
  summaries, queueRows, queueFacets, assignedRows, inspectorRows, isOverdue, stateLabel, regionOf,
} from './model.js';
import { paneHTML, submitPane, unassign } from './assignPane.js';
import { calendarHTML, bindCalendarPopover, statsHTML, mountStats, destroyStats, historyHTML } from './stats.js';
import { EVENT_LABELS } from './model.js';

// Строки таблиц — порциями: очередь на 20 000 записей — больше тысячи строк.
const STEP = 200;

const view = {
  tab: 'queue',          // queue | assigned | history
  person: '',            // выбранный осмотрщик; пусто — все
  peopleMode: 'all',     // mine | all
  mine: [],              // «Мои осмотрщики»
  q: '',
  type: '',
  objRegion: '',
  histKind: '',          // вид события в «Истории»
  histDay: '',           // день из календаря выездов
  region: '',            // область осмотрщиков (фильтр списка)
  peopleSort: 'name',    // name | free — по имени или по свободным дням
  shown: STEP,
};
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: «Мои осмотрщики» — личная настройка менеджера; в
// макете живёт с видом экрана в браузере. На сервере — список у учётной
// записи менеджера или, когда появится привязка к области, выводится из неё.
persistView('inspections', view, ['tab', 'person', 'peopleMode', 'mine', 'type', 'objRegion', 'histKind', 'region', 'peopleSort']);

const fmtDate = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '');
const SEARCH_ICON = `<svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true">
  <circle cx="6" cy="6" r="4.1" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <path d="M9.2 9.2 12.4 12.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;

export function mountInspections(host) {
  const { scope } = host;
  const checked = new Map();    // отмеченные флажками: key → target
  let current = '';             // строка в панели: key объекта или id назначения
  let confirmRemove = false;
  let editContacts = false;
  const now0 = new Date();
  let ym = { y: now0.getFullYear(), m: now0.getMonth() };
  let peopleQ = '';
  let all = null;
  let people = [];

  const target = (k) => {
    const s = all.get(k);
    return s ? {
      typeId: s.typeId, ocId: s.id, title: s.title || '—',
      sub: [s.typeLabel, s.institution].filter(Boolean).join(' · '), eni: s.eniAll || s.eni,
    } : null;
  };

  // --- осмотрщики ---------------------------------------------------------------
  // Области — из данных: указанные в профилях и выведенные по объектам.
  const regionList = () => [...new Set(people.flatMap((p) => p.regions))].sort((a, b) => a.localeCompare(b, 'ru'));
  // Видимые осмотрщики: «Мои / Все», область, порядок. Тот же набор — в
  // общих графиках, чтобы список и графики говорили об одних людях.
  function visiblePeople() {
    const mine = new Set(view.mine);
    const list = people.filter((p) => (view.peopleMode === 'all' || mine.has(p.name)) && (!view.region || p.regions.includes(view.region)));
    return view.peopleSort === 'free'
      ? list.slice().sort((a, b) => b.free - a.free || a.live - b.live || a.name.localeCompare(b.name, 'ru'))
      : list;
  }

  // Контакты выбранного осмотрщика — в шапке, правка на месте (без окна).
  function contactsHTML(p) {
    const prof = profileOf(p.name);
    if (editContacts) {
      return `<div class="ip-contacts ip-contacts-edit">
        ${PROFILE_FIELDS.map((f) => `<div class="field"><label for="ip-c-${f.key}">${f.label}</label>
          <input class="input" id="ip-c-${f.key}" data-ip-c="${f.key}" type="${f.type || 'text'}" value="${esc(prof[f.key] || '')}"></div>`).join('')}
        <div class="field"><label for="ip-c-regions">Области</label>
          <input class="input" id="ip-c-regions" data-ip-c="regions" value="${esc((prof.regions || []).join(', '))}" placeholder="${esc(p.regions.join(', '))}"></div>
        <div class="ip-contacts-act"><button class="btn btn-ghost btn-sm" data-ip-c-cancel>Отмена</button>
          <button class="btn btn-primary btn-sm" data-ip-c-save>Сохранить</button></div>
      </div>`;
    }
    const tel = (prof.phone || '').replace(/[^\d+]/g, '');
    return `<div class="ip-contacts">
      ${prof.phone ? `<a href="tel:${esc(tel)}">${esc(prof.phone)}</a>` : '<span class="ip-muted">телефон не указан</span>'}
      ${prof.email ? `<a href="mailto:${esc(prof.email)}">${esc(prof.email)}</a>` : '<span class="ip-muted">почта не указана</span>'}
      <span>${p.regions.length ? esc(p.regions.join(', ')) : '<span class="ip-muted">область не указана</span>'}${p.regions.length && p.derived ? ' <span class="ip-muted">(по объектам)</span>' : ''}</span>
      ${prof.note ? `<span class="ip-muted">${esc(prof.note)}</span>` : ''}
      <button class="btn btn-ghost btn-sm" data-ip-c-edit>${prof.phone || prof.email ? 'Изменить контакты' : 'Добавить контакты'}</button>
    </div>`;
  }

  function peopleHTML() {
    const mine = new Set(view.mine);
    const q = peopleQ.trim().toLowerCase();
    const list = visiblePeople().filter((p) => !q || p.name.toLowerCase().includes(q));
    const row = (p) => `<li class="ip-person ${view.person === p.name ? 'on' : ''}">
        <button class="ip-person-main" data-ip-person="${esc(p.name)}" aria-pressed="${view.person === p.name}">
          <span class="ip-person-name">${esc(p.name)}</span>
          <span class="ip-person-load"><span>в работе <b>${p.live}</b></span>
            ${p.late ? `<span class="ip-late">просрочено <b>${p.late}</b></span>` : ''}
            <span>за 30 дн. <b>${p.done}</b></span>
            <span title="Рабочих дней без плановых осмотров на две недели">свободно <b>${p.free}</b> дн.</span></span>
        </button>
        <button class="ip-star ${mine.has(p.name) ? 'on' : ''}" data-ip-star="${esc(p.name)}"
          title="${mine.has(p.name) ? 'Убрать из моих осмотрщиков' : 'Добавить в мои осмотрщики'}"
          aria-label="${mine.has(p.name) ? 'Убрать из моих осмотрщиков' : 'Добавить в мои осмотрщики'}">${mine.has(p.name) ? '★' : '☆'}</button>
      </li>`;
    return `<aside class="ip-people" aria-label="Осмотрщики">
      <div class="ip-people-head">
        <div class="ip-seg" role="group" aria-label="Какие осмотрщики">
          <button data-ip-mode="mine" aria-pressed="${view.peopleMode === 'mine'}">Мои <b>${view.mine.length}</b></button>
          <button data-ip-mode="all" aria-pressed="${view.peopleMode === 'all'}">Все <b>${people.length}</b></button>
        </div>
        <div class="ip-people-filters">
          <select class="select" data-ip-region aria-label="Область осмотрщиков"><option value="">Все области</option>
            ${regionList().map((r) => `<option ${view.region === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
          <select class="select" data-ip-psort aria-label="Порядок осмотрщиков">
            <option value="name" ${view.peopleSort === 'name' ? 'selected' : ''}>По имени</option>
            <option value="free" ${view.peopleSort === 'free' ? 'selected' : ''}>Свободнее сверху</option></select>
        </div>
        <span class="isearch">${SEARCH_ICON}<input data-ip-people-q value="${esc(peopleQ)}" placeholder="Поиск по фамилии" aria-label="Поиск осмотрщика" autocomplete="off"></span>
      </div>
      <ul class="ip-people-list">
        <li class="ip-person ${view.person ? '' : 'on'}"><button class="ip-person-main" data-ip-person="">
          <span class="ip-person-name">Все осмотрщики</span></button></li>
        ${list.map(row).join('')}
      </ul>
      ${view.peopleMode === 'mine' && !list.length ? `<p class="ip-hint ip-people-empty">${view.mine.length ? 'Никого не нашлось — измените поиск.' : 'Своих осмотрщиков нет: отметьте их звёздочкой в списке «Все».'}</p>` : ''}
    </aside>`;
  }

  // --- таблицы --------------------------------------------------------------------
  const more = (n, total) => (total > n ? `<div class="ip-more"><span>Показаны первые ${n} из ${total}</span>
    <button class="btn btn-ghost btn-sm" data-ip-more>Показать ещё ${Math.min(total - n, STEP)}</button></div>` : '');

  function queueHTML(rows) {
    const shown = rows.slice(0, Math.max(view.shown, STEP));
    if (!rows.length) {
      return `<p class="ip-hint ip-empty">${view.q || view.type || view.objRegion ? 'Под условия ничего не подошло — смягчите поиск или фильтры.' : 'Все объекты, удостоверенные по документам, назначены.'}</p>`;
    }
    return `<div class="icols ip-cols"><div class="ip-scroll"><table class="itbl ip-tbl">
      <colgroup><col class="c-check"><col class="c-eni"><col><col class="c-n"><col class="c-n"></colgroup>
      <thead><tr>
        <th class="c-check"><input type="checkbox" data-ip-all aria-label="Отметить показанные" title="Отметить показанные"
          ${shown.length && shown.every((s) => checked.has(s.typeId + '|' + s.id)) ? 'checked' : ''}></th>
        <th>ЕНИ</th><th title="Адрес; ниже — тип ОЦ, учреждение, город">Объект</th>
        <th class="num" title="Объектов имущества">ОИ</th><th class="num" title="Документов у объекта и его ОИ">Док.</th>
      </tr></thead>
      <tbody>${shown.map((s) => {
        const k = s.typeId + '|' + s.id;
        return `<tr data-ip-row="${esc(k)}" class="${current === k ? 'cur' : ''} ${checked.has(k) ? 'sel' : ''}" aria-selected="${current === k}">
          <td class="c-check"><input type="checkbox" data-ip-check="${esc(k)}" ${checked.has(k) ? 'checked' : ''} aria-label="Отметить"></td>
          <td class="mono">${esc(s.eniAll || s.eni || '—')}</td>
          <td><span class="ip-obj"><span class="ip-obj-t">${esc(s.title || '—')}</span>
            <span class="ip-obj-s" title="${esc([s.typeLabel, s.institution, regionOf(s), s.city].filter(Boolean).join(' · '))}">${esc([s.typeLabel, s.institution, s.city].filter(Boolean).join(' · '))}</span></span></td>
          <td class="num">${(s.metrics && s.metrics.oiCount) || 0}</td>
          <td class="num">${(s.metrics && s.metrics.docs) || 0}</td>
        </tr>`;
      }).join('')}</tbody></table></div></div>${more(shown.length, rows.length)}`;
  }

  function assignedHTML(rows) {
    const shown = rows.slice(0, Math.max(view.shown, STEP));
    if (!rows.length) {
      return `<p class="ip-hint ip-empty">${view.q ? 'Ничего не нашлось — измените поиск.' : view.person ? `У осмотрщика ${esc(view.person)} нет действующих назначений.` : 'Действующих назначений нет.'}</p>`;
    }
    return `<div class="icols ip-cols"><div class="ip-scroll"><table class="itbl ip-tbl">
      <colgroup><col class="c-eni"><col><col class="c-oi"><col class="c-person"><col class="c-date"><col class="c-state"></colgroup>
      <thead><tr><th>ЕНИ</th><th>Объект</th><th title="Объекты имущества в назначении">ОИ</th><th>Осмотрщик</th>
        <th class="num" title="Плановая дата осмотра">План</th><th>Состояние</th></tr></thead>
      <tbody>${shown.map(({ a, s }) => {
        const late = isOverdue(a);
        return `<tr data-ip-row="${esc(a.id)}" class="${current === a.id ? 'cur' : ''}" aria-selected="${current === a.id}">
          <td class="mono">${esc(s.eniAll || s.eni || '—')}</td>
          <td><span class="ip-obj"><span class="ip-obj-t">${esc(s.title || '—')}</span>
            <span class="ip-obj-s">${esc([s.typeLabel, s.institution].filter(Boolean).join(' · '))}</span></span></td>
          <td>${a.oiIds && a.oiIds.length ? `${a.oiIds.length} из ${(s.metrics && s.metrics.oiCount) || a.oiIds.length}` : 'все'}</td>
          <td>${esc(a.person)}</td>
          <td class="num ${late ? 'ip-late' : ''}" title="${late ? 'Плановая дата прошла' : ''}">${esc(fmtDate(a.plannedAt) || '—')}</td>
          <td><span class="ip-state st-${esc(a.state)}">${esc(stateLabel(a.state))}</span></td>
        </tr>`;
      }).join('')}</tbody></table></div></div>${more(shown.length, rows.length)}`;
  }

  // --- панель назначения ---------------------------------------------------------
  function pane() {
    if (view.tab === 'queue' && checked.size > 1) {
      return paneHTML({ mode: 'many', people, person: view.person, targets: [...checked.values()] });
    }
    if (view.tab === 'assigned' || view.tab === 'history') {
      const a = allAssignments().find((x) => x.id === current);
      const t = a && target(a.typeId + '|' + a.ocId);
      return t ? paneHTML({ mode: 'one', people, person: view.person, target: t, prev: a, confirmRemove }) : paneHTML({ mode: 'none' });
    }
    const t = current && target(current);
    return t ? paneHTML({ mode: 'one', people, person: view.person, target: t }) : paneHTML({ mode: 'none' });
  }

  // --- отрисовка ------------------------------------------------------------------
  function render() {
    hidePop && hidePop();
    destroyStats();
    all = summaries();
    people = inspectorRows(all);
    if (view.person && !people.some((p) => p.name === view.person)) view.person = '';
    const me = people.find((p) => p.name === view.person);
    const queue = queueRows(all, { ...view, region: view.objRegion });
    const queueN = view.q || view.type || view.objRegion ? queueRows(all, { q: '', type: '', region: '' }).length : queue.length;
    const assigned = assignedRows(all, view);
    const assignedN = view.q ? assignedRows(all, { person: view.person }).length : assigned.length;
    const facets = queueFacets(all);
    const hist = historyHTML(all, { person: view.person, q: view.tab === 'history' ? view.q : '', kind: view.histKind, day: view.histDay }, current, Math.max(view.shown, STEP));
    const histN = historyHTML(all, { person: view.person }, '', 1).total;

    // Экран не бывает пустым: строка, ушедшая из выборки, сменяется первой.
    const keys = view.tab === 'queue' ? queue.map((s) => s.typeId + '|' + s.id)
      : view.tab === 'assigned' ? assigned.map((r) => r.a.id) : hist.keys;
    if (!keys.includes(current)) { current = keys[0] || ''; confirmRemove = false; }

    host.setCrumbs([{ label: 'Осмотры' }]);
    const tab = (k, label, n) => `<button class="itab ${view.tab === k ? 'on' : ''}" role="tab" data-ip-tab="${k}" aria-selected="${view.tab === k}">${label} <b>${n}</b></button>`;

    scope.setHTML(`<div class="ip">
      ${peopleHTML()}
      <section class="ip-work" aria-label="Объекты">
        <header class="ip-head">
          <h1>${esc(view.person || 'Все осмотрщики')}</h1>
          ${me ? `<span class="ip-sum">в работе <b>${me.live}</b>${me.late ? ` · <span class="ip-late">просрочено <b>${me.late}</b></span>` : ''} · закончено за 30 дн. <b>${me.done}</b> · свободно <b>${me.free}</b> дн. из 10</span>
            <a class="btn btn-ghost btn-sm ip-as" href="#/insp?as=${encodeURIComponent(me.name)}" title="Экран осмотрщика — как его видит ${esc(me.name)}">Экран осмотрщика</a>` : ''}
        </header>
        ${me ? contactsHTML(me) : ''}
        ${me ? `<div class="ipc">${calendarHTML(all, me.name, ym)}${statsHTML(me.name)}</div>` : statsHTML('')}
        <div class="itabs" role="tablist">${tab('queue', 'К назначению', queueN)}${tab('assigned', 'Назначено', assignedN)}${tab('history', 'История', histN)}</div>
        <div class="itoolbar ip-toolbar">
          <span class="isearch">${SEARCH_ICON}<input data-ip-q value="${esc(view.q)}" autocomplete="off"
            placeholder="${view.tab === 'queue' ? 'ЕНИ, адрес, учреждение' : view.tab === 'history' ? 'ЕНИ, адрес, осмотрщик, текст' : 'ЕНИ, адрес, осмотрщик'}" aria-label="Поиск">
            ${view.q ? '<button class="isearch-clear" data-ip-q-clear title="Очистить" aria-label="Очистить поиск">×</button>' : ''}</span>
          ${view.tab === 'queue' ? `<select class="select ip-filter" data-ip-type aria-label="Тип ОЦ"><option value="">Все типы ОЦ</option>
              ${facets.types.map((t) => `<option value="${esc(t.id)}" ${view.type === t.id ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select>
            <select class="select ip-filter" data-ip-objregion aria-label="Область объектов"><option value="">Все области</option>
              ${facets.regions.map((r) => `<option ${view.objRegion === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>` : ''}
          ${view.tab === 'history' ? `<select class="select ip-filter" data-ip-kind aria-label="Вид события"><option value="">Все события</option>
              ${Object.entries(EVENT_LABELS).map(([k, l]) => `<option value="${k}" ${view.histKind === k ? 'selected' : ''}>${esc(l[0].toUpperCase() + l.slice(1))}</option>`).join('')}</select>
            ${view.histDay ? `<span class="ip-checked">День ${esc(view.histDay.slice(8, 10) + '.' + view.histDay.slice(5, 7))}
              <button class="isearch-clear ip-checked-x" data-ip-day-clear title="Все дни" aria-label="Показать все дни">×</button></span>` : ''}` : ''}
          ${view.tab === 'queue' && checked.size ? `<span class="ip-checked">Отмечено <b>${checked.size}</b>
            <button class="isearch-clear ip-checked-x" data-ip-bulk-clear title="Снять отметки" aria-label="Снять отметки">×</button></span>` : ''}
        </div>
        ${view.tab === 'queue' ? queueHTML(queue) : view.tab === 'assigned' ? assignedHTML(assigned)
          : hist.html + more(hist.shownN || 0, hist.total)}
      </section>
      ${pane()}
    </div>`);
    plotAfter();
  }

  // Графики рисуются после вставки разметки; прежние уничтожаются (uPlot
  // держит холст и подписки — без destroy они копились бы с каждой отрисовкой).
  function plotAfter() {
    mountStats(scope, host.ensureStyle, { names: visiblePeople().map((p) => p.name), person: view.person })
      .catch((e) => console.warn('Графики не нарисованы', e));
  }

  const keepFocus = (sel) => {
    const el = scope.$(sel);
    const pos = el ? el.selectionStart : 0;
    render();
    const again = scope.$(sel);
    if (again) { again.focus(); again.setSelectionRange(pos, pos); }
  };
  const hidePop = bindCalendarPopover(scope);

  // Отрисовка с сохранением прокрутки таблицы и списка осмотрщиков.
  const redraw = () => {
    const box = scope.$('.ip-scroll');
    const list = scope.$('.ip-people-list');
    const top = box ? box.scrollTop : 0;
    const ltop = list ? list.scrollTop : 0;
    render();
    if (scope.$('.ip-scroll')) scope.$('.ip-scroll').scrollTop = top;
    if (scope.$('.ip-people-list')) scope.$('.ip-people-list').scrollTop = ltop;
  };

  // --- осмотрщики ---
  scope.on('click', '[data-ip-person]', (e, b) => { view.person = b.dataset.ipPerson; editContacts = false; view.shown = STEP; redraw(); });
  scope.on('click', '[data-ip-star]', (e, b) => {
    const n = b.dataset.ipStar;
    view.mine = view.mine.includes(n) ? view.mine.filter((x) => x !== n) : [...view.mine, n];
    redraw();
  });
  scope.on('click', '[data-ip-mode]', (e, b) => { view.peopleMode = b.dataset.ipMode; redraw(); });
  scope.on('input', '[data-ip-people-q]', (e, el) => { peopleQ = el.value; keepFocus('[data-ip-people-q]'); });

  // --- вкладки, поиск, фильтры ---
  scope.on('click', '[data-ip-tab]', (e, b) => {
    view.tab = b.dataset.ipTab; view.q = ''; view.histDay = ''; view.shown = STEP; checked.clear(); current = ''; render();
  });
  scope.on('input', '[data-ip-q]', (e, el) => { view.q = el.value; view.shown = STEP; keepFocus('[data-ip-q]'); });
  scope.on('click', '[data-ip-q-clear]', () => { view.q = ''; render(); });
  scope.on('change', '[data-ip-type]', (e, el) => { view.type = el.value; view.shown = STEP; render(); });
  scope.on('change', '[data-ip-region]', (e, el) => { view.region = el.value; redraw(); });
  scope.on('change', '[data-ip-psort]', (e, el) => { view.peopleSort = el.value; redraw(); });
  scope.on('change', '[data-ip-objregion]', (e, el) => { view.objRegion = el.value; view.shown = STEP; render(); });
  scope.on('click', '[data-ipc-month]', (e, b) => {
    const k = +b.dataset.ipcMonth;
    if (!k) { const d = new Date(); ym = { y: d.getFullYear(), m: d.getMonth() }; } else {
      const d = new Date(ym.y, ym.m + k, 1); ym = { y: d.getFullYear(), m: d.getMonth() };
    }
    redraw();
  });
  scope.on('click', '[data-ip-c-edit]', () => { editContacts = true; redraw(); const f = scope.$('[data-ip-c="phone"]'); if (f) f.focus(); });
  scope.on('click', '[data-ip-c-cancel]', () => { editContacts = false; redraw(); });
  scope.on('click', '[data-ip-c-save]', () => {
    const val = (k) => { const el = scope.$(`[data-ip-c="${k}"]`); return el ? el.value.trim() : ''; };
    saveProfile(view.person, {
      phone: val('phone'), email: val('email'), note: val('note'),
      regions: val('regions').split(',').map((x) => x.trim()).filter(Boolean),
    });
    editContacts = false;
    redraw();
    host.toast('Контакты сохранены', 'ok');
  });
  scope.on('change', '[data-ip-kind]', (e, el) => { view.histKind = el.value; view.shown = STEP; render(); });
  scope.on('click', '[data-ip-day-clear]', () => { view.histDay = ''; render(); });
  // Щелчок по дню графика «Сделано» — история этого дня.
  scope.on('click', '[data-ipc-day]', (e, b) => { view.tab = 'history'; view.histDay = b.dataset.ipcDay; view.q = ''; view.shown = STEP; current = ''; render(); });
  scope.on('click', '[data-ip-more]', () => { view.shown = Math.max(view.shown, STEP) + STEP; redraw(); });

  // --- строки: щелчок — в панель, флажок — в отметки ---
  scope.on('click', '[data-ip-row]', (e, tr) => {
    if (e.target.closest('.c-check')) return;
    current = tr.dataset.ipRow;
    confirmRemove = false;
    redraw();
  });
  scope.on('change', '[data-ip-check]', (e, el) => {
    const k = el.dataset.ipCheck;
    if (el.checked) checked.set(k, target(k)); else checked.delete(k);
    redraw();
  });
  scope.on('change', '[data-ip-all]', (e, el) => {
    scope.$$('[data-ip-check]').forEach((x) => { const k = x.dataset.ipCheck; if (el.checked) checked.set(k, target(k)); else checked.delete(k); });
    redraw();
  });
  scope.on('click', '[data-ip-bulk-clear]', () => { checked.clear(); redraw(); });
  scope.on('click', '[data-ip-unpick]', (e, b) => { checked.delete(b.dataset.ipUnpick); redraw(); });

  // --- панель назначения ---
  scope.on('change', '[data-ip-f-whole]', (e, el) => { const box = scope.$('.ip-oi'); if (box) box.hidden = el.checked; });
  scope.on('click', '[data-ip-f-ok]', () => {
    const paneEl = scope.$('.ip-pane');
    const prev = view.tab !== 'queue' ? allAssignments().find((x) => x.id === current) : null;
    const targets = prev ? [target(prev.typeId + '|' + prev.ocId)]
      : checked.size > 1 ? [...checked.values()] : [target(current)];
    const res = submitPane(paneEl, { targets: targets.filter(Boolean), prev });
    if (res.error) {
      scope.$('[data-ip-err]').textContent = res.error;
      if (res.focus && scope.$(res.focus)) scope.$(res.focus).focus();
      return;
    }
    checked.clear();
    redraw();
    host.toast(prev ? 'Назначение сохранено' : `Назначено: ${res.person} · объектов ${res.made.length}`, 'ok');
  });
  scope.on('click', '[data-ip-remove]', () => { confirmRemove = true; redraw(); });
  scope.on('click', '[data-ip-remove-no]', () => { confirmRemove = false; redraw(); });
  scope.on('click', '[data-ip-remove-yes]', (e, b) => {
    unassign(b.dataset.ipRemoveYes);
    confirmRemove = false;
    redraw();
    host.toast('Назначение снято', 'ok');
  });

  const onChange = () => redraw();
  window.addEventListener('inside:inspections', onChange);
  window.addEventListener('inside:redraw', onChange);

  render();
  return {
    onRoute() { render(); },
    destroy() {
      destroyStats();
      hidePop();
      window.removeEventListener('inside:inspections', onChange);
      window.removeEventListener('inside:redraw', onChange);
    },
  };
}
