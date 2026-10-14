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
import { session } from '../../kernel/session.js';
import { persistView } from '../../kernel/viewState.js';
import {
  allAssignments, profileOf, saveProfile, addAbsence, removeAbsence, ABSENCE_KINDS, absenceLabel, WEEKDAYS, whatsappLink,
  deadlineOf, setDeadline, reassignMany, moveDateMany, unassignMany, stallOf, workdayOf,
  FIELD_KINDS, allCustomFields, addCustomField, removeCustomField, poaDaysLeft, reportTime, profileNames,
  addActivity, removeActivity, activitiesOn, activityKind, CAR_FUELS,
  planOf, setPlan, assign,
  allCadRequests, cadRequest, createCadRequest, cadSummary, cadResultLabel, cadKindLabel, cadFileName, CAD_KINDS, CAD_DOCS,
} from '../../kernel/inspections.js';
import { downloadXlsx, readXlsx } from '../../kernel/xlsx.js';
import { mountGrid, cellText, parseCell } from '../../kernel/grid.js';
import { pickFile } from '../../kernel/fileUpload.js';
import { codeByName } from '../../kernel/institutions.js';
import { build } from '../../kernel/router.js';
import { ENI_REGIONS, plural } from '../../kernel/fmt.js';
import {
  summaries, assignedRows, inspectorRows, isOverdue, stateLabel, EVENT_LABELS,
  queueBase, tripGroups, dueOf, availability, rankInspectors, onSiteContacts, assignedPickOf,
  QUEUE_FACETS, QUEUE_RANGES, ASSIGNED_FACETS, ASSIGNED_RANGES, applyFilter, facetValues, filterChips, emptyFilter, filterActive,
  reportDayRows, reportTotals, reportDays, accountingSheets, objectContents, employeeSummary,
} from './model.js';
import { paneHTML, submitPane, unassign } from './assignPane.js';
import { calendarHTML, bindCalendarPopover, statsHTML, mountStats, destroyStats, historyHTML } from './stats.js';
import { periodOf, allSheets, personSheets, exportName } from './statsData.js';
import { detailHTML } from './detail.js';
import { dayRoute, NORM_KINDS, normOf, setNorm, measuredNorms, loadOcRecord, gpsOfObject } from './route.js';
import { loadMapLibre, createMap, hoverTip, emptyFC, ownParcelsGL } from '../../kernel/mapgl.js';
import { attachCadastreGL } from '../../kernel/cadastreLayersGL.js';
import { notifications, NOTE_KINDS, noteKind } from './notify.js';

// Строки таблиц — порциями: очередь на 20 000 записей — больше тысячи строк.
const STEP = 200;

const view = {
  section: 'assign',     // assign | people | history
  tab: 'queue',          // в «Назначениях»: queue | assigned
  person: '',            // в «Осмотрщиках»: выбранный; пусто — все
  personTab: 'trips',    // подраздел карточки: trips | reports | stats | assigns | profile | car
  allTab: 'summary',     // подраздел «Все осмотрщики»: summary | reports | stats | fields
  cadSel: '',            // «Кадастр»: выбранный запрос
  aPerson: '',           // «Назначено»: '' — выбор сотрудника, '*' — все назначения, иначе — ФИО
  aSort: 'late',         // порядок сотрудников: late | load | name
  aRegion: '',           // отбор сотрудников по области
  notesRead: [],         // «Уведомления»: id прочитанных
  gridWidths: {},        // «Таблица»: ширины столбцов
  gridOrder: [],         // «Таблица»: порядок столбцов (перетаскиванием заголовка)
  notesKind: '',         // «Уведомления»: отбор по виду
  notesUnread: false,    // «Уведомления»: только непрочитанные
  assignPerson: '',      // в «Назначениях»: осмотрщик (фильтр «Назначено» и подстановка в панель)
  histPerson: '',        // в «Истории»: осмотрщик
  peopleMode: 'all',     // mine | all
  region: '',            // область осмотрщиков
  peopleSort: 'name',    // name | free
  q: '',
  type: '',
  objRegion: '',
  cov: '',               // «К назначению»: покрытие ОИ (COVERAGE)
  due: '',               // прежние одиночные отборы — не используются с 13.10.2026
  inst: '',              // «К назначению»: учреждение
  pick: '',              // прежний одиночный отбор «Назначено» — не используется с 13.10.2026
  // Гибкие отборы (решение пользователя 13.10.2026): qf — «К назначению»,
  // af — «Назначено»; { facets: { ключ: [значения] }, ranges: { ключ: [с, по] } }.
  qf: emptyFilter(),
  af: emptyFilter(),
  // Поиск у каждой вкладки свой и переживает переходы (матрица путей
  // 13.10.2026: поиск пропадал после «Назад»).
  qs: { queue: '', assigned: '' },
  // Сохранённые наборы отборов: { queue: [{ id, name, f }], assigned: [...] },
  // выбранный — setCur. ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: наборы — личные настройки
  // пользователя; развилка — хранить на сервере (следуют за человеком,
  // можно поделиться набором с коллегами, как «общий вид» в Basis и
  // Connective One) или в браузере (привязаны к рабочему месту).
  sets: { queue: [], assigned: [] },
  setCur: { queue: '', assigned: '' },
  histKind: '',
  histDay: '',
  shown: STEP,
};
// «Мои осмотрщики» — те, за кем закреплён вошедший региональный менеджер
// (поле профиля «Ответственное лицо»; указание пользователя 12.10.2026
// «Только по моим. Не по звездам»). ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: закрепление —
// связь учётных записей осмотрщика и менеджера, «Мои» — по входу.
persistView('inspections', view, ['section', 'tab', 'person', 'personTab', 'allTab', 'cadSel', 'gridWidths', 'gridOrder', 'notesRead', 'notesKind', 'notesUnread', 'assignPerson', 'histPerson', 'peopleMode',
  'region', 'peopleSort', 'histKind', 'q', 'qs', 'qf', 'af', 'sets', 'setCur']);

const fmtDate = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '');
// Подразделы карточки осмотрщика и «Все осмотрщики» — один список на
// вкладки и на «Перейти». «План месяца» и «Объекты» — чтобы не путать с
// разделом «Назначения» и с меткой «назн. N» календаря (разбор UI/UX 12.10.2026).
const PERSON_TABS = [['trips', 'Выезды'], ['plan', 'План месяца'], ['route', 'Маршрут'], ['reports', 'Отчёты'], ['stats', 'Статистика'],
  ['assigns', 'Объекты'], ['profile', 'Профиль'], ['car', 'Авто']];
