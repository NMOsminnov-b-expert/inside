// Панель осмотров — экран регионального менеджера (ТЗ panel-osmotrov-tz,
// разделы 3–4; постановка и ответы пользователя 12.10.2026).
//
// Три раздела — вкладками вверху, у каждого своя раскладка (замечание
// пользователя 12.10.2026: «Не видно сейчас экрана назначений. Учитывай, что
// статистика по человеку отдельно идёт. Переструктурируй эргономично весь
// экран. Сейчас получается лепнина»):
//   * «Назначения» — рабочее место: таблица объектов («К назначению» /
//     «Назначено») и панель назначения выбранного справа; ничего лишнего;
//   * «Осмотрщики» — люди: список с областями и загрузкой слева; справа —
//     сводка по всем (таблица и графики uPlot) или карточка выбранного
//     (контакты, календарь выездов, статистика, его назначения);
//   * «История» — лента событий с фильтрами и сводкой назначения справа.
// Работа на месте, без модальных окон; экран не бывает пустым (правило
// графа bez-modalok-prostranstvo-celikom-stili-iz-yadra). Поиск, вкладки и
// таблицы — общие примитивы kernel/tokens.css.
import { esc } from '../../kernel/dom.js';
import { persistView } from '../../kernel/viewState.js';
import { allAssignments, profileOf, saveProfile, PROFILE_FIELDS } from '../../kernel/inspections.js';
import {
  summaries, queueRows, queueFacets, assignedRows, inspectorRows, isOverdue, stateLabel, regionOf, EVENT_LABELS, periodTotals, dayOf,
} from './model.js';
import { paneHTML, submitPane, unassign } from './assignPane.js';
import { calendarHTML, bindCalendarPopover, statsHTML, mountStats, destroyStats, historyHTML } from './stats.js';
import { detailHTML } from './detail.js';

// Строки таблиц — порциями: очередь на 20 000 записей — больше тысячи строк.
const STEP = 200;

const view = {
  section: 'assign',     // assign | people | history
  tab: 'queue',          // в «Назначениях»: queue | assigned
  person: '',            // в «Осмотрщиках»: выбранный; пусто — все
  personTab: 'trips',    // подраздел карточки: trips | stats | assigns | profile
  allTab: 'summary',     // подраздел «Все осмотрщики»: summary | stats
  assignPerson: '',      // в «Назначениях»: осмотрщик (фильтр «Назначено» и подстановка в панель)
  histPerson: '',        // в «Истории»: осмотрщик
  peopleMode: 'all',     // mine | all
  mine: [],              // «Мои осмотрщики»
  region: '',            // область осмотрщиков
  peopleSort: 'name',    // name | free
  q: '',
  type: '',
  objRegion: '',
  histKind: '',
  histDay: '',
  shown: STEP,
};
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: «Мои осмотрщики» — личная настройка менеджера; в
// макете живёт с видом экрана в браузере. На сервере — список у учётной
// записи менеджера или, когда появится привязка к области, выводится из неё.
persistView('inspections', view, ['section', 'tab', 'person', 'personTab', 'allTab', 'assignPerson', 'histPerson', 'peopleMode', 'mine',
  'region', 'peopleSort', 'type', 'objRegion', 'histKind']);

