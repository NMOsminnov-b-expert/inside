// Панель назначения — справа от таблицы, на месте, без модального окна
// (замечание пользователя 12.10.2026 «Зачем опять модалки?… Тут лучше без них
// обходиться»; правило графа bez-modalok-prostranstvo-celikom-stili-iz-yadra).
//
// Три вида: один объект (состав: ОИ, документы, описи — и форма), несколько
// отмеченных флажками (короткая форма, документы по умолчанию у каждого),
// действующее назначение (та же форма с его значениями, «Сохранить» и
// «Снять»). Порядок сверху вниз — порядок решения: кто и когда, что
// осматривает, что увидит, что передать словами. Кнопки — подвалом вне
// прокрутки панели. По умолчанию отмечены техпаспорт, кадастровый и
// ситуационный планы (ответ пользователя В6 12.10.2026).
import { esc } from '../../kernel/dom.js';
import { build } from '../../kernel/router.js';
import { assign, unassign, isLive, eventsOf } from '../../kernel/inspections.js';
import { objectContents, todayIso, stateLabel, EVENT_LABELS } from './model.js';

const fmtDate = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '');

function personSelect(people, value) {
  return `<select class="select" id="ip-f-person" data-ip-f-person>
    <option value="">— выберите —</option>
    ${people.map((p) => `<option value="${esc(p.name)}" ${p.name === value ? 'selected' : ''}>${esc(p.name)}${p.live ? ` · в работе ${p.live}` : ''}</option>`).join('')}
  </select>`;
}

function whoWhen(people, person, date) {
  return `<div class="ip-f-row">
    <div class="field"><label for="ip-f-person">Осмотрщик<span class="req">*</span></label>${personSelect(people, person)}</div>
    <div class="field ip-f-date"><label for="ip-f-date">Плановая дата</label>
      <input class="input" type="date" id="ip-f-date" data-ip-f-date min="${todayIso()}" value="${esc(date || '')}"></div>
  </div>`;
}

const note = (v) => `<div class="field"><label for="ip-f-note">Комментарий осмотрщику</label>
  <textarea class="textarea ip-f-note" id="ip-f-note" data-ip-f-note rows="2">${esc(v || '')}</textarea></div>`;

// Прочие назначения по объекту — по людям: «Бабашова Д. — 3 ОИ», «… — объект
// целиком»; по строке на каждый ОИ одно ФИО повторялось бы подряд.
function othersText(list) {
  const by = new Map();
  list.forEach((a) => {
    const v = by.get(a.person) || { whole: false, oi: 0 };
    if (a.oiIds && a.oiIds.length) v.oi += a.oiIds.length; else v.whole = true;
    by.set(a.person, v);
  });
  return [...by.entries()].map(([p, v]) => `${esc(p)} — ${v.whole ? 'объект целиком' : `${v.oi} ОИ`}`).join('; ');
}

function docLine(d, checked, attr) {
  return `<label class="ip-doc">
    <input type="checkbox" ${attr}="${esc(d.id)}" ${checked ? 'checked' : ''}>
    <span class="ip-doc-type">${esc(d.type || 'Документ')}</span>
    <span class="ip-doc-name">${esc(d.name || '—')}</span>
    ${d.date ? `<span class="ip-doc-date">${esc(d.date)}</span>` : ''}
  </label>`;
}

