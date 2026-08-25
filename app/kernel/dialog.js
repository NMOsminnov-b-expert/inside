import { esc } from './dom.js';

// Модальные окна вместо нативных confirm/prompt: и визуал в системе,
// и не блокируют поток (важно для просмотрщика и делегированных слушателей).
function openModal(inner, { onMount } = {}) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${inner}</div>`;
  document.body.appendChild(back);

  const close = () => back.remove();

  back.addEventListener('mousedown', (e) => {
    if (e.target === back) close();
  });

  if (onMount) onMount(back, close);

  return close;
}

export function confirmDialog({ title = 'Подтверждение', text = '', okLabel = 'Подтвердить', danger = false }) {
  return new Promise((resolve) => {
    openModal(
      `<div class="modal-head">${esc(title)}</div>
       <div class="modal-body">${esc(text)}</div>
       <div class="modal-foot">
         <button class="btn btn-ghost" data-modal-cancel>Отмена</button>
         <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-modal-ok>${esc(okLabel)}</button>
       </div>`,
      {
        onMount(back, close) {
          const done = (v) => { close(); resolve(v); };
          back.querySelector('[data-modal-ok]').onclick = () => done(true);
          back.querySelector('[data-modal-cancel]').onclick = () => done(false);
          back.addEventListener('mousedown', (e) => { if (e.target === back) resolve(false); });
          back.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') done(false);
            if (e.key === 'Enter') done(true);
          });
          back.querySelector('[data-modal-ok]').focus();
        },
      }
    );
  });
}

export function promptDialog({ title = 'Ввод', label = '', value = '', placeholder = '', okLabel = 'Сохранить' }) {
  return new Promise((resolve) => {
    openModal(
      `<div class="modal-head">${esc(title)}</div>
       <div class="modal-body">
         <div class="field">
           ${label ? `<label>${esc(label)}</label>` : ''}
           <input class="input" data-modal-input value="${esc(value)}" placeholder="${esc(placeholder)}">
         </div>
       </div>
       <div class="modal-foot">
         <button class="btn btn-ghost" data-modal-cancel>Отмена</button>
         <button class="btn btn-primary" data-modal-ok>${esc(okLabel)}</button>
       </div>`,
      {
        onMount(back, close) {
          const input = back.querySelector('[data-modal-input]');
          const done = (v) => { close(); resolve(v); };
          back.querySelector('[data-modal-ok]').onclick = () => done(input.value);
          back.querySelector('[data-modal-cancel]').onclick = () => done(null);
          back.addEventListener('mousedown', (e) => { if (e.target === back) resolve(null); });
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') done(input.value);
            if (e.key === 'Escape') done(null);
          });
          input.focus();
          input.select();
        },
      }
    );
  });
}

// Выбор одного значения из списка (замена prompt со списком типов).
export function selectDialog({ title = 'Выбор', options = [], value = '' }) {
  return new Promise((resolve) => {
    openModal(
      `<div class="modal-head">${esc(title)}</div>
       <div class="modal-body">
         <div class="modal-list">
           ${options.map((o) => `<button class="modal-opt ${o === value ? 'active' : ''}" data-modal-opt="${esc(o)}">${esc(o)}</button>`).join('')}
         </div>
       </div>
       <div class="modal-foot"><button class="btn btn-ghost" data-modal-cancel>Отмена</button></div>`,
      {
        onMount(back, close) {
          back.querySelectorAll('[data-modal-opt]').forEach((b) => {
            b.onclick = () => { close(); resolve(b.dataset.modalOpt); };
          });
          back.querySelector('[data-modal-cancel]').onclick = () => { close(); resolve(null); };
          back.addEventListener('mousedown', (e) => { if (e.target === back) resolve(null); });
        },
      }
    );
  });
}

// Форма из нескольких полей: описание полей даёт вызывающая сторона
// (например, модуль ОЦ для создания новой записи).
export function formDialog({ title = 'Создание', fields = [], okLabel = 'Создать' }) {
  return new Promise((resolve) => {
    openModal(
      `<div class="modal-head">${esc(title)}</div>
       <div class="modal-body">
         <div class="grid g-1" style="display:flex;flex-direction:column;gap:10px">
           ${fields.map((f) => `<div class="field">
             <label>${esc(f.label)}${f.required ? '<span class="req">*</span>' : ''}</label>
             <input class="input" data-modal-field="${esc(f.key)}" value="${esc(f.value || '')}" placeholder="${esc(f.placeholder || '')}">
           </div>`).join('')}
         </div>
         <div class="modal-err" data-modal-err hidden>Заполните обязательные поля</div>
       </div>
       <div class="modal-foot">
         <button class="btn btn-ghost" data-modal-cancel>Отмена</button>
         <button class="btn btn-primary" data-modal-ok>${esc(okLabel)}</button>
       </div>`,
      {
        onMount(back, close) {
          const read = () => {
            const values = {};
            back.querySelectorAll('[data-modal-field]').forEach((i) => {
              values[i.dataset.modalField] = i.value.trim();
            });
            return values;
          };

          const submit = () => {
            const values = read();
            const missing = fields.filter((f) => f.required && !values[f.key]);
            if (missing.length) {
              back.querySelector('[data-modal-err]').hidden = false;
              return;
            }
            close();
            resolve(values);
          };

          back.querySelector('[data-modal-ok]').onclick = submit;
          back.querySelector('[data-modal-cancel]').onclick = () => { close(); resolve(null); };
          back.addEventListener('mousedown', (e) => { if (e.target === back) resolve(null); });
          back.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') { close(); resolve(null); }
          });

          const first = back.querySelector('[data-modal-field]');
          if (first) first.focus();
        },
      }
    );
  });
}
