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
//   1. Свой прокси: python tools/cadastre/proxy.py
//   2. Прокси Live Server — /cadastre/... уходит на портал, а для страницы это
//      тот же источник. Настройка лежит в .vscode/settings.json, применяется
//      при старте Live Server (уже запущенный надо перезапустить).
//
// Свой прокси спрашиваем ПЕРВЫМ, хотя он и требует отдельной команды. Когда он
// поднят, он отвечает сразу и разбирает ответ портала сам; когда не поднят,
// браузер отказывает в соединении мгновенно, и мы ничего не теряем. Обратный
// порядок обходился дорого: прокси Live Server отвечал то 405, то 500, то
// молчал до таймаута, и рабочий путь ждал его по шесть секунд.
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

// Чем ответил каждый обход в последний раз — для внятного текста отказа и для
// строки в консоли: «не работает» без подробностей не диагностируется.
const tried = { own: '', live: '' };

async function askOwnProxy(code) {
  const t = withTimeout(null, TIMEOUT);
  try {
    const resp = await fetch(`${VIA_OWN_PROXY}?code=${encodeURIComponent(code)}`, { signal: t.signal });
    if (!resp.ok) { tried.own = `HTTP ${resp.status}`; return ''; }

    const data = await resp.json();
    if (data && data.address) { tried.own = 'адрес получен'; return data.address; }

    // Прокси дошёл до портала, но тот не знает такого кода — это ответ по
    // существу, а не отказ связи, и повторять его через Live Server незачем.
    tried.own = (data && data.error) || 'адрес не найден';
    return '';
  } catch (e) {
    tried.own = 'прокси не запущен';
    return '';
  } finally {
    t.done();
  }
}

async function askLiveServer(code) {
  // Если прокси не включён, повторять запрос при каждом нажатии незачем — он
  // только сорит ошибками в консоли.
  if (/HTTP (404|405|501)/.test(tried.live)) return '';

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

    if (!resp.ok) { tried.live = `HTTP ${resp.status}`; return ''; }

    const addr = addressFromHtml(await resp.text());
    tried.live = addr ? 'адрес получен' : 'ответ без адреса';
    return addr;
  } catch (e) {
    tried.live = 'запрос не дошёл';
    return '';
  } finally {
    t.done();
  }
}

// Почему не вышло — одной строкой, тем, кто будет разбираться.
function whyFailed() {
  // Портал ответил, но кода не знает: советовать тут нечего, менять надо код.
  if (/не найдено|пустой код/.test(tried.own)) {
    return `Кадастр не знает такого кода ЕНИ (ответ портала: ${tried.own})`;
  }

  const proxy = 'Запустите прокси: python tools/cadastre/proxy.py';

  // 404/405/501 отвечает сам статический сервер: запрос до портала не дошёл,
  // прокси Live Server не включён. Настройка применяется при СТАРТЕ — уже
  // запущенный Live Server её не видит.
  if (/HTTP (404|405|501)/.test(tried.live) && tried.own === 'прокси не запущен') {
    return `${proxy} — либо остановите и запустите Live Server заново, чтобы включился его прокси.`;
  }

  return `Кадастр не ответил. Свой прокси: ${tried.own || 'не пробовали'}; `
    + `прокси Live Server: ${tried.live || 'не пробовали'}. ${proxy}`;
}

// Адрес по коду. Возвращает { address } либо { error } — кнопке нужно сказать
// человеку, что именно не вышло, а не молча ничего не сделать.
export async function addressByEni(eni) {
  const code = String(eni || '').replace(/\D/g, '');
  if (!code) return { error: 'Сначала введите код ЕНИ' };
  if (cache.has(code)) return { address: cache.get(code) };

  tried.own = '';
  tried.live = '';

  const addr = (await askOwnProxy(code)) || (await askLiveServer(code));

  // Обходы отваливаются молча (fetch пишет в консоль только сетевую ошибку),
  // поэтому итог каждого пишем сами: иначе «не работает» не диагностируется.
  console.info(`[Кадастр] ${code}: свой прокси — ${tried.own || '—'}; `
    + `Live Server — ${tried.live || 'не понадобился'}`);

  if (addr) {
    cache.set(code, addr);
    return { address: addr };
  }

  return { error: whyFailed() };
}