function contentsHTML(c, pick) {
  const whole = !pick.oi.size;
  const oi = c.oi.length ? `<section class="ip-sec">
      <h3>Объекты имущества</h3>
      <label class="ip-check"><input type="checkbox" data-ip-f-whole ${whole ? 'checked' : ''}> Объект целиком</label>
      <div class="ip-oi" ${whole ? 'hidden' : ''}>
        ${c.oi.map((o) => `<label class="ip-check"><input type="checkbox" data-ip-f-oi="${esc(o.id)}" ${pick.oi.has(o.id) ? 'checked' : ''}> <span>${esc(o.label)}</span></label>`).join('')}
      </div>
    </section>` : '';
  const groups = c.groups.filter((g) => g.docs.length);
  const docs = `<section class="ip-sec">
      <h3>Документы для осмотрщика</h3>
      ${groups.length ? groups.map((g) => `<div class="ip-group"><div class="ip-group-h">${esc(g.label)}</div>
          ${g.docs.map((d) => docLine(d, pick.docs.has(d.id), 'data-ip-f-doc')).join('')}</div>`).join('')
        : '<p class="ip-hint">У объекта и его ОИ документов нет.</p>'}
    </section>`;
  const inv = `<section class="ip-sec">
      <h3>Описи</h3>
      ${c.inventories.length ? c.inventories.map((d) => docLine(d, pick.inv.has(d.id), 'data-ip-f-inv')).join('')
        : '<p class="ip-hint">Описей нет — опись прикрепляется в карточке документом вида «Инвентаризационный список».</p>'}
    </section>`;
  return oi + docs + inv;
}

// target — { typeId, ocId, title, sub, eni }; targets — для нескольких;
// prev — действующее назначение.
export function paneHTML({ mode, people, person, target, targets = [], prev = null, confirmRemove = false }) {
  if (mode === 'none') {
    return `<aside class="ip-pane" aria-label="Назначение"><div class="ip-pane-body"><p class="ip-hint">Выберите объект в таблице.</p></div></aside>`;
  }

  if (mode === 'many') {
    return `<aside class="ip-pane" aria-label="Назначение">
      <header class="ip-pane-head"><h2>Выбрано объектов: ${targets.length}</h2>
        <p class="ip-pane-sub">Документы у каждого — по умолчанию: технический паспорт, кадастровый и ситуационный планы.</p></header>
      <div class="ip-pane-body">
        ${whoWhen(people, person, '')}
        <section class="ip-sec"><h3>Объекты</h3>
          <ul class="ip-picked">${targets.map((t) => `<li><span class="ell">${esc(t.title)}</span>
            <button class="ip-x" data-ip-unpick="${esc(t.typeId + '|' + t.ocId)}" aria-label="Убрать из выбора" title="Убрать из выбора">×</button></li>`).join('')}</ul>
        </section>
        ${note('')}
      </div>
      <footer class="ip-pane-foot"><span class="ip-err" data-ip-err role="alert"></span>
        <button class="btn btn-ghost" data-ip-bulk-clear>Снять выбор</button>
        <button class="btn btn-primary" data-ip-f-ok>Назначить ${targets.length}</button></footer>
    </aside>`;
  }

  const c = objectContents(target.typeId, target.ocId);
  if (!c) return paneHTML({ mode: 'none' });
  const pick = prev
    ? { oi: new Set(prev.oiIds || []), docs: new Set(prev.docs || []), inv: new Set(prev.inventories || []) }
    : { oi: new Set(), docs: new Set(c.groups.flatMap((g) => g.docs).filter((d) => d.def).map((d) => d.id)), inv: new Set() };
  const others = c.taken.filter((a) => !prev || a.id !== prev.id);

  // Законченное или снятое назначение — сводкой и событиями, без формы:
  // править нечего, а «Сохранить» над историей сбивало бы с толку.
  if (prev && !isLive(prev)) {
    const oiLabels = prev.oiIds && prev.oiIds.length ? c.oi.filter((o) => prev.oiIds.includes(o.id)).map((o) => o.label) : ['объект целиком'];
    const evs = eventsOf({}).filter((e) => e.assignId === prev.id).sort((x, y) => String(x.at).localeCompare(String(y.at)));
    return `<aside class="ip-pane" aria-label="Назначение">
      <header class="ip-pane-head">
        <h2>${esc(target.title)}</h2>
        <p class="ip-pane-sub">${esc(target.sub || '')} · <a href="${esc(build({ typeId: target.typeId, ocId: target.ocId }))}">карточка</a></p>
        <p class="ip-pane-meta"><span class="ip-state st-${esc(prev.state)}">${esc(stateLabel(prev.state))}</span>
          ${esc(prev.person)} · план ${esc(fmtDate(prev.plannedAt) || '—')}${prev.doneAt ? ` · закончен ${esc(fmtDate(prev.doneAt))}` : ''}</p>
      </header>
      <div class="ip-pane-body">
        <section class="ip-sec"><h3>Объекты имущества</h3>${oiLabels.map((l) => `<p class="ip-line">${esc(l)}</p>`).join('')}</section>
        <section class="ip-sec"><h3>События</h3>
          <ul class="ip-evs">${evs.map((e) => `<li><time>${esc(fmtDate(e.at))} ${esc(new Date(e.at).toTimeString().slice(0, 5))}</time>
            <span>${esc(EVENT_LABELS[e.kind] || e.kind)}${e.count ? `: ${e.count}` : ''}${e.text ? `: ${esc(e.text)}` : ''}${e.field ? `: ${esc(e.field)}` : ''}</span></li>`).join('')}</ul>
        </section>
      </div>
    </aside>`;
  }

  return `<aside class="ip-pane" aria-label="Назначение">
    <header class="ip-pane-head">
      <h2>${esc(target.title)}</h2>
      <p class="ip-pane-sub">${esc(target.sub || '')}${target.eni ? ` · <span class="mono">${esc(target.eni)}</span>` : ''}
        · <a href="${esc(build({ typeId: target.typeId, ocId: target.ocId }))}">карточка</a></p>
      ${prev ? `<p class="ip-pane-meta"><span class="ip-state st-${esc(prev.state)}">${esc(stateLabel(prev.state))}</span>
        назначил ${esc(prev.by || '—')} ${esc(fmtDate(prev.at))}</p>` : ''}
      ${others.length ? `<p class="ip-pane-meta">Ещё назначено: ${othersText(others)}</p>` : ''}
    </header>
    <div class="ip-pane-body">
      ${whoWhen(people, (prev && prev.person) || person, prev && prev.plannedAt)}
      ${contentsHTML(c, pick)}
      ${note(prev && prev.note)}
    </div>
    <footer class="ip-pane-foot"><span class="ip-err" data-ip-err role="alert"></span>
      ${prev ? (confirmRemove
        ? `<span class="ip-confirm">Снять назначение?</span>
           <button class="btn btn-ghost" data-ip-remove-no>Нет</button>
           <button class="btn btn-danger" data-ip-remove-yes="${esc(prev.id)}">Снять</button>`
        : `<button class="btn btn-ghost" data-ip-remove>Снять назначение</button>
           <button class="btn btn-primary" data-ip-f-ok>Сохранить</button>`)
        : '<button class="btn btn-primary" data-ip-f-ok>Назначить</button>'}
    </footer>
  </aside>`;
}