const fmtDate = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '');
const SEARCH_ICON = `<svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true">
  <circle cx="6" cy="6" r="4.1" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <path d="M9.2 9.2 12.4 12.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;

export function mountInspections(host) {
  const { scope } = host;
  const checked = new Map();    // отмеченные флажками: key → target
  let current = '';             // строка в панели: key объекта или id назначения
  let confirmRemove = false;
  // Панель подробностей: стопка выборов { kind, … }, последний показывается
  // (detail.js). Открывается по щелчку в «Осмотрщиках»; «‹ Назад» — шаг
  // по стопке, «Закрыть» и Escape — убрать панель.
  let detail = [];
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
  const objCell = (s, sub) => `<span class="ip-obj"><span class="ip-obj-t">${esc(s.title || '—')}</span>
    <span class="ip-obj-s">${esc(sub)}</span></span>`;
  const more = (n, total) => (total > n ? `<div class="ip-more"><span>Показаны первые ${n} из ${total}</span>
    <button class="btn btn-ghost btn-sm" data-ip-more>Показать ещё ${Math.min(total - n, STEP)}</button></div>` : '');
  const search = (ph) => `<span class="isearch">${SEARCH_ICON}<input data-ip-q value="${esc(view.q)}" autocomplete="off" placeholder="${esc(ph)}" aria-label="Поиск">
    ${view.q ? '<button class="isearch-clear" data-ip-q-clear title="Очистить" aria-label="Очистить поиск">×</button>' : ''}</span>`;
  const personSelect = (attr, value, label) => `<select class="select ip-filter" ${attr} aria-label="${label}"><option value="">Все осмотрщики</option>
    ${people.map((p) => `<option value="${esc(p.name)}" ${value === p.name ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`;

  // --- осмотрщики: набор, области ------------------------------------------------
  const regionList = () => [...new Set(people.flatMap((p) => p.regions))].sort((a, b) => a.localeCompare(b, 'ru'));
  function visiblePeople() {
    const mine = new Set(view.mine);
    const list = people.filter((p) => (view.peopleMode === 'all' || mine.has(p.name)) && (!view.region || p.regions.includes(view.region)));
    return view.peopleSort === 'free'
      ? list.slice().sort((a, b) => b.free - a.free || a.live - b.live || a.name.localeCompare(b.name, 'ru'))
      : list;
  }

  // ===================== раздел «Назначения» ======================================
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
          <td title="${esc([regionOf(s), s.city].filter(Boolean).join(', '))}">${objCell(s, [s.typeLabel, s.institution, s.city].filter(Boolean).join(' · '))}</td>
          <td class="num">${(s.metrics && s.metrics.oiCount) || 0}</td>
          <td class="num">${(s.metrics && s.metrics.docs) || 0}</td>
        </tr>`;
      }).join('')}</tbody></table></div></div>${more(shown.length, rows.length)}`;
  }

  function assignedHTML(rows) {
    const shown = rows.slice(0, Math.max(view.shown, STEP));
    if (!rows.length) {
      return `<p class="ip-hint ip-empty">${view.q ? 'Ничего не нашлось — измените поиск.' : view.assignPerson ? `У осмотрщика ${esc(view.assignPerson)} нет действующих назначений.` : 'Действующих назначений нет.'}</p>`;
    }
    return `<div class="icols ip-cols"><div class="ip-scroll"><table class="itbl ip-tbl">
      <colgroup><col class="c-eni"><col><col class="c-oi"><col class="c-person"><col class="c-date"><col class="c-state"></colgroup>
      <thead><tr><th>ЕНИ</th><th>Объект</th><th title="Объекты имущества в назначении">ОИ</th><th>Осмотрщик</th>
        <th class="num" title="Плановая дата осмотра">План</th><th>Состояние</th></tr></thead>
      <tbody>${shown.map(({ a, s }) => {
        const late = isOverdue(a);
        return `<tr data-ip-row="${esc(a.id)}" class="${current === a.id ? 'cur' : ''}" aria-selected="${current === a.id}">
          <td class="mono">${esc(s.eniAll || s.eni || '—')}</td>
          <td>${objCell(s, [s.typeLabel, s.institution].filter(Boolean).join(' · '))}</td>
          <td>${a.oiIds && a.oiIds.length ? `${a.oiIds.length} из ${(s.metrics && s.metrics.oiCount) || a.oiIds.length}` : 'все'}</td>
          <td>${esc(a.person)}</td>
          <td class="num ${late ? 'ip-late' : ''}" title="${late ? 'Плановая дата прошла' : ''}">${esc(fmtDate(a.plannedAt) || '—')}</td>
          <td><span class="ip-state st-${esc(a.state)}">${esc(stateLabel(a.state))}</span></td>
        </tr>`;
      }).join('')}</tbody></table></div></div>${more(shown.length, rows.length)}`;
  }

  function assignSection() {
    const queue = queueRows(all, { ...view, region: view.objRegion });
    const queueN = view.q || view.type || view.objRegion ? queueRows(all, { q: '', type: '', region: '' }).length : queue.length;
    const assigned = assignedRows(all, { q: view.q, person: view.assignPerson });
    const assignedN = view.q ? assignedRows(all, { person: view.assignPerson }).length : assigned.length;
    const facets = queueFacets(all);
    const keys = view.tab === 'queue' ? queue.map((s) => s.typeId + '|' + s.id) : assigned.map((r) => r.a.id);
    if (!keys.includes(current)) { current = keys[0] || ''; confirmRemove = false; }
    const sub = (k, label, n) => `<button class="itab ${view.tab === k ? 'on' : ''}" role="tab" data-ip-tab="${k}" aria-selected="${view.tab === k}">${label} <b>${n}</b></button>`;
    return { cls: 'ip-assign', html: `<section class="ip-work" aria-label="Назначения">
        <div class="itabs" role="tablist">${sub('queue', 'К назначению', queueN)}${sub('assigned', 'Назначено', assignedN)}</div>
        <div class="itoolbar ip-toolbar">
          ${search(view.tab === 'queue' ? 'ЕНИ, адрес, учреждение' : 'ЕНИ, адрес, осмотрщик')}
          ${view.tab === 'queue' ? `<select class="select ip-filter" data-ip-type aria-label="Тип ОЦ"><option value="">Все типы ОЦ</option>
              ${facets.types.map((t) => `<option value="${esc(t.id)}" ${view.type === t.id ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select>
            <select class="select ip-filter" data-ip-objregion aria-label="Область объектов"><option value="">Все области</option>
              ${facets.regions.map((r) => `<option ${view.objRegion === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>` : ''}
          ${personSelect('data-ip-aperson', view.assignPerson, 'Осмотрщик')}
          ${view.tab === 'queue' && checked.size ? `<span class="ip-checked">Отмечено <b>${checked.size}</b>
            <button class="isearch-clear ip-checked-x" data-ip-bulk-clear title="Снять отметки" aria-label="Снять отметки">×</button></span>` : ''}
        </div>
        ${view.tab === 'queue' ? queueHTML(queue) : assignedHTML(assigned)}
      </section>${pane()}` };
  }

  // ===================== раздел «Осмотрщики» ======================================
  // Карточка осмотрщика — шапка (цифры, контакты, действия) и подразделы
  // «Выезды · Статистика · Назначения · Профиль»: на экране один подраздел во
  // всю ширину (ответ пользователя 12.10.2026 «Карточка — подразделами» на
  // замечание «Ты сейчас всё списком по вертикали выкатил… делим на логичные
  // разделы»). «Все осмотрщики» — так же: «Сводка · Статистика».
  function peopleListHTML() {
    const mine = new Set(view.mine);
    const q = peopleQ.trim().toLowerCase();
    const list = visiblePeople().filter((p) => !q || p.name.toLowerCase().includes(q));
    const row = (p) => `<li class="ip-person ${view.person === p.name ? 'on' : ''}">
        <button class="ip-person-main" data-ip-person="${esc(p.name)}" aria-pressed="${view.person === p.name}">
          <span class="ip-person-name">${esc(p.name)}</span>
          <span class="ip-person-load"><span>в работе <b>${p.live}</b></span>
            ${p.late ? `<span class="ip-late">просрочено <b>${p.late}</b></span>` : ''}
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
          <span class="ip-person-name">Все осмотрщики</span><span class="ip-person-load"><span>сводка и сравнение</span></span></button></li>
        ${list.map(row).join('')}
      </ul>
      ${view.peopleMode === 'mine' && !list.length ? `<p class="ip-hint ip-people-empty">${view.mine.length ? 'Никого не нашлось — измените поиск.' : 'Своих осмотрщиков нет: отметьте их звёздочкой в списке «Все».'}</p>` : ''}
    </aside>`;
  }

  const subTabs = (attr, cur, items) => `<div class="itabs ip-subtabs" role="tablist">${items.map(([k, label, n]) =>
    `<button class="itab ${cur === k ? 'on' : ''}" role="tab" ${attr}="${k}" aria-selected="${cur === k}">${label}${n !== undefined ? ` <b>${n}</b>` : ''}</button>`).join('')}</div>`;
  const tile = (label, value, cls = '', hint = '') => `<div class="ip-tile ${cls}" ${hint ? `title="${esc(hint)}"` : ''}><span>${label}</span><b>${value}</b></div>`;

  // Сводная таблица всех — щелчок по строке открывает краткую карточку справа.
  function peopleTableHTML(list) {
    if (!list.length) return '<p class="ip-hint ip-empty">Под фильтр никто не подошёл.</p>';
    const sel = detail.length && detail[detail.length - 1].kind === 'person' ? detail[detail.length - 1].name : '';
    return `<div class="icols ip-cols ip-ptable"><div class="ip-scroll"><table class="itbl ip-tbl">
      <colgroup><col><col class="c-region"><col class="c-k"><col class="c-k"><col class="c-k"><col class="c-k"></colgroup>
      <thead><tr><th>Осмотрщик</th><th>Области</th><th class="num" title="Действующих назначений">В работе</th>
        <th class="num" title="Плановая дата прошла">Просрочено</th><th class="num" title="Рабочих дней без плановых осмотров на две недели">Свободно</th>
        <th class="num" title="Законченных назначений за 30 дней">За 30 дн.</th></tr></thead>
      <tbody>${list.map((p) => `<tr data-ip-dp-open="person:${esc(p.name)}" class="${sel === p.name ? 'cur' : ''}">
        <td>${esc(p.name)}</td><td>${esc(p.regions.join(', ') || '—')}</td>
        <td class="num">${p.live}</td><td class="num ${p.late ? 'ip-late' : ''}">${p.late || '—'}</td>
        <td class="num"><b>${p.free}</b></td><td class="num">${p.done}</td></tr>`).join('')}</tbody>
    </table></div></div>`;
  }

  // Назначения осмотрщика — действующие и законченные за 30 дней; щелчок —
  // подробности справа.
  function personAssignsHTML(name) {
    const since = new Date(); since.setDate(since.getDate() - 30);
    const sinceIso = since.toISOString();
    const rows = allAssignments().filter((a) => a.person === name && (a.state === 'assigned' || a.state === 'progress' || (a.state === 'done' && a.doneAt >= sinceIso)))
      .sort((x, y) => String(y.plannedAt || '').localeCompare(String(x.plannedAt || '')));
    const sel = detail.length && detail[detail.length - 1].kind === 'assign' ? detail[detail.length - 1].id : '';
    if (!rows.length) return '<p class="ip-hint ip-empty">Назначений нет.</p>';
    return `<div class="icols ip-cols"><div class="ip-scroll"><table class="itbl ip-tbl">
      <colgroup><col class="c-date"><col><col class="c-oi"><col class="c-state"></colgroup>
      <thead><tr><th class="num">План</th><th>Объект</th><th>ОИ</th><th>Состояние</th></tr></thead>
      <tbody>${rows.map((a) => { const s = all.get(a.typeId + '|' + a.ocId) || {}; return `<tr data-ip-dp-open="assign:${esc(a.id)}" class="${sel === a.id ? 'cur' : ''}">
        <td class="num ${isOverdue(a) ? 'ip-late' : ''}">${esc(fmtDate(a.plannedAt) || '—')}</td>
        <td>${objCell(s, [s.typeLabel, s.institution].filter(Boolean).join(' · '))}</td>
        <td>${a.oiIds && a.oiIds.length ? a.oiIds.length : 'все'}</td>
        <td><span class="ip-state st-${esc(a.state)}">${esc(stateLabel(a.state))}</span></td></tr>`; }).join('')}</tbody>
    </table></div></div>`;
  }

  function profileHTML(p) {
    const prof = profileOf(p.name);
    return `<div class="ip-profile">
      ${PROFILE_FIELDS.map((f) => `<div class="field"><label for="ip-c-${f.key}">${f.label}</label>
        <input class="input" id="ip-c-${f.key}" data-ip-c="${f.key}" type="${f.type || 'text'}" value="${esc(prof[f.key] || '')}"></div>`).join('')}
      <div class="field"><label for="ip-c-regions">Области</label>
        <input class="input" id="ip-c-regions" data-ip-c="regions" value="${esc((prof.regions || []).join(', '))}" placeholder="${esc(p.regions.join(', '))}"></div>
      <div class="ip-profile-act"><span class="ip-hint">${p.derived && p.regions.length ? `Пока области не указаны, они берутся по объектам осмотрщика: ${esc(p.regions.join(', '))}.` : ''}</span>
        <button class="btn btn-primary btn-sm" data-ip-c-save>Сохранить</button></div>
    </div>`;
  }

  function personCardHTML(me) {
    const prof = profileOf(me.name);
    const tel = (prof.phone || '').replace(/[^\d+]/g, '');
    const since = new Date(); since.setDate(since.getDate() - 29);
    const t = periodTotals(me.name, dayOf(since.toISOString()));
    let body;
    if (view.personTab === 'stats') {
      body = `<div class="ip-tiles">${tile('ОИ за 30 дн.', t.oi)}${tile('Объектов', t.objects)}${tile('Снимков', t.photos)}
        ${tile('Заметок', t.notes)}${tile('Расхождений', t.mismatch, t.mismatch ? 'warn' : '')}${tile('Выявлено', t.found)}</div>${statsHTML(me.name)}`;
    } else if (view.personTab === 'assigns') body = personAssignsHTML(me.name);
    else if (view.personTab === 'profile') body = profileHTML(me);
    else body = calendarHTML(all, me.name, ym);
    return `<section class="ip-work ip-card" aria-label="${esc(me.name)}">
      <header class="ip-card-head">
        <div class="ip-card-title"><h1>${esc(me.name)}</h1>
          <p class="ip-card-contacts">${prof.phone ? `<a href="tel:${esc(tel)}">${esc(prof.phone)}</a>` : '<span class="ip-muted">телефон не указан</span>'}
            · ${prof.email ? `<a href="mailto:${esc(prof.email)}">${esc(prof.email)}</a>` : '<span class="ip-muted">почта не указана</span>'}
            · ${esc(me.regions.join(', ') || 'область не указана')}${me.derived && me.regions.length ? ' <span class="ip-muted">(по объектам)</span>' : ''}</p></div>
        <div class="ip-tiles ip-tiles-head">${tile('В работе', me.live)}${tile('Просрочено', me.late, me.late ? 'warn' : '')}
          ${tile('Свободно', `${me.free} дн.`, '', 'Рабочих дней без плановых осмотров из ближайших 10')}${tile('За 30 дн.', me.done, '', 'Законченных назначений')}</div>
        <div class="ip-head-act">
          <button class="btn btn-primary btn-sm" data-ip-assign-to="${esc(me.name)}">Назначить объекты</button>
          <a class="btn btn-ghost btn-sm" href="#/insp?as=${encodeURIComponent(me.name)}" title="Экран осмотрщика — как его видит ${esc(me.name)}">Экран осмотрщика</a>
        </div>
      </header>
      ${subTabs('data-ip-ptab', view.personTab, [['trips', 'Выезды'], ['stats', 'Статистика'], ['assigns', 'Назначения', me.live], ['profile', 'Профиль']])}
      <div class="ip-card-body">${body}</div>
    </section>`;
  }

  function allCardHTML() {
    const list = visiblePeople();
    const sum = (k) => list.reduce((n, p) => n + p[k], 0);
    return `<section class="ip-work ip-card" aria-label="Все осмотрщики">
      <header class="ip-card-head">
        <div class="ip-card-title"><h1>Все осмотрщики</h1><p class="ip-card-contacts">${list.length} · ${esc(view.region || 'все области')}</p></div>
        <div class="ip-tiles ip-tiles-head">${tile('В работе', sum('live'))}${tile('Просрочено', sum('late'), sum('late') ? 'warn' : '')}
          ${tile('Свободных дней', sum('free'), '', 'Сумма рабочих дней без плановых осмотров из ближайших 10')}${tile('За 30 дн.', sum('done'))}</div>
      </header>
      ${subTabs('data-ip-atab', view.allTab, [['summary', 'Сводка'], ['stats', 'Статистика']])}
      <div class="ip-card-body">${view.allTab === 'stats' ? statsHTML('') : peopleTableHTML(list)}</div>
    </section>`;
  }

  function peopleSection() {
    const me = people.find((p) => p.name === view.person);
    const panel = detail.length ? detailHTML(all, people, allAssignments(), detail.map((d) => (d.kind === 'day' ? { ...d, person: view.person } : d))) : '';
    return { cls: 'ip-peoplesec' + (panel ? ' has-detail' : ''), html: peopleListHTML() + (me ? personCardHTML(me) : allCardHTML()) + panel };
  }

  // ===================== раздел «История» =========================================
  function historySection() {
    const f = { person: view.histPerson, q: view.q, kind: view.histKind, day: view.histDay };
    const hist = historyHTML(all, f, current, Math.max(view.shown, STEP));
    if (!hist.keys.includes(current)) { current = hist.keys[0] || ''; confirmRemove = false; }
    const again = current ? historyHTML(all, f, current, Math.max(view.shown, STEP)) : hist;
    return { cls: 'ip-histsec', html: `<section class="ip-work" aria-label="История">
        <div class="itoolbar ip-toolbar">
          ${search('ЕНИ, адрес, осмотрщик, текст')}
          ${personSelect('data-ip-hperson', view.histPerson, 'Осмотрщик')}
          <select class="select ip-filter" data-ip-kind aria-label="Вид события"><option value="">Все события</option>
            ${Object.entries(EVENT_LABELS).map(([k, l]) => `<option value="${k}" ${view.histKind === k ? 'selected' : ''}>${esc(l[0].toUpperCase() + l.slice(1))}</option>`).join('')}</select>
          ${view.histDay ? `<span class="ip-checked">День ${esc(view.histDay.slice(8, 10) + '.' + view.histDay.slice(5, 7))}
            <button class="isearch-clear ip-checked-x" data-ip-day-clear title="Все дни" aria-label="Показать все дни">×</button></span>` : ''}
        </div>
        ${again.html}${more(again.shownN || 0, again.total)}
      </section>${pane()}` };
  }

  // --- панель назначения (разделы «Назначения» и «История») -------------------------
  function pane() {
    if (view.section === 'assign' && view.tab === 'queue' && checked.size > 1) {
      return paneHTML({ mode: 'many', people, person: view.assignPerson, targets: [...checked.values()] });
    }
    if (view.section === 'history' || view.tab === 'assigned') {
      const a = allAssignments().find((x) => x.id === current);
      const t = a && target(a.typeId + '|' + a.ocId);
      return t ? paneHTML({ mode: 'one', people, person: view.assignPerson, target: t, prev: a, confirmRemove }) : paneHTML({ mode: 'none' });
    }
    const t = current && target(current);
    return t ? paneHTML({ mode: 'one', people, person: view.assignPerson, target: t }) : paneHTML({ mode: 'none' });
  }

  // --- отрисовка ------------------------------------------------------------------
  function render() {
    hidePop();
    destroyStats();
    all = summaries();
    people = inspectorRows(all);
    if (view.person && !people.some((p) => p.name === view.person)) view.person = '';
    host.setCrumbs([{ label: 'Осмотры' }]);
    const sec = view.section === 'people' ? peopleSection() : view.section === 'history' ? historySection() : assignSection();
    const top = (k, label) => `<button class="itab ${view.section === k ? 'on' : ''}" role="tab" data-ip-section="${k}" aria-selected="${view.section === k}">${label}</button>`;
    scope.setHTML(`<div class="ip-page">
      <nav class="itabs ip-sections" role="tablist" aria-label="Разделы осмотров">
        ${top('assign', 'Назначения')}${top('people', 'Осмотрщики')}${top('history', 'История')}
      </nav>
      <div class="ip ${sec.cls}">${sec.html}</div>
    </div>`);
    if (view.section === 'people') {
      mountStats(scope, host.ensureStyle, { names: visiblePeople().map((p) => p.name), person: view.person })
        .catch((e) => console.warn('Графики не нарисованы', e));
    }
  }

  const hidePop = bindCalendarPopover(scope);
  const keepFocus = (sel) => {
    const el = scope.$(sel);
    const pos = el ? el.selectionStart : 0;
    render();
    const again = scope.$(sel);
    if (again) { again.focus(); again.setSelectionRange(pos, pos); }
  };
  // Отрисовка с сохранением прокрутки таблиц и списка осмотрщиков.
  const redraw = () => {
    const keep = ['.ip-scroll', '.ip-people-list', '.ip-card-body', '.ip-detail-pane .ip-pane-body'].map((s) => [s, scope.$(s) ? scope.$(s).scrollTop : 0]);
    render();
    keep.forEach(([s, y]) => { if (scope.$(s)) scope.$(s).scrollTop = y; });
  };
  const resetList = () => { view.q = ''; view.shown = STEP; checked.clear(); current = ''; confirmRemove = false; };

  // --- разделы и вкладки ---
  scope.on('click', '[data-ip-section]', (e, b) => { view.section = b.dataset.ipSection; detail = []; resetList(); render(); });
  scope.on('click', '[data-ip-tab]', (e, b) => { view.tab = b.dataset.ipTab; resetList(); render(); });

  // --- осмотрщики ---
  scope.on('click', '[data-ip-person]', (e, el) => { view.person = el.dataset.ipPerson; detail = []; redraw(); });
  scope.on('click', '[data-ip-star]', (e, b) => {
    const n = b.dataset.ipStar;
    view.mine = view.mine.includes(n) ? view.mine.filter((x) => x !== n) : [...view.mine, n];
    redraw();
  });
  scope.on('click', '[data-ip-mode]', (e, b) => { view.peopleMode = b.dataset.ipMode; redraw(); });
  scope.on('input', '[data-ip-people-q]', (e, el) => { peopleQ = el.value; keepFocus('[data-ip-people-q]'); });
  scope.on('change', '[data-ip-region]', (e, el) => { view.region = el.value; redraw(); });
  scope.on('change', '[data-ip-psort]', (e, el) => { view.peopleSort = el.value; redraw(); });
  scope.on('click', '[data-ipc-month]', (e, b) => {
    const k = +b.dataset.ipcMonth;
    const d = k ? new Date(ym.y, ym.m + k, 1) : new Date();
    ym = { y: d.getFullYear(), m: d.getMonth() };
    redraw();
  });
  // «Назначить объекты» — в «Назначения» с этим осмотрщиком в панели.
  scope.on('click', '[data-ip-assign-to]', (e, b) => {
    view.section = 'assign'; view.tab = 'queue'; view.assignPerson = b.dataset.ipAssignTo; detail = []; resetList(); render();
  });
  // Назначение из панели подробностей — открыть его в «Назначениях».
  const gotoAssign = (id) => { view.section = 'assign'; view.tab = 'assigned'; view.assignPerson = ''; resetList(); current = id; render(); };
  scope.on('click', '[data-ip-ptab]', (e, b) => { view.personTab = b.dataset.ipPtab; detail = []; render(); });
  scope.on('click', '[data-ip-atab]', (e, b) => { view.allTab = b.dataset.ipAtab; detail = []; render(); });
  scope.on('click', '[data-ip-c-save]', () => {
    const val = (k) => { const el = scope.$(`[data-ip-c="${k}"]`); return el ? el.value.trim() : ''; };
    saveProfile(view.person, {
      phone: val('phone'), email: val('email'), note: val('note'),
      regions: val('regions').split(',').map((x) => x.trim()).filter(Boolean),
    });
    redraw();
    host.toast('Профиль сохранён', 'ok');
  });

  // --- панель подробностей ---
  const openDetail = (spec, push) => {
    const i = spec.indexOf(':');
    const kind = spec.slice(0, i); const id = spec.slice(i + 1);
    const sel = kind === 'day' ? { kind, day: id } : kind === 'person' ? { kind, name: id } : { kind, id };
    detail = push ? [...detail, sel] : [sel];
    redraw();
  };
  // Щелчок в рабочей области — новый выбор; внутри панели — шаг вглубь.
  scope.on('click', '[data-ip-dp-open]', (e, el) => openDetail(el.dataset.ipDpOpen, !!el.closest('.ip-detail-pane')));
  scope.on('keydown', '[data-ip-dp-open]', (e, el) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(el.dataset.ipDpOpen, !!el.closest('.ip-detail-pane')); } });
  scope.on('click', '[data-ip-dp-back]', () => { detail = detail.slice(0, -1); redraw(); });
  scope.on('click', '[data-ip-dp-close]', () => { detail = []; redraw(); });
  scope.onDocument('keydown', (e) => { if (e.key === 'Escape' && detail.length && view.section === 'people') { detail = []; redraw(); } });
  scope.on('click', '[data-ip-dp-history]', (e, b) => {
    view.section = 'history'; view.histPerson = view.person; view.histDay = b.dataset.ipDpHistory; detail = []; resetList(); render();
  });
  scope.on('click', '[data-ip-dp-edit]', (e, b) => { detail = []; gotoAssign(b.dataset.ipDpEdit); });

  // --- поиск и фильтры ---
  scope.on('input', '[data-ip-q]', (e, el) => { view.q = el.value; view.shown = STEP; keepFocus('[data-ip-q]'); });
  scope.on('click', '[data-ip-q-clear]', () => { view.q = ''; render(); });
  scope.on('change', '[data-ip-type]', (e, el) => { view.type = el.value; view.shown = STEP; render(); });
  scope.on('change', '[data-ip-objregion]', (e, el) => { view.objRegion = el.value; view.shown = STEP; render(); });
  scope.on('change', '[data-ip-aperson]', (e, el) => { view.assignPerson = el.value; view.shown = STEP; render(); });
  scope.on('change', '[data-ip-hperson]', (e, el) => { view.histPerson = el.value; view.shown = STEP; render(); });
  scope.on('change', '[data-ip-kind]', (e, el) => { view.histKind = el.value; view.shown = STEP; render(); });
  scope.on('click', '[data-ip-day-clear]', () => { view.histDay = ''; render(); });
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
    const prev = view.section === 'history' || view.tab === 'assigned' ? allAssignments().find((x) => x.id === current) : null;
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
