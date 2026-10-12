// Окно назначения на осмотр (ТЗ панели осмотров, 3.3).
//
// Состав сверху вниз — в порядке решения: кто едет и когда, что осматривает
// (ОИ), что увидит (документы и описи), что передать словами. Документы
// сгруппированы по владельцу — объект оценки и каждый ОИ, — иначе непонятно,
// к какой литере относится техпаспорт. По умолчанию отмечены техпаспорт,
// кадастровый и ситуационный планы (ответ пользователя В6 12.10.2026).
//
// Кнопки — подвалом вне прокрутки: окно с длинным перечнем документов
// прокручивается, а действие всегда на виду (практика
// panel-podval-deystviy-vybor-strokoy-dannye-chestno).
import { esc } from '../../kernel/dom.js';
import { openModal } from '../../kernel/dialog.js';
import { assign } from '../../kernel/inspections.js';
import { objectContents, todayIso } from './model.js';

function personOptions(people, value) {
  return `<option value="">— выберите —</option>${people.map((p) => `<option value="${esc(p.name)}" ${p.name === value ? 'selected' : ''}>${esc(p.name)}${p.live ? ` · в работе ${p.live}` : ''}</option>`).join('')}`;
}

function docRow(d, checked) {
  return `<label class="ia-doc">
    <input type="checkbox" data-ia-doc="${esc(d.id)}" ${checked ? 'checked' : ''}>
    <span class="ia-doc-type">${esc(d.type || 'Документ')}</span>
    <span class="ia-doc-name" title="${esc(d.name)}">${esc(d.name || '—')}</span>
    ${d.date ? `<span class="ia-doc-date">${esc(d.date)}</span>` : ''}
  </label>`;
}

