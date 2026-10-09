// Категории лога действий — по прямому запросу пользователя: ОИ (Литеры),
// ОЦ, Документы, Фото. tone — существующие цветовые тона карточек модуля
// (module.css), переиспользуются как есть, без новых цветовых токенов.
export const CATEGORIES = [
  { key: 'oi', label: 'ОИ (Литеры)', tone: 't-blue' },
  { key: 'oc', label: 'ОЦ', tone: 't-teal' },
  { key: 'docs', label: 'Документы', tone: 't-slate' },
  { key: 'photos', label: 'Фото', tone: 't-amber' },
];

export function categoryLabel(key) {
  const c = CATEGORIES.find((x) => x.key === key);
  return c ? c.label : key;
}

export function categoryTone(key) {
  const c = CATEGORIES.find((x) => x.key === key);
  return c ? c.tone : 't-slate';
}
