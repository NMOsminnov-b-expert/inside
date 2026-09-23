// Фото с осмотра транспортного средства.
//
// Задача пользователя 23.09.2026: блок фото с осмотра в карточке ТС, в нём две
// категории — «Машина» и «Модули»; в просмотрщике — режимы «Фото» и
// «Сравнение», как у карточек недвижимости.
//
// Просмотрщик ядра берёт снимки у «держателя» — объекта с полями photos
// ({категория: количество}) и photoFiles ({категория: [файл, …]}); у
// недвижимости это объект имущества. У ТС объектов имущества нет, поэтому
// держатель — часть самой записи (vehicle.photoSet), и модуль отдаёт его
// просмотрщику как ctx.oi (index.js). Устройство счётчиков и файлов — то же,
// что у гражданского здания (civil/parts/photos/model.js): модули друг из друга
// не импортируют, поэтому функции повторены здесь.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: файлы здесь — blob-ссылки вкладки. После перезагрузки
// страницы счётчик остаётся, а сам снимок пропадает (kernel/persist.js убирает
// blob-ссылки): на месте фото — плитка без картинки. На сервере снимок
// загружается в хранилище файлов и привязывается к записи и категории.

export const PHOTO_CATS = ['Машина', 'Модули'];

export function photoSetOf(rec) {
  const v = rec.vehicle;
  if (!v.photoSet) v.photoSet = { id: `${rec.id}-photo`, name: 'Фото с осмотра', photos: {}, photoFiles: {} };
  return v.photoSet;
}

export const catLabel = (holder, cat) => cat;

export function photoFileAt(holder, cat, i) {
  const arr = ((holder && holder.photoFiles) || {})[cat];
  return (arr && arr[i]) || null;
}

export function addPhotoFile(holder, cat, file) {
  holder.photos = holder.photos || {};
  holder.photoFiles = holder.photoFiles || {};
  const arr = (holder.photoFiles[cat] = holder.photoFiles[cat] || []);
  const count = holder.photos[cat] || 0;
  while (arr.length < count) arr.push(null);
  arr.push(file);
  holder.photos[cat] = count + 1;
}

// Категории — в порядке блока карточки, пустые в просмотрщик не попадают:
// заголовок над пустотой ничего не сообщает.
const cats = (holder) => PHOTO_CATS.filter((c) => ((holder && holder.photos) || {})[c] > 0);

export function photoPages(holder) {
  const out = [];
  cats(holder).forEach((cat) => {
    for (let i = 0; i < holder.photos[cat]; i++) out.push({ cat, i });
  });
  return out;
}

export function photoGroups(holder) {
  return cats(holder).map((cat) => ({
    cat,
    items: Array.from({ length: holder.photos[cat] }, (_, i) => ({ cat, i })),
  }));
}

// Выбор нескольких снимков сразу: с осмотра их приносят пачкой, а общий выбор
// файлов ядра (kernel/fileUpload.js) берёт по одному.
export function pickImages() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = () => resolve([...(input.files || [])]);
    input.click();
  });
}
