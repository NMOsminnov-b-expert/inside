// Hash-маршрутизация. Ядро разбирает только первые три сегмента:
//   #/                          — меню выбора ОЦ
//   #/oc/<typeId>/<ocId>/...    — модуль типа ОЦ; хвост принадлежит модулю
//   #/archive                   — архив документов (все типы ОЦ сразу)
//   #/docs                      — реестр «Документы» (не зависит от типов ОЦ)
//   #/dicts                     — справочники значений
//   #/institutions              — учреждения (сводка по объектам и документам)
//   #/scans                     — сканы с осмотров (очередь разбора ЦОД)
// Query после «?» отдаётся экрану как объект.
// Разбор сегмента без падения: адрес с битой %-последовательностью
// (#/oc/civil/100%) бросал URIError — приложение не стартовало или переставало
// реагировать на переходы (код-ревью 09.10.2026). Нераскодируемое остаётся как
// есть: такой id просто не найдётся, и экран скажет «не найден».
const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

export function parse(hash = location.hash) {
  const raw = String(hash || '').replace(/^#/, '');
  const [pathPart, queryPart] = raw.split('?');
  const segs = pathPart.split('/').filter(Boolean);

  const query = {};
  if (queryPart) {
    queryPart.split('&').filter(Boolean).forEach((pair) => {
      // Значение может само содержать «=» — режем только по первому.
      const at = pair.indexOf('=');
      const k = at < 0 ? pair : pair.slice(0, at);
      const v = at < 0 ? '' : pair.slice(at + 1);
      query[dec(k)] = dec(v);
    });
  }

  // Архив документов — отдельный экран, общий для всех типов ОЦ.
  if (segs[0] === 'archive') {
    return { name: 'archive', query };
  }

  // Документы — отдельный экран, не относится ни к одному типу ОЦ.
  // #/docs/<id> — карточка документа; хвост здесь не нужен, у документа его нет.
  if (segs[0] === 'docs') {
    return { name: 'docs', id: segs[1] ? dec(segs[1]) : null, query };
  }

  // Справочники — тоже общий экран: перечни значений для полей всех типов ОЦ.
  if (segs[0] === 'dicts') {
    return { name: 'dicts', query };
  }

  // Панель осмотров — назначение осмотрщиков (ТЗ panel-osmotrov-tz).
  if (segs[0] === 'inspections') {
    return { name: 'inspections', query };
  }

  // Сканы с осмотров — очередь разбора (kernel/scanQueue.js); вкладка, отборы
  // и выбранный элемент — в query: ?state=&src=&who=&key=.
  if (segs[0] === 'scans') {
    return { name: 'scans', query };
  }

  // Аналитика — земли по айыл аймакам (pages/analytics, 04.11.2026).
  if (segs[0] === 'analytics') {
    return { name: 'analytics', query };
  }

  // Учреждения — сводка по объектам оценки и документам одного учреждения.
  if (segs[0] === 'institutions') {
    return { name: 'institutions', query };
  }

  // Осмотры (осмотрщики) — приложение «Осмотр» в браузере (pages/osmotr,
  // решение пользователя 03.11.2026). Прежний экран осмотрщика #/insp убран
  // 16.11.2026 («Прежний экран сноси»); его адреса из закладок и старых ссылок
  // ведут сюда же.
  if (segs[0] === 'osmotr' || segs[0] === 'insp') return { name: 'osmotr', query };

  if (segs[0] === 'oc' && segs[1]) {
    return {
      name: 'module',
      typeId: dec(segs[1]),
      ocId: segs[2] ? dec(segs[2]) : null,
      rest: segs.slice(3).map(dec),
      query,
    };
  }

  return { name: 'menu', query };
}

export function build({ typeId, ocId, rest = [], query = {} }) {
  const path = ['oc', typeId, ocId, ...rest].filter((x) => x != null && x !== '').map(encodeURIComponent).join('/');
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return '#/' + path + (qs ? '?' + qs : '');
}

export const MENU_HREF = '#/';

export function go(href, { replace = false } = {}) {
  if (replace) {
    history.replaceState(null, '', href);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = href;
  }
}

export function start(onRoute) {
  const fire = () => onRoute(parse());
  window.addEventListener('hashchange', fire);
  if (!location.hash) history.replaceState(null, '', MENU_HREF);
  fire();
}

export const OSMOTR_HREF = '#/osmotr';

export const ARCHIVE_HREF = '#/archive';
export const DOCS_HREF = '#/docs';
export const DICTS_HREF = '#/dicts';
export const INST_HREF = '#/institutions';
export const INSPECTIONS_HREF = '#/inspections';
export const SCANS_HREF = '#/scans';
export const ANALYTICS_HREF = '#/analytics';
