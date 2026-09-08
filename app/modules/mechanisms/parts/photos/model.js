// У этого модуля нет ни одного вида ОИ (см. records.js), а значит и фото,
// привязанных к литере/ОИ, тоже никогда не будет — в отличие от production,
// где это полноценная модель с файлами по категориям.
//
// Файл существует ТОЛЬКО как узкая точка опоры для parts/viewer/*: эти файлы
// скопированы из production мехнически и статически импортируют
// `photoPages`/`photoFileAt`/`photoGroups` из '../photos/model.js' — без
// этого модуля импорт не резолвится и весь просмотрщик не загружается.
// Экспортированы только эти три функции (остальные из production-варианта —
// addPhotoFile, movePhotoFile, extractLetterRef, photoMatches — здесь не
// нужны и опущены; extractLetterRef/photoMatches к тому же тянули бы
// LETTER_SEQ, которого в mechanisms/data/dictionaries.js нет и не может быть).
// Все три уже защищены от oi === null/undefined в исходнике — это НЕ
// добавленный guard, а поведение, которое было в production и раньше.
export function photoFileAt(oi, cat, i) {
  const arr = ((oi && oi.photoFiles) || {})[cat];
  return (arr && arr[i]) || null;
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
