import { bindPickSearch } from '../../kernel/pickSearch.js';
import { podvedNamesOf } from '../../kernel/institutions.js';
import { partiesOf, isFracShare } from './parties.view.js';

// Обработчики блока «Учреждение, собственники и ответственные» — копия
// civil/card/parties.ctrl.js без пользователей (см. parties.view.js).
//
// Имя, доля и документ пишутся в запись по change, а не на каждый символ:
// перерисовка на каждой букве сбрасывала бы фокус.

const ownersOf = (rec) => (rec.owners = partiesOf(rec.owners));
const indexOf = (ref) => +String(ref || '').split('|')[1];

// Подсказки фильтруются скрытием строк, чтобы поле не теряло фокус.
function bindSuggest(input, box, onPick) {
  if (!box) return;

  const opts = Array.from(box.querySelectorAll('[data-pt-pick]'));
  const none = box.querySelector('.pt-sug-none');

  const filter = () => {
    const q = input.value.trim().toLowerCase();
    let shown = 0;
    opts.forEach((o) => {
      const hit = !q || (o.dataset.ptFind || '').includes(q);
      o.hidden = !hit;
      if (hit) shown++;
    });
    if (none) none.hidden = shown > 0;
    box.hidden = !opts.length;
  };

  input.addEventListener('focus', filter);
  input.addEventListener('input', filter);
  // blur приходит раньше клика по подсказке — без паузы выбор мышью терялся бы.
  input.addEventListener('blur', () => { setTimeout(() => { box.hidden = true; }, 120); });

  opts.forEach((o) => o.onmousedown = (e) => {
    e.preventDefault();
    onPick(o.dataset.ptPick);
  });
}

export function bindParties(ctx) {
  const s = ctx.scope;
  const rec = ctx.rec;

  // Подвед зависит от учреждения: после смены учреждения чужой подвед
  // сбрасывается, иначе в поле остался бы подвед другой ветки.
  bindPickSearch(s, 'inst', (value) => {
    rec.institution = value;
    if (!podvedNamesOf(value).includes(rec.podved)) rec.podved = '';
    ctx.render();
  });

  bindPickSearch(s, 'podved', (value) => {
    rec.podved = value;
    ctx.render();
  });

  s.$$('[data-resp]').forEach((sel) => sel.onchange = () => {
    rec.resp = rec.resp || {};
    rec.resp[sel.dataset.resp] = sel.value;
  });

  const add = s.$('[data-pt-add]');
  if (add) add.onclick = () => {
    ownersOf(rec).push({ name: '', share: '', pud: '' });
    ctx.render();
    // Фокус — в новую строку: «добавить» нажимают, чтобы сразу писать.
    const rows = s.$$('[data-pt-name]');
    if (rows.length) rows[rows.length - 1].focus();
  };

  s.$$('[data-pt-rm]').forEach((b) => b.onclick = () => {
    ownersOf(rec).splice(indexOf(b.dataset.ptRm), 1);
    ctx.render();
  });

  const textField = (attr, key) => s.$$(`[data-pt-${attr}]`).forEach((input) => {
    const i = indexOf(input.getAttribute(`data-pt-${attr}`));
    const write = (v) => {
      const list = ownersOf(rec);
      if (list[i]) list[i][key] = v;
    };

    input.onchange = () => write(input.value.trim());
    bindSuggest(input, input.parentElement.querySelector('[data-pt-sug]'), (v) => {
      input.value = v;
      write(v);
      ctx.render();
    });
  });

  textField('name', 'name');
  // ПУД — свободный ввод: документ бывает назван раньше, чем его приложили.
  textField('pud', 'pud');

  s.$$('[data-pt-share]').forEach((input) => {
    const box = input.closest('[data-pt-share-box]');
    if (box) input.addEventListener('input', () => {
      box.classList.toggle('frac', isFracShare(input.value));
    });

    input.onchange = () => {
      const list = ownersOf(rec);
      const i = indexOf(input.dataset.ptShare);
      if (!list[i]) return;
      const v = input.value.trim();
      // Дробь храним как написали — по ней сверяют с документом.
      list[i].share = v.includes('/') ? v.replace(/\s+/g, '') : v.replace(',', '.');
      // Перерисовка ради суммы долей.
      ctx.render();
    };
  });
}