// Считать форму панели и назначить. Возвращает { error } или { made, person }.
export function submitPane(root, { targets, prev }) {
  const $ = (s) => root.querySelector(s);
  const person = $('[data-ip-f-person]') ? $('[data-ip-f-person]').value : '';
  if (!person) return { error: 'Выберите осмотрщика', focus: '[data-ip-f-person]' };
  const whole = $('[data-ip-f-whole]');
  const oiIds = whole && !whole.checked ? [...root.querySelectorAll('[data-ip-f-oi]:checked')].map((x) => x.dataset.ipFOi) : [];
  if (whole && !whole.checked && !oiIds.length) return { error: 'Отметьте ОИ или «Объект целиком»' };
  const single = targets.length === 1;
  const common = {
    person,
    plannedAt: $('[data-ip-f-date]') ? $('[data-ip-f-date]').value : '',
    note: $('[data-ip-f-note]') ? $('[data-ip-f-note]').value.trim() : '',
  };
  const made = targets.map((t) => assign({
    ...common,
    typeId: t.typeId,
    ocId: t.ocId,
    oiIds,
    docs: single ? [...root.querySelectorAll('[data-ip-f-doc]:checked')].map((x) => x.dataset.ipFDoc) : undefined,
    inventories: single ? [...root.querySelectorAll('[data-ip-f-inv]:checked')].map((x) => x.dataset.ipFInv) : [],
    prevId: prev ? prev.id : '',
  })).filter(Boolean);
  return { made, person };
}

export { unassign };
