// Особенности живут на уровне литеры (oi.specials) — так же, как заметки, но
// без отметки «выполнено» и с датой записи.
import { mkSpecial } from './store.js';

export function specialsOf(oi) {
  if (!oi) return [];
  oi.specials = oi.specials || [];
  return oi.specials;
}

export function addSpecial(oi, today) {
  const arr = specialsOf(oi);
  const s = mkSpecial('', today);
  arr.push(s);
  return s;
}

export function removeSpecial(oi, id) {
  const arr = specialsOf(oi);
  const i = arr.findIndex((s) => s.id === id);
  if (i >= 0) arr.splice(i, 1);
}

export function setSpecialText(oi, id, text) {
  const s = specialsOf(oi).find((x) => x.id === id);
  if (s) s.text = text;
}

// Есть ли у записи хоть одна непустая особенность. Нужно для флажка на уровне
// таблицы ОЦ (Л4.5) и будущего фильтра — см. E3 в docs/tz/00-tz.md.
export function recHasSpecials(rec) {
  if (!rec || !Array.isArray(rec.oi)) return false;
  return rec.oi.some((o) => (o.specials || []).some((s) => (s.text || '').trim()));
}

export function recSpecialsCount(rec) {
  if (!rec || !Array.isArray(rec.oi)) return 0;
  return rec.oi.reduce((n, o) => n + (o.specials || []).filter((s) => (s.text || '').trim()).length, 0);
}

// Перенос старых текстовых полей в новую сущность. Поля `features` и `comment`
// были обычными textarea в карточке ОИ; теперь их нет, а написанное в них не
// должно пропасть. Выполняется один раз на литеру: после переноса поля
// удаляются, и повторный вызов уже ничего не находит.
//
// Зовётся ДО отрисовки карточки — тогда снимок для лога правок берётся уже с
// новой формой данных, и перенос не выглядит правкой пользователя.
export function migrateSpecials(rec) {
  if (!rec || !Array.isArray(rec.oi)) return;

  rec.oi.forEach((oi) => {
    if (!('features' in oi) && !('comment' in oi)) return;

    const arr = specialsOf(oi);
    [oi.features, oi.comment].forEach((text) => {
      const t = (text || '').trim();
      if (t) arr.push(mkSpecial(t, ''));
    });
    delete oi.features;
    delete oi.comment;
  });
}
