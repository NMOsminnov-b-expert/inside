import { partiesOf, isFracShare } from './parties.view.js';

// Обработчики собственников и пользователей — один набор на все три экрана,
// где этот блок показывается: карточка ОЦ, форма ОЦ и форма создания. Раньше
// каждая из них держала свою копию трёх обработчиков, и добавление шло через
// диалог (kernel/dialog.js).
//
// Правка идёт по месту: имя и доля пишутся в запись на blur, а не на каждый
// символ. На каждый символ нельзя — экран перерисовывается, и поле теряет
// фокус на первой же букве.

const listOf = (rec, kind) => (kind === 'owner'
  ? (rec.owners = partiesOf(rec.owners))
  : (rec.users = partiesOf(rec.users)));

function parseRef(ref) {
  const [kind, i] = String(ref || '').split('|');
  return { kind, i: +i };
}

// Подсказки: показываем те наименования, что подходят к набранному. Список
// уже отрисован — фильтруем скрытием строк, как в остальных списках проекта
// (kernel/multiSelect.js), чтобы не терять фокус в поле.
function bindSuggest(input, box, onPick) {
  if (!box) return;

  const opts = Array.from(box.querySelectorAll('[data-pt-pick]'));
  const none = box.querySelector('.pt-sug-none');

  const filter = () => {
    const q = input.value.trim().toLowerCase();
    let shown = 0;
    opts.forEach((o) => {
      const hit = !q || o.dataset.ptPick.toLowerCase().includes(q);
      o.hidden = !hit;
      if (hit) shown++;
    });
    if (none) none.hidden = shown > 0;
    box.hidden = !opts.length;
  };

  input.addEventListener('focus', () => { filter(); });
  input.addEventListener('input', () => { filter(); });

  // Закрываем не на blur, а с задержкой: blur приходит раньше клика по
  // подсказке, и без паузы выбор мышью не срабатывал бы.
  input.addEventListener('blur', () => { setTimeout(() => { box.hidden = true; }, 120); });

  opts.forEach((o) => o.onmousedown = (e) => {
    e.preventDefault();
    onPick(o.dataset.ptPick);
  });
}

export function bindParties(ctx, rec) {
  const s = ctx.scope;

  s.$$('[data-pt-add]').forEach((b) => b.onclick = () => {
    const kind = b.dataset.ptAdd;
    listOf(rec, kind).push({ name: '', share: '' });
    ctx.render();

    // Фокус — в новую строку: человек нажал «добавить», чтобы писать, а не
    // чтобы потом искать поле мышью.
    const rows = ctx.scope.$$(`[data-pt-name^="${kind}|"]`);
    const last = rows[rows.length - 1];
    if (last) last.focus();
  });

  s.$$('[data-pt-rm]').forEach((b) => b.onclick = () => {
    const { kind, i } = parseRef(b.dataset.ptRm);
    listOf(rec, kind).splice(i, 1);
    ctx.render();
  });

  s.$$('[data-pt-name]').forEach((input) => {
    const { kind, i } = parseRef(input.dataset.ptName);
    const write = (v) => {
      const list = listOf(rec, kind);
      if (!list[i]) return;
      list[i].name = v;
    };

    input.onchange = () => write(input.value.trim());

    bindSuggest(input, input.parentElement.querySelector('[data-pt-sug]'), (v) => {
      input.value = v;
      write(v);
      ctx.render();
    });
  });

  // ПУД — документ, по которому указана доля. Поле со свободным вводом, а не
  // выбор из списка: документ бывает назван до того, как его приложили к
  // записи, и запретить его вписать значило бы остановить работу.
  s.$$('[data-pt-pud]').forEach((input) => {
    const { kind, i } = parseRef(input.dataset.ptPud);
    const write = (v) => {
      const list = listOf(rec, kind);
      if (!list[i]) return;
      list[i].pud = v;
    };

    input.onchange = () => write(input.value.trim());

    bindSuggest(input, input.parentElement.querySelector('[data-pt-sug]'), (v) => {
      input.value = v;
      write(v);
      ctx.render();
    });
  });

  // Доля есть и у собственника, и у пользователя (уточнение пользователя
  // 09.09.2026), поэтому список берётся из самого поля, а не зашит.
  s.$$('[data-pt-share]').forEach((input) => {
    // Знак процента убирается сразу, как в поле появилась косая черта: он
    // мешает читать дробь ещё до того, как её допишут.
    const box = input.closest('[data-pt-share-box]');
    if (box) input.addEventListener('input', () => {
      box.classList.toggle('frac', isFracShare(input.value));
    });

    input.onchange = () => {
      const { kind, i } = parseRef(input.dataset.ptShare);
      const list = listOf(rec, kind);
      if (!list[i]) return;

      const v = input.value.trim();
      // Дробь храним как написали: «1/2» человек и прочтёт, и сверит с
      // документом, а «50» из неё уже не восстановить. В десятичной запятую
      // приводим к точке — её набирают чаще, а хранить надо число.
      list[i].share = v.includes('/') ? v.replace(/\s+/g, '') : v.replace(',', '.');
      // Перерисовка нужна ради суммы долей — она считается по всем блокам.
      ctx.render();
    };
  });
}
