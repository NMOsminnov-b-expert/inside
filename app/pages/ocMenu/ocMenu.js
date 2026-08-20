import { esc } from '../../kernel/dom.js';
import { fmt } from '../../kernel/fmt.js';
import { sortedTypes, getType } from '../../kernel/registry.js';
import { build, MENU_HREF } from '../../kernel/router.js';
import { formDialog, selectDialog } from '../../kernel/dialog.js';

// Меню выбора ОЦ. Ничего не знает о предметной области: работает только
// со сводками, которые отдают модули (см. contracts в README).
const state = {
  q: '',
  type: 'all',
  status: '',
  institution: '',
  city: '',
  onlyNotes: false,
  sort: 'updated',
  view: 'tiles',
  group: true,
};

function collect() {
  const rows = [];
  sortedTypes().forEach((t) => {
    (t.records.listRecords ? t.records.listRecords() : []).forEach((s) => {
      rows.push(Object.assign({}, s, { manifest: t.manifest }));
    });
  });
  return rows;
}

function applyFilters(rows) {
  const q = state.q.trim().toLowerCase();

  let out = rows.filter((r) => {
    if (state.type !== 'all' && r.typeId !== state.type) return false;
    if (state.status && r.filters.status !== state.status) return false;
    if (state.institution && r.filters.institution !== state.institution) return false;
    if (state.city && r.filters.city !== state.city) return false;
    if (state.onlyNotes && !r.filters.hasPendingNotes) return false;
    if (q && !r.search.includes(q)) return false;
    return true;
  });

  const cmp = {
    updated: (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)),
    address: (a, b) => a.title.localeCompare(b.title, 'ru'),
    area: (a, b) => (b.metrics.area || 0) - (a.metrics.area || 0),
    oi: (a, b) => (b.metrics.oiCount || 0) - (a.metrics.oiCount || 0),
    notes: (a, b) => (b.metrics.pendingNotes || 0) - (a.metrics.pendingNotes || 0),
  }[state.sort];

  return out.sort(cmp);
}

