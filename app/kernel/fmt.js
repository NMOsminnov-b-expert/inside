// Числа и строки. Поведение совпадает с исходным core/utils.js.
export const num = (s) => {
  const n = parseFloat(String(s ?? '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
};

export const fmt = (n) => n.toFixed(2).replace('.', ',');
export const round2 = (x) => Math.round(x * 100) / 100;
export const norm = (s) => (s || '').toLowerCase().replace(/ё/g, 'е');
