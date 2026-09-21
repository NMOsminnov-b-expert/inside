import { esc } from '../../../../kernel/dom.js';
import { KEYMAP } from './keys.js';

// Справка «Горячие клавиши» (клавиша «?»): группы, действие, клавиша и, где
// отличается, сочетание Acrobat с пометкой, что браузер его не отдаёт.
// Своё окно, а не kernel/dialog.js: там нет места под таблицу в три колонки.
// Сочетание Acrobat показываем только там, где браузер его занял: в остальных
// строках оно совпадает с нашим и лишь удваивало бы текст.
const busy = (k) => !!(k.acrobat && k.acrobat.includes('занято'));

export function showKeysHelp(doc = document) {
  doc.querySelectorAll('.modal-back').forEach((old) => old.remove());
  const groups = [];
  KEYMAP.forEach((k) => {
    let g = groups.find((x) => x.name === k.group);
    if (!g) groups.push(g = { name: k.group, rows: [] });
    g.rows.push(k);
  });

  const back = doc.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal vkeys" role="dialog" aria-modal="true" aria-labelledby="vkeysTitle">
    <div class="modal-head" id="vkeysTitle">Горячие клавиши просмотрщика</div>
    <div class="modal-body">
      <p class="vkeys-note">Клавиши — как в Adobe Acrobat. Где браузер оставляет сочетание Acrobat себе, работает замена,
        а сочетание Acrobat показано справа.</p>
      <div class="vkeys-grid">
        ${groups.map((g) => `<section><h4>${esc(g.name)}</h4><table>
          ${g.rows.map((k) => `<tr><td>${esc(k.label)}</td><td><kbd>${esc(k.keys)}</kbd></td>
            <td class="vkeys-acro">${busy(k) ? esc(k.acrobat) : ''}</td></tr>`).join('')}
        </table></section>`).join('')}
      </div>
    </div>
    <div class="modal-foot"><button class="btn btn-primary" data-vkeys-close>Понятно</button></div>
  </div>`;
  const close = () => back.remove();
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  back.addEventListener('keydown', (e) => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); close(); } });
  doc.body.appendChild(back);
  const btn = back.querySelector('[data-vkeys-close]');
  btn.onclick = close;
  btn.focus();
}
