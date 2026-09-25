// Вкладка «Сравнительный подход»: ввод паспорта, площадей и коэффициентов
// аналогов. Расчётные ячейки обновляются на месте (outputs() → [data-cp-out]),
// без перерисовки вкладки — иначе после каждого поля терялся бы фокус.
import { bindNumField } from '../../../kernel/numField.js';
import { confirmDialog } from '../../../kernel/dialog.js';
import { comparativeOf, addAnalog, removeAnalog } from './comparative.model.js';
import { outputs } from './comparative.view.js';

export function bindComparative(ctx) {
  const s = ctx.scope;
  const root = s.$('#q-comparative');
  if (!root) return;
  const rec = ctx.rec;
  const c = comparativeOf(rec);
  const byId = (id) => c.analogs.find((a) => a.id === id);

  const refresh = () => {
    const { out, res } = outputs(rec);
    root.querySelectorAll('[data-cp-out]').forEach((el) => {
      const v = out[el.dataset.cpOut];
      if (v !== undefined) el.textContent = v;
    });
    // Аналог, исключённый по состоянию, и недопустимая поправка — выделены.
    c.analogs.forEach((a, i) => {
      const x = res.calcs[i];
      const k = root.querySelector(`[data-cp-out="${a.id}|k:condition"]`);
      if (k) k.classList.toggle('bad', x.excluded);
      const fin = root.querySelector(`[data-cp-out="${a.id}|final"]`);
      if (fin) {
        fin.classList.toggle('excl', x.excluded);
        fin.title = x.excluded ? 'Не входит в среднее: аналог исключён по состоянию' : '';
      }
    });
  };

  // Значение поля — в объект или аналог: data-cp="<obj|id аналога>|<ключ>".
  const write = (el, v) => {
    const [owner, key] = el.dataset.cp.split('|');
    const t = owner === 'obj' ? (c.object = c.object || {}) : byId(owner);
    if (t) t[key] = v;
    refresh();
  };

  root.querySelectorAll('[data-cp]').forEach((el) => {
    if (el.hasAttribute('data-cp-num')) bindNumField(el, (v) => write(el, v));
    else if (el.tagName === 'SELECT') el.onchange = () => write(el, el.value);
    else el.oninput = () => write(el, el.value);
  });

  root.querySelectorAll('[data-cp-class]').forEach((el) => bindNumField(el, (v) => {
    const [id, key] = el.dataset.cpClass.split('|');
    const a = byId(id);
    if (!a) return;
    a.classes = a.classes || {};
    a.classes[key] = v;
    refresh();
  }));

  root.querySelectorAll('[data-cp-corr]').forEach((el) => bindNumField(el, (v) => {
    const [id, key] = el.dataset.cpCorr.split('|');
    const a = byId(id);
    if (!a) return;
    a.corr = a.corr || {};
    a.corr[key] = v;
    refresh();
  }));

  const rate = root.querySelector('[data-cp-rate]');
  if (rate) bindNumField(rate, (v) => { c.rate = v; refresh(); });

  const add = root.querySelector('[data-cp-add]');
  if (add) add.onclick = () => { addAnalog(rec); ctx.render(); };

  root.querySelectorAll('[data-cp-del]').forEach((b) => b.onclick = () => {
    const a = byId(b.dataset.cpDel);
    const filled = a && (a.priceUsd || Object.keys(a.classes || {}).length);
    const go = () => { removeAnalog(rec, b.dataset.cpDel); ctx.render(); };
    if (!filled) { go(); return; }
    confirmDialog({ title: 'Убрать аналог?', text: 'Паспорт, площади и корректировки аналога будут удалены.',
      okLabel: 'Убрать', danger: true }).then((ok) => { if (ok) go(); });
  });

  refresh();
}