function uniq(rows, key) {
  return [...new Set(rows.map((r) => r.filters[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
}

function badge(b) {
  const tone = b.tone === 'status' ? 'pill-status' : b.tone === 'info' ? 'pill-cat' : 'pill-gray';
  return `<span class="pill ${tone}">${b.tone === 'status' ? '<span class="dot"></span>' : ''}${esc(b.label)}</span>`;
}

function tile(r) {
  return `<div class="oc-tile" data-open-oc="${esc(r.typeId)}|${esc(r.id)}" title="Открыть карточку объекта">
    <div class="oc-tile-head">
      <span class="oc-tile-ico">${esc(r.manifest.icon)}</span>
      <div class="oc-tile-ttl">
        <b>${esc(r.title)}</b>
        <span>${esc(r.typeLabel)}${r.subtitle ? ' · ' + esc(r.subtitle) : ''}</span>
      </div>
    </div>

    <div class="oc-tile-badges">${r.badges.map(badge).join('')}</div>

    <div class="oc-tile-facts">
      ${r.facts.map((f) => `<div class="oc-fact"><label>${esc(f.label)}</label><b ${f.mono ? 'class="mono"' : ''}>${esc(f.value)}</b></div>`).join('')}
    </div>

    <div class="oc-tile-foot">
      <span class="pill-mini ${r.metrics.pendingNotes ? 'pill-pend' : 'pill-done'}">${r.metrics.pendingNotes ? r.metrics.pendingNotes + ' невып. заметок' : 'заметки выполнены'}</span>
      <span class="tag-mini">док. ${r.metrics.docs}</span>
      <span class="oc-tile-upd">обновлён ${esc(r.updatedAt || '—')}</span>
    </div>
  </div>`;
}

function table(rows) {
  return `<table class="tbl oc-table">
    <colgroup><col style="width:190px"><col><col style="width:150px"><col style="width:170px"><col style="width:110px"><col style="width:90px"><col style="width:70px"><col style="width:120px"></colgroup>
    <thead><tr>
      <th>Тип ОЦ</th><th>Адрес</th><th>Код ЕНИ</th><th>Учреждение</th>
      <th>Статус</th><th>Площадь</th><th>ОИ</th><th>Заметки</th>
    </tr></thead>
    <tbody>${rows.map((r) => `<tr class="rowlink" data-open-oc="${esc(r.typeId)}|${esc(r.id)}">
      <td class="ell">${esc(r.manifest.icon)} ${esc(r.typeLabel)}</td>
      <td class="ell">${esc(r.title)}</td>
      <td class="mono">${esc(r.facts[0] ? r.facts[0].value : '')}</td>
      <td class="ell">${esc(r.subtitle || '—')}</td>
      <td>${esc(r.filters.status)}</td>
      <td>${r.metrics.area ? fmt(r.metrics.area) + ' м²' : '—'}</td>
      <td>${r.metrics.oiCount}</td>
      <td><span class="pill-mini ${r.metrics.pendingNotes ? 'pill-pend' : 'pill-done'}">${r.metrics.pendingNotes || 'нет'}</span></td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function groupsHTML(rows) {
  if (!rows.length) {
    return `<div class="oc-empty">
      <b>Ничего не найдено</b>
      <span>Измените запрос или сбросьте фильтры.</span>
      <button class="btn btn-ghost btn-sm" data-reset>Сбросить фильтры</button>
    </div>`;
  }

  if (state.view === 'table') return `<div class="card">${table(rows)}</div>`;

  if (!state.group) return `<div class="oc-grid">${rows.map(tile).join('')}</div>`;

  const byType = new Map();
  rows.forEach((r) => {
    if (!byType.has(r.typeId)) byType.set(r.typeId, []);
    byType.get(r.typeId).push(r);
  });

  return sortedTypes()
    .filter((t) => byType.has(t.manifest.id))
    .map((t) => {
      const list = byType.get(t.manifest.id);
      return `<div class="oc-group">
        <div class="oc-group-h">
          <span class="oc-group-ico">${esc(t.manifest.icon)}</span>
          <b>${esc(t.manifest.plural)}</b>
          <span class="tag-mini">${list.length}</span>
          <span class="oc-group-hint">${esc(t.manifest.hint || '')}</span>
        </div>
        <div class="oc-grid">${list.map(tile).join('')}</div>
      </div>`;
    }).join('');
}

function render(ctx) {
  const all = collect();
  const rows = applyFilters(all);
  const types = sortedTypes();

  const countByType = (id) => all.filter((r) => r.typeId === id).length;

  const chips = [`<button class="oc-chip ${state.type === 'all' ? 'active' : ''}" data-type="all">Все <span class="tag-mini">${all.length}</span></button>`]
    .concat(types.map((t) => `<button class="oc-chip ${state.type === t.manifest.id ? 'active' : ''}" data-type="${esc(t.manifest.id)}">${esc(t.manifest.icon)} ${esc(t.manifest.plural)} <span class="tag-mini">${countByType(t.manifest.id)}</span></button>`))
    .join('');

  const opts = (list, cur, empty) => `<option value="">${empty}</option>`
    + list.map((v) => `<option ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('');

  ctx.scope.setHTML(`
    <div class="card card-pad t-blue oc-head">
      <div class="head-meta">
        <span class="pill pill-cat">Объекты оценки</span>
        <div class="hm"><label>Всего объектов</label><b>${all.length}</b></div>
        <div class="hm"><label>Показано</label><b>${rows.length}</b></div>
        <div class="hm"><label>Типов ОЦ</label><b>${types.length}</b></div>

        <input class="input oc-search" data-q value="${esc(state.q)}" placeholder="Поиск: адрес, ЕНИ, учреждение, собственник, литера…">

        <div class="dd" style="margin-left:auto">
          <button class="btn btn-primary" data-dd-toggle>+ Создать ОЦ ▾</button>
          <div class="dd-menu">
            <div class="dd-group">Тип нового объекта</div>
            ${types.map((t) => `<button data-create="${esc(t.manifest.id)}">${esc(t.manifest.icon)} ${esc(t.manifest.label)}</button>`).join('')}
          </div>
        </div>
      </div>
    </div>

    <div class="oc-filters">
      <div class="oc-chips">${chips}</div>

      <div class="oc-filter-row">
        <div class="field"><label>Статус</label>
          <select class="select" data-f="status">${opts(uniq(all, 'status'), state.status, 'любой')}</select></div>
        <div class="field"><label>Учреждение</label>
          <select class="select" data-f="institution">${opts(uniq(all, 'institution'), state.institution, 'любое')}</select></div>
        <div class="field"><label>Город</label>
          <select class="select" data-f="city">${opts(uniq(all, 'city'), state.city, 'любой')}</select></div>
        <div class="field"><label>Сортировка</label>
          <select class="select" data-sort>
            <option value="updated" ${state.sort === 'updated' ? 'selected' : ''}>по дате обновления</option>
            <option value="address" ${state.sort === 'address' ? 'selected' : ''}>по адресу</option>
            <option value="area" ${state.sort === 'area' ? 'selected' : ''}>по площади</option>
            <option value="oi" ${state.sort === 'oi' ? 'selected' : ''}>по числу ОИ</option>
            <option value="notes" ${state.sort === 'notes' ? 'selected' : ''}>по невыполненным заметкам</option>
          </select></div>

        <div class="oc-toggles">
          <label class="flag-lbl"><input type="checkbox" data-only-notes ${state.onlyNotes ? 'checked' : ''}> только с невып. заметками</label>
          <label class="flag-lbl"><input type="checkbox" data-group ${state.group ? 'checked' : ''}> группировать по типу</label>
          <div class="oc-view">
            <button class="oc-view-btn ${state.view === 'tiles' ? 'active' : ''}" data-view="tiles" title="Плитки">▦</button>
            <button class="oc-view-btn ${state.view === 'table' ? 'active' : ''}" data-view="table" title="Таблица">▤</button>
          </div>
        </div>
      </div>
    </div>

    <div class="oc-body">${groupsHTML(rows)}</div>
  `);

  bind(ctx);
}

function bind(ctx) {
  const s = ctx.scope;

  const q = s.$('[data-q]');
  if (q) {
    q.oninput = () => {
      state.q = q.value;
      const pos = q.selectionStart;
      render(ctx);
      const nq = ctx.scope.$('[data-q]');
      if (nq) { nq.focus(); nq.setSelectionRange(pos, pos); }
    };
  }

  s.$$('[data-type]').forEach((b) => b.onclick = () => { state.type = b.dataset.type; render(ctx); });
  s.$$('[data-f]').forEach((sel) => sel.onchange = () => { state[sel.dataset.f] = sel.value; render(ctx); });

  const sort = s.$('[data-sort]');
  if (sort) sort.onchange = () => { state.sort = sort.value; render(ctx); };

  const on = s.$('[data-only-notes]');
  if (on) on.onchange = () => { state.onlyNotes = on.checked; render(ctx); };

  const gr = s.$('[data-group]');
  if (gr) gr.onchange = () => { state.group = gr.checked; render(ctx); };

  s.$$('[data-view]').forEach((b) => b.onclick = () => { state.view = b.dataset.view; render(ctx); });

  const reset = s.$('[data-reset]');
  if (reset) reset.onclick = () => {
    Object.assign(state, { q: '', type: 'all', status: '', institution: '', city: '', onlyNotes: false });
    render(ctx);
  };

  s.$$('[data-open-oc]').forEach((el) => el.onclick = () => {
    const [typeId, ocId] = el.dataset.openOc.split('|');
    location.hash = build({ typeId, ocId });
  });

  s.$$('[data-dd-toggle]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const dd = b.closest('.dd');
    const wasOpen = dd.classList.contains('open');
    s.$$('.dd.open').forEach((d) => d.classList.remove('open'));
    if (!wasOpen) dd.classList.add('open');
  });

  // Создание нового ОЦ: форму описывает модуль выбранного типа.
  s.$$('[data-create]').forEach((b) => b.onclick = async (e) => {
    e.stopPropagation();
    s.$$('.dd.open').forEach((d) => d.classList.remove('open'));

    const type = getType(b.dataset.create);
    if (!type || !type.records.createRecord) {
      ctx.host.toast('Создание для этого типа пока не описано в модуле', 'warn');
      return;
    }

    const form = type.records.createForm || { title: 'Новый объект', fields: [] };
    const values = await formDialog({ title: form.title, fields: form.fields, okLabel: 'Создать' });
    if (!values) return;

    const rec = type.records.createRecord(values);
    ctx.host.toast('Объект оценки создан — заполните карточку', 'ok');
    location.hash = build({ typeId: type.manifest.id, ocId: rec.id });
  });
}

export function mountOcMenu(host) {
  const ctx = { host, scope: host.scope };

  host.setCrumbs([
    { label: 'Главная', to: MENU_HREF },
    { label: 'Объекты оценки', current: true },
  ]);
  host.setDrawer(null);
  host.ensureStyle('./app/pages/ocMenu/ocMenu.css');

  // Клик вне дропдауна закрывает меню создания.
  host.scope.onDocument('click', (e) => {
    if (!e.target.closest('.dd')) {
      document.querySelectorAll('.dd.open').forEach((d) => d.classList.remove('open'));
    }
  });

  render(ctx);

  return {
    onRoute() { render(ctx); },
    destroy() {},
  };
}
