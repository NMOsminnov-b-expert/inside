// Кэш ответов внешних карт — в хранилище браузера (Cache Storage), переживает
// перезагрузку и перезапуск сборки для показа.
//
// Пользователь 04.11.2026: «Мы можем полученные данные кешировать, что бы не
// обращаться за ними снова?». Срок — у каждого источника свой (дороги OSM
// меняются редко, контуры Кадастра — чаще). Ключ — адрес и, для POST, тело
// запроса: ответ картосервера Кадастра зависит от рамки в теле.
//
// Хранилище доступно только «безопасному» адресу: 127.0.0.1 и localhost —
// да (макет и сборка для показа), адрес в сети по http — нет; тогда только
// память страницы.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: кэш внешних источников — на сервере (общий для всех
// пользователей), с обновлением по расписанию.
const NAME = 'inside-maps-v1';
const mem = new Map();
const can = typeof caches !== 'undefined' && (typeof isSecureContext === 'undefined' || isSecureContext);

async function hash(s) {
  if (!(crypto && crypto.subtle)) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return String(h >>> 0); }
  const d = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Ключ кэша — адрес-заглушка того же «сайта»: Cache Storage хранит по запросу.
async function keyOf(url, body) {
  return 'https://cache.inside.local/' + (await hash(url + '\n' + (body ? String(body) : '')));
}

// Ответ из кэша, иначе — fetcher() (должен вернуть Response); удачный ответ
// кладётся в кэш с датой. ttlDays — сколько дней ответ считается свежим.
export async function cachedFetch(url, { body = null, ttlDays = 7, fetcher } = {}) {
  const key = await keyOf(url, body);
  if (mem.has(key)) return mem.get(key).clone();
  if (can) {
    try {
      const c = await caches.open(NAME);
      const hit = await c.match(key);
      const at = hit && Number(hit.headers.get('x-cached-at'));
      if (hit && at && Date.now() - at < ttlDays * 864e5) { mem.set(key, hit.clone()); return hit; }
    } catch (e) { /* хранилище недоступно — сеть */ }
  }
  const res = await (fetcher ? fetcher() : fetch(url, body ? { method: 'POST', body } : undefined));
  if (!res.ok) return res;
  const blob = await res.blob();
  const headers = new Headers({ 'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream', 'x-cached-at': String(Date.now()) });
  const stored = new Response(blob, { status: 200, headers });
  mem.set(key, stored.clone());
  if (can) { try { (await caches.open(NAME)).put(key, stored.clone()); } catch (e) { /* место кончилось — только память */ } }
  return stored;
}

// Очистить кэш внешних карт (память и хранилище).
export async function clearNetCache() {
  mem.clear();
  if (can) { try { await caches.delete(NAME); } catch (e) { /* нет хранилища */ } }
}
