// Несколько кодов ЕНИ одной записи — одной строкой.
//
// В госакте кодов бывает много, и в реестре они читаются только свёрнутыми:
// общее начало называется один раз, а различающиеся хвосты перечисляются через
// запятую — «1-47-56-1671-(0010, 0020, 0150)» (предложение Даниила, список
// берётся из кодов объектов имущества записи).
//
// Формат выбран пользователем 05.09.2026 из двух: свёрнутый вид против
// перечисления целых кодов («1-47-56-1671-0010, 1-47-56-1671-0020»). Свёрнутый
// вдвое короче — это и решило: столбец реестра узкий.
import { fmtEni } from './fmt.js';

// Разложить код на группы так же, как его показывает fmtEni.
const groupsOf = (code) => String(fmtEni(code) || '').split('-').filter(Boolean);

export function foldEniList(codes) {
  const list = [];
  (codes || []).forEach((c) => {
    const g = groupsOf(c);
    if (!g.length) return;
    const key = g.join('-');
    if (!list.some((x) => x.key === key)) list.push({ key, groups: g });
  });

  if (!list.length) return '';
  if (list.length === 1) return list[0].key;

  // Общее начало ищем по группам, а не по символам: обрывать код посреди группы
  // нельзя — получится «1-47-56-16(71-001, 82-004)», что не читается как код.
  const first = list[0].groups;
  let common = 0;
  while (common < first.length
    && list.every((x) => x.groups.length > common && x.groups[common] === first[common])) {
    common++;
  }

  // Совпадающего начала нет — перечисляем целиком, свёртка тут ничего не даст.
  if (common === 0) return list.map((x) => x.key).join(', ');

  const head = first.slice(0, common).join('-');
  // Хвосты по возрастанию, а не в порядке появления объектов имущества: в
  // скобках их читают как перечень номеров, и разнобой мешает искать нужный.
  const tails = list.map((x) => x.groups.slice(common).join('-'))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));

  // Хвостов не осталось: коды совпали целиком (такое бывает, когда у литер один
  // код на всех) — показываем один код.
  if (!tails.length) return head;

  return `${head}-(${tails.join(', ')})`;
}

// Коды объектов имущества записи, в порядке появления.
export function oiEniCodes(rec) {
  return ((rec && rec.oi) || []).map((o) => o.eni).filter(Boolean);
}
