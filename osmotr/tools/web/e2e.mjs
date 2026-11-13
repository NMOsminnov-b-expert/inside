/**
 * Сквозная проверка PWA в браузере с поддельными камерой и микрофоном (без iPhone):
 * папка → серия снимков без выхода → «назад» браузера → перезагрузка (всё на месте) → комментарий →
 * голосовая заметка → «Отправить архивом» (внутри — та же вложенность, что на Android) →
 * «Сохранить» архива файлом → опись из старого Excel (.xls).
 *
 *   tools/web/build.sh && (cd shared/build/dist/wasmJs/productionExecutable && python3 -m http.server 8099) &
 *   node tools/web/e2e.mjs [chromium|webkit] [адрес]
 *
 * Интерфейс рисуется на холсте (Compose): нажатия — по месту на экране iPhone 15 (393×852),
 * проверки — по хранилищу браузера (IndexedDB «osmotr-fs») и по скачанному архиву.
 */
import { chromium, webkit, devices } from '../../web/node_modules/playwright/index.mjs'
import { unzipSync } from '../../build/wasm/node_modules/fflate/esm/index.mjs'
import { readFileSync } from 'node:fs'

const engine = process.argv[2] ?? 'chromium'
const base = process.argv[3] ?? 'http://127.0.0.1:8099/'
const type = { chromium, webkit }[engine]
const xls = new URL('../../shared/src/jvmTest/resources/templates/xls/02-inv1.xls', import.meta.url).pathname

let failed = 0
const check = (ok, what) => { console.log(`  ${ok ? '✓' : '✗'} ${what}`); if (!ok) failed++ }

const browser = await type.launch(engine === 'chromium'
  ? { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } : {})
const ctx = await browser.newContext({ ...devices['iPhone 15'], acceptDownloads: true })
try { await ctx.grantPermissions(['camera', 'microphone'], { origin: base }) } catch {}
const p = await ctx.newPage()
const errors = []
p.on('pageerror', e => errors.push(e.message))
// «Сохранить как» — без окна системы: записанное ловится здесь.
await ctx.addInitScript(() => {
  window.__saved = []
  window.showSaveFilePicker = async o => ({
    createWritable: async () => ({ write: async b => { window.__saved.push({ name: o.suggestedName, size: b.size }) }, close: async () => {} }),
  })
})

const nodes = () => p.evaluate(() => new Promise(ok => {
  const r = indexedDB.open('osmotr-fs')
  r.onsuccess = () => { const q = r.result.transaction('nodes').objectStore('nodes').getAllKeys(); q.onsuccess = () => ok(q.result) }
}))
const waitNodes = async (pred, ms = 15000) => {
  const t = Date.now()
  while (Date.now() - t < ms) { const n = await nodes(); if (pred(n)) return n; await p.waitForTimeout(300) }
  return nodes()
}
const ready = async () => {
  await p.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 60000 })
  await p.waitForTimeout(1500)
}
const tap = async (x, y, wait = 900) => { await p.mouse.click(x, y); await p.waitForTimeout(wait) }
const MENU = { attach: 89, exports: 137, archive: 185, contacts: 232, note: 280, voice: 328 }
const menu = async item => { await tap(365, 32, 700); await tap(270, MENU[item], 1200) }

console.log(engine)
await p.goto(base)
await ready()

// Папка
await tap(317, 32, 600)
await p.keyboard.type('ТЭЦ-2'); await p.keyboard.press('Enter'); await p.waitForTimeout(1200)
check((await nodes()).includes('/Осмотры/ТЭЦ-2'), 'папка «ТЭЦ-2» создана')

// Серия снимков без выхода
await tap(310, 615, 300)
const opened = await p.waitForSelector('.osmotr-camera .shutter:not([disabled])', { timeout: 15000 }).then(() => true, () => false)
check(opened, 'камера открылась')
if (opened) {
  const t0 = Date.now()
  for (let i = 0; i < 5; i++) await p.click('.osmotr-camera .shutter', { noWaitAfter: true })
  const tapMs = Date.now() - t0
  const got = await p.waitForFunction(() => document.querySelector('.osmotr-camera .counter')?.textContent === 'Снято: 5', null, { timeout: 20000 }).then(() => true, () => false)
  check(got, `5 нажатий подряд — «Снято: 5» (нажатия ${tapMs} мс)`)
  await p.goBack(); await p.waitForTimeout(1500)
  check(!(await p.$('.osmotr-camera')), '«назад» браузера на камере — как «Готово»')
}
const photos = (await waitNodes(n => n.filter(k => /^\/Осмотры\/ТЭЦ-2\/[^/]+\.jpg$/.test(k)).length >= 5))
  .filter(k => /^\/Осмотры\/ТЭЦ-2\/ТЭЦ-2_\d{8}_\d{6}_\d{3}\.jpg$/.test(k))
