import { addSpecial, removeSpecial, setSpecialText } from './model.js';

// Дата записи ставится в момент добавления — как её видит оценщик.
const today = () => new Date().toISOString().slice(0, 10);

// Обработчики блока «Особенности». Вызывается из bind карточки ОИ.
export function bindSpecials(ctx, oi) {
  const s = ctx.scope;
  if (!oi) return;

  const add = s.$('[data-special-add]');
  if (add) add.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    addSpecial(oi, today());
    ctx.render();
    // Курсор сразу в новую строку — её и пришли заполнять.
    const rows = s.$$('[data-special-edit]');
    if (rows.length) rows[rows.length - 1].focus();
  };

  // Текст пишем по ходу набора, без перерисовки: перерисовка на каждый символ
  // сбивала бы курсор.
  s.$$('[data-special-edit]').forEach((inp) => {
    inp.oninput = () => setSpecialText(oi, inp.dataset.specialEdit, inp.value);
  });

  s.$$('[data-special-del]').forEach((b) => b.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    removeSpecial(oi, b.dataset.specialDel);
    ctx.render();
  });
}
