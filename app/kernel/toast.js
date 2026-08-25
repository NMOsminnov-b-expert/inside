import { $ } from './dom.js';

export function toast(msg, type) {
  const wrap = $('#toastWrap');
  if (!wrap) return;

  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3400);
}
