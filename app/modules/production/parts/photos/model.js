import { norm } from '../../../../kernel/fmt.js';
import { LETTER_SEQ } from '../../data/dictionaries.js';

export function photoPages(oi) {
  const arr = [];
  if (!oi || !oi.photos) return arr;
  Object.keys(oi.photos).forEach((cat) => {
    for (let i = 0; i < oi.photos[cat]; i++) arr.push({ cat: cat, i: i });
  });
  return arr;
}

export function photoGroups(oi) {
  if (!oi || !oi.photos) return [];
  return Object.keys(oi.photos).map((c) => ({
    cat: c,
    items: Array.from({ length: oi.photos[c] }, (_, i) => ({ cat: c, i: i })),
  }));
}

export function extractLetterRef(qn) {
  let m = qn.match(/лит(?:ера)?\s*([а-яa-z])/);
  if (m) return { letter: m[1].toUpperCase(), rest: qn.replace(m[0], ' ') };
  const tokens = qn.split(/\s+/).filter(Boolean);
  const lt = tokens.find((t) => t.length === 1 && LETTER_SEQ.includes(t.toUpperCase()));
  if (lt) return { letter: lt.toUpperCase(), rest: tokens.filter((t) => t !== lt).join(' ') };
  return null;
}

export function photoMatches(oi, cat, idx, q) {
  if (!q || !q.trim()) return true;
  const qn = norm(q);
  const ref = extractLetterRef(qn);
  // Запрос с литерой отсекает объекты без литеры (земельный участок).
  if (ref && (!oi.letter || ref.letter !== oi.letter.toUpperCase())) return false;
  const rest = ref ? ref.rest : qn;
  const words = rest.split(/\s+/).filter((w) => w.length > 2);
  if (!words.length) return true;
  const hay = norm(`${oi.letter || ''} ${oi.name} ${cat} фото`);
  return words.some((w) => hay.includes(w));
}

// Реальный файл фото, если он есть. Читатель добавлен во все модули сразу, хотя
// загрузку файлов пока умеет только civil: разметка перечня ОИ одна на все
// модули, и ей нужен единый API. Пока photoFiles нет — вернёт null, и плитка
// покажет макетную заглушку.
export function photoFileAt(oi, cat, i) {
  const arr = ((oi && oi.photoFiles) || {})[cat];
  return (arr && arr[i]) || null;
}