// targets — [{ typeId, ocId, title }]; один объект — полное окно, несколько —
// короткое: документы назначаются по умолчанию у каждого. prev — правка
// действующего назначения.
export function openAssignDialog({ targets, people, person = '', prev = null, onDone }) {
  const single = targets.length === 1;
  const c = single ? objectContents(targets[0].typeId, targets[0].ocId) : null;
  const pick = prev
    ? { oi: new Set(prev.oiIds || []), docs: new Set(prev.docs || []), inv: new Set(prev.inventories || []) }
    : { oi: new Set(), docs: new Set(c ? c.groups.flatMap((g) => g.docs).filter((d) => d.def).map((d) => d.id) : []), inv: new Set() };

  const taken = c && c.taken.length
    ? `<div class="ia-note">Уже назначено: ${c.taken.map((a) => `${esc(a.person)}${a.oiIds && a.oiIds.length ? ` (ОИ: ${a.oiIds.length})` : ' (объект целиком)'}`).join(', ')}</div>` : '';

  const oiBlock = c && c.oi.length ? `<fieldset class="ia-sec">
      <legend>Объекты имущества</legend>
      <label class="ia-check"><input type="checkbox" data-ia-oi-all ${pick.oi.size ? '' : 'checked'}> Объект целиком</label>
      <div class="ia-oi" ${pick.oi.size ? '' : 'hidden'}>
        ${c.oi.map((o) => `<label class="ia-check"><input type="checkbox" data-ia-oi="${esc(o.id)}" ${pick.oi.has(o.id) ? 'checked' : ''}> ${esc(o.label)}</label>`).join('')}
      </div>
    </fieldset>` : '';

  const docsBlock = c ? `<fieldset class="ia-sec">
      <legend>Документы, которые увидит осмотрщик</legend>
      ${c.groups.some((g) => g.docs.length) ? c.groups.filter((g) => g.docs.length).map((g) => `<div class="ia-group">
          <div class="ia-group-h">${esc(g.label)}</div>
          ${g.docs.map((d) => docRow(d, pick.docs.has(d.id))).join('')}
        </div>`).join('') : '<div class="ia-empty">У объекта и его ОИ документов нет.</div>'}
    </fieldset>
    <fieldset class="ia-sec">
      <legend>Описи</legend>
      ${c.inventories.length ? c.inventories.map((d) => `<label class="ia-doc">
          <input type="checkbox" data-ia-inv="${esc(d.id)}" ${pick.inv.has(d.id) ? 'checked' : ''}>
          <span class="ia-doc-type">${esc(d.type || 'Опись')}</span>
          <span class="ia-doc-name" title="${esc(d.name)}">${esc(d.name || '—')}</span>
        </label>`).join('') : '<div class="ia-empty">Описей у объекта нет. Опись прикрепляется в карточке документом вида «Инвентаризационный список».</div>'}
    </fieldset>` : `<div class="ia-note">Документы — по умолчанию у каждого объекта: технический паспорт, кадастровый и ситуационный планы.</div>`;

  const title = prev ? 'Изменить назначение' : single ? 'Назначение на осмотр' : `Назначение на осмотр · ${targets.length} объектов`;

  openModal(`<div class="modal-head">${esc(title)}</div>
    ${single ? `<div class="ia-sub" title="${esc(targets[0].title)}">${esc(targets[0].title)}</div>` : ''}
    <div class="modal-body ia-body">
      ${taken}
      <div class="ia-row">
        <div class="field"><label for="ia-person">Осмотрщик<span class="req">*</span></label>
          <select class="select" id="ia-person" data-ia-person>${personOptions(people, person || (prev && prev.person) || '')}</select></div>
        <div class="field"><label for="ia-date">Плановая дата осмотра</label>
          <input class="input" type="date" id="ia-date" data-ia-date min="${todayIso()}" value="${esc((prev && prev.plannedAt) || '')}"></div>
      </div>
      ${oiBlock}
      ${docsBlock}
      <div class="field"><label for="ia-note">Комментарий осмотрщику</label>
        <textarea class="input ia-text" id="ia-note" data-ia-note rows="2">${esc((prev && prev.note) || '')}</textarea></div>
    </div>
    <div class="modal-foot ia-foot">
      <span class="ia-err" data-ia-err role="alert"></span>
      <button class="btn btn-ghost" data-ia-cancel>Отмена</button>
      <button class="btn btn-primary" data-ia-ok>${prev ? 'Сохранить' : 'Назначить'}</button>
    </div>`, {
    onMount(back, close) {
      back.querySelector('.modal').classList.add('ia-modal');
      const $ = (s) => back.querySelector(s);
      const all = $('[data-ia-oi-all]');
      if (all) all.onchange = () => { $('.ia-oi').hidden = all.checked; };
      $('[data-ia-cancel]').onclick = close;
      $('[data-ia-ok]').onclick = () => {
        const who = $('[data-ia-person]').value;
        // Кнопка не выключается молча: нажимается и говорит, чего не хватает.
        if (!who) { $('[data-ia-err]').textContent = 'Выберите осмотрщика'; $('[data-ia-person]').focus(); return; }
        const oiIds = all && !all.checked ? [...back.querySelectorAll('[data-ia-oi]:checked')].map((x) => x.dataset.iaOi) : [];
        if (all && !all.checked && !oiIds.length) { $('[data-ia-err]').textContent = 'Отметьте хотя бы один ОИ или «Объект целиком»'; return; }
        const common = { person: who, plannedAt: $('[data-ia-date]').value, note: $('[data-ia-note]').value.trim() };
        const made = targets.map((t) => assign({
          ...common,
          typeId: t.typeId,
          ocId: t.ocId,
          oiIds,
          docs: c ? [...back.querySelectorAll('[data-ia-doc]:checked')].map((x) => x.dataset.iaDoc) : undefined,
          inventories: c ? [...back.querySelectorAll('[data-ia-inv]:checked')].map((x) => x.dataset.iaInv) : [],
          prevId: prev ? prev.id : '',
        }));
        close();
        if (onDone) onDone(made.filter(Boolean), who);
      };
      setTimeout(() => $('[data-ia-person]') && $('[data-ia-person]').focus(), 0);
    },
  });
}