const ALL_TABS = [['summary', 'Сводка'], ['table', 'Таблица'], ['reports', 'Отчёты'], ['totals', 'Итоги'], ['norms', 'Нормы осмотра'],
  ['stats', 'Статистика'], ['fields', 'Свои поля']];
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
  // Отчёты: день сводки — по умолчанию вчера (ТЗ 3.6: «с утра регионал
  // смотрит вчерашние отчёты»); месяц в карточке осмотрщика; период выгрузки
  // для бухгалтерии — с начала месяца по вчера.
  const isoD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const shiftD = (iso, k) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + k); return isoD(d); };
  const todayD = isoD(now0);
  const lastWorkday = () => {
    for (let k = 1; k <= 7; k++) {
      const iso = shiftD(todayD, -k);
      if (profileNames().some((n) => workdayOf(n, iso).ok)) return iso;
    }
    return shiftD(todayD, -1);
  };
  const rep = { day: lastWorkday(), ym: todayD.slice(0, 7), from: todayD.slice(0, 8) + '01', to: shiftD(todayD, -1) };
  if (rep.to < rep.from) rep.from = rep.to.slice(0, 8) + '01';
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
  const myPeople = () => new Set(people.filter((p) => profileOf(p.name).manager === session.state.person).map((p) => p.name));
  function visiblePeople() {
    const mine = myPeople();
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

  // --- гибкие отборы (решение пользователя 13.10.2026; запись графа
  // gibkie-otbory-fasety-diapazony-nabory) ---------------------------------
  //
  // Колонка слева: наборы отборов → фасеты (несколько значений, «или» внутри,
  // «и» между) → диапазоны. Над списком — строка применённых отборов
  // «чипами» с «Сбросить все». Практики: Baymard (несколько значений в
  // фасете, диапазон — полями ввода), PatternFly (чипы, когда значений
  // несколько), Bright/saasui (главное сразу, остальное — «Ещё»), Basis,
  // Cloudscape, Connective One (наборы: сохранить, обновить, удалить; поиск в
  // набор не входит).
  const FACET_SHOW = 6;
  const facetMore = new Set();     // фасеты, раскрытые «Ещё N»
  let setNaming = false;           // строка «Название набора» открыта
  let facetsOpen = false;          // узкая раскладка: колонка отборов раскрыта
  const fdefs = (tab) => (tab === 'queue' ? [QUEUE_FACETS, QUEUE_RANGES] : [ASSIGNED_FACETS, ASSIGNED_RANGES]);
  const curFilter = () => (view.tab === 'queue' ? view.qf : view.af);
  const setFilter = (f) => { if (view.tab === 'queue') view.qf = f; else view.af = f; };
  function norm(f) {
    const facets = Object.fromEntries(Object.entries(f.facets || {}).filter(([, v]) => v && v.length).map(([k, v]) => [k, [...v].sort()]).sort());
    const ranges = Object.fromEntries(Object.entries(f.ranges || {}).filter(([, r]) => r && (r[0] || r[1])).sort());
    return { facets, ranges };
  }
  const sameFilter = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));

  function facetBlockHTML(fv) {
    const cur = curFilter().facets[fv.key] || [];
    if (!fv.items.length || (fv.items.length < 2 && !cur.length)) return '';
    const open = facetMore.has(fv.key);
    // Отмеченные — всегда на виду, даже если по числу ниже порога.
    const shown = open ? fv.items : fv.items.filter((it, i) => i < FACET_SHOW || cur.includes(it[0]));
    const rest = fv.items.length - shown.length;
    return `<section class="ip-facet" aria-label="${esc(fv.title)}"><h3>${esc(fv.title)}${cur.length ? ` <button class="ip-fclear" data-ip-fclear="${esc(fv.key)}" title="Снять отметки «${esc(fv.title)}»" aria-label="Снять отметки «${esc(fv.title)}»">×</button>` : ''}</h3>
      ${shown.map(([k, label, n]) => {
        const on = cur.includes(k);
        return `<button class="ip-fopt ${on ? 'on' : ''} ${n ? '' : 'zero'}" data-ip-ff="${esc(fv.key)}" data-ip-fv="${esc(k)}" aria-pressed="${on}">
        <i class="ip-fck" aria-hidden="true"></i><span>${esc(label)}</span><b>${n}</b></button>`;
      }).join('')}
      ${rest > 0 || open ? `<button class="ip-fmore" data-ip-fmore="${esc(fv.key)}" aria-expanded="${open}">${open ? 'Свернуть' : `Ещё ${rest}`}</button>` : ''}
    </section>`;
  }

  function rangeBlockHTML(d, rows) {
    const r = curFilter().ranges[d.key] || ['', ''];
    const vals = rows.map((x) => d.val(x)).filter((v) => v !== '' && v != null);
    if (!vals.length && !(r[0] || r[1])) return '';
    const date = d.kind === 'date';
    const nums = date ? [] : vals.map(Number);
    const ph = date || !nums.length ? ['', ''] : [String(Math.floor(Math.min(...nums))), String(Math.ceil(Math.max(...nums)))];
    const inp = (i, lab) => `<label class="ip-frange-f"><span>${lab}</span><input class="input" type="${date ? 'date' : 'number'}" ${date ? '' : 'min="0" inputmode="numeric"'}
        data-ip-fr="${esc(d.key)}" data-ip-fr-i="${i}" value="${esc(r[i] || '')}" placeholder="${esc(ph[i])}" aria-label="${esc(d.title)} — ${lab}"></label>`;
    return `<section class="ip-facet ip-frange ${date ? 'is-date' : ''}" aria-label="${esc(d.title)}"><h3>${esc(d.title)}${r[0] || r[1] ? ` <button class="ip-fclear" data-ip-frclear="${esc(d.key)}" title="Сбросить «${esc(d.title)}»" aria-label="Сбросить «${esc(d.title)}»">×</button>` : ''}</h3>
      <div class="ip-frange-row">${inp(0, date ? 'с' : 'от')}${inp(1, date ? 'по' : 'до')}</div></section>`;
  }

  // Наборы отборов: применить, обновить изменённый, сохранить как новый,
  // удалить. Число — сколько строк подходит под набор сейчас.
  function setsHTML(rows, text) {
    const tab = view.tab;
    const [facets, ranges] = fdefs(tab);
    const list = view.sets[tab] || [];
    const cur = list.find((x) => x.id === view.setCur[tab]);
    const f = curFilter();
    const dirty = cur && !sameFilter(cur.f, f);
    const can = filterActive(f);
    return `<section class="ip-facet ip-sets" aria-label="Наборы отборов"><h3>Наборы отборов</h3>
      ${list.length ? list.map((x) => {
        const on = !!cur && cur.id === x.id;
        const n = applyFilter(rows, facets, ranges, x.f, text).length;
        return `<div class="ip-set ${on ? 'on' : ''}"><button class="ip-fopt ${on ? 'on' : ''}" data-ip-set="${esc(x.id)}" aria-pressed="${on}">
          <span>${esc(x.name)}</span><b>${n}</b></button><button class="ip-set-x" data-ip-set-del="${esc(x.id)}" title="Удалить набор «${esc(x.name)}»" aria-label="Удалить набор «${esc(x.name)}»">×</button></div>`;
      }).join('') : '<p class="ip-hint ip-sets-empty">Отметьте отборы и сохраните — набор включается одним щелчком.</p>'}
      ${dirty ? `<button class="btn btn-ghost btn-sm ip-set-upd" data-ip-set-update>Обновить «${esc(cur.name)}»</button>` : ''}
      ${setNaming ? `<div class="ip-set-new"><input class="input" data-ip-set-name maxlength="40" placeholder="Название набора" aria-label="Название набора">
          <button class="btn btn-primary btn-sm" data-ip-set-save>Сохранить</button></div>`
        : `<button class="btn btn-ghost btn-sm ip-set-add" data-ip-set-new ${can ? '' : 'disabled'} title="${can ? 'Сохранить текущие отборы набором' : 'Сначала отметьте отборы — сохранять пока нечего'}">Сохранить набор…</button>`}
    </section>`;
  }

  function filtersHTML(rows, text) {
    const [facets, ranges] = fdefs(view.tab);
    const fvs = facetValues(rows, facets, ranges, curFilter(), text);
    const f = curFilter();
    const n = Object.values(f.facets).reduce((k, v) => k + (v ? v.length : 0), 0) + Object.values(f.ranges).filter((r) => r && (r[0] || r[1])).length;
    return `<aside class="ip-facets ${facetsOpen ? 'open' : ''}" aria-label="Отборы">
      <button class="ip-facets-toggle" data-ip-ftoggle aria-expanded="${facetsOpen}">${facetsOpen ? '▾' : '▸'} Отборы${n ? ` <b>${n}</b>` : ''}</button>
      ${setsHTML(rows, text)}
      ${fvs.map(facetBlockHTML).join('')}
      ${ranges.map((d) => rangeBlockHTML(d, rows)).join('')}
    </aside>`;
  }

  // Строка применённых отборов над списком: у каждого — «×», в конце —
  // «Сбросить все»; переносится, ничего не обрезается краем.
  function chipsHTML(rows) {
    const [facets, ranges] = fdefs(view.tab);
    const f = curFilter();
    const labels = new Map(facetValues(rows, facets, ranges, f, '').map((fv) => [fv.key, new Map(fv.items.map((it) => [it[0], it[1]]))]));
    const chips = filterChips(f, facets, ranges, (d, v) => (labels.get(d.key) && labels.get(d.key).get(v)) || v);
    if (!chips.length) return '';
    return `<div class="ip-chips" role="group" aria-label="Применённые отборы">
      ${chips.map((c) => `<span class="ip-chip">${esc(c.text)}<button data-ip-chip-x="${esc(c.kind)}|${esc(c.key)}|${esc(c.value || '')}" aria-label="Убрать отбор «${esc(c.text)}»" title="Убрать">×</button></span>`).join('')}
      <button class="ip-chips-reset" data-ip-freset>Сбросить все</button></div>`;
  }

  // Пустота очереди — честно и с выходом (практика APCS «три состояния
  // блока»): отборы сузили — «Сбросить отборы»; очередь пуста — почему и
  // куда дальше.
  function queueHTML(rows, total) {
    if (!rows.length) {
      if (!total) {
        return `<div class="ip-emptystate"><b>Очередь пуста</b>
          <p>Все объекты в статусе «Удостоверен по документам» назначены целиком. Новые появятся здесь, когда ЦОД удостоверит объекты.</p>
          <button class="btn btn-primary btn-sm" data-ip-tab="assigned">Открыть «Назначено»</button></div>`;
      }
      return `<div class="ip-emptystate"><b>Под отборы ничего не подошло</b>
        <p>В очереди ${total} — отборы и поиск их скрыли.</p>
        <button class="btn btn-primary btn-sm" data-ip-qreset>Сбросить отборы</button></div>`;
    }
    const groups = tripGroups(rows.slice(0, Math.max(view.shown, STEP)));
    const allKeys = (g) => g.rows.map((s) => s.typeId + '|' + s.id);
    return `<div class="icols ip-cols"><div class="ip-scroll"><table class="itbl ip-tbl ip-grouped">
      <colgroup><col class="c-check"><col class="c-date"><col><col class="c-cov"></colgroup>
      <thead><tr><th class="c-check"></th><th title="Крайний срок осмотра">Срок</th>
        <th title="Адрес; ниже — тип ОЦ, учреждение, ЕНИ">Объект</th><th title="Объекты имущества: осмотрено · назначено · свободно">ОИ</th></tr></thead>
      ${groups.map((g) => {
        const keys = allKeys(g);
        const allOn = keys.every((k) => checked.has(k));
        const open = !collapsed.has(g.place);
        return `<tbody class="ip-grp-body"><tr class="ip-grp">
            <td class="c-check"><input type="checkbox" data-ip-gcheck="${esc(g.place)}" ${allOn ? 'checked' : ''} aria-label="Отметить выезд целиком" title="Отметить выезд целиком"></td>
            <td colspan="3"><button class="ip-grp-t" data-ip-gtoggle="${esc(g.place)}" aria-expanded="${open}">
              <span class="ip-grp-chev">${open ? '▾' : '▸'}</span><b>${esc(g.place)}</b>
              <span>${g.rows.length} ${plural(g.rows.length, 'объект', 'объекта', 'объектов')} · свободных ОИ ${g.free}</span>
              ${g.nearest !== '9999' ? `<span class="ip-due due-${dueOf(g.nearest)}">срок с ${esc(fmtDate(g.nearest))}</span>` : ''}</button></td></tr>
          ${open ? g.rows.map((s) => {
            const k = s.typeId + '|' + s.id;
            return `<tr data-ip-row="${esc(k)}" data-cov="${s.cov.state}" class="${current === k ? 'cur' : ''} ${checked.has(k) ? 'sel' : ''}" aria-selected="${current === k}">
              <td class="c-check"><input type="checkbox" data-ip-check="${esc(k)}" ${checked.has(k) ? 'checked' : ''} aria-label="Отметить"></td>
              <td class="num">${dueCell(s)}</td>
              <td>${objCell(s, [s.typeLabel, s.institution, s.eniAll || s.eni].filter(Boolean).join(' · '))}</td>
              <td>${covCell(s.cov)}</td>
            </tr>`;
          }).join('') : ''}</tbody>`;
      }).join('')}
    </table></div></div>${more(Math.min(rows.length, Math.max(view.shown, STEP)), rows.length)}`;
  }

  // «Назначено» — сначала сотрудник, потом его объекты (указание
  // пользователя 13.10.2026: «Лучше сделать выбор сотрудника и уже потом —
  // его объекты»; «Что если осмотрщиков будет 150?»). Первый уровень —
  // список сотрудников строкой на человека (ФИО, область, в работе,
  // просрочено, ближайший план), с поиском по фамилии, порядком и отбором
  // по области, своей прокруткой — держит любое их число. Второй — объекты
  // выбранного плоским списком по дате; «Переназначить все…» — одна кнопка
  // у выбранного. «Все назначения» — прежний общий список.
  function assignedRowHTML({ a, s }) {
    const picks = assignedPickOf(a);
    const stall = stallOf(a);
    return `<tr data-ip-row="${esc(a.id)}" class="${current === a.id ? 'cur' : ''} ${checked.has(a.id) ? 'sel' : ''}" aria-selected="${current === a.id}">
      <td class="c-check"><input type="checkbox" data-ip-acheck="${esc(a.id)}" ${checked.has(a.id) ? 'checked' : ''} aria-label="Отметить"></td>
      <td class="num ${picks.has('late') ? 'ip-late' : ''}">${esc(fmtDate(a.plannedAt) || '—')}</td>
      <td>${objCell(s, [view.aPerson === '*' ? a.person : '', s.typeLabel, s.institution, s.eniAll || s.eni].filter(Boolean).join(' · '))}</td>
      <td>${a.oiIds && a.oiIds.length ? `${a.oiIds.length} из ${(s.metrics && s.metrics.oiCount) || a.oiIds.length}` : 'все'}</td>
      <td><span class="ip-state st-${esc(a.state)}">${esc(stateLabel(a.state))}</span>
        ${stall ? `<span class="ip-flag" title="Зависло">${esc(stall)}</span>` : ''}
        ${picks.has('away') ? `<span class="ip-flag away" title="Плановая дата — нерабочий день осмотрщика">${esc(workdayOf(a.person, a.plannedAt).reason)}</span>` : ''}</td>
    </tr>`;
  }
  function assignedPeopleHTML(rows) {
    const by = new Map();
    rows.forEach((r) => {
      const v = by.get(r.a.person) || { n: 0, next: '' };
      v.n += 1;
      if (r.a.plannedAt && (!v.next || r.a.plannedAt < v.next)) v.next = r.a.plannedAt;
      by.set(r.a.person, v);
    });
    const regions = [...new Set(people.flatMap((p) => p.regions || []))].sort((x, y) => x.localeCompare(y, 'ru'));
    const q = String(view.q || '').trim().toLowerCase();
    const list = people.filter((p) => !p.fired && (by.has(p.name) || p.live))
      .filter((p) => !view.aRegion || (p.regions || []).includes(view.aRegion))
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .map((p) => ({ p, v: by.get(p.name) || { n: 0, next: '' } }))
      .sort((x, y) => (view.aSort === 'name' ? x.p.name.localeCompare(y.p.name, 'ru')
        : view.aSort === 'load' ? (y.v.n - x.v.n) || x.p.name.localeCompare(y.p.name, 'ru')
          : (y.p.late - x.p.late) || (y.v.n - x.v.n) || x.p.name.localeCompare(y.p.name, 'ru')));
    const opt = (v, l, cur) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(l)}</option>`;
    return `<div class="ip-apeople-bar">
        <select class="select" data-ip-asort aria-label="Порядок сотрудников">${opt('late', 'Сначала с просрочкой', view.aSort)}${opt('load', 'По загрузке', view.aSort)}${opt('name', 'По имени', view.aSort)}</select>
        <select class="select" data-ip-aregion aria-label="Область">${opt('', 'Все области', view.aRegion)}${regions.map((r) => opt(r, r, view.aRegion)).join('')}</select>
      </div>
      <ul class="ip-apeople" aria-label="Сотрудники с назначениями">
        <li><button class="ip-aperson ip-aperson-all" data-ip-aperson="*"><span class="ip-aperson-t"><b>Все назначения</b></span><span class="ip-aperson-n"><b>${rows.length}</b></span></button></li>
        ${list.length ? list.map(({ p, v }) => `<li><button class="ip-aperson" data-ip-aperson="${esc(p.name)}">
          <span class="ip-aperson-t"><b>${esc(p.name)}</b><span>${esc((p.regions || []).join(', ') || 'область не указана')}${v.next ? ` · ближайший план ${esc(fmtDate(v.next))}` : ''}${p.away ? ` · ${esc(p.away.label.toLowerCase())} до ${esc(fmtDate(p.away.to))}` : ''}</span></span>
          <span class="ip-aperson-n"><b>${v.n}</b>${p.late ? `<i class="ip-late">просрочено ${p.late}</i>` : `<i>в работе ${p.live}</i>`}</span></button></li>`).join('')
          : '<li class="ip-hint ip-empty">Под поиск и отбор никто не подошёл.</li>'}
      </ul>`;
  }
  function assignedHTML(rows) {
    if (!view.aPerson) return assignedPeopleHTML(rows);
    const one = view.aPerson !== '*';
    const mine = one ? rows.filter((r) => r.a.person === view.aPerson) : rows;
    const p = one ? (people.find((x) => x.name === view.aPerson) || { live: mine.length, late: 0, free: 0 }) : null;
    const others = people.filter((x) => !x.fired && x.name !== view.aPerson);
    const head = `<div class="ip-ahead">
        <button class="btn btn-ghost btn-sm ip-aback" data-ip-aperson="" title="К списку сотрудников">‹ Сотрудники</button>
        <div class="ip-ahead-t"><b>${one ? esc(view.aPerson) : 'Все назначения'}</b>
          <span>${mine.length}${one ? ` · в работе ${p.live}${p.late ? ` · <span class="ip-late">просрочено ${p.late}</span>` : ''} · свободно ${p.free} дн.` : ''}</span></div>
        ${one && mine.length ? (reassignGroup === view.aPerson ? `<span class="ip-grp-act"><select class="select" data-ip-rg-person aria-label="Кому переназначить"><option value="">— кому —</option>
            ${others.map((x) => `<option value="${esc(x.name)}">${esc(x.name)} · в работе ${x.live}</option>`).join('')}</select>
            <button class="btn btn-primary btn-sm" data-ip-rg-ok="${esc(view.aPerson)}">Переназначить ${mine.length}</button>
            <button class="btn btn-ghost btn-sm" data-ip-rg-cancel>Отмена</button></span>`
          : `<button class="btn btn-ghost btn-sm" data-ip-rg="${esc(view.aPerson)}">Переназначить все…</button>`) : ''}
      </div>`;
    if (!mine.length) {
      return head + (view.q || filterActive(view.af)
        ? `<div class="ip-emptystate"><b>Под отборы ничего не подошло</b><p>Отборы и поиск скрыли все назначения.</p>
          <button class="btn btn-primary btn-sm" data-ip-qreset>Сбросить отборы</button></div>`
        : '<p class="ip-hint ip-empty">Действующих назначений нет.</p>');
    }
    return `${head}<div class="icols ip-cols"><div class="ip-scroll"><table class="itbl ip-tbl ip-grouped">
      <colgroup><col class="c-check"><col class="c-date"><col><col class="c-oi"><col class="c-state"></colgroup>
      <thead><tr><th class="c-check"></th><th class="num" title="Плановая дата осмотра">План</th><th title="Адрес; ниже — тип ОЦ, учреждение, ЕНИ">Объект</th>
        <th title="Объекты имущества в назначении">ОИ</th><th>Состояние</th></tr></thead>
      <tbody>${mine.map(assignedRowHTML).join('')}</tbody>
    </table></div></div>`;
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
    const queue = applyFilter(base, QUEUE_FACETS, QUEUE_RANGES, view.qf, view.tab === 'queue' ? view.q : '');
    const liveAll = assignedRows(all, { q: '' });
    const assigned = applyFilter(liveAll, ASSIGNED_FACETS, ASSIGNED_RANGES, view.af, view.tab === 'assigned' && view.aPerson ? view.q : '')
      .sort((x, y) => String(x.a.plannedAt || '9999').localeCompare(String(y.a.plannedAt || '9999')));
    const keys = view.tab === 'queue' ? tripGroups(queue.slice(0, Math.max(view.shown, STEP))).flatMap((g) => (collapsed.has(g.place) ? [] : g.rows.map((s) => s.typeId + '|' + s.id)))
      : !view.aPerson ? [] : assigned.filter(({ a }) => view.aPerson === '*' || a.person === view.aPerson).map((r) => r.a.id);
    if (!keys.includes(current)) { current = keys[0] || ''; confirmRemove = false; }
    const sub = (k, label, n) => `<button class="itab ${view.tab === k ? 'on' : ''}" role="tab" data-ip-tab="${k}" aria-selected="${view.tab === k}">${label} <b>${n}</b></button>`;
    // Пустая очередь — без колонки отборов и пустой панели: место — объяснению.
    // Только когда очередь пуста сама по себе: если её опустошили отборы,
    // колонка отборов остаётся — иначе их не поправить (замер 13.10.2026).
    const bare = view.tab === 'queue' && !base.length;
    const rowsAll = view.tab === 'queue' ? base : liveAll;
    return { cls: 'ip-assign' + (bare ? ' ip-bare' : ''), html: `${bare ? '' : filtersHTML(rowsAll, view.q)}
      <section class="ip-work" aria-label="Назначения">
        <div class="itabs ip-subtabs" role="tablist" aria-label="Назначения">${sub('queue', 'К назначению', base.length)}${sub('assigned', 'Назначено', liveAll.length)}</div>
        <div class="itoolbar ip-toolbar">
          ${search(view.tab === 'queue' ? 'ЕНИ, адрес, учреждение' : view.aPerson ? 'ЕНИ, адрес' : 'Фамилия сотрудника')}
          ${bare ? '' : (() => { const f = curFilter(); const n = Object.values(f.facets).reduce((k, v) => k + (v ? v.length : 0), 0) + Object.values(f.ranges).filter((r) => r && (r[0] || r[1])).length;
            return `<button class="btn btn-ghost btn-sm ip-fbtn ${facetsOpen ? 'on' : ''}" data-ip-ftoggle aria-expanded="${facetsOpen}" title="Отборы и наборы отборов">Отбор${n ? ` <b>${n}</b>` : ''}</button>`; })()}
          ${bulkHTML()}
        </div>
        ${bare ? '' : chipsHTML(rowsAll)}
        ${view.tab === 'queue' ? queueHTML(queue, base.length) : assignedHTML(assigned)}
      </section>${bare ? '' : pane()}` };
  }

  // Вставки планирования в панель назначения: «Кого назначить», доступность
  // выбранного на 10 рабочих дней, срок осмотра объекта, контакты на месте.
  function planHTML(targets, single) {
    const date = draft.date;
    const ranked = rankInspectors(all, people, targets, date).slice(0, 5);
    const chosen = draft.person;
    const av = chosen ? availability(chosen, 10) : [];
    const deadlineDate = single ? deadlineOf(targets[0].typeId, targets[0].ocId) : '';
    const contacts = single ? onSiteContacts(targets[0].typeId, targets[0].ocId) : [];
    // Подбор — строкой на человека: имя и загрузка, ниже — доводы словами;
    // у выбранного прямо в строке — ближайшие дни, щелчок по дню ставит
    // плановую дату (выбор, который сам несёт сведения, — строкой, а не
    // кнопками отдельно от него; правило APCS interfeys-ne-lepit-knopki).
    const days = chosen ? `<div class="ip-avail" role="group" aria-label="Ближайшие дни: ${esc(chosen)}">${av.map((d) => `<button class="ip-av ${d.off ? 'off' : d.load ? 'busy' : d.act ? 'act' : 'free'} ${date === d.day ? 'on' : ''}" ${d.off ? 'disabled' : ''} data-ip-avail-day="${d.day}"
          title="${esc(`${fmtDate(d.day)}: ${d.off || [d.load ? `назначено ${d.load}` : '', d.act].filter(Boolean).join(', ') || 'свободен'}`)}"><span>${d.day.slice(8, 10)}</span><b>${d.off ? '—' : d.load || (d.act ? '·' : '')}</b></button>`).join('')}</div>` : '';
    const top = `<ul class="ip-rank">${ranked.map((p) => `<li class="${chosen === p.name ? 'on' : ''}"><button class="ip-rank-b ${chosen === p.name ? 'on' : ''}" data-ip-pick-person="${esc(p.name)}" aria-pressed="${chosen === p.name}">
          <span class="ip-rank-h"><b>${esc(p.name)}</b><span class="ip-rank-load">в работе ${p.live}</span></span>
          <span class="ip-rank-r">${p.reasons.map((r) => `<i class="${r.ok ? 'ok' : 'no'}">${esc(r.text)}</i>`).join(' · ')}</span></button>
          ${chosen === p.name ? days : ''}</li>`).join('')}</ul>
      ${chosen && !ranked.some((p) => p.name === chosen) ? days : ''}`;
    const deadline = `<div class="field"><label for="ip-f-deadline">${single ? 'Крайний срок' : 'Крайний срок для всех'}</label>
        <input class="input" type="date" id="ip-f-deadline" data-ip-f-deadline value="${esc(deadlineDate)}"></div>`;
    const bottom = single ? `<details class="ip-sec ip-fold" ${contacts.length ? 'open' : ''}><summary><h3>Контакты на месте</h3><span class="ip-fold-n">${contacts.length || 'нет'}</span></summary>
      ${contacts.length ? `<ul class="ip-contacts-list">${contacts.map((c) => {
        const tel = String(c.phone || '').replace(/[^\d+]/g, '');
        const wa = String(c.phone || '').replace(/\D/g, '');
        return `<li><b>${esc(c.name || '—')}</b>${c.position ? ` · ${esc(c.position)}` : ''}<span class="ip-muted"> · ${esc(c.from)}</span><br>
          ${c.phone ? `<a href="tel:${esc(tel)}">${esc(c.phone)}</a>${wa.length >= 9 ? ` · <a class="ip-wa" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}` : ''}${c.email ? ` · <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}</li>`;
      }).join('')}</ul>` : '<p class="ip-hint">Контактов нет — они вносятся в карточке объекта и в «Учреждениях».</p>'}
    </details>` : '';
    return { top, deadline, bottom };
  }

  // ===================== раздел «Осмотрщики» ======================================
  // Карточка осмотрщика — шапка (цифры, контакты, действия) и подразделы
  // «Выезды · Статистика · Назначения · Профиль»: на экране один подраздел во
  // всю ширину (ответ пользователя 12.10.2026 «Карточка — подразделами» на
  // замечание «Ты сейчас всё списком по вертикали выкатил… делим на логичные
  // разделы»). «Все осмотрщики» — так же: «Сводка · Статистика».
  function peopleListHTML() {
    const mine = myPeople();
    const q = peopleQ.trim().toLowerCase();
    const list = visiblePeople().filter((p) => !q || p.name.toLowerCase().includes(q));
    const row = (p) => `<li class="ip-person ${view.person === p.name ? 'on' : ''}">
        <button class="ip-person-main" data-ip-person="${esc(p.name)}" aria-pressed="${view.person === p.name}">
          <span class="ip-person-name">${esc(p.name)}</span>
          <span class="ip-person-load"><span>в работе <b>${p.live}</b></span>
            ${p.late ? `<span class="ip-late">просрочено <b>${p.late}</b></span>` : ''}
            <span title="Рабочих дней без плановых осмотров на две недели">свободно <b>${p.free}</b> дн.</span></span>
        </button>
      </li>`;
    return `<aside class="ip-people" aria-label="Осмотрщики">
      <div class="ip-people-head">
        <div class="ip-seg" role="group" aria-label="Какие осмотрщики">
          <button data-ip-mode="mine" aria-pressed="${view.peopleMode === 'mine'}" title="Закреплены за вами — «Ответственное лицо» в профиле">Мои <b>${mine.size}</b></button>
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
      ${view.peopleMode === 'mine' && !list.length ? `<p class="ip-hint ip-people-empty">${mine.size ? 'Никого не нашлось — измените поиск.' : 'За вами не закреплён ни один осмотрщик — «Ответственное лицо» указывается в профиле осмотрщика.'}</p>` : ''}
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
    return `<div class="ip-pwrap"><div class="ip-pscroll"><div class="ip-profile4" data-ip-profile>
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
        <div class="field" data-ip-cwrap="manager"><label for="ip-c-manager">Ответственное лицо</label>
          <input class="input" id="ip-c-manager" data-ip-c="manager" list="ip-managers" value="${esc(prof.manager || '')}" placeholder="региональный менеджер">
          <datalist id="ip-managers">${managerNames().map((m) => `<option value="${esc(m)}">`).join('')}</datalist></div>
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
    </div></div>
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
    const FUELS = CAR_FUELS;
    return `<div class="ip-pwrap"><div class="ip-pscroll"><div class="ip-profile4 ip-car2" data-ip-profile>
      <section class="ip-pcol" aria-labelledby="ip-h-car"><h3 id="ip-h-car">Авто</h3>
        ${f('make', 'Марка и модель')}
        <div class="ip-prow">${f('year', 'Год выпуска', 'number')}${f('plate', 'Госномер')}</div>
        ${f('note', 'Комментарий')}
      </section>
      <section class="ip-pcol" aria-labelledby="ip-h-fuel"><h3 id="ip-h-fuel">Топливо и расход</h3>
        <div class="field"><span class="ip-flabel" id="ip-car-fuel-l">Топливо</span>
          <div class="ip-segf" role="radiogroup" aria-labelledby="ip-car-fuel-l">${FUELS.map((x) => `<label><input type="radio" name="ip-car-fuel" data-ip-car-radio="fuel" value="${x}" ${car.fuel === x ? 'checked' : ''}><span>${x}</span></label>`).join('')}</div></div>
        <div class="ip-prow">${f('engine', 'Объём двигателя, л', 'number')}${f('consumption', 'Расход на 100 км, л', 'number')}</div>
        <p class="ip-hint">Литры за день = пробег × расход / 100</p>
      </section>
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
            <span>${esc(f.label)}${f.required ? ' <b class="ip-req" title="Обязательное">*</b>' : ''}${f.options.length ? ` <span class="ip-muted">(${esc(f.options.join(', '))})</span>` : ''}</span>
            <button class="ip-x" data-ip-cf-del="${esc(f.id)}" aria-label="Удалить поле" title="Удалить поле">×</button></li>`).join('')}</ul>`
          : '<p class="ip-hint">Своих полей нет.</p>'}
        <div class="ip-ab-add">
          <div class="ip-prow"><div class="field"><label for="ip-cf-label">Название</label><input class="input" id="ip-cf-label" data-ip-cfn="label"></div>
            <div class="field"><label for="ip-cf-kind">Вид</label><select class="select" id="ip-cf-kind" data-ip-cfn="kind">${FIELD_KINDS.map((k) => `<option value="${k.key}">${k.label}</option>`).join('')}</select></div></div>
          <div class="field" data-ip-cf-optsbox hidden><label for="ip-cf-opts">Варианты через запятую</label><input class="input" id="ip-cf-opts" data-ip-cfn="options"></div>
          <label class="ip-check"><input type="checkbox" data-ip-cfn-req> Обязательное — без значения профиль не сохраняется</label>
          <div class="ip-profile-act"><span class="ip-err" data-ip-cf-err role="alert"></span><button class="btn btn-ghost btn-sm" data-ip-cf-add>Добавить поле</button></div>
        </div>
      </section>
    </div>`;
  }



  function personCardHTML(me) {
    const prof = profileOf(me.name);
    const tel = (prof.phone || '').replace(/[^\d+]/g, '');
    let body;
    if (view.personTab === 'stats') {
      body = statsHTML({ all, people: visiblePeople(), person: me.name, period: statPeriod() });
    } else if (view.personTab === 'assigns') body = personAssignsHTML(me.name);
    else if (view.personTab === 'profile') body = profileHTML(me);
    else if (view.personTab === 'car') body = carHTML(me);
    else if (view.personTab === 'reports') body = personReportsHTML(me.name);
    else if (view.personTab === 'plan') body = monthPlanHTML(me.name);
    else if (view.personTab === 'route') body = routeHTML(me);
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
      ${subTabs('data-ip-ptab', view.personTab, PERSON_TABS.map(([k, l]) => (k === 'assigns' ? [k, l, me.live] : [k, l])))}
      <div class="ip-card-body">${body}</div>
    </section>`;
  }

  // Число сотрудников по областям (ТЗ 1.3). «По регионалам» — когда появится
  // привязка осмотрщиков к региональным менеджерам; сейчас у менеджера есть
  // только свой список «Мои осмотрщики».
  function byRegionHTML(list) {
    const m = new Map();
    list.forEach((p) => (p.regions.length ? p.regions : ['без области']).forEach((r) => m.set(r, (m.get(r) || 0) + 1)));
    const by = new Map();
    list.forEach((p) => { const k = profileOf(p.name).manager || 'не закреплён'; by.set(k, (by.get(k) || 0) + 1); });
    return `<div class="ip-bysum"><span class="ip-flabel">По ответственным</span><div class="ip-tiles ip-byregion">${[...by.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => tile(esc(r), n)).join('')}</div></div>
      <div class="ip-bysum"><span class="ip-flabel">По областям</span><div class="ip-tiles ip-byregion">${[...m.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => tile(r, n)).join('')}</div></div>`;
  }

  // --- отчёты за день (ТЗ рабочего дня осмотрщика, раздел 3) ---------------
  //
  // Ячейка отчёта: время сдачи; позже начала дня или на следующий день —
  // жёлтой меткой; не сдан к сроку — красной; не рабочий день — причиной.
  const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const WDL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  const numFmt = (n, frac = 0) => (n === null || n === undefined ? '—' : n.toLocaleString('ru-RU', { maximumFractionDigits: frac, minimumFractionDigits: 0 }));
  function repCell(d, kind) {
    const r = d[kind];
    if (r) {
      const t = reportTime(r.at);
      if (kind === 'morning' && d.late) return `<span class="ip-rmark warn" title="Позже начала дня по графику (${esc(d.lateFrom)})">${t}</span>`;
      if (kind === 'evening' && d.eveningLate) return `<span class="ip-rmark warn" title="Сдан ${esc(fmtDate(r.at))}">${esc(fmtDate(r.at).slice(0, 5))} ${t}</span>`;
      return `<span class="ip-rtime">${t}</span>`;
    }
    if (kind === 'morning' ? d.missingMorning : d.missingEvening) return '<span class="ip-rmark off">не сдан</span>';
    return '<span class="ip-muted">—</span>';
  }
  // Обе ячейки отчётов; в не рабочий день без отчётов — одна, с причиной.
  const repCells = (d) => (!d.work && !d.morning && !d.evening
    ? `<td colspan="2"><span class="ip-muted">${esc(d.reason || 'не рабочий день')}</span></td>`
    : `<td>${repCell(d, 'morning')}</td><td>${repCell(d, 'evening')}</td>`);
  const kmCell = (d) => `${numFmt(d.km)}${d.kmBy === 'route' ? ' <abbr class="ip-muted" title="Одометра нет — пробег по маршруту">марш.</abbr>' : ''}`;
  const repSel = () => { const x = detail[detail.length - 1]; return x && x.kind === 'report' ? `${x.name}|${x.date}` : ''; };
  const reportTiles = (t, n) => `<div class="ip-tiles ip-reptiles">${tile('Утренний сдан', `${t.morning} из ${n}`)}${tile('Вечерний сдан', `${t.evening} из ${n}`)}
    ${tile('Поздний выезд', t.late, t.late ? 'warn' : '', 'Утренний отчёт позже начала дня по графику')}${tile('Пропусков', t.missing, t.missing ? 'warn' : '', 'Отчёт не сдан к сроку')}
    ${tile('Пробег, км', numFmt(t.km))}${tile('Литры', numFmt(t.litres, 1), '', 'Пробег × расход авто / 100')}</div>`;

  // Итоги по сотрудникам за период (раздел 9 ТЗ рабочего дня): строка на
  // осмотрщика, суммы — в своих столбцах итоговой строки; щелчок — отчёты
  // осмотрщика; выгрузка — xlsx (сводка и по дням).
  const sumPeriod = { from: todayD.slice(0, 8) + '01', to: todayD };
  // Период статистики — один на «Все осмотрщики» и карточку осмотрщика:
  // переходя от всех к человеку, смотришь тот же отрезок (statsData.js).
  const statSel = { unit: 'month', offset: 0 };
  const statPeriod = () => periodOf(statSel.unit, statSel.offset);
  function totalsHTML(list) {
    const rows = employeeSummary(all, list.filter((p) => !p.fired).map((p) => p.name), sumPeriod.from, sumPeriod.to);
    const tot = (k) => rows.reduce((n, r) => n + (typeof k === 'function' ? k(r) : r[k]), 0);
    const cell = (v, warn) => `<td class="num ${warn && v ? 'ip-late' : ''}">${v ? numFmt(v, 1) : '—'}</td>`;
    return `<div class="ip-repbar">
        <div class="ip-repexp" role="group" aria-label="Период">
          <span>Период</span>
          <input class="input" type="date" data-ip-sum="from" value="${sumPeriod.from}" max="${todayD}" aria-label="Период с">
          <span>—</span>
          <input class="input" type="date" data-ip-sum="to" value="${sumPeriod.to}" max="${todayD}" aria-label="Период по">
        </div>
        <button class="btn btn-ghost btn-sm" data-ip-sum-xlsx>Выгрузить xlsx</button>
      </div>
      <div class="icols ip-cols"><div class="ip-scroll"><table class="itbl ip-tbl ip-sumtbl">
        <colgroup><col class="c-name">${'<col class="c-k">'.repeat(10)}<col class="c-cad"></colgroup>
        <thead><tr><th rowspan="2">Осмотрщик</th><th colspan="4" class="grp">Выезды</th><th colspan="2" class="grp">Пробег</th><th colspan="2" class="grp">Отчёты</th><th colspan="2" class="grp">Пропущено</th><th rowspan="2" class="num" title="Строк запросов документов: получено / нет в кадастре / отказ">Кадастр</th></tr>
          <tr><th class="num" title="Рабочих дней с выездами">Дней</th><th class="num">Объектов</th><th class="num">ОИ</th><th class="num">Снимков</th>
          <th class="num">Км</th><th class="num">Литры</th><th class="num">Вовремя</th><th class="num">Поздно</th><th class="num" title="Отчёт не сдан к сроку">Отчётов</th><th class="num" title="Дата прошла, осмотр не начат">Выездов</th></tr></thead>
        <tbody>${rows.map((r) => `<tr data-ip-sum-open="${esc(r.name)}" tabindex="0">
          <td>${esc(r.name)}</td>${cell(r.tripDays)}${cell(r.objects)}${cell(r.oi)}${cell(r.photos)}
          ${cell(r.km)}${cell(r.litres)}${cell(r.onTime)}${cell(r.late, true)}${cell(r.missedReports, true)}${cell(r.missedTrips, true)}
          <td class="num">${r.cad.got + r.cad.none + r.cad.refused ? `${r.cad.got} / ${r.cad.none} / ${r.cad.refused}` : '—'}</td></tr>`).join('')}</tbody>
        <tfoot><tr><th scope="row">Итого</th>${['tripDays', 'objects', 'oi', 'photos'].map((k) => cell(tot(k))).join('')}
          ${cell(tot('km'))}${cell(Math.round(tot('litres') * 100) / 100)}${cell(tot('onTime'))}${cell(tot('late'))}${cell(tot('missedReports'))}${cell(tot('missedTrips'))}
          <td class="num">${tot((r) => r.cad.got)} / ${tot((r) => r.cad.none)} / ${tot((r) => r.cad.refused)}</td></tr></tfoot>
      </table></div></div>`;
  }

  // --- табличный вид осмотрщиков (раздел 10 ТЗ рабочего дня) ----------------
  //
  // «Буквально Excel, который потом может парситься в систему»: все поля
  // карточки, авто и свои поля — столбцами, правка в ячейках сразу
  // сохраняется в профиль (kernel/grid.js); на весь экран; выгрузка xlsx и
  // загрузка обратно — со сверкой по ФИО и показом изменений до применения:
  // пустое дописывается, различающееся — по отметке (правило слияния из
  // импорта APCS; практики предпросмотра импорта — csvbox, Grist, Coefficient).
  const FUELS = CAR_FUELS;
  const regionNames = () => Object.values(ENI_REGIONS);
  function gridCols() {
    const car = (key, label, type = 'text', extra = {}) => ({ key: `car.${key}`, label, type, width: 120, ...extra,
      get: (p) => p.car[key] || '', set: (v, p) => ({ car: { ...p.car, [key]: v } }) });
    const cols = [
      { key: 'name', label: 'ФИО', width: 250, readOnly: true, get: (p, n) => n },
      { key: 'manager', label: 'Ответственное лицо', type: 'list', width: 190, filter: 'select', options: managerNames(), title: 'Региональный менеджер, за которым закреплён осмотрщик' },
      { key: 'phone', label: 'Телефон', width: 150 },
      { key: 'whatsapp', label: 'WhatsApp', width: 150 },
      { key: 'email', label: 'Почта', width: 180 },
      { key: 'phoneType', label: 'Тип телефона', type: 'list', options: ['Android', 'iOS'], width: 110,
        get: (p) => (p.phoneType === 'ios' ? 'iOS' : p.phoneType === 'android' ? 'Android' : ''), set: (v) => ({ phoneType: v === 'iOS' ? 'ios' : v === 'Android' ? 'android' : '' }) },
      { key: 'device', label: 'Устройство', width: 140 },
      { key: 'waGroup', label: 'Группа WhatsApp', width: 150 },
      { key: 'regions', label: 'Области', type: 'multi', options: regionNames(), width: 170, title: 'Выбор нескольких: пробел отмечает, Enter сохраняет',
        get: (p) => regionNames().filter((r) => p.regions.includes(r)).join(', '),
        set: (v) => ({ regions: String(v || '').split(/,\s*/).filter(Boolean) }) },
      { key: 'fired', label: 'Статус', type: 'list', options: ['Работает', 'Уволен'], width: 100, get: (p) => (p.fired ? 'Уволен' : 'Работает'), set: (v) => ({ fired: v === 'Уволен' }) },
      { key: 'startDate', label: 'Работает с', type: 'date', width: 105 },
      { key: 'firedDate', label: 'Уволен с', type: 'date', width: 105 },
      { key: 'birthDate', label: 'Дата рождения', type: 'date', width: 110 },
      { key: 'homeAddress', label: 'Адрес жилья', width: 220 },
      { key: 'tempAddress', label: 'Временный адрес', width: 200 },
      { key: 'tempFrom', label: 'Временный с', type: 'date', width: 105 },
      { key: 'tempTo', label: 'Временный по', type: 'date', width: 105 },
      { key: 'poaNumber', label: 'Доверенность №', width: 120 },
      { key: 'poaUntil', label: 'Доверенность до', type: 'date', width: 120 },
      { key: 'cadastre', label: 'Доступ в кадастр', type: 'bool', width: 110 },
      { key: 'sched.from', label: 'Начало дня', type: 'time', width: 90, get: (p) => p.schedule.from, set: (v, p) => ({ schedule: { ...p.schedule, from: v || '09:00' } }) },
      { key: 'sched.to', label: 'Конец дня', type: 'time', width: 90, get: (p) => p.schedule.to, set: (v, p) => ({ schedule: { ...p.schedule, to: v || '18:00' } }) },
      car('make', 'Авто', 'text', { width: 170 }), car('year', 'Год авто', 'number', { width: 80 }), car('plate', 'Госномер'),
      car('engine', 'Объём, л', 'number', { width: 80 }), car('consumption', 'Расход на 100 км', 'number'),
      car('fuel', 'Топливо', 'list', { options: FUELS, width: 90 }), car('note', 'Авто: комментарий', 'text', { width: 160 }),
      { key: 'note', label: 'Примечание', width: 200 },
    ];
    const KIND = { text: 'text', number: 'number', date: 'date', bool: 'bool', list: 'list' };
    allCustomFields().forEach((f) => cols.push({ key: `cf.${f.id}`, label: f.label, type: KIND[f.kind] || 'text', options: f.kind === 'list' ? f.options : undefined, width: 130,
      get: (p) => (f.kind === 'bool' ? !!p.custom[f.id] : p.custom[f.id] || ''),
      set: (v, p) => (f.required && !String(v ?? '').trim() ? { error: `«${f.label}» — обязательное поле` } : { custom: { ...p.custom, [f.id]: v } }) }));
    return cols;
  }
  // Регионалы — из уже указанных ответственных и из сотрудников системы.
  //
  // ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: справочник пользователей с ролью «региональный
  // менеджер»; ответственное лицо выбирается из него, а не вписывается.
  const managerNames = () => [...new Set([session.state.person, ...profileNames().map((n) => profileOf(n).manager)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const regionOfPerson = (name) => { const p = people.find((x) => x.name === name); return (profileOf(name).regions[0]) || (p && p.regions[0]) || ''; };
  const gridNames = () => [...new Set([...profileNames(), ...people.map((p) => p.name)])].sort((a, b) => a.localeCompare(b, 'ru'));
  const gridRows = (cols) => gridNames().map((name) => {
    const p = profileOf(name);
    return { id: name, cells: Object.fromEntries(cols.map((c) => [c.key, c.get ? c.get(p, name) : p[c.key] ?? (c.type === 'bool' ? false : '')])) };
  });
  // Правки ячеек → профили. Ошибка значения (область) — сообщением, без сохранения.
  function saveCells(cols, changes) {
    const errs = [];
    const byName = new Map();
    changes.forEach((ch) => { if (!byName.has(ch.id)) byName.set(ch.id, []); byName.get(ch.id).push(ch); });
    byName.forEach((list, name) => {
      let patch = {};
      list.forEach((ch) => {
        const col = cols.find((c) => c.key === ch.key);
        const cur = { ...profileOf(name), ...patch };
        const out = col.set ? col.set(ch.value, cur) : { [col.key]: ch.value };
        if (out.error) errs.push(`${name}: ${out.error}`);
        else patch = { ...patch, ...out };
      });
      if (Object.keys(patch).length) saveProfile(name, patch);
    });
    return errs;
  }
  let grid = null;
  let gridState = null;     // вид таблицы — переживает перерисовку страницы
  let gridSaving = false;   // своя правка: страница не перерисовывается
  let gridFull = false;
  let imp = null;     // разбор загруженного файла
  // Своё поле — прямо из таблицы (указание пользователя 13.10.2026: «свои
  // поля добавляем прямо в таблице»): «+ поле» в шапке открывает строку над
  // таблицей — название, вид, варианты, обязательность; поле встаёт
  // последним столбцом. Без окна поверх страницы.
  let cfAdding = false;
  const cfAddHTML = () => `<div class="ip-cfadd" role="group" aria-label="Новое поле таблицы">
      <input class="input" data-ip-cfn="label" placeholder="Название поля" aria-label="Название поля" maxlength="60">
      <select class="select" data-ip-cfn="kind" aria-label="Вид поля">${FIELD_KINDS.map((k) => `<option value="${k.key}">${k.label}</option>`).join('')}</select>
      <input class="input" data-ip-cfn="options" data-ip-cf-optsbox hidden placeholder="Варианты через запятую" aria-label="Варианты через запятую">
      <label class="ip-check"><input type="checkbox" data-ip-cfn-req> Обязательное</label>
      <span class="ip-err" data-ip-cf-err role="alert"></span>
      <button class="btn btn-primary btn-sm" data-ip-cf-add>Добавить</button>
      <button class="btn btn-ghost btn-sm" data-ip-cf-cancel>Отмена</button></div>`;
  function tableHTML() {
    if (imp) return importHTML();
    return `<div class="ip-gridwrap ${gridFull ? 'full' : ''}" data-ip-gridwrap>
      <div class="ip-repbar">
        <span class="ip-hint">Правка — ввод или F2, Esc — отмена; блоки — Ctrl+C / Ctrl+V из Excel и в Excel; Ctrl+Z — отменить.</span>
        <div class="ip-route-act">
          <button class="btn btn-ghost btn-sm" data-ip-grid-full aria-pressed="${gridFull}">${gridFull ? 'Свернуть (Esc)' : 'На весь экран'}</button>
          <button class="btn btn-ghost btn-sm" data-ip-cf-open title="Новый столбец таблицы — своё поле осмотрщиков">+ Своё поле</button>
          <button class="btn btn-ghost btn-sm" data-ip-grid-xlsx>Выгрузить xlsx</button>
          <button class="btn btn-ghost btn-sm" data-ip-grid-import>Загрузить xlsx</button>
        </div>
      </div>
      ${cfAdding ? cfAddHTML() : ''}
      <div class="ip-grid" data-ip-grid></div>
    </div>`;
  }
  function mountTable() {
    const box = scope.$('[data-ip-grid]');
    if (!box) return;
    const cols = gridCols();
    grid = mountGrid(box, {
      label: 'Осмотрщики', columns: cols, rows: gridRows(cols), frozen: 1, widths: view.gridWidths, state: gridState,
      // Разделы — по ответственному лицу, подразделы — по области (первой из
      // областей осмотрщика; без областей — по объектам назначений).
      groups: {
        title: ['Ответственное лицо'],
        levels: [(r) => r.cells.manager, (r) => regionOfPerson(r.id)],
        empty: ['Не закреплён', 'Область не указана'],
      },
      onWidths: (w) => { view.gridWidths = w; },
      // ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: порядок и ширины столбцов — личная настройка
      // (сейчас — в памяти вкладки и её хранилище); на сервере — профиль
      // пользователя или общий вид для всех регионалов: решить, чей порядок.
      order: view.gridOrder,
      onOrder: (keys) => { view.gridOrder = keys; },
      onAddColumn: () => { cfAdding = true; redraw(); const f = scope.$('.ip-cfadd [data-ip-cfn="label"]'); if (f) f.focus(); },
      onChange: (changes) => {
        gridSaving = true;
        let errs;
        try { errs = saveCells(cols, changes); } finally { gridSaving = false; }
        if (errs.length) host.toast(errs[0], 'warn');
        grid.refresh(gridRows(cols));
      },
      onEscape: () => { if (gridFull) { gridFull = false; scope.$('[data-ip-gridwrap]').classList.remove('full'); const b = scope.$('[data-ip-grid-full]'); b.textContent = 'На весь экран'; b.setAttribute('aria-pressed', 'false'); } },
    });
  }
  // Сверка загруженного файла: строки — по ФИО, столбцы — по подписи шапки.
  function diffImport(sheetRows) {
    const cols = gridCols();
    const head = (sheetRows[0] || []).map((x) => String(x).trim());
    const at = new Map(head.map((h, i) => [h, i]));
    const fio = at.get('ФИО');
    if (fio === undefined) return { error: 'В первой строке листа нет столбца «ФИО»' };
    const known = new Set(gridNames());
    const items = [];
    const unknown = [];
    const errors = [];
    let same = 0;
    sheetRows.slice(1).forEach((r) => {
      const name = String(r[fio] || '').trim();
      if (!name) return;
      if (!known.has(name)) { unknown.push(name); return; }
      const p = profileOf(name);
      cols.forEach((col) => {
        if (col.readOnly || !at.has(col.label)) return;
        const parsed = parseCell(col, r[at.get(col.label)]);
        if (parsed.error) { errors.push(`${name}, «${col.label}»: ${parsed.error}`); return; }
        const cur = col.get ? col.get(p, name) : p[col.key];
        const curT = cellText(col, cur);
        const nextT = cellText(col, parsed.value);
        if (curT === nextT || (!nextT && col.type !== 'bool')) { if (curT === nextT) same++; return; }
        const kind = !curT ? 'fill' : 'change';
        items.push({ name, key: col.key, label: col.label, cur: curT, next: nextT, value: parsed.value, kind, on: kind === 'fill' });
      });
    });
    return { items, unknown, errors, same };
  }
  function importHTML() {
    const fill = imp.items.filter((x) => x.kind === 'fill');
    const change = imp.items.filter((x) => x.kind === 'change');
    const on = imp.items.filter((x) => x.on).length;
    const row = (x, i) => `<tr><td><input type="checkbox" data-ip-imp="${i}" ${x.on ? 'checked' : ''} aria-label="Применить"></td>
      <td>${esc(x.name)}</td><td>${esc(x.label)}</td><td class="ip-imp-cur">${esc(x.cur) || '<span class="ip-muted">пусто</span>'}</td><td class="ip-imp-next">${esc(x.next) || '<span class="ip-muted">пусто</span>'}</td></tr>`;
    return `<div class="ip-repbar"><b>Загрузка «${esc(imp.file)}» — проверьте изменения</b>
        <div class="ip-route-act"><button class="btn btn-ghost btn-sm" data-ip-imp-cancel>Отменить</button>
          <button class="btn btn-primary btn-sm" data-ip-imp-apply ${on ? '' : 'disabled'}>Применить отмеченные (${on})</button></div></div>
      <div class="ip-tiles ip-reptiles">${tile('Дописать', fill.length, '', 'Поле пустое — значение из файла дописывается')}${tile('Изменить', change.length, change.length ? 'warn' : '', 'Значения различаются — применяется по отметке')}
        ${tile('Без изменений', imp.same)}${tile('Нет в справочнике', imp.unknown.length, imp.unknown.length ? 'warn' : '', imp.unknown.join(', '))}${tile('Ошибки', imp.errors.length, imp.errors.length ? 'warn' : '')}</div>
      ${imp.errors.length ? `<p class="ip-warn off">${esc(imp.errors.slice(0, 3).join('; '))}${imp.errors.length > 3 ? ` и ещё ${imp.errors.length - 3}` : ''}</p>` : ''}
      ${imp.unknown.length ? `<p class="ip-warn">Нет в справочнике, не загружены: ${esc(imp.unknown.join(', '))}.</p>` : ''}
      ${imp.items.length ? `<div class="icols ip-cols"><div class="ip-scroll"><table class="itbl ip-tbl ip-imptbl">
        <colgroup><col class="c-x"><col class="c-name"><col class="c-f"><col><col></colgroup>
        <thead><tr><th><input type="checkbox" data-ip-imp-all ${on === imp.items.length ? 'checked' : ''} aria-label="Отметить все"></th><th>ФИО</th><th>Поле</th><th>Сейчас</th><th>В файле</th></tr></thead>
        <tbody>${change.length ? `<tr class="ip-imp-grp"><th colspan="5">Изменить — ${change.length}</th></tr>` : ''}${imp.items.map((x, i) => (x.kind === 'change' ? row(x, i) : '')).join('')}
          ${fill.length ? `<tr class="ip-imp-grp"><th colspan="5">Дописать — ${fill.length}</th></tr>` : ''}${imp.items.map((x, i) => (x.kind === 'fill' ? row(x, i) : '')).join('')}</tbody>
      </table></div></div>` : '<p class="ip-hint ip-empty">Изменений нет — файл совпадает с данными.</p>'}`;
  }

  function allReportsHTML(list) {
    const rows = reportDayRows(list, rep.day);
    const t = reportTotals(rows);
    const n = t.due;
    const wd = new Date(rep.day + 'T00:00:00').getDay();
    const rel = rep.day === todayD ? 'сегодня' : rep.day === shiftD(todayD, -1) ? 'вчера' : rep.day === lastWorkday() ? `${WDL[wd]}, последний рабочий` : WDL[wd];
    const sel = repSel();
    return `<div class="ip-repbar">
        <div class="ip-daynav" role="group" aria-label="День отчётов">
          <button class="btn btn-ghost btn-sm" data-ip-rday="-1" aria-label="Предыдущий день">‹</button>
          <input class="input" type="date" data-ip-rday-set value="${rep.day}" max="${todayD}" aria-label="День">
          <button class="btn btn-ghost btn-sm" data-ip-rday="1" aria-label="Следующий день" ${rep.day >= todayD ? 'disabled' : ''}>›</button>
          <span class="ip-repday">${esc(rel)}</span>
        </div>
        <div class="ip-repexp" role="group" aria-label="Выгрузка для бухгалтерии">
          <span>Бухгалтерии</span>
          <input class="input" type="date" data-ip-rexp="from" value="${rep.from}" max="${todayD}" aria-label="Период с">
          <span>—</span>
          <input class="input" type="date" data-ip-rexp="to" value="${rep.to}" max="${todayD}" aria-label="Период по">
          <button class="btn btn-ghost btn-sm" data-ip-rexp-go>Выгрузить xlsx</button>
        </div>
      </div>
      ${reportTiles(t, n)}
      ${rows.length ? `<div class="icols ip-cols"><div class="ip-scroll"><table class="itbl ip-tbl ip-reptbl">
        <colgroup><col class="c-name"><col class="c-rep"><col class="c-rep"><col class="c-k"><col class="c-k"><col class="c-k"><col class="c-k"><col class="c-fuel"></colgroup>
        <thead><tr><th>Осмотрщик</th><th>Утренний</th><th>Вечерний</th><th class="num" title="Назначений с плановой датой этого дня">План</th>
          <th class="num" title="Отмечено осмотренным в вечернем отчёте">Осмотрено</th><th class="num">Пробег, км</th><th class="num">Литры</th><th>Топливо</th></tr></thead>
        <tbody>${rows.map(({ name, d, planned, inspected }) => `<tr data-ip-dp-open="report:${esc(name)}|${rep.day}" tabindex="0" class="${sel === `${name}|${rep.day}` ? 'cur' : ''}">
          <td>${esc(name)}</td>${repCells(d)}
          <td class="num">${planned || '—'}</td><td class="num">${inspected === null ? '—' : inspected}</td>
          <td class="num">${kmCell(d)}</td><td class="num">${numFmt(d.litres, 1)}</td><td>${esc(d.fuel || '—')}</td></tr>`).join('')}</tbody>
        <tfoot><tr><th scope="row">Итого</th><td>${t.morning} из ${n}</td><td>${t.evening} из ${n}</td><td class="num">${t.planned}</td><td class="num">${t.inspected}</td>
          <td class="num">${numFmt(t.km)}</td><td class="num">${numFmt(t.litres, 1)}</td><td></td></tr></tfoot>
      </table></div></div>` : '<p class="ip-hint ip-empty">Под фильтр никто не подошёл.</p>'}`;
  }

  // --- маршрут дня и нормы осмотра (пункты 7.2–7.4) ------------------------
  //
  // Слева — остановки по порядку: дорога и осмотр у каждой, прибытие и
  // уход; справа — карта OSM с домом, номерами остановок и кругом маршрута.
  // Предложенные системой объекты — совет: лишний убирается, остальные
  // назначаются одной кнопкой на этот день.
  const objectContentsIds = (typeId, ocId) => { const c = objectContents(typeId, ocId); return c ? c.oi.map((o) => o.id) : []; };
  const firstWorkday = (name) => { for (let k = 0; k < 14; k++) { const d = shiftD(todayD, k); if (workdayOf(name, d).ok) return d; } return todayD; };
  const route = { day: '', person: '', skip: new Set(), homeMode: false };
  let routeMap = null;
  const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`);
  function routeHTML(me) {
    if (route.person !== me.name) { route.person = me.name; route.day = firstWorkday(me.name); route.skip = new Set(); route.homeMode = false; }
    const r = dayRoute(all, me.name, route.day, route.skip);
    const wd = WDL[new Date(route.day + 'T00:00:00').getDay()];
    // Переработка 13.10.2026 («Карта мелкая, список тоже. Пол экрана под
    // мусор… неплотно упакованный»): день и итоги — одной строкой вместо
    // плиток, список — узкой колонкой со своей прокруткой, остальное — карте
    // (практика APCS «карта во всё место, список — одной панелью рядом»).
    const stop = (x, i) => `<li class="ip-stop ${x.fixed ? 'fixed' : 'prop'}" data-ip-stop="${i + 1}">
        <span class="ip-stop-n">${i + 1}</span>
        <div class="ip-stop-b">
          <b class="ip-stop-h" title="${esc(x.s.title)}">${esc(x.s.title)}</b>
          <span class="ip-sub">${esc([x.s.typeLabel, x.s.metrics && x.s.metrics.area ? `${Math.round(x.s.metrics.area).toLocaleString('ru-RU')} м²` : '', x.s.institution].filter(Boolean).join(' · '))}</span>
          <span class="ip-stop-t"><i class="${x.fixed ? 'k-plan' : 'k-act'}">${x.fixed ? (x.done ? 'осмотрено' : 'назначено') : 'предложено'}</i> · дорога ${x.drive} мин · ${x.km.toFixed(1).replace('.', ',')} км</span>
        </div>
        ${x.fixed ? '' : `<button class="ip-x" data-ip-route-skip="${esc(x.key)}" aria-label="Убрать из маршрута" title="Убрать из маршрута">×</button>`}
      </li>`;
    const addr = profileOf(me.name).homeAddress;
    return `<div class="ip-repbar ip-routebar">
        <div class="ip-daynav" role="group" aria-label="День маршрута">
          <button class="btn btn-ghost btn-sm" data-ip-route-day="-1" aria-label="Предыдущий день">‹</button>
          <input class="input" type="date" data-ip-route-set value="${route.day}" aria-label="День">
          <button class="btn btn-ghost btn-sm" data-ip-route-day="1" aria-label="Следующий день">›</button>
          <span class="ip-repday">${esc(wd)}${r.regions.length ? ` · ${esc(r.regions.join(', '))}` : ''}</span>
        </div>
        <!-- Прогноз времени осмотра не показывается (указание пользователя
             13.10.2026: «Прогнозируемое время осмотра надо убрать. Ситуации
             бывают разными»; «Только скрыть в маршруте»): ни осмотр, ни
             прибытие, ни возвращение — они складываются из прогноза. Нормы и
             подбор предложений на день остаются. -->
        <p class="ip-route-sum">выезд <b>${r.start}</b> · пробег <b>${r.km}</b> км · дорога <b>${dur(r.driveMin)}</b> · объектов <b>${r.stops.length}</b></p>
      </div>
      ${!r.work.ok ? `<p class="ip-warn">Не рабочий день: ${esc(r.work.reason)}.</p>` : ''}
      ${!r.home.gps ? '<p class="ip-warn">Точка дома не указана — маршрут считается от первого объекта. Укажите дом на карте.</p>' : ''}
      <div class="ip-route">
        <div class="ip-route-side">
        <ol class="ip-stops">
          <li class="ip-stop home"><span class="ip-stop-n">⌂</span><div class="ip-stop-b"><span class="ip-stop-t" title="${esc(addr || '')}"><b>Выезд ${r.start}</b> · ${esc(addr || r.home.label)}</span></div></li>
          ${r.stops.map(stop).join('')}
          <li class="ip-stop home"><span class="ip-stop-n">⌂</span><div class="ip-stop-b"><span class="ip-stop-t"><b>Возвращение</b> · дорога ${r.back.min} мин · ${r.back.km.toFixed(1).replace('.', ',')} км</span></div></li>
        </ol>
        ${r.proposed.length ? `<button class="btn btn-primary btn-sm" data-ip-route-assign>Назначить предложенные (${r.proposed.length})</button>` : ''}
        </div>
        <!-- «Указать дом» — кнопкой на самой карте: действие над картой
             (островок управления поверх карты, практика APCS по картам). -->
        <div class="ip-map-wrap">
          <div class="ip-map" data-ip-map role="img" aria-label="Карта маршрута"></div>
          <button class="btn btn-sm ip-map-btn ${route.homeMode ? 'on' : ''}" data-ip-route-home aria-pressed="${route.homeMode}">${route.homeMode ? 'Щёлкните по карте…' : 'Указать дом на карте'}</button>
        </div>
      </div>
      ${route.skip.size ? `<p class="ip-hint">Убрано из предложений: ${route.skip.size}. <button class="btn btn-ghost btn-sm" data-ip-route-unskip>Вернуть</button></p>` : ''}
      ${r.noGps.length ? `<p class="ip-hint">Без координат, не на карте: ${r.noGps.map((x) => esc(x.s.title)).join('; ')}.</p>` : ''}`;
  }
  // Высота карты — по месту (13.10.2026: «в высоту тоже надо»): на широком —
  // видимая высота прокрутки карточки (карта закреплена сбоку), на узком —
  // половина её; при любом изменении размера — пересчёт и invalidateSize, иначе
  // Leaflet рисует серые куски.
  let routeObs = null;
  function fitRouteMap(box) {
    // Область, которая правда прокручивается сама; иначе (узкая раскладка —
    // прокручивается страница) — высота окна. От растущей карточки высоту не
    // берём: карта растила бы карточку, а карточка — карту.
    const sc = box.closest('.ip-pscroll, .ip-card-body, .ip-scroll');
    const own = sc && /auto|scroll/.test(getComputedStyle(sc).overflowY) && sc.clientHeight < innerHeight - 1;
    const narrow = getComputedStyle(box.parentElement).position !== 'sticky';
    let h;
    if (narrow) {
      h = (own ? sc.clientHeight : innerHeight) * 0.5;
    } else {
      // Место под верхним краем карты в области прокрутки (при прокрутке в
      // начало): короткий список не получает лишней прокрутки от карты
      // («есть прокрутка — значит подстраивается криво», 13.10.2026).
      const top = own ? box.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop : box.getBoundingClientRect().top + scrollY;
      const pad = parseFloat(getComputedStyle(own ? sc : document.body).paddingBottom) || 0;
      h = (own ? sc.clientHeight : innerHeight) - top - pad - 12;
    }
    box.style.height = `${Math.max(300, Math.round(h))}px`;
    // Список остановок — той же высоты, что карта, со своей прокруткой.
    box.closest('.ip-route').style.setProperty('--route-h', box.style.height);
    // Только сообщить карте новый размер — без перевписывания: оно
    // перехватывало зум человека.
    if (routeMap) routeMap.resize();
  }
  async function mountRouteMap() {
    const box = scope.$('[data-ip-map]');
    if (!box || !view.person) return;
    if (routeObs) { routeObs.disconnect(); routeObs = null; }
    fitRouteMap(box);
    try {
      await drawRouteMap(box);
    } catch (e) {
      // Карта не нарисовалась — говорим об этом в ней самой, а не пустым полем.
      console.error('Карта маршрута не нарисована', e);
      if (routeMap) { routeMap.remove(); routeMap = null; }
      box.innerHTML = `<div class="ip-map-err">Карта не нарисовалась: ${esc(e.message || String(e))}. Обновите страницу (Ctrl+F5).</div>`;
      return;
    }
    const sc = box.closest('.ip-pscroll, .ip-card-body, .ip-scroll');
    // Наблюдатель снимает сам себя: к его вызову общий routeObs мог уже
    // смениться или обнулиться перерисовкой (матрица взаимодействий 13.10.2026:
    // «Cannot read properties of null (reading 'disconnect')»).
    routeObs = new ResizeObserver((_, obs) => {
      if (box.isConnected) { fitRouteMap(box); return; }
      obs.disconnect();
      if (routeObs === obs) routeObs = null;
    });
    routeObs.observe(box.parentElement);
    if (sc) routeObs.observe(sc);
  }
  // Карта маршрута — MapLibre GL, как сцена (указание пользователя
  // 13.10.2026: «Переходи на maplibre… И не забудь про maplibre»): плавный
  // масштаб, Кадастр где смотришь, свои участки — по контуру. Значки
  // остановок — те же HTML-значки с номером; близкие на начальном масштабе
  // (ближе 24 px) — одним «2 · 5»; при масштабе не перестраиваются (прежние
  // замечания «маркеры слетают», «зум перестал работать»). Наведение на
  // строку списка открывает подсказку её значка.
  async function drawRouteMap(box) {
    const r = dayRoute(all, view.person, route.day, route.skip);
    const gl = await loadMapLibre(host.ensureStyle);
    if (!box.isConnected) return;
    if (routeMap) { routeMap.remove(); routeMap = null; }
    const pts = [];
    if (r.home.gps) pts.push(r.home.gps);
    r.stops.forEach((x) => pts.push(x.gps));
    const map = await createMap(gl, box, pts.length ? { center: [pts[0][1], pts[0][0]], zoom: 11 } : {});
    if (!box.isConnected) { map.remove(); return; }
    routeMap = map;
    box._map = map;   // для замеров и проверок: значок ↔ его точка на карте
    // Кадастр — первым слоем: маршрут и свои участки ложатся поверх.
    attachCadastreGL(gl, map);
    ownParcelsGL(map, r.stops.map((x) => { const rec = loadOcRecord(x.s.typeId, x.s.id); return rec && rec.geo; }));
    const line = [...r.stops.map((x) => x.gps)];
    if (r.home.gps && r.stops.length) { line.unshift(r.home.gps); line.push(r.home.gps); }
    map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: line.map(([la, lo]) => [lo, la]) }, properties: {} } });
    map.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round' },
      paint: { 'line-color': '#1668c9', 'line-width': 3, 'line-opacity': 0.8, 'line-dasharray': [2, 2] } });
    if (pts.length > 1) {
      const lats = pts.map((x) => x[0]);
      const lons = pts.map((x) => x[1]);
      map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 48, maxZoom: 14, animate: false });
    } else if (pts.length) map.jumpTo({ center: [pts[0][1], pts[0][0]], zoom: 14 });
    const items = [];
    if (r.home.gps) items.push({ n: '⌂', cls: 'home', ll: r.home.gps, tip: `<b>${esc(r.home.label === 'дом' ? 'Дом' : 'Временное жильё')}</b><br>выезд ${r.start}` });
    r.stops.forEach((x, i) => items.push({
      n: String(i + 1), cls: x.fixed ? 'fixed' : 'prop', ll: x.gps,
      tip: `<b>${i + 1}. ${esc(x.s.title)}</b><br>${esc(x.s.typeLabel || '')}${x.s.typeLabel ? ' · ' : ''}дорога ${x.drive} мин · ${x.km.toFixed(1).replace('.', ',')} км<br><i>${x.fixed ? (x.done ? 'осмотрено' : 'назначено') : 'предложено'}</i>`,
    }));
    const groups = [];
    items.forEach((it) => {
      const pt = map.project([it.ll[1], it.ll[0]]);
      const g = groups.find((x) => Math.hypot(x.pt.x - pt.x, x.pt.y - pt.y) < 24);
      if (g) g.items.push(it); else groups.push({ pt, items: [it] });
    });
    const tip = new gl.Popup({ closeButton: false, closeOnClick: false, className: 'map-tip-gl', offset: 16, maxWidth: '300px' });
    const byN = new Map();
    box._pins = [];
    groups.forEach((g) => {
      const lead = g.items[0];
      const cls = g.items.some((x) => x.cls === 'fixed') ? 'fixed' : lead.cls;
      const wide = g.items.length > 1;
      const el = document.createElement('div');
      el.className = `ip-pin ${cls}`;
      el.innerHTML = `<span${wide ? ' class="wide"' : ''}>${g.items.map((x) => x.n).join(' · ')}</span>`;
      const ll = [lead.ll[1], lead.ll[0]];
      const html = g.items.map((x) => x.tip).join('<hr>');
      const open = () => tip.setLngLat(ll).setHTML(html).addTo(map);
      el.addEventListener('mouseenter', open);
      el.addEventListener('mouseleave', () => tip.remove());
      new gl.Marker({ element: el, anchor: 'center' }).setLngLat(ll).addTo(map);
      box._pins.push({ el, ll });
      g.items.forEach((x) => byN.set(x.n, open));
    });
    // Строка списка ↔ значок: наведение на строку открывает подсказку значка.
    scope.$$('[data-ip-stop]').forEach((li) => {
      li.addEventListener('mouseenter', () => { const f = byN.get(li.dataset.ipStop); if (f) f(); });
      li.addEventListener('mouseleave', () => tip.remove());
    });
    map.on('click', (e) => {
      if (!route.homeMode) return;
      saveProfile(view.person, { homeGps: `${e.lngLat.lat.toFixed(5)}, ${e.lngLat.lng.toFixed(5)}` });
      route.homeMode = false;
      redraw();
      host.toast('Точка дома сохранена', 'ok');
    });
  }

  // Нормы осмотра (7.3–7.4): основа и минуты на 1 м² по виду здания; по
  // факту — медиана из истории (от первых снимков до окончания осмотра).
  function normsHTML() {
    const fact = measuredNorms(all);
    const f3 = (v) => (v === undefined || v === null ? '' : String(Math.round(v * 1000) / 1000).replace('.', ','));
    return `<p class="ip-hint">Осмотр объекта = основа + площадь × минут на 1 м². По этим нормам считается маршрут дня; «по факту» — из законченных осмотров: от первых снимков до окончания.</p>
      <div class="icols ip-cols"><div class="ip-scroll"><table class="itbl ip-tbl ip-normtbl">
        <colgroup><col><col class="c-n"><col class="c-n"><col class="c-f"><col class="c-n"></colgroup>
        <thead><tr><th>Вид здания</th><th class="num">Основа, мин</th><th class="num">На 1 м², мин</th><th class="num">По факту на 1 м²</th><th class="num" title="Осмотр 1000 м² по норме">1000 м², мин</th></tr></thead>
        <tbody>${NORM_KINDS.map((k) => {
          const n = normOf(k.key);
          const m = fact[k.key];
          return `<tr><td>${esc(k.label)}</td>
            <td class="num"><input class="input" inputmode="numeric" data-ip-norm="${k.key}" data-k="base" value="${n.base}" aria-label="Основа, ${esc(k.label)}"></td>
            <td class="num"><input class="input" inputmode="decimal" data-ip-norm="${k.key}" data-k="perM2" value="${f3(n.perM2)}" aria-label="На 1 м², ${esc(k.label)}"></td>
            <td class="num">${m ? `${f3(m.perM2)} <span class="ip-muted">· ${m.n} осм.</span> <button class="btn btn-ghost btn-sm" data-ip-norm-take="${k.key}" data-v="${m.perM2}">взять</button>` : '<span class="ip-muted">нет данных</span>'}</td>
            <td class="num"><b>${Math.round(n.base + 1000 * n.perM2)}</b></td></tr>`;
        }).join('')}</tbody>
      </table></div></div>`;
  }

  // План месяца (пункт 7.1 ТЗ рабочего дня): будни месяца строками, правка
  // прямо в ячейках — сохраняется при уходе из ячейки, Enter — ниже по
  // столбцу, как в таблице; справа — что на деле: назначения и работа вне
  // выездов, чтобы план сверялся с фактом.
  function monthPlanHTML(name) {
    const [y, m] = rep.ym.split('-').map(Number);
    const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
    const days = [];
    for (let d = new Date(y, m - 1, 1); d.getMonth() === m - 1; d.setDate(d.getDate() + 1)) {
      const iso = isoD(d);
      const w = workdayOf(name, iso);
      if (w.ok || planOf(name, iso)) days.push({ iso, w });
    }
    const regions = Object.values(ENI_REGIONS);
    const live = allAssignments().filter((a) => a.person === name && a.state !== 'removed');
    return `<div class="ip-repbar">
        <div class="ip-daynav" role="group" aria-label="Месяц плана">
          <button class="btn btn-ghost btn-sm" data-ip-rmonth="-1" aria-label="Предыдущий месяц">‹</button>
          <span class="ip-repmonth">${MONTHS[m - 1]} ${y}</span>
          <button class="btn btn-ghost btn-sm" data-ip-rmonth="1" aria-label="Следующий месяц">›</button>
        </div>
        <span class="ip-hint" data-ip-plan-saved aria-live="polite"></span>
      </div>
      <div class="icols ip-cols"><div class="ip-scroll"><table class="itbl ip-tbl ip-plantbl">
        <colgroup><col class="c-date"><col class="c-reg"><col class="c-dist"><col><col class="c-note"><col class="c-fact"></colgroup>
        <thead><tr><th>Дата</th><th>Область</th><th>Район</th><th>Учреждения</th><th>Примечание</th><th>На деле</th></tr></thead>
        <tbody>${days.map(({ iso, w }, i) => {
          const p = planOf(name, iso) || {};
          const n = live.filter((a) => a.plannedAt === iso).length;
          const acts = activitiesOn(name, iso).map((a) => activityKind(a.kind).short);
          const cell = (k, attrs = '') => `<input class="input" data-ip-plan="${iso}" data-k="${k}" data-r="${i}" value="${esc(p[k] || '')}" ${attrs}>`;
          return `<tr class="${iso < todayD ? 'ip-off' : ''} ${iso === todayD ? 'cur' : ''}">
            <td class="num"><span class="ip-wd">${WD[new Date(iso + 'T00:00:00').getDay()]}</span> ${esc(fmtDate(iso))}</td>
            <td><select class="select" data-ip-plan="${iso}" data-k="region" data-r="${i}" aria-label="Область ${esc(fmtDate(iso))}"><option value=""></option>${regions.map((r) => `<option ${p.region === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></td>
            <td>${cell('district', `aria-label="Район ${esc(fmtDate(iso))}"`)}</td>
            <td>${cell('institutions', `aria-label="Учреждения ${esc(fmtDate(iso))}"`)}</td>
            <td>${cell('note', `aria-label="Примечание ${esc(fmtDate(iso))}"`)}</td>
            <td>${!w.ok ? `<span class="ip-muted">${esc(w.reason)}</span>` : [n ? `назначено ${n}` : '', ...acts].filter(Boolean).join(', ') || '<span class="ip-muted">—</span>'}</td></tr>`;
        }).join('')}</tbody>
      </table></div></div>`;
  }

  // Отчёты осмотрщика за месяц — по дням, итог в своих столбцах.
  function personReportsHTML(name) {
    const [y, m] = rep.ym.split('-').map(Number);
    const from = `${rep.ym}-01`;
    const to = isoD(new Date(y, m, 0));
    const rows = reportDays(name, from, to);
    const t = reportTotals(rows);
    const n = t.due;
    const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
    const sel = repSel();
    return `<div class="ip-repbar">
        <div class="ip-daynav" role="group" aria-label="Месяц отчётов">
          <button class="btn btn-ghost btn-sm" data-ip-rmonth="-1" aria-label="Предыдущий месяц">‹</button>
          <span class="ip-repmonth">${MONTHS[m - 1]} ${y}</span>
          <button class="btn btn-ghost btn-sm" data-ip-rmonth="1" aria-label="Следующий месяц" ${rep.ym >= todayD.slice(0, 7) ? 'disabled title="Отчётов за следующий месяц ещё нет"' : ''}>›</button>
        </div>
        <button class="btn btn-ghost btn-sm" data-ip-rexp-person="${esc(name)}">Выгрузить месяц для бухгалтерии</button>
      </div>
      ${reportTiles(t, n)}
      ${rows.length ? `<div class="icols ip-cols"><div class="ip-scroll"><table class="itbl ip-tbl ip-reptbl">
        <colgroup><col class="c-date"><col class="c-rep"><col class="c-rep"><col class="c-k"><col class="c-k"><col class="c-k"><col class="c-k"></colgroup>
        <thead><tr><th>Дата</th><th>Утренний</th><th>Вечерний</th><th class="num">План</th><th class="num">Осмотрено</th><th class="num">Пробег, км</th><th class="num">Литры</th></tr></thead>
        <tbody>${rows.map(({ date, d, planned, inspected }) => `<tr data-ip-dp-open="report:${esc(name)}|${date}" tabindex="0" class="${sel === `${name}|${date}` ? 'cur' : ''} ${d.work ? '' : 'ip-off'}">
          <td class="num"><span class="ip-wd">${WD[new Date(date + 'T00:00:00').getDay()]}</span> ${esc(fmtDate(date))}</td>
          ${repCells(d)}
          <td class="num">${planned || '—'}</td><td class="num">${inspected === null ? '—' : inspected}</td>
          <td class="num">${kmCell(d)}</td><td class="num">${numFmt(d.litres, 1)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><th scope="row">Итого</th><td>${t.morning} из ${n}</td><td>${t.evening} из ${n}</td><td class="num">${t.planned}</td><td class="num">${t.inspected}</td>
          <td class="num">${numFmt(t.km)}</td><td class="num">${numFmt(t.litres, 1)}</td></tr></tfoot>
      </table></div></div>` : '<p class="ip-hint ip-empty">В этом месяце отчётов нет.</p>'}`;
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
      ${subTabs('data-ip-atab', view.allTab, ALL_TABS.map(([k, l]) => (k === 'fields' ? [k, l, allCustomFields().length] : [k, l])))}
      <div class="ip-card-body">${view.allTab === 'stats' ? statsHTML({ all, people: list, person: '', period: statPeriod() }) : view.allTab === 'fields' ? fieldsHTML() : view.allTab === 'reports' ? allReportsHTML(list) : view.allTab === 'table' ? tableHTML() : view.allTab === 'totals' ? totalsHTML(list) : view.allTab === 'norms' ? normsHTML() : `${byRegionHTML(list)}${peopleTableHTML(list)}`}</div>
    </section>`;
  }

  function peopleSection() {
    const me = people.find((p) => p.name === view.person);
    const panel = detail.length ? detailHTML(all, people, allAssignments(), detail.map((d) => (d.kind === 'day' ? { ...d, person: view.person } : d))) : '';
    // Табличный вид — во всю ширину: таблица сама список осмотрщиков.
    const wide = !me && view.allTab === 'table';
    return { cls: 'ip-peoplesec' + (panel ? ' has-detail' : '') + (wide ? ' ip-wide' : ''), html: (wide ? '' : peopleListHTML()) + (me ? personCardHTML(me) : allCardHTML()) + panel };
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


  // --- сцена: карта под «Осмотрами» ------------------------------------------------
  //
  // Одна карта на всё время раздела (APCS: «карта — постоянная сцена, режимы
  // — панели над ней; карта отвечает на них и не пересоздаётся»). Строка
  // списка и точка — одно и то же: выбранная строка — точка с кольцом,
  // отмеченные — с белой обводкой, щелчок по точке выбирает строку
  // (практики: выбранное видно постоянно и отлично от наведения; список и
  // карта подсвечивают одно; выбор не подменяет панель, в которой работают).
  // Вписывается в точки только при смене режима или вкладки — масштаб,
  // выбранный человеком, перерисовка не трогает.
  const scene = { el: null, map: null, L: null, layer: null, fitKey: '' };
  let hideList = false;      // панели скрываемы (указание 13.10.2026: «Панели чтобы были скрываемыми»)
  let hidePane = false;
  const gpsCache = new Map();
  const gpsOf = (typeId, id) => {
    const k = typeId + '|' + id;
    if (!gpsCache.has(k)) gpsCache.set(k, gpsOfObject(typeId, id));
    return gpsCache.get(k);
  };
  const DUE_COLOR = { hot: '#c2410c', week: '#d97706', later: '#2563eb', none: '#64748b' };
  // Сцена — на MapLibre GL (видеокарта): плавный масштаб с инерцией, точки
  // объектов растут при приближении, тысячи участков Кадастра без просадки
  // (указание пользователя 13.10.2026: «Переходи на maplibre с их слоем»).
  let sceneLoading = null;
  function ensureScene() {
    if (scene.map) return Promise.resolve(scene);
    if (!sceneLoading) sceneLoading = buildScene().finally(() => { sceneLoading = null; });
    return sceneLoading;
  }
  async function buildScene() {
    const gl = await loadMapLibre(host.ensureStyle);
    const el = document.createElement('div');
    el.className = 'ip-scene';
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', 'Карта объектов');
    // Слой под страницей в рабочей области каркаса (.main-row): левое меню
    // и шапка остаются на своих местах; свернул меню — карта расширилась.
    const row = document.querySelector('.main-row') || document.body;
    row.insertBefore(el, row.firstChild);
    const map = await createMap(gl, el);
    map.addSource('objs', { type: 'geojson', data: emptyFC() });
    // Размер точки — от масштаба: издали мелкие, вблизи крупные («при
    // приближении маркеры не меняют масштаб», 13.10.2026). Выбранная —
    // крупнее и с тёмным кольцом, отмеченные — с белой обводкой.
    const size = (cur, sel, base) => ['case', ['get', 'cur'], cur, ['get', 'sel'], sel, base];
    map.addLayer({ id: 'objs', type: 'circle', source: 'objs', paint: {
      'circle-radius': ['interpolate', ['exponential', 1.4], ['zoom'],
        5, size(6, 4.5, 3), 10, size(8, 6.5, 5), 14, size(11, 9, 7), 17, size(15, 12.5, 10), 19, size(20, 17, 14)],
      'circle-color': ['get', 'color'],
      'circle-stroke-color': ['case', ['get', 'cur'], '#0f172a', '#ffffff'],
      'circle-stroke-width': ['case', ['get', 'cur'], 3, ['get', 'sel'], 2.5, 1.5],
    } });
    const tip = hoverTip(gl, map);
    map.on('mousemove', 'objs', (e) => {
      map.getCanvas().style.cursor = 'pointer';
      const f = e.features[0];
      tip.show(f.geometry.coordinates, f.properties.tip);
    });
    map.on('mouseleave', 'objs', () => { map.getCanvas().style.cursor = ''; tip.hide(); });
    // Двойной щелчок по точке — переход к объекту (указание 13.10.2026);
    // считается по двум щелчкам одной точки (sceneClick), масштаб по
    // двойному щелчку на точке погашен.
    map.on('click', 'objs', (e) => { const x = scene.byKey.get(e.features[0].properties.k); if (x) sceneClick(x); });
    map.on('dblclick', 'objs', (e) => e.preventDefault());
    // Участки и строения Кадастра — где смотришь, под точками объектов.
    attachCadastreGL(gl, map, { beforeId: 'objs' });
    Object.assign(scene, { el, map, gl, byKey: new Map() });
    window.__ipScene = map;   // для замеров и проверок
    scene.obs = new ResizeObserver(() => { if (scene.map) scene.map.resize(); });
    scene.obs.observe(el);
    return scene;
  }
  function scenePoints() {
    if (view.section !== 'assign') return [];
    if (view.tab === 'queue') {
      return applyFilter(queueBase(all), QUEUE_FACETS, QUEUE_RANGES, view.qf, view.q).map((s) => {
        const k = s.typeId + '|' + s.id;
        return { k, typeId: s.typeId, ocId: s.id, ll: gpsOf(s.typeId, s.id), color: DUE_COLOR[s.due] || DUE_COLOR.none,
          tip: `<b>${esc(s.title)}</b><br>${esc([s.typeLabel, s.institution].filter(Boolean).join(' · '))}${s.deadline ? `<br>срок ${esc(fmtDate(s.deadline))}` : ''}` };
      });
    }
    return applyFilter(assignedRows(all, { q: '' }), ASSIGNED_FACETS, ASSIGNED_RANGES, view.af, view.aPerson ? view.q : '')
      .filter(({ a }) => !view.aPerson || view.aPerson === '*' || a.person === view.aPerson).map(({ a, s }) => ({
      k: a.id, typeId: a.typeId, ocId: a.ocId, ll: gpsOf(a.typeId, a.ocId), color: '#1668c9',
      tip: `<b>${esc(s.title)}</b><br>${esc(a.person)}${a.plannedAt ? ` · план ${esc(fmtDate(a.plannedAt))}` : ''}` }));
  }
  async function drawScene(on) {
    document.body.classList.toggle('ip-sheet-open', !on);
    if (!on && !scene.map) return;
    const sc = await ensureScene();
    if (!sc.el.isConnected) { const row = document.querySelector('.main-row') || document.body; row.insertBefore(sc.el, row.firstChild); }
    sc.map.resize();
    const { map } = sc;
    const every = scenePoints();
    const pts = every.filter((x) => x.ll);
    // Честно о том, чего на карте нет: точка только у объекта с координатами
    // (поле GPS или рамка участка из Кадастра).
    const note = scope.$('[data-ip-scene-note]');
    if (note) {
      note.hidden = !every.length || pts.length === every.length;
      note.textContent = `На карте ${pts.length} из ${every.length} — у остальных нет координат (GPS или участка из Кадастра)`;
    }
    sc.byKey = new Map(pts.map((x) => [x.k, x]));
    map.getSource('objs').setData({ type: 'FeatureCollection', features: pts
      // выбранная — последней: рисуется поверх соседей
      .sort((a, b) => (a.k === current) - (b.k === current))
      .map((x) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [x.ll[1], x.ll[0]] },
        properties: { k: x.k, color: x.color, tip: x.tip, cur: x.k === current, sel: checked.has(x.k) } })) });
    const fitKey = view.section + '|' + view.tab + '|' + view.aPerson;
    const box = sc.el.getBoundingClientRect();
    const padding = scenePadding(box);
    const roomy = padding.left + padding.right < box.width - 40 && padding.top + padding.bottom < box.height - 40;
    const fitted = on && pts.length && fitKey !== scene.fitKey;
    if (fitted) {
      scene.fitKey = fitKey;
      const lats = pts.map((x) => x.ll[0]);
      const lons = pts.map((x) => x.ll[1]);
      // Поля не больше самой карты: иначе MapLibre отказывается вписывать.
      if (roomy) map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding, maxZoom: 15, animate: false });
    }
    // Облёт к выбранному (замечание пользователя 13.10.2026: «Перенос к
    // выбранному элементу не реализован. Он выбирается, но карта не
    // перемещается»): выбор в списке плавно переносит карту к точке — в
    // середину видимой части между панелями; совсем издали (мельче города) —
    // заодно приближает до города. Выбор щелчком по самой карте её не
    // двигает: точка и так перед глазами. «Меньше движения» — без анимации.
    const cur = on && current ? sc.byKey.get(current) : null;
    if (cur && current !== scene.flownTo && !fitted && !scene.fromMap && roomy) {
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
      map.easeTo({ center: [cur.ll[1], cur.ll[0]], zoom: Math.max(map.getZoom(), 11), padding, duration: still ? 0 : 700 });
    }
    scene.flownTo = current;
    scene.fromMap = false;
    if (!on) { scene.fitKey = ''; scene.flownTo = ''; }
  }
  // Видимая часть сцены — без панелей и островков: широкое окно — панели по
  // бокам, узкое — список под картой.
  function scenePadding(box) {
    const work = scope.$('.ip-work');
    const side = work && getComputedStyle(work).position === 'absolute';
    const isles = scope.$('.ip-isles');
    const top = isles ? isles.getBoundingClientRect().bottom - box.top + 12 : 72;
    const pad = side ? { top, left: sceneLeft(box), right: sceneRight(box), bottom: 40 }
      : { top, left: 24, right: 24, bottom: Math.max(40, box.bottom - (work ? work.getBoundingClientRect().top : box.bottom) + 24) };
    // Только числа: сцена, скрытая под поверхностью или на узком окне до
    // раскладки, давала NaN, и MapLibre падал «Invalid value for edge-insets»
    // (матрица путей 13.10.2026).
    Object.keys(pad).forEach((k) => { pad[k] = Number.isFinite(pad[k]) ? Math.max(0, Math.round(pad[k])) : 0; });
    return pad;
  }
  // Место, которое панели занимают слева и справа: точки вписываются в
  // видимую часть сцены, а не под панели.
  const sceneLeft = (box) => { const el = scope.$('.ip-work'); return el && !hideList ? el.getBoundingClientRect().right - box.left + 16 : 40; };
  const sceneRight = (box) => { const el = scope.$('.ip-pane'); return el && !hidePane ? box.right - el.getBoundingClientRect().left + 16 : 40; };
  // Подменю раздела — островком в строке режимов, а не внутри содержимого
  // (указание пользователя 13.10.2026: «Вот эта навигация спрятана по сути.
  // Её тоже надо перенести. Каждые такие меню должны идти в строке выше»).
  // Узел переносится целиком — атрибуты и обработчики те же; не влезла
  // строка — островки переносятся вторым рядом, и панели отсчитываются от
  // её низа.
  function liftSubTabs() {
    const isles = scope.$('.ip-isles');
    if (!isles) return;
    // Порядок: режимы, уведомления, подменю — колокольчик не уезжает один в
    // нижний ряд, когда подменю переносится.
    scope.$$('.ip > * .ip-subtabs, .ip > .ip-subtabs').forEach((el) => {
      el.classList.add('ip-isl', 'ip-subisle');
      isles.appendChild(el);
    });
    fitSceneTop();
    // Высота строки островков меняется и после отрисовки (догрузились
    // шрифты и стили, перенос рядов): пересчёт по наблюдателю размера, иначе
    // при обновлении страницы панели отсчитывались от завышенной строки и
    // рабочую зону «сплющивало» (замечание пользователя 13.10.2026).
    islesObs.disconnect();
    islesObs.observe(isles);
  }
  const islesObs = new ResizeObserver(() => fitSceneTop());
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitSceneTop());
  function fitSceneTop() {
    const page = scope.$('.ip-page');
    const isles = scope.$('.ip-isles');
    if (!page || !isles) return;
    const top = Math.round(isles.getBoundingClientRect().bottom - page.getBoundingClientRect().top + 10);
    page.style.setProperty('--scene-top', top + 'px');
  }
  // «Перейти» стоит на верхней полосе системы по её середине: узел — в
  // странице (обработчики раздела), место — по полосе, при любом размере.
  function placeJump() {
    const j = scope.$('.ip-jump');
    const bar = document.querySelector('.topbar');
    if (!j || !bar) return;
    const r = bar.getBoundingClientRect();
    // Ширина — по свободному месту полосы: «Осмотры» слева и меню
    // пользователя справа не перекрываются ни на какой ширине окна.
    // Середина полосы — если там хватает места; иначе — середина промежутка
    // между «Осмотры» и меню пользователя.
    const user = bar.querySelector('#userMenu');
    const crumbs = bar.querySelector('#crumbs');
    const from = (crumbs ? crumbs.getBoundingClientRect().right : r.left) + 16;
    const to = (user ? user.getBoundingClientRect().left : r.right) - 16;
    const mid = r.left + r.width / 2;
    const half = Math.min(260, mid - from, to - mid);
    if (half >= 150) { j.style.width = `${half * 2}px`; j.style.left = `${mid}px`; }
    else { const w = Math.max(140, Math.min(520, to - from)); j.style.width = `${w}px`; j.style.left = `${from + w / 2}px`; }
    j.style.top = `${r.top + (r.height - 32) / 2}px`;
  }
  const onResize = () => { placeJump(); fitSceneTop(); };
  window.addEventListener('resize', onResize);
  const barObs = new ResizeObserver(onResize);
  if (document.querySelector('.topbar')) barObs.observe(document.querySelector('.topbar'));
  let lastDot = { k: '', t: 0 };
  function sceneClick(x) {
    const now = Date.now();
    if (lastDot.k === x.k && now - lastDot.t < 450) {
      lastDot = { k: '', t: 0 };
      location.hash = build({ typeId: x.typeId, ocId: x.ocId });
      return;
    }
    lastDot = { k: x.k, t: now };
    scene.fromMap = true;
    // Щелчок по объекту открывает его панель назначения (даже скрытую),
    // повторный щелчок по тому же объекту — скрывает её (указание
    // 13.10.2026: «при нажатии на объект, если есть взаимодействие с боковой
    // панелью, её открываем. Повторный клик — скрытие»).
    if (x.k === current && !hidePane) { hidePane = true; redraw(); return; }
    hidePane = false;
    pickFromScene(x.k);
  }
  function pickFromScene(k) {
    current = k;
    confirmRemove = false;
    redraw();
    const row = scope.$(`[data-ip-row="${CSS.escape(k)}"]`);
    if (row) row.scrollIntoView({ block: 'nearest' });
  }

  // --- отрисовка ------------------------------------------------------------------
  // --- кадастр и добывание документов (ТЗ рабочего дня осмотрщика, раздел 5)
  //
  // Слева — запросы (открытые сверху), справа — выбранный: сводка по строкам
  // (получено N из M, нет, отказ, ждёт — полосой и плитками), строки с ответом,
  // кто и когда ответил; или форма нового запроса. Практики: у каждой строки
  // своё состояние, закрытые строки остаются в списке, причина «нет» и
  // «отказа» — словами (FileInvite, Thomson Reuters Onvio, Box Requests).
  let cadDraft = null;
  const cadOpen = (r) => cadSummary(r).wait > 0;
  const cadBar = (t) => `<div class="ip-cadbar" role="img" aria-label="Получено ${t.got}, нет ${t.none}, отказ ${t.refused}, ждёт ${t.wait} из ${t.total}">
    ${['got', 'none', 'refused', 'wait'].map((k) => (t[k] ? `<i class="k-${k}" style="flex:${t[k]}"></i>` : '')).join('')}</div>`;
  function cadListHTML() {
    const list = allCadRequests().slice().sort((a, b) => (cadOpen(b) - cadOpen(a)) || String(b.at).localeCompare(String(a.at)));
    return `<aside class="ip-people" aria-label="Запросы документов">
      <div class="ip-people-head"><button class="btn btn-primary btn-sm" data-ip-cad-new>Новый запрос</button></div>
      <ul class="ip-people-list">${list.map((r) => {
        const t = cadSummary(r);
        const late = r.due && r.due < todayD && t.wait;
        return `<li class="ip-person ${view.cadSel === r.id ? 'on' : ''}"><button class="ip-person-main" data-ip-cad="${esc(r.id)}" aria-pressed="${view.cadSel === r.id}">
          <span class="ip-person-name">№ ${r.no} · ${esc(cadKindLabel(r.kind))}</span>
          <span class="ip-person-load"><span>${esc(r.person)}</span></span>
          <span class="ip-person-load"><span>получено <b>${t.got}</b> из ${t.total}</span>${t.wait ? `<span class="${late ? 'ip-late' : ''}">ждёт <b>${t.wait}</b>${r.due ? ` · до ${esc(fmtDate(r.due).slice(0, 5))}` : ''}</span>` : '<span>закрыт</span>'}</span>
          ${cadBar(t)}</button></li>`;
      }).join('') || '<li class="ip-hint ip-people-empty">Запросов нет.</li>'}</ul>
    </aside>`;
  }
  function cadCardHTML(r) {
    const t = cadSummary(r);
    const fmtAt = (iso) => (iso ? `${fmtDate(iso)} ${new Date(iso).toTimeString().slice(0, 5)}` : '');
    return `<section class="ip-work ip-card" aria-label="Запрос № ${r.no}">
      <header class="ip-card-head">
        <div class="ip-card-title"><h1>${esc(cadKindLabel(r.kind))} № ${r.no}</h1>
          <p class="ip-card-contacts">${esc(r.person)} · создан ${esc(fmtDate(r.at))}${r.by ? `, ${esc(r.by)}` : ''}${r.due ? ` · срок <b class="${r.due < todayD && t.wait ? 'ip-late' : ''}">${esc(fmtDate(r.due))}</b>` : ''}${r.note ? ` · ${esc(r.note)}` : ''}</p></div>
        <div class="ip-tiles ip-tiles-head">${tile('Получено', `${t.got} из ${t.total}`)}${tile('Нет в кадастре', t.none, t.none ? 'warn' : '')}${tile('Отказ', t.refused, t.refused ? 'warn' : '')}${tile('Ждёт', t.wait)}</div>
        <div class="ip-head-act"><button class="btn btn-ghost btn-sm" data-ip-cad-xlsx="${esc(r.id)}">Отчёт xlsx</button></div>
      </header>
      ${cadBar(t)}
      <div class="ip-card-body"><div class="icols ip-cols"><div class="ip-scroll"><table class="itbl ip-tbl ip-cadtbl">
        <colgroup><col class="c-inst"><col class="c-eni"><col class="c-doc"><col class="c-res"><col class="c-file"><col class="c-date"><col class="c-ans"></colgroup>
        <thead><tr><th>№ учр.</th><th>ЕНИ</th><th>Документ</th><th>Итог</th><th>Файл</th><th class="num">Дата скан.</th><th>Ответ</th></tr></thead>
        <tbody>${r.rows.map((x) => {
          const s = all.get(x.typeId + '|' + x.ocId);
          return `<tr><td class="num" title="${esc(x.inst)}">${esc(codeByName(x.inst) || '—')}</td><td class="mono">${esc(x.eni)}</td>
            <td><b>${esc(x.doc)}</b>${s ? `<span class="ip-sub">${esc(s.title)}</span>` : ''}${x.note ? `<span class="ip-sub">${esc(x.note)}</span>` : ''}</td>
            <td><span class="ip-rmark ${x.result === 'got' ? 'ok' : x.result ? 'off' : 'wait'}">${esc(cadResultLabel(x.result))}</span></td>
            <td>${x.file ? (x.file.docId && x.typeId ? `<a href="${esc(build({ typeId: x.typeId, ocId: x.ocId }))}" title="В документах объекта">${esc(x.file.name || cadFileName(x, codeByName(x.inst)))}</a>` : esc(x.file.name || cadFileName(x, codeByName(x.inst)))) : '—'}</td>
            <td class="num">${esc(fmtDate(x.scanDate) || '—')}</td>
            <td>${x.answer ? esc(x.answer) : ''}${x.answeredAt ? `<span class="ip-sub">${esc(x.answeredBy || '')}, ${esc(fmtAt(x.answeredAt))}</span>` : ''}</td></tr>`;
        }).join('')}</tbody>
      </table></div></div></div>
    </section>`;
  }
  function cadFormHTML() {
    const d = cadDraft;
    const eligible = people.filter((p) => !p.fired);
    const q = (d.q || '').trim().toLowerCase();
    const found = q.length >= 2 ? [...all.values()].filter((s) => `${s.eniAll || ''} ${s.eni || ''}`.toLowerCase().includes(q) || (s.title || '').toLowerCase().includes(q)).slice(0, 8) : [];
    return `<section class="ip-work ip-card" aria-label="Новый запрос документов">
      <header class="ip-card-head"><div class="ip-card-title"><h1>Новый запрос</h1></div></header>
      <div class="ip-card-body"><div class="ip-cadform">
        <div class="ip-prow">
          <div class="field"><span class="ip-flabel" id="ip-cad-kind-l">Вид</span><div class="ip-segf" role="radiogroup" aria-labelledby="ip-cad-kind-l">${CAD_KINDS.map((k) => `<label><input type="radio" name="ip-cad-kind" data-ip-cadf="kind" value="${k.key}" ${d.kind === k.key ? 'checked' : ''}><span>${k.label}</span></label>`).join('')}</div></div>
          <div class="field"><label for="ip-cad-person">Осмотрщик</label><select class="select" id="ip-cad-person" data-ip-cadf="person"><option value="">—</option>
            ${eligible.map((p) => { const no = d.kind === 'cadastre' && !profileOf(p.name).cadastre; return `<option value="${esc(p.name)}" ${d.person === p.name ? 'selected' : ''} ${no ? 'disabled' : ''}>${esc(p.name)}${no ? ' — нет доступа в кадастр' : ''}</option>`; }).join('')}</select></div>
        </div>
        <div class="ip-prow">
          <div class="field"><label for="ip-cad-due">Срок</label><input class="input" type="date" id="ip-cad-due" data-ip-cadf="due" value="${esc(d.due)}"></div>
          <div class="field"><label for="ip-cad-note">Комментарий к запросу</label><input class="input" id="ip-cad-note" data-ip-cadf="note" value="${esc(d.note)}"></div>
        </div>
        <div class="field ip-cad-find"><label for="ip-cad-q">Добавить объект — ЕНИ или адрес</label>
          <span class="isearch">${SEARCH_ICON}<input id="ip-cad-q" data-ip-cad-q value="${esc(d.q || '')}" autocomplete="off" placeholder="не меньше двух знаков"></span>
          ${found.length ? `<ul class="ip-cad-found">${found.map((s) => `<li><button data-ip-cad-add="${esc(s.typeId + '|' + s.id)}"><span class="mono">${esc(s.eni || '')}</span> ${esc(s.title)}<span class="ip-sub">${esc([s.typeLabel, s.institution].filter(Boolean).join(' · '))}</span></button></li>`).join('')}</ul>` : ''}
        </div>
        <datalist id="ip-cad-docs">${CAD_DOCS.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
        ${d.rows.length ? `<div class="icols ip-cols"><div class="ip-scroll"><table class="itbl ip-tbl ip-cadtbl">
          <colgroup><col class="c-inst"><col class="c-eni"><col><col><col><col class="c-x"></colgroup>
          <thead><tr><th>№ учр.</th><th>ЕНИ</th><th>Объект</th><th>Документ</th><th>Комментарий</th><th></th></tr></thead>
          <tbody>${d.rows.map((x, i) => `<tr><td class="num" title="${esc(x.inst)}">${esc(codeByName(x.inst) || '—')}</td><td class="mono">${esc(x.eni)}</td><td>${esc(x.title)}</td>
            <td><input class="input" list="ip-cad-docs" data-ip-cad-row="${i}" data-k="doc" value="${esc(x.doc)}" aria-label="Документ"></td>
            <td><input class="input" data-ip-cad-row="${i}" data-k="note" value="${esc(x.note)}" aria-label="Комментарий"></td>
            <td><button class="ip-x" data-ip-cad-del="${i}" aria-label="Убрать строку" title="Убрать строку">×</button></td></tr>`).join('')}</tbody>
        </table></div></div>` : '<p class="ip-hint">Строк пока нет — найдите объект по ЕНИ или адресу.</p>'}
        <div class="ip-profile-act"><span class="ip-err" data-ip-cad-err role="alert"></span>
          <button class="btn btn-ghost btn-sm" data-ip-cad-cancel>Отменить</button>
          <button class="btn btn-primary btn-sm" data-ip-cad-create>Создать запрос</button></div>
      </div></div>
    </section>`;
  }
  function cadSection() {
    const list = allCadRequests();
    if (!cadDraft && !cadRequest(view.cadSel)) view.cadSel = list.length ? list.slice().sort((a, b) => (cadOpen(b) - cadOpen(a)) || String(b.at).localeCompare(String(a.at)))[0].id : '';
    const r = cadRequest(view.cadSel);
    const card = cadDraft ? cadFormHTML() : r ? cadCardHTML(r) : '<section class="ip-work ip-card"><p class="ip-hint ip-empty">Запросов нет — создайте первый.</p></section>';
    return { cls: 'ip-peoplesec ip-cadsec', html: cadListHTML() + card };
  }

  // --- уведомления (ТЗ рабочего дня осмотрщика, раздел 8) -------------------
  //
  // Слева — отборы по видам с числом; справа — лента по дням, новые сверху;
  // непрочитанное — жирным с точкой. Щелчок — к причине: отчёты дня,
  // назначение, объект очереди, профиль; уведомление помечается прочитанным.
  let notes = [];
  const readSet = () => new Set(view.notesRead);
  function notesSection() {
    const read = readSet();
    const mine = myPeople();
    const base = notes.filter((n) => view.peopleMode !== 'mine' || !n.person || mine.has(n.person));
    const list = base.filter((n) => (!view.notesKind || n.kind === view.notesKind) && (!view.notesUnread || !read.has(n.id)));
    const count = (k) => base.filter((n) => n.kind === k).length;
    const unreadN = base.filter((n) => !read.has(n.id)).length;
    const relDay = (iso) => (iso === todayD ? 'Сегодня' : iso === shiftD(todayD, -1) ? 'Вчера' : iso > todayD ? `${WDL[new Date(iso + 'T00:00:00').getDay()]}, ${fmtDate(iso)} — впереди` : `${WDL[new Date(iso + 'T00:00:00').getDay()]}, ${fmtDate(iso)}`);
    const days = [...new Set(list.map((n) => n.date))];
    const aside = `<aside class="ip-people" aria-label="Отбор уведомлений">
      <div class="ip-people-head">
        <div class="ip-seg" role="group" aria-label="Чьи уведомления">
          <button data-ip-mode="mine" aria-pressed="${view.peopleMode === 'mine'}" title="Закреплены за вами — «Ответственное лицо» в профиле">Мои <b>${mine.size}</b></button>
          <button data-ip-mode="all" aria-pressed="${view.peopleMode === 'all'}">Все</button>
        </div>
        <label class="ip-check"><input type="checkbox" data-ip-notes-unread ${view.notesUnread ? 'checked' : ''}> Только непрочитанные · ${unreadN}</label>
      </div>
      <ul class="ip-people-list ip-note-kinds">
        <li class="ip-person ${view.notesKind ? '' : 'on'}"><button class="ip-person-main" data-ip-notes-kind=""><span class="ip-person-name">Все уведомления</span><span class="ip-person-load"><span><b>${base.length}</b></span></span></button></li>
        ${NOTE_KINDS.map((k) => `<li class="ip-person ${view.notesKind === k.key ? 'on' : ''}"><button class="ip-person-main" data-ip-notes-kind="${k.key}" ${count(k.key) ? '' : 'disabled'}>
          <span class="ip-person-name"><i class="ip-note-dot ${k.tone}"></i>${esc(k.label)}</span><span class="ip-person-load"><span><b>${count(k.key)}</b></span></span></button></li>`).join('')}
      </ul>
    </aside>`;
    const card = `<section class="ip-work ip-card" aria-label="Уведомления">
      <header class="ip-card-head">
        <div class="ip-card-title"><h1>Уведомления</h1><p class="ip-card-contacts">${list.length} · непрочитанных ${list.filter((n) => !read.has(n.id)).length}${view.peopleMode === 'mine' ? ' · мои осмотрщики' : ''}</p></div>
        <div class="ip-head-act">${unreadN ? '<button class="btn btn-ghost btn-sm" data-ip-notes-readall>Отметить все прочитанными</button>' : ''}</div>
      </header>
      <div class="ip-card-body">${list.length ? days.map((d) => `<section class="ip-note-day"><h3>${esc(relDay(d))}</h3><ul class="ip-notes">${list.filter((n) => n.date === d).map((n) => {
        const k = noteKind(n.kind);
        return `<li><button class="ip-note ${read.has(n.id) ? '' : 'unread'}" data-ip-note="${esc(n.id)}">
          <i class="ip-note-dot ${k.tone}" aria-hidden="true"></i>
          <span class="ip-note-k">${esc(k.label)}</span>
          <span class="ip-note-who">${esc(n.person || 'объект')}</span>
          <span class="ip-note-t">${esc(n.text)}</span></button></li>`;
      }).join('')}</ul></section>`).join('') : `<p class="ip-hint ip-empty">${view.notesUnread ? 'Непрочитанных уведомлений нет.' : 'Пропусков нет.'}</p>`}</div>
    </section>`;
    return { cls: 'ip-peoplesec ip-notesec', html: aside + card };
  }
  const markRead = (ids) => { view.notesRead = [...new Set([...ids, ...view.notesRead])].slice(0, 2000); };

  // --- адрес вида (разбор UI/UX, 12.10.2026) ---------------------------------
  //
  // Раздел, вкладка, осмотрщик и запрос кадастра — в адресе страницы:
  // «Назад» и «Вперёд» браузера шагают по видам, ссылкой можно поделиться.
  // Переход пользователя — новая запись истории (pushState: hashchange не
  // возникает и экран не перерисовывается второй раз). Практика: Microsoft
  // patterns & practices «Navigation», Sencha «Routing, Deep Linking, and the
  // Back Button» — состояние вида в адресе, адрес — источник правды.
  function urlOf() {
    const q = [['s', view.section]];
    if (view.section === 'people') {
      if (view.person) q.push(['p', view.person], ['t', view.personTab]);
      else q.push(['t', view.allTab]);
    }
    if (view.section === 'assign') q.push(['t', view.tab]);
    if (view.section === 'assign' && view.tab === 'assigned' && view.aPerson) q.push(['ap', view.aPerson]);
    if (view.section === 'cadastre' && view.cadSel) q.push(['c', view.cadSel]);
    return '#/inspections?' + q.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  }
  function syncUrl() {
    const h = urlOf();
    if (location.hash !== h) history.pushState(null, '', h);
  }
  function applyRoute(route) {
    const q = (route && route.query) || {};
    if (!q.s) return false;
    view.section = q.s;
    if (q.s === 'people') {
      view.person = q.p || '';
      if (q.t) { if (view.person) view.personTab = q.t; else view.allTab = q.t; }
    }
    if (q.s === 'assign' && q.t) {
      if (q.t !== view.tab) { view.qs = { ...view.qs, [view.tab]: view.q }; view.q = view.qs[q.t] || ''; }
      view.tab = q.t;
      view.aPerson = q.ap || '';
    }
    if (q.s === 'cadastre' && q.c) view.cadSel = q.c;
    return true;
  }

  // --- «Перейти» (Ctrl+K) -------------------------------------------------------
  //
  // Одно поле на весь раздел: экраны и действия, осмотрщики и их подразделы,
  // запросы кадастра, объекты по ЕНИ и адресу. Пустой запрос — частое
  // первым. Стрелки, Enter, Esc. Практика палитры команд (Chameleon «CMD+K
  // search», Hubtel «Command palette»): видимое поле, Ctrl+K, частое —
  // первым, переходы и действия вместе; здесь — выпадающим списком под полем,
  // без окна поверх страницы (правило «без модальных окон»).
  let jumpHi = 0;
  let jumpList = [];
  function nav(patch, cur = '') {
    if (patch.section && patch.section !== view.section) cadDraft = null;
    if (patch.tab && patch.tab !== view.tab) { view.qs = { ...view.qs, [view.tab]: view.q }; view.q = view.qs[patch.tab] || ''; }
    Object.assign(view, patch);
    detail = [];
    resetList();
    current = cur;
    render();
  }
  function jumpItems(q) {
    const out = [];
    const add = (label, sub, go, kw = '') => out.push({ label, sub, go, kw: `${label} ${sub} ${kw}`.toLowerCase() });
    add('Таблица осмотрщиков', 'Осмотрщики · все', () => nav({ section: 'people', person: '', allTab: 'table' }), 'excel эксель список ответственное');
    add('Отчёты за день', 'Осмотрщики · все', () => nav({ section: 'people', person: '', allTab: 'reports' }), 'вчера утренний вечерний пробег бензин бухгалтерия выгрузка');
    add('Уведомления', 'пропуски отчётов и выездов', () => nav({ section: 'notes' }), 'пропуск');
    add('К назначению', 'Назначения · очередь', () => nav({ section: 'assign', tab: 'queue' }), 'очередь назначить');
    add('Назначено', 'Назначения · действующие', () => nav({ section: 'assign', tab: 'assigned' }), 'переназначить снять');
    add('Кадастр', 'запросы документов', () => nav({ section: 'cadastre' }), 'документы на месте');
    add('Новый запрос в кадастр', 'Кадастр', () => { nav({ section: 'cadastre' }); scope.$('[data-ip-cad-new]').click(); }, 'создать');
    add('Итоги за период', 'Осмотрщики · все', () => nav({ section: 'people', person: '', allTab: 'totals' }), 'отчёт по сотрудникам xlsx');
    add('Сводка осмотрщиков', 'по ответственным и областям', () => nav({ section: 'people', person: '', allTab: 'summary' }));
    add('Нормы осмотра', 'Осмотрщики · все', () => nav({ section: 'people', person: '', allTab: 'norms' }), 'коэффициенты время');
    add('Свои поля осмотрщиков', 'Осмотрщики · все', () => nav({ section: 'people', person: '', allTab: 'fields' }));
    add('Статистика', 'Осмотрщики · все', () => nav({ section: 'people', person: '', allTab: 'stats' }), 'графики');
    add('История', 'события осмотров', () => nav({ section: 'history' }), 'журнал');
    people.forEach((p) => {
      add(p.name, 'осмотрщик · выезды', () => nav({ section: 'people', person: p.name, personTab: 'trips' }), (p.regions || []).join(' '));
      PERSON_TABS.forEach(([k, l]) => { if (k !== 'trips') add(`${p.name} · ${l}`, 'карточка осмотрщика', () => nav({ section: 'people', person: p.name, personTab: k })); });
    });
    allCadRequests().forEach((r) => add(`${cadKindLabel(r.kind)} № ${r.no}`, r.person, () => nav({ section: 'cadastre', cadSel: r.id })));
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let list = words.length ? out.filter((x) => words.every((w) => x.kw.includes(w))) : out.slice(0, 8);
    // Объекты — по ЕНИ и адресу, от двух знаков: к назначению, к действующему
    // назначению или к карточке.
    if (q.trim().length >= 2) {
      const live = allAssignments().filter((a) => a.state === 'assigned' || a.state === 'progress');
      const inQueue = new Set(queueBase(all).map((s) => s.typeId + '|' + s.id));
      [...all.values()].filter((s) => words.every((w) => `${s.eniAll || s.eni} ${s.title} ${s.institution}`.toLowerCase().includes(w))).slice(0, 6).forEach((s) => {
        const k = s.typeId + '|' + s.id;
        const a = live.find((x) => x.typeId + '|' + x.ocId === k);
        list.push({ label: s.title, sub: `${s.eniAll || s.eni || ''} · ${a ? `назначено: ${a.person}` : inQueue.has(k) ? 'к назначению' : s.status}`,
          go: () => (a ? (revealAssigned(a.id), gotoAssign(a.id)) : inQueue.has(k) ? (() => { revealQueued(k); nav({ section: 'assign', tab: 'queue' }, k); })() : (location.hash = build({ typeId: s.typeId, ocId: s.id }))) });
      });
    }
    // Начало названия — выше вхождения в середину.
    if (words.length) list = list.map((x, i) => ({ x, i, w: x.label.toLowerCase().startsWith(words[0]) ? 0 : 1 })).sort((a, b) => a.w - b.w || a.i - b.i).map((y) => y.x);
    return list.slice(0, 12);
  }
  function drawJump() {
    const inp = scope.$('[data-ip-jump]');
    const ul = scope.$('.ip-jump-list');
    if (!inp || !ul) return;
    jumpList = jumpItems(inp.value);
    jumpHi = Math.max(0, Math.min(jumpHi, jumpList.length - 1));
    ul.innerHTML = jumpList.map((x, i) => `<li role="option" id="ip-j-${i}" data-ip-jump-i="${i}" class="${i === jumpHi ? 'hi' : ''}" aria-selected="${i === jumpHi}"><b>${esc(x.label)}</b><span>${esc(x.sub)}</span></li>`).join('')
      || '<li class="ip-jump-none">Ничего не нашлось</li>';
    ul.hidden = false;
    inp.setAttribute('aria-activedescendant', jumpList.length ? `ip-j-${jumpHi}` : '');
    scope.$('.ip-jump').setAttribute('aria-expanded', 'true');
  }
  function closeJump() {
    const ul = scope.$('.ip-jump-list');
    if (ul) ul.hidden = true;
    const j = scope.$('.ip-jump');
    if (j) j.setAttribute('aria-expanded', 'false');
  }
  function doJump(i) {
    const x = jumpList[i];
    if (!x) return;
    closeJump();
    x.go();
  }

  // --- память вида (матрица путей 13.10.2026; правило APCS «не терять путь
  // пользователя») ---------------------------------------------------------
  //
  // Уходя с вида, запоминаем по его адресу прокрутку списков, выбранную
  // строку и начатую правку профиля или авто; возвращаясь — «Назад»,
  // вкладкой, «Перейти» — возвращаем. Начатая правка не пропадает молча:
  // поля на месте и видна строка «Несохранённые изменения».
  // ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: черновик живёт в памяти вкладки; развилка —
  // так и оставить (закрыл вкладку — черновика нет) или хранить его на
  // сервере как незавершённую правку, видимую с другого рабочего места.
  const SCROLLERS = ['.ip-scroll', '.ip-people-list', '.ip-pscroll'];
  const memo = new Map();
  let shownKey = '';
  const DRAFT_SCOPE = '[data-ip-profile] input, [data-ip-profile] select, [data-ip-profile] textarea';
  const ctlKey = (el) => [...el.attributes].filter((a) => a.name.startsWith('data-ip')).map((a) => `${a.name}=${a.value}`).join(' ')
    + (el.type === 'radio' || el.type === 'checkbox' ? ` @${el.value}` : '');
  function draftOf() {
    const bar = scope.$('[data-ip-c-bar]');
    if (!bar || bar.hidden) return null;
    return scope.$$(DRAFT_SCOPE).filter((el) => !el.closest('[data-ip-ab-form]'))
      .map((el) => [ctlKey(el), el.type === 'radio' || el.type === 'checkbox' ? el.checked : el.value]);
  }
  function applyDraft(d) {
    const was = new Map(d);
    scope.$$(DRAFT_SCOPE).forEach((el) => {
      const k = ctlKey(el);
      if (!was.has(k)) return;
      if (el.type === 'radio' || el.type === 'checkbox') el.checked = was.get(k); else el.value = was.get(k);
    });
    const bar = scope.$('[data-ip-c-bar]');
    if (bar) bar.hidden = false;
    const fired = scope.$('[data-ip-c-radio="fired"]:checked');
    const wrap = scope.$('[data-ip-cwrap="firedDate"]');
    if (fired && wrap) wrap.hidden = fired.value !== '1';
  }
  // Сохранили или отменили — черновик снят, строка спрятана.
  const dropDraft = () => {
    const m = memo.get(urlOf());
    if (m) m.draft = null;
    const bar = scope.$('[data-ip-c-bar]');
    if (bar) bar.hidden = true;
  };

  function render() {
    const vkey = urlOf();
    if (shownKey) {
      memo.set(shownKey, { scroll: SCROLLERS.map((x) => (scope.$(x) ? scope.$(x).scrollTop : 0)), current, draft: draftOf() });
    }
    const back = vkey !== shownKey ? memo.get(vkey) : null;
    if (back && !current && back.current) current = back.current;
    if (grid) { gridState = grid.state(); grid.destroy(); grid = null; }
    hidePop();
    destroyStats();
    all = summaries();
    people = inspectorRows(all);
    if (view.person && !people.some((p) => p.name === view.person)) view.person = '';
    host.setCrumbs([{ label: 'Осмотры' }]);
    notes = notifications(all, people);
    const unread = notes.filter((n) => !readSet().has(n.id)).length;
    const sec = view.section === 'people' ? peopleSection() : view.section === 'history' ? historySection() : view.section === 'cadastre' ? cadSection() : view.section === 'notes' ? notesSection() : assignSection();
    const top = (k, label) => `<button class="itab ${view.section === k ? 'on' : ''}" role="tab" data-ip-section="${k}" aria-selected="${view.section === k}">${label}</button>`;
    // Сцена (перестройка по APCS, решение пользователя 13.10.2026 — запись
    // графа perestroyka-osmotrov-po-apcs-…): карта на всю рабочую область
    // раздела — справа от левого меню и под шапкой системы, они остаются
    // («Сайдбар не убираем. Вписываем его в дизайн»). Островки — только
    // режимы «Осмотров», уведомления и «Перейти» (Ctrl K). Режимы с картой
    // (назначения) — панелями над ней; остальные — поверхностью над сценой.
    const onScene = view.section === 'assign';
    // Маршрут осмотрщика — тоже на сцене: список осмотрщиков и карточка с
    // остановками — панелями, карта маршрута — на всё остальное место.
    const onRoute = view.section === 'people' && !!view.person && view.personTab === 'route';
    scope.setHTML(`<div class="ip-page ip-scened ${onScene ? 'on-scene' : 'on-sheet'} ${onRoute ? 'on-route' : ''} ${hideList ? 'hide-list' : ''} ${hidePane ? 'hide-pane' : ''}">
      <div class="ip-isles">
        <nav class="ip-isl ip-sections" role="tablist" aria-label="Режимы осмотров">
          ${top('assign', 'Назначения')}${top('people', 'Осмотрщики')}${top('cadastre', 'Кадастр')}${top('history', 'История')}
        </nav>
        <div class="ip-isl ip-jump" role="combobox" aria-expanded="false" aria-haspopup="listbox" aria-owns="ip-jump-list">
          <span class="isearch">${SEARCH_ICON}<input data-ip-jump placeholder="Перейти: осмотрщик, ЕНИ, адрес…" aria-label="Перейти" autocomplete="off" aria-controls="ip-jump-list"></span>
          <kbd class="ip-kbd" aria-hidden="true">Ctrl K</kbd>
          <ul class="ip-jump-list" id="ip-jump-list" role="listbox" hidden></ul>
        </div>
        <button class="ip-isl ip-bell ${view.section === 'notes' ? 'on' : ''}" role="tab" data-ip-section="notes" aria-selected="${view.section === 'notes'}" title="Уведомления" aria-label="Уведомления${unread ? `: непрочитанных ${unread}` : ''}">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5a5 5 0 0 0-5 5v3.2L3.6 13a.8.8 0 0 0 .7 1.2h11.4a.8.8 0 0 0 .7-1.2L15 10.7V7.5a5 5 0 0 0-5-5Zm-1.9 13a2 2 0 0 0 3.8 0Z"/></svg>${unread ? `<b class="ip-unread">${unread}</b>` : ''}</button>
      </div>
      <div class="ip ${sec.cls}">${sec.html}</div>
      ${onScene ? `<p class="ip-isl ip-scene-note" data-ip-scene-note role="status" hidden></p>
        <button class="ip-edge ip-edge-l" data-ip-hide="list" aria-expanded="${!hideList}" title="${hideList ? 'Показать список' : 'Скрыть список'}" aria-label="${hideList ? 'Показать список' : 'Скрыть список'}">${hideList ? '›' : '‹'}</button>
        <button class="ip-edge ip-edge-r" data-ip-hide="pane" aria-expanded="${!hidePane}" title="${hidePane ? 'Показать назначение' : 'Скрыть назначение'}" aria-label="${hidePane ? 'Показать назначение' : 'Скрыть назначение'}">${hidePane ? '‹' : '›'}</button>` : ''}
    </div>`);
    placeJump();
    liftSubTabs();
    syncUrl();
    const was = memo.get(vkey);
    if (was && was.draft) applyDraft(was.draft);
    if (back) SCROLLERS.forEach((x, i) => { if (scope.$(x) && back.scroll[i]) scope.$(x).scrollTop = back.scroll[i]; });
    shownKey = urlOf();
    if (routeMap) { routeMap.remove(); routeMap = null; }
    drawScene(onScene).catch((e) => console.warn('Сцена не нарисована', e));
    if (view.section === 'people' && !view.person && view.allTab === 'table' && !imp) mountTable();
    if (view.section === 'people' && view.person && view.personTab === 'route') {
      mountRouteMap().catch((e) => console.warn('Карта не нарисована', e));
    }
    if (view.section === 'people') {
      mountStats(scope, host.ensureStyle, { names: visiblePeople().filter((p) => !p.fired).map((p) => p.name), person: view.person, period: statPeriod() })
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
    const keep = ['.ip-scroll', '.ip-people-list', '.ip-card-body', '.ip-pscroll', '.ip-pane .ip-pane-body'].map((s) => [s, scope.$(s) ? scope.$(s).scrollTop : 0]);
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
  // Поиск не сбрасывается переходом: он свой у каждой вкладки «Назначений»
  // (view.qs) и возвращается вместе с ней.
  const resetList = () => { view.shown = STEP; checked.clear(); current = ''; confirmRemove = false; };
  // Объект из уведомления скрыт отборами — отборы снимаются, и об этом
  // сказано, а не молча.
  const revealQueued = (k) => {
    const base = queueBase(all);
    if (applyFilter(base, QUEUE_FACETS, QUEUE_RANGES, view.qf, view.qs.queue || '').some((x) => x.typeId + '|' + x.id === k)) return;
    view.qf = { facets: {}, ranges: {} }; view.qs = { ...view.qs, queue: '' }; if (view.tab === 'queue') view.q = '';
    host.toast('Отборы «К назначению» сняты — объект был скрыт ими', 'warn');
  };
  const revealAssigned = (id) => {
    const own = allAssignments().find((x) => x.id === id);
    if (own) view.aPerson = own.person;
    const live = assignedRows(all, { q: '' });
    if (applyFilter(live, ASSIGNED_FACETS, ASSIGNED_RANGES, view.af, view.qs.assigned || '').some((r) => r.a.id === id)) return;
    view.af = { facets: {}, ranges: {} }; view.qs = { ...view.qs, assigned: '' };
    host.toast('Отборы «Назначено» сняты — назначение было скрыто ими', 'warn');
  };

  // --- разделы и вкладки ---
  scope.on('click', '[data-ip-section]', (e, b) => { view.section = b.dataset.ipSection; detail = []; resetList(); render(); });
  scope.on('click', '[data-ip-tab]', (e, b) => {
    view.qs = { ...view.qs, [view.tab]: view.q };
    view.tab = b.dataset.ipTab; view.q = view.qs[view.tab] || ''; reassignGroup = ''; setNaming = false; resetList(); render();
  });

  // --- осмотрщики ---
  scope.on('click', '[data-ip-person]', (e, el) => { view.person = el.dataset.ipPerson; detail = []; redraw(); });
  scope.on('click', '[data-ip-mode]', (e, b) => { view.peopleMode = b.dataset.ipMode; redraw(); });
  scope.on('input', '[data-ip-people-q]', (e, el) => { peopleQ = el.value; keepFocus('[data-ip-people-q]'); });
  scope.on('change', '[data-ip-region]', (e, el) => { view.region = el.value; redraw(); });
  scope.on('change', '[data-ip-psort]', (e, el) => { view.peopleSort = el.value; redraw(); });
  // Работа вне выездов — в панели дня (раздел 4 ТЗ рабочего дня): поля
  // показываются по виду; запись — на период «с — по».
  scope.on('change', '[data-ip-act="kind"]', (e, el) => {
    scope.$$('[data-ip-act-for]').forEach((x) => { x.hidden = !x.dataset.ipActFor.split(' ').includes(el.value); });
  });
  scope.on('click', '[data-ip-act-add]', () => {
    const v = (k) => { const el = scope.$(`[data-ip-act="${k}"]`); return el && !el.closest('[hidden]') ? el.value.trim() : ''; };
    const err = scope.$('[data-ip-act-err]');
    const sel = detail[detail.length - 1];
    const person = view.person || (sel && sel.person) || '';
    if (!person) return;
    if (!v('from')) { err.textContent = 'Укажите дату начала'; scope.$('[data-ip-act="from"]').focus(); return; }
    if (v('to') && v('to') < v('from')) { err.textContent = 'Окончание раньше начала'; scope.$('[data-ip-act="to"]').focus(); return; }
    if (v('kind') === 'trip' && !v('region')) { err.textContent = 'Укажите область командировки'; scope.$('[data-ip-act="region"]').focus(); return; }
    if (v('kind') === 'partner' && !v('project')) { err.textContent = 'Укажите проект'; scope.$('[data-ip-act="project"]').focus(); return; }
    if (v('kind').startsWith('ab:')) {
      addAbsence(person, { kind: v('kind').slice(3), from: v('from'), to: v('to'), note: v('note') });
      redraw();
      host.toast('Отсутствие записано', 'ok');
      return;
    }
    const rec = { person, kind: v('kind'), from: v('from'), to: v('to') };
    ['region', 'address', 'project', 'object', 'time', 'note'].forEach((k) => { if (v(k)) rec[k] = v(k); });
    addActivity(rec);
    redraw();
    host.toast('Записано', 'ok');
  });
  scope.on('click', '[data-ip-act-del]', (e, b) => { removeActivity(b.dataset.ipActDel); redraw(); });
  // Кадастр: выбор запроса, новый запрос, строки, создание, отчёт.
  scope.on('click', '[data-ip-cad]', (e, b) => { view.cadSel = b.dataset.ipCad; cadDraft = null; redraw(); });
  scope.on('click', '[data-ip-cad-new]', () => { cadDraft = { kind: 'cadastre', person: '', due: '', note: '', q: '', rows: [] }; redraw(); scope.$('[data-ip-cad-q]').focus(); });
  scope.on('click', '[data-ip-cad-cancel]', () => { cadDraft = null; redraw(); });
  scope.on('change', '[data-ip-cadf]', (e, el) => {
    cadDraft[el.dataset.ipCadf] = el.value;
    if (el.dataset.ipCadf === 'kind' && el.value === 'cadastre' && cadDraft.person && !profileOf(cadDraft.person).cadastre) cadDraft.person = '';
    if (el.dataset.ipCadf === 'kind') redraw();
  });
  scope.on('input', '[data-ip-cadf="note"]', (e, el) => { cadDraft.note = el.value; });
  scope.on('input', '[data-ip-cad-q]', (e, el) => { cadDraft.q = el.value; redraw(); keepFocus('[data-ip-cad-q]'); });
  scope.on('click', '[data-ip-cad-add]', (e, b) => {
    const s = all.get(b.dataset.ipCadAdd);
    if (s) cadDraft.rows.push({ typeId: s.typeId, ocId: s.id, inst: s.institution || '', eni: s.eni || '', title: s.title || '', doc: CAD_DOCS[0], note: '' });
    cadDraft.q = '';
    redraw();
    scope.$('[data-ip-cad-q]').focus();
  });
  scope.on('input', '[data-ip-cad-row]', (e, el) => { cadDraft.rows[+el.dataset.ipCadRow][el.dataset.k] = el.value; });
  scope.on('click', '[data-ip-cad-del]', (e, b) => { cadDraft.rows.splice(+b.dataset.ipCadDel, 1); redraw(); });
  scope.on('click', '[data-ip-cad-create]', () => {
    const err = scope.$('[data-ip-cad-err]');
    const d = cadDraft;
    if (!d.rows.length) { err.textContent = 'Добавьте хотя бы один объект'; scope.$('[data-ip-cad-q]').focus(); return; }
    if (!d.person) { err.textContent = 'Выберите осмотрщика'; scope.$('[data-ip-cadf="person"]').focus(); return; }
    const empty = d.rows.findIndex((x) => !x.doc.trim());
    if (empty >= 0) { err.textContent = 'Укажите документ в каждой строке'; scope.$(`[data-ip-cad-row="${empty}"][data-k="doc"]`).focus(); return; }
    const r = createCadRequest({ person: d.person, kind: d.kind, due: d.due, note: d.note.trim(), rows: d.rows.map((x) => ({ ...x, doc: x.doc.trim(), note: x.note.trim() })) });
    cadDraft = null;
    view.cadSel = r.id;
    redraw();
    host.toast(`Запрос № ${r.no} создан`, 'ok');
  });
  // Отчёт по запросу (5.3): сколько получено, сколько нет, по каждой строке — причина.
  scope.on('click', '[data-ip-cad-xlsx]', async (e, b) => {
    const r = cadRequest(b.dataset.ipCadXlsx);
    if (!r) return;
    const rows = r.rows.map((x) => [codeByName(x.inst), x.inst, x.eni, (all.get(x.typeId + '|' + x.ocId) || {}).title || '', x.doc, x.note,
      cadResultLabel(x.result), x.file ? x.file.name || cadFileName(x, codeByName(x.inst)) : '', x.scanDate ? fmtDate(x.scanDate) : '', x.answer || '', x.answeredBy || '', x.answeredAt ? fmtDate(x.answeredAt) : '']);
    await downloadXlsx(`zapros-${r.no}_${r.kind}.xlsx`, [{ name: `Запрос № ${r.no}`, rows,
      head: ['№ учр.', 'Учреждение', 'ЕНИ', 'Объект', 'Документ', 'Комментарий менеджера', 'Итог', 'Файл', 'Дата сканирования', 'Ответ', 'Ответил', 'Когда'],
      widths: [9, 34, 22, 40, 26, 24, 14, 40, 12, 30, 28, 11] }]);
    host.toast('Отчёт по запросу выгружен', 'ok');
  });
  // План месяца: сохранение при уходе из ячейки; Enter — ячейка ниже.
  scope.on('change', '[data-ip-plan]', (e, el) => {
    if (!view.person) return;
    setPlan(view.person, el.dataset.ipPlan, { [el.dataset.k]: el.value.trim() });
    const s = scope.$('[data-ip-plan-saved]');
    if (s) s.textContent = `Сохранено: ${fmtDate(el.dataset.ipPlan)}`;
  });
  scope.on('keydown', '[data-ip-plan]', (e, el) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    el.dispatchEvent(new Event('change', { bubbles: true }));
    const next = scope.$(`[data-ip-plan][data-k="${el.dataset.k}"][data-r="${+el.dataset.r + (e.shiftKey ? -1 : 1)}"]`);
    if (next) next.focus();
  });
  // Маршрут дня: день, дом на карте, убрать/вернуть предложенное, назначить.
  scope.on('click', '[data-ip-route-day]', (e, b) => { route.day = shiftD(route.day, +b.dataset.ipRouteDay); route.skip = new Set(); redraw(); });
  scope.on('change', '[data-ip-route-set]', (e, el) => { if (el.value) { route.day = el.value; route.skip = new Set(); redraw(); } });
  scope.on('click', '[data-ip-route-home]', () => { route.homeMode = !route.homeMode; redraw(); });
  scope.on('click', '[data-ip-route-skip]', (e, b) => { route.skip.add(b.dataset.ipRouteSkip); redraw(); });
  scope.on('click', '[data-ip-route-unskip]', () => { route.skip = new Set(); redraw(); });
  scope.on('click', '[data-ip-route-assign]', () => {
    const r = dayRoute(all, view.person, route.day, route.skip);
    let n = 0;
    r.proposed.forEach((k) => {
      const x = r.stops.find((s) => s.key === k);
      if (!x) return;
      const free = x.cov && x.cov.by ? (() => {
        const t = all.get(k);
        const ids = (objectContentsIds(t.typeId, t.id)).filter((id) => !x.cov.by.has(id));
        return ids.length === x.cov.total ? [] : ids;
      })() : [];
      if (assign({ typeId: x.s.typeId, ocId: x.s.id, person: view.person, oiIds: free, plannedAt: route.day })) n++;
    });
    redraw();
    host.toast(`Назначено объектов: ${n} на ${fmtDate(route.day)}`, 'ok');
  });
  // Нормы: правка — при уходе из ячейки; «взять» — значение по факту.
  scope.on('change', '[data-ip-norm]', (e, el) => {
    const v = parseFloat(el.value.replace(',', '.'));
    if (!Number.isFinite(v) || v < 0) { host.toast('Нужно число не меньше нуля', 'warn'); redraw(); return; }
    setNorm(el.dataset.ipNorm, { [el.dataset.k]: v });
    redraw();
  });
  scope.on('click', '[data-ip-norm-take]', (e, b) => { setNorm(b.dataset.ipNormTake, { perM2: Math.round(+b.dataset.v * 1000) / 1000 }); redraw(); });
  // Уведомления: отборы, прочитано, переход к причине.
  scope.on('click', '[data-ip-notes-kind]', (e, b) => { view.notesKind = b.dataset.ipNotesKind; redraw(); });
  scope.on('change', '[data-ip-notes-unread]', (e, el) => { view.notesUnread = el.checked; redraw(); });
  scope.on('click', '[data-ip-notes-readall]', () => { markRead(notes.map((n) => n.id)); redraw(); });
  scope.on('click', '[data-ip-note]', (e, b) => {
    const n = notes.find((x) => x.id === b.dataset.ipNote);
    if (!n) return;
    markRead([n.id]);
    detail = [];
    if (n.go.report) {
      Object.assign(view, { section: 'people', person: n.person, personTab: 'reports' });
      rep.ym = n.go.report.slice(0, 7);
      detail = [{ kind: 'report', name: n.person, date: n.go.report }];
      render();
    } else if (n.go.assign) {
      revealAssigned(n.go.assign);
      gotoAssign(n.go.assign);
    } else if (n.go.queue) {
      Object.assign(view, { section: 'assign', tab: 'queue' });
      resetList();
      revealQueued(n.go.queue);
      current = n.go.queue;
      render();
    } else if (n.go.profile) {
      Object.assign(view, { section: 'people', person: n.person, personTab: 'profile' });
      render();
    }
  });
  // Статистика: период, переход к осмотрщику, выгрузка xlsx — по всем или
  // по выбранному (задача графа ekran-statistiki-osmotrov-pokazateli-i-vygruzka-xlsx).
  scope.on('click', '[data-ip-sunit]', (e, b) => { statSel.unit = b.dataset.ipSunit; statSel.offset = 0; redraw(); });
  scope.on('click', '[data-ip-sstep]', (e, b) => { statSel.offset = Math.max(0, statSel.offset + Number(b.dataset.ipSstep)); redraw(); });
  const openStat = (name) => { Object.assign(view, { person: name, personTab: 'stats' }); detail = []; render(); };
  scope.on('click', '[data-ip-stat-open]', (e, el) => openStat(el.dataset.ipStatOpen));
  scope.on('keydown', '[data-ip-stat-open]', (e, el) => { if (e.key === 'Enter') openStat(el.dataset.ipStatOpen); });
  scope.on('click', '[data-ip-sxlsx]', async () => {
    const period = statPeriod();
    const people = visiblePeople();
    const sheets = view.person ? personSheets(all, people, view.person, period) : allSheets(all, people, period);
    await downloadXlsx(exportName(view.person, period), sheets);
  });

  // Итоги за период: период, переход к отчётам осмотрщика, выгрузка.
  scope.on('change', '[data-ip-sum]', (e, el) => { if (el.value) { sumPeriod[el.dataset.ipSum] = el.value; redraw(); } });
  scope.on('click', '[data-ip-sum-open]', (e, el) => {
    Object.assign(view, { person: el.dataset.ipSumOpen, personTab: 'reports' });
    rep.ym = sumPeriod.to.slice(0, 7);
    detail = [];
    render();
  });
  scope.on('click', '[data-ip-sum-xlsx]', async () => {
    if (sumPeriod.to < sumPeriod.from) { host.toast('Начало периода позже окончания', 'warn'); return; }
    const rows = employeeSummary(all, visiblePeople().filter((p) => !p.fired).map((p) => p.name), sumPeriod.from, sumPeriod.to);
    const ddmm = (iso) => iso.split('-').reverse().join('.');
    await downloadXlsx(`itogi-osmotrschikov_${sumPeriod.from}_${sumPeriod.to}.xlsx`, [
      { name: 'Итоги', rows: rows.map((r) => [r.name, r.tripDays, r.objects, r.oi, r.photos, r.km, r.litres, r.onTime, r.late, r.missedReports, r.missedTrips, r.cad.got, r.cad.none, r.cad.refused]),
        head: ['Осмотрщик', 'Дней с выездами', 'Объектов осмотрено', 'ОИ осмотрено', 'Снимков', 'Пробег, км', 'Литры', 'Отчётов вовремя', 'Отчётов поздно', 'Отчётов пропущено', 'Выездов пропущено', 'Кадастр: получено', 'Кадастр: нет', 'Кадастр: отказ'],
        widths: [34, 10, 10, 10, 10, 10, 9, 10, 10, 10, 10, 10, 10, 10] },
      { name: 'По дням', rows: rows.flatMap((r) => r.days.slice().reverse().map(({ date, d, planned, inspected }) => [r.name, ddmm(date), d.work ? 'рабочий' : d.reason, planned, inspected ?? '',
        d.morning ? reportTime(d.morning.at) : d.missingMorning ? 'не сдан' : '', d.late ? 'да' : '', d.evening ? reportTime(d.evening.at) : d.missingEvening ? 'не сдан' : '', d.km ?? '', d.litres ?? ''])),
        head: ['Осмотрщик', 'Дата', 'День', 'Выездов в плане', 'Осмотрено по отчёту', 'Утренний', 'Поздний выезд', 'Вечерний', 'Пробег, км', 'Литры'],
        widths: [34, 11, 18, 10, 10, 10, 8, 10, 10, 9] },
    ]);
    host.toast('Итоги выгружены', 'ok');
  });
  // Табличный вид: на весь экран, выгрузка, загрузка со сверкой.
  scope.on('click', '[data-ip-grid-full]', () => {
    gridFull = !gridFull;
    const w = scope.$('[data-ip-gridwrap]');
    if (w) w.classList.toggle('full', gridFull);
    const b = scope.$('[data-ip-grid-full]');
    b.textContent = gridFull ? 'Свернуть (Esc)' : 'На весь экран';
    b.setAttribute('aria-pressed', String(gridFull));
    if (grid) grid.focus();
  });
  scope.on('click', '[data-ip-grid-xlsx]', async () => {
    const cols = gridCols();
    const rows = gridRows(cols).map((r) => cols.map((c) => (c.type === 'bool' ? (r.cells[c.key] ? 'да' : 'нет') : cellText(c, r.cells[c.key]))));
    await downloadXlsx(`osmotrschiki_${todayD}.xlsx`, [{ name: 'Осмотрщики', head: cols.map((c) => c.label), rows, widths: cols.map((c) => Math.round((c.width || 140) / 7)) }]);
    host.toast('Таблица выгружена', 'ok');
  });
  scope.on('click', '[data-ip-grid-import]', async () => {
    const file = await pickFile('.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    if (!file) return;
    try {
      const sheets = await readXlsx(file);
      const d = diffImport(sheets[0] ? sheets[0].rows : []);
      if (d.error) { host.toast(d.error, 'warn'); return; }
      imp = { file: file.name, ...d };
      redraw();
    } catch (e) {
      host.toast('Файл не читается как xlsx', 'warn');
    }
  });
  scope.on('change', '[data-ip-imp]', (e, el) => { imp.items[+el.dataset.ipImp].on = el.checked; redraw(); });
  scope.on('change', '[data-ip-imp-all]', (e, el) => { imp.items.forEach((x) => { x.on = el.checked; }); redraw(); });
  scope.on('click', '[data-ip-imp-cancel]', () => { imp = null; redraw(); });
  scope.on('click', '[data-ip-imp-apply]', () => {
    const cols = gridCols();
    const ch = imp.items.filter((x) => x.on).map((x) => ({ id: x.name, key: x.key, value: x.value }));
    const errs = saveCells(cols, ch);
    imp = null;
    redraw();
    host.toast(errs.length ? `Применено с ошибками: ${errs[0]}` : `Применено изменений: ${ch.length}`, errs.length ? 'warn' : 'ok');
  });
  scope.on('click', '[data-ip-qreset]', () => { view.q = ''; view.qs = { ...view.qs, [view.tab]: '' }; setFilter({ facets: {}, ranges: {} }); resetList(); render(); });
  // «Перейти»: ввод — список, стрелки, Enter, Esc; Ctrl+K — к полю.
  scope.on('focusin', '[data-ip-jump]', () => { jumpHi = 0; drawJump(); });
  scope.on('input', '[data-ip-jump]', () => { jumpHi = 0; drawJump(); });
  scope.on('keydown', '[data-ip-jump]', (e, el) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); jumpHi += e.key === 'ArrowDown' ? 1 : -1; drawJump(); scope.$('.ip-jump-list .hi')?.scrollIntoView({ block: 'nearest' }); } else if (e.key === 'Enter') { e.preventDefault(); doJump(jumpHi); } else if (e.key === 'Escape') { e.preventDefault(); el.value = ''; closeJump(); el.blur(); }
  });
  scope.on('focusout', '[data-ip-jump]', () => setTimeout(() => { if (!scope.root.contains(document.activeElement) || !document.activeElement.matches('[data-ip-jump]')) closeJump(); }, 150));
  scope.on('mousedown', '[data-ip-jump-i]', (e, li) => { e.preventDefault(); doJump(+li.dataset.ipJumpI); });
  scope.onDocument('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'л' || e.code === 'KeyK')) {
      const inp = scope.$('[data-ip-jump]');
      if (inp) { e.preventDefault(); inp.focus(); inp.select(); }
    }
  });
  scope.on('click', '[data-ip-rday]', (e, b) => { rep.day = shiftD(rep.day, +b.dataset.ipRday); if (rep.day > todayD) rep.day = todayD; detail = []; redraw(); });
  scope.on('change', '[data-ip-rday-set]', (e, el) => { if (el.value) { rep.day = el.value > todayD ? todayD : el.value; detail = []; redraw(); } });
  scope.on('click', '[data-ip-rmonth]', (e, b) => {
    const [y, m] = rep.ym.split('-').map(Number);
    const d = new Date(y, m - 1 + +b.dataset.ipRmonth, 1);
    rep.ym = isoD(d).slice(0, 7);
    detail = [];
    redraw();
  });
  scope.on('change', '[data-ip-rexp]', (e, el) => { rep[el.dataset.ipRexp] = el.value; });
  const exportAccounting = async (names, from, to) => {
    if (!from || !to || to < from) { host.toast('Укажите период: начало не позже окончания', 'warn'); return; }
    await downloadXlsx(`probeg-i-benzin_${from}_${to}.xlsx`, accountingSheets(names, from, to));
    host.toast('Отчёт для бухгалтерии выгружен', 'ok');
  };
  scope.on('click', '[data-ip-rexp-go]', () => exportAccounting(visiblePeople().filter((p) => !p.fired).map((p) => p.name), rep.from, rep.to));
  scope.on('click', '[data-ip-rexp-person]', (e, b) => {
    const [y, m] = rep.ym.split('-').map(Number);
    exportAccounting([b.dataset.ipRexpPerson], `${rep.ym}-01`, isoD(new Date(y, m, 0)));
  });
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
    // Обязательные свои поля (ТЗ 1.2) — без значения профиль не сохраняется.
    const miss = allCustomFields().find((f) => f.required && !String(custom[f.id] ?? '').trim());
    if (miss) {
      host.toast(`Заполните поле «${miss.label}»`, 'warn');
      const el = scope.$(`[data-ip-cf="${miss.id}"]`);
      if (el) el.focus();
      return;
    }
    saveProfile(view.person, patch);
    dropDraft();
    redraw();
    host.toast('Профиль сохранён', 'ok');
  });
  scope.on('click', '[data-ip-car-save]', () => {
    const car = {};
    scope.$$('[data-ip-car]').forEach((el) => { car[el.dataset.ipCar] = el.value.trim(); });
    scope.$$('[data-ip-car-radio]:checked').forEach((el) => { car[el.dataset.ipCarRadio] = el.value; });
    saveProfile(view.person, { car });
    dropDraft();
    redraw();
    host.toast('Авто сохранено', 'ok');
  });
  scope.on('click', '[data-ip-cf-add]', () => {
    const v = (k) => { const el = scope.$(`[data-ip-cfn="${k}"]`); return el ? el.value.trim() : ''; };
    if (!v('label')) { scope.$('[data-ip-cf-err]').textContent = 'Укажите название'; scope.$('[data-ip-cfn="label"]').focus(); return; }
    if (v('kind') === 'list' && !v('options')) { scope.$('[data-ip-cf-err]').textContent = 'Укажите варианты через запятую'; return; }
    addCustomField({ label: v('label'), kind: v('kind'), options: v('options').split(',').map((x) => x.trim()), required: !!(scope.$('[data-ip-cfn-req]') || {}).checked });
    cfAdding = false;
    redraw();
    host.toast('Поле добавлено', 'ok');
  });
  scope.on('click', '[data-ip-cf-del]', (e, b) => { removeCustomField(b.dataset.ipCfDel); redraw(); });
  scope.on('click', '[data-ip-cf-cancel]', () => { cfAdding = false; redraw(); });
  scope.on('click', '[data-ip-cf-open]', () => { cfAdding = true; redraw(); const f = scope.$('.ip-cfadd [data-ip-cfn="label"]'); if (f) f.focus(); });
  // «Варианты» — только у поля «выбор из списка».
  scope.on('change', '[data-ip-cfn="kind"]', (e, el) => { const box = scope.$('[data-ip-cf-optsbox]'); if (box) box.hidden = el.value !== 'list'; });
  scope.on('keydown', '.ip-cfadd [data-ip-cfn]', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); const b = scope.$('.ip-cfadd [data-ip-cf-add]'); if (b) b.click(); }
    if (e.key === 'Escape') { cfAdding = false; redraw(); }
  });
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
  scope.on('click', '[data-ip-c-cancel]', () => { dropDraft(); redraw(); });
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
    const sel = kind === 'day' ? { kind, day: id } : kind === 'person' ? { kind, name: id }
      : kind === 'report' ? { kind, name: id.split('|')[0], date: id.split('|')[1] } : { kind, id };
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
  scope.on('input', '[data-ip-q]', (e, el) => { view.q = el.value; view.qs = { ...view.qs, [view.tab]: el.value }; view.shown = STEP; keepFocus('[data-ip-q]'); });
  scope.on('click', '[data-ip-q-clear]', () => { view.q = ''; view.qs = { ...view.qs, [view.tab]: '' }; render(); });
  // Гибкие отборы: значение фасета — отметка (повторный щелчок снимает),
  // диапазон — по изменению поля, «чип» — снять один, «Сбросить все».
  const refilter = (f) => { setFilter(f); view.shown = STEP; checked.clear(); redraw(); };
  const fclone = () => JSON.parse(JSON.stringify(curFilter()));
  scope.on('click', '[data-ip-ff]', (e, b) => {
    const f = fclone();
    const k = b.dataset.ipFf;
    const v = b.dataset.ipFv;
    const list = f.facets[k] || [];
    f.facets[k] = list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
    refilter(f);
  });
  scope.on('click', '[data-ip-fclear]', (e, b) => { const f = fclone(); delete f.facets[b.dataset.ipFclear]; refilter(f); });
  scope.on('click', '[data-ip-frclear]', (e, b) => { const f = fclone(); delete f.ranges[b.dataset.ipFrclear]; refilter(f); });
  scope.on('click', '[data-ip-fmore]', (e, b) => { const k = b.dataset.ipFmore; if (facetMore.has(k)) facetMore.delete(k); else facetMore.add(k); redraw(); });
  // Поле диапазона шлёт change и при уходе фокуса — в том числе когда
  // перерисовка сама убирает поле; перерисовка внутри перерисовки роняла
  // разметку («node to be removed is no longer a child», матрица 13.10.2026).
  // Поэтому — на следующем такте и только если отбор правда изменился.
  scope.on('change', '[data-ip-fr]', (e, el) => {
    const f = fclone();
    const k = el.dataset.ipFr;
    const r = f.ranges[k] ? [...f.ranges[k]] : ['', ''];
    const i = +el.dataset.ipFrI;
    if ((r[i] || '') === el.value) return;
    r[i] = el.value;
    f.ranges[k] = r;
    setTimeout(() => refilter(f), 0);
  });
  scope.on('click', '[data-ip-chip-x]', (e, b) => {
    const [kind, k, v] = b.dataset.ipChipX.split('|');
    const f = fclone();
    if (kind === 'range') delete f.ranges[k];
    else f.facets[k] = (f.facets[k] || []).filter((x) => x !== v);
    refilter(f);
  });
  scope.on('click', '[data-ip-freset]', () => refilter({ facets: {}, ranges: {} }));
  scope.on('click', '[data-ip-ftoggle]', () => { facetsOpen = !facetsOpen; redraw(); });
  scope.on('click', '[data-ip-hide]', (e, b) => { if (b.dataset.ipHide === 'list') hideList = !hideList; else hidePane = !hidePane; redraw(); });
  // Наборы отборов: применить, обновить, сохранить как новый, удалить.
  scope.on('click', '[data-ip-set]', (e, b) => {
    const x = (view.sets[view.tab] || []).find((y) => y.id === b.dataset.ipSet);
    if (!x) return;
    view.setCur = { ...view.setCur, [view.tab]: x.id };
    refilter(JSON.parse(JSON.stringify(x.f)));
  });
  scope.on('click', '[data-ip-set-update]', () => {
    const id = view.setCur[view.tab];
    view.sets = { ...view.sets, [view.tab]: (view.sets[view.tab] || []).map((x) => (x.id === id ? { ...x, f: fclone() } : x)) };
    redraw();
    host.toast('Набор обновлён', 'ok');
  });
  scope.on('click', '[data-ip-set-new]', () => { setNaming = true; redraw(); const el = scope.$('[data-ip-set-name]'); if (el) el.focus(); });
  const saveSet = () => {
    const el = scope.$('[data-ip-set-name]');
    const name = el ? el.value.trim() : '';
    if (!name) { if (el) { el.focus(); el.setAttribute('aria-invalid', 'true'); } return; }
    const id = 'set-' + Date.now().toString(36);
    view.sets = { ...view.sets, [view.tab]: [...(view.sets[view.tab] || []), { id, name, f: fclone() }] };
    view.setCur = { ...view.setCur, [view.tab]: id };
    setNaming = false;
    redraw();
    host.toast(`Набор «${name}» сохранён`, 'ok');
  };
  scope.on('click', '[data-ip-set-save]', saveSet);
  scope.on('keydown', '[data-ip-set-name]', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); saveSet(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setNaming = false; redraw(); }
  });
  scope.on('click', '[data-ip-set-del]', (e, b) => {
    const id = b.dataset.ipSetDel;
    const gone = (view.sets[view.tab] || []).find((x) => x.id === id);
    view.sets = { ...view.sets, [view.tab]: (view.sets[view.tab] || []).filter((x) => x.id !== id) };
    if (view.setCur[view.tab] === id) view.setCur = { ...view.setCur, [view.tab]: '' };
    redraw();
    if (gone) host.toast(`Набор «${gone.name}» удалён`, 'ok');
  });
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
    if (collapsed.has(place)) applyFilter(queueBase(all), QUEUE_FACETS, QUEUE_RANGES, view.qf, view.q).filter((s) => s.place === place).forEach((s) => { const k = s.typeId + '|' + s.id; if (el.checked) checked.set(k, target(k)); else checked.delete(k); });
    redraw();
  });
  scope.on('change', '[data-ip-acheck]', (e, el) => { const id = el.dataset.ipAcheck; if (el.checked) checked.set(id, null); else checked.delete(id); redraw(); });
  scope.on('change', '[data-ip-gacheck]', (e, el) => {
    allAssignments().filter((a) => a.person === el.dataset.ipGacheck && ['assigned', 'progress'].includes(a.state)).forEach((a) => { if (el.checked) checked.set(a.id, null); else checked.delete(a.id); });
    redraw();
  });
  // «Переназначить все…» в строке группы.
  scope.on('click', '[data-ip-rg]', (e, b) => { reassignGroup = b.dataset.ipRg; redraw(); });
  scope.on('click', '[data-ip-aperson]', (e, b) => {
    // Переход между уровнями — свой поиск: на первом — по фамилии, на втором — по объектам.
    view.aPerson = b.dataset.ipAperson; view.q = ''; reassignGroup = ''; checked.clear(); current = ''; render();
  });
  scope.on('change', '[data-ip-asort]', (e, el) => { view.aSort = el.value; redraw(); });
  scope.on('change', '[data-ip-aregion]', (e, el) => { view.aRegion = el.value; redraw(); });
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

  const onChange = () => { gpsCache.clear(); if (!gridSaving) redraw(); };
  window.addEventListener('inside:inspections', onChange);
  window.addEventListener('inside:redraw', onChange);

  applyRoute(host.route);
  render();
  return {
    onRoute(next) { if (applyRoute(next)) { detail = []; cadDraft = null; resetList(); } render(); },
    destroy() {
      destroyStats();
      hidePop();
      window.removeEventListener('resize', onResize);
      barObs.disconnect();
      islesObs.disconnect();
      if (scene.obs) { scene.obs.disconnect(); scene.obs = null; }
      if (scene.map) { scene.map.remove(); scene.map = null; }
      if (scene.el) { scene.el.remove(); scene.el = null; }
      document.body.classList.remove('ip-sheet-open');
      window.removeEventListener('inside:inspections', onChange);
      window.removeEventListener('inside:redraw', onChange);
    },
  };
}
