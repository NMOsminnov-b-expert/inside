// Hash-маршрутизация. Ядро разбирает только первые три сегмента:
//   #/                          — меню выбора ОЦ
//   #/oc/<typeId>/<ocId>/...    — модуль типа ОЦ; хвост принадлежит модулю
//   #/archive                   — архив документов (все типы ОЦ сразу)
// Query после «?» отдаётся экрану как объект.
export function parse(hash = location.hash) {
  const raw = String(hash || '').replace(/^#/, '');
  const [pathPart, queryPart] = raw.split('?');
  const segs = pathPart.split('/').filter(Boolean);

  const query = {};
  if (queryPart) {
    queryPart.split('&').filter(Boolean).forEach((pair) => {
      const [k, v] = pair.split('=');
      query[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });
  }

  // Архив документов — отдельный экран, общий для всех типов ОЦ.
  if (segs[0] === 'archive') {
    return { name: 'archive', query };
  }

  if (segs[0] === 'oc' && segs[1]) {
    return {
      name: 'module',
      typeId: decodeURIComponent(segs[1]),
      ocId: segs[2] ? decodeURIComponent(segs[2]) : null,
      rest: segs.slice(3).map(decodeURIComponent),
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

export const ARCHIVE_HREF = '#/archive';
