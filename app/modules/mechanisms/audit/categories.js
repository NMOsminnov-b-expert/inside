// Категории лога действий этого модуля. У производственного и подобных
// модулей их четыре (ОИ/ОЦ/Документы/Фото) — здесь только две: у записи нет
// ни объектов имущества (значит, нет и категории «ОИ (Литеры)»), ни фото по
// литерам (значит, нет и категории «Фото»). tone — существующие цветовые
// тона карточек модуля (module.css), переиспользуются как есть.
export const CATEGORIES = [
  { key: 'oc', label: 'ОЦ', tone: 't-teal' },
  { key: 'docs', label: 'Документы', tone: 't-slate' },
];

export function categoryLabel(key) {
  const c = CATEGORIES.find((x) => x.key === key);
  return c ? c.label : key;
}

export function categoryTone(key) {
  const c = CATEGORIES.find((x) => x.key === key);
  return c ? c.tone : 't-slate';
}
