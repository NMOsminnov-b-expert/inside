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
import {
  allAssignments, profileOf, saveProfile, addAbsence, removeAbsence, ABSENCE_KINDS, absenceLabel, WEEKDAYS, whatsappLink,
  deadlineOf, setDeadline, reassignMany, moveDateMany, unassignMany, stallOf, workdayOf,
  FIELD_KINDS, allCustomFields, addCustomField, removeCustomField, poaDaysLeft,
} from '../../kernel/inspections.js';
import { ENI_REGIONS, plural } from '../../kernel/fmt.js';
import {
  summaries, assignedRows, inspectorRows, isOverdue, stateLabel, regionOf, EVENT_LABELS, periodTotals, dayOf, COVERAGE,
  queueBase, queueFilter, queueCounts, tripGroups, DUE, dueOf, availability, rankInspectors, onSiteContacts, ASSIGNED_PICKS, assignedPickOf,
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
  cov: '',               // «К назначению»: покрытие ОИ (COVERAGE)
  due: '',               // «К назначению»: срочность (DUE)
  inst: '',              // «К назначению»: учреждение
  pick: '',              // «Назначено»: быстрый отбор (ASSIGNED_PICKS)
  histKind: '',
  histDay: '',
  shown: STEP,
};
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: «Мои осмотрщики» — личная настройка менеджера; в
// макете живёт с видом экрана в браузере. На сервере — список у учётной
// записи менеджера или, когда появится привязка к области, выводится из неё.
persistView('inspections', view, ['section', 'tab', 'person', 'personTab', 'allTab', 'assignPerson', 'histPerson', 'peopleMode', 'mine',
  'region', 'peopleSort', 'type', 'objRegion', 'cov', 'due', 'inst', 'pick', 'histKind']);

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
  // Свёрнутые группы (место выезда или «a:ФИО») и группа, в которой открыт
  // выбор «Переназначить все…».
  const collapsed = new Set();
  let reassignGroup = '';
  // Черновик панели назначения: выбранный осмотрщик и дата — переживают
  // перерисовку (подсказка «Кого назначить» и полоса дней перестраиваются).
  let draft = { key: '', person: '', date: '' };
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
  // Решения пользователя 12.10.2026 (запись графа upravlenie-osmotrschikami-
  // instrumenty): «К назначению» — выезды по месту (объекты по городу и
  // району, горящие сверху, группа отмечается целиком), слева — фильтры со
  // счётчиками; «Назначено» — по осмотрщикам, с быстрыми отборами и массовыми
  // действиями; в панели — «Кого назначить» и доступность на 10 дней.

  // Покрытие ОИ: полоса «осмотрено · назначено · свободно» и подпись.
  function covCell(c) {
    const pc = (n) => `${Math.round((n / c.total) * 100)}%`;
    const tip = `ОИ: осмотрено ${c.done}, назначено ${c.live}, свободно ${c.free} из ${c.total}`;
    return `<span class="ip-cov" title="${esc(tip)}"><span class="ip-cov-bar">
        ${c.done ? `<i class="k-done" style="width:${pc(c.done)}"></i>` : ''}${c.live ? `<i class="k-plan" style="width:${pc(c.live)}"></i>` : ''}</span>
      <span class="ip-cov-t">${c.state === 'none' ? `${c.total}` : `своб. ${c.free} из ${c.total}`}</span></span>`;
  }
  const dueCell = (s) => (s.deadline
    ? `<span class="ip-due due-${s.due}" title="Крайний срок осмотра">${esc(fmtDate(s.deadline))}</span>`
    : '<span class="ip-muted">—</span>');

  // Фасет: строки «значение · число», щелчок выбирает, повторный — снимает.
  function facetHTML(title, attr, cur, items) {
    if (!items.length) return '';
    return `<section class="ip-facet"><h3>${title}</h3>
      ${items.map(([k, label, n]) => `<button class="ip-fopt ${cur === k ? 'on' : ''}" ${attr}="${esc(k)}" aria-pressed="${cur === k}">
        <span>${esc(label)}</span><b>${n}</b></button>`).join('')}
    </section>`;
  }

  function queueFacetsHTML(counts) {
    const ord = (m, list) => list.filter(([k]) => m.get(k)).map(([k, l]) => [k, l, m.get(k)]);
    const top = (m, labelOf = (k) => k) => [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'ru')).slice(0, 12).map(([k, n]) => [k, labelOf(k), n]);
    return `<aside class="ip-facets" aria-label="Фильтры">
      ${facetHTML('Срок', 'data-ip-fdue', view.due, ord(counts.due, DUE.map((d) => [d.key, d.label])))}
      ${facetHTML('Покрытие ОИ', 'data-ip-fcov', view.cov, ord(counts.cov, COVERAGE.filter((c) => c.key).map((c) => [c.key, c.label])))}
      ${facetHTML('Область', 'data-ip-fregion', view.objRegion, top(counts.region))}
      ${facetHTML('Тип ОЦ', 'data-ip-ftype', view.type, top(counts.type, (k) => counts.typeLabel.get(k) || k))}
      ${facetHTML('Учреждение', 'data-ip-finst', view.inst, top(counts.inst))}
    </aside>`;
  }

  function queueHTML(rows) {
    if (!rows.length) {
      return `<p class="ip-hint ip-empty">${view.q || view.type || view.objRegion || view.cov || view.due || view.inst ? 'Под условия ничего не подошло — снимите часть фильтров слева.' : 'Все объекты, удостоверенные по документам, назначены.'}</p>`;
    }
    const groups = tripGroups(rows.slice(0, Math.max(view.shown, STEP)));
    const allKeys = (g) => g.rows.map((s) => s.typeId + '|' + s.id);
    return `<div class="icols ip-cols"><div class="ip-scroll"><table class="itbl ip-tbl ip-grouped">
      <colgroup><col class="c-check"><col class="c-date"><col class="c-eni"><col><col class="c-cov"><col class="c-n"></colgroup>
      <thead><tr><th class="c-check"></th><th title="Крайний срок осмотра">Срок</th><th>ЕНИ</th>
        <th title="Адрес; ниже — тип ОЦ, учреждение">Объект</th><th title="Объекты имущества: осмотрено · назначено · свободно">ОИ</th><th class="num" title="Документов у объекта и его ОИ">Док.</th></tr></thead>
      ${groups.map((g) => {
        const keys = allKeys(g);
        const allOn = keys.every((k) => checked.has(k));
        const open = !collapsed.has(g.place);
        return `<tbody class="ip-grp-body"><tr class="ip-grp">
            <td class="c-check"><input type="checkbox" data-ip-gcheck="${esc(g.place)}" ${allOn ? 'checked' : ''} aria-label="Отметить выезд целиком" title="Отметить выезд целиком"></td>
            <td colspan="5"><button class="ip-grp-t" data-ip-gtoggle="${esc(g.place)}" aria-expanded="${open}">
              <span class="ip-grp-chev">${open ? '▾' : '▸'}</span><b>${esc(g.place)}</b>
              <span>${g.rows.length} ${plural(g.rows.length, 'объект', 'объекта', 'объектов')} · свободных ОИ ${g.free}</span>
              ${g.nearest !== '9999' ? `<span class="ip-due due-${dueOf(g.nearest)}">срок с ${esc(fmtDate(g.nearest))}</span>` : ''}</button></td></tr>
          ${open ? g.rows.map((s) => {
            const k = s.typeId + '|' + s.id;
            return `<tr data-ip-row="${esc(k)}" data-cov="${s.cov.state}" class="${current === k ? 'cur' : ''} ${checked.has(k) ? 'sel' : ''}" aria-selected="${current === k}">
              <td class="c-check"><input type="checkbox" data-ip-check="${esc(k)}" ${checked.has(k) ? 'checked' : ''} aria-label="Отметить"></td>
              <td class="num">${dueCell(s)}</td>
              <td class="mono">${esc(s.eniAll || s.eni || '—')}</td>
              <td>${objCell(s, [s.typeLabel, s.institution].filter(Boolean).join(' · '))}</td>
              <td>${covCell(s.cov)}</td>
              <td class="num">${(s.metrics && s.metrics.docs) || 0}</td>
            </tr>`;
          }).join('') : ''}</tbody>`;
      }).join('')}
    </table></div></div>${more(Math.min(rows.length, Math.max(view.shown, STEP)), rows.length)}`;
  }

  // «Назначено» по осмотрщикам: группа — человек с загрузкой и отсутствием,
  // «Переназначить все…» — в строке группы, на месте.
  function assignedHTML(rows) {
    if (!rows.length) {
      return `<p class="ip-hint ip-empty">${view.q || view.pick ? 'Под отбор ничего не подошло.' : 'Действующих назначений нет.'}</p>`;
    }
    const by = new Map();
    rows.forEach((r) => { if (!by.has(r.a.person)) by.set(r.a.person, []); by.get(r.a.person).push(r); });
    const others = (name) => people.filter((p) => !p.fired && p.name !== name);
    return `<div class="icols ip-cols"><div class="ip-scroll"><table class="itbl ip-tbl ip-grouped">
      <colgroup><col class="c-check"><col class="c-date"><col class="c-eni"><col><col class="c-oi"><col class="c-state"></colgroup>
      <thead><tr><th class="c-check"></th><th class="num" title="Плановая дата осмотра">План</th><th>ЕНИ</th><th>Объект</th><th title="Объекты имущества в назначении">ОИ</th><th>Состояние</th></tr></thead>
      ${[...by.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru')).map(([name, list]) => {
        const p = people.find((x) => x.name === name) || { live: list.length, late: 0, free: 0 };
        const open = !collapsed.has('a:' + name);
        const ids = list.map((r) => r.a.id);
        return `<tbody class="ip-grp-body"><tr class="ip-grp">
            <td class="c-check"><input type="checkbox" data-ip-gacheck="${esc(name)}" ${ids.every((id) => checked.has(id)) ? 'checked' : ''} aria-label="Отметить все назначения осмотрщика"></td>
            <td colspan="5"><div class="ip-grp-row">
              <button class="ip-grp-t" data-ip-gtoggle="${esc('a:' + name)}" aria-expanded="${open}"><span class="ip-grp-chev">${open ? '▾' : '▸'}</span><b>${esc(name)}</b>
                <span>${list.length} · в работе ${p.live}${p.late ? ` · <span class="ip-late">просрочено ${p.late}</span>` : ''} · свободно ${p.free} дн.</span>
                ${p.away ? `<span class="ip-badge away">${esc(p.away.label.toLowerCase())} до ${esc(fmtDate(p.away.to))}</span>` : ''}</button>
              ${reassignGroup === name ? `<span class="ip-grp-act"><select class="select" data-ip-rg-person aria-label="Кому переназначить"><option value="">— кому —</option>
                  ${others(name).map((x) => `<option value="${esc(x.name)}">${esc(x.name)} · в работе ${x.live}</option>`).join('')}</select>
                <button class="btn btn-primary btn-sm" data-ip-rg-ok="${esc(name)}">Переназначить ${list.length}</button>
                <button class="btn btn-ghost btn-sm" data-ip-rg-cancel>Отмена</button></span>`
                : `<button class="btn btn-ghost btn-sm" data-ip-rg="${esc(name)}">Переназначить все…</button>`}
            </div></td></tr>
          ${open ? list.map(({ a, s }) => {
            const picks = assignedPickOf(a);
            const stall = stallOf(a);
            return `<tr data-ip-row="${esc(a.id)}" class="${current === a.id ? 'cur' : ''} ${checked.has(a.id) ? 'sel' : ''}" aria-selected="${current === a.id}">
              <td class="c-check"><input type="checkbox" data-ip-acheck="${esc(a.id)}" ${checked.has(a.id) ? 'checked' : ''} aria-label="Отметить"></td>
              <td class="num ${picks.has('late') ? 'ip-late' : ''}">${esc(fmtDate(a.plannedAt) || '—')}</td>
              <td class="mono">${esc(s.eniAll || s.eni || '—')}</td>
              <td>${objCell(s, [s.typeLabel, s.institution].filter(Boolean).join(' · '))}</td>
              <td>${a.oiIds && a.oiIds.length ? `${a.oiIds.length} из ${(s.metrics && s.metrics.oiCount) || a.oiIds.length}` : 'все'}</td>
              <td><span class="ip-state st-${esc(a.state)}">${esc(stateLabel(a.state))}</span>
                ${stall ? `<span class="ip-flag" title="Зависло">${esc(stall)}</span>` : ''}
                ${picks.has('away') ? `<span class="ip-flag away" title="Плановая дата — нерабочий день осмотрщика">${esc(workdayOf(a.person, a.plannedAt).reason)}</span>` : ''}</td>
            </tr>`;
          }).join('') : ''}</tbody>`;
      }).join('')}
    </table></div></div>`;
  }

  function assignedFacetsHTML(live) {
    const cnt = new Map(ASSIGNED_PICKS.map((x) => [x.key, 0]));
    live.forEach(({ a }) => { cnt.set('', cnt.get('') + 1); assignedPickOf(a).forEach((k) => cnt.set(k, (cnt.get(k) || 0) + 1)); });
    const byPerson = new Map();
    live.forEach(({ a }) => byPerson.set(a.person, (byPerson.get(a.person) || 0) + 1));
    return `<aside class="ip-facets" aria-label="Отборы">
      ${facetHTML('Отбор', 'data-ip-fpick', view.pick, ASSIGNED_PICKS.map((x) => [x.key, x.label, cnt.get(x.key) || 0]))}
      ${facetHTML('Осмотрщик', 'data-ip-fperson', view.assignPerson, [...byPerson.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru')).map(([k, n]) => [k, k, n]))}
    </aside>`;
  }

  // Строка массовых действий над отмеченными — в полосе инструментов.
  const CLEAR = '<button class="isearch-clear ip-checked-x" data-ip-bulk-clear title="Снять отметки" aria-label="Снять отметки">×</button>';
  function bulkHTML() {
    if (!checked.size) return '';
    if (view.tab === 'queue') {
      return `<span class="ip-bulk2">Отмечено <b>${checked.size}</b>${CLEAR}
        <input class="input" type="date" data-ip-dl-date aria-label="Крайний срок для отмеченных" title="Крайний срок для отмеченных">
        <button class="btn btn-ghost btn-sm" data-ip-dl-set>Поставить срок</button></span>`;
    }
    return `<span class="ip-bulk2">Отмечено <b>${checked.size}</b>${CLEAR}
      <select class="select" data-ip-ba-person aria-label="Кому переназначить"><option value="">— кому —</option>
        ${people.filter((p) => !p.fired).map((p) => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('')}</select>
      <button class="btn btn-ghost btn-sm" data-ip-ba-reassign>Переназначить</button>
      <input class="input" type="date" data-ip-ba-date aria-label="Новая плановая дата">
      <button class="btn btn-ghost btn-sm" data-ip-ba-move>Перенести</button>
      <button class="btn btn-ghost btn-sm" data-ip-ba-remove>Снять</button></span>`;
  }

  function assignSection() {
    const base = queueBase(all);
    const qf = { q: view.q, due: view.due, cov: view.cov, region: view.objRegion, type: view.type, inst: view.inst };
    const queue = queueFilter(base, qf);
    const live = assignedRows(all, { q: view.q });
    const assigned = live.filter(({ a }) => (!view.assignPerson || a.person === view.assignPerson) && (!view.pick || assignedPickOf(a).has(view.pick)))
      .sort((x, y) => String(x.a.plannedAt || '9999').localeCompare(String(y.a.plannedAt || '9999')));
    const keys = view.tab === 'queue' ? tripGroups(queue.slice(0, Math.max(view.shown, STEP))).flatMap((g) => (collapsed.has(g.place) ? [] : g.rows.map((s) => s.typeId + '|' + s.id)))
      : assigned.filter(({ a }) => !collapsed.has('a:' + a.person)).map((r) => r.a.id);
    if (!keys.includes(current)) { current = keys[0] || ''; confirmRemove = false; }
    const sub = (k, label, n) => `<button class="itab ${view.tab === k ? 'on' : ''}" role="tab" data-ip-tab="${k}" aria-selected="${view.tab === k}">${label} <b>${n}</b></button>`;
    return { cls: 'ip-assign', html: `${view.tab === 'queue' ? queueFacetsHTML(queueCounts(base, qf)) : assignedFacetsHTML(live)}
      <section class="ip-work" aria-label="Назначения">
        <div class="itabs" role="tablist">${sub('queue', 'К назначению', base.length)}${sub('assigned', 'Назначено', live.length)}</div>
        <div class="itoolbar ip-toolbar">
          ${search(view.tab === 'queue' ? 'ЕНИ, адрес, учреждение' : 'ЕНИ, адрес, осмотрщик')}
          ${bulkHTML()}
        </div>
        ${view.tab === 'queue' ? queueHTML(queue) : assignedHTML(assigned)}
      </section>${pane()}` };
  }

  // Вставки планирования в панель назначения: «Кого назначить», доступность
  // выбранного на 10 рабочих дней, срок осмотра объекта, контакты на месте.
  function planHTML(targets, single) {
    const date = draft.date;
    const ranked = rankInspectors(all, people, targets, date).slice(0, 5);
    const chosen = draft.person;
    const av = chosen ? availability(chosen, 10) : [];
    const deadline = single ? deadlineOf(targets[0].typeId, targets[0].ocId) : '';
    const contacts = single ? onSiteContacts(targets[0].typeId, targets[0].ocId) : [];
    const top = `<section class="ip-sec"><h3>Кого назначить${date ? ` на ${esc(fmtDate(date))}` : ''}</h3>
      <ul class="ip-rank">${ranked.map((p) => `<li><button class="ip-rank-b ${chosen === p.name ? 'on' : ''}" data-ip-pick-person="${esc(p.name)}" aria-pressed="${chosen === p.name}">
          <b>${esc(p.name)}</b><span class="ip-rank-r">${p.reasons.map((r) => `<i class="${r.ok ? 'ok' : 'no'}">${esc(r.text)}</i>`).join('')}<i>в работе ${p.live}</i></span></button></li>`).join('')}</ul>
    </section>`;
    const mid = (chosen ? `<section class="ip-sec"><h3>${esc(chosen.split(' ').slice(0, 2).join(' '))} — ближайшие дни</h3>
      <div class="ip-avail">${av.map((d) => `<button class="ip-av ${d.off ? 'off' : d.load ? 'busy' : 'free'} ${date === d.day ? 'on' : ''}" ${d.off ? 'disabled' : ''} data-ip-avail-day="${d.day}"
          title="${esc(`${fmtDate(d.day)}: ${d.off || (d.load ? `назначено ${d.load}` : 'свободен')}`)}"><span>${d.day.slice(8, 10)}</span><b>${d.off ? '—' : d.load || ''}</b></button>`).join('')}</div>
    </section>` : '')
      + `<div class="ip-f-row"><div class="field"><label for="ip-f-deadline">${single ? 'Крайний срок осмотра' : 'Крайний срок для всех'}</label>
        <input class="input" type="date" id="ip-f-deadline" data-ip-f-deadline value="${esc(deadline)}"></div><div></div></div>`;
    const bottom = single ? `<section class="ip-sec"><h3>Контакты на месте</h3>
      ${contacts.length ? `<ul class="ip-contacts-list">${contacts.map((c) => {
        const tel = String(c.phone || '').replace(/[^\d+]/g, '');
        const wa = String(c.phone || '').replace(/\D/g, '');
        return `<li><b>${esc(c.name || '—')}</b>${c.position ? ` · ${esc(c.position)}` : ''}<span class="ip-muted"> · ${esc(c.from)}</span><br>
          ${c.phone ? `<a href="tel:${esc(tel)}">${esc(c.phone)}</a>${wa.length >= 9 ? ` · <a class="ip-wa" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}` : ''}${c.email ? ` · <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}</li>`;
      }).join('')}</ul>` : '<p class="ip-hint">Контактов нет — они вносятся в карточке объекта и в «Учреждениях».</p>'}
    </section>` : '';
    return { top, mid, bottom };
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

  // Профиль — четыре блока по смыслу (ТЗ рабочего дня осмотрщика, раздел 1):
  // связь · работа и документы · личное и жильё · график и отсутствия.
  // Раскладка — по ширине самой карточки (контейнерный запрос): 4, 2 или 1
  // блок в ряд. Строка сохранения появляется только при несохранённых
  // правках (contextual save bar, Shopify Polaris); отсутствия — сразу.
  function profileHTML(p) {
    const prof = profileOf(p.name);
    const field = (key, label, type = 'text', ph = '', hidden = false) => `<div class="field" ${hidden ? 'hidden' : ''} data-ip-cwrap="${key}"><label for="ip-c-${key}">${label}</label>
      <input class="input" id="ip-c-${key}" data-ip-c="${key}" type="${type}" value="${esc(prof[key] || '')}" ${ph ? `placeholder="${esc(ph)}"` : ''}></div>`;
    // Выбор из двух — переключатель того же вида, что «Мои / Все».
    const seg = (key, label, opts, cur) => `<div class="field"><span class="ip-flabel" id="ip-c-${key}-l">${label}</span>
      <div class="ip-segf" role="radiogroup" aria-labelledby="ip-c-${key}-l">${opts.map(([v, t]) => `<label><input type="radio" name="ip-c-${key}" data-ip-c-radio="${key}" value="${v}" ${cur === v ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div></div>`;
    const fmtD = (iso) => (iso ? iso.split('-').reverse().join('.') : '');
    const today = new Date().toISOString().slice(0, 10);
    const poa = poaDaysLeft(p.name);
    const wa = whatsappLink(p.name);
    const cf = allCustomFields();
    const cfInput = (f) => {
      const v = prof.custom[f.id];
      if (f.kind === 'bool') return seg(`cf-${f.id}`, esc(f.label), [['1', 'Да'], ['', 'Нет']], v ? '1' : '').replace(/data-ip-c-radio="[^"]+"/g, `data-ip-cf-radio="${esc(f.id)}"`);
      if (f.kind === 'list') return `<div class="field"><label for="ip-cf-${esc(f.id)}">${esc(f.label)}</label><select class="select" id="ip-cf-${esc(f.id)}" data-ip-cf="${esc(f.id)}"><option value="">—</option>
        ${f.options.map((o) => `<option ${v === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`;
      return `<div class="field"><label for="ip-cf-${esc(f.id)}">${esc(f.label)}</label><input class="input" id="ip-cf-${esc(f.id)}" data-ip-cf="${esc(f.id)}" type="${f.kind === 'number' ? 'number' : f.kind === 'date' ? 'date' : 'text'}" value="${esc(v || '')}"></div>`;
    };
    return `<div class="ip-pwrap"><div class="ip-pscroll"><div class="ip-profile4" data-ip-profile><div class="ip-pstack">
      <section class="ip-pcol" aria-labelledby="ip-h-link"><h3 id="ip-h-link">Связь</h3>
        <div class="ip-prow">${field('phone', 'Телефон', 'tel', '+996 555 000 000')}
          ${seg('phoneType', 'Тип телефона', [['android', 'Android'], ['ios', 'iOS']], prof.phoneType)}</div>
        <div class="field"><label for="ip-c-whatsapp">WhatsApp</label>
          <div class="ip-inbtn"><input class="input" id="ip-c-whatsapp" data-ip-c="whatsapp" type="tel" value="${esc(prof.whatsapp || '')}" placeholder="${esc(prof.phone || '+996 555 000 000')}">
            ${wa ? `<a class="btn btn-ghost btn-sm" href="${esc(wa)}" target="_blank" rel="noopener" data-ip-wa-chat title="Открыть чат в WhatsApp">Чат</a>`
              : '<button type="button" class="btn btn-ghost btn-sm" data-ip-wa-none>Чат</button>'}</div></div>
        <div class="ip-prow">${field('email', 'Почта', 'email')}${field('device', 'Устройство')}</div>
        ${field('waGroup', 'Группа WhatsApp области')}
      </section>
      <section class="ip-pcol" aria-labelledby="ip-h-work"><h3 id="ip-h-work">Работа и документы</h3>
        <div class="ip-prow">${seg('fired', 'Статус', [['', 'Работает'], ['1', 'Уволен']], prof.fired ? '1' : '')}
          ${field('firedDate', 'Дата увольнения', 'date', '', !prof.fired)}</div>
        <div class="ip-prow">${field('poaNumber', 'Доверенность №')}${field('poaUntil', 'Доверенность до', 'date')}</div>
        ${poa !== null && poa <= 14 ? `<p class="ip-warn ${poa < 0 ? 'off' : ''}" role="status">${poa < 0 ? `Доверенность истекла ${-poa} дн. назад` : poa === 0 ? 'Доверенность истекает сегодня' : `До окончания доверенности ${poa} дн.`}</p>` : ''}
        ${seg('cadastre', 'Доступ в кадастр', [['1', 'Есть'], ['', 'Нет']], prof.cadastre ? '1' : '')}
      </section>
      <section class="ip-pcol" aria-labelledby="ip-h-pers"><h3 id="ip-h-pers">Личное и жильё</h3>
        <div class="ip-prow">${field('birthDate', 'Дата рождения', 'date')}${field('startDate', 'Работает с', 'date')}</div>
        ${field('homeAddress', 'Адрес жилья')}
        ${field('tempAddress', 'Временный адрес жилья')}
        <div class="ip-prow">${field('tempFrom', 'Временный адрес с', 'date')}${field('tempTo', 'по', 'date')}</div>
        ${field('note', 'Примечание')}
        ${cf.map(cfInput).join('')}
      </section>
      </div><div class="ip-pstack">
      <section class="ip-pcol" aria-labelledby="ip-c-reg-l"><h3 id="ip-c-reg-l">Области</h3>
        <div class="field">
          <ul class="ip-reglist" role="group" aria-labelledby="ip-c-reg-l">${Object.values(ENI_REGIONS)
            .map((r) => [r, (p.byRegion || {})[r] || 0])
            .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], 'ru'))
            .map(([r, n]) => `<li><label><input type="checkbox" data-ip-c-region value="${esc(r)}" ${prof.regions.includes(r) ? 'checked' : ''}>
              <span>${esc(r)}</span><b title="Объектов назначено за всё время">${n || ''}</b></label></li>`).join('')}</ul>
          ${!prof.regions.length && p.regions.length ? `<p class="ip-hint">Не отмечены. По объектам — ${esc(p.regions.join(', '))}</p>` : ''}</div>
      </section>
      <section class="ip-pcol" aria-labelledby="ip-h-sched"><h3 id="ip-h-sched">График и отсутствия</h3>
        <div class="field"><span class="ip-flabel" id="ip-c-days-l">Рабочие дни</span>
          <div class="ip-days" role="group" aria-labelledby="ip-c-days-l">${WEEKDAYS.map((d, i) => `<label class="ip-chipbox ip-day"><input type="checkbox" data-ip-c-day value="${i + 1}" ${prof.schedule.days.includes(i + 1) ? 'checked' : ''}><span>${d}</span></label>`).join('')}</div></div>
        <div class="ip-prow"><div class="field"><label for="ip-c-from">Начало дня</label><input class="input" id="ip-c-from" type="time" data-ip-c-time="from" value="${esc(prof.schedule.from)}"></div>
          <div class="field"><label for="ip-c-to">Конец дня</label><input class="input" id="ip-c-to" type="time" data-ip-c-time="to" value="${esc(prof.schedule.to)}"></div></div>
        <h4>Отпуска и выходные</h4>
        ${prof.absences.length ? `<ul class="ip-absences">${prof.absences.map((ab) => `<li class="${(ab.to || ab.from) < today ? 'past' : ''}">
            <i class="k-away">${esc(absenceLabel(ab.kind))}</i>
            <span class="ip-ab-dates">${esc(fmtD(ab.from))}${ab.to && ab.to !== ab.from ? ` — ${esc(fmtD(ab.to))}` : ''}</span>
            <button class="ip-x" data-ip-ab-del="${esc(ab.id)}" aria-label="Удалить" title="Удалить">×</button>
            ${ab.note ? `<span class="ip-ab-note">${esc(ab.note)}</span>` : ''}</li>`).join('')}</ul>`
          : '<p class="ip-hint">Не запланированы</p>'}
        <div class="ip-ab-add" data-ip-ab-form>
          <div class="field"><label for="ip-ab-kind">Вид</label><select class="select" id="ip-ab-kind" data-ip-ab="kind">${ABSENCE_KINDS.map((k) => `<option value="${k.key}">${k.label}</option>`).join('')}</select></div>
          <div class="ip-prow"><div class="field"><label for="ip-ab-from">С</label><input class="input" id="ip-ab-from" type="date" data-ip-ab="from"></div>
            <div class="field"><label for="ip-ab-to">По</label><input class="input" id="ip-ab-to" type="date" data-ip-ab="to"></div></div>
          <div class="field"><label for="ip-ab-note">Примечание</label><input class="input" id="ip-ab-note" data-ip-ab="note"></div>
          <div class="ip-profile-act"><span class="ip-err" data-ip-ab-err role="alert"></span><button class="btn btn-ghost btn-sm" data-ip-ab-add>Добавить</button></div>
        </div>
      </section>
    </div></div></div>
    <div class="ip-profile-bar" data-ip-c-bar hidden role="region" aria-label="Несохранённые изменения">
      <span>Несохранённые изменения</span>
      <button class="btn btn-ghost btn-sm" data-ip-c-cancel>Отменить</button>
      <button class="btn btn-primary btn-sm" data-ip-c-save>Сохранить</button></div></div>`;
  }

  // Авто осмотрщика (ТЗ раздел 2): одно; расход нужен для литров по пробегу.
  // Оформление — как у профиля: два блока, подвал сохранения при правке.
  function carHTML(p) {
    const car = profileOf(p.name).car;
    const f = (key, label, type = 'text', ph = '') => `<div class="field"><label for="ip-car-${key}">${label}</label>
      <input class="input" id="ip-car-${key}" data-ip-car="${key}" type="${type}" value="${esc(car[key] || '')}" ${ph ? `placeholder="${esc(ph)}"` : ''}></div>`;
    const FUELS = ['АИ-92', 'АИ-95', 'Дизель', 'Газ'];
    return `<div class="ip-pwrap"><div class="ip-pscroll"><div class="ip-profile4" data-ip-profile><div class="ip-pstack">
      <section class="ip-pcol" aria-labelledby="ip-h-car"><h3 id="ip-h-car">Авто</h3>
        ${f('make', 'Марка и модель')}
        <div class="ip-prow">${f('year', 'Год выпуска', 'number')}${f('plate', 'Госномер')}</div>
        ${f('note', 'Комментарий')}
      </section></div><div class="ip-pstack">
      <section class="ip-pcol" aria-labelledby="ip-h-fuel"><h3 id="ip-h-fuel">Топливо и расход</h3>
        <div class="field"><span class="ip-flabel" id="ip-car-fuel-l">Топливо</span>
          <div class="ip-segf" role="radiogroup" aria-labelledby="ip-car-fuel-l">${FUELS.map((x) => `<label><input type="radio" name="ip-car-fuel" data-ip-car-radio="fuel" value="${x}" ${car.fuel === x ? 'checked' : ''}><span>${x}</span></label>`).join('')}</div></div>
        <div class="ip-prow">${f('engine', 'Объём двигателя, л', 'number')}${f('consumption', 'Расход на 100 км, л', 'number')}</div>
        <p class="ip-hint">Литры за день = пробег × расход / 100</p>
      </section></div>
    </div></div>
    <div class="ip-profile-bar" data-ip-c-bar hidden role="region" aria-label="Несохранённые изменения">
      <span>Несохранённые изменения</span>
      <button class="btn btn-ghost btn-sm" data-ip-c-cancel>Отменить</button>
      <button class="btn btn-primary btn-sm" data-ip-car-save>Сохранить</button></div></div>`;
  }

  // Свои поля осмотрщиков — заводятся здесь, видны в профиле каждого.
  function fieldsHTML() {
    const list = allCustomFields();
    return `<div class="ip-profile4 ip-fields">
      <section class="ip-pcol" aria-label="Свои поля"><h3>Свои поля осмотрщиков</h3>
        ${list.length ? `<ul class="ip-absences">${list.map((f) => `<li><i>${esc((FIELD_KINDS.find((k) => k.key === f.kind) || {}).label || f.kind)}</i>
            <span>${esc(f.label)}${f.options.length ? ` <span class="ip-muted">(${esc(f.options.join(', '))})</span>` : ''}</span>
            <button class="ip-x" data-ip-cf-del="${esc(f.id)}" aria-label="Удалить поле" title="Удалить поле">×</button></li>`).join('')}</ul>`
          : '<p class="ip-hint">Своих полей нет.</p>'}
        <div class="ip-ab-add">
          <div class="ip-prow"><div class="field"><label for="ip-cf-label">Название</label><input class="input" id="ip-cf-label" data-ip-cfn="label"></div>
            <div class="field"><label for="ip-cf-kind">Вид</label><select class="select" id="ip-cf-kind" data-ip-cfn="kind">${FIELD_KINDS.map((k) => `<option value="${k.key}">${k.label}</option>`).join('')}</select></div></div>
          <div class="field"><label for="ip-cf-opts">Варианты (для выбора из списка — через запятую)</label><input class="input" id="ip-cf-opts" data-ip-cfn="options"></div>
          <div class="ip-profile-act"><span class="ip-err" data-ip-cf-err role="alert"></span><button class="btn btn-ghost btn-sm" data-ip-cf-add>Добавить поле</button></div>
        </div>
      </section>
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
    else if (view.personTab === 'car') body = carHTML(me);
    else body = calendarHTML(all, me.name, ym);
    return `<section class="ip-work ip-card" aria-label="${esc(me.name)}">
      <header class="ip-card-head">
        <div class="ip-card-title"><h1>${esc(me.name)}</h1>
          <p class="ip-card-contacts">${me.fired ? '<span class="ip-badge off">уволен</span> ' : me.away ? `<span class="ip-badge away">${esc(me.away.label.toLowerCase())} до ${esc(me.away.to.split('-').reverse().join('.'))}</span> ` : ''}${prof.phone ? `<a href="tel:${esc(tel)}">${esc(prof.phone)}</a>` : '<span class="ip-muted">телефон не указан</span>'}
            ${whatsappLink(me.name) ? ` · <a href="${esc(whatsappLink(me.name))}" target="_blank" rel="noopener" class="ip-wa">WhatsApp</a>` : ''}
            ${(() => { const d = poaDaysLeft(me.name); return d !== null && d <= 14 ? ` · <span class="ip-badge ${d < 0 ? 'off' : 'away'}">${d < 0 ? 'доверенность истекла' : `доверенность: ${d} дн.`}</span>` : ''; })()}
            · ${prof.email ? `<a href="mailto:${esc(prof.email)}">${esc(prof.email)}</a>` : '<span class="ip-muted">почта не указана</span>'}
            · ${esc(me.regions.join(', ') || 'область не указана')}${me.derived && me.regions.length ? ' <span class="ip-muted">(по объектам)</span>' : ''}</p></div>
        <div class="ip-tiles ip-tiles-head">${tile('В работе', me.live)}${tile('Просрочено', me.late, me.late ? 'warn' : '')}
          ${tile('Свободно', `${me.free} дн.`, '', 'Рабочих дней без плановых осмотров из ближайших 10')}${tile('За 30 дн.', me.done, '', 'Законченных назначений')}</div>
        <div class="ip-head-act">
          <button class="btn btn-primary btn-sm" data-ip-assign-to="${esc(me.name)}">Назначить объекты</button>
          <a class="btn btn-ghost btn-sm" href="#/insp?as=${encodeURIComponent(me.name)}" title="Экран осмотрщика — как его видит ${esc(me.name)}">Экран осмотрщика</a>
        </div>
      </header>
      ${subTabs('data-ip-ptab', view.personTab, [['trips', 'Выезды'], ['stats', 'Статистика'], ['assigns', 'Назначения', me.live], ['profile', 'Профиль'], ['car', 'Авто']])}
      <div class="ip-card-body">${body}</div>
    </section>`;
  }

  // Число сотрудников по областям (ТЗ 1.3). «По регионалам» — когда появится
  // привязка осмотрщиков к региональным менеджерам; сейчас у менеджера есть
  // только свой список «Мои осмотрщики».
  function byRegionHTML(list) {
    const m = new Map();
    list.forEach((p) => (p.regions.length ? p.regions : ['без области']).forEach((r) => m.set(r, (m.get(r) || 0) + 1)));
    return `<div class="ip-tiles ip-byregion">${[...m.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => tile(r, n)).join('')}</div>`;
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
      ${subTabs('data-ip-atab', view.allTab, [['summary', 'Сводка'], ['stats', 'Статистика'], ['fields', 'Свои поля', allCustomFields().length]])}
      <div class="ip-card-body">${view.allTab === 'stats' ? statsHTML('') : view.allTab === 'fields' ? fieldsHTML() : `${byRegionHTML(list)}${peopleTableHTML(list)}`}</div>
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
    const ensureDraft = (key, person, date) => { if (draft.key !== key) draft = { key, person: person || '', date: date || '' }; };
    if (view.section === 'assign' && view.tab === 'queue' && checked.size > 1) {
      const targets = [...checked.values()].filter(Boolean);
      ensureDraft('many:' + [...checked.keys()].join(','), view.assignPerson);
      return paneHTML({ mode: 'many', people, person: draft.person, date: draft.date, targets, plan: planHTML(targets, false) });
    }
    if (view.section === 'history' || view.tab === 'assigned') {
      const a = allAssignments().find((x) => x.id === current);
      const t = a && target(a.typeId + '|' + a.ocId);
      if (!t) return paneHTML({ mode: 'none' });
      ensureDraft('a:' + a.id, a.person, a.plannedAt);
      return paneHTML({ mode: 'one', people, person: draft.person, date: draft.date, target: t, prev: a, confirmRemove,
        plan: view.section === 'assign' ? planHTML([t], true) : null });
    }
    const t = current && target(current);
    if (!t) return paneHTML({ mode: 'none' });
    ensureDraft('q:' + current, view.assignPerson);
    return paneHTML({ mode: 'one', people, person: draft.person, date: draft.date, target: t, plan: planHTML([t], true) });
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
  // Состояние формы панели назначения (отмеченные ОИ, документы, описи,
  // комментарий) переживает перерисовку, если панель показывает то же самое:
  // выбор осмотрщика или дня в полосе перестраивает панель и не должен
  // сбрасывать уже отмеченное (найдено проверкой 12.10.2026).
  const FORM = '.ip-pane [data-ip-f-oi], .ip-pane [data-ip-f-doc], .ip-pane [data-ip-f-inv], .ip-pane [data-ip-f-whole]';
  const redraw = () => {
    const keep = ['.ip-scroll', '.ip-people-list', '.ip-card-body', '.ip-pane .ip-pane-body'].map((s) => [s, scope.$(s) ? scope.$(s).scrollTop : 0]);
    const key = draft.key;
    const form = scope.$$(FORM).map((el) => [el.getAttribute('data-ip-f-oi') || el.getAttribute('data-ip-f-doc') || el.getAttribute('data-ip-f-inv') || 'whole', el.checked]);
    const note = scope.$('[data-ip-f-note]') ? scope.$('[data-ip-f-note]').value : null;
    render();
    if (draft.key === key && form.length) {
      const was = new Map(form);
      scope.$$(FORM).forEach((el) => {
        const k = el.getAttribute('data-ip-f-oi') || el.getAttribute('data-ip-f-doc') || el.getAttribute('data-ip-f-inv') || 'whole';
        if (was.has(k) && !el.disabled) el.checked = was.get(k);
      });
      const box = scope.$('.ip-oi');
      const whole = scope.$('[data-ip-f-whole]');
      if (box && whole) box.hidden = whole.checked;
      if (note !== null && scope.$('[data-ip-f-note]')) scope.$('[data-ip-f-note]').value = note;
    }
    keep.forEach(([s, y]) => { if (scope.$(s)) scope.$(s).scrollTop = y; });
  };
  const resetList = () => { view.q = ''; view.shown = STEP; checked.clear(); current = ''; confirmRemove = false; };

  // --- разделы и вкладки ---
  scope.on('click', '[data-ip-section]', (e, b) => { view.section = b.dataset.ipSection; detail = []; resetList(); render(); });
  scope.on('click', '[data-ip-tab]', (e, b) => { view.tab = b.dataset.ipTab; reassignGroup = ''; resetList(); render(); });

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
    const patch = {};
    scope.$$('[data-ip-c]').forEach((el) => { patch[el.dataset.ipC] = el.value.trim(); });
    scope.$$('[data-ip-c-radio]:checked').forEach((el) => { patch[el.dataset.ipCRadio] = el.value; });
    patch.fired = patch.fired === '1';
    patch.cadastre = patch.cadastre === '1';
    if (!patch.fired) patch.firedDate = '';
    patch.regions = scope.$$('[data-ip-c-region]:checked').map((x) => x.value);
    const time = (k) => { const el = scope.$(`[data-ip-c-time="${k}"]`); return el ? el.value : ''; };
    patch.schedule = { days: scope.$$('[data-ip-c-day]:checked').map((x) => +x.value), from: time('from') || '09:00', to: time('to') || '18:00' };
    const custom = { ...profileOf(view.person).custom };
    scope.$$('[data-ip-cf]').forEach((el) => { custom[el.dataset.ipCf] = el.value.trim(); });
    scope.$$('[data-ip-cf-radio]:checked').forEach((el) => { custom[el.dataset.ipCfRadio] = el.value === '1'; });
    patch.custom = custom;
    saveProfile(view.person, patch);
    redraw();
    host.toast('Профиль сохранён', 'ok');
  });
  scope.on('click', '[data-ip-car-save]', () => {
    const car = {};
    scope.$$('[data-ip-car]').forEach((el) => { car[el.dataset.ipCar] = el.value.trim(); });
    scope.$$('[data-ip-car-radio]:checked').forEach((el) => { car[el.dataset.ipCarRadio] = el.value; });
    saveProfile(view.person, { car });
    redraw();
    host.toast('Авто сохранено', 'ok');
  });
  scope.on('click', '[data-ip-cf-add]', () => {
    const v = (k) => { const el = scope.$(`[data-ip-cfn="${k}"]`); return el ? el.value.trim() : ''; };
    if (!v('label')) { scope.$('[data-ip-cf-err]').textContent = 'Укажите название'; scope.$('[data-ip-cfn="label"]').focus(); return; }
    if (v('kind') === 'list' && !v('options')) { scope.$('[data-ip-cf-err]').textContent = 'Укажите варианты через запятую'; return; }
    addCustomField({ label: v('label'), kind: v('kind'), options: v('options').split(',').map((x) => x.trim()) });
    redraw();
    host.toast('Поле добавлено', 'ok');
  });
  scope.on('click', '[data-ip-cf-del]', (e, b) => { removeCustomField(b.dataset.ipCfDel); redraw(); });
  // Правка профиля показывает строку сохранения; «Уволен» открывает дату
  // увольнения. Поля добавления отпуска сюда не относятся — они сохраняются
  // своей кнопкой.
  const profileDirty = (e, el) => {
    if (el.closest('[data-ip-ab-form]')) return;
    const bar = scope.$('[data-ip-c-bar]');
    if (bar) bar.hidden = false;
    if (el.dataset.ipCRadio === 'fired') scope.$('[data-ip-cwrap="firedDate"]').hidden = el.value !== '1';
  };
  scope.on('input', '[data-ip-profile] input, [data-ip-profile] select', profileDirty);
  scope.on('change', '[data-ip-profile] input, [data-ip-profile] select', profileDirty);
  scope.on('click', '[data-ip-c-cancel]', () => redraw());
  // «Чат» без номера не молчит: говорит, чего не хватает, и ставит курсор.
  scope.on('click', '[data-ip-wa-none]', () => {
    host.toast('Укажите телефон или номер WhatsApp и сохраните профиль', 'warn');
    scope.$('[data-ip-c="phone"]').focus();
  });
  scope.on('click', '[data-ip-ab-add]', () => {
    const v = (k) => { const el = scope.$(`[data-ip-ab="${k}"]`); return el ? el.value.trim() : ''; };
    if (!v('from')) { scope.$('[data-ip-ab-err]').textContent = 'Укажите дату начала'; scope.$('[data-ip-ab="from"]').focus(); return; }
    if (v('to') && v('to') < v('from')) { scope.$('[data-ip-ab-err]').textContent = 'Окончание раньше начала'; return; }
    addAbsence(view.person, { kind: v('kind'), from: v('from'), to: v('to'), note: v('note') });
    redraw();
    host.toast('Отсутствие добавлено', 'ok');
  });
  scope.on('click', '[data-ip-ab-del]', (e, b) => { removeAbsence(view.person, b.dataset.ipAbDel); redraw(); });

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
  // Фасеты: щелчок выбирает значение, повторный — снимает.
  const facet = (attr, key) => scope.on('click', `[${attr}]`, (e, b) => {
    const v = b.getAttribute(attr);
    view[key] = view[key] === v ? '' : v; view.shown = STEP; checked.clear(); render();
  });
  facet('data-ip-fdue', 'due'); facet('data-ip-fcov', 'cov'); facet('data-ip-fregion', 'objRegion');
  facet('data-ip-ftype', 'type'); facet('data-ip-finst', 'inst'); facet('data-ip-fpick', 'pick'); facet('data-ip-fperson', 'assignPerson');
  // Группы: свернуть, отметить целиком.
  scope.on('click', '[data-ip-gtoggle]', (e, b) => { const k = b.dataset.ipGtoggle; if (collapsed.has(k)) collapsed.delete(k); else collapsed.add(k); redraw(); });
  scope.on('change', '[data-ip-gcheck]', (e, el) => {
    const place = el.dataset.ipGcheck;
    scope.$$('tbody.ip-grp-body').forEach((tb) => {
      const head = tb.querySelector('[data-ip-gcheck]');
      if (!head || head.dataset.ipGcheck !== place) return;
      tb.querySelectorAll('[data-ip-check]').forEach((x) => { const k = x.dataset.ipCheck; if (el.checked) checked.set(k, target(k)); else checked.delete(k); });
    });
    // Свёрнутая группа: отмечаем по данным, а не по строкам на экране.
    if (collapsed.has(place)) queueFilter(queueBase(all), {}).filter((s) => s.place === place).forEach((s) => { const k = s.typeId + '|' + s.id; if (el.checked) checked.set(k, target(k)); else checked.delete(k); });
    redraw();
  });
  scope.on('change', '[data-ip-acheck]', (e, el) => { const id = el.dataset.ipAcheck; if (el.checked) checked.set(id, null); else checked.delete(id); redraw(); });
  scope.on('change', '[data-ip-gacheck]', (e, el) => {
    allAssignments().filter((a) => a.person === el.dataset.ipGacheck && ['assigned', 'progress'].includes(a.state)).forEach((a) => { if (el.checked) checked.set(a.id, null); else checked.delete(a.id); });
    redraw();
  });
  // «Переназначить все…» в строке группы.
  scope.on('click', '[data-ip-rg]', (e, b) => { reassignGroup = b.dataset.ipRg; redraw(); });
  scope.on('click', '[data-ip-rg-cancel]', () => { reassignGroup = ''; redraw(); });
  scope.on('click', '[data-ip-rg-ok]', (e, b) => {
    const to = scope.$('[data-ip-rg-person]').value;
    if (!to) { scope.$('[data-ip-rg-person]').focus(); return; }
    const ids = allAssignments().filter((a) => a.person === b.dataset.ipRgOk && ['assigned', 'progress'].includes(a.state)).map((a) => a.id);
    reassignMany(ids, to);
    reassignGroup = ''; current = ''; checked.clear();
    redraw();
    host.toast(`Переназначено ${ids.length}: ${b.dataset.ipRgOk} → ${to}`, 'ok');
  });
  // Массовые действия над отмеченными.
  scope.on('click', '[data-ip-dl-set]', () => {
    const d = scope.$('[data-ip-dl-date]').value;
    setDeadline([...checked.keys()], d);
    redraw();
    host.toast(d ? `Срок ${d.split('-').reverse().join('.')} поставлен: ${checked.size}` : `Срок снят: ${checked.size}`, 'ok');
  });
  scope.on('click', '[data-ip-ba-reassign]', () => {
    const to = scope.$('[data-ip-ba-person]').value;
    if (!to) { scope.$('[data-ip-ba-person]').focus(); return; }
    const n = reassignMany([...checked.keys()], to).length;
    checked.clear(); current = ''; redraw();
    host.toast(`Переназначено ${n} → ${to}`, 'ok');
  });
  scope.on('click', '[data-ip-ba-move]', () => {
    const d = scope.$('[data-ip-ba-date]').value;
    if (!d) { scope.$('[data-ip-ba-date]').focus(); return; }
    moveDateMany([...checked.keys()], d);
    const n = checked.size; checked.clear(); redraw();
    host.toast(`Перенесено на ${d.split('-').reverse().join('.')}: ${n}`, 'ok');
  });
  scope.on('click', '[data-ip-ba-remove]', () => {
    const n = checked.size; unassignMany([...checked.keys()]); checked.clear(); current = ''; redraw();
    host.toast(`Снято назначений: ${n}`, 'ok');
  });
  // Панель: «Кого назначить», день из полосы, осмотрщик и дата в полях, срок.
  scope.on('click', '[data-ip-pick-person]', (e, b) => { draft.person = b.dataset.ipPickPerson; redraw(); });
  scope.on('click', '[data-ip-avail-day]', (e, b) => { draft.date = b.dataset.ipAvailDay; redraw(); });
  scope.on('change', '[data-ip-f-person]', (e, el) => { draft.person = el.value; redraw(); });
  scope.on('change', '[data-ip-f-date]', (e, el) => { draft.date = el.value; redraw(); });
  scope.on('change', '[data-ip-f-deadline]', (e, el) => {
    const keys = view.tab === 'queue' && checked.size > 1 ? [...checked.keys()]
      : (() => { const a = view.tab === 'assigned' ? allAssignments().find((x) => x.id === current) : null; return [a ? a.typeId + '|' + a.ocId : current]; })();
    setDeadline(keys, el.value);
    redraw();
  });
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
