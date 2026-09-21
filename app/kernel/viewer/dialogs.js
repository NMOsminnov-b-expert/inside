import { esc } from '../dom.js';

// Диалоги и уведомления в ЗАДАННОМ окне — для просмотрщика, вынесенного в
// отдельное окно (popout.js). Диалоги ядра (kernel/dialog.js, kernel/toast.js)
// всегда открываются в главном окне: при вынесенном просмотрщике подтверждение
// выскакивало на другом мониторе, а окно выбора файла из-за этого не
// открывалось вовсе (замечание пользователя 21.09.2026). Разметка и классы —
// те же, что в ядре, поэтому и вид тот же: стили в окно скопированы.

function openIn(doc, inner, onMount) {
  doc.querySelectorAll('.modal-back').forEach((old) => old.remove());
  const back = doc.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${inner}</div>`;
  doc.body.appendChild(back);
  const close = () => back.remove();
  onMount(back, close);
  return close;
}

export function confirmIn(doc, { title = 'Подтверждение', text = '', note = '', list = [], okLabel = 'Подтвердить', danger = false }) {
  const listHTML = list.length
    ? `<ul class="modal-list-facts">${list.map((it) => `<li><b>${esc(it.label)}</b>${it.value ? `<span>${esc(it.value)}</span>` : ''}</li>`).join('')}</ul>`
    : '';
  return new Promise((resolve) => {
    openIn(doc, `<div class="modal-head">${esc(title)}</div>
      <div class="modal-body">${esc(text)}${listHTML}${note ? `<div class="modal-note">${esc(note)}</div>` : ''}</div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-modal-cancel>Отмена</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-modal-ok>${esc(okLabel)}</button>
      </div>`, (back, close) => {
      const done = (v) => { close(); resolve(v); };
      back.querySelector('[data-modal-ok]').onclick = () => done(true);
      back.querySelector('[data-modal-cancel]').onclick = () => done(false);
      back.addEventListener('mousedown', (e) => { if (e.target === back) done(false); });
      back.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') done(false);
        if (e.key === 'Enter') done(true);
      });
      back.querySelector('[data-modal-ok]').focus();
    });
  });
}

export function promptIn(doc, { title = 'Ввод', label = '', value = '', okLabel = 'Сохранить' }) {
  return new Promise((resolve) => {
    openIn(doc, `<div class="modal-head">${esc(title)}</div>
      <div class="modal-body"><div class="field">${label ? `<label>${esc(label)}</label>` : ''}
        <input class="input" data-modal-input value="${esc(value)}"></div></div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-modal-cancel>Отмена</button>
        <button class="btn btn-primary" data-modal-ok>${esc(okLabel)}</button>
      </div>`, (back, close) => {
      const input = back.querySelector('[data-modal-input]');
      const done = (v) => { close(); resolve(v); };
      back.querySelector('[data-modal-ok]').onclick = () => done(input.value);
      back.querySelector('[data-modal-cancel]').onclick = () => done(null);
      back.addEventListener('mousedown', (e) => { if (e.target === back) done(null); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') done(input.value);
        if (e.key === 'Escape') done(null);
      });
      input.focus();
      input.select();
    });
  });
}

export function selectIn(doc, { title = 'Выбор', options = [], value = '' }) {
  return new Promise((resolve) => {
    openIn(doc, `<div class="modal-head">${esc(title)}</div>
      <div class="modal-body"><div class="modal-list">
        ${options.map((o) => `<button class="modal-opt ${o === value ? 'active' : ''}" data-modal-opt="${esc(o)}">${esc(o)}</button>`).join('')}
      </div></div>
      <div class="modal-foot"><button class="btn btn-ghost" data-modal-cancel>Отмена</button></div>`, (back, close) => {
      const done = (v) => { close(); resolve(v); };
      back.querySelectorAll('[data-modal-opt]').forEach((b) => { b.onclick = () => done(b.dataset.modalOpt); });
      back.querySelector('[data-modal-cancel]').onclick = () => done(null);
      back.addEventListener('mousedown', (e) => { if (e.target === back) done(null); });
      back.addEventListener('keydown', (e) => { if (e.key === 'Escape') done(null); });
      const first = back.querySelector('.modal-opt.active, .modal-opt');
      if (first) first.focus();
    });
  });
}

// Уведомление в окне — то же, что kernel/toast.js, но в своём документе.
export function toastIn(doc, msg, type) {
  let wrap = doc.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = doc.createElement('div');
    wrap.className = 'toast-wrap';
    doc.body.appendChild(wrap);
  }
  const el = doc.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3400);
}
