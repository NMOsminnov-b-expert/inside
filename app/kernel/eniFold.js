// Несколько кодов ЕНИ одной записи — одной строкой.
//
// В госакте кодов бывает много, и в реестре они читаются только свёрнутыми:
// общее начало называется один раз, а различающиеся хвосты перечисляются через
// запятую — «1-47-56-1671-(001, 002, 015)» вместо трёх почти одинаковых кодов
// подряд (предложение Даниила, решение пользователя 05.09.2026: список берётся
// из кодов объектов имущества записи).
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
  const tails = list.map((x) => x.groups.slice(common).join('-')).filter(Boolean);

  // Хвостов не осталось: коды совпали целиком (такое бывает, когда у литер один
  // код на всех) — показываем один код.
  if (!tails.length) return head;

  return `${head}-(${tails.join(', ')})`;
}

// Коды объектов имущества записи, в порядке появления.
export function oiEniCodes(rec) {
  return ((rec && rec.oi) || []).map((o) => o.eni).filter(Boolean);
}
