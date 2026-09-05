// Адрес объекта оценки и объектов имущества — сборка и свёртка.
//
// Решения пользователя 05.09.2026 по заметкам команды:
//   * у объекта оценки — город, район, микрорайон: то, что общее для всей
//     записи;
//   * у каждого объекта имущества — своя улица и дом, у квартиры ещё номер
//     квартиры; координаты GPS есть и у записи, и у каждого ОИ;
//   * в шапке и реестре адреса ОИ показываются свёрнутыми: одинаковые улица с
//     домом называются один раз, а номера квартир перечисляются списком —
//     иначе у дома с десятком квартир строка адреса становится нечитаемой.
//
// Почему в ядре: адрес собирают карточка ОЦ, шапка, реестр, архив и поиск —
// пять мест в пяти модулях. Держать в каждом свою сборку значит получить пять
// разных написаний одного и того же адреса.

const clean = (s) => String(s == null ? '' : s).trim();

// Верхняя часть адреса — из записи объекта оценки.
//
// Части склеиваются как записаны, без приписывания «г.» и «р-н»: населённый
// пункт бывает не только городом (село, посёлок), а деление — не только
// районом (область, айыл аймак). Подставлять сокращение значит однажды написать
// «г. Лебединовка».
export function ocAddressTop(rec) {
  if (!rec) return '';
  return [clean(rec.city), clean(rec.district), clean(rec.micro)]
    .filter(Boolean).join(', ');
}

// Нижняя часть — из объекта имущества. Номер квартиры показывается только там,
// где он есть: у литеры или участка его не бывает.
export function oiAddressBottom(oi) {
  if (!oi) return '';
  return [
    clean(oi.street) && `ул. ${clean(oi.street)}`,
    clean(oi.house) && `д. ${clean(oi.house)}`,
    clean(oi.flat) && `кв. ${clean(oi.flat)}`,
  ].filter(Boolean).join(', ');
}

// Полный адрес одного ОИ: верх записи плюс его собственная часть.
export function oiFullAddress(rec, oi) {
  return [ocAddressTop(rec), oiAddressBottom(oi)].filter(Boolean).join(', ');
}

// Свёртка адресов ОИ: группируем по «улица + дом», квартиры собираем списком.
// Возвращаем строки вида «ул. Киевская, д. 218 — кв. 1, 5, 7».
export function groupedOiAddresses(rec) {
  const list = (rec && rec.oi) || [];
  const groups = [];

  list.forEach((oi) => {
    const street = clean(oi.street);
    const house = clean(oi.house);
    if (!street && !house) return;

    const key = `${street}|${house}`;
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, street, house, flats: [] };
      groups.push(g);
    }

    const flat = clean(oi.flat);
    // Один и тот же номер квартиры дважды в списке не нужен: две записи на одну
    // квартиру бывают (например, доли), а адрес у них один.
    if (flat && !g.flats.includes(flat)) g.flats.push(flat);
  });

  return groups.map((g) => {
    const base = [g.street && `ул. ${g.street}`, g.house && `д. ${g.house}`]
      .filter(Boolean).join(', ');
    return g.flats.length ? `${base} — кв. ${g.flats.join(', ')}` : base;
  });
}

// Адрес записи целиком: верх плюс свёрнутые адреса ОИ. Это то, что видно в
// шапке карточки, в реестре и в архиве.
export function ocFullAddress(rec) {
  const top = ocAddressTop(rec);
  const parts = groupedOiAddresses(rec);
  if (!parts.length) return top;
  return [top, parts.join('; ')].filter(Boolean).join(', ');
}

// Записать собранный адрес в rec.address.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: здесь адрес — производное значение, которое держится в
// записи ради совместимости (его читают реестр, поиск, архив и лог). На сервере
// это либо вычисляемое поле представления, либо денормализованная колонка,
// которую пересчитывает сам сервер при правке частей адреса.
export function syncOcAddress(rec) {
  if (!rec) return '';
  rec.address = ocFullAddress(rec);
  return rec.address;
}