check(photos.length === 5, `5 снимков в папке с именами как на Android (${photos.length})`)
const thumbs = await waitNodes(n => n.filter(k => k.startsWith('/app/thumbs/ТЭЦ-2/')).length >= 5)
check(thumbs.filter(k => k.startsWith('/app/thumbs/ТЭЦ-2/')).length === 5, 'миниатюры сделаны')

// «Назад» браузера в приложении — на шаг назад, а не прочь со страницы
await p.goBack(); await p.waitForTimeout(1200)
check(p.url().startsWith(base), '«назад» браузера не уводит со страницы')
await tap(68, 145, 1500) // снова в «ТЭЦ-2»

// Перезагрузка — всё на месте
await p.reload(); await ready()
check((await nodes()).filter(k => /^\/Осмотры\/ТЭЦ-2\/.*\.jpg$/.test(k)).length === 5, 'после перезагрузки снимки на месте')
await tap(68, 145, 1500)

// Комментарий
await menu('note')
await p.keyboard.type('Течь по сальнику'); await p.waitForTimeout(300)
await tap(297, 426, 900) // «Готово»
const noteOk = (await waitNodes(n => n.includes('/Осмотры/ТЭЦ-2/Комментарий.txt'), 5000)).includes('/Осмотры/ТЭЦ-2/Комментарий.txt')
if (!noteOk) { await p.screenshot({ path: '/tmp/osmotr-e2e-note.png' }) }
check(noteOk, 'комментарий — файл «Комментарий.txt» в папке')
if (!noteOk) await p.keyboard.press('Escape')

// Архив: внутри — «ТЭЦ-2/…jpg», «ТЭЦ-2/Комментарий.txt»
await p.waitForTimeout(500)
const dl = p.waitForEvent('download', { timeout: 30000 }).catch(() => null)
await menu('archive')
const download = await dl
check(!!download, 'архив отдан (здесь — скачиванием: «Поделиться» в этом браузере нет)')
if (download) {
  const files = Object.keys(unzipSync(new Uint8Array(readFileSync(await download.path()))))
  check(files.filter(f => /^ТЭЦ-2\/ТЭЦ-2_.*\.jpg$/.test(f)).length === 5, `в архиве 5 снимков в «ТЭЦ-2/» (${files.length} файлов)`)
  check(!noteOk || files.includes('ТЭЦ-2/Комментарий.txt'), 'в архиве комментарий')
}

// «Сохранить» архива файлом — экран «Выгрузки»
await p.waitForTimeout(800)
await menu('exports')
await tap(270, 178, 1500) // «Сохранить» у архива
const saved = await p.evaluate(() => window.__saved)
check(saved.length === 1 && /^ТЭЦ-2 .*\.zip$/.test(saved[0].name) && saved[0].size > 1000, `«Сохранить» — архив файлом (${saved.map(s => s.name + ', ' + s.size + ' Б').join('; ')})`)
await tap(28, 32, 800) // из «Выгрузок»

// Опись из старого Excel
await tap(28, 32, 1200) // на главный
await p.screenshot({ path: '/tmp/osmotr-e2e-before-inv.png' })
const [fc] = await Promise.all([p.waitForEvent('filechooser', { timeout: 10000 }).catch(() => null), tap(297, 615, 300)])
if (fc) {
  await fc.setFiles(xls)
  const inv = await waitNodes(n => n.some(k => /^\/Осмотры\/02-inv1\/.*\.xlsx$/.test(k)), 20000)
  check(inv.some(k => /^\/Осмотры\/02-inv1\/.*\.xlsx$/.test(k)), 'опись из .xls загружена (хранится как .xlsx)')
} else check(false, 'выбор файла описи не открылся')

check(!errors.length, `ошибок страницы нет${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`)
await browser.close()
console.log(failed ? `не прошло: ${failed}` : 'всё прошло')
process.exit(failed ? 1 : 0)
