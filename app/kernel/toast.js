import { $ } from './dom.js';

// action — кнопка в уведомлении ({ label, run }): «Отменить» после массового действия (решение
// пользователя 05.11.2026 — «Отмена после действия» вместо подтверждения). С кнопкой уведомление
// живёт дольше, чтобы успеть нажать.
export function toast(msg, type, { action = null, ms = 0 } = {}) {
  const wrap = $('#toastWrap');
  if (!wrap) return null;

  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '') + (action ? ' has-act' : '');
  const text = document.createElement('span');
  text.textContent = msg;
  el.appendChild(text);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast-act';
    b.textContent = action.label;
    b.addEventListener('click', () => { el.remove(); action.run(); });
    el.appendChild(b);
  }
  wrap.appendChild(el);
  setTimeout(() => el.remove(), ms || (action ? 8000 : 3400));
  return el;
}
