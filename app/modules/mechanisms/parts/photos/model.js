// Фото механизма — та же модель, что и в остальных модулях (production/civil,
// см. их parts/photos/model.js): счётчики mech.photos = {категория: количество}
// остаются источником истины по количеству, а файлы лежат параллельно в
// mech.photoFiles = {категория: [файл, ...]}. Категория здесь всегда одна и
// та же (MECH_PHOTO_CAT) — у механизма, в отличие от литеры здания, нет
// устоявшегося перечня категорий фото, который стоило бы заводить.
//
// Смысл именно этой формы (а не более простого плоского списка, который был
// в первой версии): она совместима «как есть» с parts/viewer/* — тем же
// просмотрщиком (зум, поворот, лента миниатюр), которым уже пользуются
// документы и который просят переиспользовать для фото механизма, а не
// заводить новый (см. parts/viewer/state.js: openMechPhotoViewer,
// parts/viewer/shell.js: buildViewerContext).
//
// nextEniScoped из data/store.js здесь не подходит для файлов (это не
// документы записи, у file нет своего логового id) — id самих фото не
// требуется вовсе, адресация — по (категория, индекс), как и у остальных
// модулей.
export const MECH_PHOTO_CAT = 'Фото';

export function photoFileAt(oi, cat, i) {
  const arr = ((oi && oi.photoFiles) || {})[cat];
  return (arr && arr[i]) || null;
}

export function addPhotoFile(oi, cat, file) {
  oi.photos = oi.photos || {};
  oi.photoFiles = oi.photoFiles || {};
  const arr = (oi.photoFiles[cat] = oi.photoFiles[cat] || []);
  const count = oi.photos[cat] || 0;
  while (arr.length < count) arr.push(null);
  arr.push(file);
  oi.photos[cat] = count + 1;
}

// Убрать одно фото по (категория, индекс) — сдвигает индексы остальных фото
// той же категории, как и обычное удаление из массива. У остальных модулей
// такой функции нет (там фото не убирают, только переносят к другой литере),
// здесь понадобилась — конструктор полей это позволяет.
export function removePhotoFile(oi, cat, i) {
  if (!oi || !oi.photos || !oi.photos[cat]) return;
  const arr = (oi.photoFiles && oi.photoFiles[cat]) || [];
  if (arr.length > i) arr.splice(i, 1);
  oi.photos[cat] = Math.max(0, oi.photos[cat] - 1);
  if (oi.photos[cat] === 0) delete oi.photos[cat];
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
