import { norm } from '../../../../kernel/fmt.js';
import { LETTER_SEQ } from '../../data/dictionaries.js';

// Реальные загруженные фото. Счётчики oi.photos = {категория: количество}
// остаются источником истины по количеству (на них держатся и группы, и поиск,
// и сидовые данные без файлов), а файлы лежат ПАРАЛЛЕЛЬНО в
// oi.photoFiles = {категория: [файл|null, ...]} — индекс совпадает с номером
// фото в категории. Поэтому сидовые фото без файла продолжают показываться
// макетной плиткой, а загруженные — настоящей картинкой.
export function photoFileAt(oi, cat, i) {
  const arr = ((oi && oi.photoFiles) || {})[cat];
  return (arr && arr[i]) || null;
}

export function addPhotoFile(oi, cat, file) {
  oi.photos = oi.photos || {};
  oi.photoFiles = oi.photoFiles || {};
  const arr = (oi.photoFiles[cat] = oi.photoFiles[cat] || []);
  const count = oi.photos[cat] || 0;
  // Выравниваем массив по счётчику: если в категории уже были фото без файлов
  // (сид), новый файл должен встать на своё место, а не на место первого.
  while (arr.length < count) arr.push(null);
  arr.push(file);
  oi.photos[cat] = count + 1;
}

// Перенос фото к другой литере (data-move-photo) должен тащить и файл, иначе
// у получателя появился бы пустой счётчик, а у источника остался «осиротевший»
// файл.
export function movePhotoFile(src, dst, cat, i) {
  const from = ((src.photoFiles || {})[cat]) || [];
  const file = from[i] || null;
  if (from.length > i) from.splice(i, 1);

  if (!file) return;
  dst.photoFiles = dst.photoFiles || {};
  const to = (dst.photoFiles[cat] = dst.photoFiles[cat] || []);
  while (to.length < ((dst.photos || {})[cat] || 0) - 1) to.push(null);
  to.push(file);
}

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
