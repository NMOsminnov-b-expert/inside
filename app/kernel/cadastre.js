// Адрес из портала Кадастра по коду ЕНИ.
//
// Требование пользователя 09.09.2026: подстановка не пакетная, а сразу после
// того, как код ЕНИ введён в карточке.
//
// Почему через прокси. Портал (cadastre.kg/svc-portal/map/searchAddrResult.do)
// отвечает HTML-фрагментом и НЕ отдаёт Access-Control-Allow-Origin, поэтому
// браузер не даст прочитать ответ: запрос уйдёт, а результат заблокируется.
// Прежний скрипт на VBA этого ограничения не знал — MSXML2.ServerXMLHTTP не
// браузер. Прокси лежит в tools/cadastre/proxy.py и запускается рядом:
//
//     python tools/cadastre/proxy.py
//
// Прокси не запущен — подстановка просто не срабатывает: карточка обязана
// работать без него, это подпорка макета, а не часть системы.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: на сервере прокси не нужен — запрос к Кадастру делает
// бэкенд по своему API, а фронт зовёт его. Заодно там появится кэш: один и тот
// же код спрашивают многократно, а портал отвечает не мгновенно.

const PROXY = 'http://127.0.0.1:8787/eni';

// Сколько ждём ответа. Портал отвечает за десятые доли секунды; если дольше —
// человек уже печатает дальше, и подстановка ему только помешает.
const TIMEOUT = 4000;

// Ответы на уже спрошенные коды: тот же код спрашивают при каждой перерисовке
// формы, а ответ по коду не меняется в пределах сессии.
const cache = new Map();

let proxyDown = false;

export function cadastreAvailable() {
  return !proxyDown;
}

// Адрес по коду или '' — если прокси не запущен, код не найден или ответ не
// пришёл вовремя. Ошибку наружу не бросаем: подстановка — необязательная
// помощь, из-за неё карточка падать не должна.
export async function addressByEni(eni) {
  const code = String(eni || '').replace(/\D/g, '');
  if (!code) return '';
  if (cache.has(code)) return cache.get(code);
  if (proxyDown) return '';

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT);

  try {
    const resp = await fetch(`${PROXY}?code=${encodeURIComponent(code)}`, { signal: ctl.signal });
    if (!resp.ok) return '';

    const data = await resp.json();
    const addr = (data && data.address) || '';
    cache.set(code, addr);
    return addr;
  } catch (e) {
    // Прокси не поднят — больше не дёргаем его на каждый ввод: браузер пишет в
    // консоль об отказе соединения, и на каждой цифре это был бы шум.
    proxyDown = true;
    return '';
  } finally {
    clearTimeout(timer);
  }
}
