// Адрес из портала Кадастра по коду ЕНИ.
//
// Требование пользователя 09.09.2026: подставлять адрес по введённому коду. При
// этом подстановка идёт ТОЛЬКО по нажатию кнопки — автоматическая не давала
// убрать адрес вовсе: стоит очистить поля, и следующая же правка кода
// заполняла их заново.
//
// Почему не запрос напрямую. Портал
// (cadastre.kg/svc-portal/map/searchAddrResult.do) отвечает HTML-фрагментом и
// НЕ отдаёт Access-Control-Allow-Origin — браузер не даст странице прочитать
// такой ответ. Прежний скрипт на VBA этого ограничения не знал:
// MSXML2.ServerXMLHTTP не браузер, и CORS ему не писан.
//
// Обходов два, пробуем по очереди:
//
//   1. Live Server проксирует сам — /cadastre/... уходит на портал, а для
//      страницы это тот же источник. Настройка лежит в .vscode/settings.json,
//      применяется при старте Live Server (уже запущенный надо перезапустить).
//   2. Свой прокси, если макет открыт не через Live Server:
//      python tools/cadastre/proxy.py
//
// Ни один не доступен — кнопка честно скажет об этом, а карточка продолжит
// работать: подстановка помогает, но ничего не решает.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: на сервере обходы не нужны — запрос к Кадастру делает
// бэкенд по своему API. Там же уместен кэш: один и тот же код спрашивают
// многократно, а портал отвечает не мгновенно.

const VIA_LIVE_SERVER = '/cadastre/searchAddrResult.do';
const VIA_OWN_PROXY = 'http://127.0.0.1:8787/eni';

// Портал отвечает за десятые доли секунды. Ждать дольше незачем: человек стоит
// и смотрит на кнопку.
const TIMEOUT = 6000;

// Ответы на уже спрошенные коды: один и тот же код спрашивают повторно, а в
// пределах сессии ответ не меняется.
const cache = new Map();

// Адрес приходит дважды — в <dd> и в data-addr у ссылки на карту. Берём первое,
// что нашли: значения совпадают.
const RE_DD = /<dd[^>]*>([\s\S]*?)<\/dd>/i;
const RE_ATTR = /data-addr="([^"]+)"/i;

function addressFromHtml(html) {
  const m = RE_DD.exec(html) || RE_ATTR.exec(html);
  if (!m) return '';
  // Портал заканчивает адрес точкой — в поле она не нужна.
  return m[1].replace(/<[^>]+>/g, '').trim().replace(/[.\s]+$/, '');
}

function withTimeout(promise, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  return { signal: ctl.signal, done: () => clearTimeout(timer) };
}

// Чем ответил путь через Live Server в прошлый раз: 0 — не пробовали, -1 —
// запрос не дошёл вовсе. Нужен для внятного текста отказа: 405 и 404 значат
// «прокси не включён», 5xx — «прокси есть, но портал или сам прокси упал», и
// советы в этих случаях разные.
let liveStatus = 0;

async function askLiveServer(code) {
  // Если прокси не включён, повторять запрос при каждом нажатии незачем — он
  // только сорит ошибками в консоли.
  if (liveStatus === 404 || liveStatus === 405 || liveStatus === 501) return '';
  const t = withTimeout(null, TIMEOUT);
  try {
    const body = new URLSearchParams({
      searchCondition: 'ENI',
      inputPropCode: code,
      propCode: code,
      oblast: '', region: '', ao: '', village: '',
      street: '', buildingNumb: '', flatNumb: '', uchNo: '',
      page: '1', pageListSize: '12',
    });

    const resp = await fetch(VIA_LIVE_SERVER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body,
      signal: t.signal,
    });

    liveStatus = resp.status;
    if (!resp.ok) return '';
    return addressFromHtml(await resp.text());
  } catch (e) {
    liveStatus = -1;
    return '';
  } finally {
    t.done();
  }
}

async function askOwnProxy(code) {
  const t = withTimeout(null, TIMEOUT);
  try {
    const resp = await fetch(`${VIA_OWN_PROXY}?code=${encodeURIComponent(code)}`, { signal: t.signal });
    if (!resp.ok) return '';
    const data = await resp.json();
    return (data && data.address) || '';
  } catch (e) {
    return '';
  } finally {
    t.done();
  }
}

// Адрес по коду. Возвращает { address } либо { error } — кнопке нужно сказать
// человеку, что именно не вышло, а не молча ничего не сделать.
export async function addressByEni(eni) {
  const code = String(eni || '').replace(/\D/g, '');
  if (!code) return { error: 'Сначала введите код ЕНИ' };
  if (cache.has(code)) return { address: cache.get(code) };

  const addr = (await askLiveServer(code)) || (await askOwnProxy(code));

  if (addr) {
    cache.set(code, addr);
    return { address: addr };
  }

  // Разным отказам — разные советы. Раньше все сводились к «запустите прокси»,
  // хотя причина чаще другая.
  const PROXY = 'Запустите прокси: python tools/cadastre/proxy.py';

  // 404/405/501 отвечает сам статический сервер: запрос до портала не дошёл,
  // прокси не включён. Настройка лежит в .vscode/settings.json и применяется
  // при СТАРТЕ Live Server — уже запущенный её не видит.
  if (liveStatus === 404 || liveStatus === 405 || liveStatus === 501) {
    return {
      error: 'Прокси Live Server не включён: остановите и запустите Live Server заново. '
        + PROXY + ' — работает в любом случае.',
    };
  }

  // 5xx — прокси на месте, но ответить не смог: чаще всего он не справляется с
  // https-адресом портала. Тогда выручает свой прокси, он ходит напрямую.
  if (liveStatus >= 500) {
    return { error: `Прокси Live Server ответил ошибкой ${liveStatus}. ` + PROXY };
  }

  return { error: 'Кадастр не ответил — проверьте код ЕНИ и соединение' };
}
