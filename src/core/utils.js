import { $ } from './dom.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export const num = (s) => {
  const n = parseFloat(String(s ?? '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
};

export const fmt = (n) => n.toFixed(2).replace('.', ',');
export const round2 = (x) => Math.round(x * 100) / 100;
export const norm = (s) => (s || '').toLowerCase().replace(/ё/g, 'е');

export function toast(msg, type) {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  $('#toastWrap').appendChild(el);
  setTimeout(() => el.remove(), 3400);
}