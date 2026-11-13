/**
 * Service worker PWA — приложение без сети (осмотры — на выездах, где связи нет): при сборке список всех
 * файлов (имена WebAssembly меняются с каждой сборкой) и версия по их содержимому → sw.js в папке сборки.
 *
 *   node tools/web/sw.mjs shared/build/dist/wasmJs/productionExecutable
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, relative } from 'node:path'

const dir = process.argv[2]
const files = []
const walk = d => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else files.push(relative(dir, p)) } }
walk(dir)
const keep = files.filter(f => !/\.(map|txt)$/.test(f) && f !== 'sw.js').sort()
const hash = createHash('sha256'); for (const f of keep) hash.update(f).update(readFileSync(join(dir, f)))
const version = hash.digest('hex').slice(0, 12)
writeFileSync(join(dir, 'sw.js'), `// Создан tools/web/sw.mjs при сборке — не править руками.
// «Осмотр» без сети: всё приложение — в кэше при первом открытии; дальше — из кэша, новая сборка — новый кэш.
const CACHE = 'osmotr-${version}'
const FILES = ${JSON.stringify(['./', ...keep])}
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())))
self.addEventListener('activate', e => e.waitUntil(caches.keys()
  .then(keys => Promise.all(keys.filter(k => k.startsWith('osmotr-') && k !== CACHE).map(k => caches.delete(k))))
  .then(() => self.clients.claim())))
self.addEventListener('fetch', e => {
  const r = e.request
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return
  // Страница — из кэша (без сети открывается); остальное — из кэша, нет — из сети.
  const key = r.mode === 'navigate' ? './' : r
  e.respondWith(caches.open(CACHE).then(c => c.match(key, { ignoreSearch: r.mode === 'navigate' }).then(hit => hit ?? fetch(r))))
})
`)
console.log(`sw.js: ${keep.length} файлов, версия ${version}`)
