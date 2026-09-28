// Фото механизмов и оборудования.
//
// Снимки лежат у «держателя» — объекта с полями photos ({категория:
// количество}) и photoFiles ({категория: [файл, …]}); категория — id единицы
// техники, подпись к ней — oi.photoCatNames (form/model.js, syncMechName). У
// механизмов в составе ОЦ держатель — сам объект имущества, у ОЦ «Механизмы и
// оборудование» — часть записи (rec.mech, index.js).
//
// Порядок страниц — тот же, что у фото модулей недвижимости
// (<модуль>/parts/photos/model.js, photoPages): просмотрщик открывается на
// номере, который считает форма, а листает по функции своего модуля — номера
// обязаны совпадать. Модули друг из друга не импортируют, поэтому функции
// повторены здесь.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: файлы — blob-ссылки вкладки; после перезагрузки
// страницы счётчик остаётся, а снимок пропадает (kernel/persist.js). На
// сервере снимок загружается в хранилище файлов и привязывается к единице.

export function catLabel(holder, cat) {
  return (holder && holder.photoCatNames && holder.photoCatNames[cat]) || cat;
}

export function photoFileAt(holder, cat, i) {
  const arr = ((holder && holder.photoFiles) || {})[cat];
  return (arr && arr[i]) || null;
}

export function addPhotoFile(holder, cat, file) {
  holder.photos = holder.photos || {};
  holder.photoFiles = holder.photoFiles || {};
  const arr = (holder.photoFiles[cat] = holder.photoFiles[cat] || []);
  const count = holder.photos[cat] || 0;
  // Выравниваем массив по счётчику: если в категории уже были фото без файлов
  // (сид), новый файл должен встать на своё место, а не на место первого.
  while (arr.length < count) arr.push(null);
  arr.push(file);
  holder.photos[cat] = count + 1;
}

export function photoPages(holder) {
  const arr = [];
  if (!holder || !holder.photos) return arr;
  Object.keys(holder.photos).forEach((cat) => {
    for (let i = 0; i < holder.photos[cat]; i++) arr.push({ cat, i });
  });
  return arr;
}

export function photoGroups(holder) {
  if (!holder || !holder.photos) return [];
  return Object.keys(holder.photos).map((c) => ({
    cat: c,
    items: Array.from({ length: holder.photos[c] }, (_, i) => ({ cat: c, i })),
  }));
}
